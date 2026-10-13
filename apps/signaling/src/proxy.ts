import type * as http from 'node:http';
import * as net from 'node:net';

/**
 * Normalizes an IP string:
 * - strips leading/trailing whitespace
 * - extracts IPv4 from IPv4-mapped IPv6 (::ffff:127.0.0.1 -> 127.0.0.1)
 * - converts to lower-case
 */
export function normalizeIp(ip: string): string {
  const trimmed = ip.trim();
  if (trimmed.startsWith('::ffff:') && net.isIP(trimmed.slice(7)) === 4) {
    return trimmed.slice(7);
  }
  return trimmed.toLowerCase();
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let res = 0;
  for (let i = 0; i < 4; i++) {
    const num = Number(parts[i]);
    if (!Number.isInteger(num) || num < 0 || num > 255) return null;
    res = ((res << 8) | num) >>> 0;
  }
  return res;
}

function ipv6ToBytes(ip: string): Uint8Array | null {
  let fullIp = ip.toLowerCase();
  if (fullIp.includes('::')) {
    const parts = fullIp.split('::');
    if (parts.length > 2) return null;
    const left = parts[0] ? parts[0].split(':') : [];
    const right = parts[1] ? parts[1].split(':') : [];
    const missing = 8 - (left.length + right.length);
    if (missing < 0) return null;
    const middle = new Array(missing).fill('0');
    fullIp = [...left, ...middle, ...right].join(':');
  }
  const segments = fullIp.split(':');
  if (segments.length !== 8) return null;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    const val = parseInt(segments[i], 16);
    if (Number.isNaN(val) || val < 0 || val > 0xffff) return null;
    bytes[i * 2] = (val >> 8) & 0xff;
    bytes[i * 2 + 1] = val & 0xff;
  }
  return bytes;
}

/**
 * Checks whether an IP matches a CIDR range or exact IP.
 * Supports IPv4 and IPv6.
 */
export function isIpInCidr(ip: string, cidr: string): boolean {
  const normIp = normalizeIp(ip);
  const normCidr = normalizeIp(cidr);

  if (!normCidr.includes('/')) {
    return normIp === normCidr;
  }

  const [rangeIp, prefixStr] = normCidr.split('/');
  const prefix = Number(prefixStr);
  if (!Number.isInteger(prefix) || prefix < 0) return false;

  const ipVersion = net.isIP(normIp);
  const rangeVersion = net.isIP(rangeIp);

  if (ipVersion === 0 || ipVersion !== rangeVersion) return false;

  if (ipVersion === 4) {
    if (prefix > 32) return false;
    const ipInt = ipv4ToInt(normIp);
    const rangeInt = ipv4ToInt(rangeIp);
    if (ipInt === null || rangeInt === null) return false;
    const mask = prefix === 0 ? 0 : (~0 << (32 - prefix)) >>> 0;
    return (ipInt & mask) === (rangeInt & mask);
  }

  if (ipVersion === 6) {
    if (prefix > 128) return false;
    const ipBytes = ipv6ToBytes(normIp);
    const rangeBytes = ipv6ToBytes(rangeIp);
    if (!ipBytes || !rangeBytes) return false;

    const fullBytes = Math.floor(prefix / 8);
    for (let i = 0; i < fullBytes; i++) {
      if (ipBytes[i] !== rangeBytes[i]) return false;
    }
    const remainingBits = prefix % 8;
    if (remainingBits > 0) {
      const mask = (~0 << (8 - remainingBits)) & 0xff;
      if ((ipBytes[fullBytes] & mask) !== (rangeBytes[fullBytes] & mask)) return false;
    }
    return true;
  }

  return false;
}

/**
 * Default trusted proxies: loopback addresses only.
 * Production deployments behind Caddy/Nginx/Docker should configure TRUSTED_PROXIES explicitly.
 */
export const DEFAULT_TRUSTED_PROXIES: readonly string[] = [
  '127.0.0.1',
  '::1',
  '127.0.0.0/8',
];

/**
 * Parses and returns trusted proxies list from options or environment variable.
 */
export function parseTrustedProxies(
  envValue?: string,
  optionsValue?: string[]
): string[] {
  if (optionsValue && optionsValue.length > 0) {
    return optionsValue.map(normalizeIp).filter(Boolean);
  }

  const env = envValue ?? process.env.TRUSTED_PROXIES;
  if (env && env.trim()) {
    return env
      .split(',')
      .map((item) => normalizeIp(item))
      .filter(Boolean);
  }

  return [...DEFAULT_TRUSTED_PROXIES];
}

/**
 * Checks if a given IP matches any of the configured trusted proxies.
 */
export function isIpTrusted(ip: string, trustedProxies: string[]): boolean {
  const norm = normalizeIp(ip);
  if (!norm) return false;
  return trustedProxies.some((proxy) => isIpInCidr(norm, proxy));
}

/**
 * Resolves the client IP address from an incoming HTTP request:
 *
 * 1. Checks if the physical TCP connection (req.socket.remoteAddress) comes from a trusted proxy.
 *    If NOT trusted, all forwarding headers (X-Forwarded-For, X-Real-IP) are rejected and ignored,
 *    and the direct TCP remoteAddress is returned.
 *
 * 2. If the physical TCP connection IS trusted:
 *    - If X-Real-IP is provided and is a valid IP, it takes precedence (common contract where the
 *      edge proxy overwrites X-Real-IP with the true client IP).
 *    - Otherwise, if X-Forwarded-For is provided, it traverses the proxy chain from RIGHT to LEFT
 *      (closest proxy towards client) and selects the first IP that is NOT a trusted proxy.
 *      This prevents spoofed X-Forwarded-For headers from untrusted clients bypassing rate limits.
 *    - Falls back to the TCP remoteAddress if headers are absent or invalid.
 */
export function resolveClientIp(
  req: http.IncomingMessage,
  trustedProxies: string[] = [...DEFAULT_TRUSTED_PROXIES]
): string {
  const rawRemote = req.socket?.remoteAddress || '';
  const tcpIp = normalizeIp(rawRemote);

  if (!tcpIp) return 'unknown';

  // If TCP connection is not from a trusted proxy, ignore all forwarding headers
  if (!isIpTrusted(tcpIp, trustedProxies)) {
    return tcpIp;
  }

  // Contract A: X-Real-IP set/overwritten by trusted edge proxy
  const rawRealIp = req.headers['x-real-ip'];
  if (typeof rawRealIp === 'string') {
    const candidate = normalizeIp(rawRealIp);
    if (net.isIP(candidate)) {
      return candidate;
    }
  } else if (Array.isArray(rawRealIp) && rawRealIp.length > 0) {
    const candidate = normalizeIp(rawRealIp[0]);
    if (net.isIP(candidate)) {
      return candidate;
    }
  }

  // Contract B: X-Forwarded-For right-to-left traversal
  const rawForwarded = req.headers['x-forwarded-for'];
  if (rawForwarded) {
    const chainStr = Array.isArray(rawForwarded) ? rawForwarded.join(',') : rawForwarded;
    const candidates = chainStr
      .split(',')
      .map((ip) => normalizeIp(ip))
      .filter((ip) => net.isIP(ip) !== 0);

    if (candidates.length > 0) {
      // Traverse from right to left (closest hop to client origin)
      for (let i = candidates.length - 1; i >= 0; i--) {
        const candidate = candidates[i];
        if (!isIpTrusted(candidate, trustedProxies)) {
          return candidate;
        }
      }
      // If every proxy in the chain is in the trusted list, return the leftmost valid hop
      return candidates[0];
    }
  }

  return tcpIp;
}
