import { COLLABORATION_LIMITS as L, type CollaborationEvent, type CollaborationMessage, type NormalizedPoint } from '@screen-room/protocol';

interface Stroke { points: NormalizedPoint[]; expires: number; next: number; ended: boolean }
export interface CaptureAnnotations {
  streamId: string; seq: number; strokes: Map<string, Stroke>;
  laser: { point: NormalizedPoint; expires: number } | null;
}
/** Session-owned ephemeral memory; no React renders per event and no history API. */
export class LiveAnnotations {
  readonly captures = new Map<string, CaptureAnnotations>();
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private now: () => number;
  constructor(now = () => performance.now()) { this.now = now; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private changed() {
    for (const listener of this.listeners) listener();
    if (this.timer) clearTimeout(this.timer);
    let deadline = Infinity;
    for (const capture of this.captures.values()) {
      if (capture.laser) deadline = Math.min(deadline, capture.laser.expires);
      for (const stroke of capture.strokes.values()) deadline = Math.min(deadline, stroke.expires);
    }
    this.timer = Number.isFinite(deadline) ? setTimeout(() => { this.timer = null; this.expire(); }, Math.max(1, deadline - this.now())) : null;
  }
  expire() {
    const now = this.now();
    for (const capture of this.captures.values()) {
      if (capture.laser && capture.laser.expires <= now) capture.laser = null;
      for (const [id, stroke] of capture.strokes) if (stroke.expires <= now) capture.strokes.delete(id);
    }
    this.changed();
  }
  setCapture(peerId: string, streamId?: string) {
    if (this.captures.get(peerId)?.streamId === streamId) return;
    this.captures.delete(peerId);
    if (streamId) this.captures.set(peerId, { streamId, seq: 0, strokes: new Map(), laser: null });
    this.changed();
  }
  receive(message: CollaborationEvent, ageMs = Math.max(0, Date.now() - message.timestamp)) {
    this.apply(message.peerId, message.event, ageMs);
  }
  apply(peerId: string, event: CollaborationMessage, ageMs = 0) {
    const capture = this.captures.get(peerId);
    if (!capture || capture.streamId !== event.streamId || event.seq <= capture.seq) return;
    capture.seq = event.seq;
    const now = this.now();
    if (event.type === 'clear-annotations') { capture.strokes.clear(); capture.laser = null; }
    if (event.type === 'laser') {
      capture.laser = event.point && ageMs < L.laserTtlMs ? { point: event.point, expires: now + L.laserTtlMs - ageMs } : null;
    }
    if (event.type === 'drawing') {
      const stroke = capture.strokes.get(event.strokeId);
      if (event.phase === 'cancel') capture.strokes.delete(event.strokeId);
      else if (event.phase === 'start') {
        if (event.index !== 0 || event.points.length !== 1 || stroke || ageMs >= L.annotationTtlMs) return;
        if (capture.strokes.size >= L.strokesPerCapture) return;
        capture.strokes.set(event.strokeId, { points: [...event.points], expires: now + L.annotationTtlMs - ageMs, next: 1, ended: false });
      } else {
        // Missing batches invalidate the stroke instead of inventing a connecting segment.
        if (!stroke) return;
        if (stroke.ended || stroke.expires <= now || event.index !== stroke.next || stroke.next + event.points.length > L.pointsPerStroke) {
          capture.strokes.delete(event.strokeId);
        } else {
          stroke.points.push(...event.points); stroke.next += event.points.length;
          stroke.ended = event.phase === 'end';
        }
      }
    }
    this.changed();
  }
  reset() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.captures.clear();
    for (const listener of this.listeners) listener();
  }
}
