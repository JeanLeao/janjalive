import { test, expect } from '@playwright/test';

test('camera infrastructure uses separate sources in a real mesh connection', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const modulePath = '/src/features/room/webrtc/peer-manager.ts';
    const { PeerManager } = await import(/* @vite-ignore */ modulePath) as typeof import('../src/features/room/webrtc/peer-manager');
    const state: any = { screen: null, camera: null };
    (window as any).cameraTest = state;
    const capture = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 320; canvas.height = 180;
      canvas.getContext('2d')!.fillRect(0, 0, 320, 180);
      return canvas.captureStream(15);
    };
    const receiver = new PeerManager({ localPeerId: 'b', rtcConfig: {},
      onSendSignal: (_, data) => { void sender.handleSignal('b', data); },
      onRemoteStreamAdd: (_, stream) => { state.screen = stream; },
      onRemoteCameraStream: (_, stream) => { state.camera = stream; }, onRemoteStreamRemove() {},
    });
    const sender = new PeerManager({ localPeerId: 'a', rtcConfig: {},
      onSendSignal: (_, data) => { void receiver.handleSignal('a', data); },
      onRemoteStreamAdd() {}, onRemoteStreamRemove() {},
    });
    receiver.setParticipants(['a']); sender.setParticipants(['b']);
    receiver.setRemoteSharing('a', true); receiver.setRemoteCamera('a', true);
    state.sender = sender; state.receiver = receiver;
    state.screenCapture = capture(); state.cameraCapture = capture();
    await sender.attachLocalStream(state.screenCapture);
  });
  await expect.poll(() => page.evaluate(() => (window as any).cameraTest.sender.getPeer('b').pc.signalingState)).toBe('stable');
  await page.evaluate(async () => { const s = (window as any).cameraTest; await s.sender.attachCameraStream(s.cameraCapture); });
  await expect.poll(() => page.evaluate(() => {
    const s = (window as any).cameraTest;
    return Boolean(s.screen?.getVideoTracks().length === 1 && s.camera?.getVideoTracks().length === 1 && s.screen.getVideoTracks()[0] !== s.camera.getVideoTracks()[0]);
  })).toBe(true);
  await page.evaluate(async () => {
    const s = (window as any).cameraTest;
    await s.sender.detachLocalStream();
    if (s.sender.getPeer('b').cameraSender.track !== s.cameraCapture.getVideoTracks()[0]) throw Error('Screen detach affected camera');
    await s.sender.attachLocalStream(s.screenCapture);
    await s.sender.detachCameraStream();
    if (s.sender.getPeer('b').videoSender.track !== s.screenCapture.getVideoTracks()[0]) throw Error('Camera detach affected screen');
    s.sender.dispose(); s.receiver.dispose();
    s.screenCapture.getTracks().forEach((track: MediaStreamTrack) => track.stop());
    s.cameraCapture.getTracks().forEach((track: MediaStreamTrack) => track.stop());
  });
});

test('concurrent presenters keep cameras associated after late join and connection recreation', async ({ page }) => {
  await page.goto('/');
  await page.evaluate(async () => {
    const modulePath = '/src/features/room/webrtc/peer-manager.ts';
    const { PeerManager } = await import(/* @vite-ignore */ modulePath) as typeof import('../src/features/room/webrtc/peer-manager');
    const state: any = { managers: {}, received: {}, captures: [] };
    (window as any).cameraMeshTest = state;
    state.capture = () => {
      const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
      canvas.getContext('2d')!.fillRect(0, 0, 320, 180);
      const stream = canvas.captureStream(15); state.captures.push(stream); return stream;
    };
    state.create = (id: string) => {
      state.received[id] = {};
      const manager = new PeerManager({ localPeerId: id, rtcConfig: {},
        onSendSignal: (target, data) => { void state.managers[target]?.handleSignal(id, data); },
        onRemoteStreamAdd: (peer, stream) => { (state.received[id][peer] ||= {}).screen = stream; },
        onRemoteStreamRemove: peer => { (state.received[id][peer] ||= {}).screen = null; },
        onRemoteCameraStream: (peer, stream) => { (state.received[id][peer] ||= {}).camera = stream; },
      });
      state.managers[id] = manager; return manager;
    };
    const a = state.create('a'), b = state.create('b');
    a.setParticipants(['b']); b.setParticipants(['a']);
    a.setRemoteSharing('b', true); b.setRemoteSharing('a', true);
    a.setRemoteCamera('b', true); b.setRemoteCamera('a', true);
    await Promise.all([a.attachLocalStream(state.capture()), b.attachLocalStream(state.capture())]);
    await Promise.all([a.attachCameraStream(state.capture()), b.attachCameraStream(state.capture())]);
  });
  const ready = (id: string, presenters: string[]) => page.evaluate(({ id, presenters }) => {
    const s = (window as any).cameraMeshTest;
    return presenters.every(peer => {
      const media = s.received[id][peer];
      return media?.screen?.getVideoTracks().length === 1 && media?.camera?.getVideoTracks().length === 1 && media.screen.getVideoTracks()[0] !== media.camera.getVideoTracks()[0];
    });
  }, { id, presenters });
  await expect.poll(() => ready('a', ['b'])).toBe(true);
  await expect.poll(() => ready('b', ['a'])).toBe(true);
  await page.evaluate(() => {
    const s = (window as any).cameraMeshTest;
    const c = s.create('c'); c.setParticipants(['a', 'b']);
    for (const id of ['a', 'b']) { c.setRemoteSharing(id, true); c.setRemoteCamera(id, true); s.managers[id].addParticipant('c'); }
  });
  await expect.poll(() => ready('c', ['a', 'b'])).toBe(true);
  await page.evaluate(() => {
    const s = (window as any).cameraMeshTest;
    s.managers.a.resetPeer('c'); s.managers.c.resetPeer('a');
  });
  await expect.poll(() => ready('c', ['a', 'b'])).toBe(true);
  await page.evaluate(() => {
    const s = (window as any).cameraMeshTest;
    Object.values(s.managers).forEach((manager: any) => manager.dispose());
    s.captures.forEach((stream: MediaStream) => stream.getTracks().forEach(track => track.stop()));
  });
});

