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
export interface PointerSeqMetadata {
  seq: number;
  expires: number;
}
export interface CollaborativeStroke {
  strokeId: string;
  senderPeerId: string;
  senderNickname?: string;
  points: NormalizedPoint[];
  expires: number;
  next: number;
  ended: boolean;
}
export interface CaptureAnnotations {
  streamId: string; seq: number; strokes: Map<string, Stroke>;
  laser: { point: NormalizedPoint; expires: number } | null;
  pointers: Map<string, SpectatorPointer>;
  pointerSeqs: Map<string, PointerSeqMetadata>;
  pointerEventIds: string[];
  collaborativeStrokes: Map<string, CollaborativeStroke>;
  collaborativeSeqs: Map<string, PointerSeqMetadata>;
  collaborativeEventIds: string[];
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
      for (const seq of capture.pointerSeqs.values()) deadline = Math.min(deadline, seq.expires);
      for (const stroke of capture.collaborativeStrokes.values()) deadline = Math.min(deadline, stroke.expires);
      for (const seq of capture.collaborativeSeqs.values()) deadline = Math.min(deadline, seq.expires);
    }
    this.timer = Number.isFinite(deadline) ? setTimeout(() => { this.timer = null; this.expire(); }, Math.max(1, deadline - this.now())) : null;
  }
  expire() {
    const now = this.now();
    for (const capture of this.captures.values()) {
      if (capture.laser && capture.laser.expires <= now) capture.laser = null;
      for (const [id, stroke] of capture.strokes) if (stroke.expires <= now) capture.strokes.delete(id);
      for (const [id, ptr] of capture.pointers) if (ptr.expires <= now) capture.pointers.delete(id);
      for (const [id, seq] of capture.pointerSeqs) if (seq.expires <= now) capture.pointerSeqs.delete(id);
      for (const [id, stroke] of capture.collaborativeStrokes) if (stroke.expires <= now) capture.collaborativeStrokes.delete(id);
      for (const [id, seq] of capture.collaborativeSeqs) if (seq.expires <= now) capture.collaborativeSeqs.delete(id);
    }
    this.changed();
  }
  setCapture(peerId: string, streamId?: string) {
    if (this.captures.get(peerId)?.streamId === streamId) return;
    this.captures.delete(peerId);
    if (streamId) this.captures.set(peerId, {
      streamId, seq: 0, strokes: new Map(), laser: null,
      pointers: new Map(), pointerSeqs: new Map(), pointerEventIds: [],
      collaborativeStrokes: new Map(), collaborativeSeqs: new Map(), collaborativeEventIds: [],
    });
    this.changed();
  }
  removePeer(peerId: string) {
    let changed = false;
    if (this.captures.delete(peerId)) {
      changed = true;
    }
    for (const capture of this.captures.values()) {
      if (capture.pointers.delete(peerId)) {
        changed = true;
      }
      if (capture.pointerSeqs.delete(peerId)) {
        changed = true;
      }
      for (const [key, stroke] of capture.collaborativeStrokes) {
        if (stroke.senderPeerId === peerId) {
          capture.collaborativeStrokes.delete(key);
          changed = true;
        }
      }
      if (capture.collaborativeSeqs.delete(peerId)) {
        changed = true;
      }
    }
    if (changed) {
      this.changed();
    }
  }
  clearPointers(peerId: string) {
    const capture = this.captures.get(peerId);
    if (!capture || capture.pointers.size === 0) return;
    capture.pointers.clear();
    this.changed();
  }
  clearCollaborativeDrawings(peerId: string) {
    const capture = this.captures.get(peerId);
    if (!capture || capture.collaborativeStrokes.size === 0) return;
    capture.collaborativeStrokes.clear();
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
      if (ageMs >= L.pointTtlMs) return;
      for (const [id, ptr] of capture.pointers) {
        if (ptr.expires <= now) capture.pointers.delete(id);
      }
      for (const [id, seq] of capture.pointerSeqs) {
        if (seq.expires <= now) capture.pointerSeqs.delete(id);
      }
      const lastSeq = capture.pointerSeqs.get(event.senderPeerId)?.seq ?? 0;
      if (event.seq <= lastSeq || capture.pointerEventIds.includes(event.eventId)) return;
      const expires = now + L.pointTtlMs - ageMs;
      const maxTracked = L.trackedPointersPerCapture ?? 24;
      if (!capture.pointerSeqs.has(event.senderPeerId) && capture.pointerSeqs.size >= maxTracked) {
        const oldestSeqKey = capture.pointerSeqs.keys().next().value;
        if (oldestSeqKey !== undefined) capture.pointerSeqs.delete(oldestSeqKey);
      }
      capture.pointerSeqs.delete(event.senderPeerId);
      capture.pointerSeqs.set(event.senderPeerId, { seq: event.seq, expires });
      capture.pointerEventIds = [...capture.pointerEventIds.slice(-31), event.eventId];
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
        expires,
      });
      this.changed();
      return;
    }
    if (event.type === 'clear-collaborative-drawings') {
      capture.collaborativeStrokes.clear();
      this.changed();
      return;
    }
    if (event.type === 'spectator-drawing') {
      if (event.targetPeerId && event.targetPeerId !== peerId) return;
      if (ageMs >= L.annotationTtlMs) return;
      for (const [id, stroke] of capture.collaborativeStrokes) {
        if (stroke.expires <= now) capture.collaborativeStrokes.delete(id);
      }
      for (const [id, seq] of capture.collaborativeSeqs) {
        if (seq.expires <= now) capture.collaborativeSeqs.delete(id);
      }
      const lastSeq = capture.collaborativeSeqs.get(event.senderPeerId)?.seq ?? 0;
      if (event.seq <= lastSeq || capture.collaborativeEventIds.includes(event.eventId)) return;

      const strokeKey = `${event.senderPeerId}:${event.strokeId}`;
      const stroke = capture.collaborativeStrokes.get(strokeKey);
      const expires = now + L.annotationTtlMs - ageMs;

      const maxTracked = L.trackedDrawersPerCapture ?? 24;
      if (!capture.collaborativeSeqs.has(event.senderPeerId) && capture.collaborativeSeqs.size >= maxTracked) {
        const oldestSeqKey = capture.collaborativeSeqs.keys().next().value;
        if (oldestSeqKey !== undefined) capture.collaborativeSeqs.delete(oldestSeqKey);
      }
      capture.collaborativeSeqs.delete(event.senderPeerId);
      capture.collaborativeSeqs.set(event.senderPeerId, { seq: event.seq, expires });
      capture.collaborativeEventIds = [...capture.collaborativeEventIds.slice(-31), event.eventId];

      if (event.phase === 'cancel') {
        capture.collaborativeStrokes.delete(strokeKey);
      } else if (event.phase === 'start') {
        if (event.index !== 0 || event.points.length !== 1 || stroke) return;
        if (capture.collaborativeStrokes.size >= (L.collaborativeStrokesPerCapture ?? 32)) {
          const oldestKey = capture.collaborativeStrokes.keys().next().value;
          if (oldestKey !== undefined) capture.collaborativeStrokes.delete(oldestKey);
        }
        capture.collaborativeStrokes.set(strokeKey, {
          strokeId: event.strokeId,
          senderPeerId: event.senderPeerId,
          senderNickname: event.senderNickname,
          points: [...event.points],
          expires,
          next: 1,
          ended: false,
        });
      } else {
        // Missing batches invalidate the stroke instead of inventing a connecting segment.
        if (!stroke) return;
        if (stroke.ended || stroke.expires <= now || event.index !== stroke.next || stroke.next + event.points.length > L.pointsPerStroke) {
          capture.collaborativeStrokes.delete(strokeKey);
        } else {
          stroke.points.push(...event.points);
          stroke.next += event.points.length;
          stroke.ended = event.phase === 'end';
        }
      }
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
