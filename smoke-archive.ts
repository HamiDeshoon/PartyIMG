/**
 * Temporary smoke test for the two-tier mover. Run with cwd set to a scratch
 * folder so it creates its own database.sqlite and never touches the real one.
 *
 *   ARCHIVE_DIR=... tsx D:\Gits\PartyIMG\smoke-archive.ts
 */
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import * as db from "./db.js";
import { ARCHIVE_ROOT, ARCHIVE_ALWAYS_TRANSFER, archivePathFor, noteUploadActivity, runArchivePass, idleState } from "./archive.js";

const PRIMARY = process.env.SMOKE_PRIMARY!;
const EVENT_ID = "smoke-event";

function ok(label: string, condition: boolean) {
  console.log(`${condition ? "PASS" : "FAIL"}  ${label}`);
  if (!condition) process.exitCode = 1;
}

async function main() {
  await db.initDb();
  const sqlite = await db.getDb();

  await sqlite.run(
    `INSERT OR REPLACE INTO events (id, name, saveDirectory) VALUES (?, ?, ?)`,
    [EVENT_ID, "Smoke", PRIMARY]
  );

  // A real-looking original on the local tier.
  const photoDir = path.join(PRIMARY, EVENT_ID, "photos");
  await fsp.mkdir(photoDir, { recursive: true });
  const sourcePath = path.join(photoDir, "media-smoke-1.jpg");
  const payload = Buffer.alloc(1024 * 512, 7);
  await fsp.writeFile(sourcePath, payload);

  const mediaId = "smoke-media-1";
  await sqlite.run(
    `INSERT OR REPLACE INTO media (id, eventId, guestName, type, url, systemSavePath, fileSize, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [mediaId, EVENT_ID, "Smoke Guest", "photo",
     `/uploads/${EVENT_ID}/photos/media-smoke-1.jpg`, sourcePath, payload.length,
     new Date(Date.now() - 60 * 60 * 1000).toISOString()]
  );

  ok("row starts unarchived", (await db.countPendingArchiveMedia()) === 1);

  const expected = archivePathFor(sourcePath, PRIMARY);
  ok("archivePathFor mirrors the relative layout",
    expected === path.join(path.resolve(ARCHIVE_ROOT), EVENT_ID, "photos", "media-smoke-1.jpg"));
  ok("archivePathFor rejects paths outside the primary root",
    archivePathFor("C:\\Windows\\notepad.exe", PRIMARY) === null);

  if (ARCHIVE_ALWAYS_TRANSFER) {
    // In continuous mode the idle gate is bypassed — noteUploadActivity does NOT block a pass.
    console.log("PASS  idle gate (continuous mode — gate bypassed by design)");
    // A normal pass moves immediately without force.
    const immediate = await runArchivePass(async () => PRIMARY);
    ok(`continuous pass moved the file immediately (moved=${immediate.moved} skipped=${immediate.skipped})`, immediate.moved === 1);
  } else {
    // Idle gate: a fresh upload must block the worker.
    noteUploadActivity();
    const blocked = await runArchivePass(async () => PRIMARY);
    ok(`idle gate holds the pass off (${blocked.reason})`, blocked.moved === 0 && !idleState().idle);
    ok("file is still on the local tier", fs.existsSync(sourcePath));

    // Forced pass = the admin "archive now" button.
    const forced = await runArchivePass(async () => PRIMARY, { force: true });
    ok(`forced pass moved the file (moved=${forced.moved} skipped=${forced.skipped})`, forced.moved === 1);
  }
  ok("original removed from local tier", !fs.existsSync(sourcePath));
  ok("copy exists on archive tier", fs.existsSync(expected!));
  ok("no .part staging file left behind", !fs.existsSync(`${expected}.part`));

  const archivedBytes = (await fsp.stat(expected!)).size;
  ok(`archived size matches (${archivedBytes})`, archivedBytes === payload.length);
  ok("archived bytes are identical", Buffer.compare(await fsp.readFile(expected!), payload) === 0);

  const row = await db.getMediaById(mediaId);
  ok("systemSavePath now points at the archive", row.systemSavePath === expected);
  ok("localSavePath remembers the old location", row.localSavePath === sourcePath);
  ok("archivedAt is set", !!row.archivedAt);
  ok("queue is now empty", (await db.countPendingArchiveMedia()) === 0);

  const stats = await db.getArchiveStats();
  ok(`stats report one archived file (${JSON.stringify(stats)})`, stats.archived === 1 && stats.pending === 0);

  // A vanished file must be retired from the queue instead of retried forever.
  const ghostPath = path.join(photoDir, "media-smoke-ghost.jpg");
  await sqlite.run(
    `INSERT OR REPLACE INTO media (id, eventId, guestName, type, url, systemSavePath, fileSize, timestamp)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ["smoke-media-ghost", EVENT_ID, "Smoke Guest", "photo",
     `/uploads/${EVENT_ID}/photos/media-smoke-ghost.jpg`, ghostPath, 10,
     new Date(Date.now() - 60 * 60 * 1000).toISOString()]
  );
  await runArchivePass(async () => PRIMARY, { force: true });
  ok("missing file is retired from the queue", (await db.countPendingArchiveMedia()) === 0);

  console.log(process.exitCode ? "SMOKE FAILED" : "SMOKE OK");
}

main().catch(err => { console.error(err); process.exit(1); });
