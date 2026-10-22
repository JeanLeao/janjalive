import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatScreenshotFilename,
  isScreenshotAvailable,
  captureVideoFrame,
  downloadBlob,
} from '../src/features/room/utils/screenshot.ts';
import { useVideoScreenshot } from '../src/features/room/hooks/useVideoScreenshot.ts';

function renderHook(hookFn, initialProps) {
  let currentProps = initialProps;
  const states = [];
  const refs = [];
  const effects = [];
  let result;
  let isMounted = true;
  let isRendering = false;
  let dirty = false;

  let statesIdx = 0;
  let refsIdx = 0;
  let effectsIdx = 0;

  const dispatcher = {
    useState(init) {
      const idx = statesIdx++;
      if (!(idx in states)) {
        states[idx] = typeof init === 'function' ? init() : init;
      }
      const setState = (val) => {
        if (!isMounted) return;
        const next = typeof val === 'function' ? val(states[idx]) : val;
        if (!Object.is(states[idx], next)) {
          states[idx] = next;
          if (isRendering) {
            dirty = true;
          } else {
            render();
          }
        }
      };
      return [states[idx], setState];
    },
    useRef(init) {
      const idx = refsIdx++;
      if (!(idx in refs)) {
        refs[idx] = { current: init };
      }
      return refs[idx];
    },
    useEffect(create, deps) {
      const idx = effectsIdx++;
      const prev = effects[idx];
      const changed =
        !prev ||
        !deps ||
        !prev.deps ||
        deps.length !== prev.deps.length ||
        deps.some((d, i) => !Object.is(d, prev.deps[i]));
      effects[idx] = { create, deps, cleanup: prev?.cleanup, changed };
    },
  };

  function flushEffects() {
    for (const ef of effects) {
      if (ef.changed) {
        ef.changed = false;
        if (typeof ef.cleanup === 'function') ef.cleanup();
        ef.cleanup = ef.create();
      }
    }
  }

  function render() {
    isRendering = true;
    do {
      dirty = false;
      statesIdx = 0;
      refsIdx = 0;
      effectsIdx = 0;
      const internals =
        React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const prevH = internals.H;
      internals.H = dispatcher;
      try {
        result = hookFn(currentProps);
      } finally {
        internals.H = prevH;
      }
      flushEffects();
    } while (dirty);
    isRendering = false;
  }

  render();

  return {
    get current() {
      return result;
    },
    rerender(nextProps) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    unmount() {
      isMounted = false;
      for (const ef of effects) {
        if (typeof ef.cleanup === 'function') {
          ef.cleanup();
          ef.cleanup = undefined;
        }
      }
    },
  };
}

function createMockVideo(overrides = {}) {
  const listeners = new Map();
  return {
    videoWidth: 1920,
    videoHeight: 1080,
    readyState: 4,
    addEventListener(ev, fn) {
      if (!listeners.has(ev)) listeners.set(ev, new Set());
      listeners.get(ev).add(fn);
    },
    removeEventListener(ev, fn) {
      listeners.get(ev)?.delete(fn);
    },
    dispatchEvent(ev) {
      for (const fn of listeners.get(ev) || []) fn();
    },
    ...overrides,
  };
}

function createMockStream(id = 'stream-1') {
  const trackListeners = new Map();
  const streamListeners = new Map();
  const track = {
    id: `track-${id}`,
    kind: 'video',
    readyState: 'live',
    addEventListener(ev, fn) {
      if (!trackListeners.has(ev)) trackListeners.set(ev, new Set());
      trackListeners.get(ev).add(fn);
    },
    removeEventListener(ev, fn) {
      trackListeners.get(ev)?.delete(fn);
    },
    stop() {
      this.readyState = 'ended';
      for (const fn of trackListeners.get('ended') || []) fn();
    },
  };
  return {
    id,
    track,
    getVideoTracks: () => [track],
    addEventListener(ev, fn) {
      if (!streamListeners.has(ev)) streamListeners.set(ev, new Set());
      streamListeners.get(ev).add(fn);
    },
    removeEventListener(ev, fn) {
      streamListeners.get(ev)?.delete(fn);
    },
  };
}

