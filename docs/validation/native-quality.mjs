// Opt-in native tab capture: captures only the generated validation tab by title.
// Start web Vite on 4311 first. Requires a graphical Chromium environment.
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
import { writeFile } from 'node:fs/promises';
const browser = await chromium.launch({ headless: false, args: [
  '--auto-select-tab-capture-source-by-title=Screen Room Quality Validation',
  '--enable-usermedia-screen-capturing', '--allow-http-screen-capture',
] });
try {
  const page = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  await page.goto(process.env.VALIDATION_URL ?? 'http://127.0.0.1:4311');
  await page.waitForTimeout(1500); // Let app hydration finish before adding the isolated control.
  const source = await browser.newPage({ viewport: { width: 2560, height: 1440 } });
  await source.evaluate(() => {
    document.title = 'Screen Room Quality Validation';
    document.body.innerHTML = '<button id="capture">Capture own test tab</button><pre style="font:12px monospace">const screenRoom = { text: "Small code, native screen capture", motion: true };\n' + 'function render(frame) { return frame * 2; }\n'.repeat(60) + '</pre><canvas width="1200" height="500"></canvas>';
    const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
    let frame = 0;
    const draw = () => { ctx.fillStyle = '#102030'; ctx.fillRect(0, 0, 1200, 500); ctx.fillStyle = 'white'; ctx.fillRect((frame++ * 10) % 1100, 30, 100, 400); requestAnimationFrame(draw); };
    draw();
  });
  await page.bringToFront();
  await page.evaluate(() => { document.body.insertAdjacentHTML('beforeend', '<button id="capture">Capture own test tab</button>'); });
  await page.evaluate(async () => {
    const media = await import('/src/features/room/media/display-media.ts');
    document.querySelector('#capture').onclick = () => {
      window.captureResult = media.captureDisplayMedia({ priority: 'sharpness', profile: 'balanced', fps: 20 })
        .then(stream => { window.nativeStream = stream; return { settings: stream.getVideoTracks()[0].getSettings() }; })
        .catch(error => ({ error: error.name, message: error.message }));
    };
  });
  await page.click('#capture');
  const first = await Promise.race([page.evaluate(() => window.captureResult), new Promise(resolve => setTimeout(() => resolve({ error: 'Capture timeout' }), 20000))]);
  const result = { browser: browser.version(), nativeCapture: first, rows: [] };
  if (first && !first.error) {
    await page.evaluate(async () => {
      const sender = new RTCPeerConnection({iceServers: []}), receiver = new RTCPeerConnection({iceServers: []});
      window.nativeSender = sender; window.nativeReceiver = receiver;
      sender.onicecandidate = event => { if (event.candidate) receiver.addIceCandidate(event.candidate); };
      receiver.onicecandidate = event => { if (event.candidate) sender.addIceCandidate(event.candidate); };
      receiver.ontrack = event => { const video = document.createElement('video'); video.muted = true; video.srcObject = event.streams[0]; video.play(); };
      sender.addTrack(window.nativeStream.getVideoTracks()[0], window.nativeStream);
      await sender.setLocalDescription(await sender.createOffer());
      await receiver.setRemoteDescription(sender.localDescription);
      await receiver.setLocalDescription(await receiver.createAnswer());
      await sender.setRemoteDescription(receiver.localDescription);
    });
    for (const [priority, profile, fps] of [['sharpness','economy',20],['sharpness','balanced',30],['sharpness','ultra',30],['motion','economy',30],['motion','balanced',60],['motion','ultra',60]]) {
      result.rows.push(await page.evaluate(async ({priority, profile, fps}) => {
        const { applyCaptureQuality } = await import('/src/features/room/media/display-media.ts');
        const track = window.nativeStream.getVideoTracks()[0];
        const verified = await applyCaptureQuality(track, {priority, profile, fps});
        const bitrate = { sharpness: {economy: 1600000, balanced: 3000000, ultra: 6000000}, motion: {economy: 2000000, balanced: 4000000, ultra: 8000000} }[priority][profile];
        const sender = window.nativeSender.getSenders()[0];
        const parameters = sender.getParameters();
        parameters.encodings[0].maxBitrate = bitrate;
        parameters.encodings[0].maxFramerate = fps;
        parameters.degradationPreference = priority === 'sharpness' ? 'maintain-resolution' : 'maintain-framerate';
        await sender.setParameters(parameters);
        const before = await window.nativeSender.getStats();
        await new Promise(resolve => setTimeout(resolve, 1800));
        const out = [], inbound = [];
        (await window.nativeSender.getStats()).forEach(report => {
          if (report.type === 'outbound-rtp' && report.kind === 'video') {
            const old = before.get(report.id);
            out.push({framesPerSecond: report.framesPerSecond, width: report.frameWidth, height: report.frameHeight,
              bitrateKbps: old ? (report.bytesSent - old.bytesSent) * 8 / (report.timestamp - old.timestamp) : undefined,
              framesEncoded: report.framesEncoded, qualityLimitationReason: report.qualityLimitationReason});
          }
        });
        (await window.nativeReceiver.getStats()).forEach(report => {
          if (report.type === 'inbound-rtp' && report.kind === 'video') inbound.push({framesPerSecond: report.framesPerSecond, framesDecoded: report.framesDecoded, width: report.frameWidth, height: report.frameHeight});
        });
        return { requested: {priority,profile,fps}, verified, settings: track.getSettings(), capabilities: track.getCapabilities(), hint: track.contentHint, outbound: out, inbound };
      }, {priority, profile, fps}));
    }
    await page.evaluate(() => { window.nativeStream.getTracks().forEach(track => track.stop()); window.nativeSender.close(); window.nativeReceiver.close(); });
  }
  await writeFile(process.env.QUALITY_REPORT ?? '/tmp/f01-native-final.json', JSON.stringify(result, (key, value) => key === 'deviceId' ? undefined : value, 2));
  console.log(JSON.stringify(result, (key, value) => key === 'deviceId' ? undefined : value));
} finally { await browser.close(); }
