import { TurnCredentialsResponseSchema } from '@screen-room/protocol';
import type { DiagnosticsLogger } from '../diagnostics/diagnostics-logger';

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
];

export async function fetchIceConfiguration(
  endpoint?: string,
  logger?: DiagnosticsLogger,
): Promise<RTCConfiguration> {
  const url = endpoint || (typeof window !== 'undefined' ? (import.meta as any).env?.VITE_TURN_URL || '/turn-credentials' : '/turn-credentials');

  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();
    const parsed = TurnCredentialsResponseSchema.safeParse(json);

    if (parsed.success && parsed.data.iceServers.length > 0) {
      const hasRelay = parsed.data.iceServers.some((s) => {
        const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
        return urls.some((u) => u.startsWith('turn:'));
      });

      logger?.log('turn-config', {
        servers: parsed.data.iceServers.length,
        relay: hasRelay,
      });

      return { iceServers: parsed.data.iceServers as RTCIceServer[] };
    }

    throw new Error('Formato inválido de resposta de servidores ICE');
  } catch (err: any) {
    logger?.log('turn-config-fallback', { message: err?.message || 'Falha ao buscar credenciais TURN' });
    return { iceServers: DEFAULT_ICE_SERVERS };
  }
}
