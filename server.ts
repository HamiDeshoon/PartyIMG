// MUST stay first: this sets UV_THREADPOOL_SIZE, which libuv reads the first
// time its thread pool is touched (sharp/sqlite3/crypto all touch it on import).
import {
  IMAGE_JOBS as TUNED_IMAGE_JOBS,
  VIDEO_JOBS as TUNED_VIDEO_JOBS,
  FFMPEG_THREADS,
  SHARP_CONCURRENCY,
  SHARP_CACHE_MB,
  FACE_INDEX_THREADS,
  LOGICAL_CPUS,
  describeRuntimeTuning,
} from "./runtime.js";
import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import crypto from "crypto";
import https from "https";
import http from "http";
import sharp from "sharp";
import ffmpeg from "fluent-ffmpeg";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import session from "express-session";
import bcrypt from "bcryptjs";
import cors from "cors";
import { exec } from "child_process";
import * as db from "./db.js";
import { logger } from "./logger.js";
import { getStorageProvider } from "./storage.js";
import { Semaphore, withTimeout, debounce } from "./concurrency.js";
import {
  ARCHIVE_ENABLED,
  ARCHIVE_ROOT,
  archivePathFor,
  getArchiveStatusSummary,
  idleState as archiveIdleState,
  isArchiveDriveMounted,
  noteUploadActivity,
  runArchivePass,
  setMediaPipelineBusyProbe,
  startArchiveWorker,
} from "./archive.js";

declare module 'express-session' {
  interface SessionData {
    adminId: string;
    isSuperuser: boolean;
  }
}

function validateEnv() {
  if (process.env.NODE_ENV === "production") {
    if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
      logger.fatal("FATAL ERROR: In production, SESSION_SECRET must be set and be at least 32 characters long.");
      process.exit(1);
    }
    if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD) {
      logger.fatal("FATAL ERROR: ADMIN_USERNAME and ADMIN_PASSWORD must be configured in production.");
      process.exit(1);
    }
  }
}
validateEnv();

const app = express();
let wss: WebSocketServer;
const PORT = parseInt(process.env.PORT) || 3000;

/* ─────────────────  MEDIA PROCESSING CONCURRENCY GUARDS  ─────────────────
 * Videos are the expensive path: ffmpeg thumbnailing + H.264 re-encode. If ten
 * guests upload videos at once we do NOT want ten ffmpeg processes fighting for
 * the CPU while photo uploads (cheap, sharp-based) queue behind them. So each
 * media class gets its own pool, sized in runtime.ts from the actual core count
 * and still overridable through MAX_VIDEO_JOBS / MAX_IMAGE_JOBS.
 */
const cpuCount = LOGICAL_CPUS;
const VIDEO_JOBS = TUNED_VIDEO_JOBS;
const IMAGE_JOBS = TUNED_IMAGE_JOBS;

const videoPool = new Semaphore(VIDEO_JOBS);
const imagePool = new Semaphore(IMAGE_JOBS);

const VIDEO_JOB_TIMEOUT_MS = parseInt(process.env.VIDEO_JOB_TIMEOUT_MS || "") || 10 * 60 * 1000;
const IMAGE_JOB_TIMEOUT_MS = parseInt(process.env.IMAGE_JOB_TIMEOUT_MS || "") || 60 * 1000;
// A single-frame grab with an input-side seek is fast even on huge files; if it
// hasn't finished in 45s something is wrong and the upload should move on
// without a thumbnail rather than making the guest wait.
const THUMBNAIL_JOB_TIMEOUT_MS = parseInt(process.env.THUMBNAIL_JOB_TIMEOUT_MS || "") || 45 * 1000;

// Sized so IMAGE_JOBS × SHARP_CONCURRENCY ≈ the logical CPU count instead of
// serialising every thumbnail onto a single libvips thread.
sharp.concurrency(SHARP_CONCURRENCY);
sharp.cache({ files: 0, memory: SHARP_CACHE_MB });
logger.info(`Runtime tuning: ${describeRuntimeTuning()}`);

/** Deletes a path if present; never throws (cleanup must not mask real errors). */
async function safeUnlink(target?: string | null): Promise<void> {
  if (!target) return;
  try {
    await fsp.unlink(target);
  } catch (err: any) {
    if (err?.code !== "ENOENT") {
      logger.warn(`Could not remove temp file ${target}: ${err?.message || err}`);
    }
  }
}

function broadcastEvent(eventType: string, data: any) {
  if (!wss) return;
  const message = JSON.stringify({ type: eventType, data });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Storage abstraction
const storageProvider = getStorageProvider();
storageProvider.init();

// Admin setup: Seed a default admin on startup or update password.
async function setupAdmin() {
  const sqlite = await db.getDb();
  const username = process.env.ADMIN_USERNAME || 'Theomainie';
  const password = process.env.ADMIN_PASSWORD || '19981998';
  
  const admin = await sqlite.get('SELECT * FROM admins WHERE username = ?', username);
  if (!admin) {
    const hash = await bcrypt.hash(password, 10);
    await sqlite.run('INSERT INTO admins (id, username, passwordHash, isSuperuser) VALUES (?, ?, ?, 1)', uuidv4(), username, hash);
    logger.info(`Superuser admin created. Login with username: ${username}`);
  } else {
    const match = await bcrypt.compare(password, admin.passwordHash);
    if (!match) {
      const hash = await bcrypt.hash(password, 10);
      await sqlite.run('UPDATE admins SET passwordHash = ?, isSuperuser = 1 WHERE username = ?', hash, username);
      logger.info(`Admin password updated for: ${username}`);
    }
  }
}

// Seed the wedding event for quick-join with D:\Wedding default save directory
async function setupWeddingEvent() {
  const sqlite = await db.getDb();
  const event = await sqlite.get('SELECT id, saveDirectory FROM events WHERE id = ?', 'fatemeh-hamid');
  if (!event) {
    await db.createOrUpdateEvent({
      id: "fatemeh-hamid",
      name: "مراسم عروسی فاطمه و حمید",
      hostName: "فاطمه و حمید",
      description: "به آلبوم دیجیتال ما خوش آمدید! لحظات زیبای خود را ثبت و با ما به اشتراک بگذارید.",
      date: new Date().toISOString().split('T')[0],
      revealStyle: "instant",
      isRevealed: true,
      imageLimit: 0,
      videoLimit: 0,
      maxVideoDuration: 0,
      saveDirectory: "D:\\Wedding",
      localSyncHost: "http://localhost:8080",
      localSyncEnabled: false
    });
    logger.info("Universal quick-join 'fatemeh-hamid' event provisioned with D:\\Wedding save directory.");
  } else if (!event.saveDirectory || event.saveDirectory === "./uploads") {
    await sqlite.run('UPDATE events SET saveDirectory = ? WHERE id = ?', 'D:\\Wedding', 'fatemeh-hamid');
    logger.info("Updated 'fatemeh-hamid' event saveDirectory to D:\\Wedding.");
  }
}

/**
 * Seeds the couple's gift card details once. Guarded on "no row yet" so anything
 * the admin later edits in the gifts tab is never overwritten on restart.
 * `intro` is left empty on purpose — GiftPage renders its own default copy when
 * blank, so the text lives in exactly one place.
 */
async function seedGiftCard() {
  const existing = await db.getGiftCard("fatemeh-hamid");
  if (existing) return;
  await db.upsertGiftCard({
    eventId: "fatemeh-hamid",
    enabled: true,
    title: "هدیه به عروس و داماد",
    bankName: "بانک سامان",
    cardNumber: "6219861990524315",
    iban: "IR280560611828005940560701",
    cardHolder: "فاطمه نیک سرشت",
    note: "هیچ اجباری نیست 🌸 حضور شما از هر هدیه‌ای برای ما باارزش‌تره.",
  });
  logger.info("Gift card details seeded for 'fatemeh-hamid'.");
}

// Ensure Uploads folder fallback
const uploadsBaseDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsBaseDir)) fs.mkdirSync(uploadsBaseDir, { recursive: true });

/**
 * Returns the face index output directory for a given saveDirectory.
 * By default: <saveDirectory>\Face_Index  (e.g. D:\Wedding\Face_Index)
 * Falls back to ./face-index in the project root if no saveDirectory is set.
 */
function getFaceIndexDir(saveDirectory?: string): string {
  if (saveDirectory) {
    return path.join(saveDirectory, "Face_Index");
  }
  return path.join(process.cwd(), "face-index");
}

/**
 * Returns the face crops (avatar thumbnails) directory for a given saveDirectory.
 */
function getFaceCropsDir(saveDirectory?: string): string {
  return path.join(getFaceIndexDir(saveDirectory), "faces");
}

/**
 * Reads the primary event's saveDirectory from the DB.
 * Used at runtime so hot-swapped SSD paths are always current.
 */
