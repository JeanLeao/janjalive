import { CLIP_LIMITS } from '@screen-room/protocol';

export function clipMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function') return null;
  return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type)) ?? null;
}
export type ClipFile = { blob: Blob; extension: 'webm' | 'mp4' };

/** Owns clones only. Source tracks and WebRTC senders are never changed. */
export class LocalClip {
  private recorder: MediaRecorder;
  private tracks: MediaStreamTrack[] = [];
  private chunks: Blob[] = [];
  private bytes = 0;
  private timer?: ReturnType<typeof setTimeout>;
  private watchdog?: ReturnType<typeof setTimeout>;
  private ended = false;
  private stopping = false;
  private startedAt = 0;
  private sourceTracks: MediaStreamTrack[];
  private sourceStream: MediaStream;
  private callbacks: {
    started: () => void; stopping: () => void; finished: (file: ClipFile | null, error?: string) => void;
  };
  constructor(source: MediaStream, audio: boolean, callbacks: {
    started: () => void; stopping: () => void; finished: (file: ClipFile | null, error?: string) => void;
  }) {
    this.callbacks = callbacks;
    this.sourceStream = source;
    const mimeType = clipMimeType();
    if (!mimeType) throw new Error('Este navegador não oferece um formato de gravação compatível.');
    this.sourceTracks = [...source.getVideoTracks(), ...(audio ? source.getAudioTracks() : [])];
    if (!this.sourceTracks.some(t => t.kind === 'video' && t.readyState === 'live' && !t.muted)) throw new Error('Vídeo indisponível para gravação.');
    try {
      for (const track of this.sourceTracks) this.tracks.push(track.clone());
      this.recorder = new MediaRecorder(new MediaStream(this.tracks), { mimeType, videoBitsPerSecond: 4_000_000, audioBitsPerSecond: 128_000 });
    } catch (error) { this.tracks.forEach(t => t.stop()); throw error; }
    this.recorder.onstart = () => {
      if (this.stopping || this.ended) return;
      this.startedAt = Date.now();
      this.timer = setTimeout(() => this.stop(), CLIP_LIMITS.durationMs);
      callbacks.started();
    };
    this.recorder.ondataavailable = event => {
      if (this.ended || !event.data.size) return;
      // A suspended tab can deliver a large delayed chunk after the wall-clock limit.
      // Keep earlier chunks, never append that tail (including the final flush).
      if (this.startedAt && Date.now() - this.startedAt > CLIP_LIMITS.durationMs) { this.stop(); return; }
      if (this.bytes + event.data.size > CLIP_LIMITS.bytes) { this.stop('O clipe atingiu o limite de memória de 64 MiB.'); return; }
      this.chunks.push(event.data); this.bytes += event.data.size;
    };
    this.recorder.onerror = () => this.stop('Falha na codificação do clipe.');
    this.recorder.onstop = () => this.finish();
    source.addEventListener('removetrack', this.sourceLost);
    this.sourceTracks.forEach(t => { t.addEventListener('ended', this.sourceLost); t.addEventListener('mute', this.sourceLost); });
  }
  private sourceLost = () => this.stop('A mídia foi interrompida.');
  syncTracks() {
    this.sourceTracks.forEach((source, index) => { if (this.tracks[index]) this.tracks[index].enabled = source.enabled; });
  }
  elapsed() { return this.startedAt ? Math.min(60, Math.floor((Date.now() - this.startedAt) / 1000)) : 0; }
  start() { try { this.recorder.start(250); } catch (error) { this.finish('Não foi possível iniciar o gravador.'); throw error; } }
  private error?: string;
  stop(error?: string) {
    if (this.ended || this.stopping) return;
    this.stopping = true; this.error = error;
    clearTimeout(this.timer);
    this.callbacks.stopping();
    // Stop clones immediately on revocation, even if the encoder is slow to flush.
    this.tracks.forEach(t => t.stop());
    this.watchdog = setTimeout(() => this.finish('O navegador não finalizou o clipe.'), 3000);
    try { if (this.recorder.state !== 'inactive') this.recorder.stop(); else this.finish(); }
    catch { this.finish('Falha ao finalizar o clipe.'); }
  }
  private finish(error = this.error) {
    if (this.ended) return;
    this.ended = true; clearTimeout(this.timer); clearTimeout(this.watchdog);
    this.tracks.forEach(t => t.stop());
    this.sourceStream.removeEventListener('removetrack', this.sourceLost);
    this.sourceTracks.forEach(t => { t.removeEventListener('ended', this.sourceLost); t.removeEventListener('mute', this.sourceLost); });
    const mime = this.recorder.mimeType || this.chunks[0]?.type || '';
    const extension = mime.startsWith('video/mp4') ? 'mp4' : mime.startsWith('video/webm') ? 'webm' : null;
    const file: ClipFile | null = this.bytes && extension ? { blob: new Blob(this.chunks, { type: mime }), extension } : null;
    this.chunks = []; this.bytes = 0; this.tracks = []; this.sourceTracks = [];
    this.recorder.ondataavailable = this.recorder.onstart = this.recorder.onstop = this.recorder.onerror = null;
    this.callbacks.finished(file, error ?? (!file ? 'O navegador não produziu um clipe válido.' : undefined));
  }
  dispose() { this.callbacks = { started() {}, stopping() {}, finished() {} }; this.stop(); this.finish(); }
}
