import { useEffect, useRef, useState } from 'react';
import { COLLABORATION_LIMITS as L, type CollaborationMessage, type NormalizedPoint } from '@screen-room/protocol';
import type { LiveAnnotations, SpectatorPointer } from '../collaboration/live-annotations';
import type { useVideoZoom } from '../hooks/useVideoZoom';
import { formatDisplayName, getAvatarColor } from '../utils/avatar';

export type AnnotationTool = 'navigate' | 'laser' | 'draw' | 'point';
export interface AnnotationChannel {
  store: LiveAnnotations;
  send: (message: CollaborationMessage) => boolean;
  available: boolean;
}

const PARTICIPANT_STROKE_COLORS = [
  { stroke: '#38bdf8', bg: '#0369a1' }, // sky blue
  { stroke: '#a855f7', bg: '#6b21a8' }, // purple
  { stroke: '#34d399', bg: '#047857' }, // emerald
  { stroke: '#f472b6', bg: '#be185d' }, // pink
  { stroke: '#fb923c', bg: '#c2410c' }, // orange
  { stroke: '#2dd4bf', bg: '#0f766e' }, // teal
  { stroke: '#818cf8', bg: '#4338ca' }, // indigo
  { stroke: '#facc15', bg: '#854d0e' }, // yellow
];

export function getParticipantStrokeColor(peerId: string, nickname?: string): { stroke: string; bg: string } {
  const seed = nickname || peerId;
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PARTICIPANT_STROKE_COLORS.length;
  return PARTICIPANT_STROKE_COLORS[index];
}

export interface CollaborativeAuthorBadge {
  peerId: string;
  nickname?: string;
  point: NormalizedPoint;
  color: { stroke: string; bg: string };
}

