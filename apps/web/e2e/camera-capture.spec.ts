import { test, expect, type Page } from '@playwright/test';
import { gotoRoom } from './fixtures/rooms';

async function synthetic(page: Page) {
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
async function dock(page: Page) {
  const show=page.getByRole('button',{name:'Mostrar controles da sala',exact:true});
  if (await show.isVisible()) await show.click();
}
async function start(page: Page) {
  await dock(page);
  await page.getByRole('button',{name:'Compartilhar tela',exact:true}).last().click();
  await page.getByRole('button',{name:'Entrar ao vivo',exact:true}).click();
  await expect(page.getByRole('button',{name:'Ativar câmera',exact:true})).toBeEnabled();
}
async function preview(page: Page) {
  await page.getByRole('button',{name:'Ativar câmera',exact:true}).click();
  await expect(page.locator('video[aria-label="Prévia local da câmera"]')).toBeVisible();
  await expect.poll(()=>page.locator('video[aria-label="Prévia local da câmera"]').evaluate((v: HTMLVideoElement)=>v.videoWidth)).toBe(640);
}
async function publish(page: Page) {
  await preview(page); await page.getByRole('button',{name:'Transmitir câmera',exact:true}).click();
  await expect(page.getByRole('button',{name:'Desligar câmera — câmera ao vivo',exact:true})).toBeVisible();
}
async function cameraSenders(page: Page) {
  return page.evaluate(()=> (window as any).peers.flatMap((p: RTCPeerConnection)=>p.getSenders())
    .filter((s: RTCRtpSender)=>(window as any).cameraTracks.includes(s.track)).length);
}
for (const mobile of [false,true]) {
  test(`webcam B: preview, confirmation, switch, pause and independent stop ${mobile ? 'mobile' : 'desktop'}`, async ({browser}, info) => {
    const context=await browser.newContext({viewport:mobile ? {width:390,height:844}:{width:1280,height:800},hasTouch:mobile});
    const host=await context.newPage(), viewer=await context.newPage();
    await synthetic(host); await synthetic(viewer);
    await gotoRoom(host,'/room/camera-b'); await gotoRoom(viewer,'/room/camera-b');
    expect(await host.evaluate(()=>(window as any).cameraRequests.length)).toBe(0);
    await start(host); await preview(host);
    expect(await cameraSenders(host)).toBe(0);
    expect(await host.getByRole('dialog').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
    expect(await host.getByRole('button',{name:'Transmitir câmera',exact:true}).evaluate(el=>el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
    expect(await viewer.locator('video[aria-label="Prévia local da câmera"]').count()).toBe(0);
    await expect(host.getByRole('button',{name:'Transmitir câmera',exact:true})).toBeVisible();
    await host.screenshot({path:info.outputPath('camera-preview.png'), animations:'disabled'});
    await host.getByRole('button',{name:'Cancelar câmera',exact:true}).click();
    await expect.poll(()=>host.evaluate(()=>(window as any).cameraTracks[0].readyState)).toBe('ended');
    await expect(host.getByRole('button',{name:'Ativar câmera',exact:true})).toBeFocused();
    // Keyboard activation also stays tied to an explicit user gesture.
    await host.getByRole('button',{name:'Ativar câmera',exact:true}).focus(); await host.keyboard.press('Enter');
    await expect(host.locator('video[aria-label="Prévia local da câmera"]')).toBeVisible();
    await expect(host.getByRole('button',{name:'Cancelar câmera',exact:true})).toBeFocused();
    const confirm=host.getByRole('button',{name:'Transmitir câmera',exact:true});
    await confirm.focus(); await expect(confirm).toBeFocused(); await host.keyboard.press('Enter');
    await expect.poll(()=>cameraSenders(host)).toBeGreaterThan(0);
    await expect.poll(()=>host.evaluate(()=>(window as any).peers.flatMap((p:RTCPeerConnection)=>p.getSenders())
      .filter((s:RTCRtpSender)=>(window as any).cameraTracks.includes(s.track))
      .every((s:RTCRtpSender)=>s.getParameters().encodings.every(e=>e.maxBitrate===400000 && e.maxFramerate===15)))).toBe(true);
    await expect(host.getByRole('dialog')).not.toBeVisible();
    await host.getByRole('button',{name:'Desligar câmera — câmera ao vivo',exact:true}).blur();
    await host.mouse.move(0,0);
    await expect(host.getByText('● Câmera ao vivo',{exact:true})).toBeVisible();
    await expect(host.locator('.mantine-Tooltip-tooltip')).not.toBeVisible();
    expect(await host.locator('.floating-dock-bar').evaluate(el=>{const r=el.getBoundingClientRect();return r.x>=0 && r.right<=innerWidth;})).toBe(true);
    await host.screenshot({path:info.outputPath('camera-live.png'), animations:'disabled'});
    expect(await host.evaluate(()=>(window as any).cameraRequests.every((r:any)=>r.activation && r.constraints.audio===false))).toBe(true);
    const late=await context.newPage(); await synthetic(late); await gotoRoom(late,'/room/camera-b');
    await expect.poll(()=>cameraSenders(host)).toBe(2);
    // Keep camera active while the native screen selector is unresolved.
    await host.evaluate(()=>{(window as any).screenDeferred=true;});
    await host.getByRole('button',{name:'Trocar tela',exact:true}).click();
    await expect(host.getByRole('button',{name:'Desligar câmera — câmera ao vivo',exact:true})).toBeVisible();
    expect(await host.evaluate(()=>(window as any).cameraTracks.at(-1).readyState)).toBe('live');
    await host.evaluate(()=>{(window as any).resolveScreen(); (window as any).screenDeferred=false;});
    await expect(host.getByText('Câmera continua ao vivo durante a troca de tela.')).toBeVisible();
    await host.screenshot({path:info.outputPath('camera-switch.png'), animations:'disabled'});
    await host.getByRole('button',{name:'Cancelar',exact:true}).click();
    await expect(host.getByRole('button',{name:'Desligar câmera — câmera ao vivo',exact:true})).toBeVisible();
    await host.getByRole('button',{name:'Trocar tela',exact:true}).click();
    await host.getByRole('button',{name:'Confirmar troca',exact:true}).click();
    await expect(host.getByRole('button',{name:'Pausar transmissão',exact:true})).toBeEnabled();
    if (mobile) await host.getByRole('button',{name:'Desligar câmera — câmera ao vivo',exact:true}).tap();
    else await host.getByRole('button',{name:'Desligar câmera — câmera ao vivo',exact:true}).click();
    await expect.poll(()=>cameraSenders(host)).toBe(0);
    expect(await host.evaluate(()=>(window as any).screenTracks.at(-1).readyState)).toBe('live');
    await publish(host); await host.getByRole('button',{name:'Pausar transmissão',exact:true}).click();
    await expect.poll(()=>host.evaluate(()=>(window as any).cameraTracks.at(-1).readyState)).toBe('ended');
    await expect(host.getByRole('button',{name:'Ativar câmera',exact:true})).toBeDisabled();
    await host.getByRole('button',{name:'Retomar transmissão',exact:true}).click();
    await publish(host);
    await host.getByRole('button',{name:'Parar compartilhamento de tela',exact:true}).click();
    await expect.poll(()=>host.evaluate(()=>(window as any).cameraTracks.at(-1).readyState)).toBe('ended');
    await context.close();
  });
}

test('webcam B: permission errors, pending cancellation and publication failure preserve screen', async ({page, context}) => {
  await synthetic(page); await gotoRoom(page,'/room/camera-failures');
  const viewer=await context.newPage(); await synthetic(viewer); await gotoRoom(viewer,'/room/camera-failures');
  await start(page);
  for (const name of ['NotAllowedError','NotFoundError','NotReadableError']) {
    await page.evaluate(name=>{(window as any).cameraError=name;},name);
    await page.getByRole('button',{name:'Ativar câmera',exact:true}).click();
    await expect(page.getByRole('button',{name:'Tentar novamente',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Cancelar câmera',exact:true}).click();
    expect(await page.evaluate(()=>(window as any).screenTracks[0].readyState)).toBe('live');
  }
  await page.evaluate(()=>{(window as any).cameraError=null;(window as any).cameraDeferred=true;});
  await page.getByRole('button',{name:'Ativar câmera',exact:true}).click();
  await expect(page.getByText(/Solicitando permissão…/)).toBeVisible();
  await page.getByRole('button',{name:'Cancelar câmera',exact:true}).click();
  await page.evaluate(()=>{(window as any).resolveCamera();(window as any).cameraDeferred=false;});
  await expect.poll(()=>page.evaluate(()=>(window as any).cameraTracks[0].readyState)).toBe('ended');
  await publish(page);
  await page.getByRole('button',{name:'Desligar câmera — câmera ao vivo',exact:true}).click();
  expect(await page.evaluate(()=>(window as any).screenTracks[0].readyState)).toBe('live');
  await preview(page);
  await page.evaluate(()=>{
    const replace=RTCRtpSender.prototype.replaceTrack;
    RTCRtpSender.prototype.replaceTrack=function(track) {
      if ((window as any).cameraTracks.includes(track)) return Promise.reject(new Error('Synthetic publication failure'));
      return replace.call(this,track);
    };
  });
  await page.getByRole('button',{name:'Transmitir câmera',exact:true}).click();
  await expect(page.getByRole('button',{name:'Tentar novamente',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).screenTracks[0].readyState)).toBe('live');
  await expect.poll(()=>cameraSenders(page)).toBe(0);
  await viewer.close();
});

test('webcam B: disconnect and pending cancellation invalidate capture', async ({page}) => {
  await synthetic(page); await gotoRoom(page,'/room/camera-session'); await start(page); await publish(page);
  const count=await page.evaluate(()=>(window as any).cameraRequests.length);
  await page.evaluate(()=>{(window as any).sockets.at(-1).close(4001, 'test interruption');});
  await expect.poll(()=>page.evaluate(()=>(window as any).cameraTracks.at(-1).readyState)).toBe('ended');
  await expect(page.getByRole('button',{name:'Ativar câmera',exact:true})).toBeEnabled();
  expect(await page.evaluate(()=>(window as any).cameraRequests.length)).toBe(count);
  await publish(page);
  await page.getByRole('button',{name:'Desligar câmera — câmera ao vivo',exact:true}).click();
  await page.evaluate(()=>{(window as any).cameraDeferred=true;});
  await page.getByRole('button',{name:'Ativar câmera',exact:true}).click();
  await page.getByRole('button',{name:'Cancelar câmera',exact:true}).click();
  await page.getByRole('button',{name:'Parar compartilhamento de tela',exact:true}).click();
  await page.evaluate(()=>{(window as any).resolveCamera();});
  await expect.poll(()=>page.evaluate(()=>(window as any).cameraTracks.at(-1).readyState)).toBe('ended');
  expect(await cameraSenders(page)).toBe(0);
});

test('webcam B: route teardown while permission is pending stops the eventual track', async ({page}) => {
  await synthetic(page); await gotoRoom(page,'/room/camera-teardown'); await start(page);
  await page.evaluate(()=>{(window as any).cameraDeferred=true;});
  await page.getByRole('button',{name:'Ativar câmera',exact:true}).click();
  await expect(page.getByText(/Solicitando permissão…/)).toBeVisible();
  // Trigger the real SPA leave handler while the synthetic native permission is unresolved.
  await page.locator('.floating-dock-bar button[aria-label="Sair da sala"]').evaluate((el:HTMLButtonElement)=>el.click());
  await expect(page).toHaveURL('/');
  await page.evaluate(()=>{(window as any).resolveCamera();});
  await expect.poll(()=>page.evaluate(()=>(window as any).cameraTracks.at(-1).readyState)).toBe('ended');
  expect(await page.evaluate(()=>(window as any).sent.filter((m:any)=>m.type==='update-camera' && m.active).length)).toBe(0);
});

test('webcam B: 320px dock with screen audio keeps all controls reachable by touch', async ({browser}, info) => {
  const context=await browser.newContext({viewport:{width:320,height:740},hasTouch:true});
  const host=await context.newPage(), viewer=await context.newPage();
  try {
    await synthetic(host); await synthetic(viewer); await gotoRoom(host,'/room/camera-small'); await gotoRoom(viewer,'/room/camera-small');
    await host.evaluate(()=>{(window as any).screenAudio=true;});
    await start(host); await publish(host);
    await expect.poll(()=>cameraSenders(host)).toBeGreaterThan(0);
    const audio=host.getByRole('button',{name:'Mutar áudio da tela',exact:true}); await expect(audio).toBeVisible();
    expect(await host.locator('.floating-dock-bar').evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0 && r.right<=innerWidth && r.bottom<=innerHeight;})).toBe(true);
    await host.getByRole('button',{name:'Desligar câmera — câmera ao vivo',exact:true}).blur(); await host.mouse.move(0,0);
    await expect(host.getByRole('dialog')).not.toBeVisible(); await expect(host.locator('.mantine-Tooltip-tooltip')).not.toBeVisible();
    await host.screenshot({path:info.outputPath('camera-audio-320.png'),animations:'disabled'});
    await host.getByRole('button',{name:'Desligar câmera — câmera ao vivo',exact:true}).tap();
    await expect.poll(()=>cameraSenders(host)).toBe(0);
    expect(await host.evaluate(()=>(window as any).sharedAudio.readyState)).toBe('live');
    await audio.tap(); expect(await host.evaluate(()=>(window as any).sharedAudio.enabled)).toBe(false);
    await host.getByRole('button',{name:'Parar compartilhamento de tela',exact:true}).tap();
    await expect.poll(()=>host.evaluate(()=>(window as any).sharedAudio.readyState)).toBe('ended');
  } finally { await context.close(); }
});


test('webcam B: native camera end, screen end and screen end during selector release camera', async ({page, browserName}) => {
  test.skip(browserName === 'firefox', 'Gecko ignores untrusted ended events; native stop/revocation requires physical verification.');
  await synthetic(page); await gotoRoom(page,'/room/camera-ended'); await start(page); await publish(page);
  await page.evaluate(()=>{const t=(window as any).cameraTracks.at(-1);t.stop();t.dispatchEvent(new Event('ended'));});
  await expect(page.getByRole('button',{name:'Tentar novamente',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>(window as any).screenTracks.at(-1).readyState)).toBe('live');
  await page.getByRole('button',{name:'Cancelar câmera',exact:true}).click();
  await publish(page);
  await page.evaluate(()=>{(window as any).screenDeferred=true;});
  await page.getByRole('button',{name:'Trocar tela',exact:true}).click();
  await page.evaluate(()=>{const t=(window as any).screenTracks.at(-1);t.stop();t.dispatchEvent(new Event('ended'));});
  await expect.poll(()=>page.evaluate(()=>(window as any).cameraTracks.at(-1).readyState)).toBe('ended');
  await page.evaluate(()=>{(window as any).resolveScreen();(window as any).screenDeferred=false;});
  await page.getByRole('button',{name:'Confirmar troca',exact:true}).click();
  await publish(page);
  await page.evaluate(()=>{const t=(window as any).screenTracks.at(-1);t.stop();t.dispatchEvent(new Event('ended'));});
  await expect.poll(()=>page.evaluate(()=>(window as any).cameraTracks.at(-1).readyState)).toBe('ended');
});
