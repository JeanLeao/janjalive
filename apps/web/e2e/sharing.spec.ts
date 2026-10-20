import { gotoRoom } from './fixtures/rooms';
import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';

async function syntheticCapture(page: Page, representative: boolean | 'browser' = false) {
  await page.addInitScript((representative) => {
    document.addEventListener('pointerdown', () => { (window as any).testAudioAllowed = true; });
    (window as any).testRenderedFrames = new WeakMap<HTMLVideoElement, number>();
    const nativePlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      if ((window as any).testBlockAudio && !this.muted && !(window as any).testAudioAllowed) {
        return Promise.reject(new DOMException('Autoplay requires interaction', 'NotAllowedError'));
      }
      return nativePlay.call(this);
    };
    const NativeSocket = window.WebSocket;
    (window as any).testSockets = [];
    window.WebSocket = class extends NativeSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols);
        (window as any).testSockets.push(this);
        this.addEventListener('message', event => {
          ((window as any).testMessages ||= []).push(JSON.parse(event.data));
        });
      }
    };
    const NativePC = window.RTCPeerConnection;
    (window as any).testPeers = [];
    window.RTCPeerConnection = class extends NativePC {
      constructor(config?: RTCConfiguration) {
        super(config);
        (window as any).testPeers.push(this);
      }
    };
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        ((window as any).testCaptureActivations ||= []).push(navigator.userActivation.isActive);
        if ((window as any).testRejectCapture) throw new DOMException('Selection cancelled', (window as any).testRejectCapture);
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = representative === 'browser' ? 480 : 360;
        const ctx = canvas.getContext('2d')!;
        let frame = 0;
        const timer = setInterval(() => {
          ctx.fillStyle = frame++ % 2 ? '#ff0000' : '#0000ff';
          ctx.fillRect(0, 0, 640, 360);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(frame % 600, 40, 40, 40);
          if (representative) {
            ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, 640, 360);
            ctx.fillStyle = '#161b22'; ctx.fillRect(0, 0, 640, 32); ctx.fillRect(0, 250, 640, 110);
            ctx.font = '14px monospace'; ctx.fillStyle = '#8c959f';
            ctx.fillText('Screen Room  /  peer-manager.ts', 18, 22);
            const lines = ['export async function shareScreen() {', '  const stream = await captureDisplay();', '  await peers.attachTracks(stream);', '  publishSharingState({ active: true });', '}', '', '// Keep connections reusable after capture stops'];
            lines.forEach((line, i) => { ctx.fillStyle = i === 6 ? '#8c959f' : '#79c0ff'; ctx.fillText(line, 24, 64 + i * 23); });
            ctx.fillStyle = '#7ee787'; ctx.fillText('$ pnpm test', 18, 277);
            ctx.fillText('✓ Sharing, reconnection and cleanup passed', 18, 305);
            ctx.fillStyle = '#e6edf3'; ctx.fillText(`Live preview · frame ${frame}`, 18, 337);
          }
          if (representative === 'browser') {
            ctx.fillStyle = '#f6f8fa'; ctx.fillRect(0, 0, 640, 480);
            ctx.fillStyle = '#d0d7de'; ctx.fillRect(0, 0, 640, 38);
            ctx.font = '13px monospace'; ctx.fillStyle = '#24292f';
            ctx.fillText('←  →   localhost:3000 / overview', 20, 24);
            ctx.fillStyle = '#0969da'; ctx.fillRect(0, 38, 140, 442);
            ctx.fillStyle = '#ffffff'; ctx.fillText('SCREEN ROOM', 16, 74);
            ['Overview', 'Sessions', 'Reports', 'Settings'].forEach((label, i) => ctx.fillText(label, 16, 130 + i * 44));
            ctx.fillStyle = '#24292f'; ctx.font = 'bold 22px sans-serif'; ctx.fillText('Session overview', 168, 88);
            ctx.font = '14px sans-serif'; ctx.fillText('Live transmission quality', 168, 124);
            ['Direct P2P connection', 'Screen + system audio', 'No recording stored'].forEach((label, i) => {
              ctx.fillStyle = '#ffffff'; ctx.fillRect(168, 152 + i * 72, 440, 56);
              ctx.fillStyle = '#1a7f37'; ctx.fillText('✓', 184, 186 + i * 72);
              ctx.fillStyle = '#24292f'; ctx.fillText(label, 212, 186 + i * 72);
            });
            ctx.fillStyle = '#57606a'; ctx.fillText(`Updated just now · ${frame}`, 168, 428);
          }
        }, 50);
        const stream = canvas.captureStream(20);
        if ((window as any).testAudio) {
          const audioContext = new AudioContext();
          const oscillator = audioContext.createOscillator();
          const destination = audioContext.createMediaStreamDestination();
          oscillator.connect(destination);
          oscillator.start();
          const resumed = await Promise.race([
            audioContext.resume().then(() => true, () => false),
            new Promise<boolean>(resolve => setTimeout(() => resolve(false), 1000)),
          ]);
          (window as any).testAudioUnavailable = !resumed || audioContext.state !== 'running';
          stream.addTrack(destination.stream.getAudioTracks()[0]);
        }
        ((window as any).testCaptures ||= []).push(stream);
        (window as any).testCapture = stream;
        const track = stream.getVideoTracks()[0];
        const nativeConstraints = track.applyConstraints.bind(track);
        track.applyConstraints = async constraints => {
          if ((window as any).testDelayConstraints) {
            (window as any).testDelayConstraints = false;
            await new Promise<void>(resolve => { (window as any).resolveConstraints = resolve; });
          }
          if ((window as any).testRejectConstraints) throw new DOMException('Unsupported limits', 'OverconstrainedError');
          return nativeConstraints(constraints);
        };
        const stop = track.stop.bind(track);
        track.stop = () => { clearInterval(timer); stop(); };
        stream.getVideoTracks()[0].addEventListener('ended', () => clearInterval(timer));
        // Count application listeners separately from the synthetic source's own cleanup.
        const endedListeners = new Set<EventListenerOrEventListenerObject>();
        ((window as any).testEndedListeners ||= []).push(endedListeners);
        const target: EventTarget = track;
        const addListener = target.addEventListener.bind(target);
        const removeListener = target.removeEventListener.bind(target);
        target.addEventListener = (type, listener, options) => {
          if (type === 'ended' && listener) endedListeners.add(listener);
          addListener(type, listener, options);
        };
        target.removeEventListener = (type, listener, options) => {
          if (type === 'ended' && listener) endedListeners.delete(listener);
          removeListener(type, listener, options);
        };
        if ((window as any).testDelayCapture) await new Promise(resolve => { (window as any).resolveCapture = resolve; });
        return stream;
      },
    });
  }, representative);
}

async function mockPausePiP(page: Page) {
  await page.addInitScript(() => {
    let current: HTMLVideoElement | null = null;
    Object.defineProperty(document, 'pictureInPictureEnabled', { get: () => true });
    Object.defineProperty(document, 'pictureInPictureElement', { get: () => current });
    HTMLVideoElement.prototype.requestPictureInPicture = async function () {
      current = this;
      this.dispatchEvent(new Event('enterpictureinpicture'));
      return {} as PictureInPictureWindow;
    };
    document.exitPictureInPicture = async () => {
      const previous = current;
      current = null;
      previous?.dispatchEvent(new Event('leavepictureinpicture'));
    };
  });
}

async function startLive(page: Page) {
  await page.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
  await page.getByRole('button', { name: 'Entrar ao vivo', exact: true }).click();
}

async function frames(page: Page) {
  try {
    await expect.poll(() => page.evaluate(async () => {
      let decoded = 0;
      const receiverIds = new Set<string>();
      for (const pc of (window as any).testPeers as RTCPeerConnection[]) {
        if (pc.connectionState === 'closed') continue;
        for (const receiver of pc.getReceivers()) receiverIds.add(receiver.track.id);
        (await pc.getStats()).forEach(report => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') decoded += report.framesDecoded || 0;
        });
      }
      const presented = (window as any).testRenderedFrames as WeakMap<HTMLVideoElement, number>;
      for (const video of document.querySelectorAll('video')) {
        if (presented.has(video)) continue;
        presented.set(video, 0);
        const countFrame = () => {
          if (!video.isConnected) return;
          presented.set(video, (presented.get(video) || 0) + 1);
          video.requestVideoFrameCallback(countFrame);
        };
        video.requestVideoFrameCallback(countFrame);
      }
      return decoded > 2 && [...document.querySelectorAll('video')].some(v =>
        !v.paused && v.videoWidth > 0 && (presented.get(v) || 0) > 2
        && (v.srcObject as MediaStream | null)?.getVideoTracks().some(t => receiverIds.has(t.id)));
    }), { timeout: 5000 }).toBe(true);
  } catch (error) {
    const state = await page.evaluate(() => [...document.querySelectorAll('video')].map(v => ({
      paused: v.paused, width: v.videoWidth, time: v.currentTime, frames: v.getVideoPlaybackQuality().totalVideoFrames,
      presentedCallbacks: (window as any).testRenderedFrames.get(v) || 0,
      readyState: v.readyState, error: v.error?.code,
      tracks: (v.srcObject as MediaStream | null)?.getTracks().map(t => ({ id: t.id, kind: t.kind, readyState: t.readyState, muted: t.muted })),
    })));
    // Do not attach raw signaling messages/SDP: they can contain credentials.
    // Separate transport, inbound decoding and presentation when the deadline fails.
    const transport = await page.evaluate(async () => ({
      visibility: document.visibilityState,
      sockets: (window as any).testSockets.map((ws: WebSocket) => ({ state: ws.readyState })),
      messages: ((window as any).testMessages || []).map((m: any) => ({
        type: m.type, signal: m.type === 'signal' ? m.data?.type : undefined,
      })),
      peers: await Promise.all(((window as any).testPeers as RTCPeerConnection[]).map(async pc => {
        const inbound: Record<string, unknown>[] = [];
        if (pc.connectionState !== 'closed') {
          (await pc.getStats()).forEach(report => {
            if (report.type === 'inbound-rtp' && report.kind === 'video') inbound.push({
              trackIdentifier: report.trackIdentifier, packetsReceived: report.packetsReceived,
              bytesReceived: report.bytesReceived, framesReceived: report.framesReceived,
              framesDecoded: report.framesDecoded, framesDropped: report.framesDropped,
              keyFramesDecoded: report.keyFramesDecoded,
            });
          });
        }
        return {
          state: pc.connectionState, ice: pc.iceConnectionState, signaling: pc.signalingState,
          localDescription: pc.localDescription?.type, remoteDescription: pc.remoteDescription?.type,
          inbound,
          transceivers: pc.getTransceivers().map(t => ({
            mid: t.mid, direction: t.direction, currentDirection: t.currentDirection,
            receiver: { id: t.receiver.track.id, muted: t.receiver.track.muted, readyState: t.receiver.track.readyState },
            sender: t.sender.track?.id,
          })),
        };
      })),
    }));
    await test.info().attach('playback-state', { body: JSON.stringify({ state, transport }), contentType: 'application/json' });
    throw error;
  }
}

test('participants enter before capture; ten start/stop cycles with real WebRTC', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  const host = await a.newPage(), viewer = await b.newPage();
  await syntheticCapture(host); await syntheticCapture(viewer);
  await Promise.all([gotoRoom(host, '/room/e2e-cycles'), gotoRoom(viewer, '/room/e2e-cycles')]);
  await expect(host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last()).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Compartilhar tela', exact: true }).last()).toBeVisible();
  await expect(host.getByText('2', { exact: true }).first()).toBeVisible();
  for (let cycle = 0; cycle < 10; cycle++) {
    await startLive(host);
    await frames(viewer);
    await host.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    await expect(viewer.locator('video')).toHaveCount(0, { timeout: 1000 });
  }
  await Promise.all([
    startLive(host),
    startLive(viewer),
  ]);
  await frames(host); await frames(viewer);
  await expect(host.locator('video')).toHaveCount(2);
  await expect(viewer.locator('video')).toHaveCount(2);
  await host.getByRole('button', { name: /^Destacar transmissão de / }).click();
  // These synthetic captures contain no audio tracks; F24 keeps both selected sources muted.
  await expect.poll(() => host.locator('video').first().evaluate(v => (v as HTMLVideoElement).muted)).toBe(true);
  await host.getByRole('button', { name: /^Destacar transmissão de / }).click();
  await expect.poll(() => host.locator('video').first().evaluate(v => (v as HTMLVideoElement).muted)).toBe(true);
  if (browser.browserType().name() === 'firefox') {
    // Gecko ignores the untrusted synthetic ended event; its native capture
    // button needs manual verification with a real display source.
    await host.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
  } else {
    await host.evaluate(() => {
      const track = (window as any).testCapture.getVideoTracks()[0];
      track.dispatchEvent(new Event('ended')); track.stop();
    });
  }
  await expect(host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last()).toBeVisible();
  await expect(viewer.locator('video')).toHaveCount(1, { timeout: 1000 });
  await a.close(); await b.close();
});

test('late join and a presenter serving nine spectators', async ({ browser }) => {
  const contexts = await Promise.all(Array.from({ length: 10 }, () => browser.newContext()));
  try {
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    await Promise.all(pages.map(page => syntheticCapture(page)));
    const host = pages[0];
    await gotoRoom(host, '/room/e2e-capacity');
    await expect(host.getByText('Conectado', { exact: true })).toBeVisible();
    await startLive(host);
    await Promise.all(pages.slice(1).map(page => gotoRoom(page, '/room/e2e-capacity')));
    await Promise.all(pages.slice(1).map(frames));
    await expect(host.getByRole('button', { name: 'Ver participantes (10)', exact: true }).first()).toBeVisible();
    await host.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    await Promise.all(pages.slice(1).map(page => expect(page.locator('video')).toHaveCount(0, { timeout: 1000 })));
  } finally {
    await Promise.all(contexts.map(context => context.close()));
  }
});

test('spectator and presenter recover after signaling interruption', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  try {
    const host = await a.newPage(), viewer = await b.newPage();
    await syntheticCapture(host); await syntheticCapture(viewer);
    await Promise.all([gotoRoom(host, '/room/e2e-reconnect'), gotoRoom(viewer, '/room/e2e-reconnect')]);
    await expect(host.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
    await startLive(host);
    await frames(viewer);
    for (const page of [viewer, host]) {
      await page.evaluate(() => {
        const sockets = (window as any).testSockets as WebSocket[];
        sockets.filter(s => s.readyState === WebSocket.OPEN && s.url.includes('/signal')).forEach(s => s.close(4001, 'test interruption'));
      });
      await expect(page.getByText('Desconectado', { exact: true })).toBeVisible();
      await expect(page.getByText('Conectado', { exact: true })).toBeVisible({ timeout: 10000 });
      await frames(viewer);
    }
  } finally { await a.close(); await b.close(); }
});

