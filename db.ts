import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';

let dbInstance: Database | null = null;
const dbPath = path.join(process.cwd(), 'database.sqlite');

export async function initDb(): Promise<Database> {
  if (dbInstance) return dbInstance;

  dbInstance = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Enable foreign keys
  await dbInstance.exec('PRAGMA foreign_keys = ON');
  await dbInstance.exec('PRAGMA journal_mode = WAL');

  // Migrations
  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      hostName TEXT,
      description TEXT,
      date TEXT,
      revealStyle TEXT,
      isRevealed BOOLEAN,
      imageLimit INTEGER,
      videoLimit INTEGER,
      maxVideoDuration INTEGER,
      saveDirectory TEXT,
      localSyncHost TEXT,
      localSyncEnabled BOOLEAN,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      adminId TEXT
    );

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      eventId TEXT NOT NULL,
      type TEXT NOT NULL,
      url TEXT NOT NULL,
      thumbnailUrl TEXT,
      guestName TEXT NOT NULL,
      filter TEXT,
      timestamp DATETIME,
      likes INTEGER DEFAULT 0,
      duration INTEGER,
      fileSize INTEGER,
      systemSavePath TEXT,
      mimeType TEXT,
      FOREIGN KEY(eventId) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_media_eventId ON media(eventId);

    CREATE TABLE IF NOT EXISTS admins (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      isSuperuser BOOLEAN DEFAULT 0
    );

  `);

  try {
    const tableInfo = await dbInstance.all("PRAGMA table_info(events)");
    if (!tableInfo.find(c => c.name === 'adminId')) {
      await dbInstance.exec('ALTER TABLE events ADD COLUMN adminId TEXT;');
    }
  } catch (e) {}
  try {
    const tableInfo = await dbInstance.all("PRAGMA table_info(events)");
    if (!tableInfo.find((c: any) => c.name === 'coverImage')) {
      await dbInstance.exec('ALTER TABLE events ADD COLUMN coverImage TEXT;');
    }
    if (!tableInfo.find((c: any) => c.name === 'couplePhoto')) {
      await dbInstance.exec('ALTER TABLE events ADD COLUMN couplePhoto TEXT;');
    }
  } catch (e) {}
  try {
    const tableInfo = await dbInstance.all("PRAGMA table_info(admins)");
    if (!tableInfo.find(c => c.name === 'isSuperuser')) {
      await dbInstance.exec('ALTER TABLE admins ADD COLUMN isSuperuser BOOLEAN DEFAULT 0;');
    }
  } catch (e) {}
  try {
    const mediaTableInfo = await dbInstance.all("PRAGMA table_info(media)");
    if (!mediaTableInfo.find((c: any) => c.name === 'fileHash')) {
      await dbInstance.exec('ALTER TABLE media ADD COLUMN fileHash TEXT;');
    }
  } catch (e) {}

  return dbInstance;
}

export async function getDb(): Promise<Database> {
  if (!dbInstance) {
    return await initDb();
  }
  return dbInstance;
}

export async function getAllEvents() {
  const db = await getDb();
  const summary = await db.all(`
    SELECT e.*,
      COUNT(m.id) as mediaCount,
      SUM(CASE WHEN m.type = 'photo' THEN 1 ELSE 0 END) as photoCount,
      SUM(CASE WHEN m.type = 'video' THEN 1 ELSE 0 END) as videoCount,
      COUNT(DISTINCT m.guestName) as uniqueGuests,
      SUM(m.fileSize) as spaceUsedBytes
    FROM events e
    LEFT JOIN media m ON e.id = m.eventId
    GROUP BY e.id
    ORDER BY e.createdAt DESC
  `);
  
  for (const event of summary) {
    event.isRevealed = Boolean(event.isRevealed);
    event.localSyncEnabled = Boolean(event.localSyncEnabled);
    
    event.stats = {
      photoCount: event.photoCount || 0,
      videoCount: event.videoCount || 0,
      uniqueGuests: event.uniqueGuests || 0,
      spaceUsedBytes: event.spaceUsedBytes || 0
    };
    
    delete event.photoCount;
    delete event.videoCount;
    delete event.uniqueGuests;
    delete event.spaceUsedBytes;
  }
  return summary;
}

export async function getEventById(id: string) {
  const db = await getDb();
  const event = await db.get('SELECT * FROM events WHERE id = ?', id);
  if (!event) return null;
  
  event.isRevealed = Boolean(event.isRevealed);
  event.localSyncEnabled = Boolean(event.localSyncEnabled);

  const stats = await db.get(`
    SELECT 
      COUNT(id) as mediaCount,
      SUM(CASE WHEN type = 'photo' THEN 1 ELSE 0 END) as photoCount,
      SUM(CASE WHEN type = 'video' THEN 1 ELSE 0 END) as videoCount,
      COUNT(DISTINCT guestName) as uniqueGuests,
      SUM(fileSize) as spaceUsedBytes
    FROM media WHERE eventId = ?`, id);

  event.mediaCount = stats.mediaCount || 0;
  event.stats = {
    photoCount: stats.photoCount || 0,
    videoCount: stats.videoCount || 0,
    uniqueGuests: stats.uniqueGuests || 0,
    spaceUsedBytes: stats.spaceUsedBytes || 0
  };
  return event;
}

export async function createOrUpdateEvent(eventData: any) {
  const db = await getDb();
  
  const ALLOWED_EVENT_FIELDS = ['id', 'name', 'hostName', 'description', 'date', 'revealStyle', 'isRevealed', 'imageLimit', 'videoLimit', 'maxVideoDuration', 'saveDirectory', 'localSyncHost', 'localSyncEnabled', 'createdAt', 'adminId', 'coverImage', 'couplePhoto'];
  const cleanData: any = {};
  for (const field of ALLOWED_EVENT_FIELDS) {
    if (eventData[field] !== undefined) {
      cleanData[field] = eventData[field];
    }
  }

  const existing = await db.get('SELECT id FROM events WHERE id = ?', cleanData.id);
  
  if (existing) {
    const fields = Object.keys(cleanData).filter(k => k !== 'id');
    if (fields.length === 0) return; // Nothing to update
    const setClause = fields.map(k => `${k} = ?`).join(', ');
    const values = fields.map(k => cleanData[k]);
    values.push(cleanData.id);
    
    await db.run(`UPDATE events SET ${setClause} WHERE id = ?`, values);
  } else {
    const fields = Object.keys(cleanData);
    const placeholders = fields.map(() => '?').join(', ');
    const values = fields.map(k => cleanData[k]);
    
    await db.run(`INSERT INTO events (${fields.join(', ')}) VALUES (${placeholders})`, values);
  }
}

export async function deleteEvent(id: string) {
  const db = await getDb();
  await db.run('DELETE FROM events WHERE id = ?', id);
}

export async function findDuplicateMedia(eventId: string, fileHash: string): Promise<any | null> {
  const db = await getDb();
  return db.get('SELECT * FROM media WHERE eventId = ? AND fileHash = ?', [eventId, fileHash]);
}

export async function getEventMedia(eventId: string, limit: number = 50, offset: number = 0) {
  const db = await getDb();
  return await db.all('SELECT * FROM media WHERE eventId = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?', [eventId, limit, offset]);
}

export async function createMedia(mediaItem: any) {
  const db = await getDb();
  const ALLOWED_MEDIA_FIELDS = ['id', 'eventId', 'type', 'url', 'thumbnailUrl', 'guestName', 'filter', 'timestamp', 'likes', 'duration', 'fileSize', 'systemSavePath', 'mimeType', 'fileHash'];
  const cleanData: any = {};
  for (const field of ALLOWED_MEDIA_FIELDS) {
    if (mediaItem[field] !== undefined) {
      cleanData[field] = mediaItem[field];
    }
  }

  const fields = Object.keys(cleanData);
  const placeholders = fields.map(() => '?').join(', ');
  const values = fields.map(k => cleanData[k]);
  
  await db.run(`INSERT INTO media (${fields.join(', ')}) VALUES (${placeholders})`, values);
}

export async function likeMedia(mediaId: string) {
  const db = await getDb();
  await db.run('UPDATE media SET likes = likes + 1 WHERE id = ?', mediaId);
  return await db.get('SELECT * FROM media WHERE id = ?', mediaId);
}