async function getPrimarySaveDirectory(): Promise<string | undefined> {
  try {
    const sqlite = await db.getDb();
    const event = await sqlite.get('SELECT saveDirectory FROM events WHERE id = ?', 'fatemeh-hamid');
    return event?.saveDirectory || undefined;
  } catch {
    return undefined;
  }
}

// --- MIDDLEWARES ---

app.set('trust proxy', 1);

app.use(helmet({
  contentSecurityPolicy: false // Vite + Canvas require inline scripts/blobs
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(pinoHttp({ logger }));

// Silence express-rate-limit warnings for proxy environment
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: { error: 'Too many requests from this IP' },
  validate: { xForwardedForHeader: false, trustProxy: false }
});

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts from this IP' },
  skipSuccessfulRequests: true,
  validate: { xForwardedForHeader: false, trustProxy: false }
});

app.use('/api/', apiLimiter);

app.use(cors({
  origin: true, // Allow all origins for the Cloudflare setup or frontend proxy
  credentials: true
}));

app.use(session({
  secret: process.env.SESSION_SECRET || (process.env.NODE_ENV === 'production' ? process.exit(1) : 'dev-secret-key-12345678901234567890'),
  resave: false,
  saveUninitialized: false,
  proxy: true, // Required for Cloudflare if trust proxy is missing or HTTP internal 
  cookie: { 
    secure: process.env.NODE_ENV === "production", 
    httpOnly: true, 
    sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax", // Better CSRF protection
    maxAge: 24 * 60 * 60 * 1000 
  }
}));

const requireAdmin = (req: any, res: any, next: any) => {
  if (req.session && req.session.adminId) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized. Admin login required.' });
  }
};

/**
 * Hard block on sensitive project paths.
 *
 * In production only `dist/` is mounted, but in development Vite's middleware
 * serves the whole project root — which would otherwise expose
 * `private/gift-receipts/**` (guest payment screenshots), the SQLite files and
 * `.env`. The path is normalised first so `/uploads/../private/x.png` and
 * percent-encoded variants are caught too.
 */
const BLOCKED_PATH_SEGMENTS = [
  // NOTE: node_modules is intentionally absent — Vite dev serves its dependency
  // pre-bundles from /node_modules/.vite/deps/ and blocking it breaks dev mode.
  "private", ".env", ".git", "database.sqlite", "venv", "__pycache__"
];

app.use((req, res, next) => {
  let decoded = req.path;
  try { decoded = decodeURIComponent(req.path); } catch { /* keep raw on malformed escapes */ }
  const normalized = path.posix.normalize(decoded.replace(/\\/g, "/")).toLowerCase();
  const segments = normalized.split("/").filter(Boolean);
  if (segments.some(seg => BLOCKED_PATH_SEGMENTS.some(b => seg === b || seg.startsWith(b + ".")))) {
    return res.status(404).json({ error: "Not found" });
  }
  next();
});

app.use("/uploads", express.static(uploadsBaseDir, { maxAge: "30d" }));

// Dynamic /face-crops route: serves face crops from event saveDirectory\Face_Index\faces or fallback
app.get("/face-crops/:filename", async (req: any, res: any) => {
  const saveDir = await getPrimarySaveDirectory();
  const cropsDir = getFaceCropsDir(saveDir);
  const filePath = path.join(cropsDir, req.params.filename);
  if (fs.existsSync(filePath)) {
    return res.sendFile(filePath);
  }
  const fallbackPath = path.join(process.cwd(), "face-index", "faces", req.params.filename);
  if (fs.existsSync(fallbackPath)) {
    return res.sendFile(fallbackPath);
  }
  res.status(404).send("Face thumbnail not found");
});

// Background Face Indexing Runner (InsightFace - CPU optimized)
let isIndexingFaces = false;
async function triggerFaceIndexer() {
  if (isIndexingFaces) {
    logger.info("Face indexing already in progress, skipping...");
    return;
  }
  isIndexingFaces = true;
  try {
    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    const scriptPath = path.join(process.cwd(), "scripts", "face_recognizer_insightface.py");

    // Collect all unique saveDirectories from the DB
    const inputDirs = [uploadsBaseDir];
    let primarySaveDir: string | undefined;
    try {
      const sqlite = await db.getDb();
      const events = await sqlite.all('SELECT saveDirectory FROM events WHERE saveDirectory IS NOT NULL');
      for (const ev of events) {
        if (ev.saveDirectory && !inputDirs.includes(ev.saveDirectory)) {
          inputDirs.push(ev.saveDirectory);
          if (!primarySaveDir) primarySaveDir = ev.saveDirectory; // first event dir is primary
        }
      }
    } catch (err) {
      logger.warn(`Could not query saveDirectories for face indexing: ${err}`);
    }

    // Output dir is always <primarySaveDirectory>\Face_Index or fallback to ./face-index
    const outputDir = getFaceIndexDir(primarySaveDir);
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

    const formattedDirs = inputDirs.map(d => `"${d}"`).join(" ");
    // Using InsightFace buffalo_l model with 0.2 threshold for strict face grouping
    const cmd = `${pythonCmd} "${scriptPath}" --input-dir ${formattedDirs} --output-dir "${outputDir}" --tolerance 0.2 --max-size 800`;
    logger.info(`Launching InsightFace indexer: output=${outputDir}`);

    exec(cmd, {
      maxBuffer: 1024 * 1024 * 10,
      env: {
        ...process.env,
        PYTHONIOENCODING: "utf-8",
        // onnxruntime's CPU provider reads these; without them it either spawns
        // one thread per logical CPU (fighting ffmpeg) or falls back to a single
        // thread. Sizing to physical cores keeps InsightFace fast without
        // starving the upload pipeline.
        OMP_NUM_THREADS: String(FACE_INDEX_THREADS),
        ORT_NUM_THREADS: String(FACE_INDEX_THREADS),
        OMP_WAIT_POLICY: "PASSIVE",
      }
    }, (error, stdout, stderr) => {
      isIndexingFaces = false;
      if (error) {
        logger.warn(`Face indexing background runner notice: ${error.message}`);
        logger.warn(`Face indexer stderr: ${stderr?.substring(0, 500)}`);
      } else {
        logger.info(`Background face indexing completed successfully.`);
        const lines = stdout?.trim().split('\n').slice(-5).join('\n');
        logger.info(`Face indexer summary:\n${lines}`);
      }
    });
  } catch (err) {
    isIndexingFaces = false;
    logger.error(`Error triggering face indexer: ${err}`);
  }
}

/**
 * Debounced entry point used by the upload route. A guest sending 20 photos in a
 * row previously queued 20 python processes; now the indexer runs once, ~8s after
 * the last file lands, and only when no media job is still occupying the CPU.
 */
const scheduleFaceIndex = debounce(() => {
  if (videoPool.inFlight > 0 || videoPool.pending > 0) {
    // Still transcoding — try again shortly rather than competing for cores.
    setTimeout(scheduleFaceIndex, 15000);
    return;
  }
  triggerFaceIndexer();
}, 8000);

// Dynamic thumbnail generation: if a .webp thumbnail is requested but doesn't exist,
// generate it from the original image on-the-fly and cache it for future requests
app.get("/uploads/:eventId/photos/thumb-:filename.webp", async (req, res) => {
  const { eventId, filename } = req.params;
  const photosDir = path.join(uploadsBaseDir, eventId, "photos");
  const thumbPath = path.join(photosDir, `thumb-${filename}.webp`);
  
  // If thumbnail exists, serve it
  if (fs.existsSync(thumbPath)) {
    return res.sendFile(thumbPath);
  }
  
  // Find the original file by searching for partial match
  // The filename in the URL is the original upload name (e.g. "photo-1234567890-uuid.jpg")
  // but the stored file is renamed to "media-{timestamp}-{uuid}.jpg"
  let originalPath: string | null = null;
  
  // Try exact match first
  const exactMatch = path.join(photosDir, filename);
  if (fs.existsSync(exactMatch)) {
    originalPath = exactMatch;
  }
  
  // Try with common extensions
  if (!originalPath) {
    const extensions = ['.jpg', '.jpeg', '.png', '.heic', '.webp', '.gif'];
    for (const ext of extensions) {
      const candidate = path.join(photosDir, `${filename}${ext}`);
      if (fs.existsSync(candidate)) {
        originalPath = candidate;
        break;
      }
    }
  }
  
  // Try partial match (search for filename prefix in the photos directory)
  if (!originalPath && fs.existsSync(photosDir)) {
    const baseName = filename.replace(/\.[^.]+$/, ''); // Remove extension
    const files = fs.readdirSync(photosDir);
    // Look for files that contain part of the original name (UUID match)
    const uuidMatch = filename.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
    if (uuidMatch) {
      const uuid = uuidMatch[0];
      const found = files.find(f => f.includes(uuid) && !f.startsWith('thumb-'));
      if (found) {
        originalPath = path.join(photosDir, found);
      }
    }
    // Fallback: if only one non-thumbnail image exists, use it
    if (!originalPath) {
      const imageFiles = files.filter(f => !f.startsWith('thumb-') && /\.(jpg|jpeg|png|heic|webp)$/i.test(f));
      if (imageFiles.length > 0) {
        // Try to match by timestamp or just use the first one
        const candidate = path.join(photosDir, imageFiles[0]);
        originalPath = candidate;
      }
    }
  }
  
  if (!originalPath) {
    return res.status(404).json({ error: "Original image not found" });
  }
  
  // Generate thumbnail from original
  try {
    const thumbBuffer = await sharp(originalPath)
      .rotate()
      .resize({ width: 600, withoutEnlargement: true })
      .webp({ quality: 80 })
      .toBuffer();
    
    // Ensure directory exists
    fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
    
    // Cache the thumbnail for future requests
    fs.writeFileSync(thumbPath, thumbBuffer);
    
    res.set("Content-Type", "image/webp");
    res.send(thumbBuffer);
  } catch (err) {
    logger.error("Failed to generate thumbnail: " + err);
    // Fallback: serve the original image
    res.sendFile(originalPath);
  }
});


