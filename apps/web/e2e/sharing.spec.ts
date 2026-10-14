import { test, expect, type Page } from '@playwright/test';

async function syntheticCapture(page: Page) {
  await page.addInitScript(() => {
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
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640; canvas.height = 360;
        const ctx = canvas.getContext('2d')!;
        let frame = 0;
        const timer = setInterval(() => {
          ctx.fillStyle = frame++ % 2 ? '#ff0000' : '#0000ff';
          ctx.fillRect(0, 0, 640, 360);
          ctx.fillStyle = '#ffffff'; ctx.fillRect(frame % 600, 40, 40, 40);
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
        (window as any).testCapture = stream;
        stream.getVideoTracks()[0].addEventListener('ended', () => clearInterval(timer));
        if ((window as any).testDelayCapture) await new Promise(resolve => { (window as any).resolveCapture = resolve; });
        return stream;
      },
    });
  });
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
      tracks: (v.srcObject as MediaStream | null)?.getTracks().map(t => ({ id: t.id, kind: t.kind, readyState: t.readyState, muted: t.muted })),
    })));
    const peers = await page.evaluate(() => (window as any).testPeers.map((pc: RTCPeerConnection) => ({
      state: pc.connectionState, transceivers: pc.getTransceivers().map(t => ({
        mid: t.mid, direction: t.direction, currentDirection: t.currentDirection,
        receiver: { id: t.receiver.track.id, muted: t.receiver.track.muted, readyState: t.receiver.track.readyState },
        sender: t.sender.track?.id,
      })),
    })));
    await test.info().attach('playback-state', { body: JSON.stringify({ state, peers }), contentType: 'application/json' });
    throw error;
  }
}

test('participants enter before capture; ten start/stop cycles with real WebRTC', async ({ browser }) => {
  const a = await browser.newContext(), b = await browser.newContext();
  const host = await a.newPage(), viewer = await b.newPage();
  await syntheticCapture(host); await syntheticCapture(viewer);
  await Promise.all([host.goto('/room/e2e-cycles'), viewer.goto('/room/e2e-cycles')]);
  await expect(host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last()).toBeVisible();
  await expect(viewer.getByRole('button', { name: 'Compartilhar tela', exact: true }).last()).toBeVisible();
  await expect(host.getByText('2', { exact: true }).first()).toBeVisible();
  for (let cycle = 0; cycle < 10; cycle++) {
    await host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
    await frames(viewer);
    await host.getByRole('button', { name: 'Parar compartilhamento de tela', exact: true }).click();
    await expect(viewer.locator('video')).toHaveCount(0, { timeout: 1000 });
  }
  await Promise.all([
    host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click(),
    viewer.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click(),
  ]);
  await frames(host); await frames(viewer);
  await expect(host.locator('video')).toHaveCount(2);
  await expect(viewer.locator('video')).toHaveCount(2);
  await host.getByRole('button', { name: /^Destacar transmissão de / }).click();
  await expect.poll(() => host.locator('video').first().evaluate(v => (v as HTMLVideoElement).muted)).toBe(false);
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
    await Promise.all(pages.map(syntheticCapture));
    const host = pages[0];
    await host.goto('/room/e2e-capacity');
    await expect(host.getByText('Conectado', { exact: true })).toBeVisible();
    await host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
    await Promise.all(pages.slice(1).map(page => page.goto('/room/e2e-capacity')));
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
    await Promise.all([host.goto('/room/e2e-reconnect'), viewer.goto('/room/e2e-reconnect')]);
    await expect(host.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
    await host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
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
  await page.goto('/room/e2e-selector');
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
    await Promise.all([host.goto('/room/e2e-audio'), viewer.goto('/room/e2e-audio')]);
    await expect(host.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
    await viewer.evaluate(() => { (window as any).testBlockAudio = true; });
    await host.evaluate(() => { (window as any).testAudio = true; });
    await host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
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
    await host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
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
    await Promise.all([first.goto('/room/e2e-glare'), second.goto('/room/e2e-glare')]);
    await expect(first.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
    await Promise.all([first, second].map(page =>
      page.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click()));
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
      await Promise.all([host.goto(`/room/e2e-replace-${role}`), viewer.goto(`/room/e2e-replace-${role}`)]);
      await expect(host.getByRole('button', { name: 'Ver participantes (2)', exact: true }).first()).toBeVisible();
      await host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
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
