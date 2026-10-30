import test from 'node:test';
import assert from 'node:assert/strict';
import { ClientMessageSchema, ServerMessageSchema, MediaSourcesSchema } from '../dist/index.js';

test('camera publication and source maps have independent validated contracts', () => {
  assert.equal(ClientMessageSchema.safeParse({ type: 'update-camera', active: true }).success, true);
  assert.equal(ClientMessageSchema.safeParse({ type: 'update-camera', active: 'true' }).success, false);
  assert.equal(ServerMessageSchema.safeParse({ type: 'camera-updated', peerId: 'presenter', active: false }).success, true);
  assert.equal(MediaSourcesSchema.safeParse([
    { mid: '0', source: 'screen-video' }, { mid: '1', source: 'camera-video' },
  ]).success, true);
  assert.equal(MediaSourcesSchema.safeParse([
    { mid: '0', source: 'screen-video' }, { mid: '0', source: 'camera-video' },
  ]).success, false);
  assert.equal(MediaSourcesSchema.safeParse([
    { mid: '0', source: 'camera-video' }, { mid: '1', source: 'camera-video' },
  ]).success, false);
  assert.equal(MediaSourcesSchema.safeParse([{ mid: '2', source: 'microphone' }]).success, false);
});