/**
 * Fallback middleware: serve from the event's custom save directory, and then
 * from the external archive root.
 *
 * The archive mirrors the primary layout exactly (`<root>\<eventId>\<photos|
 * videos>\<file>`), so the same relative path resolves on either tier. A file
 * that has been relocated to F:\Wedding keeps working on the original URL, and
 * if the external drive is unplugged the request simply 404s instead of hanging.
 */
app.use("/uploads", async (req: any, res, next) => {
  const urlParts = req.path.replace(/^\/+/, "").split("/");
  // Never let a crafted URL walk out of a media root.
  if (urlParts.some((part: string) => !part || part === "." || part.includes(".."))) return next();
  if (urlParts.length >= 2) {
    const eventId = urlParts[0];
    try {
      const event = await db.getEventById(eventId);
      if (event && event.saveDirectory && event.saveDirectory !== "./uploads") {
        const customPath = path.resolve(event.saveDirectory, ...urlParts);
        if (fs.existsSync(customPath)) {
          return res.sendFile(customPath);
        }
      }
      if (ARCHIVE_ENABLED) {
        const archivedPath = path.resolve(ARCHIVE_ROOT, ...urlParts);
        if (fs.existsSync(archivedPath)) {
          // Archived originals never change, so let phones cache them hard —
          // that keeps repeat views off the external bus entirely.
          res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
          return res.sendFile(archivedPath);
        }
      }
    } catch {}
  }
  next();
});

// Temp staging area for in-flight uploads, kept separate from served content so a
// half-written file is never reachable through /uploads.
const tempUploadDir = path.join(uploadsBaseDir, ".tmp");
if (!fs.existsSync(tempUploadDir)) fs.mkdirSync(tempUploadDir, { recursive: true });

/**
 * Clears temp files left behind by a process that died mid-upload. Anything
 * still here and older than the cutoff cannot belong to a live request, so it is
 * pure garbage — and a single abandoned video can be hundreds of megabytes.
 */
async function sweepStaleTempFiles(maxAgeMs = 6 * 60 * 60 * 1000): Promise<void> {
  try {
    const entries = await fsp.readdir(tempUploadDir, { withFileTypes: true });
    const cutoff = Date.now() - maxAgeMs;
    let removed = 0;
    let bytes = 0;
    for (const entry of entries) {
      const target = path.join(tempUploadDir, entry.name);
      try {
        const stat = await fsp.stat(target);
        if (stat.mtimeMs >= cutoff) continue;
        bytes += stat.isFile() ? stat.size : 0;
        await fsp.rm(target, { recursive: true, force: true });
        removed++;
      } catch { /* raced with a live request; leave it alone */ }
    }
    if (removed > 0) {
      logger.info(`Swept ${removed} stale temp upload item(s) (~${(bytes / (1024 * 1024)).toFixed(1)} MB).`);
    }
  } catch (err: any) {
    logger.warn(`Temp sweep failed: ${err?.message || err}`);
  }
}
void sweepStaleTempFiles();
setInterval(() => void sweepStaleTempFiles(), 60 * 60 * 1000).unref();

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, tempUploadDir);
  },
  filename: (req, file, cb) => {
    // Preserve the extension so ffmpeg/sharp can sniff the container reliably,
    // and keep the name collision-proof for simultaneous uploads.
    const ext = path.extname(file.originalname || "").toLowerCase().slice(0, 12);
    cb(null, `temp-${Date.now()}-${uuidv4()}${ext}`);
  }
});
const uploadParams = multer({
  storage,
  limits: { fileSize: 2048 * 1024 * 1024, files: 1, fields: 24 },
  fileFilter: (req, file, cb) => {
    const mimetype = (file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExts = [
      '.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.gif', '.avif', '.bmp',
      '.mp4', '.mov', '.webm', '.mkv', '.avi', '.3gp', '.3gpp', '.m4v'
    ];

    if (mimetype.startsWith('image/') || mimetype.startsWith('video/') || allowedExts.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`نوع فایل (${file.originalname || 'ناشناس'}) پشتیبانی نمی‌شود. تنها فایل‌های تصویر و ویدیو مجاز هستند.`));
    }
  }
});

const handleStreamingUploadMiddleware = (req: any, res: any, next: any) => {
  // Mark activity before the body is even read: a 500 MB video takes a while to
  // arrive, and the archive worker must stay out of the way for all of it, not
  // just from the moment the response is sent.
  noteUploadActivity();
  uploadParams.single('fileData')(req, res, async (err: any) => {
    if (err) {
      logger.error("Multer upload error: " + err.message);
      // Multer may have already written part of the file before erroring out.
      await safeUnlink(req.file?.path);
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? "حجم فایل بیش از حد مجاز است."
        : (err.message || "خطا در آپلود فایل.");
      return res.status(status).json({ error: message });
    }
    next();
  });
};

/** Hashes a file by streaming it, so a 2 GB video never lands in memory at once. */
function hashFile(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    // 4 MB chunks instead of the 64 KB default: a 500 MB video goes from ~8000
    // read round-trips to ~125, which matters because this is on the hot path of
    // every upload.
    const stream = fs.createReadStream(filePath, { highWaterMark: 4 * 1024 * 1024 });
    stream.on('error', reject);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

/** Detects photo vs video without trusting the client-declared mime type alone. */
function detectMediaType(file: any): "photo" | "video" {
  const ext = path.extname(file?.originalname || file?.filename || '').toLowerCase();
  const videoExts = ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.3gp', '.3gpp', '.m4v'];
  const mime = (file?.mimetype || '').toLowerCase();
  if (mime.startsWith('video')) return 'video';
  if (mime.startsWith('image')) return videoExts.includes(ext) ? 'video' : 'photo';
  return videoExts.includes(ext) ? 'video' : 'photo';
}

/* ─────────────────────────  VIDEO FAST PATH  ─────────────────────────
 * Uploading a video used to be dramatically slower than a photo because the
 * request awaited a *full* H.264 transcode of the whole file before responding.
 * Now:
 *   1. ffprobe (milliseconds) tells us what we actually received.
 *   2. Anything already MP4 + H.264 + (AAC | silent) is stored as-is — most
 *      phone recordings land here, so the transcode simply never runs.
 *   3. Anything else is stored as-is too, and re-encoded *after* the response
 *      in a background job that patches the row and broadcasts `media:updated`.
 * The only ffmpeg work left on the request path is a single-frame thumbnail
 * taken with an input-side seek, which is O(1) rather than O(video length).
 */

interface VideoProbe {
  videoCodec: string;
  audioCodec: string;
  formatName: string;
  durationSec: number;
}

function probeVideo(filePath: string): Promise<VideoProbe | null> {
  return new Promise(resolve => {
    ffmpeg.ffprobe(filePath, (err: any, data: any) => {
      if (err || !data) return resolve(null);
      const streams: any[] = Array.isArray(data.streams) ? data.streams : [];
      const video = streams.find(s => s.codec_type === 'video');
      const audio = streams.find(s => s.codec_type === 'audio');
      resolve({
        videoCodec: String(video?.codec_name || '').toLowerCase(),
        audioCodec: String(audio?.codec_name || '').toLowerCase(),
        formatName: String(data.format?.format_name || '').toLowerCase(),
        durationSec: Math.round(Number(data.format?.duration) || 0),
      });
    });
  });
}

/**
 * True when the file already plays natively in browsers, so re-encoding would
 * burn CPU and lose quality for nothing.
 */
function isWebReadyVideo(probe: VideoProbe | null, ext: string): boolean {
  if (!probe) return false;
  const containerOk = probe.formatName.includes('mp4') || probe.formatName.includes('m4a')
    || ['.mp4', '.m4v'].includes(ext);
  const videoOk = probe.videoCodec === 'h264' || probe.videoCodec === 'avc1';
  const audioOk = !probe.audioCodec || probe.audioCodec === 'aac' || probe.audioCodec === 'mp3';
  return containerOk && videoOk && audioOk;
}

/**
 * Grabs one frame as a JPEG thumbnail. The seek is passed as an *input* option
 * so ffmpeg jumps straight to the keyframe instead of decoding from the start.
 */
function extractVideoThumbnail(source: string, destination: string, atSeconds: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(source)
      .inputOptions(['-ss', String(Math.max(0, atSeconds))])
      .outputOptions(['-threads', String(FFMPEG_THREADS), '-frames:v', '1', '-qscale:v', '3', '-vf', 'scale=600:-2'])
      .output(destination)
      .on('end', () => resolve())
      .on('error', (err: any) => reject(err))
      .run();
  });
}

