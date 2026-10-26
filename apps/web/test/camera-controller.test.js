import test from 'node:test';
import assert from 'node:assert/strict';
import { CameraController } from '../src/features/room/media/camera-controller.ts';

function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; }
function stream() {
  const track = new EventTarget(); track.readyState = 'live'; track.stops = 0;
  track.stop = () => { track.readyState = 'ended'; track.stops++; };
  return { track, getTracks: () => [track], getVideoTracks: () => [track], getAudioTracks: () => [] };
}
function fixture(overrides = {}) {
  const captured = stream(); const states=[], announcements=[], attached=[], constraints=[];
  let eligible = true;
  const controller = new CameraController({ eligible: () => eligible,
    capture: async c => { constraints.push(c); return captured; },
    attach: async s => { attached.push(s); }, stop: async () => {},
    announce: a => announcements.push(a), changed: s => states.push(s), ...overrides });
  return { controller, captured, states, announcements, attached, constraints, ineligible: () => { eligible=false; } };
}
test('camera: explicit request, local preview, manual confirmation, no audio and capped capture', async () => {
  const f = fixture();
  assert.equal(f.constraints.length, 0);
  await f.controller.request();
  assert.deepEqual(f.constraints, [{ audio:false, video:{width:{ideal:640,max:640},height:{ideal:360,max:360},frameRate:{ideal:15,max:15}} }]);
  assert.equal(f.states.at(-1).state, 'preview'); assert.equal(f.attached.length,0); assert.deepEqual(f.announcements,[]);
  await f.controller.publish(); assert.equal(f.states.at(-1).state,'live'); assert.deepEqual(f.announcements,[true]);
  f.controller.stop(); assert.equal(f.captured.track.readyState,'ended'); assert.deepEqual(f.announcements,[true,false]);
});
test('camera: ineligible participants cannot request or publish', async () => {
  const f = fixture(); f.ineligible(); await f.controller.request(); assert.equal(f.constraints.length,0);
});
for (const reason of ['cancel','pause','end screen','disconnect','unmount']) {
  test(`camera: ${reason} invalidates pending permission and ends its late tracks`, async () => {
    const pending=deferred(), f=fixture({capture:()=>pending.promise});
    const request=f.controller.request(); f.controller.stop(); pending.resolve(f.captured); await request;
    assert.equal(f.captured.track.readyState,'ended'); assert.equal(f.states.at(-1).state,'off'); assert.equal(f.attached.length,0);
  });
}
test('camera: cancel preview and native track end release capture and listener', async () => {
  const f=fixture(); await f.controller.request(); f.captured.track.dispatchEvent(new Event('ended'));
  assert.equal(f.states.at(-1).state,'error'); assert.equal(f.captured.track.readyState,'ended');
  f.controller.stop(); f.captured.track.dispatchEvent(new Event('ended')); assert.equal(f.states.at(-1).state,'off');
});
for (const name of ['NotAllowedError','NotFoundError','NotReadableError','SecurityError']) {
  test(`camera: ${name} is isolated and requires manual retry`, async () => {
    let requests=0; const f=fixture({capture:async()=>{requests++; throw new DOMException('failure',name);}});
    await f.controller.request(); assert.equal(f.states.at(-1).state,'error'); assert.equal(requests,1); assert.equal(f.attached.length,0);
  });
}
test('camera: failure of publication stops camera and never announces active', async () => {
  const f=fixture({attach:async()=>{throw new Error('failed');}}); await f.controller.request(); await f.controller.publish();
  assert.equal(f.states.at(-1).state,'error'); assert.equal(f.captured.track.readyState,'ended'); assert.ok(!f.announcements.includes(true));
});
test('camera: stop while publishing blocks late success and duplicate confirmations', async () => {
  const pending=deferred(); let attaches=0;
  const f=fixture({attach:()=>{attaches++; return pending.promise;}}); await f.controller.request();
  const publication=f.controller.publish(); await Promise.resolve(); await f.controller.publish();
  f.controller.stop(); pending.resolve(); await publication;
  assert.equal(attaches,1); assert.equal(f.states.at(-1).state,'off'); assert.ok(!f.announcements.includes(true));
});
test('camera: stale permission rejection cannot overwrite a new preview', async () => {
  const pending=deferred(); let calls=0; const fresh=stream();
  const f=fixture({capture:()=> ++calls===1 ? pending.promise : Promise.resolve(fresh)});
  const old=f.controller.request(); f.controller.stop(); await f.controller.request(); pending.reject(new Error()); await old;
  assert.equal(f.states.at(-1).state,'preview'); assert.equal(fresh.track.readyState,'live'); f.controller.stop();
});
test('camera: lost eligibility after permission disposes result; after preview blocks publication', async () => {
  const pending=deferred(); const f=fixture({capture:()=>pending.promise});
  const request=f.controller.request(); f.ineligible(); pending.resolve(f.captured); await request;
  assert.equal(f.states.at(-1).state,'off'); assert.equal(f.captured.track.readyState,'ended');
});

test('camera: announcement failure closes capture without claiming live', async () => {
  const f=fixture({announce:active=>!active}); await f.controller.request(); await f.controller.publish();
  assert.equal(f.states.at(-1).state,'error'); assert.equal(f.captured.track.readyState,'ended');
});
test('camera: duplicate requests never trigger a second permission prompt', async () => {
  const pending=deferred(); let calls=0; const f=fixture({capture:()=>{calls++;return pending.promise;}});
  const first=f.controller.request(); await f.controller.request(); assert.equal(calls,1);
  pending.resolve(f.captured); await first; await f.controller.request(); assert.equal(calls,1); f.controller.stop();
});
