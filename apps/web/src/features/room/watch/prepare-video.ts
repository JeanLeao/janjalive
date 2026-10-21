import { FILE_LIMITS, FileMetadataSchema } from '@screen-room/protocol';
import { sha256 } from '../files/file-transfer-manager.ts';

export async function prepareVideo(file: File, signal: AbortSignal) {
  if (!file.size || file.size > FILE_LIMITS.maxBytes) throw new Error('Escolha um vídeo de até 20 MiB, não vazio.');
  const mime = /\.mp4$/i.test(file.name) ? 'video/mp4' : /\.webm$/i.test(file.name) ? 'video/webm' : file.type;
  if (!['video/mp4', 'video/webm'].includes(mime)) throw new Error('Escolha um vídeo MP4 ou WebM.');
  const metadata = { name: file.name, mime, size: file.size, sha256: '0'.repeat(64) };
  if (!FileMetadataSchema.safeParse(metadata).success) throw new Error('Nome ou metadados de vídeo inválidos.');
  const source = file.slice(0, file.size, mime);
  const video = document.createElement('video');
  if (!video.canPlayType(mime)) throw new Error('Este navegador não oferece suporte a esse formato.');
  const url = URL.createObjectURL(source);
  try {
    const duration = await new Promise<number>((resolve, reject) => {
      const finish = (error?: string) => {
        clearTimeout(timer); signal.removeEventListener('abort', abort);
        video.onloadeddata = null; video.onerror = null;
        if (error) reject(new Error(error));
        else if (!Number.isFinite(video.duration) || video.duration <= 0 || !video.videoWidth || !video.videoHeight) reject(new Error('Metadados de vídeo inválidos.'));
        else resolve(video.duration);
      };
      const abort = () => finish('Preparação cancelada.');
      const timer = setTimeout(() => finish('Não foi possível decodificar o vídeo. Escolha outro arquivo.'), 15_000);
      video.onloadeddata = () => finish();
      video.onerror = () => finish('Codec ou arquivo incompatível. Escolha outro vídeo.');
      signal.addEventListener('abort', abort, { once: true });
      video.preload = 'auto'; video.muted = true; video.src = url;
      if (signal.aborted) abort();
    });
    metadata.sha256 = await sha256(source);
    if (signal.aborted) throw new Error('Preparação cancelada.');
    return { source, metadata, duration };
  } finally { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}