function setupControlledDomEnvironment() {
  const pendingEncodings = [];
  const downloads = [];
  const originalDocument = globalThis.document;
  const originalURL = globalThis.URL;

  globalThis.URL = {
    createObjectURL: (blob) => `blob:mock-${blob.size}-${downloads.length}`,
    revokeObjectURL: () => {},
  };

  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: (type) =>
            type === '2d' ? { drawImage: () => {} } : null,
          toBlob: (cb, mimeType = 'image/png') => {
            pendingEncodings.push({
              resolve: (blob = new Blob(['png-bytes'], { type: mimeType })) =>
                cb(blob),
              fail: () => cb(null),
            });
          },
        };
      }
      if (tag === 'a') {
        return {
          style: {},
          href: '',
          download: '',
          click() {
            downloads.push({ href: this.href, download: this.download });
          },
        };
      }
      return {};
    },
    body: {
      appendChild: () => {},
      removeChild: () => {},
    },
  };

  return {
    pendingEncodings,
    downloads,
    restore() {
      if (originalDocument === undefined) delete globalThis.document;
      else globalThis.document = originalDocument;
      if (originalURL === undefined) delete globalThis.URL;
      else globalThis.URL = originalURL;
    },
  };
}

test('formatScreenshotFilename formats predictable filename with zero-padding', () => {
  const fixedDate = new Date(2026, 9, 17, 14, 30, 0); // Month is 0-indexed: 9 = October
  const filename = formatScreenshotFilename(fixedDate);
  assert.equal(filename, 'janjalive-2026-10-17_14-30-00.png');

  // Test single-digit month, day, hour, min, sec
  const earlyDate = new Date(2027, 0, 5, 4, 3, 2); // 2027-01-05 04:03:02
  assert.equal(formatScreenshotFilename(earlyDate), 'janjalive-2027-01-05_04-03-02.png');

  // Test default parameter uses current time and matches regex pattern
  const currentFilename = formatScreenshotFilename();
  assert.match(currentFilename, /^janjalive-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.png$/);
});

test('isScreenshotAvailable validates video element, stream, and ready state', () => {
  const mockTrack = { readyState: 'live', kind: 'video' };
  const mockStream = {
    getVideoTracks: () => [mockTrack],
  };
  const mockVideo = {
    videoWidth: 1920,
    videoHeight: 1080,
    readyState: 2, // HAVE_CURRENT_DATA
  };

  // Valid conditions
  assert.equal(isScreenshotAvailable(mockVideo, mockStream, false), true);

  // Video null
  assert.equal(isScreenshotAvailable(null, mockStream, false), false);

  // Stream null
  assert.equal(isScreenshotAvailable(mockVideo, null, false), false);

  // Paused
  assert.equal(isScreenshotAvailable(mockVideo, mockStream, true), false);

  // Missing or zero video dimensions
  assert.equal(isScreenshotAvailable({ ...mockVideo, videoWidth: 0 }, mockStream, false), false);
  assert.equal(isScreenshotAvailable({ ...mockVideo, videoHeight: 0 }, mockStream, false), false);
  assert.equal(isScreenshotAvailable({ ...mockVideo, videoWidth: -1 }, mockStream, false), false);

  // Insufficient readyState (< 2, e.g. HAVE_NOTHING = 0, HAVE_METADATA = 1)
  assert.equal(isScreenshotAvailable({ ...mockVideo, readyState: 1 }, mockStream, false), false);
  assert.equal(isScreenshotAvailable({ ...mockVideo, readyState: 0 }, mockStream, false), false);

  // Stream track ended or absent
  const endedStream = {
    getVideoTracks: () => [{ readyState: 'ended', kind: 'video' }],
  };
  assert.equal(isScreenshotAvailable(mockVideo, endedStream, false), false);

  const emptyStream = {
    getVideoTracks: () => [],
  };
  assert.equal(isScreenshotAvailable(mockVideo, emptyStream, false), false);
});