test('leaving during the selector stops the eventual capture', async ({ page }) => {
  await syntheticCapture(page);
  await gotoRoom(page, '/room/e2e-selector');
  await page.evaluate(() => { (window as any).testDelayCapture = true; });
  await page.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
  await expect.poll(() => page.evaluate(() => Boolean((window as any).resolveCapture))).toBe(true);
  await page.getByRole('button', { name: 'Sair da sala', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.evaluate(() => (window as any).resolveCapture());
  await expect.poll(() => page.evaluate(() => (window as any).testCapture.getVideoTracks()[0].readyState)).toBe('ended');
});

test('audio mute, nickname and restart without audio preserve the session', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  try {
    const host = await a.newPage(), viewer = await b.newPage();
    await syntheticCapture(host); await syntheticCapture(viewer);
    await Promise.all([gotoRoom(host, '/room/e2e-audio'), gotoRoom(viewer, '/room/e2e-audio')]);
    await expect(host.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
    await viewer.evaluate(() => { (window as any).testBlockAudio = true; });
    await host.evaluate(() => { (window as any).testAudio = true; });
    await startLive(host);
    await expect.poll(() => host.evaluate(() => Boolean((window as any).testCapture || (window as any).testAudioUnavailable))).toBe(true);
    test.skip(await host.evaluate(() => Boolean((window as any).testAudioUnavailable)), 'The synthetic Web Audio source cannot run with this browser/audio backend.');
    await frames(viewer);
    await expect(viewer.getByRole('button', { name: 'Ativar áudio', exact: true })).toBeVisible();
    await viewer.getByRole('button', { name: 'Ativar áudio', exact: true }).click();
    await expect(viewer.getByRole('button', { name: 'Ativar áudio', exact: true })).toHaveCount(0);
    await host.getByRole('button', { name: 'Mutar áudio da tela', exact: true }).click();
    expect(await host.evaluate(() => (window as any).testCapture.getAudioTracks()[0].enabled)).toBe(false);
    await host.getByRole('button', { name: 'Reativar áudio da tela', exact: true }).click();
    await host.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first().click();
    await host.getByRole('button', { name: 'Alterar seu nickname', exact: true }).click();
    await host.getByPlaceholder('Seu nickname').fill('Apresentador');
    await host.getByPlaceholder('Seu nickname').press('Enter');
    await host.getByRole('button', { name: 'Fechar lista de participantes', exact: true }).click();
    await frames(viewer);
    expect(await host.evaluate(() => (window as any).testSockets.filter((s: WebSocket) => s.url.includes('/signal')).length)).toBe(1);
    await host.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    await expect(viewer.locator('video')).toHaveCount(0, { timeout: 1000 });
    await host.evaluate(() => { (window as any).testAudio = false; });
    await startLive(host);
    await frames(viewer);
    expect(await host.evaluate(() => (window as any).testPeers.filter((pc: RTCPeerConnection) => pc.connectionState !== 'closed')
      .every((pc: RTCPeerConnection) => pc.getSenders().every(sender => sender.track?.kind !== 'audio')))).toBe(true);
  } finally { await a.close(); await b.close(); }
});

test('simultaneous initial offers deliver both directions; one presenter can stop independently', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  try {
    const first = await a.newPage(), second = await b.newPage();
    await syntheticCapture(first); await syntheticCapture(second);
    await Promise.all([gotoRoom(first, '/room/e2e-glare'), gotoRoom(second, '/room/e2e-glare')]);
    await expect(first.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
    await Promise.all([first, second].map(page =>
      startLive(page)));
    await Promise.all([first, second].map(frames));
    await first.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
    await expect(first.getByRole('button', { name: 'Retomar transmissão', exact: true })).toBeVisible();
    await frames(first);
    await expect.poll(() => first.evaluate(() => (window as any).testPeers.every((pc: RTCPeerConnection) => pc.connectionState === 'closed' || pc.getSenders().every(sender => !sender.track)))).toBe(true);
    await expect.poll(() => second.evaluate(() => (window as any).testPeers.some((pc: RTCPeerConnection) => pc.connectionState !== 'closed' && pc.getSenders().some(sender => sender.track?.readyState === 'live')))).toBe(true);
    await first.getByRole('button', { name: 'Retomar transmissão', exact: true }).click();
    await Promise.all([first, second].map(frames));
    await first.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    await expect(first.locator('video')).toHaveCount(1, { timeout: 1000 });
    await expect(second.locator('video')).toHaveCount(1, { timeout: 1000 });
    await frames(first);
  } finally { await a.close(); await b.close(); }
});

for (const role of ['viewer', 'presenter']) {
  test(`active socket replacement resumes frames for ${role} without reload`, async ({ browser }) => {
    const a = await browser.newContext(), b = await browser.newContext();
    try {
      const host = await a.newPage(), viewer = await b.newPage();
      await syntheticCapture(host); await syntheticCapture(viewer);
      await Promise.all([gotoRoom(host, `/room/e2e-replace-${role}`), gotoRoom(viewer, `/room/e2e-replace-${role}`)]);
      await expect(host.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
      await startLive(host);
      await frames(viewer);
      const reconnecting = role === 'viewer' ? viewer : host;
      const remaining = role === 'viewer' ? host : viewer;
      await Promise.all([host, viewer].map(page => page.evaluate(() => {
        (window as any).beforeReplacementPeers = [...(window as any).testPeers];
      })));
      await remaining.evaluate(() => { (window as any).testMessages = []; });
      await reconnecting.evaluate(() => {
        const socket = (window as any).testSockets.find((s: WebSocket) => s.readyState === WebSocket.OPEN && s.url.includes('/signal')) as WebSocket;
        // Model a half-open connection: the client detects loss before the server.
        // Keep the real transport open until the server replaces it on rejoin.
        const onclose = socket.onclose!;
        socket.onclose = null; socket.onmessage = null;
        (window as any).replacementClose = new Promise(resolve => socket.addEventListener('close', event => resolve(event.code)));
        onclose.call(socket, new CloseEvent('close', { code: 1006 }));
      });
      await expect(reconnecting.getByText('Desconectado', { exact: true })).toBeVisible();
      await expect(reconnecting.getByText('Conectado', { exact: true })).toBeVisible({ timeout: 10000 });
      expect(await reconnecting.evaluate(() => (window as any).replacementClose)).toBe(4000);
      const presence = await remaining.evaluate(() => (window as any).testMessages.filter((m: any) => ['peer-joined', 'peer-left'].includes(m.type)).map((m: any) => m.type));
      expect(presence).toEqual(['peer-joined']);
      await Promise.all([host, viewer].map(page => expect.poll(() => page.evaluate(() =>
        (window as any).beforeReplacementPeers.every((pc: RTCPeerConnection) => pc.connectionState === 'closed')
      ), { timeout: 5000 }).toBe(true)));
      await frames(viewer);
      expect(await host.evaluate(() => (window as any).testCapture.getVideoTracks()[0].readyState)).toBe('live');
      expect(await reconnecting.evaluate(() => (window as any).testSockets.filter((s: WebSocket) => s.url.includes('/signal')).length)).toBe(2);
    } finally { await a.close(); await b.close(); }
  });
}

test('F21 local zoom, wheel, pan, fullscreen, touch, selection and restart', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext({ hasTouch: true })]);
  try {
    const host = await contexts[0].newPage(), viewer = await contexts[1].newPage();
    const errors: string[] = [];
    for (const page of [host, viewer]) page.on('pageerror', error => errors.push(error.message));
    await Promise.all([syntheticCapture(host), syntheticCapture(viewer)]);
    await Promise.all([gotoRoom(host, '/room/e2e-zoom'), gotoRoom(viewer, '/room/e2e-zoom')]);
    await expect(host.getByText('2', { exact: true }).first()).toBeVisible();
    await startLive(host);
    await frames(viewer);
    const viewport = viewer.getByTestId('zoom-viewport');
    const video = viewport.locator('video');
    const group = viewer.getByRole('group', { name: 'Zoom da transmissão' });
    const plus = viewer.getByRole('button', { name: 'Ampliar zoom' });
    const minus = viewer.getByRole('button', { name: 'Reduzir zoom' });
    const reset = viewer.getByRole('button', { name: 'Restaurar enquadramento' });
    await expect(group).toContainText('100%');
    await expect(minus).toBeDisabled();
    await plus.focus(); await viewer.keyboard.press('Enter');
    await expect(group).toContainText('125%');
    await expect(host.getByRole('group', { name: 'Zoom da transmissão' })).toContainText('100%');
    await reset.click();
    const box = (await viewport.boundingBox())!;
    const x = box.x + box.width / 2 + 50, y = box.y + box.height / 2;
    await viewer.mouse.move(x, y); await viewer.mouse.wheel(0, -100);
    await expect(group).toContainText('125%');
    await expect.poll(() => video.evaluate(v => new DOMMatrix(getComputedStyle(v.parentElement!).transform).m41)).toBeCloseTo(-12.5);
    await viewer.mouse.wheel(0, 100); await expect(group).toContainText('100%');
    for (let i = 0; i < 8; i++) await plus.click();
    await expect(group).toContainText('300%'); await expect(plus).toBeDisabled();
    await viewer.mouse.move(x,y); await viewer.mouse.down(); await viewer.mouse.move(x+2000,y+2000); await viewer.mouse.up();
    await expect.poll(() => video.evaluate(v => new DOMMatrix(getComputedStyle(v.parentElement!).transform).m41)).toBeGreaterThan(0);
    await viewer.getByRole('button', { name: 'Tela cheia', exact: true }).click();
    await expect.poll(() => viewer.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await viewer.getByRole('button', { name: 'Sair da tela cheia' }).click();
    await reset.click();
    await expect.poll(() => video.evaluate(v => new DOMMatrix(getComputedStyle(v.parentElement!).transform).m41)).toBe(0);
    // Wheel over a control must keep its native default behavior and leave zoom alone.
    expect(await plus.evaluate(el => el.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })))).toBe(true);
    await expect(group).toContainText('100%');
    await viewer.setViewportSize({ width: 390, height: 844 });
    await plus.tap(); await expect(group).toContainText('125%');
    await frames(viewer);
    await startLive(viewer);
    await expect(viewer.getByRole('button', { name: /^Destacar transmissão/ })).toBeVisible();
    await viewer.getByRole('button', { name: /^Destacar transmissão/ }).click();
    await expect(group).toContainText('100%');
    await plus.tap();
    await viewer.getByRole('button', { name: /^Destacar transmissão/ }).click();
    await expect(group).toContainText('100%');
    await viewer.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    await host.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    await expect(viewport).toHaveCount(0);
    await startLive(host);
    await frames(viewer); await expect(group).toContainText('100%');
    await viewer.mouse.move(0, 0);
    await viewer.screenshot({ path: test.info().outputPath('zoom-mobile.png') });
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(c => c.close())); }
});

for (const mobile of [false, true]) {
  test(`preview privacy, pause senders and resume (${mobile ? 'mobile' : 'desktop'})`, async ({ browser }) => {
    const a = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, hasTouch: mobile });
    const b = await browser.newContext();
    const c = await browser.newContext();
    try {
      const host = await a.newPage(), viewer = await b.newPage(), late = await c.newPage();
      await syntheticCapture(host); await syntheticCapture(viewer); await syntheticCapture(late);
      await mockPausePiP(viewer);
      await gotoRoom(host, '/room/e2e-preview-' + mobile);
      await host.evaluate(() => { (window as any).testAudio = true; });
      await host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
      await expect(host.getByRole('dialog')).toContainText('Não está ao vivo');
      await expect.poll(() => host.getByRole('dialog').locator('video').evaluate(video => (video as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
      await host.screenshot({ path: test.info().outputPath('preview.png') });
      const cancel = host.getByRole('button', { name: 'Cancelar', exact: true });
      await cancel.focus();
      await expect(cancel).toBeFocused();
      await expect.poll(() => host.locator('video').evaluateAll(videos => videos.every(v => (v as HTMLVideoElement).muted))).toBe(true);
      await gotoRoom(viewer, '/room/e2e-preview-' + mobile);
      await expect(viewer.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
      const noSenders = () => host.evaluate(() => (window as any).testPeers.every((pc: RTCPeerConnection) =>
        pc.connectionState === 'closed' || pc.getSenders().every(sender => !sender.track)));
      await expect.poll(noSenders).toBe(true);
      await expect(viewer.locator('video')).toHaveCount(0);
      await host.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await expect.poll(() => host.evaluate(() => (window as any).testCapture.getTracks().every((t: MediaStreamTrack) => t.readyState === 'ended'))).toBe(true);
      await startLive(host);
      await frames(viewer);
      await viewer.getByRole('button', { name: 'Janela flutuante (PiP)', exact: true }).click();
      await expect.poll(() => viewer.evaluate(() => !!document.pictureInPictureElement)).toBe(true);
      await host.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
      await expect(host.getByRole('button', { name: 'Retomar transmissão', exact: true })).toBeVisible();
      await expect.poll(noSenders).toBe(true);
      await expect.poll(() => viewer.evaluate(() => !!document.pictureInPictureElement)).toBe(false);
      await host.getByRole('button', { name: 'Retomar transmissão', exact: true }).click();
      await frames(viewer);
      await expect.poll(() => host.evaluate(() => (window as any).testCapture.getAudioTracks().every((t: MediaStreamTrack) => t.enabled))).toBe(true);
      await host.getByRole('button', { name: 'Mutar áudio da tela', exact: true }).click();
      for (let cycle = 0; cycle < 3; cycle++) {
        await host.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
        await expect(host.getByRole('button', { name: 'Retomar transmissão', exact: true })).toBeVisible();
        await expect.poll(noSenders).toBe(true);
        await expect(viewer.getByText('Transmissão pausada', { exact: true })).toBeVisible();
        await expect(viewer.locator('video')).toHaveCount(0);
        if (cycle === 0) await host.screenshot({ path: test.info().outputPath('paused.png') });
        await expect.poll(() => host.evaluate(() => (window as any).testCapture.getTracks().every((t: MediaStreamTrack) => t.readyState === 'live'))).toBe(true);
        if (cycle === 0) {
          await gotoRoom(late, '/room/e2e-preview-' + mobile);
          await expect(late.getByText('Transmissão pausada', { exact: true })).toBeVisible();
          await expect.poll(noSenders).toBe(true);
          await host.evaluate(() => (window as any).testSockets.filter((s: WebSocket) => s.readyState === 1 && s.url.includes('/signal')).forEach((s: WebSocket) => s.close(4001)));
          await expect(host.locator('.room-header-status-label')).toHaveText('Desconectado');
          await expect(host.locator('.room-header-status-label')).toHaveText('Conectado', { timeout: 10000 });
          await expect.poll(noSenders).toBe(true);
        }
        const resume = host.getByRole('button', { name: 'Retomar transmissão', exact: true });
        if (mobile) await resume.tap();
        else { await resume.focus(); await host.keyboard.press('Enter'); }
        await frames(viewer);
        await expect(host.getByRole('button', { name: 'Reativar áudio da tela', exact: true })).toBeVisible();
        await expect.poll(() => host.evaluate(() => (window as any).testCapture.getAudioTracks().every((t: MediaStreamTrack) => !t.enabled))).toBe(true);
      }
      await host.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
      await expect(host.getByRole('button', { name: 'Retomar transmissão', exact: true })).toBeVisible();
      await host.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
      await expect.poll(noSenders).toBe(true);
      await expect.poll(() => host.evaluate(() => (window as any).testCapture.getTracks().every((t: MediaStreamTrack) => t.readyState === 'ended'))).toBe(true);
    } finally { await Promise.all([a.close(), b.close(), c.close()]); }
  });
}

test('preview reconnect, duplicate confirmation and native end in preview/paused capture', async ({ browser, browserName }) => {
  test.skip(browserName === 'firefox', 'Gecko ignores untrusted ended events; native stop requires manual verification.');
  const a = await browser.newContext(), b = await browser.newContext();
  try {
    const host = await a.newPage(), viewer = await b.newPage();
    await syntheticCapture(host); await syntheticCapture(viewer);
    await Promise.all([gotoRoom(host, '/room/e2e-preview-end'), gotoRoom(viewer, '/room/e2e-preview-end')]);
    const capture = () => host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
    const endNative = () => host.evaluate(() => {
      const track = (window as any).testCapture.getVideoTracks()[0];
      track.stop(); track.dispatchEvent(new Event('ended'));
    });
    await capture();
    await expect(host.getByRole('dialog')).toBeVisible();
    await host.evaluate(() => (window as any).testSockets.filter((s: WebSocket) => s.readyState === 1 && s.url.includes('/signal')).forEach((s: WebSocket) => s.close(4001)));
    await expect(host.locator('.room-header-status-label')).toHaveText('Desconectado');
    await expect(host.locator('.room-header-status-label')).toHaveText('Conectado', { timeout: 10000 });
    await expect(viewer.locator('video')).toHaveCount(0);
    await expect.poll(() => host.evaluate(() => (window as any).testPeers.every((pc: RTCPeerConnection) => pc.connectionState === 'closed' || pc.getSenders().every(sender => !sender.track)))).toBe(true);
    await endNative();
    await expect(host.getByRole('dialog')).toHaveCount(0);
    await capture();
    await host.getByRole('button', { name: 'Entrar ao vivo', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await frames(viewer);
    await host.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Retomar transmissão', exact: true })).toBeVisible();
    await endNative();
    await expect(viewer.getByText('Transmissão pausada', { exact: true })).toHaveCount(0);
    await expect(host.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true })).toHaveCount(0);
    await startLive(host);
    await frames(viewer);
  } finally { await a.close(); await b.close(); }
});

test('confirm/stop and resume/stop invalidate publication without reloading', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  try {
    const host = await a.newPage(), viewer = await b.newPage();
    await syntheticCapture(host); await syntheticCapture(viewer);
    await Promise.all([gotoRoom(host, '/room/e2e-rapid'), gotoRoom(viewer, '/room/e2e-rapid')]);
    await expect(viewer.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
    await host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
    await host.getByRole('button', { name: 'Entrar ao vivo', exact: true }).evaluate(button => {
      (button as HTMLButtonElement).click();
      [...document.querySelectorAll('button')].find(button => button.textContent === 'Cancelar')?.click();
    });
    const stopped = async () => {
      await expect.poll(() => host.evaluate(() => (window as any).testCapture.getTracks().every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
      await expect.poll(() => host.evaluate(() => (window as any).testPeers.every((pc: RTCPeerConnection) => pc.connectionState === 'closed' || pc.getSenders().every(sender => !sender.track)))).toBe(true);
      await expect(host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last()).toBeVisible();
      await expect(viewer.locator('video')).toHaveCount(0);
    };
    await stopped();
    await startLive(host);
    await frames(viewer);
    await host.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
    await host.getByRole('button', { name: 'Retomar transmissão', exact: true }).evaluate(button => {
      (button as HTMLButtonElement).click();
      document.querySelector<HTMLButtonElement>('button[aria-label="Parar compartilhamento de tela"]')?.click();
    });
    await stopped();
    await startLive(host);
    await frames(viewer);
  } finally { await a.close(); await b.close(); }
});

test('a presenter arriving during local preview keeps the spotlight after confirmation', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  try {
    const host = await a.newPage(), other = await b.newPage();
    await syntheticCapture(host); await syntheticCapture(other);
    await Promise.all([gotoRoom(host, '/room/e2e-preview-focus'), gotoRoom(other, '/room/e2e-preview-focus')]);
    await expect(other.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
    await host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
    await expect(host.getByRole('dialog')).toBeVisible();
    await startLive(other);
    await frames(host);
    await host.getByRole('button', { name: 'Entrar ao vivo', exact: true }).click();
    await expect(host.getByRole('dialog')).toHaveCount(0);
    await frames(other);
    await expect.poll(() => host.getByTestId('zoom-viewport').locator('video').evaluate(video => (video as HTMLVideoElement).muted)).toBe(false);
  } finally { await a.close(); await b.close(); }
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 768, height: 600 }, { width: 390, height: 844 }, { width: 320, height: 568 }, { width: 800, height: 360 }]) {
  test(`preview and dock visual layout ${viewport.width}x${viewport.height}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width <= 390 });
    const page = await context.newPage();
    await syntheticCapture(page);
    const snapshot = async (name: string) => {
      await page.mouse.move(0, 0);
      await page.screenshot({ path: test.info().outputPath(`${name}.png`), animations: 'disabled' });
    };
    const dockFits = async () => {
      const bounds = await page.locator('.floating-dock-bar button').evaluateAll(buttons => buttons.map(button => {
        const r = button.getBoundingClientRect();
        const label = button.querySelector<HTMLElement>('.mantine-Button-label');
        return { x: r.x, right: r.right, y: r.y, bottom: r.bottom, width: r.width, height: r.height, labelFits: !label || label.scrollWidth <= label.clientWidth };
      }));
      for (const [i, r] of bounds.entries()) {
        expect(r.x).toBeGreaterThanOrEqual(0);
        expect(r.right).toBeLessThanOrEqual(viewport.width);
        expect(r.bottom).toBeLessThanOrEqual(viewport.height);
        expect(r.width).toBeGreaterThanOrEqual(40);
        expect(r.height).toBe(42);
        expect(r.labelFits).toBe(true);
        if (i) { expect(r.x).toBeGreaterThanOrEqual(bounds[i - 1].right); expect(r.y).toBe(bounds[0].y); }
      }
    };
    try {
      await gotoRoom(page, `/room/e2e-layout-${viewport.width}`);
      const share = page.locator('.floating-dock-bar').getByRole('button', { name: 'Compartilhar tela', exact: true });
      await expect(share).toBeVisible();
      await dockFits();
      await snapshot('dock-idle');
      for (const audio of [false, true]) {
        await page.evaluate(value => { (window as any).testAudio = value; }, audio);
        await share.click();
        const dialog = page.getByRole('dialog', { name: 'Pré-visualização', exact: true });
        await expect(dialog).toContainText(audio ? 'Áudio disponível' : 'Sem áudio');
        await expect.poll(() => dialog.locator('video').evaluate(video => (video as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
        const box = (await dialog.boundingBox())!;
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(viewport.width);
        expect(box.y + box.height).toBeLessThanOrEqual(viewport.height);
        if (viewport.width === 1280) expect(box.width).toBe(780);
        const cancel = dialog.getByRole('button', { name: 'Cancelar', exact: true });
        await cancel.focus();
        await page.keyboard.press('Tab');
        await expect(dialog.getByRole('button', { name: 'Entrar ao vivo', exact: true })).toBeFocused();
        await page.keyboard.press('Tab');
        await expect(dialog.getByRole('button', { name: 'Cancelar pré-visualização', exact: true })).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await snapshot(audio ? 'preview-audio' : 'preview-no-audio');
        if (!audio) {
          await page.keyboard.press('Escape');
          await expect(dialog).toHaveCount(0);
          await expect.poll(() => page.evaluate(() => (window as any).testCapture.getTracks().every((t: MediaStreamTrack) => t.readyState === 'ended'))).toBe(true);
        }
      }
      await page.getByRole('button', { name: 'Entrar ao vivo', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await dockFits();
      await snapshot('dock-live');
      await page.getByRole('button', { name: 'Mutar áudio da tela', exact: true }).click();
      await dockFits();
      await snapshot('dock-muted');
      const pause = page.getByRole('button', { name: 'Pausar transmissão', exact: true });
      await pause.focus();
      await page.keyboard.press('Enter');
      const resume = page.getByRole('button', { name: 'Retomar transmissão', exact: true });
      await expect(resume).toBeVisible();
      await dockFits();
      await snapshot('dock-paused');
      if (viewport.width <= 390) await resume.tap(); else await resume.click();
      await expect(pause).toBeVisible();
      const stop = page.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true });
      await stop.hover();
      await expect(page.getByRole('tooltip', { name: 'Parar compartilhamento de tela', exact: true })).toBeVisible();
      await stop.click();
      await expect(share).toBeVisible();
    } finally { await context.close(); }
  });
}

for (const mobile of [false, true]) {
  test(`capture controls pending and unavailable ${mobile ? 'mobile' : 'desktop'}`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, hasTouch: mobile });
    const page = await context.newPage(), viewer = await context.newPage();
    await syntheticCapture(page);
    await page.addInitScript(() => {
      const replaceTrack = RTCRtpSender.prototype.replaceTrack;
      RTCRtpSender.prototype.replaceTrack = async function (track) {
        // Publication can reuse an already negotiated sender without setting SDP.
        if (track && (window as any).holdPublication) await new Promise(resolve => { (window as any).releasePublication = resolve; });
        if ((window as any).holdPause) await new Promise(resolve => { ((window as any).releasePause ||= []).push(resolve); });
        return replaceTrack.call(this, track);
      };
    });
    try {
      await Promise.all([gotoRoom(page, `/room/e2e-pending-${mobile}`), gotoRoom(viewer, `/room/e2e-pending-${mobile}`)]);
      await expect(page.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
      await page.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
      await page.evaluate(() => { (window as any).holdPublication = true; });
      const confirm = page.getByRole('button', { name: 'Entrar ao vivo', exact: true });
      await confirm.click();
      await expect(page.getByRole('dialog')).toContainText('Entrando ao vivo…');
      await expect(confirm).toHaveAttribute('data-loading', 'true');
      await expect(confirm).toBeDisabled();
      await page.screenshot({ animations: 'disabled', path: test.info().outputPath('preview-publishing.png') });
      await page.evaluate(() => { (window as any).holdPublication = false; (window as any).releasePublication(); });
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.evaluate(() => { (window as any).holdPause = true; });
      const pause = page.getByRole('button', { name: 'Pausar transmissão', exact: true });
      await pause.click();
      await expect(pause).toBeDisabled();
      await expect(pause).toHaveAttribute('data-loading', 'true');
      await expect(page.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true })).toBeEnabled();
      await page.screenshot({ animations: 'disabled', path: test.info().outputPath('dock-pausing.png') });
      await page.evaluate(() => { (window as any).holdPause = false; (window as any).releasePause.forEach((resolve: () => void) => resolve()); });
      await expect(page.getByRole('button', { name: 'Retomar transmissão', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
      await page.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
      await page.getByRole('button', { name: 'Cancelar pré-visualização', exact: true }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => (window as any).testCapture.getTracks().every((t: MediaStreamTrack) => t.readyState === 'ended'))).toBe(true);
      await page.addInitScript(() => { Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { value: undefined, configurable: true }); });
      await page.reload();
      await expect(page.locator('.floating-dock-bar')).toBeVisible();
      await expect(page.locator('.floating-dock-bar').getByRole('button', { name: 'Compartilhar tela', exact: true })).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath('dock-unavailable.png') });
    } finally { await context.close(); }
  });
}

async function senderTrackIds(page: Page) {
  return page.evaluate(() => (window as any).testPeers.flatMap((pc: RTCPeerConnection) =>
    pc.connectionState === 'closed' ? [] : pc.getSenders().flatMap(sender => sender.track ? [sender.track.id] : [])) as string[]);
}

async function holdReplacement(page: Page) {
  await page.addInitScript(() => {
    const replace = RTCRtpSender.prototype.replaceTrack;
    RTCRtpSender.prototype.replaceTrack = async function (track) {
      const w = window as any;
      if (w.testFailReplace === (track ? 'attach' : 'detach')) throw new Error('Injected replacement failure');
      if (w.testHoldReplace === (track ? 'attach' : 'detach')) {
        await new Promise(resolve => { (w.testReplacements ||= []).push(resolve); });
      }
      return replace.call(this, track);
    };
  });
}

for (const viewport of [{ width: 1280, height: 800 }, { width: 320, height: 568 }, { width: 800, height: 360 }]) {
  test(`F27 confirm and cancel protect both sources, audio and reusable senders at ${viewport.width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width === 320 });
    try {
      const host = await context.newPage(), viewer = await context.newPage();
      await syntheticCapture(host); await syntheticCapture(viewer);
      await host.addInitScript(() => { (window as any).testAudio = true; });
      await Promise.all([gotoRoom(host, `/room/f27-confirm-${viewport.width}`), gotoRoom(viewer, `/room/f27-confirm-${viewport.width}`)]);
      await expect(host.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
      await startLive(host); await frames(viewer);
      await host.getByRole('button', { name: 'Mutar áudio da tela', exact: true }).click();
      const original = await senderTrackIds(host);
      const switchButton = host.getByRole('button', { name: 'Trocar tela', exact: true });
      await switchButton.focus(); await host.keyboard.press('Enter');
      const dialog = host.getByRole('dialog');
      await expect(dialog).toContainText('Nova origem — não está ao vivo');
      await expect.poll(() => senderTrackIds(host)).toEqual([]);
      expect(await host.evaluate(() => (window as any).testCaptures[0].getTracks().every((t: MediaStreamTrack) => !t.enabled && t.readyState === 'live'))).toBe(true);
      await expect(viewer.getByText('Transmissão pausada', { exact: true }).first()).toBeVisible();
      const previewBounds = (await dialog.boundingBox())!;
      expect(previewBounds.x).toBeGreaterThanOrEqual(0);
      expect(previewBounds.x + previewBounds.width).toBeLessThanOrEqual(viewport.width);
      expect(previewBounds.y + previewBounds.height).toBeLessThanOrEqual(viewport.height);
      await host.screenshot({ path: test.info().outputPath('switch-preview.png') });
      await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await expect.poll(() => senderTrackIds(host)).toEqual(original);
      expect(await host.evaluate(() => (window as any).testCaptures[1].getTracks().every((t: MediaStreamTrack) => t.readyState === 'ended'))).toBe(true);
      await frames(viewer);
      await switchButton.click();
      await expect(dialog).toContainText('Nova origem');
      const confirm = dialog.getByRole('button', { name: 'Confirmar troca', exact: true });
      if (viewport.width === 320) await confirm.tap(); else { await confirm.focus(); await host.keyboard.press('Enter'); }
      await expect(dialog).toHaveCount(0);
      await frames(viewer);
      const next = await host.evaluate(() => (window as any).testCapture.getTracks().map((t: MediaStreamTrack) => t.id));
      expect((await senderTrackIds(host)).sort()).toEqual(next.sort());
      expect(await host.evaluate(() => (window as any).testCaptures[0].getTracks().every((t: MediaStreamTrack) => t.readyState === 'ended'))).toBe(true);
      await expect(host.getByRole('button', { name: 'Reativar áudio da tela', exact: true })).toBeVisible();
      expect(await host.evaluate(() => (window as any).testCapture.getAudioTracks()[0].enabled)).toBe(false);
      expect(await host.evaluate(() => (window as any).testPeers.filter((pc: RTCPeerConnection) => pc.connectionState !== 'closed').length)).toBe(1);
      const bar = await host.locator('.floating-dock-bar').boundingBox();
      expect(bar!.x).toBeGreaterThanOrEqual(0); expect(bar!.x + bar!.width).toBeLessThanOrEqual(viewport.width);
      await host.screenshot({ path: test.info().outputPath('switch-dock.png') });
      // Muted preference survives absence and later return of an audio track.
      await host.evaluate(() => { (window as any).testAudio = false; });
      await switchButton.click(); await expect(dialog).toContainText('Sem áudio');
      await dialog.getByRole('button', { name: 'Confirmar troca' }).click();
      await expect(dialog).toHaveCount(0);
      expect((await senderTrackIds(host)).length).toBe(1);
      await expect(viewer.getByText('Tela com áudio', { exact: true })).toHaveCount(0);
      await host.evaluate(() => { (window as any).testAudio = true; });
      await switchButton.click(); await dialog.getByRole('button', { name: 'Confirmar troca' }).click();
      await expect(dialog).toHaveCount(0);
      expect((await senderTrackIds(host)).length).toBe(2);
      expect(await host.evaluate(() => (window as any).testCapture.getAudioTracks()[0].enabled)).toBe(false);
      await host.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
      await expect.poll(() => senderTrackIds(host)).toEqual([]);
      expect(await host.evaluate(() => (window as any).testCaptures.every((s: MediaStream) => s.getTracks().every(t => t.readyState === 'ended')))).toBe(true);
      expect(await host.evaluate(() => (window as any).testEndedListeners.every((listeners: Set<unknown>) => listeners.size === 0))).toBe(true);
    } finally { await context.close(); }
  });
}

for (const paused of [false, true]) {
  test(`F27 picker errors and preview cancellation restore original ${paused ? 'paused' : 'live'} state`, async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const host = await context.newPage(), viewer = await context.newPage();
      await syntheticCapture(host); await syntheticCapture(viewer);
      await Promise.all([gotoRoom(host, `/room/f27-cancel-${paused}`), gotoRoom(viewer, `/room/f27-cancel-${paused}`)]);
      await expect(host.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
      await startLive(host); await frames(viewer);
      const original = await senderTrackIds(host);
      if (paused) await host.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
      const button = host.getByRole('button', { name: 'Trocar tela', exact: true });
      for (const error of ['NotAllowedError', 'AbortError', 'NotReadableError']) {
        await host.evaluate(error => { (window as any).testRejectCapture = error; }, error);
        await button.click();
        await expect(host.getByRole('button', { name: paused ? 'Retomar transmissão' : 'Pausar transmissão', exact: true })).toBeEnabled();
        await expect.poll(() => senderTrackIds(host)).toEqual(paused ? [] : original);
      }
      await host.evaluate(() => { (window as any).testRejectCapture = null; });
      await button.click(); await expect(host.getByRole('dialog')).toBeVisible();
      await host.keyboard.press('Escape');
      await expect.poll(() => senderTrackIds(host)).toEqual(paused ? [] : original);
      await expect(host.getByRole('button', { name: paused ? 'Retomar transmissão' : 'Pausar transmissão', exact: true })).toBeEnabled();
      // Confirmation always resumes the selected source, even when initiated from pause.
      await button.click(); await host.getByRole('button', { name: 'Confirmar troca' }).click();
      await expect(host.getByRole('button', { name: 'Pausar transmissão', exact: true })).toBeEnabled();
      await frames(viewer);
    } finally { await context.close(); }
  });
}

for (const action of ['cancel', 'stop', 'leave', 'old-ended', 'new-ended', 'old-ended-confirm'] as const) {
  test(`F27 delayed picker and native endings: ${action}`, async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const host = await context.newPage(); await syntheticCapture(host);
      await gotoRoom(host, `/room/f27-delayed-${action}`); await startLive(host);
      await host.evaluate(() => { (window as any).testDelayCapture = true; });
      await host.getByRole('button', { name: 'Trocar tela', exact: true }).click();
      await expect.poll(() => host.evaluate(() => (window as any).testCaptures.length)).toBe(2);
      expect(await host.evaluate(() => (window as any).testCaptures[0].getTracks().every((t: MediaStreamTrack) => !t.enabled))).toBe(true);
      if (action.startsWith('old-ended')) await host.evaluate(() => {
        const track = (window as any).testCaptures[0].getVideoTracks()[0]; track.stop(); track.dispatchEvent(new Event('ended'));
      });
      if (action === 'cancel') await host.getByRole('button', { name: 'Cancelar troca', exact: true }).click();
      if (action === 'stop') await host.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
      if (action === 'leave') await host.getByRole('button', { name: /Sair/ }).last().click();
      await host.evaluate(() => (window as any).resolveCapture());
      if (action === 'old-ended' || action === 'old-ended-confirm' || action === 'new-ended') {
        await expect(host.getByRole('dialog')).toBeVisible();
        if (action === 'new-ended') await host.evaluate(() => {
          const track = (window as any).testCapture.getVideoTracks()[0]; track.stop(); track.dispatchEvent(new Event('ended'));
        });
        else await host.getByRole('button', { name: action === 'old-ended-confirm' ? 'Confirmar troca' : 'Cancelar', exact: true }).click();
      }
      await expect(host.getByRole('dialog')).toHaveCount(0);
      if (action === 'cancel' || action === 'new-ended' || action === 'old-ended-confirm') {
        await expect(host.getByRole('button', { name: 'Pausar transmissão', exact: true })).toBeEnabled();
        const liveIndex = action === 'old-ended-confirm' ? 1 : 0;
        expect(await host.evaluate(index => (window as any).testCaptures[index].getVideoTracks()[0].readyState, liveIndex)).toBe('live');
      } else {
        await expect.poll(() => host.evaluate(() => (window as any).testCaptures.every((s: MediaStream) => s.getTracks().every(t => t.readyState === 'ended')))).toBe(true);
        await expect.poll(() => senderTrackIds(host)).toEqual([]);
      }
    } finally { await context.close(); }
  });
}

