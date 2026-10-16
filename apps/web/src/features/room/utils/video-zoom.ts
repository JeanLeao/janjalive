export interface ZoomGeometry { width: number; height: number; fittedWidth: number; fittedHeight: number }
export interface ZoomView { scale: number; x: number; y: number }
export const initialView: ZoomView = { scale: 1, x: 0, y: 0 };
export function fitVideo(width: number, height: number, videoWidth: number, videoHeight: number): ZoomGeometry {
  const ratio = videoWidth > 0 && videoHeight > 0 ? Math.min(width / videoWidth, height / videoHeight) : 0;
  return { width, height, fittedWidth: videoWidth * ratio, fittedHeight: videoHeight * ratio };
}
export function constrainView(view: ZoomView, g: ZoomGeometry): ZoomView {
  const scale = Math.max(1, Math.min(3, view.scale));
  const boundX = Math.max(0, (g.fittedWidth * scale - g.width) / 2);
  const boundY = Math.max(0, (g.fittedHeight * scale - g.height) / 2);
  return { scale, x: Math.max(-boundX, Math.min(boundX, view.x)) || 0, y: Math.max(-boundY, Math.min(boundY, view.y)) || 0 };
}
export function zoomAt(view: ZoomView, delta: number, g: ZoomGeometry, x = 0, y = 0): ZoomView {
  const scale = Math.max(1, Math.min(3, view.scale + delta));
  const ratio = scale / view.scale;
  return constrainView({ scale, x: x - (x - view.x) * ratio, y: y - (y - view.y) * ratio }, g);
}

/** Input is relative to the viewport center, before undoing local pan/zoom. */
export function normalizeVideoPoint(x: number, y: number, view: ZoomView, g: ZoomGeometry) {
  if (!g.fittedWidth || !g.fittedHeight) return null;
  const point = { x: ((x - view.x) / view.scale) / g.fittedWidth + .5,
    y: ((y - view.y) / view.scale) / g.fittedHeight + .5 };
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1 ? point : null;
}