test('captureVideoFrame creates canvas with intrinsic video resolution and exports PNG', async () => {
  let createdCanvas = null;
  let drawnArgs = null;
  let exportedType = null;

  const originalCreateElement = globalThis.document?.createElement;
  globalThis.document = {
    ...(globalThis.document || {}),
    createElement: (tag) => {
      if (tag === 'canvas') {
        const canvas = {
          width: 0,
          height: 0,
          getContext: (type) => {
            if (type !== '2d') return null;
            return {
              drawImage: (...args) => {
                drawnArgs = args;
              },
            };
          },
          toBlob: (cb, mimeType) => {
            exportedType = mimeType;
            cb(new Blob(['mock-png-data'], { type: mimeType }));
          },
        };
        createdCanvas = canvas;
        return canvas;
      }
      return originalCreateElement ? originalCreateElement(tag) : {};
    },
  };

  try {
    const video = {
      videoWidth: 2560,
      videoHeight: 1440,
      readyState: 4,
    };

    const blob = await captureVideoFrame(video);
    assert.ok(blob instanceof Blob);
    assert.equal(blob.type, 'image/png');
    assert.equal(createdCanvas.width, 2560);
    assert.equal(createdCanvas.height, 1440);
    assert.deepEqual(drawnArgs, [video, 0, 0, 2560, 1440]);
    assert.equal(exportedType, 'image/png');
  } finally {
    if (originalCreateElement) {
      globalThis.document.createElement = originalCreateElement;
    } else {
      delete globalThis.document;
    }
  }
});

test('captureVideoFrame rejects on invalid dimensions or missing context', async () => {
  const invalidVideo = { videoWidth: 0, videoHeight: 0, readyState: 1 };
  await assert.rejects(
    () => captureVideoFrame(invalidVideo),
    /Dimensões do vídeo indisponíveis/
  );

  const noReadyVideo = { videoWidth: 640, videoHeight: 480, readyState: 1 };
  await assert.rejects(
    () => captureVideoFrame(noReadyVideo),
    /Quadro de vídeo indisponível/
  );

  // Missing 2D context
  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => null,
        };
      }
      return {};
    },
  };

  try {
    const validVideo = { videoWidth: 640, videoHeight: 480, readyState: 2 };
    await assert.rejects(
      () => captureVideoFrame(validVideo),
      /Contexto 2D indisponível/
    );
  } finally {
    delete globalThis.document;
  }
});

test('captureVideoFrame rejects when canvas.toBlob fails', async () => {
  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: () => {} }),
          toBlob: (cb) => cb(null), // simulate encoding failure
        };
      }
      return {};
    },
  };

  try {
    const validVideo = { videoWidth: 640, videoHeight: 480, readyState: 2 };
    await assert.rejects(
      () => captureVideoFrame(validVideo),
      /Falha ao exportar quadro em formato PNG/
    );
  } finally {
    delete globalThis.document;
  }
});

test('downloadBlob manages object URL lifecycle and triggers anchor download', async () => {
  let createdUrl = null;
  let revokedUrl = null;
  let clicked = false;
  let downloadedFilename = null;
  let appendedChild = null;
  let removedChild = null;

  globalThis.URL = {
    createObjectURL: (blob) => {
      createdUrl = `blob:test-${blob.size}`;
      return createdUrl;
    },
    revokeObjectURL: (url) => {
      revokedUrl = url;
    },
  };

  const mockAnchor = {
    style: {},
    set href(val) { this._href = val; },
    get href() { return this._href; },
    set download(val) { downloadedFilename = val; },
    get download() { return downloadedFilename; },
    click: () => { clicked = true; },
  };

  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'a') return mockAnchor;
      return {};
    },
    body: {
      appendChild: (el) => { appendedChild = el; },
      removeChild: (el) => { removedChild = el; },
    },
  };

  try {
    const blob = new Blob(['test content'], { type: 'image/png' });
    const filename = 'janjalive-2026-10-17_14-30-00.png';

    downloadBlob(blob, filename);

    assert.equal(mockAnchor.href, createdUrl);
    assert.equal(downloadedFilename, filename);
    assert.equal(clicked, true);
    assert.equal(appendedChild, mockAnchor);
    assert.equal(removedChild, mockAnchor);

    // Wait for the deferred revokeObjectURL timeout (1000ms)
    await new Promise((r) => setTimeout(r, 1100));
    assert.equal(revokedUrl, createdUrl);
  } finally {
    delete globalThis.URL;
    delete globalThis.document;
  }
});

