/**
 * Two-tier media storage.
 *
 * Uploads always land on the fast local disk (D:\Wedding) so a guest's request
 * never waits on a USB/SATA bridge. A background worker later relocates those
 * originals to the external archive drive (F:\Wedding) — but only while the box
 * is idle, so the move never competes with an upload, a transcode or the face
 * indexer for disk and CPU.
 *
 * Layout is mirrored exactly: `<root>\<eventId>\<photos|videos>\<file>`. Because
 * the relative path is identical on both tiers, serving a file is just "try the
 * primary root, then the archive root" with no per-file bookkeeping.
 *
 * Thumbnails deliberately stay local. They are tiny and read constantly by the
 * album grid; pushing them behind an external bus would make browsing slower for
 * no meaningful space saving.
 *
 * If the archive drive is absent (unplugged, or F: not mounted yet) nothing
 * breaks: rows keep `archivedAt = NULL`, stay served from local, and get picked
 * up on a later pass once the drive is back.
 */
import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import * as db from "./db.js";
import { logger } from "./logger.js";

/* ─────────────────────────────  CONFIG  ───────────────────────────── */

function envInt(name: string, fallback: number): number {
  const parsed = parseInt(process.env[name] || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Destination root on the external drive. Empty string disables archiving. */
export const ARCHIVE_ROOT = (process.env.ARCHIVE_DIR || "F:\\Wedding").trim();

/** Master switch — set ARCHIVE_ENABLED=false to keep everything local. */
export const ARCHIVE_ENABLED = process.env.ARCHIVE_ENABLED !== "false" && ARCHIVE_ROOT.length > 0;

/** How often to look for work. */
const SCAN_INTERVAL_MS = envInt("ARCHIVE_SCAN_INTERVAL_MS", 2 * 60 * 1000);

/** Nothing may have been uploaded in this window before a move is allowed. */
const QUIET_PERIOD_MS = envInt("ARCHIVE_QUIET_MS", 90 * 1000);

/** A row must be at least this old — long enough for a background transcode to finish. */
const MIN_AGE_MS = envInt("ARCHIVE_MIN_AGE_MS", 5 * 60 * 1000);

/** Rows moved per pass. Small batches keep each pass interruptible. */
const BATCH_SIZE = envInt("ARCHIVE_BATCH_SIZE", 20);

/** Refuse to fill the archive drive completely. */
const FREE_SPACE_MARGIN_BYTES = envInt("ARCHIVE_FREE_MARGIN_MB", 2048) * 1024 * 1024;

/** CPU busy ratio (0-100) above which the box counts as "in use". */
const MAX_CPU_BUSY_PERCENT = envInt("ARCHIVE_MAX_CPU_PERCENT", 55);

/* ─────────────────────────  ACTIVITY TRACKING  ───────────────────────── */

let lastUploadAt = 0;
/** Called by the upload route so the worker knows guests are actively sending. */
export function noteUploadActivity(): void {
  lastUploadAt = Date.now();
}

/** Supplied by server.ts: true while any ffmpeg/sharp job is queued or running. */
type BusyProbe = () => boolean;
let isMediaPipelineBusy: BusyProbe = () => false;
export function setMediaPipelineBusyProbe(probe: BusyProbe): void {
  isMediaPipelineBusy = probe;
}

/** Sampled CPU busy percentage across all cores between two calls. */
let lastCpuSample: { idle: number; total: number } | null = null;

function sampleCpu(): { idle: number; total: number } {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const key of Object.keys(cpu.times) as Array<keyof typeof cpu.times>) {
      total += cpu.times[key];
    }
    idle += cpu.times.idle;
  }
  return { idle, total };
}

function cpuBusyPercent(): number {
  const current = sampleCpu();
  const previous = lastCpuSample;
  lastCpuSample = current;
  if (!previous) return 0; // First call has no delta to compare against.
  const idleDelta = current.idle - previous.idle;
  const totalDelta = current.total - previous.total;
  if (totalDelta <= 0) return 0;
  return Math.max(0, Math.min(100, 100 - (idleDelta / totalDelta) * 100));
}

