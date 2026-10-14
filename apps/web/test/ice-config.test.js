import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchIceConfiguration, DEFAULT_ICE_SERVERS } from '../src/features/room/webrtc/ice-config.ts';

test('ice-config: returns server iceServers when endpoint responds successfully', async () => {
  const customIceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'turn:turn.example.com:3478', username: 'temp-user', credential: 'temp-password' },
  ];

  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ iceServers: customIceServers }),
  });

  const config = await fetchIceConfiguration('/turn-credentials');
  assert.deepEqual(config.iceServers, customIceServers);

  delete globalThis.fetch;
});

test('ice-config: falls back to DEFAULT_ICE_SERVERS when endpoint fails or errors', async () => {
  globalThis.fetch = async () => ({
    ok: false,
    status: 500,
  });

  const config = await fetchIceConfiguration('/turn-credentials');
  assert.deepEqual(config.iceServers, DEFAULT_ICE_SERVERS);

  delete globalThis.fetch;
});

test('ice-config: falls back when server response has invalid schema', async () => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ secret: 'exposed-secret-which-should-not-exist' }),
  });

  const config = await fetchIceConfiguration('/turn-credentials');
  assert.deepEqual(config.iceServers, DEFAULT_ICE_SERVERS);

  delete globalThis.fetch;
});