test('screenshot draws only video element and does not include overlays', async () => {
  let drawnSource = null;
  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            drawImage: (src) => { drawnSource = src; },
          }),
          toBlob: (cb) => cb(new Blob(['png'], { type: 'image/png' })),
        };
      }
      return {};
    },
  };

  try {
    const video = { videoWidth: 1280, videoHeight: 720, readyState: 3 };
    await captureVideoFrame(video);
    assert.equal(drawnSource, video);
  } finally {
    delete globalThis.document;
  }
});

test('useVideoScreenshot: capture followed by pause discards obsolete download and feedback', async () => {
  const env = setupControlledDomEnvironment();
  try {
    const video = createMockVideo();
    const videoRef = { current: video };
    const stream = createMockStream('s1');

    const hook = renderHook(useVideoScreenshot, {
      videoRef,
      stream,
      streamId: 'peer-1',
      isPaused: false,
      connectionState: 'connected',
      isLocal: false,
    });

    assert.equal(hook.current.canCapture, true);
    const capturePromise = hook.current.captureScreenshot();
    assert.equal(hook.current.isCapturing, true);
    assert.equal(env.pendingEncodings.length, 1);

    // Pause transmission while PNG encoding is in flight
    hook.rerender({ isPaused: true, stream: null });
    assert.equal(hook.current.canCapture, false);
    assert.equal(hook.current.isCapturing, false);

    // Finish async PNG encoding
    env.pendingEncodings[0].resolve();
    const ok = await capturePromise;

    assert.equal(ok, false);
    assert.equal(env.downloads.length, 0);
    assert.equal(hook.current.feedback, 'idle');
    assert.equal(hook.current.feedbackMessage, null);
    hook.unmount();
  } finally {
    env.restore();
  }
});

test('useVideoScreenshot: capture followed by stream or featured presenter switch discards obsolete download', async () => {
  const env = setupControlledDomEnvironment();
  try {
    const video = createMockVideo();
    const videoRef = { current: video };
    const streamA = createMockStream('sA');
    const streamB = createMockStream('sB');

    const hook = renderHook(useVideoScreenshot, {
      videoRef,
      stream: streamA,
      streamId: 'peer-1',
      isPaused: false,
      connectionState: 'connected',
      isLocal: false,
    });

    // 1. Replace MediaStream object on same presenter (e.g. F27 source switch)
    const capture1 = hook.current.captureScreenshot();
    assert.equal(hook.current.isCapturing, true);
    hook.rerender({ stream: streamB, streamId: 'peer-1' });
    assert.equal(hook.current.isCapturing, false);
    assert.equal(hook.current.canCapture, true);

    env.pendingEncodings[0].resolve();
    assert.equal(await capture1, false);
    assert.equal(env.downloads.length, 0);
    assert.equal(hook.current.feedback, 'idle');

    // 2. Switch featured streamId
    const capture2 = hook.current.captureScreenshot();
    assert.equal(hook.current.isCapturing, true);
    hook.rerender({ stream: streamB, streamId: 'peer-2' });
    assert.equal(hook.current.isCapturing, false);

    env.pendingEncodings[1].resolve();
    assert.equal(await capture2, false);
    assert.equal(env.downloads.length, 0);
    assert.equal(hook.current.feedback, 'idle');

    // 3. Stop track in place without prop rerender yet (native track ended event)
    const capture3 = hook.current.captureScreenshot();
    assert.equal(hook.current.isCapturing, true);
    streamB.track.stop();
    assert.equal(hook.current.canCapture, false);
    assert.equal(hook.current.isCapturing, false);

    env.pendingEncodings[2].resolve();
    assert.equal(await capture3, false);
    assert.equal(env.downloads.length, 0);
    assert.equal(hook.current.feedback, 'idle');

    hook.unmount();
  } finally {
    env.restore();
  }
});