/** Re-encodes to browser-friendly, faststart H.264/AAC MP4. */
function transcodeToMp4(source: string, destination: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    ffmpeg(source)
      // Each flag and its value must be a separate argument — passing
      // '-c:v libx264' as one string makes ffmpeg read "libx264" as
      // trailing garbage on the stream specifier and abort.
      // -threads is sized so VIDEO_JOBS concurrent encodes still fit the CPU.
      .outputOptions([
        '-threads', String(FFMPEG_THREADS),
        '-c:v', 'libx264',
        '-crf', '23',
        '-preset', 'veryfast',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-movflags', '+faststart',
      ])
      .save(destination)
      .on('end', () => resolve())
      .on('error', (err: any) => reject(err));
  });
}

/**
 * Background re-encode for videos that are not web-ready. Runs after the HTTP
 * response, swaps the stored file for the MP4, then tells every connected
 * client to refresh that item. Failure is silent-but-logged: the guest keeps
 * the original playable-or-downloadable file either way.
 */
async function queueVideoTranscode(media: any, event: any): Promise<void> {
  const sourcePath = media.systemSavePath;
  if (!sourcePath || !fs.existsSync(sourcePath)) return;

  const scratchDir = await fsp.mkdtemp(path.join(tempUploadDir, "reencode-"));
  const outputPath = path.join(scratchDir, `hq-${uuidv4()}.mp4`);

  try {
    await videoPool.run(() => withTimeout(
      transcodeToMp4(sourcePath, outputPath),
      VIDEO_JOB_TIMEOUT_MS,
      "Background video re-encode timed out"
    ));

    const stat = await fsp.stat(outputPath).catch(() => null);
    if (!stat || stat.size === 0) throw new Error("Re-encode produced an empty file");

    const baseName = path.basename(sourcePath, path.extname(sourcePath));
    const saved = await storageProvider.saveFile(
      { path: outputPath }, media.eventId, 'video', `${baseName}.mp4`, undefined,
      event?.saveDirectory || undefined
    );

    const previousUrl = media.url;
    const previousPath = media.systemSavePath;

    const updated = await db.updateMedia(media.id, {
      url: saved.url,
      systemSavePath: saved.systemSavePath,
      fileSize: stat.size,
      mimeType: 'video/mp4',
      // The re-encoded file is written to the local tier, so this row belongs
      // back in the archive queue even if the original had already been moved.
      archivedAt: null,
      localSavePath: null,
    });

    // Only drop the original once the row points somewhere else.
    if (previousPath && previousPath !== saved.systemSavePath) {
      await storageProvider.deleteFile(previousUrl, previousPath, media.eventId, 'video').catch(() => {});
    }

    logger.info(`Background re-encode finished for media ${media.id}`);
    broadcastEvent('media:updated', { eventId: media.eventId, media: updated || { ...media, url: saved.url } });
  } catch (err: any) {
    logger.warn(`Background re-encode skipped for media ${media?.id}: ${err?.message || err}`);
  } finally {
    await fsp.rm(scratchDir, { recursive: true, force: true }).catch(() => {});
  }
}


// --- API ROUTES ---


app.get("/health", (req, res) => res.json({ status: "ok" }));

app.get("/api/admin/check", (req: any, res) => {
  if (req.session && req.session.adminId) {
    res.json({ authenticated: true, isSuperuser: req.session.isSuperuser, adminId: req.session.adminId });
  } else {
    res.status(401).json({ authenticated: false });
  }
});

