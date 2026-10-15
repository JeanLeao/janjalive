import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { constrainView, fitVideo, initialView, zoomAt } from '../utils/video-zoom';

// Movement stays in refs and is painted once per frame; it never updates the session.
export function useVideoZoom(videoRef: RefObject<HTMLVideoElement | null>, stream: MediaStream | null) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const changeRef = useRef<(delta?: number) => void>(() => {});
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const viewport = viewportRef.current, video = videoRef.current;
    if (!viewport || !video) return;
    let view = { ...initialView };
    let geometry = fitVideo(0, 0, 0, 0);
    let frame = 0;
    let drag: { id: number; x: number; y: number } | null = null;
    const paint = () => {
      frame = 0;
      video.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
      viewport.style.cursor = view.scale > 1 ? drag ? 'grabbing' : 'grab' : 'default';
      viewport.style.touchAction = view.scale > 1 ? 'none' : 'auto';
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(paint); };
    const endDrag = () => {
      if (drag && viewport.hasPointerCapture(drag.id)) viewport.releasePointerCapture(drag.id);
      drag = null;
      schedule();
    };
    const change = (delta?: number, x = 0, y = 0) => {
      endDrag();
      view = delta === undefined ? { ...initialView } : zoomAt(view, delta, geometry, x, y);
      setScale(view.scale);
      schedule();
    };
    changeRef.current = change;
    const measure = () => {
      endDrag();
      const next = fitVideo(viewport.clientWidth, viewport.clientHeight, video.videoWidth, video.videoHeight);
      // Preserve the normalized focal position across resize and resolution changes.
      view = constrainView({ ...view,
        x: geometry.fittedWidth ? view.x * next.fittedWidth / geometry.fittedWidth : 0,
        y: geometry.fittedHeight ? view.y * next.fittedHeight / geometry.fittedHeight : 0,
      }, next);
      geometry = next;
      schedule();
    };
    const point = (event: MouseEvent) => {
      const rect = viewport.getBoundingClientRect();
      return { x: event.clientX - rect.left - rect.width / 2, y: event.clientY - rect.top - rect.height / 2 };
    };
    const onImage = (p: { x: number; y: number }) =>
      Math.abs(p.x - view.x) <= geometry.fittedWidth * view.scale / 2 &&
      Math.abs(p.y - view.y) <= geometry.fittedHeight * view.scale / 2;
    const wheel = (event: WheelEvent) => {
      const p = point(event);
      if (!onImage(p) || event.deltaY === 0 || event.ctrlKey || event.metaKey) return;
      event.preventDefault();
      change(event.deltaY < 0 ? 0.25 : -0.25, p.x, p.y);
    };
    const down = (event: PointerEvent) => {
      if (drag || !event.isPrimary || event.button !== 0 || view.scale === 1 || !onImage(point(event))) return;
      event.preventDefault();
      drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
      viewport.setPointerCapture(event.pointerId);
      schedule();
    };
    const move = (event: PointerEvent) => {
      if (!drag || drag.id !== event.pointerId) return;
      view = constrainView({ ...view, x: view.x + event.clientX - drag.x, y: view.y + event.clientY - drag.y }, geometry);
      drag.x = event.clientX; drag.y = event.clientY;
      schedule();
    };
    const end = (event: PointerEvent) => { if (drag?.id === event.pointerId) endDrag(); };
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    video.addEventListener('loadedmetadata', measure);
    video.addEventListener('resize', measure);
    viewport.addEventListener('wheel', wheel, { passive: false });
    viewport.addEventListener('pointerdown', down);
    viewport.addEventListener('pointermove', move);
    viewport.addEventListener('pointerup', end);
    viewport.addEventListener('pointercancel', end);
    viewport.addEventListener('lostpointercapture', end);
    window.addEventListener('blur', endDrag);
    setScale(1);
    measure();
    cancelAnimationFrame(frame);
    paint();
    return () => {
      endDrag();
      cancelAnimationFrame(frame);
      observer.disconnect();
      video.removeEventListener('loadedmetadata', measure);
      video.removeEventListener('resize', measure);
      viewport.removeEventListener('wheel', wheel);
      viewport.removeEventListener('pointerdown', down);
      viewport.removeEventListener('pointermove', move);
      viewport.removeEventListener('pointerup', end);
      viewport.removeEventListener('pointercancel', end);
      viewport.removeEventListener('lostpointercapture', end);
      window.removeEventListener('blur', endDrag);
      changeRef.current = () => {};
    };
  }, [stream, videoRef]);
  return { viewportRef, scale, changeZoom: (delta?: number) => changeRef.current(delta) };
}
