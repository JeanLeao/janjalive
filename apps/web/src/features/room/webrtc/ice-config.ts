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
  const iceTransportPolicy: RTCIceTransportPolicy = (import.meta as any).env?.VITE_ICE_TRANSPORT_POLICY === 'relay' ? 'relay' : 'all';
  const url = endpoint || (typeof window !== 'undefined' ? (import.meta as any).env?.VITE_TURN_URL || '/turn-credentials' : '/turn-credentials');

  try {
    const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const json = await response.json();
    const parsed = TurnCredentialsResponseSchema.safeParse(json);

    if (parsed.success && parsed.data.iceServers.length > 0) {
      const hasRelay = parsed.data.iceServers.some((s) => {
        const urls = Array.isArray(s.urls) ? s.urls : [s.urls];
        return urls.some((u) => /^turns?:/.test(u));
      });

      logger?.log('turn-config', {
        servers: parsed.data.iceServers.length,
        relay: hasRelay,
      });

      return { iceServers: parsed.data.iceServers as RTCIceServer[], iceTransportPolicy };
    }

    throw new Error('Formato inválido de resposta de servidores ICE');
  } catch (err: any) {
    logger?.log('turn-config-fallback', { message: err?.message || 'Falha ao buscar credenciais TURN' });
    return { iceServers: DEFAULT_ICE_SERVERS, iceTransportPolicy };
  }
}