for (const failure of ['detach', 'attach']) {
  test(`F27 ${failure} failure stops both captures and all senders`, async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const host = await context.newPage(), viewer = await context.newPage();
      await syntheticCapture(host); await syntheticCapture(viewer); await holdReplacement(host);
      await Promise.all([gotoRoom(host, `/room/f27-failure-${failure}`), gotoRoom(viewer, `/room/f27-failure-${failure}`)]);
      await expect(host.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
      await startLive(host); await frames(viewer);
      await host.evaluate(failure => { (window as any).testFailReplace = failure; }, failure);
      await host.getByRole('button', { name: 'Trocar tela', exact: true }).click();
      if (failure === 'attach') await host.getByRole('button', { name: 'Confirmar troca' }).click();
      await expect(host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last()).toBeVisible();
      await expect.poll(() => senderTrackIds(host)).toEqual([]);
      await expect.poll(() => host.evaluate(() => (window as any).testCaptures.every((s: MediaStream) => s.getTracks().every(t => t.readyState === 'ended')))).toBe(true);
    } finally { await context.close(); }
  });
}

test('F27 detach barrier, duplicate clicks, late join, reconnect and independent presenter', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const host = await context.newPage(), other = await context.newPage();
    await syntheticCapture(host); await syntheticCapture(other); await holdReplacement(host);
    await Promise.all([gotoRoom(host, '/room/f27-concurrency'), gotoRoom(other, '/room/f27-concurrency')]);
    await expect(host.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
    await startLive(host); await startLive(other); await frames(host); await frames(other);
    const originalOthers = await senderTrackIds(other);
    await host.evaluate(() => { (window as any).testHoldReplace = 'detach'; });
    // Dispatch twice within one event turn: the synchronous state guard must prevent a second picker.
    await host.getByRole('button', { name: 'Trocar tela', exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect.poll(() => host.evaluate(() => (window as any).testCaptures.length)).toBe(2);
    await expect.poll(() => host.evaluate(() => (window as any).testReplacements?.length || 0)).toBeGreaterThan(0);
    await expect(host.getByRole('dialog')).toHaveCount(0);
    expect(await host.evaluate(() => (window as any).testPeers.filter((pc: RTCPeerConnection) => pc.connectionState !== 'closed').every((pc: RTCPeerConnection) => pc.getSenders().every(s => !s.track || !s.track.enabled)))).toBe(true);
    const late = await context.newPage(); await syntheticCapture(late); await gotoRoom(late, '/room/f27-concurrency');
    await expect(host.getByRole('button', { name: 'Ver participantes (3)', exact: true }).first()).toBeVisible();
    await host.evaluate(() => { (window as any).testHoldReplace = null; (window as any).testReplacements.forEach((resolve: () => void) => resolve()); });
    await expect(host.getByRole('dialog')).toBeVisible();
    await expect.poll(() => senderTrackIds(host)).toEqual([]);
    // Reconnect while the unconfirmed source exists; rebuilt peers must remain streamless.
    await host.evaluate(() => (window as any).testSockets.at(-1).close());
    await expect(host.getByText('Conectado', { exact: true })).toBeVisible();
    await expect(host.getByRole('button', { name: 'Ver participantes (3)', exact: true }).first()).toBeVisible();
    await expect.poll(() => senderTrackIds(host)).toEqual([]);
    expect(await other.evaluate(ids => (window as any).testPeers.some((pc: RTCPeerConnection) => pc.connectionState !== 'closed' && pc.getSenders().some(s => ids.includes(s.track?.id ?? ''))), originalOthers)).toBe(true);
    await host.getByRole('button', { name: 'Confirmar troca' }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
    await expect(host.getByRole('dialog')).toHaveCount(0);
    await frames(other); await frames(late);
    const currentIds = await host.evaluate(() => (window as any).testCapture.getTracks().map((t: MediaStreamTrack) => t.id));
    await expect.poll(() => senderTrackIds(host)).toEqual([...currentIds, ...currentIds]);
  } finally { await context.close(); }
});

for (const phase of ['detach-cancel', 'detach-stop', 'publish-stop', 'publish-end', 'restore-stop'] as const) {
  test(`F27 invalidates queued operations: ${phase}`, async ({ browser }) => {
    const context = await browser.newContext();
    try {
      const host = await context.newPage(), viewer = await context.newPage();
      await syntheticCapture(host); await syntheticCapture(viewer); await holdReplacement(host);
      await host.addInitScript(() => { (window as any).testAudio = true; });
      await Promise.all([gotoRoom(host, `/room/f27-queued-${phase}`), gotoRoom(viewer, `/room/f27-queued-${phase}`)]);
      await expect(host.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
      await startLive(host); await frames(viewer);
      const original = await senderTrackIds(host);
      const detaching = phase.startsWith('detach');
      if (detaching) await host.evaluate(() => { (window as any).testHoldReplace = 'detach'; });
      await host.getByRole('button', { name: 'Trocar tela', exact: true }).click();
      await expect.poll(() => host.evaluate(() => (window as any).testCaptures.length)).toBe(2);
      if (detaching) {
        await expect.poll(() => host.evaluate(() => (window as any).testReplacements?.length || 0)).toBeGreaterThan(0);
        if (phase === 'detach-cancel') await host.getByRole('button', { name: 'Cancelar troca', exact: true }).click();
        else await host.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
        await expect(host.getByRole('dialog')).toHaveCount(0);
      } else {
        await expect(host.getByRole('dialog')).toBeVisible();
        await host.evaluate(() => { (window as any).testHoldReplace = 'attach'; });
        await host.getByRole('button', { name: phase === 'restore-stop' ? 'Cancelar' : 'Confirmar troca', exact: true }).click();
        await expect.poll(() => host.evaluate(() => (window as any).testReplacements?.length || 0)).toBeGreaterThan(0);
        if (phase === 'publish-end') await host.evaluate(() => {
          const track = (window as any).testCapture.getVideoTracks()[0]; track.stop(); track.dispatchEvent(new Event('ended'));
        });
        else if (phase === 'publish-stop') await host.getByRole('dialog').getByRole('button', { name: 'Parar', exact: true }).click();
        else await host.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
      }
      await host.evaluate(() => { (window as any).testHoldReplace = null; (window as any).testReplacements.forEach((resolve: () => void) => resolve()); });
      if (phase === 'detach-cancel') {
        await expect(host.getByRole('button', { name: 'Pausar transmissão', exact: true })).toBeEnabled();
        await expect.poll(() => senderTrackIds(host)).toEqual(original);
        expect(await host.evaluate(() => (window as any).testCaptures[1].getTracks().every((t: MediaStreamTrack) => t.readyState === 'ended'))).toBe(true);
      } else {
        await expect(host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last()).toBeVisible();
        await expect.poll(() => senderTrackIds(host)).toEqual([]);
        expect(await host.evaluate(() => (window as any).testCaptures.every((s: MediaStream) => s.getTracks().every(t => t.readyState === 'ended')))).toBe(true);
      }
    } finally { await context.close(); }
  });
}

test('F27 first audio source negotiates without losing the reused remote video', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const host = await context.newPage(), viewer = await context.newPage();
    await syntheticCapture(host); await syntheticCapture(viewer);
    await Promise.all([gotoRoom(host, '/room/f27-first-audio'), gotoRoom(viewer, '/room/f27-first-audio')]);
    await expect(host.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
    await startLive(host); await frames(viewer);
    await host.evaluate(() => { (window as any).testAudio = true; });
    await host.getByRole('button', { name: 'Trocar tela', exact: true }).click();
    await host.getByRole('button', { name: 'Confirmar troca' }).click();
    await expect(host.getByRole('dialog')).toHaveCount(0);
    await frames(viewer);
    await expect.poll(() => viewer.locator('video').first().evaluate(video =>
      (video as HTMLVideoElement).srcObject instanceof MediaStream && ((video as HTMLVideoElement).srcObject as MediaStream).getTracks().filter(t => t.readyState === 'live').map(t => t.kind).sort(),
    )).toEqual(['audio', 'video']);
    const settings = host.locator('.floating-dock-bar').getByRole('button', { name: 'Configurações e convite', exact: true });
    await settings.focus(); await host.keyboard.press('Enter');
    await expect(host.getByRole('menuitem', { name: 'Copiar link de convite', exact: true })).toBeVisible();
    await host.getByRole('menuitem', { name: 'Configurações e diagnósticos', exact: true }).click();
    await expect(host.getByRole('dialog')).toContainText('Transmissão, áudio e diagnóstico');
  } finally { await context.close(); }
});

for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`F01 F02 quality controls and live sender limits ${viewport.width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width < 500 });
    const host = await context.newPage(), viewer = await context.newPage();
    const openSettings = async () => {
      const trigger = host.locator('.floating-dock-bar').getByRole('button', { name: 'Configurações e convite', exact: true });
      await trigger.focus(); await host.keyboard.press('Enter');
      await host.getByRole('menuitem', { name: 'Configurações e diagnósticos', exact: true }).click();
    };
    const assertSender = async (fps: number, bitrate: number, hint: string) => {
      await expect.poll(() => host.evaluate(() => (window as any).testPeers
        .filter((pc: RTCPeerConnection) => pc.connectionState !== 'closed')
        .flatMap((pc: RTCPeerConnection) => pc.getSenders().filter(sender => sender.track?.kind === 'video')
          .map(sender => ({ fps: sender.getParameters().encodings[0]?.maxFramerate,
            bitrate: sender.getParameters().encodings[0]?.maxBitrate, hint: sender.track?.contentHint }))))
        ).toEqual([{ fps, bitrate, hint }]);
    };
    try {
      await syntheticCapture(host); await syntheticCapture(viewer);
      await Promise.all([gotoRoom(host, `/room/f01-${viewport.width}`), gotoRoom(viewer, `/room/f01-${viewport.width}`)]);
      await expect(host.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
      await startLive(host); await frames(viewer);
      await openSettings();
      await expect(host.getByLabel('Nível de qualidade')).toHaveValue('balanced');
      await expect(host.getByLabel('Limite de FPS')).toHaveValue('30');
      // Switching priority from sharpness to motion preserves valid 30 FPS.
      await host.getByRole('radio', { name: 'Nitidez', exact: true }).focus();
      await host.keyboard.press('ArrowRight');
      await expect(host.getByLabel('Limite de FPS')).toHaveValue('30');
      await host.getByLabel('Nível de qualidade').selectOption('ultra');
      await host.getByLabel('Limite de FPS').selectOption('60');
      await assertSender(60, 8000000, 'motion');
      await host.screenshot({ path: test.info().outputPath(`quality-${viewport.width}.png`), animations: 'disabled' });
      await test.info().attach('quality-ui', { path: test.info().outputPath(`quality-${viewport.width}.png`), contentType: 'image/png' });
      await host.getByLabel('Nível de qualidade').selectOption('economy');
      await expect(host.getByLabel('Limite de FPS').locator('option')).toHaveCount(1);
      await assertSender(30, 2000000, 'motion');
      if (viewport.width < 500) await host.getByText('Nitidez', { exact: true }).tap();
      else await host.getByText('Nitidez', { exact: true }).click();
      await host.getByLabel('Nível de qualidade').selectOption('ultra');
      await host.getByLabel('Limite de FPS').selectOption('20');
      await assertSender(20, 6000000, 'text');
      await host.getByRole('button', { name: 'Fechar configurações' }).click();
      await host.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
      await host.getByRole('button', { name: 'Retomar transmissão', exact: true }).click();
      await assertSender(20, 6000000, 'text');
      await host.getByRole('button', { name: 'Trocar tela', exact: true }).click();
      await host.getByRole('button', { name: 'Confirmar troca' }).click();
      await assertSender(20, 6000000, 'text');
      await frames(viewer);
      const stats = await host.evaluate(async () => {
        const reports: unknown[] = [];
        for (const pc of (window as any).testPeers as RTCPeerConnection[]) {
          if (pc.connectionState !== 'closed') (await pc.getStats()).forEach(report => {
            if (report.type === 'outbound-rtp' && report.kind === 'video') reports.push(report);
          });
        }
        return { capture: (window as any).testCapture.getVideoTracks()[0].getSettings(), outbound: reports };
      });
      await test.info().attach('synthetic-real-webrtc-stats', { body: JSON.stringify(stats, null, 2), contentType: 'application/json' });
      expect(await host.evaluate(() => (window as any).testCaptures.length)).toBe(2);
    } finally { await context.close(); }
  });
}


test('F01 cleanup owns captured tracks while initial quality constraints are pending', async ({ page }) => {
  await syntheticCapture(page);
  await gotoRoom(page, '/room/f01-pending-constraints');
  await page.evaluate(() => { (window as any).testDelayConstraints = true; });
  await page.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
  await expect.poll(() => page.evaluate(() => Boolean((window as any).resolveConstraints))).toBe(true);
  await page.getByRole('button', { name: 'Sair da sala', exact: true }).click();
  await expect(page).toHaveURL('/');
  expect(await page.evaluate(() => (window as any).testCapture.getTracks().every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
  await page.evaluate(() => (window as any).resolveConstraints());
  await expect(page.getByRole('dialog')).toHaveCount(0);
});


for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }, { width: 320, height: 640 }]) {
  test(`Preview quality selection, privacy and settings synchronization ${viewport.width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport, hasTouch: viewport.width < 500 });
    const host = await context.newPage(), viewer = await context.newPage();
    try {
      await syntheticCapture(host); await syntheticCapture(viewer);
      await Promise.all([gotoRoom(host, `/room/preview-quality-${viewport.width}`), gotoRoom(viewer, `/room/preview-quality-${viewport.width}`)]);
      await expect(host.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
      await host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
      const dialog = host.getByRole('dialog');
      await expect(dialog).toContainText('Nitidez · Equilibrado · 30 FPS');
      await expect(dialog).toContainText('1080p · 3 Mbps');
      await expect(dialog).toContainText('Resolução desejada: 1920 × 1080');
      await expect(dialog).toContainText('Captura observada: 640 × 360');
      const details = dialog.locator('summary');
      await expect(details).toContainText('Detalhes da captura');
      await expect(dialog.locator('details')).not.toHaveAttribute('open', '');
      await expect(dialog.getByLabel('Nível de qualidade')).toHaveCount(0);
      const scrollArea = dialog.locator('video').locator('..');
      expect(await scrollArea.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
      const preview = await dialog.locator('video').boundingBox();
      expect(preview!.height).toBeGreaterThan(100);
      // Let the participant notification leave before capturing the full composition.
      await expect(host.getByText('Visitante entrou na sala.', { exact: true })).toBeHidden();
      await host.screenshot({ path: test.info().outputPath(`preview-default-${viewport.width}.png`), animations: 'disabled' });
      await details.focus();
      await host.keyboard.press('Enter');
      await expect(dialog.getByText('Captura observada: 640 × 360', { exact: true })).toBeVisible();
      await host.screenshot({ path: test.info().outputPath(`preview-details-${viewport.width}.png`), animations: 'disabled' });
      await host.keyboard.press('Enter');
      await dialog.getByRole('button', { name: 'Alterar qualidade', exact: true }).click();
      await expect(dialog.getByLabel('Nível de qualidade')).toBeVisible();
      await host.getByLabel('Nível de qualidade').selectOption('ultra');
      await expect(dialog).toContainText('Resolução desejada: 2560 × 1440');
      await host.getByRole('radio', { name: 'Nitidez', exact: true }).focus();
      await host.keyboard.press('ArrowRight');
      await expect(host.getByLabel('Limite de FPS')).toHaveValue('30');
      await host.getByLabel('Limite de FPS').selectOption('60');
      await expect(dialog).toContainText('Fluidez · Ultra · 60 FPS');
      await expect(dialog).toContainText('1080p · 8 Mbps');
      await expect(host.getByRole('button', { name: 'Entrar ao vivo', exact: true })).toBeEnabled();
      expect(await host.evaluate(() => (window as any).testCaptures.length)).toBe(1);
      expect(await host.evaluate(() => (window as any).testPeers.flatMap((pc: RTCPeerConnection) => pc.getSenders()).filter((sender: RTCRtpSender) => sender.track))).toHaveLength(0);
      await expect(viewer.locator('video')).toHaveCount(0);
      await host.getByLabel('Limite de FPS').focus();
      await host.keyboard.press('Tab');
      await expect(details).toBeFocused();
      await host.keyboard.press('Tab'); // Cancel follows the technical disclosure.
      await expect(host.getByRole('button', { name: 'Cancelar', exact: true })).toBeFocused();
      await host.keyboard.press('Tab');
      await expect(host.getByRole('button', { name: 'Entrar ao vivo', exact: true })).toBeFocused();
      const observed = dialog.getByText('Captura observada: 640 × 360', { exact: true });
      await details.click();
      await observed.scrollIntoViewIfNeeded();
      await expect(observed).toBeInViewport();
      const observedBox = await observed.boundingBox();
      const cancelBox = await host.getByRole('button', { name: 'Cancelar', exact: true }).boundingBox();
      expect(observedBox!.y + observedBox!.height).toBeLessThanOrEqual(cancelBox!.y);
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      const action = await host.getByRole('button', { name: 'Entrar ao vivo', exact: true }).boundingBox();
      expect(action!.height).toBeGreaterThanOrEqual(44);
      expect(action!.y + action!.height).toBeLessThanOrEqual(viewport.height);
      await details.click();
      await host.getByRole('button', { name: 'Entrar ao vivo', exact: true }).focus();
      await host.screenshot({ path: test.info().outputPath(`preview-${viewport.width}.png`), animations: 'disabled' });
      await test.info().attach('preview-quality', { path: test.info().outputPath(`preview-${viewport.width}.png`), contentType: 'image/png' });
      if (viewport.width < 500) await host.getByRole('button', { name: 'Entrar ao vivo', exact: true }).tap();
      else await host.keyboard.press('Enter');
      await frames(viewer);
      const trigger = host.locator('.floating-dock-bar').getByRole('button', { name: 'Configurações e convite', exact: true });
      await trigger.focus(); await host.keyboard.press('Enter');
      await host.getByRole('menuitem', { name: 'Configurações e diagnósticos', exact: true }).click();
      await expect(host.getByLabel('Nível de qualidade')).toHaveValue('ultra');
      await expect(host.getByLabel('Limite de FPS')).toHaveValue('60');
      await host.getByLabel('Nível de qualidade').selectOption('economy');
      await expect(host.getByLabel('Limite de FPS')).toHaveValue('30');
      await host.getByRole('button', { name: 'Fechar configurações' }).click();
      await host.getByRole('button', { name: 'Trocar tela', exact: true }).click();
      await expect(dialog).toContainText('Fluidez · Econômico · 30 FPS');
      await expect(dialog.getByLabel('Nível de qualidade')).toHaveCount(0);
      await host.getByRole('button', { name: 'Cancelar', exact: true }).click();
      await frames(viewer);
      expect(await host.evaluate(() => (window as any).testCaptures[0].getVideoTracks()[0].readyState)).toBe('live');
      expect(await host.evaluate(() => (window as any).testCaptures[1].getVideoTracks()[0].readyState)).toBe('ended');
    } finally { await context.close(); }
  });
}

