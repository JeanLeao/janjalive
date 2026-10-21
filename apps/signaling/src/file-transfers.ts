import { FILE_LIMITS, type FileOperation, type FileEvent } from '@screen-room/protocol';

type Delivery = { room: string; from: string; to: string; accepted: boolean; timer: ReturnType<typeof setTimeout> };
/** Bounded, ephemeral authorizations tied to connected socket lifetimes. */
export class FileTransfers {
  private deliveries = new Map<string, Delivery>();
  private rates = new Map<string, { start: number; count: number; ids: Set<string> }>();
  constructor(private emit: (room: string, peer: string, event: FileEvent) => void) {}
  apply(room: string, from: string, message: FileOperation, connected: (id: string) => boolean): void {
    const key = `${room}:${message.id}`;
    const fail = () => this.emit(room, from, { type: 'file-event', id: message.id, from, to: message.target, action: 'error' });
    if (from === message.target || !connected(message.target)) { fail(); return; }
    if (message.type === 'file-request') {
      const rateKey = `${room}:${from}`;
      let rate = this.rates.get(rateKey);
      if (!rate) { rate = { start: Date.now(), count: 0, ids: new Set() }; this.rates.set(rateKey, rate); }
      if (Date.now() - rate.start > 60_000) { rate.start = Date.now(); rate.count = 0; }
      // Tombstones are bounded per socket: after 256 requests, reconnect to send more.
      if (++rate.count > 16 || rate.ids.has(message.id) || rate.ids.size >= 256 || this.deliveries.has(key)) { fail(); return; }
      rate.ids.add(message.id);
      const all = [...this.deliveries.values()].filter(d => d.room === room);
      if (all.length >= 32 || all.filter(d => d.from === from || d.to === from).length >= FILE_LIMITS.pending ||
          all.filter(d => d.from === message.target || d.to === message.target).length >= FILE_LIMITS.pending) { fail(); return; }
      const d: Delivery = { room, from, to: message.target, accepted: false,
        timer: setTimeout(() => this.finish(key, 'cancel'), FILE_LIMITS.requestMs) };
      this.deliveries.set(key, d);
      this.notify(d, { type: 'file-event', id: message.id, from, to: message.target, action: 'request', file: message.file });
      return;
    }
    const d = this.deliveries.get(key);
    if (!d || !((d.from === from && d.to === message.target) || (d.to === from && d.from === message.target))) { fail(); return; }
    const receiver = from === d.to;
    if (message.action === 'accept' && receiver && !d.accepted) {
      d.accepted = true;
      clearTimeout(d.timer);
      d.timer = setTimeout(() => this.finish(key, 'cancel'), FILE_LIMITS.lifetimeMs);
      this.notify(d, { type: 'file-event', id: message.id, from, to: message.target, action: 'accept' });
    } else if (message.action === 'cancel' || (message.action === 'reject' && receiver && !d.accepted) ||
      (message.action === 'complete' && receiver && d.accepted)) this.finish(key, message.action, from);
    else fail();
  }
  private notify(d: Delivery, event: FileEvent) { this.emit(d.room, d.from, event); this.emit(d.room, d.to, event); }
  private finish(key: string, action: 'cancel' | 'reject' | 'complete', from?: string) {
    const d = this.deliveries.get(key); if (!d) return;
    clearTimeout(d.timer); this.deliveries.delete(key);
    this.notify(d, { type: 'file-event', id: key.slice(d.room.length + 1), from: from ?? d.from,
      to: (from ?? d.from) === d.from ? d.to : d.from, action });
  }
  depart(room: string, peer: string) {
    for (const [key, d] of this.deliveries) if (d.room === room && (d.from === peer || d.to === peer)) this.finish(key, 'cancel');
    this.rates.delete(`${room}:${peer}`);
  }
  dispose() { for (const d of this.deliveries.values()) clearTimeout(d.timer); this.deliveries.clear(); this.rates.clear(); }
}
