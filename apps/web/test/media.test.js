import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canShareScreen,
  getShareSupportMessage,
  formatSharingErrorMessage,
  captureDisplayMedia,
  setStreamAudioMuted,
  stopAllTracks,
} from '../src/features/room/media/display-media.ts';
import { MockMediaStream, MockMediaStreamTrack } from './mock-webrtc.js';

test('media: canShareScreen detects presence of getDisplayMedia', () => {
  // In node environment without navigator
  assert.equal(canShareScreen(), false);

  // In secure context with mocked navigator and getDisplayMedia
  globalThis.window = { isSecureContext: true };
  const origNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      mediaDevices: {
        getDisplayMedia: async () => new MockMediaStream(),
      },
    },
    configurable: true,
    writable: true,
  });
  assert.equal(canShareScreen(), true);

  // In insecure context (HTTP or non-secure), must return false
  globalThis.window = { isSecureContext: false };
  assert.equal(canShareScreen(), false, 'Insecure context must not allow screen share');

  // Without getDisplayMedia function
  globalThis.window = { isSecureContext: true };
  Object.defineProperty(globalThis, 'navigator', {
    value: { mediaDevices: {} },
    configurable: true,
    writable: true,
  });
  assert.equal(canShareScreen(), false, 'Missing getDisplayMedia must return false');

  delete globalThis.window;
  if (origNavigator) Object.defineProperty(globalThis, 'navigator', origNavigator);
  else delete globalThis.navigator;
});

test('media: formatSharingErrorMessage maps standard errors to user-friendly messages', () => {
  assert.match(
    formatSharingErrorMessage({ name: 'NotAllowedError' }),
    /permissão recusada ou compartilhamento cancelado/i,
  );
  assert.match(
    formatSharingErrorMessage({ name: 'AbortError' }),
    /seletor de tela foi fechado/i,
  );
  assert.match(
    formatSharingErrorMessage({ name: 'NotReadableError' }),
    /não permitiu ler a tela/i,
  );
  assert.match(
    formatSharingErrorMessage({ name: 'SecurityError' }),
    /bloqueou a captura/i,
  );
});

test('media: captureDisplayMedia NEVER uses getUserMedia and NEVER captures microphone', async () => {
  let getUserMediaCalled = false;
  let getDisplayMediaCalled = false;
  let receivedConstraints = null;

  globalThis.window = { isSecureContext: true };
  const origNavigator = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  Object.defineProperty(globalThis, 'navigator', {
    value: {
      mediaDevices: {
        getUserMedia: async () => {
          getUserMediaCalled = true;
          throw new Error('getUserMedia should NEVER be called');
        },
        getDisplayMedia: async (constraints) => {
          getDisplayMediaCalled = true;
          receivedConstraints = constraints;
          return new MockMediaStream([
            new MockMediaStreamTrack('video'),
            new MockMediaStreamTrack('audio'),
          ]);
        },
      },
    },
    configurable: true,
    writable: true,
  });

  const stream = await captureDisplayMedia('high');
  assert.equal(getUserMediaCalled, false, 'getUserMedia must NEVER be called');
  assert.equal(getDisplayMediaCalled, true);
  assert.equal(receivedConstraints.audio, true, 'Audio should be display audio');
  assert.equal(receivedConstraints.video.width.max, 1920);

  delete globalThis.window;
  if (origNavigator) Object.defineProperty(globalThis, 'navigator', origNavigator);
  else delete globalThis.navigator;
});

test('media: setStreamAudioMuted toggles only audio track enabled state', () => {
  const videoTrack = new MockMediaStreamTrack('video');
  const audioTrack = new MockMediaStreamTrack('audio');
  const stream = new MockMediaStream([videoTrack, audioTrack]);

  assert.equal(videoTrack.enabled, true);
  assert.equal(audioTrack.enabled, true);

  setStreamAudioMuted(stream, true);
  assert.equal(videoTrack.enabled, true, 'Video track must stay enabled');
  assert.equal(audioTrack.enabled, false, 'Audio track must be disabled');

  setStreamAudioMuted(stream, false);
  assert.equal(videoTrack.enabled, true);
  assert.equal(audioTrack.enabled, true);
});

test('media: stopAllTracks stops all tracks and triggers ended listeners', () => {
  const videoTrack = new MockMediaStreamTrack('video');
  const audioTrack = new MockMediaStreamTrack('audio');
  let endedFired = false;
  videoTrack.addEventListener('ended', () => {
    endedFired = true;
  });

  const stream = new MockMediaStream([videoTrack, audioTrack]);
  stopAllTracks(stream);

  assert.equal(videoTrack.readyState, 'ended');
  assert.equal(audioTrack.readyState, 'ended');
  assert.equal(endedFired, true);
});
