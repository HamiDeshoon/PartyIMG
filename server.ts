import express from "express";
import path from "path";
import fs from "fs";
import https from "https";
import http from "http";
import { createServer as createViteServer } from "vite";
import { fileURLToPath } from "url";
import multer from "multer";
import { v4 as uuidv4 } from "uuid";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pinoHttp from "pino-http";
import session from "express-session";
import bcrypt from "bcryptjs";
import cors from "cors";
import * as db from "./db.js";
import { logger } from "./logger.js";
import { getStorageProvider } from "./storage.js";

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
const PORT = 3000;

// Storage abstraction
const storageProvider = getStorageProvider();
storageProvider.init();

// Admin setup: Seed a default admin on startup or update password.
async function setupAdmin() {
  const sqlite = await db.getDb();
  const username = process.env.ADMIN_USERNAME || 'Theomainie';
  const password = process.env.ADMIN_PASSWORD || '19981998';
  const hash = await bcrypt.hash(password, 10);
  
  const admin = await sqlite.get('SELECT * FROM admins WHERE username = ?', username);
  if (!admin) {
    await sqlite.run('INSERT INTO admins (id, username, passwordHash, isSuperuser) VALUES (?, ?, ?, 1)', uuidv4(), username, hash);
    logger.info(`Superuser admin created. Login with username: ${username}`);
  } else {
    // Sync password from environment variable
    await sqlite.run('UPDATE admins SET passwordHash = ?, isSuperuser = 1 WHERE username = ?', hash, username);
  }
}

// Seed a quick-join 'test' event for user demonstration and diagnostic purposes
async function setupTestEvent() {
  const sqlite = await db.getDb();
  const testEvent = await sqlite.get('SELECT id FROM events WHERE id = ?', 'test');
  if (!testEvent) {
    await db.createOrUpdateEvent({
      id: "test",
      name: "مراسم تست مجلل (Test Event)",
      hostName: "تیم توسعه PartyIMG",
      description: "این مراسم برای تست آسان ویژگی‌های کاربری و فیلترهای نوستالژیک طراحی شده است.",
      date: new Date().toISOString().split('T')[0],
      revealStyle: "instant",
      isRevealed: true,
      imageLimit: 0,
      videoLimit: 0,
      maxVideoDuration: 30,
      saveDirectory: "./uploads",
      localSyncHost: "http://localhost:8080",
      localSyncEnabled: false
    });
    logger.info("Universal quick-join 'test' event has been provisioned.");
  }
}

// Ensure Uploads folder
const uploadsBaseDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadsBaseDir)) fs.mkdirSync(uploadsBaseDir, { recursive: true });

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

app.use("/uploads", express.static(uploadsBaseDir, { maxAge: "30d" }));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsBaseDir);
  },
  filename: (req, file, cb) => {
    cb(null, `temp-${Date.now()}-${uuidv4()}`);
  }
});
const uploadParams = multer({
  storage,
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/heic', 'video/mp4', 'video/quicktime'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, HEIC, MP4, MOV allowed.'));
    }
  }
});

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

// Multipart streaming upload
import sharp from "sharp";

app.post("/api/events/:id/upload/streaming", uploadParams.single('fileData'), async (req, res, next) => {
  try {
    const eventId = req.params.id;
    const event = await db.getEventById(eventId);
    if (!event) return res.status(404).json({ error: "Event not found" });

    if (!req.file) return res.status(400).json({ error: "No valid file uploaded." });

    const guestName = req.body.guestName || "Anonymous";
    const type = req.file.mimetype.startsWith('video') ? 'video' : 'photo';
    const filter = req.body.filter || "none";
    const duration = parseInt(req.body.duration) || 0;

    if (type === 'photo' && req.file.size > 20 * 1024 * 1024) {
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Photo exceeds 20MB limit." });
    }

    let thumbnailUrl;
    if (type === 'photo') {
      try {
        const thumbBuffer = await sharp(req.file.path)
          .resize({ width: 600, withoutEnlargement: true })
          .webp({ quality: 80 })
          .toBuffer();
          
        const thumbSave = await storageProvider.saveFile(
            null, eventId, type, `thumb-${req.file.originalname}.webp`, thumbBuffer
        );
        thumbnailUrl = thumbSave.url;
      } catch (err) {
        logger.error("Failed to generate thumbnail: " + err);
      }
    }

    const { url: publicUrl, systemSavePath } = await storageProvider.saveFile(
        req.file, eventId, type, req.file.originalname
    );

    if (!thumbnailUrl) thumbnailUrl = publicUrl;

    // Clean up temp file if storageProvider didn't move it
    if (fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    const mediaItem = {
      id: uuidv4(),
      eventId,
      type,
      url: publicUrl,
      thumbnailUrl,
      guestName,
      filter,
      timestamp: new Date().toISOString(),
      likes: 0,
      duration,
      fileSize: req.file.size,
      systemSavePath,
      mimeType: req.file.mimetype
    };

    await db.createMedia(mediaItem);
    res.json(mediaItem);
  } catch (err: any) {
    if (err.message && err.message.includes('Invalid file type')) return res.status(400).json({ error: err.message });
    next(err);
  }
});

app.delete("/api/events/:eventId/media/:mediaId", async (req: any, res: any, next: any) => {
  try {
    const { eventId, mediaId } = req.params;
    const guestName = req.body.guestName;
    const isAdmin = req.session && req.session.adminId;

    const sqlite = await db.getDb();
    const media = await sqlite.get('SELECT * FROM media WHERE id = ? AND eventId = ?', mediaId, eventId);
    
    if (!media) return res.status(404).json({ error: "Media not found" });

    if (!isAdmin && media.guestName !== guestName) {
      return res.status(403).json({ error: "Unauthorized to delete this media" });
    }

    await sqlite.run('DELETE FROM media WHERE id = ?', mediaId);
    
    await storageProvider.deleteFile(media.url, media.systemSavePath, eventId, media.type);
    
    res.json({ success: true });
  } catch (err) { next(err); }
});

app.post("/api/events/:eventId/media/:mediaId/like", async (req, res, next) => {
  try {
    const media = await db.likeMedia(req.params.mediaId);
    res.json(media);
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

app.use((err: any, req: any, res: any, next: any) => {
  logger.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
});

// --- VITE DEV / PRODUCTION FLOW ---

async function startServer() {
  await db.initDb();
  await setupAdmin();
  await setupTestEvent();

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

    const httpApp = express();
    httpApp.get('*', (req, res) => {
      res.redirect('https://' + req.headers.host + req.url);
    });
    httpApp.listen(80, "0.0.0.0", () => {
      logger.info(`>>> HTTP Redirect Server active on port 80 <<<`);
    });
  } else {
    app.listen(PORT, "0.0.0.0", () => {
      logger.info(`>>> Full-Stack Express Server active on: http://localhost:${PORT} <<<`);
    });
  }
}

startServer();
