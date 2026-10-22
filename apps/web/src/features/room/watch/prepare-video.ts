import { FILE_LIMITS, FileMetadataSchema } from '@screen-room/protocol';
import { videoReadiness } from './video-readiness.ts';
import { sha256 } from '../files/file-transfer-manager.ts';

export async function prepareVideo(file: File, signal: AbortSignal, recoverClipDuration = false) {
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
    const ready = videoReadiness(video, signal, { recoverWebmDuration: recoverClipDuration && mime === 'video/webm' });
    video.preload = 'auto'; video.muted = true; video.src = url;
    const duration = await ready;
    metadata.sha256 = await sha256(source);
    if (signal.aborted) throw new Error('Preparação cancelada.');
    return { source, metadata, duration };
  } finally { video.pause(); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
}
