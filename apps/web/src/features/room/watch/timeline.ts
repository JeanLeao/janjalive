import type { WatchState } from '@screen-room/protocol';
export function expectedPosition(state: WatchState, serverTime: number): number {
  return Math.max(0, Math.min(state.duration, state.position + (state.playing ? Math.max(0, serverTime - state.referenceTime) / 1000 : 0)));
}
/** Bounded-rate clock probes use monotonic local time, avoiding wall-clock changes. */
export class ServerClock {
  private offset = 0;
  private bestRtt = Infinity;
  seed(serverTime: number, now = performance.now()) { this.offset = serverTime - now; this.bestRtt = Infinity; }
  sample(sent: number, received: number, server: number) {
    const rtt = received - sent;
    if (rtt < 0 || rtt > 10_000 || rtt > this.bestRtt) return;
    this.bestRtt = rtt; this.offset = server - (sent + received) / 2;
  }
  now() { return performance.now() + this.offset; }
}