/* ─────────────────────────────  HELPERS  ───────────────────────────── */

/** True when the archive drive is mounted and writable. */
export async function isArchiveDriveMounted(): Promise<boolean> {
  if (!ARCHIVE_ENABLED) return false;
  const driveRoot = path.parse(path.resolve(ARCHIVE_ROOT)).root;
  try {
    // Check the volume first: a missing drive letter must not create a folder.
    await fsp.access(driveRoot, fs.constants.W_OK);
  } catch {
    return false;
  }
  try {
    await fsp.mkdir(ARCHIVE_ROOT, { recursive: true });
    return true;
  } catch (err: any) {
    logger.warn(`Archive root ${ARCHIVE_ROOT} is not writable: ${err?.message || err}`);
    return false;
  }
}

async function archiveDriveReady(): Promise<boolean> {
  return await isArchiveDriveMounted();
}

async function freeBytesOn(target: string): Promise<number> {
  try {
    const stats = await fsp.statfs(path.parse(path.resolve(target)).root);
    return stats.bavail * stats.bsize;
  } catch {
    return Number.MAX_SAFE_INTEGER; // Unknown — let the copy itself fail instead.
  }
}

/**
 * Maps a file under the primary root onto the archive root, keeping the relative
 * path. Returns null when the file is not inside the primary root at all (a
 * legacy path, or already archived), because guessing would risk writing outside
 * the intended folder.
 */
export function archivePathFor(sourcePath: string, primaryRoot: string): string | null {
  const source = path.resolve(sourcePath);
  const root = path.resolve(primaryRoot);
  const relative = path.relative(root, source);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return path.join(path.resolve(ARCHIVE_ROOT), relative);
}

/** Copy + fsync + rename + unlink. Never leaves a half-written file in place. */
async function relocate(from: string, to: string): Promise<void> {
  await fsp.mkdir(path.dirname(to), { recursive: true });
  const staging = `${to}.part`;
  await fsp.rm(staging, { force: true }).catch(() => {});
  await fsp.copyFile(from, staging);

  // Force the bytes to the platter before the original is deleted — otherwise a
  // power cut between copy and unlink can lose the only copy of a guest's photo.
  const handle = await fsp.open(staging, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }

  const sourceStat = await fsp.stat(from);
  const copyStat = await fsp.stat(staging);
  if (copyStat.size !== sourceStat.size) {
    await fsp.rm(staging, { force: true }).catch(() => {});
    throw new Error(`size mismatch after copy (${copyStat.size} vs ${sourceStat.size})`);
  }

  await fsp.rename(staging, to);
  await fsp.unlink(from);
}

/* ─────────────────────────────  THE WORKER  ───────────────────────────── */

export interface ArchiveIdleState {
  idle: boolean;
  reason: string;
  cpuBusyPercent: number;
  quietForMs: number;
}

/** Why the worker is or is not allowed to move files right now. */
export function idleState(): ArchiveIdleState {
  const busy = cpuBusyPercent();
  const quietForMs = lastUploadAt === 0 ? Number.MAX_SAFE_INTEGER : Date.now() - lastUploadAt;

  if (isMediaPipelineBusy()) {
    return { idle: false, reason: "media pipeline busy", cpuBusyPercent: busy, quietForMs };
  }
  if (quietForMs < QUIET_PERIOD_MS) {
    return { idle: false, reason: "recent upload activity", cpuBusyPercent: busy, quietForMs };
  }
  if (busy > MAX_CPU_BUSY_PERCENT) {
    return { idle: false, reason: `cpu at ${busy.toFixed(0)}%`, cpuBusyPercent: busy, quietForMs };
  }
  return { idle: true, reason: "idle", cpuBusyPercent: busy, quietForMs };
}

let running = false;
let lastRunSummary = "never run";

export function getArchiveStatusSummary(): string {
  return lastRunSummary;
}

/**
 * Moves one batch of eligible originals to the archive drive.
 * `force` skips the idle check (used by the admin "archive now" button).
 * Returns how many files were relocated.
 */
