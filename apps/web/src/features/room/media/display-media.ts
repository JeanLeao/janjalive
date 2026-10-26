import { CAPTURE_FRAMERATE_ENVELOPE, resolveQuality, type QualitySelection } from '@screen-room/protocol';

export function canShareScreen(): boolean {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') return false;
  if (typeof window.isSecureContext === 'boolean' && !window.isSecureContext) return false;
  return Boolean(
    navigator.mediaDevices &&
    typeof navigator.mediaDevices.getDisplayMedia === 'function'
  );
}

export function getShareSupportMessage(): string {
  if (typeof window === 'undefined') return 'Ambiente não suportado.';
  if (!window.isSecureContext) {
    return 'O compartilhamento exige HTTPS ou localhost. Abra pelo endereço https:// ou http://localhost:3001.';
  }
  if (!navigator.mediaDevices) {
    return 'Este navegador não disponibilizou os recursos de mídia. Teste no Chrome, Edge ou Firefox para computador.';
  }
  return 'Este navegador não oferece compartilhamento de tela. Teste no Chrome ou Edge atualizado no computador.';
}

export function formatSharingErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return 'Falha ao iniciar o compartilhamento de tela.';
  }

  const err = error as { name?: string; message?: string };
  const messages: Record<string, string> = {
    NotAllowedError: 'Permissão recusada ou compartilhamento cancelado. Clique novamente e escolha uma tela/aba.',
    AbortError: 'O seletor de tela foi fechado antes de escolher uma fonte.',
    NotFoundError: 'Nenhuma tela ou janela disponível para compartilhar.',
    NotReadableError: 'O sistema operacional não permitiu ler a tela. Feche outro gravador/aplicativo de captura e tente novamente.',
    InvalidStateError: 'A página perdeu o foco. Clique na página e tente compartilhar novamente.',
    SecurityError: 'O navegador bloqueou a captura. Use o endereço HTTPS público e não um iframe.',
    TypeError: 'O navegador rejeitou as opções de captura. Teste Chrome/Edge atualizado no computador.',
  };

  return messages[err.name ?? ''] || `Falha ${err.name || 'desconhecida'}: ${err.message || 'o navegador não informou o motivo.'}`;
}

export async function captureDisplayMedia(quality: QualitySelection, onCaptured?: (stream: MediaStream) => void): Promise<MediaStream> {
  if (!canShareScreen()) {
    throw new Error(getShareSupportMessage());
  }

  const profile = resolveQuality(quality);

  // IMPORTANT: We only request display media with audio from the screen/tab.
  // This screen capture never requests microphone permissions; optional video-only
  // camera capture is owned separately by CameraController.
  const constraints: DisplayMediaStreamOptions = {
    video: {
      // Chromium fixes native source capabilities from the initial ideal as well
      // as max. Reserve 60 here, then constrain the unpublished track below.
      frameRate: { ideal: CAPTURE_FRAMERATE_ENVELOPE, max: CAPTURE_FRAMERATE_ENVELOPE },
      width: { ideal: profile.width, max: profile.width },
      height: { ideal: profile.height, max: profile.height },
    },
    audio: true,
  };

  const stream = await navigator.mediaDevices.getDisplayMedia(constraints);
  // Register ownership immediately: session cleanup must not wait for constraints.
  try { onCaptured?.(stream); }
  catch (error) { stopAllTracks(stream); throw error; }
  await applyCaptureQuality(stream.getVideoTracks()[0], quality);
  return stream;
}

export function setStreamAudioMuted(stream: MediaStream | null, muted: boolean): void {
  if (!stream) return;
  for (const track of stream.getAudioTracks()) {
    track.enabled = !muted;
  }
}

export function stopAllTracks(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try {
      track.stop();
    } catch {
      // ignore
    }
  }
}

// Shared by initial capture, previews and active senders; never changes audio/enabled.
async function applyTrackQuality(track: MediaStreamTrack | undefined, quality: QualitySelection): Promise<boolean> {
  if (!track || track.readyState === 'ended') return true;
  const profile = resolveQuality(quality);
  let complete = true;
  try {
    if ('contentHint' in track) {
      track.contentHint = profile.contentHint;
      complete = track.contentHint === profile.contentHint;
    } else complete = false;
  } catch { complete = false; }
  try {
    if (!track.applyConstraints) return false;
    const capabilities = track.getCapabilities?.() ?? {};
    const bound = (value: number, range?: { max?: number; min?: number }) => {
      const max = Math.min(value, range?.max ?? value);
      // A source's minimum can exceed the requested ceiling; do not silently raise it.
      return { ideal: max, max };
    };
    await track.applyConstraints({
      width: bound(profile.width, capabilities.width),
      height: bound(profile.height, capabilities.height),
      frameRate: bound(profile.maxFramerate, capabilities.frameRate),
    });
    const settings = track.getSettings?.();
    if (!settings || settings.width === undefined || settings.height === undefined || settings.frameRate === undefined) complete = false;
    else if (settings.width > profile.width || settings.height > profile.height || settings.frameRate > profile.maxFramerate) complete = false;
  } catch { complete = false; }
  return complete;
}

const captureUpdates = new WeakMap<MediaStreamTrack, Promise<boolean>>();
export function applyCaptureQuality(track: MediaStreamTrack | undefined, quality: QualitySelection): Promise<boolean> {
  if (!track) return Promise.resolve(true);
  const operation = (captureUpdates.get(track) ?? Promise.resolve(true)).catch(() => false)
    .then(() => applyTrackQuality(track, quality));
  captureUpdates.set(track, operation);
  return operation;
}
