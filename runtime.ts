/**
 * Hardware-derived runtime tuning.
 *
 * This module MUST be imported before `sharp`, `sqlite3` or anything else that
 * touches libuv's thread pool: `UV_THREADPOOL_SIZE` is read the first time the
 * pool is used, so setting it later has no effect. It loads dotenv itself
 * (readFileSync, no pool involvement) so values from `.env` still win.
 *
 * Every number below is a default derived from the box we are actually running
 * on and can be overridden with an env var, which is what makes it safe to be
 * more aggressive than the previous hardcoded "assume a tiny VPS" values.
 */
import "dotenv/config";
import os from "os";

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function envInt(name: string, fallback: number): number {
  const parsed = parseInt(process.env[name] || "");
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Logical processors (12 on the Ryzen 5 5500U this runs on). */
export const LOGICAL_CPUS = Math.max(1, os.cpus().length);

/**
 * Physical cores. Node has no direct API, so assume SMT when the logical count
 * is even — wrong only on exotic hardware, and the fallback is conservative.
 */
export const PHYSICAL_CORES = LOGICAL_CPUS % 2 === 0 ? LOGICAL_CPUS / 2 : LOGICAL_CPUS;

export const TOTAL_MEM_GB = os.totalmem() / (1024 ** 3);

/**
 * libuv thread pool: backs fs operations, crypto (our SHA-256 upload hashing)
 * and sqlite3. The default of 4 is the real ceiling when a dozen guests upload
 * at once — every hash and every file move queues behind those four slots.
 */
export const UV_THREADPOOL_SIZE = envInt("UV_THREADPOOL_SIZE", clamp(LOGICAL_CPUS, 4, 24));
process.env.UV_THREADPOOL_SIZE = String(UV_THREADPOOL_SIZE);

/**
 * Concurrent sharp jobs. Photos are cheap and latency-sensitive, so we let half
 * the logical CPUs work on them.
 */
export const IMAGE_JOBS = envInt("MAX_IMAGE_JOBS", clamp(Math.round(LOGICAL_CPUS / 2), 2, 8));

/**
 * Concurrent ffmpeg jobs. Bounded by physical cores rather than threads because
 * x264 saturates real cores; two hyperthreads on one core do not transcode
 * twice as fast, they just double the memory pressure.
 */
export const VIDEO_JOBS = envInt("MAX_VIDEO_JOBS", clamp(Math.floor(PHYSICAL_CORES / 2), 1, 4));

/** Threads handed to each ffmpeg process so N jobs still fit in the CPU. */
export const FFMPEG_THREADS = envInt("FFMPEG_THREADS", clamp(Math.floor(LOGICAL_CPUS / VIDEO_JOBS), 1, 8));

/**
 * libvips threads per sharp operation. IMAGE_JOBS × this should land near the
 * logical CPU count, not far above it.
 */
export const SHARP_CONCURRENCY = envInt("SHARP_CONCURRENCY", clamp(Math.floor(LOGICAL_CPUS / IMAGE_JOBS), 1, 4));

/**
 * libvips operation cache in MB. The old value was 64 MB, which is nothing on a
 * 16 GB laptop; a bigger cache means repeated thumbnail requests for the same
 * originals skip decoding entirely. The *file* cache stays at 0 on purpose —
 * cached descriptors keep Windows file handles open and block deletion.
 */
export const SHARP_CACHE_MB = envInt("SHARP_CACHE_MB", clamp(Math.round(TOTAL_MEM_GB * 24), 64, 512));

/**
 * Threads for the InsightFace/onnxruntime child process. Physical cores minus
 * one so the face indexer — which only ever runs when no media job is in
 * flight — still leaves a core for the web server.
 */
export const FACE_INDEX_THREADS = envInt("FACE_INDEX_THREADS", clamp(PHYSICAL_CORES - 1, 1, 8));

export function describeRuntimeTuning(): string {
  return [
    `cpus=${LOGICAL_CPUS} (≈${PHYSICAL_CORES} cores)`,
    `ram=${TOTAL_MEM_GB.toFixed(1)}GB`,
    `uvThreads=${UV_THREADPOOL_SIZE}`,
    `imageJobs=${IMAGE_JOBS}`,
    `videoJobs=${VIDEO_JOBS}`,
    `ffmpegThreads=${FFMPEG_THREADS}`,
    `sharpConcurrency=${SHARP_CONCURRENCY}`,
    `sharpCache=${SHARP_CACHE_MB}MB`,
    `faceThreads=${FACE_INDEX_THREADS}`,
  ].join(" ");
}
