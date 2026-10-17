// More than the server's rolling one-second window. All local selections, including
// initial publication, share this budget. Keep one latest intent, never a queue.
const SEND_INTERVAL_MS = 1100;

interface PublisherOptions {
  canSend: () => boolean;
  isValidTarget: (peerId: string) => boolean;
  send: (peerId: string) => boolean;
}

export class StageSelectionPublisher {
  private desired: string | null = null;
  private confirmed: string | null = null;
  private seq = -1;
  private nextAttempt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;

  private readonly options: PublisherOptions;

  constructor(options: PublisherOptions) {
    this.options = options;
  }

  select(peerId: string): void {
    this.desired = peerId;
    this.flush();
  }

  /** Only the local presenter's server echo is an acknowledgement, never a followed choice. */
  acknowledge(peerId: string | null, seq: number): void {
    if (seq <= this.seq) return;
    this.seq = seq;
    this.confirmed = peerId;
    this.flush();
  }

  invalidate(peerId: string): void {
    if (this.confirmed === peerId) this.confirmed = null;
    if (this.desired === peerId) this.cancel();
  }

  cancel(): void {
    this.clearTimer();
    this.desired = this.confirmed = null;
    this.seq = -1;
    // Keep the cooldown across stop/start and socket reconnects in the same room.
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private flush(): void {
    this.clearTimer();
    const target = this.desired;
    if (!target) return;
    if (!this.options.canSend() || !this.options.isValidTarget(target)) {
      this.cancel();
      return;
    }
    if (target === this.confirmed) return;
    const now = Date.now();
    if (now < this.nextAttempt) {
      this.timer = setTimeout(() => this.flush(), this.nextAttempt - now);
      return;
    }
    this.nextAttempt = now + SEND_INTERVAL_MS;
    // Retry only while unconfirmed: network delivery can bunch up otherwise spaced
    // messages and the server deliberately drops excess events without an error.
    this.timer = setTimeout(() => this.flush(), SEND_INTERVAL_MS);
    if (!this.options.send(target)) this.cancel();
  }
}
