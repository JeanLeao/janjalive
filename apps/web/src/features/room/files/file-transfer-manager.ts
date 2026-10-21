import { FILE_LIMITS, FileMetadataSchema, type FileMetadata, type FileEvent, type FileOperation } from '@screen-room/protocol';

export type TransferState = 'waiting' | 'offered' | 'queued' | 'transferring' | 'verifying' | 'complete' | 'rejected' | 'cancelled' | 'error';
export interface FileDelivery {
  id: string; peerId: string; incoming: boolean; file: FileMetadata;
  watchSessionId?: string; state: TransferState; bytes: number; download?: Blob;
}
type Delivery = FileDelivery & { source?: Blob; buffer?: Uint8Array<ArrayBuffer>; timer?: ReturnType<typeof setTimeout>; controller: AbortController };
const terminal = (d: FileDelivery) => ['complete', 'rejected', 'cancelled', 'error'].includes(d.state);
export async function sha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return [...new Uint8Array(digest)].map(v => v.toString(16).padStart(2, '0')).join('');
}
export interface FileTransport {
  send: (message: FileOperation) => boolean;
  channel: (peerId: string) => RTCDataChannel | null;
  maxMessageSize?: (peerId: string) => number | undefined;
  changed: (deliveries: FileDelivery[]) => void;
}
/** Generic Blob transport. One sender globally; at most two retained incoming files. */
export class FileTransferManager {
  private deliveries = new Map<string, Delivery>();
  private retired = new Map<string, string>();
  private channels = new Map<string, { channel: RTCDataChannel; cleanup: () => void }>();
  private sending = false;
  private preparing = false;
  private epoch = 0;
  private ready = false;
  private transport: FileTransport;
  constructor(transport: FileTransport) { this.transport = transport; }
  setReady(ready: boolean) { this.ready = ready; if (!ready) this.reset(); }
  private publish() { this.transport.changed([...this.deliveries.values()].map(({ source, buffer, timer, controller, download, ...d }) => ({ ...d, download: d.state === 'complete' ? download : undefined }))); }
  private arm(d: Delivery, ms: number = FILE_LIMITS.idleMs) {
    clearTimeout(d.timer); d.timer = setTimeout(() => this.cancel(d.id, 'error'), ms);
  }
  private finish(d: Delivery, state: TransferState) {
    clearTimeout(d.timer); d.timer = undefined; d.state = state;
    this.retired.set(d.id, d.peerId);
    if (this.retired.size > 512) this.retired.delete(this.retired.keys().next().value!);
    d.controller.abort(); d.source = undefined; d.buffer = undefined;
    if (state !== 'complete') d.download = undefined;
    this.publish();
  }
  async offer(source: Blob, name: string, recipients: string[], watchSessionId?: string) {
    if (!this.ready || this.preparing) throw new Error('Aguarde a conexão ou a preparação do arquivo.');
    const targets = [...new Set(recipients)];
    if (!targets.length || targets.length > FILE_LIMITS.pending || source.size > FILE_LIMITS.maxBytes) throw new Error('Selecione de 1 a 8 destinatários e um arquivo de até 20 MiB.');
    const file = { name, mime: source.type, size: source.size, sha256: '0'.repeat(64) };
    if (!FileMetadataSchema.safeParse(file).success) throw new Error('Nome, tipo ou tamanho de arquivo inválido.');
    if ([...this.deliveries.values()].filter(d => !terminal(d)).length + targets.length > FILE_LIMITS.pending) throw new Error('Limite de 8 entregas pendentes.');
    if ([...this.deliveries.values()].some(d => !d.incoming && !terminal(d))) throw new Error('Aguarde as entregas do arquivo anterior ou cancele-as.');
    this.preparing = true;
    const epoch = this.epoch;
    try {
      file.sha256 = await sha256(source);
      if (!this.ready || epoch !== this.epoch) return;
      // Drop only old terminal records, never live transfers or downloadable files.
      for (const [id, d] of this.deliveries) if (terminal(d) && !d.download) this.deliveries.delete(id);
      for (const peerId of targets) {
        const d: Delivery = { id: crypto.randomUUID(), peerId, incoming: false, file, source,
          watchSessionId, state: 'waiting', bytes: 0, controller: new AbortController() };
        this.deliveries.set(d.id, d); this.arm(d, FILE_LIMITS.requestMs);
        if (!this.transport.send({ type: 'file-request', id: d.id, target: peerId, file, ...(watchSessionId ? { watchSessionId } : {}) })) this.finish(d, 'error');
      }
      this.publish();
    } finally { this.preparing = false; }
  }
  receive(event: FileEvent, self: string) {
    if (!this.ready || (event.from !== self && event.to !== self)) return;
    const peerId = event.from === self ? event.to : event.from;
    let d = this.deliveries.get(event.id);
    if (event.action === 'request') {
      if (d || event.from === self || !event.file) return;
      if ([...this.deliveries.values()].filter(v => !terminal(v)).length >= FILE_LIMITS.pending) {
        this.transport.send({ type: 'file-control', id: event.id, target: peerId, action: 'reject' }); return;
      }
      for (const [id, old] of this.deliveries) if (terminal(old) && !old.download) this.deliveries.delete(id);
      d = { id: event.id, peerId, file: event.file, incoming: true, watchSessionId: event.watchSessionId, state: 'offered', bytes: 0, controller: new AbortController() };
      this.deliveries.set(d.id, d); this.arm(d, FILE_LIMITS.requestMs); this.publish(); return;
    }
    if (!d || d.peerId !== peerId || terminal(d)) return;
    if (event.action === 'accept') {
      // The local click grants incoming consent immediately. On a reused
      // channel, bytes can outrun the server's acceptance echo on WebSocket.
      if (d.incoming) {
        if (!['queued', 'transferring', 'verifying'].includes(d.state)) return;
      } else {
        if (d.state !== 'waiting') return;
        d.state = 'queued'; this.arm(d, FILE_LIMITS.lifetimeMs);
      }
      try { if (!this.transport.channel(peerId)) throw new Error('Canal indisponível'); }
      catch { this.cancel(d.id, 'error'); return; }
      this.publish(); void this.pump();
    } else if (event.action === 'complete') {
      if (d.incoming ? d.state === 'verifying' && Boolean(d.download) : d.state === 'verifying') this.finish(d, 'complete');
      else this.cancel(d.id, 'error');
    } else this.finish(d, event.action === 'reject' ? 'rejected' : event.action === 'error' ? 'error' : 'cancelled');
  }
  accept(id: string) {
    const d = this.deliveries.get(id);
    if (!d?.incoming || d.state !== 'offered' || !this.ready) return;
    // Downloadable files retain memory until explicitly dismissed.
    if ([...this.deliveries.values()].filter(v => v.incoming && (v.download || !['offered', 'complete', 'rejected', 'cancelled', 'error'].includes(v.state))).length >= 2) throw new Error('Libere um recebimento antes de aceitar outro (limite: 2).');
    d.buffer = new Uint8Array(d.file.size); d.state = 'queued'; this.arm(d, FILE_LIMITS.lifetimeMs); this.publish();
    if (!this.transport.send({ type: 'file-control', id, target: d.peerId, action: 'accept' })) this.finish(d, 'error');
  }
  reject(id: string) {
    const d = this.deliveries.get(id); if (!d || d.state !== 'offered') return;
    this.transport.send({ type: 'file-control', id, target: d.peerId, action: 'reject' }); this.finish(d, 'rejected');
  }
  cancel(id: string, state: 'cancelled' | 'error' = 'cancelled') {
    const d = this.deliveries.get(id); if (!d || terminal(d)) return;
    this.transport.send({ type: 'file-control', id, target: d.peerId, action: 'cancel' }); this.finish(d, state);
  }
  dismiss(id: string) { const d = this.deliveries.get(id); if (d && terminal(d)) { this.deliveries.delete(id); d.download = undefined; this.publish(); } }
  /** Only consented, hash-verified and server-confirmed bytes may be consumed by F14. */
  verifiedBlob(id: string): Blob | undefined {
    const d = this.deliveries.get(id);
    return d?.incoming && d.state === 'complete' ? d.download : undefined;
  }
  releaseWatch(sessionId: string) {
    for (const d of [...this.deliveries.values()]) if (d.watchSessionId === sessionId) {
      this.cancel(d.id); this.dismiss(d.id);
    }
  }
  bind(peerId: string, channel: RTCDataChannel) {
    this.channels.get(peerId)?.cleanup();
    channel.binaryType = 'arraybuffer'; channel.bufferedAmountLowThreshold = 64 * 1024;
    const message = (e: MessageEvent) => { void this.data(peerId, e.data).catch(() => this.disconnect(peerId)); };
    const close = () => this.disconnect(peerId);
    const connectionTimer = channel.readyState === 'open' ? undefined : setTimeout(close, FILE_LIMITS.idleMs);
    const open = () => clearTimeout(connectionTimer);
    channel.addEventListener('open', open);
    channel.addEventListener('message', message); channel.addEventListener('close', close); channel.addEventListener('error', close);
    this.channels.set(peerId, { channel, cleanup: () => {
      clearTimeout(connectionTimer); channel.removeEventListener('open', open);
      channel.removeEventListener('message', message); channel.removeEventListener('close', close); channel.removeEventListener('error', close);
    } });
  }
  private async data(peer: string, data: unknown) {
    if (!this.ready) return;
    if (typeof data === 'string') {
      if (data.length > 100) throw new Error('Controle inválido');
      const end = JSON.parse(data);
      const d = this.deliveries.get(end.id);
      if (end.type === 'end' && (this.retired.get(end.id) === peer || (d?.peerId === peer && terminal(d)))) return;
      if (end.type !== 'end' || !d || !d.incoming || d.peerId !== peer || !d.buffer || !['queued', 'transferring'].includes(d.state)) throw new Error('Sem autorização');
      if (d.bytes !== d.file.size) { this.cancel(d.id, 'error'); return; }
      d.state = 'verifying'; this.arm(d); this.publish();
      // MIME deliberately ignored: the result is download-only binary data.
      const blob = new Blob([d.buffer], { type: 'application/octet-stream' });
      d.buffer = undefined;
      const digest = await sha256(blob);
      if (d.controller.signal.aborted) return;
      if (digest !== d.file.sha256) { this.cancel(d.id, 'error'); return; }
      d.download = blob;
      if (!this.transport.send({ type: 'file-control', id: d.id, target: peer, action: 'complete' })) this.cancel(d.id, 'error');
      return;
    }
    if (!(data instanceof ArrayBuffer) || data.byteLength <= 40 || data.byteLength > FILE_LIMITS.chunkBytes + 40) throw new Error('Bloco inválido');
    const id = new TextDecoder().decode(new Uint8Array(data, 0, 36));
    const d = this.deliveries.get(id);
    // Cancellation can race with already-buffered frames. Discard only known
    // retired deliveries, preserving other deliveries on this shared channel.
    if (this.retired.get(id) === peer || (d?.peerId === peer && terminal(d))) return;
    if (!d || d.peerId !== peer || !d.incoming || !d.buffer || !['queued', 'transferring'].includes(d.state)) throw new Error('Sem consentimento');
    const offset = new DataView(data).getUint32(36);
    const size = data.byteLength - 40;
    if (offset !== d.bytes || d.bytes + size > d.file.size || d.bytes + size > FILE_LIMITS.maxBytes) { this.cancel(id, 'error'); return; }
    d.buffer.set(new Uint8Array(data, 40), d.bytes); d.bytes += size; d.state = 'transferring'; this.arm(d); if (d.bytes === size || d.bytes === d.file.size || Math.floor(d.bytes / 131072) !== Math.floor((d.bytes - size) / 131072)) this.publish();
  }
  private wait(channel: RTCDataChannel, event: string, d: Delivery, condition: () => boolean): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => { channel.removeEventListener(event, check); channel.removeEventListener('close', fail); channel.removeEventListener('error', fail); d.controller.signal.removeEventListener('abort', fail); };
      const fail = () => { cleanup(); reject(new Error('Transferência encerrada')); };
      const check = () => { if (d.controller.signal.aborted || channel.readyState === 'closed' || channel.readyState === 'closing') fail(); else if (condition()) { cleanup(); resolve(); } };
      channel.addEventListener(event, check); channel.addEventListener('close', fail); channel.addEventListener('error', fail); d.controller.signal.addEventListener('abort', fail); check();
    });
  }
  private pause(d: Delivery): Promise<void> {
    return new Promise(resolve => {
      const done = () => { clearTimeout(timer); d.controller.signal.removeEventListener('abort', done); resolve(); };
      const timer = setTimeout(done, 8);
      d.controller.signal.addEventListener('abort', done, { once: true });
      if (d.controller.signal.aborted) done();
    });
  }
  private async pump() {
    if (this.sending) return;
    this.sending = true;
    try {
      for (;;) {
        const d = [...this.deliveries.values()].find(v => !v.incoming && v.state === 'queued'); if (!d) break;
        try {
          const channel = this.channels.get(d.peerId)?.channel;
          if (!channel) throw new Error('Sem canal');
          this.arm(d);
          await this.wait(channel, 'open', d, () => channel.readyState === 'open');
          if (d.controller.signal.aborted || !d.source) continue;
          d.state = 'transferring'; this.arm(d); this.publish();
          // Respect SCTP's negotiated message limit, including our 40-byte header.
          const maxMessage = this.transport.maxMessageSize?.(d.peerId);
          const chunkSize = Math.min(FILE_LIMITS.chunkBytes, maxMessage ? maxMessage - 40 : FILE_LIMITS.chunkBytes);
          if (chunkSize < 1) throw new Error('Limite SCTP incompatível');
          while (d.bytes < d.file.size) {
            if (channel.bufferedAmount > 128 * 1024) await this.wait(channel, 'bufferedamountlow', d, () => channel.bufferedAmount <= 64 * 1024);
            if (d.controller.signal.aborted || !d.source) break;
            const part = await d.source.slice(d.bytes, d.bytes + chunkSize).arrayBuffer();
            if (d.controller.signal.aborted) break;
            const frame = new Uint8Array(40 + part.byteLength);
            frame.set(new TextEncoder().encode(d.id)); new DataView(frame.buffer).setUint32(36, d.bytes); frame.set(new Uint8Array(part), 40);
            channel.send(frame); d.bytes += part.byteLength; this.arm(d); if (d.bytes === d.file.size || Math.floor(d.bytes / 131072) !== Math.floor((d.bytes - part.byteLength) / 131072)) this.publish();
            // Conservative pacing (~2 MiB/s) gives audio/video and UI time to run.
            await this.pause(d);
          }
          if (!d.controller.signal.aborted) {
            channel.send(JSON.stringify({ type: 'end', id: d.id })); d.source = undefined; d.state = 'verifying'; this.arm(d); this.publish();
          }
        } catch { this.cancel(d.id, 'error'); }
      }
    } finally { this.sending = false; }
  }
  disconnect(peer: string) {
    for (const d of this.deliveries.values()) if (d.peerId === peer && !terminal(d)) this.cancel(d.id);
    const binding = this.channels.get(peer); binding?.cleanup(); this.channels.delete(peer);
    binding?.channel.close();
    for (const [id, owner] of this.retired) if (owner === peer) this.retired.delete(id);
  }
  reset() {
    this.epoch++;
    for (const d of this.deliveries.values()) { clearTimeout(d.timer); d.controller.abort(); d.source = undefined; d.buffer = undefined; d.download = undefined; }
    this.deliveries.clear(); this.retired.clear();
    for (const binding of this.channels.values()) { binding.cleanup(); binding.channel.close(); }
    this.channels.clear(); this.publish();
  }
}
