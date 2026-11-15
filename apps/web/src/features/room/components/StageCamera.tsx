import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button, Popover, Text } from '@mantine/core';
import './StageCamera.css';

export interface CameraView {
  mode: 'overlay' | 'separate' | 'hidden';
  position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

const STORAGE_KEY_GEOM = 'screen_room_camera_pip_geom';

interface PipGeometry {
  x: number;
  y: number;
  width: number;
}

function loadSavedGeom(): PipGeometry | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_GEOM);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number' && typeof parsed.width === 'number') {
      return parsed;
    }
  } catch {
    // ignore corrupted localStorage
  }
  return null;
}

function saveGeom(geom: PipGeometry) {
  try {
    localStorage.setItem(STORAGE_KEY_GEOM, JSON.stringify(geom));
  } catch {
    // ignore localStorage errors
  }
}

/** Playback only: never owns capture, senders, screen transforms or audio routing. */
export function StageCamera({ stream, name, position }: { stream: MediaStream; name: string; position: CameraView['position'] }) {
  const video = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [geom, setGeom] = useState<PipGeometry | null>(() => loadSavedGeom());

  // Drag & resize interaction state
  const interactionRef = useRef<{
    type: 'drag' | 'resize';
    startX: number;
    startY: number;
    initialX: number;
    initialY: number;
    initialWidth: number;
  } | null>(null);

  useLayoutEffect(() => {
    const element = video.current!;
    const tracks = new Set<MediaStreamTrack>();
    const sync = () => {
      for (const track of stream.getVideoTracks()) {
        if (!tracks.has(track)) {
          tracks.add(track);
          track.addEventListener('ended', sync);
          track.addEventListener('mute', sync);
          track.addEventListener('unmute', sync);
        }
      }
      setAvailable(stream.getVideoTracks().some(track => track.readyState === 'live' && !track.muted));
    };
    element.muted = true;
    element.srcObject = stream;
    let current = true;
    const failed = () => { if (current) setAvailable(false); };
    element.addEventListener('error', failed);
    sync();
    void element.play().catch(failed);
    stream.addEventListener('addtrack', sync);
    stream.addEventListener('removetrack', sync);
    return () => {
      current = false;
      element.removeEventListener('error', failed);
      element.srcObject = null;
      stream.removeEventListener('addtrack', sync);
      stream.removeEventListener('removetrack', sync);
      for (const track of tracks) {
        track.removeEventListener('ended', sync);
        track.removeEventListener('mute', sync);
        track.removeEventListener('unmute', sync);
      }
    };
  }, [stream]);

  // Clamp current geom to parent dimensions with corner snapping
  const clampGeom = useCallback((current: PipGeometry, parentW: number, parentH: number, snap = false): PipGeometry => {
    const maxWidth = Math.max(160, Math.min(480, parentW * 0.45));
    const width = Math.min(maxWidth, Math.max(160, current.width));
    const height = (width * 9) / 16;
    const maxX = Math.max(0, parentW - width);
    const maxY = Math.max(0, parentH - height);

    let x = Math.min(maxX, Math.max(0, current.x));
    let y = Math.min(maxY, Math.max(0, current.y));

    if (snap) {
      const SNAP_THRESHOLD = 32;
      // Snap to left or right margin (12px inset / margin)
      if (x < SNAP_THRESHOLD) x = 12;
      else if (maxX - x < SNAP_THRESHOLD) x = Math.max(0, maxX - 12);

      // Snap to top or bottom margin (12px inset / margin)
      if (y < SNAP_THRESHOLD) y = 12;
      else if (maxY - y < SNAP_THRESHOLD) y = Math.max(0, maxY - 12);
    }

    return {
      width,
      x,
      y,
    };
  }, []);

  // Keep within bounds on container resize
  useEffect(() => {
    const container = containerRef.current;
    const parent = container?.parentElement;
    if (!parent || typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width: parentW, height: parentH } = entry.contentRect;
        if (parentW > 0 && parentH > 0) {
          setGeom(prev => {
            if (!prev) return null;
            const clamped = clampGeom(prev, parentW, parentH);
            if (clamped.x !== prev.x || clamped.y !== prev.y || clamped.width !== prev.width) {
              saveGeom(clamped);
              return clamped;
            }
            return prev;
          });
        }
      }
    });

    observer.observe(parent);
    return () => observer.disconnect();
  }, [clampGeom]);

  const onDragPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('.stage-camera-resize-handle, .stage-camera-overlay-controls')) return;
    const container = containerRef.current;
    const parent = container?.parentElement;
    if (!container || !parent) return;

    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const parentRect = parent.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const currentX = geom ? geom.x : containerRect.left - parentRect.left;
    const currentY = geom ? geom.y : containerRect.top - parentRect.top;
    const currentW = geom ? geom.width : containerRect.width;

    interactionRef.current = {
      type: 'drag',
      startX: e.clientX,
      startY: e.clientY,
      initialX: currentX,
      initialY: currentY,
      initialWidth: currentW,
    };
    setIsDragging(true);
  };

  const onResizePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const container = containerRef.current;
    const parent = container?.parentElement;
    if (!container || !parent) return;

    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);

    const parentRect = parent.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const currentX = geom ? geom.x : containerRect.left - parentRect.left;
    const currentY = geom ? geom.y : containerRect.top - parentRect.top;
    const currentW = geom ? geom.width : containerRect.width;

    interactionRef.current = {
      type: 'resize',
      startX: e.clientX,
      startY: e.clientY,
      initialX: currentX,
      initialY: currentY,
      initialWidth: currentW,
    };
    setIsDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const inter = interactionRef.current;
    if (!inter) return;
    const container = containerRef.current;
    const parent = container?.parentElement;
    if (!parent) return;

    const parentRect = parent.getBoundingClientRect();

    if (inter.type === 'drag') {
      const deltaX = e.clientX - inter.startX;
      const deltaY = e.clientY - inter.startY;
      const target: PipGeometry = {
        width: inter.initialWidth,
        x: inter.initialX + deltaX,
        y: inter.initialY + deltaY,
      };
      const clamped = clampGeom(target, parentRect.width, parentRect.height);
      setGeom(clamped);
    } else if (inter.type === 'resize') {
      const deltaX = e.clientX - inter.startX;
      const targetWidth = inter.initialWidth + deltaX;
      const target: PipGeometry = {
        width: targetWidth,
        x: inter.initialX,
        y: inter.initialY,
      };
      const clamped = clampGeom(target, parentRect.width, parentRect.height);
      setGeom(clamped);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const inter = interactionRef.current;
    if (!inter) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    interactionRef.current = null;
    setIsDragging(false);

    const container = containerRef.current;
    const parent = container?.parentElement;
    if (parent && inter.type === 'drag') {
      const parentRect = parent.getBoundingClientRect();
      setGeom(current => {
        if (!current) return null;
        const snapped = clampGeom(current, parentRect.width, parentRect.height, true);
        saveGeom(snapped);
        return snapped;
      });
    } else {
      setGeom(current => {
        if (current) saveGeom(current);
        return current;
      });
    }
  };

  const adjustSize = (step: number) => {
    const container = containerRef.current;
    const parent = container?.parentElement;
    if (!container || !parent) return;
    const parentRect = parent.getBoundingClientRect();
    const currentW = geom ? geom.width : container.getBoundingClientRect().width;
    const currentX = geom ? geom.x : container.getBoundingClientRect().left - parentRect.left;
    const currentY = geom ? geom.y : container.getBoundingClientRect().top - parentRect.top;

    const target: PipGeometry = {
      width: currentW + step,
      x: currentX,
      y: currentY,
    };
    const clamped = clampGeom(target, parentRect.width, parentRect.height);
    saveGeom(clamped);
    setGeom(clamped);
  };

  const resetGeom = () => {
    try {
      localStorage.removeItem(STORAGE_KEY_GEOM);
    } catch {
      // ignore
    }
    setGeom(null);
  };

  const containerStyle: React.CSSProperties = geom
    ? {
        position: 'absolute',
        left: `${geom.x}px`,
        top: `${geom.y}px`,
        width: `${geom.width}px`,
        height: `${(geom.width * 9) / 16}px`,
        inset: 'unset',
      }
    : {};

  return (
    <div
      ref={containerRef}
      className={`stage-camera-container ${isDragging ? 'is-dragging' : ''}`}
      style={containerStyle}
      hidden={!available}
      onPointerDown={onDragPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <video
        ref={video}
        className="stage-camera-video"
        data-position={position}
        data-testid="stage-camera"
        aria-label={`Câmera de ${name}`}
        hidden={!available}
        autoPlay
        playsInline
        muted
        disablePictureInPicture
      />
      <div className="stage-camera-overlay-controls">
        <button
          type="button"
          className="stage-camera-overlay-btn"
          title="Diminuir tamanho da câmera"
          aria-label="Diminuir câmera"
          onClick={e => {
            e.stopPropagation();
            adjustSize(-30);
          }}
        >
          -
        </button>
        <button
          type="button"
          className="stage-camera-overlay-btn"
          title="Aumentar tamanho da câmera"
          aria-label="Aumentar câmera"
          onClick={e => {
            e.stopPropagation();
            adjustSize(30);
          }}
        >
          +
        </button>
        {geom && (
          <button
            type="button"
            className="stage-camera-overlay-btn"
            title="Resetar posição e tamanho padrão"
            aria-label="Resetar câmera"
            onClick={e => {
              e.stopPropagation();
              resetGeom();
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
        )}
      </div>
      <div
        className="stage-camera-resize-handle"
        aria-label="Redimensionar câmera"
        onPointerDown={onResizePointerDown}
      />
    </div>
  );
}

export function StageCameraControls({ view, onChange, target }: {
  view: CameraView; onChange: (view: CameraView) => void; target?: HTMLElement;
}) {
  return <Popover position="left-start" width={240} trapFocus returnFocus portalProps={{ target }}>
    <Popover.Target><Button variant="subtle" color="gray" aria-label="Visualização da câmera" title="Visualização da câmera" data-control-id="camera-view">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><rect x="3" y="5" width="13" height="14" rx="2" /><path d="m16 10 5-3v10l-5-3" /></svg>
    </Button></Popover.Target>
    <Popover.Dropdown className="stage-camera-menu">
      <Text size="sm" fw={600}>Câmera no seu palco</Text>
      <label>Visualização<select aria-label="Modo da câmera" value={view.mode} onChange={event => onChange({ ...view, mode: event.target.value as CameraView['mode'] })}>
        <option value="overlay">Sobreposta</option><option value="separate">Separada</option><option value="hidden">Oculta</option>
      </select></label>
      {view.mode === 'overlay' && <label>Posição<select aria-label="Posição da câmera" value={view.position} onChange={event => onChange({ ...view, position: event.target.value as CameraView['position'] })}>
        <option value="top-left">Superior esquerdo</option><option value="top-right">Superior direito</option>
        <option value="bottom-left">Inferior esquerdo</option><option value="bottom-right">Inferior direito</option>
      </select></label>}
      <Text size="xs" c="dimmed" mt="xs">Só muda sua visualização nesta sessão. Ocultar não desliga a transmissão da câmera.</Text>
    </Popover.Dropdown>
  </Popover>;
}
