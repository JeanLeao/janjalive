import { COLLABORATION_LIMITS as L, type CollaborationEvent, type CollaborationEventPayload, type NormalizedPoint } from '@screen-room/protocol';

interface Stroke { points: NormalizedPoint[]; expires: number; next: number; ended: boolean }
export interface SpectatorPointer {
  eventId: string;
  senderPeerId: string;
  senderNickname?: string;
  point: NormalizedPoint;
  createdAt: number;
  expires: number;
}
export interface CaptureAnnotations {
  streamId: string; seq: number; strokes: Map<string, Stroke>;
  laser: { point: NormalizedPoint; expires: number } | null;
  pointers: Map<string, SpectatorPointer>;
  pointerSeqs: Map<string, number>;
  pointerEventIds: string[];
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
      for (const ptr of capture.pointers.values()) deadline = Math.min(deadline, ptr.expires);
    }
    this.timer = Number.isFinite(deadline) ? setTimeout(() => { this.timer = null; this.expire(); }, Math.max(1, deadline - this.now())) : null;
  }
  expire() {
    const now = this.now();
    for (const capture of this.captures.values()) {
      if (capture.laser && capture.laser.expires <= now) capture.laser = null;
      for (const [id, stroke] of capture.strokes) if (stroke.expires <= now) capture.strokes.delete(id);
      for (const [id, ptr] of capture.pointers) if (ptr.expires <= now) capture.pointers.delete(id);
    }
    this.changed();
  }
  setCapture(peerId: string, streamId?: string) {
    if (this.captures.get(peerId)?.streamId === streamId) return;
    this.captures.delete(peerId);
    if (streamId) this.captures.set(peerId, {
      streamId, seq: 0, strokes: new Map(), laser: null,
      pointers: new Map(), pointerSeqs: new Map(), pointerEventIds: [],
    });
    this.changed();
  }
  clearPointers(peerId: string) {
    const capture = this.captures.get(peerId);
    if (!capture || capture.pointers.size === 0) return;
    capture.pointers.clear();
    this.changed();
  }
  receive(message: CollaborationEvent, ageMs = Math.max(0, Date.now() - message.timestamp)) {
    this.apply(message.peerId, message.event, ageMs);
  }
  apply(peerId: string, event: CollaborationEventPayload, ageMs = 0) {
    const capture = this.captures.get(peerId);
    if (!capture || capture.streamId !== event.streamId) return;
    const now = this.now();
    if (event.type === 'point') {
      if (event.targetPeerId && event.targetPeerId !== peerId) return;
      const lastSeq = capture.pointerSeqs.get(event.senderPeerId) ?? 0;
      if (event.seq <= lastSeq || capture.pointerEventIds.includes(event.eventId)) return;
      capture.pointerSeqs.set(event.senderPeerId, event.seq);
      capture.pointerEventIds = [...capture.pointerEventIds.slice(-31), event.eventId];
      if (ageMs >= L.pointTtlMs) return;
      for (const [id, ptr] of capture.pointers) {
        if (ptr.expires <= now) capture.pointers.delete(id);
      }
      if (!capture.pointers.has(event.senderPeerId) && capture.pointers.size >= L.pointersPerCapture) {
        const oldestKey = capture.pointers.keys().next().value;
        if (oldestKey !== undefined) capture.pointers.delete(oldestKey);
      }
      capture.pointers.delete(event.senderPeerId);
      capture.pointers.set(event.senderPeerId, {
        eventId: event.eventId,
        senderPeerId: event.senderPeerId,
        senderNickname: event.senderNickname,
        point: event.point,
        createdAt: now - ageMs,
        expires: now + L.pointTtlMs - ageMs,
      });
      this.changed();
      return;
    }
    if (event.seq <= capture.seq) return;
    capture.seq = event.seq;
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