app.post("/api/admin/login", loginLimiter, async (req: any, res) => {
  const { username, password } = req.body;
  const sqlite = await db.getDb();
  const admin = await sqlite.get('SELECT * FROM admins WHERE username = ?', username);
  if (admin && await bcrypt.compare(password, admin.passwordHash)) {
    req.session.adminId = admin.id;
    req.session.isSuperuser = admin.isSuperuser === 1 || admin.isSuperuser === true || admin.isSuperuser === 'true';
    res.json({ success: true, message: 'Logged in', isSuperuser: req.session.isSuperuser });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.post("/api/admin/logout", (req: any, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Thumbnail generation endpoint - generates webp thumbnails on-the-fly from original files
app.get("/api/thumbnail/:eventId/:mediaId", async (req, res) => {
  try {
    const { eventId, mediaId } = req.params;
    const sqlite = await db.getDb();
    const media = await sqlite.get('SELECT * FROM media WHERE id = ? AND eventId = ?', mediaId, eventId);
    if (!media) return res.status(404).json({ error: "Media not found" });
    const originalPath = media.systemSavePath || path.join(uploadsBaseDir, String(media.url).replace(/^\/uploads\//, ''));
    if (!fs.existsSync(originalPath)) return res.status(404).json({ error: "Original file not found" });
    if (media.type === 'video') {
      try {
        const ffmpeg = (await import("fluent-ffmpeg")).default;
        const thumbOutput = originalPath + '_thumb.jpg';
        if (!fs.existsSync(thumbOutput)) {
          await new Promise<void>((resolve, reject) => {
            ffmpeg(originalPath).screenshots({ count: 1, timemarks: ['1'], filename: path.basename(thumbOutput), folder: path.dirname(thumbOutput) }).on('end', () => resolve()).on('error', (err: any) => reject(err));
          });
        }
        if (fs.existsSync(thumbOutput)) { res.set("Content-Type", "image/jpeg"); return res.sendFile(thumbOutput); }
      } catch (err) { logger.error("Video thumbnail failed: " + err); }
      return res.status(500).json({ error: "Failed to generate video thumbnail" });
    }
    const thumbBuffer = await sharp(originalPath).rotate().resize({ width: 600, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    const thumbFilename = `thumb-${path.basename(originalPath, path.extname(originalPath))}.webp`;
    const thumbPath = path.join(uploadsBaseDir, eventId, "photos", thumbFilename);
    fs.mkdirSync(path.dirname(thumbPath), { recursive: true });
    fs.writeFileSync(thumbPath, thumbBuffer);
    res.set("Content-Type", "image/webp");
    res.send(thumbBuffer);
  } catch (err) {
    logger.error("Thumbnail generation failed: " + err);
    res.status(500).json({ error: "Failed to generate thumbnail" });
  }
});

app.get("/api/events", async (req, res, next) => {
  try {
    const events = await db.getAllEvents();
    res.json(events);
  } catch (err) { next(err); }
});

app.get("/api/events/:id", async (req, res, next) => {
  try {
    const event = await db.getEventById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json(event);
  } catch (err) { next(err); }
});

app.post("/api/events", requireAdmin, async (req, res, next) => {
  try {
    const { id, name, hostName, description, date, revealStyle, imageLimit, videoLimit, maxVideoDuration, saveDirectory } = req.body;
    if (!id || !name) return res.status(400).json({ error: "Event ID and Name are required." });
    
    const cleanedId = id.trim().toLowerCase().replace(/[^a-z0-9\-]/g, "");
    
    // Check ownership if updating
    const existingEvent = await db.getEventById(cleanedId);
    if (existingEvent && existingEvent.adminId && existingEvent.adminId !== req.session.adminId && !req.session.isSuperuser) {
      return res.status(403).json({ error: "Forbidden: You cannot modify an event that belongs to another admin" });
    }

    await db.createOrUpdateEvent({
      id: cleanedId, name, hostName, description, 
      date: date || new Date().toISOString().split('T')[0],
      revealStyle: revealStyle || 'instant',
      isRevealed: revealStyle === 'instant',
      imageLimit: parseInt(imageLimit)||0, 
      videoLimit: parseInt(videoLimit)||0,
      maxVideoDuration: parseInt(maxVideoDuration)||30,
      saveDirectory: saveDirectory || './uploads',
      localSyncHost: "http://localhost:8080",
      localSyncEnabled: false,
      adminId: existingEvent?.adminId || req.session.adminId
    });
    
    const event = await db.getEventById(cleanedId);
    res.json(event);
  } catch (err) { next(err); }
});

app.put("/api/events/:id/sync-settings", requireAdmin, async (req, res, next) => {
  try {
    const event = await db.getEventById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    if (event.adminId && event.adminId !== req.session.adminId && !req.session.isSuperuser) {
      return res.status(403).json({ error: "Forbidden: You do not own this event" });
    }

    const allowedFields = ['localSyncHost', 'localSyncEnabled', 'saveDirectory', 'isRevealed'];
    const updates: any = { id: event.id };
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field] === true || req.body[field] === 'true' || req.body[field] === 1 ? true : req.body[field] === false || req.body[field] === 'false' || req.body[field] === 0 ? false : req.body[field];
      }
    }
    
    await db.createOrUpdateEvent(updates);
    res.json(await db.getEventById(event.id));
  } catch(err) { next(err); }
});

// Used to be public in previous commit, securing it
app.delete("/api/events/:id", requireAdmin, async (req, res, next) => {
  try {
    const event = await db.getEventById(req.params.id);
    if (event && event.adminId && event.adminId !== req.session.adminId && !req.session.isSuperuser) {
      return res.status(403).json({ error: "Forbidden: You do not own this event" });
    }
    await db.deleteEvent(req.params.id);
    await storageProvider.deleteEventData(req.params.id);
    res.json({ success: true });
  } catch(err) { next(err); }
});

app.get("/api/events/:id/media", async (req: any, res: any, next: any) => {
  try {
    const event = await db.getEventById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const isAdmin = req.session && req.session.adminId;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;
    
    // We update db.getEventMedia below to support pagination
    const eventMedias = await db.getEventMedia(event.id, limit, offset);

    if (!event.isRevealed && !isAdmin && event.revealStyle === "delay") {
      const secureMedia = eventMedias.map((m: any) => ({
        id: m.id, eventId: m.eventId, type: m.type, guestName: m.guestName, timestamp: m.timestamp, filter: m.filter, isLocked: true
      }));
      return res.json({ locked: true, media: secureMedia });
    }
    res.json({ locked: false, media: eventMedias });
  } catch(err) { next(err); }
});

/**
 * A guest's own uploads. Not an authenticated endpoint — the guest name is the
 * only identity this app has — so it deliberately returns nothing more than the
 * public /media route already exposes, just filtered. Deletion is still guarded
 * by the guestName check in the DELETE route below.
 */
app.get("/api/events/:id/my-media", async (req: any, res: any, next: any) => {
  try {
    const event = await db.getEventById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const guestName = String(req.query.guestName || "").trim().slice(0, 120);
    if (!guestName) return res.json({ media: [] });

    const limit = Math.min(500, parseInt(req.query.limit) || 200);
    const media = await db.getGuestMedia(event.id, guestName, limit);
    res.json({ media });
  } catch (err) { next(err); }
});

// Multipart streaming upload

app.post("/api/events/:id/upload/streaming", handleStreamingUploadMiddleware, async (req: any, res: any) => {
  // Everything created for this single request lives in `cleanup`, so no matter
  // which stage fails we never leak temp files into uploads/.tmp.
  const cleanup = new Set<string>();
  let workDir: string | null = null;

  const finish = async () => {
    for (const target of cleanup) await safeUnlink(target);
    if (workDir) {
      try { await fsp.rm(workDir, { recursive: true, force: true }); } catch {}
    }
  };

  try {
    const eventId = req.params.id;
    const event = await db.getEventById(eventId);
    if (!event) {
      await safeUnlink(req.file?.path);
      return res.status(404).json({ error: "Event not found" });
    }

    if (!req.file) return res.status(400).json({ error: "No valid file uploaded." });
    cleanup.add(req.file.path);

    const guestName = String(req.body.guestName || "Anonymous").trim().slice(0, 120);
    const type = detectMediaType(req.file);
    const filter = String(req.body.filter || "none").slice(0, 40);
    const duration = parseInt(req.body.duration) || 0;
    const originalName = req.file.originalname || req.file.filename || (type === 'video' ? 'video.mp4' : 'photo.jpg');

    // Hashing reads the whole file and probing reads its header; they are both
    // I/O-bound and independent, so run them together rather than back to back.
    const sourceExt = path.extname(originalName).toLowerCase();
    const [fileHash, probe] = await Promise.all([
      hashFile(req.file.path),
      type === 'video' ? probeVideo(req.file.path) : Promise.resolve(null),
    ]);

    const existingDuplicate = await db.findDuplicateMedia(eventId, fileHash);
    if (existingDuplicate) {
      await finish();
      return res.status(409).json({
        error: "Duplicate file detected",
        existingId: existingDuplicate.id,
        existingMedia: existingDuplicate
      });
    }

    // Private scratch dir for ffmpeg outputs; unique per request so two
    // simultaneous uploads can never collide on an output filename.
    workDir = await fsp.mkdtemp(path.join(tempUploadDir, "job-"));

    let thumbnailUrl: string | undefined;

    const webReady = type === 'video' ? isWebReadyVideo(probe, sourceExt) : true;
    const effectiveDuration = type === 'video'
      ? (duration || probe?.durationSec || 0)
      : duration;

    /* ── Thumbnail generation (queued per media class) ── */
    try {
      if (type === 'photo') {
        const thumbBuffer = await imagePool.run(() => withTimeout(
          sharp(req.file.path)
            .rotate()
            .resize({ width: 600, withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer(),
          IMAGE_JOB_TIMEOUT_MS,
          "Image thumbnail timed out"
        ));
        const thumbSave = await storageProvider.saveFile(
          null, eventId, type, `thumb-${path.basename(originalName)}.webp`, thumbBuffer, event.saveDirectory || undefined
        );
        thumbnailUrl = thumbSave.url;
      } else {
        const thumbOutput = path.join(workDir, `thumb-${uuidv4()}.jpg`);
        // Very short clips have no frame at 1s — seek to the midpoint instead.
        const seekAt = effectiveDuration > 0 && effectiveDuration < 2
          ? Math.max(0, effectiveDuration / 2)
          : 1;
        await videoPool.run(() => withTimeout(
          extractVideoThumbnail(req.file.path, thumbOutput, seekAt),
          THUMBNAIL_JOB_TIMEOUT_MS,
          "Video thumbnail timed out"
        ));

        if (fs.existsSync(thumbOutput)) {
          const thumbBuffer = await fsp.readFile(thumbOutput);
          const thumbSave = await storageProvider.saveFile(
            null, eventId, type, `thumb-${path.basename(originalName, path.extname(originalName))}.jpg`, thumbBuffer, event.saveDirectory || undefined
          );
          thumbnailUrl = thumbSave.url;
        }
      }
    } catch (err) {
      // A missing thumbnail is cosmetic — the /api/thumbnail route regenerates
      // it later. Never fail the upload over it.
      logger.warn("Failed to generate thumbnail: " + err);
    }

    // The original bytes are always what we store first. Non-web-ready videos
    // get re-encoded in the background (see below) so the guest's request never
    // waits on a full transcode.
    const uploadName = originalName;

    const { url: publicUrl, systemSavePath } = await storageProvider.saveFile(
      req.file, eventId, type, uploadName, undefined, event.saveDirectory || undefined
    );

    // The local provider *moves* the temp file into place; drop it from the
    // cleanup list so we don't delete the stored original.
    cleanup.delete(req.file.path);

    const mediaItem = {
      id: uuidv4(),
      eventId,
      type,
      url: publicUrl,
      thumbnailUrl: thumbnailUrl || publicUrl,
      guestName,
      filter,
      timestamp: new Date().toISOString(),
      likes: 0,
      duration: effectiveDuration,
      fileSize: req.file.size,
      systemSavePath,
      mimeType: req.file.mimetype,
      fileHash
    };

    await db.createMedia(mediaItem);
    await finish();

    res.json(mediaItem);
    broadcastEvent('media:uploaded', { eventId, media: mediaItem });

    // Tell the archive worker guests are actively uploading, so it holds off on
    // moving anything to the external drive until things go quiet.
    noteUploadActivity();

    // Videos that browsers can't play natively are converted after the fact so
    // the guest isn't left staring at a spinner for the length of a transcode.
    if (type === 'video' && !webReady) {
      logger.info(`Queued background re-encode for media ${mediaItem.id} (codec=${probe?.videoCodec || 'unknown'}/${probe?.audioCodec || 'none'} container=${probe?.formatName || sourceExt})`);
      void queueVideoTranscode(mediaItem, event);
    }

    // Coalesce indexing across an upload burst instead of one run per file.
    scheduleFaceIndex();
  } catch (err: any) {
    await finish();
    logger.error("Upload route error: " + (err?.stack || err));
    return res.status(400).json({ error: err?.message || "خطا در بارگذاری و پردازش فایل." });
  }
});

app.delete("/api/events/:eventId/media/:mediaId", async (req: any, res: any, next: any) => {
  try {
    const { eventId, mediaId } = req.params;
    const guestName = String(req.body.guestName || "").trim();
    const isAdmin = req.session && req.session.adminId;

    const sqlite = await db.getDb();
    const media = await sqlite.get('SELECT * FROM media WHERE id = ? AND eventId = ?', mediaId, eventId);
    
    if (!media) return res.status(404).json({ error: "Media not found" });

    if (!isAdmin && media.guestName !== guestName) {
      return res.status(403).json({ error: "Unauthorized to delete this media" });
    }

    await sqlite.run('DELETE FROM media WHERE id = ?', mediaId);

    await storageProvider.deleteFile(media.url, media.systemSavePath, eventId, media.type);

    // A crashed archive pass can leave a copy (or a `.part` staging file) on the
    // external drive while the row still points at the local disk. Sweep it, so
    // deleting a photo really deletes every copy of it.
    if (ARCHIVE_ENABLED && !media.archivedAt && media.systemSavePath) {
      const primaryRoot = await getPrimarySaveDirectory();
      const orphan = primaryRoot ? archivePathFor(media.systemSavePath, primaryRoot) : null;
      if (orphan) {
        await fsp.rm(orphan, { force: true }).catch(() => {});
        await fsp.rm(`${orphan}.part`, { force: true }).catch(() => {});
      }
    }

    res.json({ success: true });
    broadcastEvent('media:deleted', { mediaId, eventId });
  } catch (err) { next(err); }
});

app.post("/api/events/:eventId/media/:mediaId/like", async (req, res, next) => {
  try {
    const media = await db.likeMedia(req.params.mediaId);
    res.json(media);
    broadcastEvent('media:liked', { mediaId: req.params.mediaId, eventId: req.params.eventId, media });
  } catch(err) { next(err); }
});

/* ------------------------------------------------------------------ *
 * Gift card details (public read) + gift receipts (admin-only inbox)
 *
 * Receipt screenshots are deliberately NOT written under `uploads/`, which is
 * mounted with express.static. They live in `private/gift-receipts/<eventId>/`
 * and are only reachable through the requireAdmin-gated image route below, so a
 * guest cannot enumerate other guests' payment screenshots. The database row
 * stores the *text* (senderName / message / amount) next to a *pointer* to the
 * file (imageUrl / systemSavePath / mimeType / fileSize) rather than the bytes.
 * ------------------------------------------------------------------ */

const giftPrivateDir = path.join(process.cwd(), "private", "gift-receipts");
fs.mkdirSync(giftPrivateDir, { recursive: true });

const GIFT_IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif', '.gif', '.bmp'];

const giftUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, tempUploadDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase().slice(0, 12);
      cb(null, `gift-${Date.now()}-${uuidv4()}${ext}`);
    }
  }),
  limits: { fileSize: 16 * 1024 * 1024, files: 1, fields: 12 },
  fileFilter: (req, file, cb) => {
    const mimetype = (file.mimetype || '').toLowerCase();
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (mimetype.startsWith('image/') || GIFT_IMAGE_EXTS.includes(ext)) cb(null, true);
    else cb(new Error("فقط تصویر رسید قابل ارسال است."));
  }
});

/** Public: card / bank details for guests who want to send a gift. */
app.get("/api/events/:id/gift-card", async (req: any, res: any, next: any) => {
  try {
    const card = await db.getGiftCard(req.params.id);
    if (!card || !card.enabled) return res.json({ enabled: false });
    return res.json(card);
  } catch (err) { next(err); }
});

app.put("/api/events/:id/gift-card", requireAdmin, async (req: any, res: any, next: any) => {
  try {
    const event = await db.getEventById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });
    const card = await db.upsertGiftCard({ ...req.body, eventId: req.params.id });
    res.json(card);
  } catch (err) { next(err); }
});

/** Public submit: screenshot + message. Response intentionally reveals nothing. */
app.post("/api/events/:id/gift-receipts", (req: any, res: any, next: any) => {
  giftUpload.single('fileData')(req, res, async (err: any) => {
    if (err) {
      await safeUnlink(req.file?.path);
      const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
      return res.status(status).json({
        error: err.code === 'LIMIT_FILE_SIZE' ? "حجم تصویر بیش از حد مجاز است (۱۶ مگابایت)." : (err.message || "خطا در ارسال رسید.")
      });
    }
    next();
  });
}, async (req: any, res: any) => {
  const tempPath = req.file?.path;
  try {
    const eventId = req.params.id;
    const event = await db.getEventById(eventId);
    if (!event) {
      await safeUnlink(tempPath);
      return res.status(404).json({ error: "Event not found" });
    }

    const card = await db.getGiftCard(eventId);
    if (card && card.enabled === false) {
      await safeUnlink(tempPath);
      return res.status(403).json({ error: "ارسال رسید در حال حاضر غیرفعال است." });
    }

    const senderName = String(req.body.senderName || "").trim().slice(0, 120) || "مهمان ناشناس";
    const message = String(req.body.message || "").trim().slice(0, 2000);
    const amount = String(req.body.amount || "").trim().slice(0, 40);

    if (!tempPath && !message) {
      return res.status(400).json({ error: "حداقل یک تصویر یا پیام لازم است." });
    }

    const id = uuidv4();
    let imageUrl: string | null = null;
    let systemSavePath: string | null = null;
    let mimeType: string | null = null;
    let fileSize: number | null = null;

    if (tempPath) {
      const dir = path.join(giftPrivateDir, id.slice(0, 2));
      await fsp.mkdir(dir, { recursive: true });
      const ext = (path.extname(req.file.originalname || "").toLowerCase().slice(0, 12)) || ".jpg";
      const target = path.join(dir, `${id}${ext}`);
      try {
        await fsp.rename(tempPath, target);
      } catch (e: any) {
        if (e?.code !== "EXDEV" && e?.code !== "EPERM") throw e;
        await fsp.copyFile(tempPath, target);
        await safeUnlink(tempPath);
      }
      systemSavePath = target;
      // Served only through the admin-gated route, never as a static file.
      imageUrl = `/api/events/${encodeURIComponent(eventId)}/gift-receipts/${id}/image`;
      mimeType = req.file.mimetype || "application/octet-stream";
      fileSize = req.file.size || null;
    }

    await db.createGiftReceipt({
      id, eventId, senderName, message, amount,
      imageUrl, systemSavePath, mimeType, fileSize,
      seen: false, timestamp: new Date().toISOString()
    });

    // No receipt data echoed back — guests must not be able to read the inbox.
    res.status(201).json({ success: true });
  } catch (err: any) {
    await safeUnlink(tempPath);
    logger.error("Gift receipt error: " + (err?.stack || err));
    res.status(400).json({ error: "خطا در ذخیره رسید." });
  }
});

app.get("/api/events/:id/gift-receipts", requireAdmin, async (req: any, res: any, next: any) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 200, 500);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const [items, counts] = await Promise.all([
      db.getGiftReceipts(req.params.id, limit, offset),
      db.countGiftReceipts(req.params.id)
    ]);
    res.json({ items, ...counts });
  } catch (err) { next(err); }
});