test('Preview serializes rapid quality changes, blocks pending publication and reports partial failure', async ({ page }) => {
  await syntheticCapture(page);
  await gotoRoom(page, '/room/preview-quality-pending');
  await page.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toContainText('Captura observada:');
  await page.getByRole('button', { name: 'Alterar qualidade', exact: true }).click();
  await page.evaluate(() => { (window as any).testDelayConstraints = true; });
  await page.getByLabel('Nível de qualidade').selectOption('ultra');
  await expect.poll(() => page.evaluate(() => Boolean((window as any).resolveConstraints))).toBe(true);
  await expect(page.getByRole('button', { name: 'Entrar ao vivo', exact: true })).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Aplicando qualidade');
  await page.getByLabel('Nível de qualidade').selectOption('economy');
  await page.getByRole('radio', { name: 'Nitidez', exact: true }).focus(); await page.keyboard.press('ArrowRight');
  await page.getByLabel('Nível de qualidade').selectOption('ultra');
  await page.getByLabel('Limite de FPS').selectOption('60');
  await page.evaluate(() => (window as any).resolveConstraints());
  await expect(page.getByRole('button', { name: 'Entrar ao vivo', exact: true })).toBeEnabled();
  await expect(page.getByRole('dialog')).toContainText('Fluidez · Ultra · 60 FPS');
  expect(await page.evaluate(() => (window as any).testCapture.getVideoTracks()[0].contentHint)).toBe('motion');
  expect(await page.evaluate(() => (window as any).testCapture.getVideoTracks()[0].getConstraints().frameRate.max)).toBe(20); // Synthetic canvas capability remains 20 FPS.
  expect(await page.evaluate(() => (window as any).testCaptures.length)).toBe(1);
  await page.evaluate(() => { (window as any).testRejectConstraints = true; });
  await page.getByLabel('Nível de qualidade').selectOption('economy');
  await expect(page.getByRole('dialog')).toContainText('O navegador não aplicou todos os limites');
  await expect(page.getByRole('button', { name: 'Entrar ao vivo', exact: true })).toBeEnabled();
  await page.evaluate(() => { (window as any).testDelayConstraints = true; (window as any).resolveConstraints = null; });
  await page.getByLabel('Nível de qualidade').selectOption('ultra');
  await expect.poll(() => page.evaluate(() => Boolean((window as any).resolveConstraints))).toBe(true);
  await expect(page.getByRole('button', { name: 'Entrar ao vivo', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  expect(await page.evaluate(() => (window as any).testCapture.getTracks().every((track: MediaStreamTrack) => track.readyState === 'ended'))).toBe(true);
  await page.evaluate(() => { (window as any).testRejectConstraints = false; });
  await page.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
  await expect(page.getByRole('dialog')).toContainText('Fluidez · Ultra · 30 FPS');
  await expect(page.getByRole('button', { name: 'Entrar ao vivo', exact: true })).toBeEnabled();
  await page.evaluate(() => (window as any).resolveConstraints());
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('O navegador não aplicou todos os limites', { exact: false })).toHaveCount(0);
});

test('Preview modal maintains visual stability and zero tremor during async quality transitions', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280; canvas.height = 720;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#ff0000'; ctx.fillRect(0, 0, 1280, 720);
        const stream = canvas.captureStream(30);
        const track = stream.getVideoTracks()[0];
        const origApply = track.applyConstraints.bind(track);
        track.applyConstraints = async (c) => {
          await new Promise((r) => setTimeout(r, 250));
          return origApply(c);
        };
        return stream;
      },
    });
  });

  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoRoom(page, '/room/preview-tremor-regression');
  await page.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Nitidez · Equilibrado · 30 FPS');

  const getMetrics = async () => {
    const dialogBox = await dialog.boundingBox();
    const videoBox = await dialog.locator('video').boundingBox();
    return { dialogBox, videoBox };
  };

  const initial = await getMetrics();

  // Expand controls
  await dialog.getByRole('button', { name: 'Alterar qualidade', exact: true }).click();
  await expect(dialog.getByLabel('Nível de qualidade')).toBeVisible();

  const expanded = await getMetrics();
  // Anchored top: modal top y and video top y must stay completely stable
  expect(expanded.dialogBox!.y).toBeCloseTo(initial.dialogBox!.y, 0.1);
  expect(expanded.videoBox!.y).toBeCloseTo(initial.videoBox!.y, 0.1);

  // Toggle Fluidez with async constraints
  await page.getByText('Fluidez', { exact: true }).click();
  await page.waitForTimeout(60);
  await expect(page.getByRole('status')).toContainText('Aplicando qualidade');
  const duringPending = await getMetrics();
  expect(duringPending.dialogBox!.y).toBeCloseTo(expanded.dialogBox!.y, 0.1);
  expect(duringPending.videoBox!.y).toBeCloseTo(expanded.videoBox!.y, 0.1);

  await expect(page.getByRole('status')).not.toContainText('Aplicando qualidade');
  const afterFluidez = await getMetrics();
  expect(afterFluidez.dialogBox!.y).toBeCloseTo(expanded.dialogBox!.y, 0.1);
  expect(afterFluidez.videoBox!.y).toBeCloseTo(expanded.videoBox!.y, 0.1);
  await expect(dialog).toContainText('Fluidez · Equilibrado · 30 FPS');

  // Toggle Nitidez back
  await page.getByText('Nitidez', { exact: true }).click();
  await page.waitForTimeout(60);
  const duringPendingBack = await getMetrics();
  expect(duringPendingBack.dialogBox!.y).toBeCloseTo(expanded.dialogBox!.y, 0.1);
  expect(duringPendingBack.videoBox!.y).toBeCloseTo(expanded.videoBox!.y, 0.1);

  await expect(page.getByRole('status')).not.toContainText('Aplicando qualidade');
  const afterNitidez = await getMetrics();
  expect(afterNitidez.dialogBox!.y).toBeCloseTo(expanded.dialogBox!.y, 0.1);
  expect(afterNitidez.videoBox!.y).toBeCloseTo(expanded.videoBox!.y, 0.1);

  // Collapse controls
  await dialog.getByRole('button', { name: 'Ocultar qualidade', exact: true }).click();
  await expect(dialog.getByLabel('Nível de qualidade')).toHaveCount(0);
  const collapsedAgain = await getMetrics();
  expect(collapsedAgain.dialogBox!.y).toBeCloseTo(initial.dialogBox!.y, 0.1);
  expect(collapsedAgain.videoBox!.y).toBeCloseTo(initial.videoBox!.y, 0.1);
});

async function annotationPixels(page: Page) {
  return page.getByTestId('annotation-overlay').evaluate((el: HTMLCanvasElement) => {
    const { data } = el.getContext('2d')!.getImageData(0, 0, el.width, el.height);
    let count = 0, minX = el.width, maxX = 0, minY = el.height, maxY = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i]) {
      count++; const x = (i >> 2) % el.width, y = Math.floor((i >> 2) / el.width);
      minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return { count, x: (minX + maxX) / (2 * el.width), y: (minY + maxY) / (2 * el.height) };
  });
}
async function openAnnotations(page: Page) {
  if (!await page.getByRole('menu').isVisible()) await page.getByRole('button', { name: 'Anotações', exact: true }).click();
}
async function drawAnnotation(page: Page) {
  if (await page.getByRole('menu').isVisible()) await page.keyboard.press('Escape');
  const tool = page.getByRole('button', { name: 'Desenhar', exact: true });
  if (await tool.getAttribute('aria-pressed') !== 'true') await tool.click();
  const b = (await page.getByTestId('zoom-viewport').boundingBox())!;
  await page.mouse.move(b.x + b.width * .45, b.y + b.height * .5); await page.mouse.down();
  await page.mouse.move(b.x + b.width * .55, b.y + b.height * .55, { steps: 5 });
  await page.waitForTimeout(70); await page.mouse.up();
}

