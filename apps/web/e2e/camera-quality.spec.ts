import { writeFile } from 'node:fs/promises';
import { test, expect, type Page } from '@playwright/test';
import { gotoRoom } from './fixtures/rooms';
import { synthetic, dock, start, publish } from './fixtures/camera';

for (const width of [1280, 390]) test(`webcam D: sustained reduction, late viewer, suspension and manual restart ${width}px`, async ({ browser }, info) => {
  const context=await browser.newContext({ viewport:{width,height:844},hasTouch:width<500 });
  try {
    const host=await context.newPage(), viewer=await context.newPage();
    await synthetic(host); await synthetic(viewer);
    await host.addInitScript(()=>{
      const w=window as any, nativeNow=performance.now.bind(performance), interval=window.setInterval.bind(window);
      w.cameraTime=0; w.cameraCollections=0;
      const info=console.info.bind(console);
      console.info=(...args:any[])=>{if(String(args[0]).includes(' network-stats ')) w.cameraCollections++; info(...args);};
      Object.defineProperty(performance,'now',{value:()=>nativeNow()+w.cameraTime});
      window.setInterval=((fn:TimerHandler,ms?:number,...args:any[])=>{
        if(ms===3000) {w.cameraCollect=fn;return interval(()=>{},ms);}
        return interval(fn,ms,...args);
      }) as typeof window.setInterval;
    });
    await gotoRoom(host,`/room/camera-d-${width}`); await gotoRoom(viewer,`/room/camera-d-${width}`);
    await start(host); await publish(host);
    const limits=()=>host.evaluate(()=>(window as any).peers.filter((pc:RTCPeerConnection)=>pc.connectionState==='connected')
      .flatMap((pc:RTCPeerConnection)=>pc.getSenders().filter(s=>(window as any).cameraTracks.includes(s.track)).map(s=>s.getParameters().encodings[0]?.maxBitrate)));
    await expect.poll(limits).toEqual([400000]);
    await expect.poll(()=>viewer.getByTestId('stage-camera').evaluate((v:HTMLVideoElement)=>v.videoWidth)).toBeGreaterThan(0);
    const screenBefore=await host.evaluate(()=>(window as any).peers[0].getSenders().filter((s:RTCRtpSender)=>(window as any).screenTracks.includes(s.track)).map((s:RTCRtpSender)=>s.getParameters().encodings));
    const inject=async()=>host.evaluate((lowTraffic:boolean)=>{
      const w=window as any;
      for(const pc of w.peers as RTCPeerConnection[]) {
        if((pc as any).qualityInjected) continue;
        (pc as any).qualityInjected=true;
        const original=pc.getStats.bind(pc); let count=0;
        pc.getStats=async()=>{
          const reports=await original(), result=new Map(); reports.forEach((r:any)=>result.set(r.id,r));
          const sender=pc.getSenders().find(s=>w.cameraTracks.includes(s.track));
          if(sender) {
            const mid=pc.getTransceivers().find(t=>t.sender===sender)?.mid;
            const id='camera-test', n=++count, timestamp=performance.now();
            for(const [key,r] of result) if((r.type==='outbound-rtp' && r.mid===mid) || (r.type==='remote-inbound-rtp' && r.localId==='camera-test')) result.delete(key);
            result.set(id,{id,type:'outbound-rtp',kind:'video',mid,timestamp,bytesSent:n*40000,framesEncoded:n*30});
            result.set('camera-remote',{id:'camera-remote',type:'remote-inbound-rtp',kind:'video',localId:id,timestamp,packetsReceived:lowTraffic?n*18:0,packetsLost:lowTraffic?n*2:n*100,roundTripTime:.1});
          }
          return result as unknown as RTCStatsReport;
        };
      }
    },width<500);
    const tick=async(n:number)=>{for(let i=0;i<n;i++) {
      const before=await host.evaluate(()=>(window as any).cameraCollections);
      await host.evaluate(()=>{const w=window as any;w.cameraTime+=3000;w.cameraCollect();});
      await expect.poll(()=>host.evaluate(()=>(window as any).cameraCollections)).toBeGreaterThan(before);
    }};
    await inject(); await tick(width<500?6:4); expect(await limits()).toEqual([400000]);
    await tick(1); await expect.poll(limits).toEqual([220000]);
    await host.screenshot({path:info.outputPath(`reduced-${width}.png`)});
    await dock(host); await host.getByRole('button',{name:'Trocar tela',exact:true}).click();
    await expect(host.getByText('Câmera continua ao vivo durante a troca de tela.')).toBeVisible();
    expect(await limits()).toEqual([220000]);
    await host.getByRole('button',{name:'Confirmar troca',exact:true}).click();
    await expect.poll(limits).toEqual([220000]);
    const late=await context.newPage(); await synthetic(late); await gotoRoom(late,`/room/camera-d-${width}`);
    await expect.poll(limits).toEqual([220000,220000]); await inject();
    await tick(7); await expect.poll(limits).toEqual([120000,120000]);
    await tick(width<500?14:12);
    await expect(host.getByText(/Câmera suspensa por qualidade de conexão/).first()).toBeVisible();
    await expect.poll(()=>host.evaluate(()=>(window as any).cameraTracks.at(-1).readyState)).toBe('ended');
    expect(await host.evaluate(()=>(window as any).screenTracks.at(-1).readyState)).toBe('live');
    await expect(viewer.getByTestId('stage-camera')).toHaveCount(0);
    expect(await host.evaluate(()=>(window as any).sent.filter((m:any)=>m.type==='update-camera').at(-1).active)).toBe(false);
    expect(await host.evaluate(()=>(window as any).peers[0].getSenders().filter((s:RTCRtpSender)=>(window as any).screenTracks.includes(s.track)).map((s:RTCRtpSender)=>s.getParameters().encodings))).toEqual(screenBefore);
    await host.screenshot({path:info.outputPath(`suspended-${width}.png`)});
    const hide=host.getByRole('button',{name:'Ocultar controles da sala',exact:true});
    if(await hide.isVisible()) await hide.click();
    await expect(host.getByText(/Câmera suspensa por qualidade de conexão/).first()).toBeVisible();
    await tick(25); expect(await host.evaluate(()=>(window as any).cameraRequests.length)).toBe(1);
    await dock(host); await publish(host); await expect.poll(limits).toEqual([400000,400000]);
    expect(await host.evaluate(()=>(window as any).cameraRequests.length)).toBe(2);
  } finally {await context.close();}
});

