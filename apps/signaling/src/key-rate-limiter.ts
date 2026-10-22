interface Entry {
  failures: number;
  expiresAt: number;
}

/** Bounded retention: preserve active counters and fail closed for untracked keys at capacity. */
export class KeyRateLimiter {
  private readonly entries = new Map<string, Entry>();
  static readonly MAX_ENTRIES = 5000;
  private static readonly PERIOD_MS = 60_000;

  get size(): number { return this.entries.size; }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (now >= entry.expiresAt) this.entries.delete(key);
    }
  }

  isLimited(key: string, now = Date.now()): boolean {
    const entry = this.entries.get(key);
    if (entry && now < entry.expiresAt) return entry.failures >= 5;
    if (entry) this.entries.delete(key);
    if (this.entries.size < KeyRateLimiter.MAX_ENTRIES) return false;
    this.prune(now);
    return this.entries.size >= KeyRateLimiter.MAX_ENTRIES;
  }

  recordFailure(key: string, now = Date.now()): void {
    let entry = this.entries.get(key);
    if (entry && now >= entry.expiresAt) {
      this.entries.delete(key);
      entry = undefined;
    }
    if (entry) {
      if (entry.failures < 5 && ++entry.failures === 5) {
        entry.expiresAt = now + KeyRateLimiter.PERIOD_MS;
      }
      return;
    }
    if (this.entries.size >= KeyRateLimiter.MAX_ENTRIES) this.prune(now);
    if (this.entries.size >= KeyRateLimiter.MAX_ENTRIES) return;
    this.entries.set(key, { failures: 1, expiresAt: now + KeyRateLimiter.PERIOD_MS });
  }

  clear(key: string): void { this.entries.delete(key); }
}
