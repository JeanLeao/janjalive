/**
 * Utility functions for capturing and exporting video screenshots in Janjalive.
 * Exclusively captures the decoded video frame at intrinsic resolution,
 * ignoring CSS zoom/pan, annotations, and UI overlays.
 */

export function formatScreenshotFilename(date: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = date.getFullYear();
  const mm = pad(date.getMonth() + 1);
  const dd = pad(date.getDate());
  const hh = pad(date.getHours());
  const min = pad(date.getMinutes());
  const ss = pad(date.getSeconds());
  return `janjalive-${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}.png`;
}

export function isScreenshotAvailable(
  video: HTMLVideoElement | null,
  stream: MediaStream | null,
  isPaused = false
): boolean {
  if (!video || !stream || isPaused) return false;
  if (video.videoWidth <= 0 || video.videoHeight <= 0) return false;
  // HAVE_CURRENT_DATA = 2: data for the current playback position is available
  if (typeof video.readyState === 'number' && video.readyState < 2) return false;
  const tracks = stream.getVideoTracks();
  return tracks.length > 0 && tracks.some((track) => track.readyState === 'live');
}

export async function captureVideoFrame(video: HTMLVideoElement): Promise<Blob> {
  const width = video.videoWidth;
  const height = video.videoHeight;
  if (width <= 0 || height <= 0) {
    throw new Error('Dimensões do vídeo indisponíveis para captura');
  }
  if (typeof video.readyState === 'number' && video.readyState < 2) {
    throw new Error('Quadro de vídeo indisponível para captura');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Contexto 2D indisponível para captura');
  }

  ctx.drawImage(video, 0, 0, width, height);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Falha ao exportar quadro em formato PNG'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    // Delay revocation slightly so the browser download manager can initiate the stream
    setTimeout(() => {
      try {
        URL.revokeObjectURL(url);
      } catch {
        // Ignore if already revoked
      }
    }, 1000);
  }
}