app.get("/api/events/:id/gift-receipts/:receiptId/image", requireAdmin, async (req: any, res: any, next: any) => {
  try {
    const receipt = await db.getGiftReceipt(req.params.receiptId);
    if (!receipt || receipt.eventId !== req.params.id || !receipt.systemSavePath) {
      return res.status(404).json({ error: "Not found" });
    }
    // Confine reads to the private gift directory even if the DB row was tampered with.
    const resolved = path.resolve(receipt.systemSavePath);
    if (!resolved.startsWith(path.resolve(giftPrivateDir))) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (!fs.existsSync(resolved)) return res.status(404).json({ error: "File missing" });
    res.setHeader("Cache-Control", "private, max-age=300");
    // Never echo the client-declared mime back as-is; derive it from the stored
    // extension so a spoofed "text/html" can't turn the receipt into a script.
    const extType: Record<string, string> = {
      ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png",
      ".webp": "image/webp", ".gif": "image/gif", ".bmp": "image/bmp",
      ".avif": "image/avif", ".heic": "image/heic", ".heif": "image/heif",
    };
    res.type(extType[path.extname(resolved).toLowerCase()] || "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Content-Disposition", "inline");
    fs.createReadStream(resolved).pipe(res);
  } catch (err) { next(err); }
});

app.patch("/api/events/:id/gift-receipts/:receiptId", requireAdmin, async (req: any, res: any, next: any) => {
  try {
    const receipt = await db.getGiftReceipt(req.params.receiptId);
    if (!receipt || receipt.eventId !== req.params.id) return res.status(404).json({ error: "Not found" });
    const updated = await db.markGiftReceiptSeen(req.params.receiptId, Boolean(req.body.seen));
    res.json(updated);
  } catch (err) { next(err); }
});

app.delete("/api/events/:id/gift-receipts/:receiptId", requireAdmin, async (req: any, res: any, next: any) => {
  try {
    const receipt = await db.getGiftReceipt(req.params.receiptId);
    if (!receipt || receipt.eventId !== req.params.id) return res.status(404).json({ error: "Not found" });
    if (receipt.systemSavePath) {
      const resolved = path.resolve(receipt.systemSavePath);
      if (resolved.startsWith(path.resolve(giftPrivateDir))) await safeUnlink(resolved);
    }
    await db.deleteGiftReceipt(req.params.receiptId);
    res.json({ success: true });
  } catch (err) { next(err); }
});

