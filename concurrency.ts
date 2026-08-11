/**
 * Tiny dependency-free concurrency primitives used to keep the upload
 * pipeline stable when many guests upload photos and videos at the same time.
 *
 * Without a limiter, N simultaneous video uploads spawn N ffmpeg processes
 * (each happily using every CPU core) which starves the event loop, times out
 * requests and can push the box into swap. The semaphore below caps how many
 * heavy jobs may run at once; everything else waits its turn instead of failing.
 */

export class Semaphore {
  private readonly limit: number;
  private active = 0;
  private queue: Array<() => void> = [];

  constructor(limit: number) {
    this.limit = Math.max(1, limit);
  }

  get pending(): number {
    return this.queue.length;
  }

  get inFlight(): number {
    return this.active;
  }

  private acquire(): Promise<void> {
    if (this.active < this.limit) {
      this.active++;
      return Promise.resolve();
    }
    return new Promise<void>(resolve => {
      this.queue.push(() => {
        this.active++;
        resolve();
      });
    });
  }

  private release(): void {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) next();
  }

  /** Runs `fn` once a slot is free, always releasing the slot afterwards. */
  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }
}

/**
 * Rejects with `message` if `promise` has not settled within `ms`.
 * Used so a wedged ffmpeg/sharp job can never hold a semaphore slot forever.
 */
export function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(message)), ms);
    })
  ]).finally(() => clearTimeout(timer!)) as Promise<T>;
}

/**
 * Collapses a burst of calls into a single trailing execution.
 * Fifty uploads in ten seconds should trigger one face-index run, not fifty.
 */
export function debounce(fn: () => void, waitMs: number): () => void {
  let timer: NodeJS.Timeout | null = null;
  return () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn();
    }, waitMs);
  };
}
