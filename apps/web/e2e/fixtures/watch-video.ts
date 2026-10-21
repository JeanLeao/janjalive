import { expect, type Page } from '@playwright/test';

// Generate real encoded VP8 video without committing a media artifact. MediaRecorder's
// live WebM lacks duration; add an EBML Duration to the Info element for a finite file.
export async function videoFile(page: Page, mime = 'video/webm;codecs=vp8', withAudio = false, vertical = false) {
  const bytes = Buffer.from(await page.evaluate(async ({ mime, withAudio, vertical }) => {
    const canvas = document.createElement('canvas'); canvas.width = vertical ? 180 : 320; canvas.height = vertical ? 320 : 180;
    const ctx = canvas.getContext('2d')!; let frame = 0;
    const draw = setInterval(() => { ctx.fillStyle = frame++ % 2 ? '#164e63' : '#1e3a5f'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = '#fff'; ctx.font = '20px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('Watch Party', canvas.width / 2, canvas.height / 2); ctx.font = '12px sans-serif'; ctx.fillText(`Quadro ${frame}`, canvas.width / 2, canvas.height / 2 + 24); }, 50);
    const stream = canvas.captureStream(20);
    const audio = withAudio ? new AudioContext() : null;
    if (audio) {
      await audio.resume();
      const tone = audio.createOscillator(), destination = audio.createMediaStreamDestination();
      tone.connect(destination); tone.start(); stream.addTrack(destination.stream.getAudioTracks()[0]);
    }
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    const chunks: Blob[] = []; recorder.ondataavailable = e => chunks.push(e.data);
    const ended = new Promise<void>(resolve => { recorder.onstop = () => resolve(); });
    recorder.start(); await new Promise(resolve => setTimeout(resolve, 8000)); recorder.stop(); await ended;
    clearInterval(draw); stream.getTracks().forEach(t => t.stop()); await audio?.close();
    return [...new Uint8Array(await new Blob(chunks).arrayBuffer())];
  }, { mime, withAudio, vertical }));
  if (mime.startsWith('video/mp4')) return bytes;
  const info = bytes.indexOf(Buffer.from([0x15, 0x49, 0xa9, 0x66]));
  expect(info).toBeGreaterThan(0);
  const start = info + 4; let width = 1; while (!(bytes[start] & (0x80 >> (width - 1)))) width++;
  let size = bytes[start] & ((1 << (8 - width)) - 1);
  for (let i = 1; i < width; i++) size = size * 256 + bytes[start + i];
  const duration = Buffer.alloc(11); duration.set([0x44, 0x89, 0x88]); duration.writeDoubleBE(8000, 3);
  const sizeBytes = Buffer.alloc(width); let n = size + duration.length;
  for (let i = width - 1; i >= 0; i--) { sizeBytes[i] = n & 255; n = Math.floor(n / 256); }
  sizeBytes[0] |= 0x80 >> (width - 1);
  return Buffer.concat([bytes.subarray(0, start), sizeBytes, bytes.subarray(start + width, start + width + size), duration, bytes.subarray(start + width + size)]);
}