app.post("/api/events/:eventId/download-my-photos", async (req: any, res: any, next: any) => {
  try {
    const { eventId } = req.params;
    const { guestName } = req.body;
    if (!guestName) return res.status(400).json({ error: "Guest name required" });

    const event = await db.getEventById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const sqlite = await db.getDb();
    const medias = await sqlite.all(
      'SELECT * FROM media WHERE eventId = ? AND guestName = ? ORDER BY timestamp DESC',
      [eventId, guestName]
    );
    if (!medias.length) return res.status(400).json({ error: 'No media found for this guest' });

    res.attachment(`${event.name}_${guestName}_Photos.zip`);
    const archiverModule = await import("archiver");
    // @ts-ignore
    const archiver = archiverModule.default || archiverModule;
    const archive = archiver('zip', { zlib: { level: 9 } } as any);
    archive.pipe(res);

    for (const m of medias) {
      const fileStream = storageProvider.getFileStream(m.systemSavePath);
      if (fileStream) {
        archive.append(fileStream, { name: `${m.id}.${m.type === 'video' ? 'mp4' : 'jpg'}` });
      }
    }
    await archive.finalize();
  } catch (err) { next(err); }
});

app.post("/api/events/:id/upload/event-image", requireAdmin, uploadParams.single('fileData'), async (req, res, next) => {
  try {
    const event = await db.getEventById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const imageType = req.body.imageType;
    if (!imageType || !['coverImage', 'couplePhoto'].includes(imageType)) {
      return res.status(400).json({ error: "Invalid imageType" });
    }

    const { url: publicUrl } = await storageProvider.saveFile(
      req.file, req.params.id, 'photo', `event-${imageType}${path.extname(req.file.originalname)}`,
      undefined, event.saveDirectory || undefined
    );

    await db.createOrUpdateEvent({ id: req.params.id, [imageType]: publicUrl });

    if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.json({ url: publicUrl });
  } catch(err) { next(err); }
});

app.get("/api/events/:id/download-zip", requireAdmin, async (req: any, res: any, next: any) => {
  try {
    const event = await db.getEventById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    const medias = await db.getEventMedia(event.id);
    if (!medias.length) return res.status(400).json({ error: 'No media' });

    res.attachment(`${event.name}_Media.zip`);
    const archiverModule = await import("archiver");
    // @ts-ignore
    const archiver = archiverModule.default || archiverModule;
    const archive = archiver('zip', { zlib: { level: 9 } } as any);
    archive.pipe(res);

    for (const m of medias) {
      const fileStream = storageProvider.getFileStream(m.systemSavePath);
      if (fileStream) {
        archive.append(fileStream, { name: path.basename(m.systemSavePath) });
      }
    }
    await archive.finalize();
  } catch (err) { next(err); }
});

/* ------------------------------------------------------------------ *
 * Tiered storage: originals land on the fast local disk, then get moved
 * to the external archive drive while the machine is idle. These two
 * routes are the admin's window into that queue — guests never see them.
 * ------------------------------------------------------------------ */

app.get("/api/events/:id/archive-status", requireAdmin, async (req: any, res: any, next: any) => {
  try {
    const primaryRoot = await getPrimarySaveDirectory();
    const state = archiveIdleState();
    const stats = await db.getArchiveStats();

    // Probe the volume rather than the folder: an unplugged drive letter must
    // report "not mounted" instead of silently being created on another disk.
    const archiveMounted = await isArchiveDriveMounted();

    res.json({
      enabled: ARCHIVE_ENABLED && archiveMounted,
      archiveRoot: ARCHIVE_ROOT,
      archiveMounted,
      primaryRoot: primaryRoot || null,
      idle: state.idle,
      idleReason: state.reason,
      cpuBusyPercent: Math.round(state.cpuBusyPercent),
      lastPass: getArchiveStatusSummary(),
      ...stats,
    });
  } catch (err) { next(err); }
});

app.post("/api/events/:id/archive-now", requireAdmin, async (req: any, res: any, next: any) => {
  try {
    // `force` bypasses the idle gate: the admin asked for it explicitly, so the
    // usual "wait until nobody is uploading" politeness doesn't apply.
    const result = await runArchivePass(getPrimarySaveDirectory, { force: true });
    res.json({ ...result, lastPass: getArchiveStatusSummary() });
  } catch (err) { next(err); }
});

app.get("/api/events/:id/face-profiles", async (req: any, res: any, next: any) => {
  try {
    // Resolve face_index.json from the event's saveDirectory (dynamic hot-swap support)
    const saveDir = await getPrimarySaveDirectory();
    const faceIdxDir = getFaceIndexDir(saveDir);
    const jsonPath = path.join(faceIdxDir, "face_index.json");
    if (!fs.existsSync(jsonPath)) {
      return res.json({ profiles: [], totalFaces: 0, lastUpdated: 0 });
    }
    const content = fs.readFileSync(jsonPath, "utf8");
    const data = JSON.parse(content);
    const cropsDir = getFaceCropsDir(saveDir);
    const profiles = (data.persons || [])
      .map((p: any) => {
        const thumbName = p.sampleThumbnailName || "";
        const thumbPath = thumbName ? path.join(cropsDir, thumbName) : "";
        const hasThumb = thumbName && fs.existsSync(thumbPath);
        const url = hasThumb ? `/face-crops/${thumbName}` : "";
        return {
          personId: p.personId,
          displayName: p.displayName || p.personId,
          photoCount: p.photoCount || (p.photos ? p.photos.length : 0),
          faceCount: p.photoCount || (p.photos ? p.photos.length : 0),
          avatarUrl: url,
          representativeImage: url,
          photoNames: p.photos || []
        };
      })
      .filter((p: any) => p.avatarUrl !== "" && p.photoCount > 0);

    res.json({
      profiles,
      totalFaces: data.totalFacesDetected || 0,
      lastUpdated: data.lastUpdated || 0
    });
  } catch (err) { next(err); }
});

app.post("/api/events/:id/trigger-face-index", async (req: any, res: any) => {
  triggerFaceIndexer();
  res.json({ success: true, message: "Face indexing triggered in background." });
});

app.post("/api/events/:id/sync-faces", async (req: any, res: any, next: any) => {
  const { id } = req.params;
  const tolerance = parseFloat(req.query.tolerance as string) || 0.2;
  
  if (isIndexingFaces) {
    return res.status(409).json({ error: "پردازش چهره از قبل در حال اجراست." });
  }

  isIndexingFaces = true;
  try {
    const pythonCmd = process.platform === "win32" ? "python" : "python3";
    const scriptPath = path.join(process.cwd(), "scripts", "face_recognizer_insightface.py");

    const inputDirs = [uploadsBaseDir];
    let primarySaveDir: string | undefined;
    
    const sqlite = await db.getDb();
    const event = await sqlite.get('SELECT saveDirectory FROM events WHERE id = ?', id);
    if (event && event.saveDirectory) {
      if (!inputDirs.includes(event.saveDirectory)) {
        inputDirs.push(event.saveDirectory);
      }
      primarySaveDir = event.saveDirectory;
      const vipRefDir = path.join(event.saveDirectory, "reference_faces");
      if (fs.existsSync(vipRefDir) && !inputDirs.includes(vipRefDir)) {
        inputDirs.push(vipRefDir);
      }
    }

    const outputDir = getFaceIndexDir(primarySaveDir);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const formattedDirs = inputDirs.map(d => `"${d}"`).join(" ");
    const cmd = `${pythonCmd} "${scriptPath}" --input-dir ${formattedDirs} --output-dir "${outputDir}" --tolerance ${tolerance} --max-size 800`;
    
    logger.info(`Running InsightFace indexer synchronously: ${cmd}`);

    exec(cmd, { 
      maxBuffer: 1024 * 1024 * 10,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" }
    }, async (error, stdout, stderr) => {
      isIndexingFaces = false;
      if (error) {
        logger.error(`Face indexing failed: ${error.message}`);
        return res.status(500).json({ error: "خطا در اجرای اسکریپت شناسایی چهره" });
      }

      // Read output index to count new photos processed
      let processedCount = 0;
      try {
        const jsonPath = path.join(outputDir, "face_index.json");
        if (fs.existsSync(jsonPath)) {
          const content = fs.readFileSync(jsonPath, "utf8");
          const data = JSON.parse(content);
          const match = stdout.match(/New Photos Processed\s*:\s*(\d+)/);
          if (match) {
            processedCount = parseInt(match[1], 10);
          }
        }
      } catch (e) {
        logger.warn(`Could not parse face index summary: ${e}`);
      }

      res.json({ success: true, processedCount });
    });
  } catch (err: any) {
    isIndexingFaces = false;
    next(err);
  }
});