test('useVideoScreenshot: capture followed by connection loss discards obsolete download and suppresses error feedback', async () => {
  const env = setupControlledDomEnvironment();
  try {
    const video = createMockVideo();
    const videoRef = { current: video };
    const stream = createMockStream('s-conn');

    const hook = renderHook(useVideoScreenshot, {
      videoRef,
      stream,
      streamId: 'peer-1',
      isPaused: false,
      connectionState: 'connected',
      isLocal: false,
    });

    // 1. Encoding resolves after connection drops to disconnected
    const capture1 = hook.current.captureScreenshot();
    assert.equal(hook.current.isCapturing, true);

    hook.rerender({ connectionState: 'disconnected' });
    assert.equal(hook.current.canCapture, false);
    assert.equal(hook.current.isCapturing, false);

    env.pendingEncodings[0].resolve();
    assert.equal(await capture1, false);
    assert.equal(env.downloads.length, 0);
    assert.equal(hook.current.feedback, 'idle');
    assert.equal(hook.current.feedbackMessage, null);

    // 2. Restore connection, start capture, then fail connection AND fail encoding: stale error is suppressed
    hook.rerender({ connectionState: 'connected' });
    assert.equal(hook.current.canCapture, true);

    const capture2 = hook.current.captureScreenshot();
    hook.rerender({ connectionState: 'failed' });
    env.pendingEncodings[1].fail();
    assert.equal(await capture2, false);
    assert.equal(env.downloads.length, 0);
    assert.equal(hook.current.feedback, 'idle');
    assert.equal(hook.current.feedbackMessage, null);

    hook.unmount();
  } finally {
    env.restore();
  }
});

test('useVideoScreenshot: capture followed by unmount discards obsolete download', async () => {
  const env = setupControlledDomEnvironment();
  try {
    const video = createMockVideo();
    const videoRef = { current: video };
    const stream = createMockStream('s-unmount');

    const hook = renderHook(useVideoScreenshot, {
      videoRef,
      stream,
      streamId: 'peer-1',
      isPaused: false,
      connectionState: 'connected',
      isLocal: false,
    });

    const capturePromise = hook.current.captureScreenshot();
    assert.equal(env.pendingEncodings.length, 1);

    hook.unmount();

    env.pendingEncodings[0].resolve();
    const ok = await capturePromise;
    assert.equal(ok, false);
    assert.equal(env.downloads.length, 0);
  } finally {
    env.restore();
  }
});

test('useVideoScreenshot: uninterrupted capture downloads PNG and valid capture works after invalidation', async () => {
  const env = setupControlledDomEnvironment();
  try {
    const video = createMockVideo();
    const videoRef = { current: video };
    const streamA = createMockStream('s-valid-1');
    const streamB = createMockStream('s-valid-2');

    const hook = renderHook(useVideoScreenshot, {
      videoRef,
      stream: streamA,
      streamId: 'peer-1',
      isPaused: false,
      connectionState: 'connected',
      isLocal: false,
    });

    // 1. Normal uninterrupted capture
    const validPromise1 = hook.current.captureScreenshot();
    assert.equal(hook.current.isCapturing, true);
    env.pendingEncodings[0].resolve();
    assert.equal(await validPromise1, true);
    assert.equal(env.downloads.length, 1);
    assert.match(env.downloads[0].download, /^janjalive-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.png$/);
    assert.equal(hook.current.isCapturing, false);
    assert.equal(hook.current.feedback, 'success');
    assert.equal(hook.current.feedbackMessage, 'Download da imagem iniciado');

    // 2. Start capture, invalidate via pause, then resume with new stream and capture again
    const invalidatedPromise = hook.current.captureScreenshot();
    hook.rerender({ isPaused: true, stream: null });
    assert.equal(hook.current.canCapture, false);
    assert.equal(hook.current.isCapturing, false);
    assert.equal(hook.current.feedback, 'idle');

    // Resume with streamB before first encoding even finishes
    hook.rerender({ isPaused: false, stream: streamB });
    assert.equal(hook.current.canCapture, true);

    const validPromise2 = hook.current.captureScreenshot();
    assert.equal(hook.current.isCapturing, true);

    // Resolve the stale first encoding: must NOT download or clear isCapturing of the second capture
    env.pendingEncodings[1].resolve();
    assert.equal(await invalidatedPromise, false);
    assert.equal(env.downloads.length, 1);
    assert.equal(hook.current.isCapturing, true);

    // Resolve the new valid encoding: must download and report success
    env.pendingEncodings[2].resolve();
    assert.equal(await validPromise2, true);
    assert.equal(env.downloads.length, 2);
    assert.equal(hook.current.isCapturing, false);
    assert.equal(hook.current.feedback, 'success');
    assert.equal(hook.current.feedbackMessage, 'Download da imagem iniciado');

    hook.unmount();
  } finally {
    env.restore();
  }
});


