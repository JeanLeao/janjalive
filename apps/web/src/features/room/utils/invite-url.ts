/**
 * Utility functions for constructing, validating, and copying room invite URLs.
 * Ensures identical URL format between clipboard copy actions and QR code encoding,
 * stripping query strings, fragments, and sensitive credentials/tokens.
 */

export function getRoomInviteUrl(rawUrl?: string, baseOrigin?: string): string {
  try {
    const raw = rawUrl || (typeof window !== 'undefined' ? window.location.href : '');
    if (!raw) return '';
    const base = baseOrigin || (typeof window !== 'undefined' ? window.location.origin : undefined);
    const cleanUrl = new URL(raw, base);
    cleanUrl.search = '';
    cleanUrl.hash = '';
    return cleanUrl.toString();
  } catch {
    return '';
  }
}

export function isLocalAddress(urlString: string): boolean {
  if (!urlString) return false;
  try {
    const parsed = new URL(urlString);
    const host = parsed.hostname.toLowerCase();
    return (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '[::1]' ||
      host.endsWith('.localhost') ||
      host.endsWith('.local')
    );
  } catch {
    return false;
  }
}

export async function copyRoomInviteUrl(rawUrl?: string): Promise<boolean> {
  const url = getRoomInviteUrl(rawUrl);
  if (!url) return false;
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
    return false;
  }
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch (err) {
    console.error('Failed to copy room invite URL:', err);
    return false;
  }
}