export async function runArchivePass(
  primaryRootResolver: () => Promise<string | undefined>,
  options: { force?: boolean } = {}
): Promise<{ moved: number; skipped: number; reason?: string }> {
  if (!ARCHIVE_ENABLED) return { moved: 0, skipped: 0, reason: "archiving disabled" };
  if (running) return { moved: 0, skipped: 0, reason: "already running" };

  if (!options.force) {
    const state = idleState();
    if (!state.idle) return { moved: 0, skipped: 0, reason: state.reason };
  }

  running = true;
  let moved = 0;
  let skipped = 0;

  try {
    const primaryRoot = await primaryRootResolver();
    if (!primaryRoot) {
      lastRunSummary = "no primary save directory configured";
      return { moved: 0, skipped: 0, reason: lastRunSummary };
    }

    if (!(await archiveDriveReady())) {
      lastRunSummary = `archive drive ${ARCHIVE_ROOT} not available`;
      return { moved: 0, skipped: 0, reason: lastRunSummary };
    }

    const pending = await db.getPendingArchiveMedia(BATCH_SIZE);
    if (!pending.length) {
      lastRunSummary = "nothing pending";
      return { moved: 0, skipped: 0 };
    }

    let freeBytes = await freeBytesOn(ARCHIVE_ROOT);

    for (const media of pending) {
      // Re-check idleness between files so a guest uploading mid-pass wins.
      if (!options.force && !idleState().idle) {
        skipped++;
        break;
      }

      const ageMs = Date.now() - new Date(media.timestamp || 0).getTime();
      if (ageMs < MIN_AGE_MS) { skipped++; continue; }

      const source = media.systemSavePath;
      if (!source || !fs.existsSync(source)) {
        // The file is gone (deleted, or moved by hand). Mark it done so the
        // queue doesn't retry it forever.
        await db.markMediaArchived(media.id, source || "", source || "");
        skipped++;
        continue;
      }

      const destination = archivePathFor(source, primaryRoot);
      if (!destination) { skipped++; continue; }

      let size = 0;
      try {
        size = (await fsp.stat(source)).size;
      } catch { skipped++; continue; }

      if (freeBytes - size < FREE_SPACE_MARGIN_BYTES) {
        lastRunSummary = `archive drive low on space (${(freeBytes / 1024 ** 3).toFixed(1)} GB free)`;
        logger.warn(lastRunSummary);
        break;
      }

      try {
        await relocate(source, destination);
        await db.markMediaArchived(media.id, destination, source);
        freeBytes -= size;
        moved++;
      } catch (err: any) {
        skipped++;
        logger.warn(`Archive move failed for media ${media.id}: ${err?.message || err}`);
      }
    }

    const stillPending = await db.countPendingArchiveMedia();
    lastRunSummary = `moved ${moved}, skipped ${skipped}, ${stillPending} still local`;
    if (moved > 0) logger.info(`Archive pass: ${lastRunSummary} → ${ARCHIVE_ROOT}`);
    return { moved, skipped };
  } finally {
    running = false;
  }
}

/** Starts the periodic worker. Safe to call once at boot. */
export function startArchiveWorker(primaryRootResolver: () => Promise<string | undefined>): void {
  if (!ARCHIVE_ENABLED) {
    logger.info("Tiered archive disabled (ARCHIVE_ENABLED=false or empty ARCHIVE_DIR).");
    return;
  }
  logger.info(
    `Tiered archive enabled → ${ARCHIVE_ROOT} ` +
    `(scan ${Math.round(SCAN_INTERVAL_MS / 1000)}s, quiet ${Math.round(QUIET_PERIOD_MS / 1000)}s, ` +
    `min age ${Math.round(MIN_AGE_MS / 1000)}s, batch ${BATCH_SIZE})`
  );
  cpuBusyPercent(); // Prime the delta so the first real sample is meaningful.
  setInterval(() => {
    void runArchivePass(primaryRootResolver).catch(err =>
      logger.warn(`Archive pass error: ${err?.message || err}`)
    );
  }, SCAN_INTERVAL_MS).unref();
}
