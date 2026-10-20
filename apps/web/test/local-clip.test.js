import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalClip, clipMimeType } from '../src/features/room/media/local-clip.ts';
import { CLIP_LIMITS } from '@screen-room/protocol';
class Track extends EventTarget {
  constructor(kind) { super(); this.kind = kind; this.readyState = 'live'; this.muted = false; this.enabled = true; }
  clone() { return new Track(this.kind); }
  stop() { this.readyState = 'ended'; }
}
class Stream extends EventTarget {
  constructor(tracks) { super(); this.tracks = tracks; }
  getVideoTracks() { return this.tracks.filter(t => t.kind === 'video'); }
  getAudioTracks() { return this.tracks.filter(t => t.kind === 'audio'); }
}
class Recorder {
  static isTypeSupported(mime) { return mime.startsWith('video/webm'); }
  constructor(stream, options) { this.stream = stream; this.mimeType = options.mimeType; this.state = 'inactive'; Recorder.last = this; }
  start() { this.state = 'recording'; this.onstart?.(); }
  data(blob = new Blob(['encoded'], { type: this.mimeType })) { this.ondataavailable?.({ data: blob }); }
  stop() { this.state = 'inactive'; this.data(); this.onstop?.(); }
}
function setup(t, audio = false) {
  t.mock.method(globalThis, 'setTimeout', globalThis.setTimeout); // restored by node:test
  globalThis.MediaRecorder = Recorder; globalThis.MediaStream = Stream;
  t.after(() => { delete globalThis.MediaRecorder; delete globalThis.MediaStream; });
  const video = new Track('video'), sound = new Track('audio'); const source = new Stream([video, sound]);
  const results = [], events = [];
  const clip = new LocalClip(source, audio, { started: () => events.push('start'), stopping: () => events.push('stop'), finished: (file, error) => results.push({ file, error }) });
  t.after(() => clip.dispose());
  return { clip, source, video, sound, results, events, recorder: Recorder.last };
}
test('local clip: unsupported API and partial codec support', () => {
  assert.equal(clipMimeType(), null);
  globalThis.MediaRecorder = { isTypeSupported: type => type === 'video/mp4' };
  assert.equal(clipMimeType(), 'video/mp4'); delete globalThis.MediaRecorder;
});
for (const audio of [true, false]) test(`local clip: clones selected media, audio=${audio}, coherent export and source preserved`, t => {
  const { clip, video, sound, results, events, recorder } = setup(t, audio);
  assert.equal(recorder.stream.tracks.length, audio ? 2 : 1);
  assert.notEqual(recorder.stream.tracks[0], video);
  clip.start(); recorder.data(); clip.stop(); clip.stop();
  assert.deepEqual(events, ['start', 'stop']);
  assert.equal(results.length, 1); assert.equal(results[0].file.extension, 'webm');
  assert.match(results[0].file.blob.type, /^video\/webm/);
  assert.equal(video.readyState, 'live'); assert.equal(sound.readyState, 'live');
  assert.ok(recorder.stream.tracks.every(t => t.readyState === 'ended'));
  assert.equal(recorder.ondataavailable, null);
});
test('local clip: duration maximum and cleanup', t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { clip, results } = setup(t); clip.start();
  t.mock.timers.tick(60_000); assert.equal(results.length, 1);
});
test('local clip: memory ceiling rejects oversized chunk and stops', t => {
  const { clip, recorder, results } = setup(t); clip.start();
  recorder.data({ size: CLIP_LIMITS.bytes + 1 });
  assert.equal(recorder.state, 'inactive'); assert.equal(results.length, 1);
  assert.ok(results[0].file.blob.size <= CLIP_LIMITS.bytes);
});
test('local clip: source mute stops; disposal suppresses late results', t => {
  const { clip, video, results } = setup(t); clip.start(); video.dispatchEvent(new Event('mute'));
  assert.equal(results.length, 1); assert.match(results[0].error, /interrompida/);
  clip.dispose(); video.dispatchEvent(new Event('ended')); assert.equal(results.length, 1);
});
test('local clip: finalization watchdog cleans clones', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { clip, recorder, results, video } = setup(t); clip.start(); recorder.stop = () => {};
  clip.stop(); t.mock.timers.tick(3001);
  assert.match(results[0].error, /finalizou/); assert.equal(video.readyState, 'live');
});
test('local clip: transmitter mute follows original enabled state without player changes', t => {
  const { clip, sound, recorder } = setup(t, true); clip.start();
  sound.enabled = false; clip.syncTracks();
  assert.equal(recorder.stream.getAudioTracks()[0].enabled, false);
  sound.enabled = true; clip.syncTracks();
  assert.equal(recorder.stream.getAudioTracks()[0].enabled, true);
});
test('local clip: delayed data beyond duration is discarded even when timers are suspended', t => {
  const { clip, recorder, results } = setup(t); clip.start(); recorder.data();
  const earlier = Date.now(); t.mock.method(Date, 'now', () => earlier + 61_000);
  recorder.data(); assert.equal(results.length, 1);
  assert.equal(results[0].file.blob.size, new Blob(['encoded']).size);
});
test('local clip: removal of a track invalidates the original source', t => {
  const { clip, source, results } = setup(t); clip.start(); source.dispatchEvent(new Event('removetrack'));
  assert.equal(results.length, 1);
});
test('local clip: partial clone creation failure cleans previously created clones', t => {
  const { source, video, sound } = setup(t, true);
  const clones = [];
  video.clone = () => { const clone = new Track('video'); clones.push(clone); return clone; };
  sound.clone = () => { throw new Error('clone failed'); };
  assert.throws(() => new LocalClip(source, true, { started() {}, stopping() {}, finished() {} }), /clone failed/);
  assert.equal(clones[0].readyState, 'ended'); assert.equal(video.readyState, 'live');
});
test('local clip: recorder initialization and start failures release cloned media', t => {
  const { source, video } = setup(t);
  const clones = [];
  video.clone = () => { const clone = new Track('video'); clones.push(clone); return clone; };
  globalThis.MediaRecorder = class extends Recorder { constructor() { throw new Error('encoder unavailable'); } };
  assert.throws(() => new LocalClip(source, false, { started() {}, stopping() {}, finished() {} }), /encoder unavailable/);
  assert.equal(clones[0].readyState, 'ended');
  globalThis.MediaRecorder = Recorder;
  const results = [];
  const clip = new LocalClip(source, false, { started() {}, stopping() {}, finished: (file, error) => results.push({ file, error }) });
  Recorder.last.start = () => { throw new Error('start failed'); };
  assert.throws(() => clip.start(), /start failed/);
  assert.equal(clones[1].readyState, 'ended'); assert.equal(video.readyState, 'live'); assert.equal(results.length, 1);
});