for (const action of ['confirm', 'cancel'] as const) {
  test(`camera-only source switch: late viewer receives frames, reconnects, then ${action} restores screen`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async () => {
      const modulePath = '/src/features/room/webrtc/peer-manager.ts';
      const { PeerManager } = await import(/* @vite-ignore */ modulePath) as typeof import('../src/features/room/webrtc/peer-manager');
      const state: any = { captures: [], timers: [], screen: null, camera: null };
      (window as any).cameraSwitchTest = state;
      state.capture = () => {
        const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180;
        let frame = 0;
        state.timers.push(setInterval(() => {
          canvas.getContext('2d')!.fillStyle = frame++ % 2 ? 'red' : 'blue';
          canvas.getContext('2d')!.fillRect(0, 0, 320, 180);
        }, 50));
        const stream = canvas.captureStream(15); state.captures.push(stream); return stream;
      };
      const screenVideo = document.createElement('video'), cameraVideo = document.createElement('video');
      for (const video of [screenVideo, cameraVideo]) { video.muted = true; video.autoplay = true; document.body.append(video); }
      const viewer = new PeerManager({ localPeerId: 'a', rtcConfig: {},
        onSendSignal: (_, data) => { void sender.handleSignal('a', data); },
        onRemoteStreamAdd: (_, stream) => { state.screen = stream; screenVideo.srcObject = stream; void screenVideo.play(); },
        onRemoteStreamRemove: () => { state.screen = null; screenVideo.srcObject = null; },
        onRemoteCameraStream: (_, stream) => { state.camera = stream; cameraVideo.srcObject = stream; if (stream) void cameraVideo.play(); },
      });
      const sender = new PeerManager({ localPeerId: 'z', rtcConfig: {},
        onSendSignal: (_, data) => { void viewer.handleSignal('z', data); }, onRemoteStreamAdd() {}, onRemoteStreamRemove() {},
      });
      state.sender = sender; state.viewer = viewer;
      state.original = state.capture(); state.webcam = state.capture();
      await sender.attachLocalStream(state.original);
      await sender.attachCameraStream(state.webcam);
      await sender.detachLocalStream();
      viewer.setParticipants(['z']); viewer.setRemoteSharing('z', true); viewer.setRemoteCamera('z', true);
      // The presenter initiates: the spectator has no media and never makes an offer.
      sender.addParticipant('a');
    });
    const frames = (source: 'camera' | 'screen') => page.evaluate(async source => {
      const s = (window as any).cameraSwitchTest;
      const track = s[source]?.getVideoTracks()[0];
      const peer = s.viewer.getPeer('z');
      if (!peer || !track) return false;
      let decoded = false;
      (await peer.pc.getStats()).forEach((report: any) => {
        if (report.type === 'inbound-rtp' && report.trackIdentifier === track.id && report.framesDecoded > 2) decoded = true;
      });
      return decoded;
    }, source);
    await expect.poll(() => frames('camera')).toBe(true);
    expect(await page.evaluate(() => {
      const s = (window as any).cameraSwitchTest;
      return s.sender.getPeer('a').videoSender?.track == null && s.screen == null;
    })).toBe(true);
    await page.evaluate(() => {
      const s = (window as any).cameraSwitchTest;
      s.viewer.resetPeer('z'); s.sender.resetPeer('a');
    });
    await expect.poll(() => frames('camera')).toBe(true);
    await page.evaluate(async action => {
      const s = (window as any).cameraSwitchTest;
      await s.sender.attachLocalStream(action === 'cancel' ? s.original : s.capture());
    }, action);
    await expect.poll(() => frames('screen')).toBe(true);
    await expect.poll(() => frames('camera')).toBe(true);
    await page.evaluate(async () => {
      const s = (window as any).cameraSwitchTest;
      // Explicit pause uses stopCamera, unlike a source switch's screen-only detach.
      s.viewer.setRemoteCamera('z', false);
      await s.sender.stopCamera(); await s.sender.detachLocalStream();
      if (s.webcam.getVideoTracks()[0].readyState !== 'ended' || s.sender.getPeer('a').cameraSender.track !== null || s.camera !== null) throw Error('Paused camera remained active');
      s.sender.addParticipant('after-pause');
    });
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => (window as any).cameraSwitchTest.sender.getPeer('after-pause') === undefined)).toBe(true);
    await page.evaluate(() => {
      const s = (window as any).cameraSwitchTest;
      s.sender.dispose(); s.viewer.dispose(); s.timers.forEach(clearInterval);
      s.captures.forEach((stream: MediaStream) => stream.getTracks().forEach(track => track.stop()));
    });
  });
}
