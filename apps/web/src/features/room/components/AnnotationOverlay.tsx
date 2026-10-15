import { useEffect, useRef } from 'react';
import { COLLABORATION_LIMITS as L, type CollaborationMessage, type NormalizedPoint } from '@screen-room/protocol';
import type { LiveAnnotations } from '../collaboration/live-annotations';
import type { useVideoZoom } from '../hooks/useVideoZoom';

export type AnnotationTool = 'navigate' | 'laser' | 'draw';
export interface AnnotationChannel {
  store: LiveAnnotations;
  send: (message: CollaborationMessage) => boolean;
  available: boolean;
}

export function AnnotationOverlay({ channel, peerId, streamId, tool, zoom }: {
  channel: AnnotationChannel; peerId: string; streamId: string; tool: AnnotationTool;
  zoom: ReturnType<typeof useVideoZoom>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ channel, zoom }); latest.current = { channel, zoom };
  useEffect(() => {
    const canvas = canvasRef.current, viewport = zoom.viewportRef.current;
    if (!canvas || !viewport) return;
    let frame = 0;
    let gesture: { id: number; strokeId: string; next: number; expires: number; pending: NormalizedPoint[]; last: NormalizedPoint } | null = null;
    let laser: NormalizedPoint | null | undefined;
    let laserLocal: { point: NormalizedPoint; expires: number } | null = null;
    const send = (event: object) => latest.current.channel.send({ ...event, streamId, eventId: crypto.randomUUID(), seq: 1 } as CollaborationMessage);
    const paint = () => {
      frame = 0;
      const g = latest.current.zoom.geometryRef.current;
      const ratio = window.devicePixelRatio || 1;
      const w = viewport.clientWidth, h = viewport.clientHeight;
      if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); }
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, w, h);
      ctx.save(); ctx.beginPath(); ctx.rect((w - g.fittedWidth) / 2, (h - g.fittedHeight) / 2, g.fittedWidth, g.fittedHeight); ctx.clip();
      const project = (p: NormalizedPoint) => ({ x: (w - g.fittedWidth) / 2 + p.x * g.fittedWidth, y: (h - g.fittedHeight) / 2 + p.y * g.fittedHeight });
      const line = (points: NormalizedPoint[]) => {
        if (!points.length) return;
        ctx.beginPath(); ctx.strokeStyle = '#ffcc66'; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const first = project(points[0]); ctx.moveTo(first.x, first.y);
        if (points.length === 1) ctx.lineTo(first.x + .01, first.y);
        for (const p of points.slice(1)) { const q = project(p); ctx.lineTo(q.x, q.y); } ctx.stroke();
      };
      const capture = latest.current.channel.store.captures.get(peerId);
      if (capture?.streamId === streamId) {
        for (const stroke of capture.strokes.values()) if (stroke.expires > performance.now()) line(stroke.points);
        if (gesture) line([gesture.last, ...gesture.pending]);
        const cursor = laserLocal && laserLocal.expires > performance.now() ? laserLocal : capture.laser;
        if (cursor && cursor.expires > performance.now()) {
          const p = project(cursor.point); ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#ff5656'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        }
      }
      ctx.restore();
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
    const discard = () => {
      const id = gesture?.id; gesture = null;
      if (id !== undefined && viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
    };
    const flush = (phase: 'move' | 'end' = 'move') => {
      if (!gesture) return;
      if (gesture.expires <= performance.now()) { discard(); schedule(); return; }
      const points = gesture.pending;
      if (!points.length && phase === 'move') return;
      const ok = send({ type: 'drawing', strokeId: gesture.strokeId, phase, index: gesture.next, points });
      if (!ok) { discard(); schedule(); return; }
      gesture.next += points.length;
      gesture.last = points.at(-1) || gesture.last; gesture.pending = [];
    };
    const end = (cancel = false) => {
      if (gesture) {
        const id = gesture.id;
        if (cancel) send({ type: 'drawing', strokeId: gesture.strokeId, phase: 'cancel', index: gesture.next, points: [] });
        else flush('end');
        gesture = null;
        if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
      }
      schedule();
    };
    const point = (e: PointerEvent) => latest.current.zoom.normalizePoint(e.clientX, e.clientY);
    const down = (e: PointerEvent) => {
      if (tool === 'navigate' || !e.isPrimary || e.button !== 0 || gesture) return;
      const p = point(e); if (!p) return;
      e.preventDefault(); viewport.focus({ preventScroll: true });
      if (tool === 'laser') { laser = p; laserLocal = { point: p, expires: performance.now() + L.laserTtlMs }; schedule(); return; }
      const strokeId = crypto.randomUUID();
      if (!send({ type: 'drawing', strokeId, phase: 'start', index: 0, points: [p] })) return;
      if (!latest.current.channel.store.captures.get(peerId)?.strokes.has(strokeId)) return;
      gesture = { id: e.pointerId, strokeId, next: 1, expires: performance.now() + L.annotationTtlMs, pending: [], last: p };
      viewport.setPointerCapture(e.pointerId); schedule();
    };
    const move = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      const p = point(e);
      if (tool === 'laser') {
        laser = p; laserLocal = p ? { point: p, expires: performance.now() + L.laserTtlMs } : null; schedule();
      }
      if (gesture?.id !== e.pointerId) return;
      if (!p) { end(); return; }
      if (gesture.next + gesture.pending.length >= L.pointsPerStroke) { end(); return; }
      // Bound every batch even on high-frequency pen/touch hardware.
      if (gesture.pending.length < L.pointsPerEvent) gesture.pending.push(p);
      else gesture.pending[gesture.pending.length - 1] = p;
      schedule();
    };
    const up = (e: PointerEvent) => { if (gesture?.id === e.pointerId) end(e.type !== 'pointerup'); };
    const leave = () => { if (tool === 'laser') { laser = null; laserLocal = null; schedule(); } };
    const cancel = () => end(true);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') cancel(); };
    const timer = tool === 'navigate' ? null : setInterval(() => {
      flush();
      if (laser !== undefined) { send({ type: 'laser', point: laser }); laser = undefined; }
      if (laserLocal && laserLocal.expires <= performance.now()) { laserLocal = null; schedule(); }
    }, L.sendIntervalMs);
    const unsubscribe = channel.store.subscribe(schedule);
    const observer = new ResizeObserver(schedule); observer.observe(viewport);
    const video = viewport.querySelector('video'); video?.addEventListener('resize', schedule); video?.addEventListener('loadedmetadata', schedule);
    viewport.addEventListener('pointerdown', down); viewport.addEventListener('pointermove', move);
    viewport.addEventListener('pointerup', up); viewport.addEventListener('pointercancel', up); viewport.addEventListener('lostpointercapture', up);
    viewport.addEventListener('pointerleave', leave); viewport.addEventListener('keydown', key); window.addEventListener('blur', cancel);
    schedule();
    return () => {
      end(true); if (tool === 'laser') send({ type: 'laser', point: null });
      if (timer) clearInterval(timer);
      cancelAnimationFrame(frame); observer.disconnect(); unsubscribe();
      video?.removeEventListener('resize', schedule); video?.removeEventListener('loadedmetadata', schedule);
      viewport.removeEventListener('pointerdown', down); viewport.removeEventListener('pointermove', move);
      viewport.removeEventListener('pointerup', up); viewport.removeEventListener('pointercancel', up); viewport.removeEventListener('lostpointercapture', up);
      viewport.removeEventListener('pointerleave', leave); viewport.removeEventListener('keydown', key); window.removeEventListener('blur', cancel);
    };
  }, [channel.store, peerId, streamId, tool]);
  return <canvas ref={canvasRef} data-testid="annotation-overlay" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />;
}
