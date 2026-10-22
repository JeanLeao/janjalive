import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getRoomInviteUrl,
  isLocalAddress,
  copyRoomInviteUrl,
} from '../src/features/room/utils/invite-url.ts';

test('getRoomInviteUrl sanitizes query parameters and fragments', () => {
  const urlWithParams = 'https://janjalive.live/room/abc-123?token=reconnect-secret&tab=chat#heading';
  const clean = getRoomInviteUrl(urlWithParams);
  assert.equal(clean, 'https://janjalive.live/room/abc-123');
});

test('F12: getRoomInviteUrl guarantees room key and access tokens are omitted from copied invite URLs', () => {
  const urlWithKey = 'https://janjalive.live/room/protected-123?key=abc123xyz&accessKey=secret&roomKey=token#dialog';
  assert.equal(getRoomInviteUrl(urlWithKey), 'https://janjalive.live/room/protected-123');
});

test('getRoomInviteUrl preserves origin, port, and room path without private tokens', () => {
  const localUrl = 'http://192.168.1.50:3000/room/team-alpha?drawer=settings&token=private-token';
  const clean = getRoomInviteUrl(localUrl);
  assert.equal(clean, 'http://192.168.1.50:3000/room/team-alpha');
});

test('getRoomInviteUrl returns empty string for invalid URLs or empty strings', () => {
  assert.equal(getRoomInviteUrl(''), '');
  assert.equal(getRoomInviteUrl('not a url'), '');
});

test('getRoomInviteUrl strips username and password credentials from URLs', () => {
  assert.equal(
    getRoomInviteUrl('https://user:secret123@janjalive.live/room/abc-123'),
    'https://janjalive.live/room/abc-123'
  );
  assert.equal(
    getRoomInviteUrl('http://admin:pass@192.168.1.50:3000/room/team-alpha?token=secret#stage'),
    'http://192.168.1.50:3000/room/team-alpha'
  );
  assert.equal(
    getRoomInviteUrl('https://username_only@janjalive.live/room/test'),
    'https://janjalive.live/room/test'
  );
  assert.equal(
    getRoomInviteUrl('https://:password_only@janjalive.live/room/test'),
    'https://janjalive.live/room/test'
  );
});

test('getRoomInviteUrl rejects non-HTTP and non-HTTPS schemes', () => {
  assert.equal(getRoomInviteUrl('javascript:alert(1)'), '');
  assert.equal(getRoomInviteUrl('file:///etc/passwd'), '');
  assert.equal(getRoomInviteUrl('data:text/html,<script>alert(1)</script>'), '');
  assert.equal(getRoomInviteUrl('ftp://user:pass@ftp.janjalive.live/room/abc'), '');
  assert.equal(getRoomInviteUrl('ws://janjalive.live/room/abc'), '');
  assert.equal(getRoomInviteUrl('wss://janjalive.live/room/abc'), '');
  assert.equal(getRoomInviteUrl('mailto:user@janjalive.live'), '');
});

test('getRoomInviteUrl uses window.location.href when in browser environment', () => {
  const originalWindow = globalThis.window;
  try {
    globalThis.window = {
      location: {
        href: 'https://test.janjalive.app/room/test-room?demo=single#video',
        origin: 'https://test.janjalive.app',
      },
    };
    assert.equal(getRoomInviteUrl(), 'https://test.janjalive.app/room/test-room');
  } finally {
    globalThis.window = originalWindow;
  }
});

test('isLocalAddress detects loopback and local hosts correctly', () => {
  assert.equal(isLocalAddress('http://localhost:3000/room/abc'), true);
  assert.equal(isLocalAddress('http://127.0.0.1:3001/room/abc'), true);
  assert.equal(isLocalAddress('http://0.0.0.0:8080/room/abc'), true);
  assert.equal(isLocalAddress('http://[::1]:3000/room/abc'), true);
  assert.equal(isLocalAddress('http://app.localhost:3000/room/abc'), true);
  assert.equal(isLocalAddress('http://my-machine.local:3000/room/abc'), true);
});

test('isLocalAddress returns false for public domains and invalid URLs', () => {
  assert.equal(isLocalAddress('https://janjalive.live/room/abc'), false);
  assert.equal(isLocalAddress('https://example.com/room/abc'), false);
  assert.equal(isLocalAddress('https://meet.google.com/xyz'), false);
  assert.equal(isLocalAddress('ftp://localhost:21/room/abc'), false);
  assert.equal(isLocalAddress('ws://localhost:3000/room/abc'), false);
  assert.equal(isLocalAddress(''), false);
  assert.equal(isLocalAddress('invalid'), false);
});

test('copyRoomInviteUrl copies cleaned URL to navigator.clipboard, strips credentials and handles errors', async () => {
  const originalDescriptor = Object.getOwnPropertyDescriptor(globalThis.navigator, 'clipboard');
  let copiedText = '';

  try {
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: {
        async writeText(text) {
          copiedText = text;
        },
      },
      configurable: true,
      writable: true,
    });

    const success = await copyRoomInviteUrl('https://user:secret@janjalive.live/room/f10-room?query=123#hash');
    assert.equal(success, true);
    assert.equal(copiedText, 'https://janjalive.live/room/f10-room');

    // Test rejection of non-http/https schemes
    copiedText = '';
    const schemeSuccess = await copyRoomInviteUrl('javascript:alert(1)');
    assert.equal(schemeSuccess, false);
    assert.equal(copiedText, '');

    // Test clipboard failure
    Object.defineProperty(globalThis.navigator, 'clipboard', {
      value: {
        async writeText() {
          throw new Error('NotAllowedError');
        },
      },
      configurable: true,
      writable: true,
    });
    const failSuccess = await copyRoomInviteUrl('https://janjalive.live/room/f10-room');
    assert.equal(failSuccess, false);
  } finally {
    if (originalDescriptor) {
      Object.defineProperty(globalThis.navigator, 'clipboard', originalDescriptor);
    } else {
      delete globalThis.navigator.clipboard;
    }
  }
});