test('F13 laser, geometry, immediate drawing, expiry, clear, late join and reconnect without history', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  try {
    const host = await contexts[0].newPage(), viewer = await contexts[1].newPage(), late = await contexts[2].newPage();
    const errors: string[] = [];
    for (const p of [host, viewer, late]) { await syntheticCapture(p); p.on('pageerror', e => errors.push(e.message)); }
    await Promise.all([gotoRoom(host, '/room/f13-live'), gotoRoom(viewer, '/room/f13-live')]);
    await startLive(host); await frames(viewer);
    await expect(host.getByRole('button', { name: 'Ponteiro laser', exact: true })).toBeEnabled();
    await expect(viewer.getByRole('button', { name: 'Ponteiro laser', exact: true })).toHaveCount(0);
    await host.getByRole('button', { name: 'Ponteiro laser', exact: true }).click();
    const box = (await host.getByTestId('zoom-viewport').boundingBox())!;
    await host.mouse.move(box.x + box.width * .5, box.y + box.height * .5);
    await expect.poll(async () => (await annotationPixels(host)).count).toBeGreaterThan(0);
    await expect.poll(async () => (await annotationPixels(viewer)).count).toBeGreaterThan(0);
    expect((await annotationPixels(viewer)).x).toBeCloseTo(.5, 1);
    await expect.poll(async () => (await annotationPixels(viewer)).count).toBe(0);
    await host.getByRole('button', { name: 'Ponteiro laser', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Navegar', exact: true })).toHaveAttribute('aria-pressed', 'true');
    // Drawing input in letterbox space must not create a stroke.
    await host.getByRole('button', { name: 'Desenhar', exact: true }).click();
    const bar = await host.getByTestId('zoom-viewport').evaluate(el => {
      const b = el.getBoundingClientRect(), v = el.querySelector('video')!;
      const ratio = Math.min(b.width / v.videoWidth, b.height / v.videoHeight);
      const fw = v.videoWidth * ratio, fh = v.videoHeight * ratio;
      return b.width - fw > 8 ? { x: b.x + (b.width - fw) / 4, y: b.y + b.height * .6 }
        : { x: b.x + b.width * .6, y: b.y + (b.height - fh) / 4 };
    });
    await host.mouse.click(bar.x, bar.y);
    expect((await annotationPixels(host)).count).toBe(0);
    // Zoom and pan stay local, content coordinates sent by the host remain normalized.
    await viewer.getByRole('button', { name: 'Ampliar zoom' }).click();
    const gestureBox = (await host.getByTestId('zoom-viewport').boundingBox())!;
    await host.mouse.move(gestureBox.x + gestureBox.width * .45, gestureBox.y + gestureBox.height * .5);
    await host.mouse.down();
    await host.mouse.move(gestureBox.x + gestureBox.width * .55, gestureBox.y + gestureBox.height * .55, { steps: 5 });
    await expect.poll(async () => (await annotationPixels(host)).count).toBeGreaterThan(0);
    await expect.poll(async () => (await annotationPixels(viewer)).count).toBeGreaterThan(0);
    expect(await viewer.getByTestId('annotation-overlay').evaluate(el => el.parentElement === document.querySelector('[data-testid="zoom-viewport"] video')?.parentElement)).toBe(true);
    await gotoRoom(late, '/room/f13-live'); await frames(late);
    expect((await annotationPixels(late)).count).toBe(0);
    await host.mouse.move(gestureBox.x + gestureBox.width * .6, gestureBox.y + gestureBox.height * .55, { steps: 3 });
    await host.mouse.up();
    expect((await annotationPixels(late)).count).toBe(0);
    await viewer.evaluate(() => { for (const ws of (window as any).testSockets) if (ws.readyState === 1) ws.close(4100, 'test reconnect'); });
    await expect.poll(() => viewer.evaluate(() => (window as any).testSockets.filter((s: WebSocket) => s.readyState === 1).length)).toBe(1);
    await frames(viewer); expect((await annotationPixels(viewer)).count).toBe(0);
    await expect.poll(async () => (await annotationPixels(host)).count, { timeout: 10000 }).toBe(0);
    await drawAnnotation(host);
    await expect.poll(async () => (await annotationPixels(late)).count).toBeGreaterThan(0);
    await openAnnotations(host);
    await host.getByRole('menuitem', { name: 'Limpar minhas anotações' }).click();
    for (const p of [host, viewer, late]) await expect.poll(async () => (await annotationPixels(p)).count).toBe(0);
    // Overlay never replaces or adds tracks to the original capture.
    expect(await host.evaluate(() => {
      const video = document.querySelector('[data-testid="zoom-viewport"] video') as HTMLVideoElement;
      return video.srcObject === (window as any).testCapture && (video.srcObject as MediaStream).getVideoTracks().length === 1;
    })).toBe(true);
    expect(errors).toEqual([]);
  } finally { await Promise.all(contexts.map(c => c.close())); }
});

test('F13 independent presenters, pause/resume, cancelled and confirmed replacement, fullscreen and Cinema', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const host = await contexts[0].newPage(), viewer = await contexts[1].newPage();
    for (const p of [host, viewer]) await syntheticCapture(p);
    await Promise.all([gotoRoom(host, '/room/f13-captures'), gotoRoom(viewer, '/room/f13-captures')]);
    await startLive(host); await frames(viewer); await drawAnnotation(host);
    await expect.poll(async () => (await annotationPixels(viewer)).count).toBeGreaterThan(0);
    const captureId = () => viewer.evaluate(() => (window as any).testMessages.filter((m: any) => m.type === 'sharing-updated').at(-1)?.streamId);
    const originalId = await captureId();
    await host.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Desenhar', exact: true })).toBeDisabled();
    await host.getByRole('button', { name: 'Retomar transmissão', exact: true }).click();
    await frames(viewer); expect(await captureId()).toBe(originalId);
    await host.getByRole('button', { name: 'Trocar tela', exact: true }).click();
    await host.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await frames(viewer); expect(await captureId()).toBe(originalId);
    await host.getByRole('button', { name: 'Trocar tela', exact: true }).click();
    await host.getByRole('button', { name: 'Confirmar troca', exact: true }).click();
    await expect.poll(captureId).not.toBe(originalId); await frames(viewer);
    await expect.poll(async () => (await annotationPixels(viewer)).count).toBe(0);
    await startLive(viewer);
    await viewer.getByRole('button', { name: /^Destacar transmissão/ }).click();
    await drawAnnotation(viewer);
    await viewer.getByRole('button', { name: /^Destacar transmissão/ }).click();
    expect((await annotationPixels(viewer)).count).toBe(0);
    await openAnnotations(host);
    await host.getByRole('menuitem', { name: 'Limpar minhas anotações' }).click();
    await viewer.getByRole('button', { name: /^Destacar transmissão/ }).click();
    await expect.poll(async () => (await annotationPixels(viewer)).count).toBeGreaterThan(0);
    await viewer.getByRole('button', { name: 'Tela cheia', exact: true }).click();
    await expect.poll(() => viewer.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await expect.poll(async () => (await annotationPixels(viewer)).count).toBeGreaterThan(0);
    await viewer.getByRole('button', { name: 'Sair da tela cheia' }).click();
    await viewer.getByRole('button', { name: 'Modo Cinema', exact: true }).click();
    await expect.poll(async () => (await annotationPixels(viewer)).count).toBeGreaterThan(0);
    await viewer.screenshot({ path: test.info().outputPath('f13-desktop-cinema.png') });
  } finally { await Promise.all(contexts.map(c => c.close())); }
});

test('F13 mobile tools, keyboard and touch cancellation do not pan or zoom', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  try {
    const page = await context.newPage(); await syntheticCapture(page); await gotoRoom(page, '/room/f13-touch'); await startLive(page);
    const draw = page.getByRole('button', { name: 'Desenhar', exact: true });
    await draw.focus(); await page.keyboard.press('Enter'); await expect(draw).toHaveAttribute('aria-pressed', 'true');
    const viewport = page.getByTestId('zoom-viewport'), b = (await viewport.boundingBox())!;
    expect(await draw.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    const cdp = await context.newCDPSession(page);
    const p = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [p] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: p.x + 30, y: p.y + 20 }] });
    await expect.poll(async () => (await annotationPixels(page)).count).toBeGreaterThan(0);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
    await expect.poll(async () => (await annotationPixels(page)).count).toBe(0);
    await expect(page.getByRole('group', { name: 'Zoom da transmissão' })).toContainText('100%');
    await viewport.focus(); await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: 'Navegar', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.screenshot({ path: test.info().outputPath('f13-mobile.png') });
    await cdp.detach();
  } finally { await context.close(); }
});

