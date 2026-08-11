import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";
import mime from "mime-types";
import { Readable } from "stream";

export interface StorageProvider {
  init(): Promise<void>;
  saveFile(file: any, eventId: string, type: string, originalName: string, buffer?: Buffer, saveDir?: string): Promise<{ url: string, systemSavePath: string }>;
  deleteFile(url: string, systemSavePath: string, eventId: string, type: string): Promise<void>;
  getFileStream(systemSavePath: string): any; // For archiver
  deleteEventData(eventId: string): Promise<void>;
}

/** Strips path separators / traversal from a caller-supplied name segment. */
function sanitizeSegment(value: string): string {
  return String(value || "")
    .replace(/[\\/]/g, "-")
    .replace(/\.\./g, "-")
    .replace(/[\u0000-\u001f<>:"|?*]/g, "")
    .slice(0, 80);
}

/**
 * Moves a file, falling back to copy+delete when source and destination live on
 * different volumes (rename() raises EXDEV, e.g. project on C: but the event
 * saveDirectory on D:\Wedding or an external SSD).
 */
async function moveFile(from: string, to: string): Promise<void> {
  try {
    await fsp.rename(from, to);
  } catch (err: any) {
    if (err?.code !== "EXDEV" && err?.code !== "EPERM") throw err;
    await fsp.copyFile(from, to);
    await fsp.unlink(from).catch(() => {});
  }
}

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor() {
    this.baseDir = path.join(process.cwd(), "uploads");
  }

  async init() {
    await fsp.mkdir(this.baseDir, { recursive: true });
  }

  async saveFile(file: any, eventId: string, type: string, originalName: string, buffer?: Buffer, saveDir?: string): Promise<{ url: string, systemSavePath: string }> {
    const typeFolder = type === 'video' ? 'videos' : 'photos';
    const effectiveBase = saveDir ? path.resolve(saveDir) : this.baseDir;
    const folder = path.join(effectiveBase, sanitizeSegment(eventId), typeFolder);
    await fsp.mkdir(folder, { recursive: true });

    const ext = path.extname(sanitizeSegment(originalName)) || '';
    const filename = `media-${Date.now()}-${uuidv4()}${ext}`;
    const destinationPath = path.join(folder, filename);

    if (buffer) {
      await fsp.writeFile(destinationPath, buffer);
    } else if (file && file.path) {
      await moveFile(file.path, destinationPath);
    } else {
      throw new Error("No buffer or file path provided to LocalStorageProvider");
    }

    const publicUrl = `/uploads/${encodeURIComponent(eventId)}/${typeFolder}/${filename}`;
    return { url: publicUrl, systemSavePath: destinationPath };
  }

  async deleteFile(url: string, systemSavePath: string, eventId: string, type: string): Promise<void> {
    if (!systemSavePath) return;
    await fsp.unlink(systemSavePath).catch(() => {});
  }

  getFileStream(systemSavePath: string) {
    if (systemSavePath && fs.existsSync(systemSavePath)) {
      return fs.createReadStream(systemSavePath);
    }
    return null;
  }

  async deleteEventData(eventId: string): Promise<void> {
    const eventDir = path.join(this.baseDir, sanitizeSegment(eventId));
    await fsp.rm(eventDir, { recursive: true, force: true }).catch(() => {});
  }
}

export class R2StorageProvider implements StorageProvider {
  private s3: S3Client;
  private bucketName: string;
  private publicDomain: string;

  constructor() {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    this.bucketName = process.env.R2_BUCKET_NAME || 'partyimg-uploads';
    this.publicDomain = process.env.R2_PUBLIC_DOMAIN || ''; // Required to serve images publically
    
    // In dev we might not have them but we should provide dummy values so it doesn't crash on boot if USE_R2 is false
    this.s3 = new S3Client({
      region: "auto",
      endpoint: `https://${accountId || 'dummy'}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: accessKeyId || 'dummy',
        secretAccessKey: secretAccessKey || 'dummy',
      },
    });
  }

  async init() {
    if (process.env.USE_R2 === "true" && (!process.env.R2_ACCOUNT_ID || !process.env.R2_ACCESS_KEY_ID)) {
      console.warn("WARNING: R2 credentials missing. Ensure R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY are set.");
    }
    console.log("R2 Storage initialized.");
  }

  async saveFile(file: any, eventId: string, type: string, originalName: string, buffer?: Buffer, saveDir?: string): Promise<{ url: string, systemSavePath: string }> {
    const typeFolder = type === 'video' ? 'videos' : 'photos';
    const ext = path.extname(originalName) || '';
    const filename = `media-${Date.now()}-${uuidv4()}${ext}`;
    const key = `${eventId}/${typeFolder}/${filename}`;
    
    let uploadBody: Buffer | Readable;
    if (buffer) {
       uploadBody = buffer;
    } else if (file && file.path) {
       uploadBody = fs.createReadStream(file.path);
    } else {
       throw new Error("No buffer or file path provided to R2StorageProvider");
    }

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: uploadBody,
      ContentType: mime.lookup(originalName) || 'application/octet-stream',
    });

    await this.s3.send(command);

    const publicUrl = this.publicDomain ? `${this.publicDomain}/${key}` : `/uploads/${key}`; // fallback to proxy endpoint if no domain
    return { url: publicUrl, systemSavePath: key };
  }

  async deleteFile(url: string, systemSavePath: string, eventId: string, type: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.bucketName,
      Key: systemSavePath,
    });
    await this.s3.send(command);
  }

  async getFileStream(systemSavePath: string) {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: systemSavePath,
    });
    const response = await this.s3.send(command);
    return response.Body as Readable;
  }

  async deleteEventData(eventId: string): Promise<void> {
    let isTruncated = true;
    let continuationToken: string | undefined = undefined;

    while (isTruncated) {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: `${eventId}/`,
        ContinuationToken: continuationToken,
      });

      const listResponse = await this.s3.send(listCommand);

      if (listResponse.Contents && listResponse.Contents.length > 0) {
        // Delete objects one by one (or could use DeleteObjectsCommand for bulk)
        for (const object of listResponse.Contents) {
          if (object.Key) {
             const deleteCommand = new DeleteObjectCommand({
               Bucket: this.bucketName,
               Key: object.Key,
             });
             await this.s3.send(deleteCommand);
          }
        }
      }

      isTruncated = listResponse.IsTruncated || false;
      continuationToken = listResponse.NextContinuationToken;
    }
  }
}

export function getStorageProvider(): StorageProvider {
  if (process.env.USE_R2 === "true") {
    return new R2StorageProvider();
  }
  return new LocalStorageProvider();
}
