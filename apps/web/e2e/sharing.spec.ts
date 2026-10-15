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
      configurable: true,
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
    await startLive(host);
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
    await Promise.all([first.goto('/room/e2e-glare'), second.goto('/room/e2e-glare')]);
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
      await Promise.all([host.goto(`/room/e2e-replace-${role}`), viewer.goto(`/room/e2e-replace-${role}`)]);
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
    await Promise.all([host.goto('/room/e2e-zoom'), viewer.goto('/room/e2e-zoom')]);
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
    await expect.poll(() => video.evaluate(v => new DOMMatrix(getComputedStyle(v).transform).m41)).toBeCloseTo(-12.5);
    await viewer.mouse.wheel(0, 100); await expect(group).toContainText('100%');
    for (let i = 0; i < 8; i++) await plus.click();
    await expect(group).toContainText('300%'); await expect(plus).toBeDisabled();
    await viewer.mouse.move(x,y); await viewer.mouse.down(); await viewer.mouse.move(x+2000,y+2000); await viewer.mouse.up();
    await expect.poll(() => video.evaluate(v => new DOMMatrix(getComputedStyle(v).transform).m41)).toBeGreaterThan(0);
    await viewer.getByRole('button', { name: 'Tela cheia', exact: true }).click();
    await expect.poll(() => viewer.evaluate(() => !!document.fullscreenElement)).toBe(true);
    await viewer.getByRole('button', { name: 'Sair da tela cheia' }).click();
    await reset.click();
    await expect.poll(() => video.evaluate(v => new DOMMatrix(getComputedStyle(v).transform).m41)).toBe(0);
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
      await host.goto('/room/e2e-preview-' + mobile);
      await host.evaluate(() => { (window as any).testAudio = true; });
      await host.getByRole('button', { name: 'Compartilhar tela', exact: true }).last().click();
      await expect(host.getByRole('dialog')).toContainText('Não está ao vivo');
      await expect.poll(() => host.getByRole('dialog').locator('video').evaluate(video => (video as HTMLVideoElement).videoWidth)).toBeGreaterThan(0);
      await host.screenshot({ path: test.info().outputPath('preview.png') });
      const cancel = host.getByRole('button', { name: 'Cancelar', exact: true });
      await cancel.focus();
      await expect(cancel).toBeFocused();
      await expect.poll(() => host.locator('video').evaluateAll(videos => videos.every(v => (v as HTMLVideoElement).muted))).toBe(true);
      await viewer.goto('/room/e2e-preview-' + mobile);
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
          await late.goto('/room/e2e-preview-' + mobile);
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
    await Promise.all([host.goto('/room/e2e-preview-end'), viewer.goto('/room/e2e-preview-end')]);
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
    await Promise.all([host.goto('/room/e2e-rapid'), viewer.goto('/room/e2e-rapid')]);
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
    await Promise.all([host.goto('/room/e2e-preview-focus'), other.goto('/room/e2e-preview-focus')]);
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
      await page.goto(`/room/e2e-layout-${viewport.width}`);
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
      const setDescription = RTCPeerConnection.prototype.setLocalDescription;
      RTCPeerConnection.prototype.setLocalDescription = async function (description?: RTCLocalSessionDescriptionInit) {
        if ((window as any).holdPublication) await new Promise(resolve => { (window as any).releasePublication = resolve; });
        return setDescription.bind(this)(description);
      };
      const replaceTrack = RTCRtpSender.prototype.replaceTrack;
      RTCRtpSender.prototype.replaceTrack = async function (track) {
        if ((window as any).holdPause) await new Promise(resolve => { ((window as any).releasePause ||= []).push(resolve); });
        return replaceTrack.call(this, track);
      };
    });
    try {
      await Promise.all([page.goto(`/room/e2e-pending-${mobile}`), viewer.goto(`/room/e2e-pending-${mobile}`)]);
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