export function AnnotationOverlay({
  channel,
  peerId,
  streamId,
  tool,
  zoom,
  localPeerId,
  onToolComplete,
}: {
  channel: AnnotationChannel;
  peerId: string;
  streamId: string;
  tool: AnnotationTool;
  zoom: ReturnType<typeof useVideoZoom>;
  localPeerId?: string;
  onToolComplete?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef({ channel, zoom, onToolComplete });
  latest.current = { channel, zoom, onToolComplete };
  const [pointers, setPointers] = useState<SpectatorPointer[]>([]);
  const [collaborativeAuthors, setCollaborativeAuthors] = useState<CollaborativeAuthorBadge[]>([]);
  const [aimPoint, setAimPoint] = useState<NormalizedPoint | null>(null);
  const [layoutBox, setLayoutBox] = useState({ width: 0, height: 0, fittedWidth: 0, fittedHeight: 0 });

  useEffect(() => {
    if (tool === 'point') {
      setAimPoint({ x: 0.5, y: 0.5 });
    } else {
      setAimPoint(null);
    }
  }, [tool, streamId, peerId]);

  useEffect(() => {
    const canvas = canvasRef.current, viewport = zoom.viewportRef.current;
    if (!canvas || !viewport) return;
    let frame = 0;
    let gesture: { id: number; strokeId: string; next: number; expires: number; pending: NormalizedPoint[]; last: NormalizedPoint } | null = null;
    let laser: NormalizedPoint | null | undefined;
    let laserLocal: { point: NormalizedPoint; expires: number } | null = null;
    let aim: NormalizedPoint | null = tool === 'point' ? { x: 0.5, y: 0.5 } : null;
    const send = (event: object) => latest.current.channel.send({ ...event, streamId, eventId: crypto.randomUUID(), seq: 1 } as CollaborationMessage);
    const paint = () => {
      frame = 0;
      const g = latest.current.zoom.geometryRef.current;
      setLayoutBox((prev) =>
        prev.width === g.width && prev.height === g.height && prev.fittedWidth === g.fittedWidth && prev.fittedHeight === g.fittedHeight
          ? prev
          : { width: g.width, height: g.height, fittedWidth: g.fittedWidth, fittedHeight: g.fittedHeight }
      );
      const ratio = window.devicePixelRatio || 1;
      const w = viewport.clientWidth, h = viewport.clientHeight;
      if (canvas.width !== Math.round(w * ratio) || canvas.height !== Math.round(h * ratio)) { canvas.width = Math.round(w * ratio); canvas.height = Math.round(h * ratio); }
      const ctx = canvas.getContext('2d'); if (!ctx) return;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0); ctx.clearRect(0, 0, w, h);
      ctx.save(); ctx.beginPath(); ctx.rect((w - g.fittedWidth) / 2, (h - g.fittedHeight) / 2, g.fittedWidth, g.fittedHeight); ctx.clip();
      const project = (p: NormalizedPoint) => ({ x: (w - g.fittedWidth) / 2 + p.x * g.fittedWidth, y: (h - g.fittedHeight) / 2 + p.y * g.fittedHeight });
      const lineWithColor = (points: NormalizedPoint[], strokeColor: string) => {
        if (!points.length) return;
        ctx.beginPath(); ctx.strokeStyle = strokeColor; ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const first = project(points[0]); ctx.moveTo(first.x, first.y);
        if (points.length === 1) ctx.lineTo(first.x + .01, first.y);
        for (const p of points.slice(1)) { const q = project(p); ctx.lineTo(q.x, q.y); } ctx.stroke();
      };
      const now = performance.now();
      const capture = latest.current.channel.store.captures.get(peerId);
      const activePointers: SpectatorPointer[] = [];
      const activeAuthorsMap = new Map<string, CollaborativeAuthorBadge>();
      if (capture?.streamId === streamId) {
        for (const stroke of capture.strokes.values()) if (stroke.expires > now) lineWithColor(stroke.points, '#ffcc66');
        for (const stroke of capture.collaborativeStrokes.values()) {
          if (stroke.expires > now) {
            const color = getParticipantStrokeColor(stroke.senderPeerId, stroke.senderNickname);
            lineWithColor(stroke.points, color.stroke);
            if (stroke.points.length > 0) {
              activeAuthorsMap.set(stroke.senderPeerId, {
                peerId: stroke.senderPeerId,
                nickname: stroke.senderNickname,
                point: stroke.points[0],
                color,
              });
            }
          }
        }
        if (gesture) {
          const isPresenter = peerId === localPeerId;
          if (isPresenter) {
            lineWithColor([gesture.last, ...gesture.pending], '#ffcc66');
          } else {
            const localColor = getParticipantStrokeColor(localPeerId || 'local');
            lineWithColor([gesture.last, ...gesture.pending], localColor.stroke);
            if (!activeAuthorsMap.has(localPeerId || 'local')) {
              activeAuthorsMap.set(localPeerId || 'local', {
                peerId: localPeerId || 'local',
                nickname: undefined,
                point: gesture.last,
                color: localColor,
              });
            }
          }
        }
        const cursor = laserLocal && laserLocal.expires > now ? laserLocal : capture.laser;
        if (cursor && cursor.expires > now) {
          const p = project(cursor.point); ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#ff5656'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke();
        }
        for (const ptr of capture.pointers.values()) {
          if (ptr.expires > now) {
            activePointers.push(ptr);
            const p = project(ptr.point);
            // Outer subtle halo
            ctx.beginPath();
            ctx.arc(p.x, p.y, 13, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(56, 189, 248, 0.22)';
            ctx.fill();
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#38bdf8';
            ctx.stroke();
            // Inner crisp dot
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
            ctx.fillStyle = '#38bdf8';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#ffffff';
            ctx.stroke();
          }
        }
      }
      if (tool === 'point' && aim) {
        const p = project(aim);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 10, 0, Math.PI * 2);
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.85)';
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x - 14, p.y); ctx.lineTo(p.x - 6, p.y);
        ctx.moveTo(p.x + 6, p.y); ctx.lineTo(p.x + 14, p.y);
        ctx.moveTo(p.x, p.y - 14); ctx.lineTo(p.x, p.y - 6);
        ctx.moveTo(p.x, p.y + 6); ctx.lineTo(p.x, p.y + 14);
        ctx.stroke();
      }
      ctx.restore();
      setPointers((prev) => {
        if (prev.length === 0 && activePointers.length === 0) return prev;
        if (
          prev.length === activePointers.length &&
          prev.every((item, idx) => item.eventId === activePointers[idx]?.eventId)
        ) {
          return prev;
        }
        return activePointers;
      });
      const authorsList = Array.from(activeAuthorsMap.values());
      setCollaborativeAuthors((prev) => {
        if (prev.length === 0 && authorsList.length === 0) return prev;
        if (
          prev.length === authorsList.length &&
          prev.every(
            (item, idx) =>
              item.peerId === authorsList[idx]?.peerId &&
              item.point.x === authorsList[idx]?.point.x &&
              item.point.y === authorsList[idx]?.point.y
          )
        ) {
          return prev;
        }
        return authorsList;
      });
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
      const isPresenter = peerId === localPeerId;
      const ok = isPresenter
        ? send({ type: 'drawing', strokeId: gesture.strokeId, phase, index: gesture.next, points })
        : send({ type: 'spectator-drawing', targetPeerId: peerId, strokeId: gesture.strokeId, phase, index: gesture.next, points });
      if (!ok) { discard(); schedule(); return; }
      gesture.next += points.length;
      gesture.last = points.at(-1) || gesture.last; gesture.pending = [];
    };
    const end = (cancel = false) => {
      if (gesture) {
        const id = gesture.id;
        const isPresenter = peerId === localPeerId;
        if (cancel) {
          if (isPresenter) {
            send({ type: 'drawing', strokeId: gesture.strokeId, phase: 'cancel', index: gesture.next, points: [] });
          } else {
            send({ type: 'spectator-drawing', targetPeerId: peerId, strokeId: gesture.strokeId, phase: 'cancel', index: gesture.next, points: [] });
          }
        } else {
          flush('end');
        }
        gesture = null;
        if (viewport.hasPointerCapture(id)) viewport.releasePointerCapture(id);
      }
      schedule();
    };
    const submitPoint = (p: NormalizedPoint) => {
      if (send({ type: 'point', targetPeerId: peerId, point: p })) {
        aim = null;
        setAimPoint(null);
        schedule();
        latest.current.onToolComplete?.();
      }
    };
    const point = (e: PointerEvent) => latest.current.zoom.normalizePoint(e.clientX, e.clientY);
    const down = (e: PointerEvent) => {
      if (tool === 'navigate' || !e.isPrimary || e.button !== 0 || gesture) return;
      const p = point(e); if (!p) return;
      e.preventDefault(); viewport.focus({ preventScroll: true });
      if (tool === 'point') {
        submitPoint(p);
        return;
      }
      if (tool === 'laser') { laser = p; laserLocal = { point: p, expires: performance.now() + L.laserTtlMs }; schedule(); return; }
      const strokeId = crypto.randomUUID();
      const isPresenter = peerId === localPeerId;
      const ok = isPresenter
        ? send({ type: 'drawing', strokeId, phase: 'start', index: 0, points: [p] })
        : send({ type: 'spectator-drawing', targetPeerId: peerId, strokeId, phase: 'start', index: 0, points: [p] });
      if (!ok) return;
      const capture = latest.current.channel.store.captures.get(peerId);
      const hasStroke = isPresenter
        ? capture?.strokes.has(strokeId)
        : (localPeerId ? capture?.collaborativeStrokes.has(`${localPeerId}:${strokeId}`) : true);
      if (!hasStroke) return;
      gesture = { id: e.pointerId, strokeId, next: 1, expires: performance.now() + L.annotationTtlMs, pending: [], last: p };
      viewport.setPointerCapture(e.pointerId); schedule();
    };
    const move = (e: PointerEvent) => {
      if (!e.isPrimary) return;
      const p = point(e);
      if (tool === 'point') {
        if (p) { aim = p; setAimPoint(p); schedule(); }
        return;
      }
      if (tool === 'laser') {
        laser = p; laserLocal = p ? { point: p, expires: performance.now() + L.laserTtlMs } : null; schedule();
      }
      if (gesture?.id !== e.pointerId) return;
      if (!p) { end(); return; }
      const isPresenter = peerId === localPeerId;
      const capture = latest.current.channel.store.captures.get(peerId);
      if (!isPresenter && localPeerId && capture && !capture.collaborativeStrokes.has(`${localPeerId}:${gesture.strokeId}`)) {
        discard();
        schedule();
        return;
      }
      if (gesture.next + gesture.pending.length >= L.pointsPerStroke) { end(); return; }
      // Bound every batch even on high-frequency pen/touch hardware.
      if (gesture.pending.length < L.pointsPerEvent) gesture.pending.push(p);
      else gesture.pending[gesture.pending.length - 1] = p;
      schedule();
    };
    const up = (e: PointerEvent) => { if (gesture?.id === e.pointerId) end(e.type !== 'pointerup'); };
    const leave = () => { if (tool === 'laser') { laser = null; laserLocal = null; schedule(); } };
    const cancel = () => end(true);
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        cancel();
        return;
      }
      if (tool === 'point') {
        const current = aim || { x: 0.5, y: 0.5 };
        const step = e.shiftKey ? 0.1 : 0.05;
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          aim = { x: Math.max(0, Number((current.x - step).toFixed(4))), y: current.y };
          setAimPoint(aim);
          schedule();
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          aim = { x: Math.min(1, Number((current.x + step).toFixed(4))), y: current.y };
          setAimPoint(aim);
          schedule();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          aim = { x: current.x, y: Math.max(0, Number((current.y - step).toFixed(4))) };
          setAimPoint(aim);
          schedule();
        } else if (e.key === 'ArrowDown') {
          e.preventDefault();
          aim = { x: current.x, y: Math.min(1, Number((current.y + step).toFixed(4))) };
          setAimPoint(aim);
          schedule();
        } else if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          submitPoint(current);
        }
      }
    };
    const timer = (tool === 'navigate' || tool === 'point') ? null : setInterval(() => {
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
      viewport.removeEventListener('pointerup', up); viewport.removeEventListener('pointercancel', up); viewport.addEventListener('lostpointercapture', up);
      viewport.removeEventListener('pointerleave', leave); viewport.removeEventListener('keydown', key); window.removeEventListener('blur', cancel);
    };
  }, [channel.store, peerId, streamId, tool, localPeerId]);

  const g = layoutBox.fittedWidth > 0 ? layoutBox : zoom.geometryRef.current;
  const invScale = 1 / Math.max(1, zoom.scale);

  return (
    <>
      <canvas
        ref={canvasRef}
        data-testid="annotation-overlay"
        aria-hidden
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
      />
      {g.fittedWidth > 0 && g.fittedHeight > 0 && (
        <>
          <div
            data-testid="pointing-markers-layer"
            style={{
              position: 'absolute',
              left: (g.width - g.fittedWidth) / 2,
              top: (g.height - g.fittedHeight) / 2,
              width: g.fittedWidth,
              height: g.fittedHeight,
              pointerEvents: 'none',
            }}
          >
            {pointers.map((ptr) => {
              const isLocalSender = Boolean(localPeerId && ptr.senderPeerId === localPeerId);
              const label = formatDisplayName(ptr.senderNickname, isLocalSender);
              const avatarColor = getAvatarColor(label);
              const flipX = ptr.point.x > 0.72;
              const flipY = ptr.point.y < 0.14;
              return (
                <div
                  key={ptr.eventId}
                  data-testid="spectator-pointer-marker"
                  data-sender={ptr.senderPeerId}
                  role="status"
                  aria-label={`Apontamento de ${label}`}
                  style={{
                    position: 'absolute',
                    left: `${ptr.point.x * 100}%`,
                    top: `${ptr.point.y * 100}%`,
                    width: 1,
                    height: 1,
                    transform: `scale(${invScale})`,
                    transformOrigin: '0 0',
                    pointerEvents: 'none',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      ...(flipX ? { right: 12 } : { left: 12 }),
                      ...(flipY ? { top: 10 } : { bottom: 10 }),
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '3px 9px 3px 6px',
                      borderRadius: 999,
                      backgroundColor: 'rgba(13, 17, 23, 0.92)',
                      border: '1px solid rgba(56, 189, 248, 0.5)',
                      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
                      color: '#f0f6fc',
                      fontSize: 11,
                      fontWeight: 600,
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        backgroundColor: avatarColor.text,
                        boxShadow: `0 0 0 2px ${avatarColor.bg}`,
                        flexShrink: 0,
                      }}
                    />
                    <span>{label}</span>
                  </div>
                </div>
              );
            })}
            {tool === 'point' && aimPoint && (
              <div
                data-testid="pointing-reticle"
                aria-hidden
                style={{
                  position: 'absolute',
                  left: `${aimPoint.x * 100}%`,
                  top: `${aimPoint.y * 100}%`,
                  transform: `translate(-50%, -50%) scale(${invScale})`,
                  width: 24,
                  height: 24,
                  borderRadius: '50%',
                  border: '1.5px dashed rgba(56, 189, 248, 0.85)',
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>
          <div
            data-testid="collaborative-badges-layer"
            style={{
              position: 'absolute',
              left: (g.width - g.fittedWidth) / 2,
              top: (g.height - g.fittedHeight) / 2,
              width: g.fittedWidth,
              height: g.fittedHeight,
              pointerEvents: 'none',
            }}
          >
            {collaborativeAuthors.map((author) => {
              const isLocalSender = Boolean(localPeerId && author.peerId === localPeerId);
              const label = formatDisplayName(author.nickname, isLocalSender);
              const flipX = author.point.x > 0.72;
              const flipY = author.point.y < 0.14;
              return (
                <div
                  key={author.peerId}
                  data-testid="collaborative-author-badge"
                  data-sender={author.peerId}
                  role="status"
                  aria-label={`Desenho de ${label}`}
                  style={{
                    position: 'absolute',
                    left: `${author.point.x * 100}%`,
                    top: `${author.point.y * 100}%`,
                    width: 1,
                    height: 1,
                    transform: `scale(${invScale})`,
                    transformOrigin: '0 0',
                    pointerEvents: 'none',
                  }}
                >
                  <div
                    style={{
                      position: 'absolute',
                      ...(flipX ? { right: 8 } : { left: 8 }),
                      ...(flipY ? { top: 8 } : { bottom: 8 }),
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '2px 8px 2px 6px',
                      borderRadius: 999,
                      backgroundColor: 'rgba(13, 17, 23, 0.92)',
                      border: `1px solid ${author.color.stroke}80`,
                      boxShadow: '0 2px 8px rgba(0, 0, 0, 0.4)',
                      color: '#f0f6fc',
                      fontSize: 10,
                      fontWeight: 600,
                      lineHeight: 1.2,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        backgroundColor: author.color.stroke,
                        boxShadow: `0 0 0 1.5px ${author.color.bg}`,
                        flexShrink: 0,
                      }}
                    />
                    <span>{label}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}
