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

  /* ─────────────────────  SQLITE PERFORMANCE PRAGMAS  ─────────────────────
   * Defaults are tuned for tiny embedded devices. On a 16 GB laptop we can
   * afford a real page cache and memory-mapped reads, which is what removes the
   * per-query disk hits when 20 guests poll the album at once.
   *   synchronous=NORMAL  — with WAL this is crash-safe (an OS crash can lose
   *                         the last commit, not corrupt the file); FULL fsyncs
   *                         on every single insert.
   *   cache_size=-131072  — negative means KiB, so 128 MB of page cache.
   *   mmap_size=512MB     — reads served straight from the page cache.
   *   busy_timeout        — wait instead of throwing SQLITE_BUSY when the
   *                         face indexer and an upload commit collide.
   */
  const CACHE_KIB = parseInt(process.env.SQLITE_CACHE_KIB || '') || 131072;
  const MMAP_BYTES = parseInt(process.env.SQLITE_MMAP_BYTES || '') || 512 * 1024 * 1024;
  await dbInstance.exec(`
    PRAGMA synchronous = NORMAL;
    PRAGMA cache_size = -${CACHE_KIB};
    PRAGMA mmap_size = ${MMAP_BYTES};
    PRAGMA temp_store = MEMORY;
    PRAGMA busy_timeout = 8000;
    PRAGMA wal_autocheckpoint = 2000;
  `);

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

    -- Public "gift / card details" page shown to guests who want to send a gift.
    CREATE TABLE IF NOT EXISTS gift_cards (
      eventId TEXT PRIMARY KEY,
      enabled BOOLEAN DEFAULT 1,
      title TEXT,
      intro TEXT,
      cardNumber TEXT,
      cardHolder TEXT,
      iban TEXT,
      bankName TEXT,
      note TEXT,
      updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(eventId) REFERENCES events(id) ON DELETE CASCADE
    );

    -- Gift receipts submitted by guests (screenshot + message). Admin-only visibility.
    CREATE TABLE IF NOT EXISTS gift_receipts (
      id TEXT PRIMARY KEY,
      eventId TEXT NOT NULL,
      senderName TEXT,
      message TEXT,
      amount TEXT,
      imageUrl TEXT,
      systemSavePath TEXT,
      mimeType TEXT,
      fileSize INTEGER,
      seen BOOLEAN DEFAULT 0,
      timestamp DATETIME,
      FOREIGN KEY(eventId) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_gift_receipts_eventId ON gift_receipts(eventId);
    CREATE INDEX IF NOT EXISTS idx_media_event_time ON media(eventId, timestamp DESC);
    -- Backs the per-guest "my uploads" query.
    CREATE INDEX IF NOT EXISTS idx_media_event_guest_time ON media(eventId, guestName, timestamp DESC);
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
    // Two-tier storage: originals land on the fast local disk and are relocated
    // to the external archive drive when the box is idle. NULL = still local.
    if (!mediaTableInfo.find((c: any) => c.name === 'archivedAt')) {
      await dbInstance.exec('ALTER TABLE media ADD COLUMN archivedAt DATETIME;');
    }
    // Where the file lived before it was archived, so a missing external drive
    // can be diagnosed (and so we never lose the original location).
    if (!mediaTableInfo.find((c: any) => c.name === 'localSavePath')) {
      await dbInstance.exec('ALTER TABLE media ADD COLUMN localSavePath TEXT;');
    }
  } catch (e) {}

  try {
    // Created after the ALTER TABLE block above: on a brand-new database the
    // media table is made without fileHash, so indexing it inline would fail.
    await dbInstance.exec(
      'CREATE INDEX IF NOT EXISTS idx_media_hash ON media(eventId, fileHash);'
    );
    await dbInstance.exec(
      'CREATE INDEX IF NOT EXISTS idx_media_archive_queue ON media(archivedAt, timestamp);'
    );
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

/** Everything one guest uploaded, newest first — powers their "my uploads" list. */
export async function getGuestMedia(eventId: string, guestName: string, limit: number = 200) {
  const db = await getDb();
  return await db.all(
    'SELECT * FROM media WHERE eventId = ? AND guestName = ? ORDER BY timestamp DESC LIMIT ?',
    [eventId, guestName, limit]
  );
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

export async function getMediaById(mediaId: string) {
  const db = await getDb();
  return await db.get('SELECT * FROM media WHERE id = ?', mediaId);
}

/**
 * Patches an existing media row through the same whitelist used by createMedia.
 * Needed by the background video transcode, which swaps `url`/`fileSize` after
 * the upload response has already been sent.
 */
export async function updateMedia(mediaId: string, patch: any) {
  const db = await getDb();
  const UPDATABLE_MEDIA_FIELDS = ['url', 'thumbnailUrl', 'duration', 'fileSize', 'systemSavePath', 'mimeType', 'archivedAt', 'localSavePath'];
  const fields: string[] = [];
  const values: any[] = [];
  for (const field of UPDATABLE_MEDIA_FIELDS) {
    if (patch[field] !== undefined) {
      fields.push(`${field} = ?`);
      values.push(patch[field]);
    }
  }
  if (!fields.length) return await getMediaById(mediaId);
  values.push(mediaId);
  await db.run(`UPDATE media SET ${fields.join(', ')} WHERE id = ?`, values);
  return await getMediaById(mediaId);
}

/* ─────────────────────────  TIERED ARCHIVE QUEUE  ─────────────────────────
 * Files are written to the fast local disk on upload and relocated to the
 * external archive drive later, when nothing else needs the CPU or the disk.
 * `archivedAt IS NULL` is the queue.
 */

/** Oldest-first batch of rows still sitting on the local disk. */
export async function getPendingArchiveMedia(limit: number = 25) {
  const db = await getDb();
  return await db.all(
    `SELECT * FROM media
       WHERE archivedAt IS NULL AND systemSavePath IS NOT NULL AND systemSavePath <> ''
       ORDER BY timestamp ASC
       LIMIT ?`,
    [limit]
  );
}

export async function countPendingArchiveMedia(): Promise<number> {
  const db = await getDb();
  const row = await db.get(
    `SELECT COUNT(id) AS pending FROM media
       WHERE archivedAt IS NULL AND systemSavePath IS NOT NULL AND systemSavePath <> ''`
  );
  return row?.pending || 0;
}

/** Totals for the admin storage widget. */
export async function getArchiveStats() {
  const db = await getDb();
  const row = await db.get(`
    SELECT
      COUNT(id) AS total,
      SUM(CASE WHEN archivedAt IS NOT NULL THEN 1 ELSE 0 END) AS archived,
      SUM(CASE WHEN archivedAt IS NULL THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN archivedAt IS NOT NULL THEN COALESCE(fileSize, 0) ELSE 0 END) AS archivedBytes,
      SUM(CASE WHEN archivedAt IS NULL THEN COALESCE(fileSize, 0) ELSE 0 END) AS pendingBytes
    FROM media
  `);
  return {
    total: row?.total || 0,
    archived: row?.archived || 0,
    pending: row?.pending || 0,
    archivedBytes: row?.archivedBytes || 0,
    pendingBytes: row?.pendingBytes || 0,
  };
}

/**
 * Records a completed relocation. `localSavePath` keeps the old location so a
 * later "restore to local" (or a diagnostic) knows where the file came from.
 */
export async function markMediaArchived(mediaId: string, newPath: string, previousPath: string) {
  const db = await getDb();
  await db.run(
    'UPDATE media SET systemSavePath = ?, localSavePath = ?, archivedAt = ? WHERE id = ?',
    [newPath, previousPath, new Date().toISOString(), mediaId]
  );
  return await getMediaById(mediaId);
}

/* ─────────────────────────  GIFT CARD DETAILS  ───────────────────────── */

const GIFT_CARD_FIELDS = [
  'eventId', 'enabled', 'title', 'intro', 'cardNumber',
  'cardHolder', 'iban', 'bankName', 'note'
];

export async function getGiftCard(eventId: string) {
  const db = await getDb();
  const row = await db.get('SELECT * FROM gift_cards WHERE eventId = ?', eventId);
  if (!row) return null;
  row.enabled = Boolean(row.enabled);
  return row;
}

export async function upsertGiftCard(data: any) {
  const db = await getDb();
  const clean: any = {};
  for (const field of GIFT_CARD_FIELDS) {
    if (data[field] !== undefined) {
      clean[field] = typeof data[field] === 'boolean' ? (data[field] ? 1 : 0) : data[field];
    }
  }
  if (!clean.eventId) throw new Error('eventId is required');

  const existing = await db.get('SELECT eventId FROM gift_cards WHERE eventId = ?', clean.eventId);
  if (existing) {
    const fields = Object.keys(clean).filter(k => k !== 'eventId');
    if (fields.length === 0) return getGiftCard(clean.eventId);
    const setClause = [...fields.map(k => `${k} = ?`), 'updatedAt = CURRENT_TIMESTAMP'].join(', ');
    await db.run(
      `UPDATE gift_cards SET ${setClause} WHERE eventId = ?`,
      [...fields.map(k => clean[k]), clean.eventId]
    );
  } else {
    const fields = Object.keys(clean);
    await db.run(
      `INSERT INTO gift_cards (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
      fields.map(k => clean[k])
    );
  }
  return getGiftCard(clean.eventId);
}

/* ─────────────────────────  GIFT RECEIPTS  ───────────────────────── */

const GIFT_RECEIPT_FIELDS = [
  'id', 'eventId', 'senderName', 'message', 'amount', 'imageUrl',
  'systemSavePath', 'mimeType', 'fileSize', 'seen', 'timestamp'
];

export async function createGiftReceipt(receipt: any) {
  const db = await getDb();
  const clean: any = {};
  for (const field of GIFT_RECEIPT_FIELDS) {
    if (receipt[field] !== undefined) {
      clean[field] = typeof receipt[field] === 'boolean' ? (receipt[field] ? 1 : 0) : receipt[field];
    }
  }
  const fields = Object.keys(clean);
  await db.run(
    `INSERT INTO gift_receipts (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`,
    fields.map(k => clean[k])
  );
  return getGiftReceipt(clean.id);
}

export async function getGiftReceipt(id: string) {
  const db = await getDb();
  const row = await db.get('SELECT * FROM gift_receipts WHERE id = ?', id);
  if (row) row.seen = Boolean(row.seen);
  return row || null;
}

export async function getGiftReceipts(eventId: string, limit = 200, offset = 0) {
  const db = await getDb();
  const rows = await db.all(
    'SELECT * FROM gift_receipts WHERE eventId = ? ORDER BY timestamp DESC LIMIT ? OFFSET ?',
    [eventId, limit, offset]
  );
  return rows.map((r: any) => ({ ...r, seen: Boolean(r.seen) }));
}

export async function countGiftReceipts(eventId: string) {
  const db = await getDb();
  const row = await db.get(
    'SELECT COUNT(id) as total, SUM(CASE WHEN seen = 0 THEN 1 ELSE 0 END) as unseen FROM gift_receipts WHERE eventId = ?',
    eventId
  );
  return { total: row?.total || 0, unseen: row?.unseen || 0 };
}

export async function markGiftReceiptSeen(id: string, seen: boolean) {
  const db = await getDb();
  await db.run('UPDATE gift_receipts SET seen = ? WHERE id = ?', [seen ? 1 : 0, id]);
  return getGiftReceipt(id);
}

export async function deleteGiftReceipt(id: string) {
  const db = await getDb();
  await db.run('DELETE FROM gift_receipts WHERE id = ?', id);
}