async function measured(page:Page) {
  return page.evaluate(async()=>{
    const w=window as any;
    const snapshot=async()=>Promise.all(w.peers.filter((pc:RTCPeerConnection)=>pc.connectionState==='connected').map(async(pc:RTCPeerConnection)=>{
      const reports=await pc.getStats(), rows:any[]=[];
      reports.forEach((r:any)=>{
        const sender=pc.getTransceivers().find(t=>(r.mid!=null && t.mid===r.mid) || (r.trackIdentifier && t.sender.track?.id===r.trackIdentifier))?.sender;
        const source=!sender?.track ? 'unidentified' : w.cameraTracks.includes(sender.track) ? 'camera' : w.screenTracks.includes(sender.track) ? 'screen' : 'unidentified';
        if(['outbound-rtp','inbound-rtp','remote-inbound-rtp','candidate-pair'].includes(r.type)) rows.push({
          id:r.id,type:r.type,kind:r.kind,mid:r.mid,localId:r.localId,timestamp:r.timestamp,bytesSent:r.bytesSent,bytesReceived:r.bytesReceived,
          framesPerSecond:r.framesPerSecond,framesEncoded:r.framesEncoded,framesDecoded:r.framesDecoded,
          frameWidth:r.frameWidth,frameHeight:r.frameHeight,packetsLost:r.packetsLost,packetsReceived:r.packetsReceived,
          roundTripTime:r.roundTripTime,currentRoundTripTime:r.currentRoundTripTime,qualityLimitationReason:r.qualityLimitationReason,
          source:r.type==='outbound-rtp' ? source : undefined,
        });
      }); return rows;
    }));
    const before=await snapshot(); await new Promise(r=>setTimeout(r,6000)); const after=await snapshot();
    return {before,after,connections:w.peers.filter((pc:RTCPeerConnection)=>pc.connectionState==='connected').length};
  });
}

test('webcam D: ten participants and two presenters measure real local WebRTC with synthetic capture', async ({browser},info)=>{
  test.setTimeout(180000);
  const contexts=await Promise.all(Array.from({length:10},()=>browser.newContext()));
  try {
    const pages=await Promise.all(contexts.map(c=>c.newPage())); await Promise.all(pages.map(synthetic));
    for(const page of pages) await gotoRoom(page,'/room/camera-d-load');
    for(const host of pages.slice(0,2)) {await start(host);await publish(host);}
    await Promise.all(pages.slice(0,2).map(host=>expect.poll(()=>host.evaluate(()=>(window as any).peers.filter((pc:RTCPeerConnection)=>pc.connectionState==='connected').length),{timeout:30000}).toBe(9)));
    await expect.poll(()=>pages[9].locator('video').evaluateAll(videos=>videos.filter(v=>(v as HTMLVideoElement).videoWidth>0).length),{timeout:30000}).toBeGreaterThanOrEqual(2);
    await Promise.all(pages.map((page,index)=>expect.poll(()=>page.evaluate(async()=>{
      let decoded=0;
      for(const pc of (window as any).peers as RTCPeerConnection[]) {
        if(pc.connectionState!=='connected') continue;
        (await pc.getStats()).forEach((r:any)=>{if(r.type==='inbound-rtp' && r.kind==='video' && r.framesDecoded>0) decoded++;});
      }
      return decoded;
    }),{timeout:30000}).toBe(index<2?2:4)));
    const measurements=await Promise.all(pages.map(measured));
    // Preserve native measurements even if a later assertion fails.
    await writeFile(info.outputPath('measurements.json'), JSON.stringify(measurements,null,2));
    for (const [index, measurement] of measurements.entries()) {
      const before=new Map(measurement.before.flat().map((r:any)=>[r.id,r]));
      const video=measurement.after.flat().filter((r:any)=>r.type==='inbound-rtp' && r.kind==='video');
      expect(video.length).toBe(index<2?2:4);
      for (const report of video) expect(report.framesDecoded).toBeGreaterThan((before.get(report.id) as any)?.framesDecoded ?? 0);
    }
    await info.attach('local-webrtc-synthetic-sources-10-participants.json',{body:JSON.stringify(measurements,null,2),contentType:'application/json'});
    for(const host of pages.slice(0,2)) expect(await host.evaluate(()=>(window as any).screenTracks.at(-1).readyState)).toBe('live');
  } finally {await Promise.all(contexts.map(c=>c.close()));}
});
