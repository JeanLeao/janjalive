import test from 'node:test';
import assert from 'node:assert/strict';
import { captureDisplayMedia, formatSharingErrorMessage } from '../src/features/room/media/display-media.ts';
import { MockMediaStream, MockMediaStreamTrack } from './mock-webrtc.js';

const quality = { priority: 'sharpness', profile: 'balanced', fps: 20 };
function fixture(t, surface, audio = true) {
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const video = new MockMediaStreamTrack('video');
  video.getSettings = () => ({ displaySurface: surface, width: 1920, height: 1080, frameRate: 20 });
  const stream = new MockMediaStream([video, ...(audio ? [new MockMediaStreamTrack('audio')] : [])]);
  const calls = [];
  const devices = {
    getUserMedia: () => { throw new Error('Microphone must never be requested'); },
    getDisplayMedia: async options => { calls.push(options); return stream; },
  };
  Object.defineProperty(globalThis, 'window', { value: { isSecureContext: true }, configurable: true });
  Object.defineProperty(globalThis, 'navigator', { value: { mediaDevices: devices }, configurable: true });
  t.after(() => {
    if (previousNavigator) Object.defineProperty(globalThis, 'navigator', previousNavigator); else delete globalThis.navigator;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow); else delete globalThis.window;
  });
  return { video, stream, calls, devices };
}

test('tab audio requests only a browser tab, excludes system/window audio, and transfers ownership after validation', async t => {
  const f = fixture(t, 'browser'); let captured;
  assert.equal(await captureDisplayMedia(quality, stream => { captured = stream; }, 'tab'), f.stream);
  assert.equal(captured, f.stream);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].audio, true);
  assert.equal(f.calls[0].video.displaySurface, 'browser');
  for (const option of ['systemAudio', 'windowAudio', 'monitorTypeSurfaces', 'surfaceSwitching']) assert.equal(f.calls[0][option], 'exclude');
});

for (const surface of ['window', 'monitor', undefined]) test(`tab audio rejects ${surface ?? 'unconfirmed'} sources before preview and releases every track`, async t => {
  const f = fixture(t, surface); let owned = false;
  await assert.rejects(captureDisplayMedia(quality, () => { owned = true; }, 'tab'), error => {
    assert.equal(error.name, 'TabAudioCaptureError');
    assert.match(formatSharingErrorMessage(error), /aba/);
    return true;
  });
  assert.equal(owned, false);
  assert.equal(f.calls.length, 1, 'never retry with system audio');
  assert.ok(f.stream.getTracks().every(track => track.readyState === 'ended'));
});

test('tab audio accepts a silent tab without substituting microphone/system audio', async t => {
  const f = fixture(t, 'browser', false);
  const stream = await captureDisplayMedia(quality, undefined, 'tab');
  assert.equal(stream.getAudioTracks().length, 0);
  assert.equal(f.calls.length, 1);
});

test('failure to inspect a source still releases the entire captured stream', async t => {
  const f = fixture(t, 'browser'); f.video.getSettings = () => { throw new Error('Settings unavailable'); };
  await assert.rejects(captureDisplayMedia(quality, undefined, 'tab'));
  assert.ok(f.stream.getTracks().every(track => track.readyState === 'ended'));
});

test('unsupported tab options never fall back to an unrestricted capture', async t => {
  const f = fixture(t, 'browser'); let count = 0;
  f.devices.getDisplayMedia = async () => { count++; throw new TypeError('Unsupported options'); };
  await assert.rejects(captureDisplayMedia(quality, undefined, 'tab'), TypeError);
  assert.equal(count, 1);
});

test('the existing system/tab default remains unchanged', async t => {
  const f = fixture(t, 'monitor');
  assert.equal(await captureDisplayMedia(quality), f.stream);
  assert.equal(f.calls[0].audio, true);
  assert.equal(f.calls[0].systemAudio, undefined);
  assert.equal(f.video.readyState, 'live');
});