// Clear and Rebuild Face Index Route
app.delete("/api/events/:id/sync-faces", requireAdmin, async (req: any, res: any, next: any) => {
  try {
    const saveDir = await getPrimarySaveDirectory();
    const faceIdxDir = getFaceIndexDir(saveDir);
    
    if (fs.existsSync(faceIdxDir)) {
      fs.rmSync(faceIdxDir, { recursive: true, force: true });
    }
    
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Rename Face Profile Route
app.post("/api/events/:id/face-profiles/:personId/rename", requireAdmin, async (req: any, res: any, next: any) => {
  try {
    const { personId } = req.params;
    const { displayName } = req.body;
    const saveDir = await getPrimarySaveDirectory();
    const faceIdxDir = getFaceIndexDir(saveDir);
    const jsonPath = path.join(faceIdxDir, "face_index.json");
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: "فایل شاخص یافت نشد." });
    }
    const content = fs.readFileSync(jsonPath, "utf8");
    const data = JSON.parse(content);
    
    let updated = false;
    for (const p of (data.persons || [])) {
      if (p.personId === personId) {
        p.displayName = displayName;
        updated = true;
        break;
      }
    }
    if (!updated) {
      return res.status(404).json({ error: "پروفایل پیدا نشد." });
    }
    
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf8");
    res.json({ success: true });
  } catch (err) { next(err); }
});

// VIP Private Face Reference Upload Route (For training face profiles without displaying in public album)
app.post("/api/events/:id/vip-faces/upload", requireAdmin, handleStreamingUploadMiddleware, async (req: any, res: any, next: any) => {
  try {
    const { id } = req.params;
    const displayName = req.body.displayName || "شخص مهم (VIP)";
    if (!req.file) {
      return res.status(400).json({ error: "هیچ فایل تصویری آپلود نشد." });
    }

    const event = await db.getEventById(id);
    const saveDir = event?.saveDirectory ? event.saveDirectory : await getPrimarySaveDirectory();
    const vipDir = path.join(saveDir, "reference_faces");
    if (!fs.existsSync(vipDir)) {
      fs.mkdirSync(vipDir, { recursive: true });
    }

    const filename = `vip_${Date.now()}_${path.basename(req.file.originalname || "face.jpg")}`;
    const targetPath = path.join(vipDir, filename);

    if (req.file.path) {
      fs.copyFileSync(req.file.path, targetPath);
      try { fs.unlinkSync(req.file.path); } catch {}
    } else if (req.file.buffer) {
      fs.writeFileSync(targetPath, req.file.buffer);
    }

    res.json({
      success: true,
      message: "عکس مرجع چهره ویژه با موفقیت آپلود شد.",
      filePath: targetPath,
      displayName
    });
  } catch (err) { next(err); }
});

// Delete Face Profile Route
app.delete("/api/events/:id/face-profiles/:personId", requireAdmin, async (req: any, res: any, next: any) => {
  try {
    const { personId } = req.params;
    const saveDir = await getPrimarySaveDirectory();
    const faceIdxDir = getFaceIndexDir(saveDir);
    const jsonPath = path.join(faceIdxDir, "face_index.json");
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: "فایل شاخص یافت نشد." });
    }
    const content = fs.readFileSync(jsonPath, "utf8");
    const data = JSON.parse(content);
    
    const initialLen = (data.persons || []).length;
    data.persons = (data.persons || []).filter((p: any) => p.personId !== personId);
    
    if ((data.persons || []).length === initialLen) {
      return res.status(404).json({ error: "پروفایل پیدا نشد." });
    }
    
    // Clean up crops
    const facesDir = getFaceCropsDir(saveDir);
    if (data.allFaces) {
      const removedFaces = data.allFaces.filter((f: any) => f.personGroup === personId);
      for (const rf of removedFaces) {
        if (rf.thumbnailName) {
          const cropPath = path.join(facesDir, rf.thumbnailName);
          if (fs.existsSync(cropPath)) {
            try { fs.unlinkSync(cropPath); } catch {}
          }
        }
      }
      data.allFaces = data.allFaces.filter((f: any) => f.personGroup !== personId);
    }
    
    data.totalFacesDetected = (data.allFaces || []).length;
    data.totalUniquePersons = (data.persons || []).length;
    
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf8");
    res.json({ success: true });
  } catch (err) { next(err); }
});

// Merge Face Profiles Route
app.post("/api/events/:id/face-profiles/merge", requireAdmin, async (req: any, res: any, next: any) => {
  try {
    const { targetPersonId, sourcePersonIds } = req.body;
    if (!targetPersonId || !sourcePersonIds || !Array.isArray(sourcePersonIds) || sourcePersonIds.length === 0) {
      return res.status(400).json({ error: "پارامترهای ادغام نامعتبر هستند." });
    }
    
    const saveDir = await getPrimarySaveDirectory();
    const faceIdxDir = getFaceIndexDir(saveDir);
    const jsonPath = path.join(faceIdxDir, "face_index.json");
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: "فایل شاخص یافت نشد." });
    }
    const content = fs.readFileSync(jsonPath, "utf8");
    const data = JSON.parse(content);
    
    const targetPerson = (data.persons || []).find((p: any) => p.personId === targetPersonId);
    if (!targetPerson) {
      return res.status(404).json({ error: "پروفایل مقصد یافت نشد." });
    }
    
    const sourcePersons = (data.persons || []).filter((p: any) => sourcePersonIds.includes(p.personId));
    for (const sp of sourcePersons) {
      for (const photo of sp.photos || []) {
        if (!targetPerson.photos.includes(photo)) {
          targetPerson.photos.push(photo);
        }
      }
    }
    targetPerson.photoCount = targetPerson.photos.length;
    
    if (data.allFaces) {
      for (const face of data.allFaces) {
        if (sourcePersonIds.includes(face.personGroup)) {
          face.personGroup = targetPersonId;
        }
      }
    }
    
    data.persons = (data.persons || []).filter((p: any) => !sourcePersonIds.includes(p.personId));
    data.totalUniquePersons = data.persons.length;
    
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), "utf8");
    res.json({ success: true });
  } catch (err) { next(err); }
});

app.use((err: any, req: any, res: any, next: any) => {
  logger.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// --- VITE DEV / PRODUCTION FLOW ---

async function startServer() {
  await db.initDb();
  await setupAdmin();
  await setupWeddingEvent();
  await seedGiftCard();

  // Initial face recognition index run + periodic execution every 2 minutes
  setTimeout(triggerFaceIndexer, 5000);
  setInterval(triggerFaceIndexer, 120000);

  // Tiered storage: uploads stay on the fast local disk and are relocated to the
  // external archive drive during idle windows.
  setMediaPipelineBusyProbe(() =>
    videoPool.inFlight > 0 || videoPool.pending > 0 ||
    imagePool.inFlight > 0 || imagePool.pending > 0 ||
    isIndexingFaces
  );
  startArchiveWorker(getPrimarySaveDirectory);

  if (process.env.NODE_ENV !== "production") {
    logger.info("Setting up Vite Development Server Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    logger.info("Serving static production resources...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.use((err: any, req: any, res: any, next: any) => {
    if (req.originalUrl.startsWith('/api/')) {
      logger.error("API Error: " + (err.message || err.toString()));
      res.status(500).json({ error: "Internal Server Error", details: err.message });
    } else {
      next(err);
    }
  });

  const hasCerts = fs.existsSync(path.join(process.cwd(), 'privkey.pem')) && fs.existsSync(path.join(process.cwd(), 'fullchain.pem'));

  if (hasCerts) {
    const privateKey = fs.readFileSync(path.join(process.cwd(), 'privkey.pem'), 'utf8');
    const certificate = fs.readFileSync(path.join(process.cwd(), 'fullchain.pem'), 'utf8');
    const credentials = { key: privateKey, cert: certificate };

    const httpsServer = https.createServer(credentials, app);
    httpsServer.listen(443, "0.0.0.0", () => {
      logger.info(`>>> HTTPS Server active on port 443 <<<`);
    });
    wss = new WebSocketServer({ server: httpsServer });
    logger.info("WebSocket server initialized (TLS)");

    const httpApp = express();
    httpApp.get('*', (req, res) => {
      res.redirect('https://' + req.headers.host + req.url);
    });
    httpApp.listen(80, "0.0.0.0", () => {
      logger.info(`>>> HTTP Redirect Server active on port 80 <<<`);
    });
  } else {
    const server = app.listen(PORT, "0.0.0.0", () => {
      const domainMsg = process.env.CUSTOM_DOMAIN ? ` (custom domain: ${process.env.CUSTOM_DOMAIN})` : '';
      logger.info(`>>> Full-Stack Express Server active on: http://localhost:${PORT}${domainMsg} <<<`);
    });
    wss = new WebSocketServer({ server });
    logger.info("WebSocket server initialized");
  }
}

startServer();
