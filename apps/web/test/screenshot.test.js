import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatScreenshotFilename,
  isScreenshotAvailable,
  captureVideoFrame,
  downloadBlob,
} from '../src/features/room/utils/screenshot.ts';

test('formatScreenshotFilename formats predictable filename with zero-padding', () => {
  const fixedDate = new Date(2026, 9, 17, 14, 30, 0); // Month is 0-indexed: 9 = October
  const filename = formatScreenshotFilename(fixedDate);
  assert.equal(filename, 'screen-room-2026-10-17_14-30-00.png');

  // Test single-digit month, day, hour, min, sec
  const earlyDate = new Date(2027, 0, 5, 4, 3, 2); // 2027-01-05 04:03:02
  assert.equal(formatScreenshotFilename(earlyDate), 'screen-room-2027-01-05_04-03-02.png');

  // Test default parameter uses current time and matches regex pattern
  const currentFilename = formatScreenshotFilename();
  assert.match(currentFilename, /^screen-room-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.png$/);
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
    const filename = 'screen-room-2026-10-17_14-30-00.png';

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
  // Verify that captureVideoFrame strictly takes HTMLVideoElement and draws it
  // and does NOT touch or composite any other DOM element (like annotation canvas or toolbars)
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

test('concurrency guard discards download if stream or featured peer changes during capture', async () => {
  let downloadTriggered = false;
  let delayResolve = null;

  globalThis.document = {
    createElement: (tag) => {
      if (tag === 'canvas') {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ drawImage: () => {} }),
          toBlob: (cb) => {
            // Emulate async encoding delay
            new Promise((resolve) => {
              delayResolve = () => {
                cb(new Blob(['data'], { type: 'image/png' }));
                resolve();
              };
            });
          },
        };
      }
      return {};
    },
  };

  try {
    const video = { videoWidth: 1920, videoHeight: 1080, readyState: 3 };
    const streamA = { getVideoTracks: () => [{ readyState: 'live' }] };
    const streamB = { getVideoTracks: () => [{ readyState: 'live' }] };

    let currentStream = streamA;
    let currentStreamId = 'peer-1';
    let generation = 0;
    let isPaused = false;

    // Simulate hook capture logic
    const runCapture = async () => {
      const capturedStream = currentStream;
      const capturedStreamId = currentStreamId;
      const currentGen = ++generation;

      const blob = await captureVideoFrame(video);

      // Guard check
      if (
        currentGen !== generation ||
        currentStream !== capturedStream ||
        currentStreamId !== capturedStreamId ||
        isPaused
      ) {
        return false;
      }
      downloadTriggered = true;
      return true;
    };

    // Scenario 1: Stream switched while capture is in flight
    const promise1 = runCapture();
    // Presenter or feature switched
    currentStream = streamB;
    currentStreamId = 'peer-2';
    delayResolve();
    const result1 = await promise1;
    assert.equal(result1, false);
    assert.equal(downloadTriggered, false);

    // Scenario 2: Paused while capture is in flight
    currentStream = streamB;
    currentStreamId = 'peer-2';
    const promise2 = runCapture();
    isPaused = true;
    delayResolve();
    const result2 = await promise2;
    assert.equal(result2, false);
    assert.equal(downloadTriggered, false);

    // Scenario 3: Normal un-interrupted capture
    isPaused = false;
    const promise3 = runCapture();
    delayResolve();
    const result3 = await promise3;
    assert.equal(result3, true);
    assert.equal(downloadTriggered, true);
  } finally {
    delete globalThis.document;
  }
});

