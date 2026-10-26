import { expect, type Page } from '@playwright/test';
export async function synthetic(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.cameraRequests = []; w.cameraTracks = []; w.screenTracks = []; w.peers = []; w.sent = []; w.sockets = [];
    const NativeSocket=WebSocket;
    window.WebSocket=class extends NativeSocket {
      constructor(url: string | URL, protocols?: string | string[]) { super(url,protocols); w.sockets.push(this); }
    };
    const NativePC = RTCPeerConnection;
    window.RTCPeerConnection = class extends NativePC {
      constructor(config?: RTCConfiguration) { super(config); w.peers.push(this); }
    };
    const send = WebSocket.prototype.send;
    WebSocket.prototype.send = function(data) {
      if (typeof data === 'string') w.sent.push(JSON.parse(data));
      return send.call(this, data);
    };
    const makeStream = (camera: boolean) => {
      const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
      const ctx = canvas.getContext('2d')!; let frame = 0;
      const timer = setInterval(() => {
        ctx.fillStyle = camera ? '#387b61' : '#253b77'; ctx.fillRect(0,0,640,360);
        ctx.fillStyle = '#fff'; ctx.font = '28px sans-serif'; ctx.fillText(camera ? 'Câmera sintética' : 'Tela sintética',40,100);
        ctx.fillRect(++frame % 600,180,40,40);
      }, 60);
      const stream = canvas.captureStream(15); const track = stream.getVideoTracks()[0];
      const stop = track.stop.bind(track); track.stop = () => {clearInterval(timer); stop();};
      if (!camera && w.screenAudio) {
        const audio = new AudioContext(), oscillator = audio.createOscillator(), destination = audio.createMediaStreamDestination();
        oscillator.connect(destination); oscillator.start();
        const audioTrack = destination.stream.getAudioTracks()[0];
        const stopAudio = audioTrack.stop.bind(audioTrack);
        audioTrack.stop = () => { stopAudio(); oscillator.stop(); void audio.close(); };
        stream.addTrack(audioTrack); w.sharedAudio = audioTrack;
      }
      (camera ? w.cameraTracks : w.screenTracks).push(track); return stream;
    };
    Object.defineProperty(navigator.mediaDevices, 'getDisplayMedia', { configurable:true, value: () => {
      if (w.screenDeferred) return new Promise(resolve => { w.resolveScreen = () => resolve(makeStream(false)); });
      return Promise.resolve(makeStream(false));
    } });
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', { configurable:true, value: (constraints: MediaStreamConstraints) => {
      w.cameraRequests.push({ constraints, activation: navigator.userActivation.isActive });
      if (w.cameraError) return Promise.reject(new DOMException('Unavailable', w.cameraError));
      if (w.cameraDeferred) return new Promise(resolve => { w.resolveCamera = () => resolve(makeStream(true)); });
      return Promise.resolve(makeStream(true));
    } });
  });
}
export async function dock(page: Page) {
  const show=page.getByRole('button',{name:'Mostrar controles da sala',exact:true});
  if (await show.isVisible()) await show.click();
}
export async function start(page: Page) {
  await dock(page);
  await page.getByRole('button',{name:'Compartilhar tela',exact:true}).last().click();
  await page.getByRole('button',{name:'Entrar ao vivo',exact:true}).click();
  await dock(page);
  await expect(page.getByRole('button',{name:'Ativar câmera',exact:true})).toBeEnabled();
}
export async function preview(page: Page) {
  await page.getByRole('button',{name:'Ativar câmera',exact:true}).click();
  await expect(page.locator('video[aria-label="Prévia local da câmera"]')).toBeVisible();
  await expect.poll(()=>page.locator('video[aria-label="Prévia local da câmera"]').evaluate((v: HTMLVideoElement)=>v.videoWidth)).toBe(640);
}
export async function publish(page: Page) {
  await preview(page); await page.getByRole('button',{name:'Transmitir câmera',exact:true}).click();
  await expect(page.getByRole('button',{name:'Desligar câmera — câmera ao vivo',exact:true})).toBeVisible();
}
export async function cameraSenders(page: Page) {
  return page.evaluate(()=> (window as any).peers.flatMap((p: RTCPeerConnection)=>p.getSenders())
    .filter((s: RTCRtpSender)=>(window as any).cameraTracks.includes(s.track)).length);
}
