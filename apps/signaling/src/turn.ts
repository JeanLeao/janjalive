import { readFileSync } from 'node:fs';
import { createHmac, randomUUID } from 'node:crypto';
import type { TurnCredentialsResponse } from '@screen-room/protocol';

export const DEFAULT_STUN_SERVER = 'stun:stun.l.google.com:19302';

export interface TurnConfig {
  enabled: boolean;
  host?: string;
  secret?: string;
  ttlSeconds?: number;
}

export function readSecretFromFile(filePath: string): string | null {
  try {
    const content = readFileSync(filePath, 'utf8').trim();
    return content || null;
  } catch {
    return null;
  }
}

/**
 * Loads and validates TURN configuration from environment variables or options.
 * Caches the secret in memory (PERF-01).
 *
 * Rules (CFG-01):
 * 1. If secret is present (via TURN_SECRET or TURN_SECRET_FILE), TURN is enabled.
 * 2. When TURN is enabled, TURN_HOST is strictly required. If missing or invalid, throws an Error.
 * 3. When no secret is configured, returns STUN-only mode (enabled: false).
 */
export function loadTurnConfig(env: NodeJS.ProcessEnv = process.env): TurnConfig {
  let secret: string | null = null;

  if (env.TURN_SECRET_FILE) {
    secret = readSecretFromFile(env.TURN_SECRET_FILE);
    if (!secret && !env.TURN_SECRET) {
      throw new Error(`Arquivo de segredo TURN não encontrado ou vazio: ${env.TURN_SECRET_FILE}`);
    }
  } else {
    secret = readSecretFromFile('/etc/screen-room/turn-secret');
  }

  if (!secret && env.TURN_SECRET) {
    secret = env.TURN_SECRET.trim();
  }

  if (!secret) {
    return { enabled: false };
  }

  const rawHost = env.TURN_HOST?.trim();
  if (!rawHost) {
    throw new Error('Configuração TURN inválida: TURN_HOST é obrigatório quando o segredo TURN está configurado');
  }

  const host = rawHost.replace(/^[a-z]+:\/\//i, '').replace(/\/+$/, '').split(':')[0].trim();
  if (!host) {
    throw new Error('Configuração TURN inválida: TURN_HOST informado é inválido');
  }

  return {
    enabled: true,
    host,
    secret,
    ttlSeconds: Number(env.TURN_TTL_SECONDS) || 3600,
  };
}

/**
 * Creates a generator function for TURN credentials with a cached configuration (PERF-01).
 */
export function createTurnCredentialsProvider(config: TurnConfig = loadTurnConfig()) {
  return function getTurnCredentials(): TurnCredentialsResponse {
    if (!config.enabled || !config.secret || !config.host) {
      return {
        iceServers: [{ urls: DEFAULT_STUN_SERVER }],
      };
    }

    const ttl = config.ttlSeconds || 3600;
    const expiry = Math.floor(Date.now() / 1000) + ttl;
    const username = `${expiry}:${randomUUID()}`;
    const credential = createHmac('sha1', config.secret).update(username).digest('base64');

    return {
      iceServers: [
        { urls: DEFAULT_STUN_SERVER },
        {
          urls: [
            `turn:${config.host}:3478?transport=udp`,
            `turn:${config.host}:3478?transport=tcp`,
          ],
          username,
          credential,
        },
      ],
    };
  };
}

let cachedProvider: (() => TurnCredentialsResponse) | null = null;

export function turnCredentials(): TurnCredentialsResponse {
  if (!cachedProvider) {
    cachedProvider = createTurnCredentialsProvider();
  }
  return cachedProvider();
}

export function resetTurnCredentialsCache(): void {
  cachedProvider = null;
}
