import fs from "fs";
import path from "path";
import { v4 as uuidv4 } from "uuid";

export interface StorageProvider {
  init(): Promise<void>;
  saveFile(file: any, eventId: string, type: string, originalName: string, buffer?: Buffer): Promise<{ url: string, systemSavePath: string }>;
  deleteFile(url: string, systemSavePath: string, eventId: string, type: string): Promise<void>;
  getFileStream(systemSavePath: string): any; // For archiver
  deleteEventData(eventId: string): Promise<void>;
}

export class LocalStorageProvider implements StorageProvider {
  private baseDir: string;

  constructor() {
    this.baseDir = path.join(process.cwd(), "uploads");
  }

  async init() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  async saveFile(file: any, eventId: string, type: string, originalName: string, buffer?: Buffer): Promise<{ url: string, systemSavePath: string }> {
    const typeFolder = type === 'video' ? 'videos' : 'photos';
    const folder = path.join(this.baseDir, eventId, typeFolder);
    if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

    const ext = path.extname(originalName) || '';
    const filename = `media-${Date.now()}-${uuidv4()}${ext}`;
    const destinationPath = path.join(folder, filename);

    if (buffer) {
       fs.writeFileSync(destinationPath, buffer);
    } else if (file && file.path) {
       fs.renameSync(file.path, destinationPath);
    } else {
       throw new Error("No buffer or file path provided to LocalStorageProvider");
    }

    const publicUrl = `/uploads/${eventId}/${typeFolder}/${filename}`;
    return { url: publicUrl, systemSavePath: destinationPath };
  }

  async deleteFile(url: string, systemSavePath: string, eventId: string, type: string): Promise<void> {
    if (fs.existsSync(systemSavePath)) {
      fs.unlinkSync(systemSavePath);
    }
  }

  getFileStream(systemSavePath: string) {
    if (fs.existsSync(systemSavePath)) {
        return fs.createReadStream(systemSavePath);
    }
    return null;
  }

  async deleteEventData(eventId: string): Promise<void> {
    const eventDir = path.join(this.baseDir, eventId);
    if (fs.existsSync(eventDir)) {
      fs.rmSync(eventDir, { recursive: true, force: true });
    }
  }
}

export class R2StorageProvider implements StorageProvider {
  async init() {
    // Cloudflare R2 bucket binding initialization handled by environment/workerd
    console.log("R2 Storage initialized.");
  }

  async saveFile(file: any, eventId: string, type: string, originalName: string, buffer?: Buffer): Promise<{ url: string, systemSavePath: string }> {
    const typeFolder = type === 'video' ? 'videos' : 'photos';
    const ext = path.extname(originalName) || '';
    const filename = `media-${Date.now()}-${uuidv4()}${ext}`;
    const key = `${eventId}/${typeFolder}/${filename}`;
    
    // In actual implementation, we would use env.R2_BUCKET.put(key, buffer)
    // Stubbing for abstract interface
    
    const publicUrl = `/r2-uploads/${key}`;
    return { url: publicUrl, systemSavePath: key };
  }

  async deleteFile(url: string, systemSavePath: string, eventId: string, type: string): Promise<void> {
     // env.R2_BUCKET.delete(systemSavePath);
  }

  getFileStream(systemSavePath: string) {
    // env.R2_BUCKET.get(systemSavePath) stream
    return null;
  }

  async deleteEventData(eventId: string): Promise<void> {
    // List and delete all keys starting with eventId/
  }
}

export function getStorageProvider(): StorageProvider {
  if (process.env.USE_R2 === "true") {
    return new R2StorageProvider();
  }
  return new LocalStorageProvider();
}