test('F13 spectator quick pointing: presenter and spectator visibility, identity badge, auto-return to navigate, zoom/pan/letterbox, multi-presenter and F13 isolation', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  try {
    const hostA = await contexts[0].newPage();
    const viewer = await contexts[1].newPage();
    const hostB = await contexts[2].newPage();
    for (const [p, nick] of [
      [hostA, 'Firminha'],
      [viewer, 'Marina'],
      [hostB, 'Lucas'],
    ] as const) {
      await syntheticCapture(p);
      await p.addInitScript((name) => sessionStorage.setItem('screen_room_display_name', name), nick);
    }

    await Promise.all([
      gotoRoom(hostA, '/room/f13-spectator-pointing'),
      gotoRoom(viewer, '/room/f13-spectator-pointing'),
      gotoRoom(hostB, '/room/f13-spectator-pointing'),
    ]);

    await startLive(hostA);
    await frames(viewer);
    await frames(hostB);

    // Spectator sees "Apontar" and does not see presenter tools; presenter sees permission toggle
    const viewerPointBtn = viewer.getByRole('button', { name: 'Apontar', exact: true });
    await expect(viewerPointBtn).toBeVisible();
    await expect(viewerPointBtn).toBeEnabled();
    await expect(viewerPointBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(viewer.getByRole('button', { name: 'Ponteiro laser', exact: true })).toHaveCount(0);
    await openAnnotations(hostA);
    await expect(hostA.getByRole('menuitemcheckbox', { name: 'Permitir apontamentos', exact: true })).toHaveAttribute('aria-checked', 'true');

    // Escape cancels pointing before sending
    await viewerPointBtn.click();
    await expect(viewerPointBtn).toHaveAttribute('aria-pressed', 'true');
    await viewer.keyboard.press('Escape');
    await expect(viewerPointBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(hostA.getByTestId('spectator-pointer-marker')).toHaveCount(0);

    // Letterbox clicks must not fire pointing or exit point mode prematurely
    await viewerPointBtn.click();
    await expect(viewerPointBtn).toHaveAttribute('aria-pressed', 'true');
    const letterboxPos = await viewer.getByTestId('zoom-viewport').evaluate((el) => {
      const b = el.getBoundingClientRect();
      const v = el.querySelector('video')!;
      const ratio = Math.min(b.width / v.videoWidth, b.height / v.videoHeight);
      const fw = v.videoWidth * ratio;
      const fh = v.videoHeight * ratio;
      return b.width - fw > 8
        ? { x: b.x + (b.width - fw) / 4, y: b.y + b.height * 0.5 }
        : { x: b.x + b.width * 0.5, y: b.y + (b.height - fh) / 4 };
    });
    await viewer.mouse.click(letterboxPos.x, letterboxPos.y);
    await expect(viewerPointBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(hostA.getByTestId('spectator-pointer-marker')).toHaveCount(0);

    // Independent zoom on hostA and viewer; viewer clicks video content to point
    await hostA.getByRole('button', { name: 'Ampliar zoom', exact: true }).click();
    await viewer.getByRole('button', { name: 'Ampliar zoom', exact: true }).click();
    const vbox = (await viewer.getByTestId('zoom-viewport').boundingBox())!;
    await viewer.mouse.click(vbox.x + vbox.width * 0.5, vbox.y + vbox.height * 0.5);

    // Auto-returns to navigate mode immediately after pointing
    await expect(viewerPointBtn).toHaveAttribute('aria-pressed', 'false');

    // Marker and participant identification appear on viewer, presenter (hostA), and other participant (hostB)
    await expect(viewer.getByTestId('spectator-pointer-marker')).toContainText('Marina (você)');
    await expect(hostA.getByTestId('spectator-pointer-marker')).toContainText('Marina');
    await expect(hostB.getByTestId('spectator-pointer-marker')).toContainText('Marina');
    await expect.poll(async () => (await annotationPixels(hostA)).count).toBeGreaterThan(0);
    await viewer.screenshot({ path: test.info().outputPath('f13-pointing-viewer-desktop.png') });
    await hostA.screenshot({ path: test.info().outputPath('f13-pointing-presenter-desktop.png') });

    // Presenter (hostB) sharing their own screen can also watch hostA and point on hostA's stream
    await startLive(hostB);
    await frames(hostB);
    const hostBPointBtn = hostB.getByRole('button', { name: 'Apontar', exact: true });
    await expect(hostBPointBtn).toBeEnabled();
    await hostBPointBtn.click();
    const hbox = (await hostB.getByTestId('zoom-viewport').boundingBox())!;
    await hostB.mouse.click(hbox.x + hbox.width * 0.4, hbox.y + hbox.height * 0.4);
    await expect(hostBPointBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(hostA.getByTestId('spectator-pointer-marker').filter({ hasText: 'Lucas' })).toBeVisible();

    // Markers expire automatically without leaving history
    await expect(hostA.getByTestId('spectator-pointer-marker')).toHaveCount(0, { timeout: 6000 });
    await expect(viewer.getByTestId('spectator-pointer-marker')).toHaveCount(0);

    // Presenter F13 drawing still works after spectator pointing
    await drawAnnotation(hostA);
    await expect.poll(async () => (await annotationPixels(viewer)).count).toBeGreaterThan(0);
    await openAnnotations(hostA);
    await hostA.getByRole('menuitem', { name: 'Limpar minhas anotações', exact: true }).click();
    await expect.poll(async () => (await annotationPixels(viewer)).count).toBe(0);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test('F13 spectator pointing permissions: disable/enable, server block, pause/resume, switch cancel/confirm, late join and reconnect', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  try {
    const host = await contexts[0].newPage();
    const viewer = await contexts[1].newPage();
    const late = await contexts[2].newPage();
    for (const p of [host, viewer, late]) await syntheticCapture(p);

    await Promise.all([gotoRoom(host, '/room/f13-pointing-perms'), gotoRoom(viewer, '/room/f13-pointing-perms')]);
    await startLive(host);
    await frames(viewer);

    const permToggle = host.getByRole('menuitemcheckbox', { name: 'Permitir apontamentos', exact: true });
    const viewerPointBtn = viewer.getByRole('button', { name: 'Apontar', exact: true });
    await openAnnotations(host);
    await expect(permToggle).toHaveAttribute('aria-checked', 'true');
    await expect(viewerPointBtn).toBeEnabled();

    // Owner disables pointing -> reflected on viewer UI and enforced by server even on manual WebSocket send
    await openAnnotations(host);
    await permToggle.click();
    await openAnnotations(host);
    await expect(permToggle).toHaveAttribute('aria-checked', 'false');
    await expect(viewerPointBtn).toBeDisabled();

    // Manual spoofed point via socket while disabled is blocked by server
    await viewer.evaluate(() => {
      const ws = (window as any).testSockets.find((s: WebSocket) => s.readyState === 1);
      const msg = (window as any).testMessages.findLast((m: any) => m.type === 'sharing-updated');
      ws?.send(
        JSON.stringify({
          type: 'point',
          targetPeerId: msg.peerId,
          streamId: msg.streamId,
          eventId: crypto.randomUUID(),
          seq: 99,
          point: { x: 0.5, y: 0.5 },
        })
      );
    });
    await host.waitForTimeout(80);
    await expect(host.getByTestId('spectator-pointer-marker')).toHaveCount(0);

    // Late joiner receives disabled permission immediately
    await gotoRoom(late, '/room/f13-pointing-perms');
    await frames(late);
    await expect(late.getByRole('button', { name: 'Apontar', exact: true })).toBeDisabled();

    // Pause and resume preserve disabled permission
    await host.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
    await expect(viewer.getByText('Transmissão pausada', { exact: true }).first()).toBeVisible();
    await host.getByRole('button', { name: 'Retomar transmissão', exact: true }).click();
    await frames(viewer);
    await openAnnotations(host);
    await expect(permToggle).toHaveAttribute('aria-checked', 'false');
    await expect(viewerPointBtn).toBeDisabled();

    // Cancelled source switch preserves disabled permission
    await host.getByRole('button', { name: 'Trocar tela', exact: true }).click();
    await host.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await frames(viewer);
    await openAnnotations(host);
    await expect(permToggle).toHaveAttribute('aria-checked', 'false');
    await expect(viewerPointBtn).toBeDisabled();

    // Reconnect of presenter preserves disabled permission
    await host.evaluate(() => {
      const socket = (window as any).testSockets.find((s: WebSocket) => s.readyState === WebSocket.OPEN && s.url.includes('/signal')) as WebSocket;
      const onclose = socket.onclose!;
      socket.onclose = null;
      socket.onmessage = null;
      onclose.call(socket, new CloseEvent('close', { code: 1006 }));
    });
    await expect(host.getByText('Conectado', { exact: true })).toBeVisible({ timeout: 10000 });
    await frames(viewer);
    await openAnnotations(host);
    await expect(permToggle).toHaveAttribute('aria-checked', 'false');
    await expect(viewerPointBtn).toBeDisabled();

    // Owner re-enables pointing -> viewer can point again
    await openAnnotations(host);
    await permToggle.click();
    await openAnnotations(host);
    await expect(permToggle).toHaveAttribute('aria-checked', 'true');
    await expect(viewerPointBtn).toBeEnabled();

    // Owner disables again, then confirms a new capture switch -> new streamId resets to enabled by default
    await openAnnotations(host);
    await permToggle.click();
    await expect(viewerPointBtn).toBeDisabled();
    await host.getByRole('button', { name: 'Trocar tela', exact: true }).click();
    await host.getByRole('button', { name: 'Confirmar troca', exact: true }).click();
    await frames(viewer);
    await openAnnotations(host);
    await expect(permToggle).toHaveAttribute('aria-checked', 'true');
    await expect(viewerPointBtn).toBeEnabled();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test('F13 spectator pointing: keyboard navigation, Cinema, Fullscreen and mobile touch', async ({ browser }) => {
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const mobileContext = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  try {
    const host = await hostContext.newPage();
    const mobileViewer = await mobileContext.newPage();
    await syntheticCapture(host);
    await syntheticCapture(mobileViewer);
    await mobileViewer.addInitScript(() => sessionStorage.setItem('screen_room_display_name', 'Clara'));

    await Promise.all([gotoRoom(host, '/room/f13-pointing-modes'), gotoRoom(mobileViewer, '/room/f13-pointing-modes')]);
    await startLive(host);
    await frames(mobileViewer);

    const pointBtn = mobileViewer.getByRole('button', { name: 'Apontar', exact: true });
    expect((await pointBtn.boundingBox())!.height).toBeGreaterThanOrEqual(44);

    // Keyboard positioning and submission in Cinema mode
    await mobileViewer.getByRole('button', { name: 'Modo Cinema', exact: true }).click();
    await pointBtn.focus();
    await mobileViewer.keyboard.press('Enter');
    await expect(pointBtn).toHaveAttribute('aria-pressed', 'true');
    await expect(mobileViewer.getByTestId('pointing-reticle')).toBeVisible();
    await mobileViewer.keyboard.press('ArrowRight');
    await mobileViewer.keyboard.press('ArrowUp');
    await mobileViewer.keyboard.press('Enter');
    await expect(pointBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(host.getByTestId('spectator-pointer-marker')).toContainText('Clara');
    await mobileViewer.screenshot({ path: test.info().outputPath('f13-pointing-mobile-cinema.png') });

    // Wait for expiry, then test touch pointing in Fullscreen mode
    await expect(host.getByTestId('spectator-pointer-marker')).toHaveCount(0, { timeout: 6000 });
    await mobileViewer.getByRole('button', { name: 'Tela cheia', exact: true }).click();
    await expect.poll(() => mobileViewer.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await pointBtn.tap();
    await expect(pointBtn).toHaveAttribute('aria-pressed', 'true');
    const b = (await mobileViewer.getByTestId('zoom-viewport').boundingBox())!;
    const cdp = await mobileContext.newCDPSession(mobileViewer);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: b.x + b.width * 0.5, y: b.y + b.height * 0.5 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect(pointBtn).toHaveAttribute('aria-pressed', 'false');
    await expect(host.getByTestId('spectator-pointer-marker')).toContainText('Clara');
    await cdp.detach();
  } finally {
    await Promise.all([hostContext.close(), mobileContext.close()]);
  }
});

test('F13 collaborative drawing permissions: disabled by default, presenter enables, spectator draws with author badge, presenter clears spectator drawings independently, expiry without renewal, late joiner and reconnect without history', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  try {
    const host = await contexts[0].newPage();
    const viewer = await contexts[1].newPage();
    const late = await contexts[2].newPage();
    for (const p of [host, viewer, late]) await syntheticCapture(p);

    await viewer.addInitScript(() => sessionStorage.setItem('screen_room_display_name', 'Mariana'));

    await Promise.all([gotoRoom(host, '/room/f13-drawing-perms'), gotoRoom(viewer, '/room/f13-drawing-perms')]);
    await startLive(host);
    await frames(viewer);

    const permToggle = host.getByRole('menuitemcheckbox', { name: 'Permitir desenhos', exact: true });
    const viewerDrawBtn = viewer.getByRole('button', { name: 'Desenhar', exact: true });
    const hostClearSpectatorsBtn = host.getByRole('menuitem', { name: 'Limpar desenhos dos espectadores', exact: true });
    const hostClearOwnBtn = host.getByRole('menuitem', { name: 'Limpar minhas anotações', exact: true });

    // 1. Initially disabled by default on new capture
    await openAnnotations(host);
    await expect(permToggle).toHaveAttribute('aria-checked', 'false');
    await expect(viewerDrawBtn).toBeDisabled();

    // 2. Presenter explicitly enables collaborative drawing
    await openAnnotations(host);
    await permToggle.click();
    await openAnnotations(host);
    await expect(permToggle).toHaveAttribute('aria-checked', 'true');
    await expect(viewerDrawBtn).toBeEnabled();

    // 3. Spectator draws; pixels appear and discrete author badge is displayed
    await drawAnnotation(viewer);
    await expect.poll(async () => (await annotationPixels(host)).count).toBeGreaterThan(0);
    await expect.poll(async () => (await annotationPixels(viewer)).count).toBeGreaterThan(0);
    await expect(host.getByTestId('collaborative-author-badge')).toBeVisible();
    await expect(host.getByTestId('collaborative-author-badge')).toContainText('Mariana');
    await expect(viewer.getByTestId('collaborative-author-badge')).toContainText('Mariana (você)');

    // 4. Presenter draws own annotation and clears spectator drawings independently
    await drawAnnotation(host);
    await openAnnotations(host);
    await hostClearSpectatorsBtn.click();
    // Collaborative author badge is removed immediately
    await expect(host.getByTestId('collaborative-author-badge')).toHaveCount(0);
    await expect(viewer.getByTestId('collaborative-author-badge')).toHaveCount(0);
    // Presenter's own drawing remains visible
    await expect.poll(async () => (await annotationPixels(viewer)).count).toBeGreaterThan(0);
    // Presenter clears own annotations
    await openAnnotations(host);
    await hostClearOwnBtn.click();
    await expect.poll(async () => (await annotationPixels(viewer)).count).toBe(0);

    // 5. Expiration without renewal: spectator draws and strokes disappear after TTL
    await drawAnnotation(viewer);
    await expect(host.getByTestId('collaborative-author-badge')).toBeVisible();
    await expect.poll(async () => (await annotationPixels(host)).count, { timeout: 12000 }).toBe(0);
    await expect(host.getByTestId('collaborative-author-badge')).toHaveCount(0);

    // 6. Late joiner receives current active permission, but no expired or previous drawing history
    await gotoRoom(late, '/room/f13-drawing-perms');
    await frames(late);
    await expect(late.getByRole('button', { name: 'Desenhar', exact: true })).toBeEnabled();
    expect((await annotationPixels(late)).count).toBe(0);
    await expect(late.getByTestId('collaborative-author-badge')).toHaveCount(0);

    // 7. Viewer reconnects: retains permission to draw on the active capture, without history
    const priorJoins = await viewer.evaluate(() =>
      ((window as any).testMessages || []).filter((m: any) => m.type === 'peers').length);
    await viewer.evaluate(() => {
      for (const ws of (window as any).testSockets as WebSocket[]) {
        // Vite's HMR socket also lives here; closing it can reload the page.
        if (ws.readyState === WebSocket.OPEN && ws.url.includes('/signal')) ws.close(4100, 'test reconnect');
      }
    });
    await expect.poll(() => viewer.evaluate(before => ({
      sockets: ((window as any).testSockets as WebSocket[])
        .filter(s => s.url.includes('/signal') && s.readyState === WebSocket.OPEN).length,
      joinedAgain: ((window as any).testMessages || []).filter((m: any) => m.type === 'peers').length > before,
    }), priorJoins)).toEqual({ sockets: 1, joinedAgain: true });
    await frames(viewer);
    await expect(viewer.getByRole('button', { name: 'Desenhar', exact: true })).toBeEnabled();
    expect((await annotationPixels(viewer)).count).toBe(0);
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

test('F13 collaborative drawing: revocation, pause/resume, switch cancel/confirm and multi-spectator isolation', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  try {
    const host = await contexts[0].newPage();
    const viewerA = await contexts[1].newPage();
    const viewerB = await contexts[2].newPage();
    for (const p of [host, viewerA, viewerB]) await syntheticCapture(p);

    await viewerA.addInitScript(() => sessionStorage.setItem('screen_room_display_name', 'Alice'));
    await viewerB.addInitScript(() => sessionStorage.setItem('screen_room_display_name', 'Bob'));

    await Promise.all([
      gotoRoom(host, '/room/f13-drawing-lifecycle'),
      gotoRoom(viewerA, '/room/f13-drawing-lifecycle'),
      gotoRoom(viewerB, '/room/f13-drawing-lifecycle'),
    ]);
    await startLive(host);
    await frames(viewerA);
    await frames(viewerB);

    const permToggle = host.getByRole('menuitemcheckbox', { name: 'Permitir desenhos', exact: true });
    const drawBtnA = viewerA.getByRole('button', { name: 'Desenhar', exact: true });
    const drawBtnB = viewerB.getByRole('button', { name: 'Desenhar', exact: true });

    // Enable collaborative drawing
    await openAnnotations(host);
    await permToggle.click();
    await openAnnotations(host);
    await expect(permToggle).toHaveAttribute('aria-checked', 'true');
    await expect(drawBtnA).toBeEnabled();
    await expect(drawBtnB).toBeEnabled();

    // Multi-spectator drawing: Alice and Bob both draw
    await drawAnnotation(viewerA);
    await drawAnnotation(viewerB);
    await expect(host.getByTestId('collaborative-author-badge').filter({ hasText: 'Alice' })).toBeVisible();
    await expect(host.getByTestId('collaborative-author-badge').filter({ hasText: 'Bob' })).toBeVisible();

    // Revocation: Presenter disables drawing
    await openAnnotations(host);
    await permToggle.click();
    await openAnnotations(host);
    await expect(permToggle).toHaveAttribute('aria-checked', 'false');

    // Immediate removal of all collaborative drawings and badges on all clients
    await expect(host.getByTestId('collaborative-author-badge')).toHaveCount(0);
    await expect(viewerA.getByTestId('collaborative-author-badge')).toHaveCount(0);
    await expect(viewerB.getByTestId('collaborative-author-badge')).toHaveCount(0);
    await expect.poll(async () => (await annotationPixels(host)).count).toBe(0);
    await expect.poll(async () => (await annotationPixels(viewerA)).count).toBe(0);
    await expect(drawBtnA).toBeDisabled();
    await expect(drawBtnB).toBeDisabled();

    // Spoofed drawing attempt over WebSocket while revoked is rejected by server
    await viewerA.evaluate(() => {
      const ws = (window as any).testSockets.find((s: WebSocket) => s.readyState === 1);
      const msg = (window as any).testMessages.findLast((m: any) => m.type === 'sharing-updated');
      ws?.send(
        JSON.stringify({
          type: 'spectator-drawing',
          targetPeerId: msg.peerId,
          streamId: msg.streamId,
          eventId: crypto.randomUUID(),
          seq: 100,
          strokeId: crypto.randomUUID(),
          phase: 'start',
          index: 0,
          points: [{ x: 0.5, y: 0.5 }],
        })
      );
    });
    await host.waitForTimeout(80);
    await expect(host.getByTestId('collaborative-author-badge')).toHaveCount(0);
    expect((await annotationPixels(host)).count).toBe(0);

    // Re-enable and test Pause / Resume
    await openAnnotations(host);
    await permToggle.click();
    await expect(drawBtnA).toBeEnabled();

    await host.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
    await expect(viewerA.getByText('Transmissão pausada', { exact: true }).first()).toBeVisible();
    await expect(drawBtnA).toBeDisabled();

    await host.getByRole('button', { name: 'Retomar transmissão', exact: true }).click();
    await frames(viewerA);
    // Permission preserved on resume
    await openAnnotations(host);
    await expect(permToggle).toHaveAttribute('aria-checked', 'true');
    await expect(drawBtnA).toBeEnabled();

    // Cancelled switch preserves permission
    await host.getByRole('button', { name: 'Trocar tela', exact: true }).click();
    await host.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await frames(viewerA);
    await openAnnotations(host);
    await expect(permToggle).toHaveAttribute('aria-checked', 'true');
    await expect(drawBtnA).toBeEnabled();

    // Confirmed switch resets permission to disabled by default
    await host.getByRole('button', { name: 'Trocar tela', exact: true }).click();
    await host.getByRole('button', { name: 'Confirmar troca', exact: true }).click();
    await frames(viewerA);
    await openAnnotations(host);
    await expect(permToggle).toHaveAttribute('aria-checked', 'false');
    await expect(drawBtnA).toBeDisabled();
  } finally {
    await Promise.all(contexts.map((c) => c.close()));
  }
});

for (const width of [1280, 390, 320]) {
  test(`Annotations menu layout, permissions, keyboard and touch at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 844 }, hasTouch: width < 400 });
    try {
      const page = await context.newPage();
      await syntheticCapture(page); await gotoRoom(page, `/room/annotations-menu-${width}`); await startLive(page);
      const trigger = page.getByRole('button', { name: 'Anotações', exact: true });
      const menu = page.getByRole('menu');
      const pointing = page.getByRole('menuitemcheckbox', { name: 'Permitir apontamentos', exact: true });
      const drawing = page.getByRole('menuitemcheckbox', { name: 'Permitir desenhos', exact: true });
      const inspect = async (state: string) => {
        const bar = await page.locator('.stage-view-controls').boundingBox();
        expect(bar!.x).toBeGreaterThanOrEqual(0); expect(bar!.x + bar!.width).toBeLessThanOrEqual(width);
        const dock = await page.locator('.floating-dock-wrapper').boundingBox();
        if (!await page.evaluate(() => !!document.fullscreenElement) && dock && bar!.x < dock.x + dock.width && bar!.x + bar!.width > dock.x) expect(bar!.y + bar!.height).toBeLessThanOrEqual(dock.y);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (await menu.isVisible()) {
          const box = (await menu.boundingBox())!;
          expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
          expect(box.y).toBeGreaterThanOrEqual(0);
          expect(await drawing.evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
        }
        for (const bar of await page.locator('.stage-view-controls').all()) {
          const bounds = (await bar.boundingBox())!;
          for (const button of await bar.getByRole('button').all()) {
            const target = (await button.boundingBox())!;
            expect(target.x).toBeGreaterThanOrEqual(bounds.x);
            expect(target.x + target.width).toBeLessThanOrEqual(bounds.x + bounds.width);
          }
        }
        await page.screenshot({ path: test.info().outputPath(`${state}-${width}.png`), animations: 'disabled' });
      };
      await trigger.focus(); await page.keyboard.press('Enter');
      await expect(menu).toBeVisible();
      await expect(pointing).toHaveAttribute('aria-checked', 'true');
      await expect(drawing).toHaveAttribute('aria-checked', 'false');
      if (width < 400) await drawing.tap(); else {
        await pointing.focus(); await page.keyboard.press('ArrowDown'); await expect(drawing).toBeFocused();
        await page.keyboard.press('Space');
      }
      await expect(menu).toBeVisible(); await expect(drawing).toHaveAttribute('aria-checked', 'true');
      await expect(pointing).toHaveAttribute('aria-checked', 'true');
      await inspect('menu');
      await page.keyboard.press('Escape'); await expect(menu).toBeHidden(); await expect(trigger).toBeFocused();
      await inspect('toolbar');
      const viewerContext = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 844 }, hasTouch: width < 400 });
      try {
        const viewer = await viewerContext.newPage(); await syntheticCapture(viewer);
        await gotoRoom(viewer, `/room/annotations-menu-${width}`); await frames(viewer);
        for (const name of ['Apontar', 'Desenhar']) {
          const tool = viewer.getByRole('button', { name, exact: true });
          await expect(tool).toBeEnabled();
          expect((await tool.boundingBox())!.height).toBeGreaterThanOrEqual(width < 400 ? 44 : 36);
          if (width < 400) await tool.tap(); else await tool.click();
          await expect(tool).toHaveAttribute('aria-pressed', 'true');
          await expect(viewer.getByTestId('zoom-viewport')).toBeFocused();
          await viewer.keyboard.press('Escape'); await expect(tool).toHaveAttribute('aria-pressed', 'false');
        }
        const bar = (await viewer.locator('.stage-view-controls').boundingBox())!;
        const dock = (await viewer.locator('.floating-dock-wrapper').boundingBox())!;
        expect(bar.x).toBeGreaterThanOrEqual(0); expect(bar.x + bar.width).toBeLessThanOrEqual(width);
        if (bar.x < dock.x + dock.width + 12 && bar.x + bar.width > dock.x - 12) expect(bar.y + bar.height).toBeLessThanOrEqual(dock.y);
        await expect(viewer.getByRole('button', { name: 'Anotações', exact: true })).toHaveCount(0);
        await viewer.screenshot({ path: test.info().outputPath(`viewer-${width}.png`), animations: 'disabled' });
      } finally { await viewerContext.close(); }
      await page.getByRole('button', { name: 'Modo Cinema', exact: true }).click();
      await openAnnotations(page); await inspect('cinema-menu'); await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Tela cheia', exact: true }).click();
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
      await expect(page.getByRole('button', { name: 'Sair da tela cheia', exact: true })).toBeVisible();
      await openAnnotations(page); await expect(menu).toBeVisible(); await inspect('fullscreen-menu');
      expect(await menu.evaluate(el => document.fullscreenElement?.contains(el))).toBe(true);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Sair da tela cheia' }).click();
      await page.getByRole('button', { name: 'Sair do Modo Cinema', exact: true }).click();
      await page.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
      await expect(page.getByRole('button', { name: 'Desenhar', exact: true })).toBeDisabled();
      await openAnnotations(page); await inspect('paused-menu');
    } finally { await context.close(); }
  });
}

for (const width of [1280, 390]) {
  test(`F18 connectivity and remote presentation diagnostics ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width === 390 });
    const host = await context.newPage(), viewer = await context.newPage();
    const hostEvents: string[] = [], viewerEvents: string[] = [];
    host.on('console', message => hostEvents.push(message.text()));
    viewer.on('console', message => viewerEvents.push(message.text()));
    try {
      await syntheticCapture(host); await syntheticCapture(viewer);
      await gotoRoom(host, `/room/e2e-f18-${width}`);
      await gotoRoom(viewer, `/room/e2e-f18-${width}`);
      await expect(host.getByText('2', { exact: true }).first()).toBeVisible();
      const openNetwork = async () => {
        const trigger = viewer.locator('.floating-dock-bar').getByRole('button', { name: 'Configurações e convite', exact: true });
        await trigger.focus(); await viewer.keyboard.press('Enter');
        await viewer.getByRole('menuitem', { name: 'Configurações e diagnósticos', exact: true }).click();
        const tab = viewer.getByRole('tab', { name: /Rede/ });
        if (width === 390) await tab.tap(); else await tab.click();
      };
      await openNetwork();
      const dialog = viewer.getByRole('dialog');
      await expect(dialog).toContainText('WebSocket: connected');
      await expect(dialog.getByText('0', { exact: true })).toBeVisible();
      await viewer.keyboard.press('Escape');
      await startLive(host); await frames(viewer);
      await expect.poll(() => viewerEvents.some(event => event.includes(' first-frame-presented '))).toBe(true);
      await expect.poll(() => viewerEvents.some(event => event.includes(' first-frame ') && event.includes('evidence=decoded'))).toBe(true);
      expect(hostEvents.some(event => event.includes(' first-frame-presented '))).toBe(false);
      await openNetwork();
      await expect(dialog).toContainText('WebRTC: connected');
      await expect(dialog).toContainText('Frames decodificados:');
      await expect(dialog).toContainText('Bytes recebidos');
      await dialog.screenshot({ path: `/tmp/f18-network-${width}.png` });
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await viewer.keyboard.press('Escape');
      await host.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
      await expect(viewer.locator('video')).toHaveCount(0);
    } finally { await context.close(); }
  });
}

test('F18 missing presentation API keeps playback and decoded evidence available', async ({ browser }) => {
  const context = await browser.newContext();
  const host = await context.newPage(), viewer = await context.newPage();
  const events: string[] = [];
  viewer.on('console', message => events.push(message.text()));
  try {
    await syntheticCapture(host); await syntheticCapture(viewer);
    await viewer.addInitScript(() => {
      Object.defineProperty(HTMLVideoElement.prototype, 'requestVideoFrameCallback', { value: undefined, configurable: true });
    });
    await Promise.all([gotoRoom(host, '/room/e2e-f18-no-callback'), gotoRoom(viewer, '/room/e2e-f18-no-callback')]);
    await expect(host.getByText('2', { exact: true }).first()).toBeVisible();
    await startLive(host);
    await expect.poll(() => viewer.evaluate(() => {
      const video = document.querySelector('video');
      return !!video && !video.paused && video.videoWidth > 0;
    })).toBe(true);
    await expect.poll(() => events.some(event => event.includes(' first-frame ') && event.includes('evidence=decoded'))).toBe(true);
    expect(events.some(event => event.includes(' first-frame-presented '))).toBe(false);
  } finally { await context.close(); }
});

test('F30 privacy notice appears in capture preview without blocking confirmation', async ({ browser }) => {
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await syntheticCapture(page);
    await gotoRoom(page, '/room/e2e-f30-notice');
    await page.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();

    // Verify privacy notice is clearly present
    const notice = page.getByText('Participantes da sala podem salvar imagens da tela compartilhada.', { exact: true });
    await expect(notice).toBeVisible();

    // Verify it doesn't block confirmation
    const confirmBtn = page.getByRole('button', { name: 'Entrar ao vivo', exact: true });
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // Verify live state
    await expect(page.getByText(/Transmitindo/)).toBeVisible();
    await page.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
  } finally {
    await context.close();
  }
});

test('F30 screenshot captures unzoomed frame in PNG, disables on pause, and works in cinema mode', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const viewerContext = await browser.newContext();
  try {
    const host = await hostContext.newPage();
    const viewer = await viewerContext.newPage();
    await syntheticCapture(host);
    await syntheticCapture(viewer);

    await Promise.all([
      gotoRoom(host, '/room/e2e-f30-capture'),
      gotoRoom(viewer, '/room/e2e-f30-capture'),
    ]);
    await expect(host.getByText('2', { exact: true }).first()).toBeVisible();

    // Start sharing
    await startLive(host);
    await frames(viewer);

    // 1. Viewer saves screenshot
    const viewerBtn = viewer.getByRole('button', { name: 'Salvar imagem', exact: true });
    await expect(viewerBtn).toBeEnabled();

    const viewerDownloadPromise = viewer.waitForEvent('download');
    await viewerBtn.click();
    const viewerDownload = await viewerDownloadPromise;
    expect(viewerDownload.suggestedFilename()).toMatch(/^screen-room-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.png$/);

    const viewerFilePath = test.info().outputPath('viewer-screenshot.png');
    await viewerDownload.saveAs(viewerFilePath);
    const viewerBuffer = fs.readFileSync(viewerFilePath);

    // Validate PNG signature: 89 50 4E 47 0D 0A 1A 0A
    expect(viewerBuffer[0]).toBe(0x89);
    expect(viewerBuffer[1]).toBe(0x50);
    expect(viewerBuffer[2]).toBe(0x4e);
    expect(viewerBuffer[3]).toBe(0x47);
    // Validate width and height from PNG IHDR chunk (synthetic capture creates 640x360)
    expect(viewerBuffer.readUInt32BE(16)).toBe(640);
    expect(viewerBuffer.readUInt32BE(20)).toBe(360);

    // 2. Presenter saves screenshot of own featured stream
    const hostBtn = host.getByRole('button', { name: 'Salvar imagem', exact: true });
    await expect(hostBtn).toBeEnabled();

    const hostDownloadPromise = host.waitForEvent('download');
    await hostBtn.click();
    const hostDownload = await hostDownloadPromise;
    expect(hostDownload.suggestedFilename()).toMatch(/^screen-room-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.png$/);

    const hostFilePath = test.info().outputPath('host-screenshot.png');
    await hostDownload.saveAs(hostFilePath);
    const hostBuffer = fs.readFileSync(hostFilePath);
    expect(hostBuffer.readUInt32BE(16)).toBe(640);
    expect(hostBuffer.readUInt32BE(20)).toBe(360);

    // 3. Zooming in preserves intrinsic resolution and does not alter image dimensions
    await viewer.getByRole('button', { name: 'Ampliar zoom', exact: true }).click();
    await expect(viewer.getByText('125%')).toBeVisible();

    const zoomedDownloadPromise = viewer.waitForEvent('download');
    await viewerBtn.click();
    const zoomedDownload = await zoomedDownloadPromise;
    const zoomedFilePath = test.info().outputPath('viewer-zoomed.png');
    await zoomedDownload.saveAs(zoomedFilePath);
    const zoomedBuffer = fs.readFileSync(zoomedFilePath);
    // The exported image must be the raw decoded 640x360 frame, not zoomed or cropped by CSS
    expect(zoomedBuffer.readUInt32BE(16)).toBe(640);
    expect(zoomedBuffer.readUInt32BE(20)).toBe(360);

    // 4. Cinema mode allows screenshot
    await viewer.getByRole('button', { name: 'Modo Cinema', exact: true }).click();
    await expect(viewer.getByRole('button', { name: 'Sair do Modo Cinema', exact: true })).toBeVisible();
    await expect(viewer.getByRole('button', { name: 'Salvar imagem', exact: true })).toBeEnabled();
    await viewer.getByRole('button', { name: 'Sair do Modo Cinema', exact: true }).click();

    // 5. Pause disables screenshot button on both peers
    await host.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Salvar imagem', exact: true })).toBeDisabled();
    await expect(viewer.getByRole('button', { name: 'Salvar imagem', exact: true })).toBeDisabled();

    // Resume re-enables screenshot
    await host.getByRole('button', { name: 'Retomar transmissão', exact: true }).click();
    await expect(host.getByRole('button', { name: 'Salvar imagem', exact: true })).toBeEnabled();
    await expect(viewer.getByRole('button', { name: 'Salvar imagem', exact: true })).toBeEnabled();

    // Cleanup
    await host.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
  } finally {
    await hostContext.close();
    await viewerContext.close();
  }
});

for (const width of [390, 320]) {
  test(`F30 screenshot controls responsive layout and touch targets at ${width}px`, async ({ browser }) => {
    const hostContext = await browser.newContext();
    const viewerContext = await browser.newContext({
      viewport: { width, height: 844 },
      hasTouch: true,
    });
    try {
      const host = await hostContext.newPage();
      const viewer = await viewerContext.newPage();
      await syntheticCapture(host);
      await syntheticCapture(viewer);

      await Promise.all([
        gotoRoom(host, `/room/e2e-f30-mobile-${width}`),
        gotoRoom(viewer, `/room/e2e-f30-mobile-${width}`),
      ]);
      await startLive(host);
      await frames(viewer);

      const btn = viewer.getByRole('button', { name: 'Salvar imagem', exact: true });
      await expect(btn).toBeVisible();
      await expect(btn).toBeEnabled();

      const box = await btn.boundingBox();
      expect(box).not.toBeNull();
      // On mobile / coarse pointer, controls should have at least 44px height for touch ergonomics
      expect(box!.height).toBeGreaterThanOrEqual(44);

      // Verify controls bar stays within viewport width
      const bar = await viewer.locator('.stage-view-controls').boundingBox();
      expect(bar).not.toBeNull();
      expect(bar!.x).toBeGreaterThanOrEqual(0);
      expect(bar!.x + bar!.width).toBeLessThanOrEqual(width);

      // Tap to save image on touch device
      const downloadPromise = viewer.waitForEvent('download');
      await btn.tap();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/^screen-room-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.png$/);

      await host.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    } finally {
      await hostContext.close();
      await viewerContext.close();
    }
  });
}


for (const mobile of [false, true]) {
  test(`F38 hands synchronize, survive media and recovery, and remain accessible ${mobile ? 'mobile' : 'desktop'}`, async ({ browser }) => {
    const contexts = await Promise.all([
      browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 }, hasTouch: mobile }),
      browser.newContext(), browser.newContext(),
    ]);
    try {
      const host = await contexts[0].newPage(), viewer = await contexts[1].newPage(), late = await contexts[2].newPage();
      for (const page of [host, viewer, late]) await syntheticCapture(page);
      const room = `/room/f38-${mobile ? 'mobile' : 'desktop'}`;
      await gotoRoom(host, room); await gotoRoom(viewer, room);
      const up = (page: Page) => page.getByRole('button', { name: 'Levantar mão', exact: true });
      const down = (page: Page) => page.getByRole('button', { name: 'Abaixar mão', exact: true });
      await expect(up(host)).toBeEnabled();
      if (mobile) await up(host).tap();
      else { await up(host).focus(); await host.keyboard.press('Enter'); }
      await expect(down(host)).toHaveAttribute('aria-pressed', 'true');
      await up(viewer).click(); await expect(down(viewer)).toHaveAttribute('aria-pressed', 'true');
      await expect(host.getByRole('button', { name: /Ver participantes \(2\), 2 mãos levantadas/ }).first()).toBeVisible();
      await host.screenshot({ animations: 'disabled', path: test.info().outputPath(`f38-${mobile ? 'mobile' : 'desktop'}-raised.png`) });
      await gotoRoom(late, room);
      await expect(late.getByRole('button', { name: /Ver participantes \(3\), 2 mãos levantadas/ }).first()).toBeVisible();
      await host.getByRole('button', { name: /Ver participantes/ }).first().click();
      await expect(host.getByText('Mão levantada', { exact: true })).toHaveCount(2);
      const rows = host.getByText('Mão levantada', { exact: true });
      await expect(rows.first().locator('..').locator('..')).toContainText('(você)');
      await host.screenshot({ animations: 'disabled', path: test.info().outputPath(`f38-${mobile ? 'mobile' : 'desktop'}-participants.png`) });
      await host.getByRole('button', { name: 'Fechar lista de participantes' }).click();
      if (mobile) {
        const box = (await down(host).boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(44); expect(box.height).toBeGreaterThanOrEqual(44);
      }
      await startLive(host); await frames(viewer);
      await startLive(viewer); await frames(host);
      await host.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
      await expect(down(host)).toHaveAttribute('aria-pressed', 'true');
      await host.getByRole('button', { name: 'Retomar transmissão', exact: true }).click();
      await host.getByRole('button', { name: 'Trocar tela', exact: true }).click();
      await host.getByRole('button', { name: 'Confirmar troca', exact: true }).click();
      await expect(down(host)).toHaveAttribute('aria-pressed', 'true');
      await host.getByRole('button', { name: 'Modo Cinema', exact: true }).click();
      await expect(down(host)).toBeVisible();
      await host.screenshot({ animations: 'disabled', path: test.info().outputPath(`f38-${mobile ? 'mobile' : 'desktop'}-cinema.png`) });
      await down(host).click(); await expect(up(host)).toHaveAttribute('aria-pressed', 'false');
      await up(host).click(); await expect(down(host)).toHaveAttribute('aria-pressed', 'true');
      await host.getByRole('button', { name: 'Tela cheia', exact: true }).click();
      await expect.poll(() => host.evaluate(() => Boolean(document.fullscreenElement))).toBe(true);
      await expect(down(host)).toBeVisible();
      await host.screenshot({ animations: 'disabled', path: test.info().outputPath(`f38-${mobile ? 'mobile' : 'desktop'}-fullscreen.png`) });
      await down(host).click(); await expect(up(host)).toHaveAttribute('aria-pressed', 'false');
      await up(host).click(); await expect(down(host)).toHaveAttribute('aria-pressed', 'true');
      await host.getByRole('button', { name: 'Sair da tela cheia', exact: true }).click();
      await host.getByRole('button', { name: 'Sair do Modo Cinema', exact: true }).click();
      await host.evaluate(() => (window as any).testSockets.filter((s: WebSocket) => s.readyState === 1 && s.url.includes('/signal')).forEach((s: WebSocket) => s.close(4001)));
      await expect(up(host)).toBeDisabled();
      await expect(down(host)).toBeEnabled({ timeout: 15000 });
      await expect(down(host)).toHaveAttribute('aria-pressed', 'true');
      await host.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
      await expect(down(host)).toHaveAttribute('aria-pressed', 'true');
      await host.getByRole('button', { name: 'Sair da sala', exact: true }).last().click();
      await expect(late.getByRole('button', { name: /Ver participantes \(2\), 1 mão levantada/ }).first()).toBeVisible();
    } finally { await Promise.all(contexts.map(c => c.close())); }
  });
}

test('F22 both annotation overlays, silent secondary, replacement and playback cleanup', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  try {
    const [ana, bia, viewer] = await Promise.all(contexts.map(c => c.newPage()));
    for (const [i, page] of [ana, bia, viewer].entries()) {
      await syntheticCapture(page);
      await page.addInitScript(name => sessionStorage.setItem('screen_room_display_name', name), ['Ana', 'Bia', 'Vera'][i]);
      await gotoRoom(page, `/room/f22-annotations-${test.info().workerIndex}`);
    }
    await ana.evaluate(() => { (window as any).testAudio = true; });
    await bia.evaluate(() => { (window as any).testAudio = true; });
    await startLive(ana); await startLive(bia); await frames(viewer);
    const connections = await viewer.evaluate(() => (window as any).testPeers.length);
    await viewer.getByRole('button', { name: 'Comparar', exact: true }).click();
    expect(await viewer.evaluate(() => (window as any).testPeers.length)).toBe(connections);
    expect(await viewer.locator('video').evaluateAll(v => v.filter(e => !(e as HTMLVideoElement).muted).length)).toBeLessThanOrEqual(1);
    const primary = viewer.getByRole('region', { name: 'Transmissão principal', exact: true });
    const secondary = viewer.getByRole('region', { name: 'Transmissão secundária', exact: true });
    await primary.getByRole('combobox').selectOption({ label: 'Ana' });
    // Each presenter draws on their own capture.
    await bia.getByRole('button', { name: 'Destacar transmissão de Bia (você)' }).click();
    await drawAnnotation(ana); await drawAnnotation(bia);
    const pixels = (panel: typeof primary) => panel.getByTestId('annotation-overlay').evaluate((canvas: HTMLCanvasElement) =>
      canvas.getContext('2d')!.getImageData(0, 0, canvas.width, canvas.height).data.some((v, i) => i % 4 === 3 && v > 0));
    await expect.poll(() => pixels(primary)).toBe(true);
    await expect.poll(() => pixels(secondary)).toBe(true);
    await expect(secondary.getByRole('button', { name: /Desenhar|Apontar|Ponteiro laser/ })).toHaveCount(0);
    await primary.getByRole('button', { name: 'Ampliar zoom' }).click();
    // Refresh temporary strokes before checking the zoomed overlay (TTL is eight seconds).
    await drawAnnotation(ana); await drawAnnotation(bia);
    await expect.poll(() => pixels(primary)).toBe(true);
    await expect.poll(() => pixels(secondary)).toBe(true);
    await secondary.locator('video').evaluate(v => { (window as any).f22OldVideo = v; (window as any).f22OldStream = (v as HTMLVideoElement).srcObject; });
    const captureId = () => viewer.evaluate(() => (window as any).testMessages.filter((m: any) => m.type === 'sharing-updated' && m.active).at(-1)?.streamId);
    const previousCapture = await captureId();
    await bia.getByRole('button', { name: 'Trocar tela', exact: true }).click();
    await bia.getByRole('button', { name: 'Confirmar troca', exact: true }).click();
    await expect.poll(captureId).not.toBe(previousCapture);
    await expect.poll(() => secondary.locator('video').evaluate(v => (v as HTMLVideoElement).videoWidth > 0 && !(v as HTMLVideoElement).paused)).toBe(true);
    expect(await secondary.locator('video').evaluate(v => (v as HTMLVideoElement).muted)).toBe(true);
    await viewer.getByRole('button', { name: 'Sair da comparação' }).click();
    await expect.poll(() => viewer.evaluate(() => (window as any).f22OldVideo.srcObject === null && !(window as any).f22OldVideo.isConnected)).toBe(true);
  } finally { await Promise.all(contexts.map(c => c.close())); }
});


for (const width of [1440, 1024, 768, 600, 390, 320]) {
  test(`F22 collapsible stage toolbar geometry and input at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 }, hasTouch: width < 400 });
    const other = await browser.newContext({ viewport: { width, height: 900 } });
    try {
      const page = await context.newPage();
      const peer = await other.newPage();
      const room = `/room/f22-toolbar-${width}`;
      await syntheticCapture(page, true); await gotoRoom(page, room); await startLive(page);
      await syntheticCapture(peer, 'browser'); await gotoRoom(peer, room); await frames(peer);
      await peer.screenshot({ path: test.info().outputPath(`viewer-traditional-${width}.png`) });
      await startLive(peer);
      await frames(page);
      await expect(page.getByText('Visitante entrou na sala.', { exact: true })).toBeHidden({ timeout: 10000 });
      const primary = page.locator('.stage-view-controls').first();
      const inspect = async (state: string) => {
        await expect.poll(async () => page.locator('.stage-view-controls').evaluateAll(elements => elements.every(el => {
          const r = el.getBoundingClientRect();
          const panel = el.closest('.comparison-panel')!.getBoundingClientRect();
          const stage = el.closest('.stage-main-container')!.getBoundingClientRect();
          // Compare visible intersections: stacked panels intentionally scroll outside the stage.
          const top = Math.max(r.top, stage.top), bottom = Math.min(r.bottom, stage.bottom);
          const dock = document.querySelector('.floating-dock-wrapper')!.getBoundingClientRect();
          return r.left >= panel.left && r.right <= panel.right && r.width <= 56 &&
            (bottom <= top || !!document.fullscreenElement || r.right <= dock.left || r.left >= dock.right || bottom <= dock.top || top >= dock.bottom);
        }))).toBe(true);
        await page.locator('.stage-controls-scroll').evaluateAll(elements => elements.forEach(el => { el.scrollTop = 0; }));
        await page.screenshot({ path: test.info().outputPath(`${state}-${width}.png`), animations: 'disabled' });
      };
      const toggle = primary.locator('.stage-controls-toggle');
      const originalVideo = await page.getByTestId('zoom-viewport').first().boundingBox();
      await inspect('traditional-expanded');
      await primary.getByRole('button', { name: 'Ampliar zoom', exact: true }).click();
      await primary.getByRole('button', { name: 'Desenhar', exact: true }).click();
      await toggle.focus(); await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toBeFocused();
      expect(await toggle.evaluate(el => getComputedStyle(el).outlineStyle)).toBe('solid');
      await expect(primary.getByRole('button')).toHaveCount(1);
      await expect(page.getByTestId('zoom-viewport').first()).not.toHaveAttribute('aria-label', /Área de desenho/);
      await inspect('traditional-collapsed');
      expect(await page.getByTestId('zoom-viewport').first().boundingBox()).toEqual(originalVideo);
      await page.keyboard.press('Tab');
      expect(await primary.evaluate(el => el.contains(document.activeElement))).toBe(false);
      await toggle.focus();
      await page.mouse.move(10, 10); await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await page.keyboard.press('Space');
      await expect(primary.getByRole('button', { name: 'Restaurar enquadramento' })).toHaveText('125%');
      await expect(primary.getByRole('button', { name: 'Desenhar', exact: true })).toHaveAttribute('aria-pressed', 'false');
      await primary.getByRole('button', { name: 'Comparar', exact: true }).click();
      await expect(page.locator('.stage-view-controls')).toHaveCount(2);
      await inspect('comparison-expanded');
      const secondary = page.getByRole('region', { name: 'Transmissão secundária', exact: true });
      await secondary.getByRole('button', { name: 'Ampliar zoom', exact: true }).click();
      if (width < 400) await toggle.tap(); else await toggle.click();
      await expect(secondary.getByRole('button', { name: 'Restaurar enquadramento' })).toHaveText('125%');
      await inspect('comparison-collapsed');
      const selector = page.getByRole('region', { name: 'Transmissão principal', exact: true }).getByRole('combobox');
      const alternative = await selector.locator('option').evaluateAll(options => options.find(o => !(o as HTMLOptionElement).selected)?.getAttribute('value'));
      await selector.selectOption(alternative!);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await page.screenshot({ path: test.info().outputPath(`viewer-comparison-${width}.png`) });
      await secondary.getByRole('button', { name: 'Recolher ferramentas' }).click();
      await expect(page.getByRole('button', { name: 'Expandir ferramentas' })).toHaveCount(2);
      await toggle.click();
      await primary.getByRole('button', { name: 'Sair da comparação' }).click();
      await primary.getByRole('button', { name: 'Modo Cinema', exact: true }).click();
      await inspect('cinema-expanded'); await toggle.click(); await inspect('cinema-collapsed'); await toggle.click();
      await primary.getByRole('button', { name: 'Tela cheia', exact: true }).click();
      await expect.poll(() => page.evaluate(() => !!document.fullscreenElement)).toBe(true);
      await inspect('fullscreen-expanded'); await toggle.click(); await inspect('fullscreen-collapsed'); await toggle.click();
      await primary.getByRole('button', { name: 'Sair da tela cheia' }).click();
      await expect(page.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true })).toBeVisible();
      await page.setViewportSize({ width, height: 600 });
      await primary.getByRole('button', { name: 'Ampliar zoom', exact: true }).click();
      await inspect('resized-expanded');
      if (width < 800) {
        await page.setViewportSize({ width: 844, height: 390 });
        await expect(toggle).toBeInViewport();
        await primary.getByRole('button', { name: 'Ampliar zoom', exact: true }).click();
        await page.screenshot({ path: test.info().outputPath(`landscape-${width}.png`) });
      }
    } finally { await context.close(); await other.close(); }
  });
}

for (const width of [1440, 320]) {
  test(`F24 individual playback preferences and comparison at ${width}px`, async ({ browser }) => {
    const contexts = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext({ viewport: { width, height: 900 }, hasTouch: width === 320 })]);
    try {
      const [ana, bia, viewer] = await Promise.all(contexts.map(context => context.newPage()));
      for (const [index, page] of [ana, bia, viewer].entries()) {
        await syntheticCapture(page, true);
        await page.addInitScript(name => sessionStorage.setItem('screen_room_display_name', name), ['Ana', 'Bia', 'Vera'][index]);
        if (index === 2) await page.addInitScript(() => {
          (window as any).testAudioOverlap = 0;
          const descriptor = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted')!;
          Object.defineProperty(HTMLMediaElement.prototype, 'muted', {
            ...descriptor,
            set(value: boolean) {
              descriptor.set!.call(this, value);
              if ([...document.querySelectorAll<HTMLVideoElement>('.stage-main-container video')].filter(video => !video.muted).length > 1) (window as any).testAudioOverlap++;
            },
          });
        });
        await gotoRoom(page, `/room/f24-${width}`);
      }
      await ana.evaluate(() => { (window as any).testAudio = true; });
      await bia.evaluate(() => { (window as any).testAudio = true; });
      await startLive(ana); await startLive(bia); await frames(viewer);
      await viewer.getByRole('button', { name: 'Comparar', exact: true }).click();
      const primary = viewer.getByRole('region', { name: 'Transmissão principal', exact: true });
      const secondary = viewer.getByRole('region', { name: 'Transmissão secundária', exact: true });
      await primary.getByRole('combobox').selectOption({ label: 'Ana' });
      const singleAudio = async () => expect(await viewer.locator('video').evaluateAll(videos => videos.filter(video => !(video as HTMLVideoElement).muted).length)).toBeLessThanOrEqual(1);
      await primary.locator('video').evaluate(video => { (window as any).f24Video = video; (window as any).f24Stream = (video as HTMLVideoElement).srcObject; });
      await primary.getByRole('button', { name: 'Áudio da transmissão', exact: true }).click();
      await viewer.getByRole('slider', { name: 'Volume da transmissão' }).fill('0.35');
      await viewer.getByRole('button', { name: 'Silenciar transmissão', exact: true }).click();
      expect(await primary.locator('video').evaluate(video => video === (window as any).f24Video && (video as HTMLVideoElement).srcObject === (window as any).f24Stream)).toBe(true);
      expect(await primary.locator('video').evaluate(video => (video as HTMLVideoElement).muted)).toBe(true);
      await viewer.keyboard.press('Escape');
      await expect(viewer.getByRole('slider', { name: 'Volume da transmissão' })).toHaveCount(0);
      await secondary.getByRole('button', { name: 'Áudio da transmissão', exact: true }).click();
      await viewer.getByRole('button', { name: 'Ouvir esta transmissão', exact: true }).click();
      await viewer.getByRole('slider', { name: 'Volume da transmissão' }).fill('0.65');
      await expect(primary.locator('option:checked')).toHaveText('Ana');
      await singleAudio();
      const bounds = await viewer.getByText('Áudio da transmissão', { exact: true }).boundingBox();
      expect(bounds!.x).toBeGreaterThanOrEqual(0);
      expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
      await viewer.screenshot({ animations: 'disabled', path: test.info().outputPath(`f24-audio-${width}.png`), fullPage: true });
      await viewer.keyboard.press('Escape');
      await expect(viewer.getByRole('slider', { name: 'Volume da transmissão' })).toHaveCount(0);
      // Pause and F27 replace media without resetting this participant's local preference.
      await bia.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
      await expect(secondary.getByText('Transmissão pausada', { exact: true })).toBeVisible();
      await singleAudio();
      await bia.getByRole('button', { name: 'Retomar transmissão', exact: true }).click();
      await expect.poll(() => secondary.locator('video').evaluate(video => (video as HTMLVideoElement).volume)).toBe(0.65);
      await bia.evaluate(() => { (window as any).testAudio = false; });
      await bia.getByRole('button', { name: 'Trocar tela', exact: true }).click();
      await bia.getByRole('button', { name: 'Confirmar troca', exact: true }).click();
      await secondary.getByRole('button', { name: 'Áudio da transmissão', exact: true }).click();
      await expect(viewer.getByText('Sem faixa de áudio', { exact: true })).toBeVisible();
      await expect(viewer.getByRole('slider')).toHaveValue('0.65');
      await viewer.keyboard.press('Escape');
      await expect(viewer.getByRole('slider')).toHaveCount(0);
      await bia.evaluate(() => { (window as any).testAudio = true; });
      await bia.getByRole('button', { name: 'Trocar tela', exact: true }).click();
      await bia.getByRole('button', { name: 'Confirmar troca', exact: true }).click();
      await expect.poll(() => secondary.locator('video').evaluate(video => (video as HTMLVideoElement).volume)).toBe(0.65);
      await singleAudio();
      // Following Ana changes only the visual primary; the manual audio choice remains Bia.
      await viewer.getByRole('button', { name: /^Ver participantes/ }).first().click();
      await viewer.getByRole('button', { name: 'Acompanhar escolhas de Ana', exact: true }).click();
      await viewer.getByRole('button', { name: 'Fechar lista de participantes' }).click();
      await ana.getByRole('button', { name: 'Destacar transmissão de Bia', exact: true }).click();
      await expect(primary.locator('option:checked')).toHaveText('Bia');
      expect(await primary.locator('video').evaluate(video => (video as HTMLVideoElement).volume)).toBe(0.65);
      await startLive(viewer);
      await ana.getByRole('button', { name: 'Destacar transmissão de Vera', exact: true }).click();
      await expect(primary.locator('option:checked')).toHaveText('Vera (você)');
      await expect(secondary.locator('option:checked')).toHaveText('Bia');
      expect(await primary.locator('video').evaluate(video => (video as HTMLVideoElement).muted)).toBe(true);
      expect(await secondary.locator('video').evaluate(video => (video as HTMLVideoElement).volume)).toBe(0.65);
      await singleAudio();
      await ana.getByRole('button', { name: 'Destacar transmissão de Ana (você)', exact: true }).click();
      await expect(primary.locator('option:checked')).toHaveText('Ana');
      expect(await primary.locator('video').evaluate(video => (video as HTMLVideoElement).muted)).toBe(true);
      await singleAudio();
      await viewer.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
      // Role swaps preserve the manually selected participant and both preferences.
      await primary.getByRole('combobox').selectOption({ label: 'Bia' });
      await singleAudio();
      expect(await primary.locator('video').evaluate(video => (video as HTMLVideoElement).volume)).toBe(0.65);
      await primary.getByRole('combobox').selectOption({ label: 'Ana' });
      expect(await primary.locator('video').evaluate(video => (video as HTMLVideoElement).volume)).toBe(0.35);
      expect(await primary.locator('video').evaluate(video => (video as HTMLVideoElement).muted)).toBe(true);
      await primary.getByRole('button', { name: 'Sair da comparação', exact: true }).click();
      await singleAudio();
      expect(await viewer.locator('.comparison-canvas video').evaluate(video => (video as HTMLVideoElement).muted)).toBe(true);
      await viewer.getByRole('button', { name: 'Áudio da transmissão', exact: true }).click();
      await expect(viewer.getByRole('button', { name: 'Desmutar transmissão', exact: true })).toBeVisible();
      await viewer.getByRole('button', { name: 'Desmutar transmissão', exact: true }).click();
      await viewer.keyboard.press('Escape');
      await expect(viewer.getByRole('slider', { name: 'Volume da transmissão' })).toHaveCount(0);
      // Losing the manually selected source cannot turn the unmuted primary on.
      await viewer.getByRole('button', { name: 'Comparar', exact: true }).click();
      await secondary.getByRole('button', { name: 'Áudio da transmissão', exact: true }).click();
      await viewer.getByRole('button', { name: 'Ouvir esta transmissão', exact: true }).click();
      await viewer.keyboard.press('Escape');
      await expect(viewer.getByRole('slider')).toHaveCount(0);
      await bia.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
      await expect(secondary).toHaveCount(0);
      expect(await viewer.locator('.comparison-canvas video').evaluate(video => (video as HTMLVideoElement).muted)).toBe(true);
      await singleAudio();
      expect(await viewer.evaluate(() => (window as any).testAudioOverlap)).toBe(0);
    } finally { await Promise.all(contexts.map(context => context.close())); }
  });
}

test('F24 iOS exposes mute and device volume guidance without a software slider', async ({ browser }) => {
  const hostContext = await browser.newContext();
  const viewerContext = await browser.newContext({ viewport: { width: 320, height: 740 }, hasTouch: true, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile Safari/604.1' });
  try {
    const host = await hostContext.newPage(), viewer = await viewerContext.newPage();
    await syntheticCapture(host); await syntheticCapture(viewer);
    await gotoRoom(host, '/room/f24-ios'); await gotoRoom(viewer, '/room/f24-ios');
    await startLive(host); await frames(viewer);
    await viewer.getByRole('button', { name: 'Áudio da transmissão', exact: true }).tap();
    await expect(viewer.getByRole('slider')).toHaveCount(0);
    await expect(viewer.getByText('Ajuste o volume pelos controles do dispositivo.')).toBeVisible();
    await expect(viewer.getByText('Sem faixa de áudio', { exact: true })).toBeVisible();
    await viewer.getByRole('button', { name: 'Silenciar transmissão', exact: true }).tap();
    await expect(viewer.getByRole('button', { name: 'Desmutar transmissão' })).toHaveAttribute('aria-pressed', 'true');
    await viewer.screenshot({ animations: 'disabled', path: test.info().outputPath('f24-ios-mute-320.png') });
  } finally { await hostContext.close(); await viewerContext.close(); }
});

test('F24 explicit mute survives blocked autoplay, source replacement and reconnect', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const host = await contexts[0].newPage(), viewer = await contexts[1].newPage();
    await syntheticCapture(host); await syntheticCapture(viewer);
    await gotoRoom(host, '/room/f24-blocked'); await gotoRoom(viewer, '/room/f24-blocked');
    await host.evaluate(() => { (window as any).testAudio = true; });
    await viewer.evaluate(() => { (window as any).testBlockAudio = true; });
    await startLive(host); await frames(viewer);
    await expect(viewer.getByRole('button', { name: 'Ativar áudio', exact: true })).toBeVisible();
    const audioButton = viewer.getByRole('button', { name: 'Áudio da transmissão', exact: true });
    await audioButton.focus(); await viewer.keyboard.press('Enter');
    await expect(viewer.getByText('Reprodução bloqueada pelo navegador', { exact: true })).toBeVisible();
    await viewer.getByRole('slider').focus(); await viewer.keyboard.press('ArrowLeft');
    await viewer.getByRole('button', { name: 'Silenciar transmissão', exact: true }).click();
    await expect(viewer.getByRole('button', { name: 'Ativar áudio', exact: true })).toHaveCount(0);
    await expect(viewer.getByText('Mudo local', { exact: true })).toBeVisible();
    await viewer.screenshot({ animations: 'disabled', path: test.info().outputPath('f24-muted-blocked.png') });
    await viewer.keyboard.press('Escape');
    await expect(viewer.getByRole('slider')).toHaveCount(0);
    await expect(audioButton).toBeFocused();
    await host.getByRole('button', { name: 'Trocar tela', exact: true }).click();
    await host.getByRole('button', { name: 'Confirmar troca', exact: true }).click();
    const joins = await viewer.evaluate(() => (window as any).testMessages.filter((message: any) => message.type === 'peers').length);
    await viewer.evaluate(() => (window as any).testSockets.filter((socket: WebSocket) => socket.readyState === WebSocket.OPEN && socket.url.includes('/signal')).forEach((socket: WebSocket) => socket.close(4001, 'test')));
    await expect.poll(() => viewer.evaluate(() => (window as any).testMessages.filter((message: any) => message.type === 'peers').length), { timeout: 15000 }).toBeGreaterThan(joins);
    await audioButton.click();
    await expect(viewer.getByRole('slider')).toHaveValue('0.95');
    await expect(viewer.getByRole('button', { name: 'Desmutar transmissão', exact: true })).toBeVisible();
    expect(await viewer.locator('.comparison-canvas video').evaluate(video => (video as HTMLVideoElement).muted)).toBe(true);
    await viewer.getByRole('button', { name: 'Desmutar transmissão', exact: true }).click();
    expect(await viewer.locator('.comparison-canvas video').evaluate(video => (video as HTMLVideoElement).volume)).toBe(0.95);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});

for (const width of [1280, 390]) {
  test(`F34 conservative global recovery preserves preference and manual cancellation ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 844 }, hasTouch: width < 500 });
    const host = await context.newPage(), viewer = await context.newPage();
    try {
      await syntheticCapture(host); await syntheticCapture(viewer);
      await host.addInitScript(() => {
        const nativeNow = performance.now.bind(performance);
        (window as any).qualityTime = 0;
        Object.defineProperty(performance, 'now', { value: () => nativeNow() + (window as any).qualityTime });
        const interval = window.setInterval.bind(window);
        window.setInterval = ((handler: TimerHandler, ms?: number, ...args: any[]) => {
          if (ms === 3000) { (window as any).qualityCollect = handler; return interval(() => {}, ms); }
          return interval(handler, ms, ...args);
        }) as typeof window.setInterval;
      });
      await Promise.all([gotoRoom(host, `/room/f34-${width}`), gotoRoom(viewer, `/room/f34-${width}`)]);
      await expect(host.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
      await startLive(host); await frames(viewer);
      const trigger = host.locator('.floating-dock-bar').getByRole('button', { name: 'Configurações e convite', exact: true });
      await trigger.focus(); await host.keyboard.press('Enter');
      await host.getByRole('menuitem', { name: 'Configurações e diagnósticos', exact: true }).click();
      await host.getByLabel('Nível de qualidade').selectOption('ultra');
      await expect.poll(() => host.evaluate(() => (window as any).testPeers.filter((pc: RTCPeerConnection) => pc.connectionState === 'connected')
        .flatMap((pc: RTCPeerConnection) => pc.getSenders().filter(s => s.track?.kind === 'video').map(s => s.getParameters().encodings[0]?.maxBitrate)))).toEqual([6000000]);
      await host.evaluate(() => {
        (window as any).qualityLoss = 6;
        for (const pc of (window as any).testPeers as RTCPeerConnection[]) {
          let received = 0, lost = 0;
          pc.getStats = async () => {
            const loss = (window as any).qualityLoss;
            received += 100 - loss; lost += loss;
            const timestamp = performance.now();
            return new Map([
              ['out', { id: 'out', type: 'outbound-rtp', kind: 'video', timestamp, packetsSent: received + lost }],
              ['remote', { id: 'remote', type: 'remote-inbound-rtp', kind: 'video', localId: 'out', timestamp, packetsReceived: received, packetsLost: lost }],
            ]) as unknown as RTCStatsReport;
          };
        }
      });
      const tick = async (count = 1) => {
        for (let i = 0; i < count; i++) {
          await host.evaluate(() => { (window as any).qualityTime += 3000; (window as any).qualityCollect(); });
          await host.waitForTimeout(30);
        }
      };
      await host.screenshot({ animations: 'disabled', path: test.info().outputPath(`f34-normal-${width}.png`) });
      await tick(2);
      await expect(host.getByText(/Perfil temporário solicitado: Equilibrado/)).toBeVisible();
      await tick(7);
      await expect(host.getByText(/Perfil temporário solicitado: Econômico/)).toBeVisible();
      await expect(host.getByLabel('Nível de qualidade')).toHaveValue('ultra');
      await host.screenshot({ animations: 'disabled', path: test.info().outputPath(`f34-reduced-${width}.png`) });
      await host.evaluate(() => { (window as any).qualityLoss = 0; });
      await tick(20);
      await expect(host.getByText(/Perfil temporário solicitado: Econômico/)).toBeVisible();
      await tick(1);
      await expect(host.getByText(/Perfil temporário solicitado: Equilibrado/)).toBeVisible();
      await tick(21);
      await expect(host.getByText(/Perfil temporário solicitado:/)).toHaveCount(0);
      await expect(host.getByLabel('Nível de qualidade')).toHaveValue('ultra');
      await expect(host.getByText(/Limites aplicados verificados|Aplicação dos limites incompleta/)).toBeVisible();
      await host.screenshot({ animations: 'disabled', path: test.info().outputPath(`f34-recovered-${width}.png`) });
      await host.getByLabel('Nível de qualidade').focus();
      expect(await host.getByLabel('Nível de qualidade').evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
      expect(await host.getByRole('dialog').evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
      if (width < 500) await host.getByText('Fluidez', { exact: true }).tap();
      else await host.getByText('Fluidez', { exact: true }).click();
      await host.getByLabel('Nível de qualidade').selectOption('economy');
      await tick(25);
      await expect(host.getByLabel('Nível de qualidade')).toHaveValue('economy');
      await expect(host.getByText(/Perfil temporário solicitado:/)).toHaveCount(0);
      // An old recovery blocked inside applyConstraints must not replace a manual choice.
      await host.getByLabel('Nível de qualidade').selectOption('ultra');
      await host.evaluate(() => { (window as any).qualityLoss = 6; });
      await tick(9);
      await expect(host.getByText(/Perfil temporário solicitado: Econômico/)).toBeVisible();
      await host.evaluate(() => { (window as any).qualityLoss = 0; });
      await tick(20);
      await host.evaluate(() => { (window as any).testDelayConstraints = true; (window as any).resolveConstraints = null; });
      await tick();
      await expect.poll(() => host.evaluate(() => Boolean((window as any).resolveConstraints))).toBe(true);
      await host.getByLabel('Nível de qualidade').selectOption('economy');
      await host.evaluate(() => (window as any).resolveConstraints());
      await expect(host.getByText(/Verificando limites solicitados/)).toHaveCount(0);
      await expect(host.getByLabel('Nível de qualidade')).toHaveValue('economy');
      await expect(host.getByText(/Perfil temporário solicitado:/)).toHaveCount(0);
      await expect.poll(() => host.evaluate(() => (window as any).testPeers.filter((pc: RTCPeerConnection) => pc.connectionState === 'connected')
        .flatMap((pc: RTCPeerConnection) => pc.getSenders().filter(s => s.track?.kind === 'video').map(s => s.getParameters().encodings[0]?.maxBitrate)))).toEqual([2000000]);
      // Pause cancels a pending recovery and keeps all senders detached after it settles.
      await host.getByLabel('Nível de qualidade').selectOption('ultra');
      await host.evaluate(() => { (window as any).qualityLoss = 6; });
      await tick(9);
      await expect(host.getByText(/Perfil temporário solicitado: Econômico/)).toBeVisible();
      await host.evaluate(() => { (window as any).qualityLoss = 0; });
      await tick(20);
      await host.evaluate(() => { (window as any).testDelayConstraints = true; (window as any).resolveConstraints = null; });
      await tick();
      await expect.poll(() => host.evaluate(() => Boolean((window as any).resolveConstraints))).toBe(true);
      await host.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
      await host.getByRole('button', { name: 'Pausar transmissão', exact: true }).click();
      await host.evaluate(() => (window as any).resolveConstraints());
      await expect(host.getByRole('button', { name: 'Retomar transmissão', exact: true })).toBeVisible();
      await tick(25);
      expect(await host.evaluate(() => (window as any).testPeers.filter((pc: RTCPeerConnection) => pc.connectionState !== 'closed')
        .every((pc: RTCPeerConnection) => pc.getSenders().every(sender => !sender.track)))).toBe(true);
      await trigger.click();
      await host.getByRole('menuitem', { name: 'Configurações e diagnósticos', exact: true }).click();
      await expect(host.getByText(/Perfil temporário solicitado: Econômico/)).toBeVisible();
      await host.getByRole('button', { name: 'Fechar configurações', exact: true }).click();
      await host.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
      await host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
      await expect(host.getByRole('dialog')).toContainText('Fluidez · Ultra · 30 FPS');
      expect(await host.evaluate(() => (window as any).testCapture.getVideoTracks()[0].readyState)).toBe('live');
    } finally { await context.close(); }
  });
}

test('F28 output preference survives remote screen replacement and signaling reconnect', async ({ browser }) => {
  const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
  try {
    const host = await contexts[0].newPage(), viewer = await contexts[1].newPage();
    await syntheticCapture(host); await syntheticCapture(viewer);
    await viewer.addInitScript(() => {
      navigator.mediaDevices.enumerateDevices = () => Promise.resolve([
        { kind: 'audiooutput', deviceId: 'test-output', label: 'Saída de teste' } as MediaDeviceInfo,
      ]);
      HTMLMediaElement.prototype.setSinkId = function (id: string) {
        Object.defineProperty(this, 'sinkId', { configurable: true, value: id });
        return Promise.resolve();
      };
    });
    await gotoRoom(host, '/room/f28-reconnect'); await gotoRoom(viewer, '/room/f28-reconnect');
    await host.evaluate(() => { (window as any).testAudio = true; });
    await startLive(host); await frames(viewer);
    await viewer.getByRole('button', { name: 'Abrir configurações e diagnósticos' }).click();
    await viewer.getByRole('tab', { name: 'Áudio', exact: true }).click();
    await viewer.getByLabel('Dispositivo de saída', { exact: true }).selectOption('test-output');
    await viewer.keyboard.press('Escape');
    const sink = () => viewer.locator('.comparison-canvas video').evaluate(video => (video as HTMLVideoElement).sinkId);
    await expect.poll(sink).toBe('test-output');
    await host.getByRole('button', { name: 'Trocar tela', exact: true }).click();
    await host.getByRole('button', { name: 'Confirmar troca', exact: true }).click();
    await frames(viewer);
    await expect.poll(sink).toBe('test-output');
    const joins = await viewer.evaluate(() => (window as any).testMessages.filter((message: any) => message.type === 'peers').length);
    await viewer.evaluate(() => (window as any).testSockets.filter((socket: WebSocket) => socket.readyState === WebSocket.OPEN && socket.url.includes('/signal')).forEach((socket: WebSocket) => socket.close(4001, 'test')));
    await expect.poll(() => viewer.evaluate(() => (window as any).testMessages.filter((message: any) => message.type === 'peers').length), { timeout: 15000 }).toBeGreaterThan(joins);
    await frames(viewer);
    await expect.poll(sink).toBe('test-output');
    expect(await viewer.evaluate(() => [localStorage, sessionStorage].some(storage => Object.values(storage).some(value => String(value).includes('test-output'))))).toBe(false);
  } finally { await Promise.all(contexts.map(context => context.close())); }
});
