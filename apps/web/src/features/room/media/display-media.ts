import { QUALITY_PROFILES, type QualityProfileKey } from '@screen-room/protocol';

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

export async function captureDisplayMedia(quality: QualityProfileKey): Promise<MediaStream> {
  if (!canShareScreen()) {
    throw new Error(getShareSupportMessage());
  }

  const profile = QUALITY_PROFILES[quality] || QUALITY_PROFILES.balanced;

  // IMPORTANT: We only request display media with audio from the screen/tab.
  // We NEVER call getUserMedia and NEVER request microphone permissions!
  const constraints: DisplayMediaStreamOptions = {
    video: {
      frameRate: { ideal: profile.maxFramerate, max: profile.maxFramerate },
      width: { ideal: profile.width, max: profile.width },
      height: { ideal: profile.height, max: profile.height },
    },
    audio: true,
  };

  return navigator.mediaDevices.getDisplayMedia(constraints);
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
