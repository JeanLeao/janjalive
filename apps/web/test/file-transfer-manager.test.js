import test from 'node:test';
import assert from 'node:assert/strict';
import { FileTransferManager, sha256 } from '../src/features/room/files/file-transfer-manager.ts';
class Channel extends EventTarget {
  readyState = 'open'; bufferedAmount = 0; sent = []; bufferedAmountLowThreshold = 0;
  send(data) { this.sent.push(data); this.other?.dispatchEvent(new MessageEvent('message', { data: data instanceof Uint8Array ? data.buffer : data })); }
  close() { this.readyState = 'closed'; this.dispatchEvent(new Event('close')); }
}
async function setup(t, incoming = true) {
  const sent = [], snapshots = []; const channel = new Channel();
  const manager = new FileTransferManager({ send: m => { sent.push(m); return true; }, channel: () => channel, changed: d => snapshots.push(d) });
  manager.setReady(true); manager.bind('peer', channel); t.after(() => manager.reset());
  const blob = new Blob([new Uint8Array([0, 255, 13, 10])]);
  const file = { name: 'x.html', mime: 'text/html', size: blob.size, sha256: await sha256(blob) }; const id = crypto.randomUUID();
  if (incoming) manager.receive({ type: 'file-event', id, from: 'peer', to: 'self', action: 'request', file }, 'self');
  return { manager, sent, snapshots, channel, file, id, blob, current: () => snapshots.at(-1)?.[0], accept: () => {
    manager.accept(id); manager.receive({ type: 'file-event', id, from: 'self', to: 'peer', action: 'accept' }, 'self');
  } };
}
function frame(id, offset, bytes) { const frame = new Uint8Array(40 + bytes.length); frame.set(new TextEncoder().encode(id)); new DataView(frame.buffer).setUint32(36, offset); frame.set(bytes, 40); return frame.buffer; }
const data = (channel, value) => channel.dispatchEvent(new MessageEvent('message', { data: value }));
const tick = () => new Promise(resolve => setTimeout(resolve, 20));
test('files: reject bytes before explicit consent and discard incomplete buffers', async t => {
  const { channel, id, current } = await setup(t);
  data(channel, frame(id, 0, [1])); await tick(); assert.equal(current().state, 'cancelled'); assert.equal(current().download, undefined);
});
test('files: validate ordered bytes, exact size and SHA; only download after verified receiver completion', async t => {
  const { channel, id, current, accept, sent, manager } = await setup(t); accept();
  data(channel, frame(id, 0, [0, 255])); data(channel, frame(id, 2, [13, 10]));
  assert.equal(current().state, 'transferring'); assert.equal(current().download, undefined);
  data(channel, JSON.stringify({ type: 'end', id })); await tick();
  assert.equal(sent.at(-1).action, 'complete');
  manager.receive({ type: 'file-event', id, from: 'self', to: 'peer', action: 'complete' }, 'self');
  assert.equal(current().state, 'complete'); assert.equal(current().download.type, 'application/octet-stream');
  assert.deepEqual([...new Uint8Array(await current().download.arrayBuffer())], [0, 255, 13, 10]);
  manager.dismiss(id); assert.equal(current(), undefined);
});
for (const mode of ['offset', 'oversize', 'hash', 'truncated']) test(`files: rejects ${mode} and releases download`, async t => {
  const { channel, id, current, accept } = await setup(t); accept();
  data(channel, frame(id, mode === 'offset' ? 1 : 0, mode === 'oversize' ? [1, 2, 3, 4, 5] : mode === 'truncated' ? [1] : [1, 2, 3, 4]));
  if (['hash', 'truncated'].includes(mode)) data(channel, JSON.stringify({ type: 'end', id }));
  await tick(); assert.equal(current().state, 'error'); assert.equal(current().download, undefined);
});
test('files: backpressure waits, cancellation releases the waiting sender and stale events cannot resume', async t => {
  const { manager, channel, sent, current } = await setup(t, false);
  await manager.offer(new Blob([new Uint8Array(200_000)]), 'x', ['peer']); const id = sent[0].id;
  channel.bufferedAmount = 256 * 1024;
  manager.receive({ type: 'file-event', id, from: 'peer', to: 'self', action: 'accept' }, 'self'); await tick();
  assert.equal(channel.sent.length, 0);
  channel.bufferedAmount = 0; channel.dispatchEvent(new Event('bufferedamountlow')); await tick();
  assert.ok(channel.sent.length > 0); assert.ok(channel.sent.every(f => f.byteLength <= 16 * 1024 + 40));
  manager.cancel(id); const count = channel.sent.length; await tick(); assert.equal(channel.sent.length, count);
  manager.receive({ type: 'file-event', id, from: 'peer', to: 'self', action: 'accept' }, 'self'); assert.equal(current().state, 'cancelled');
});
test('files: request expiry, disconnect, reset and no stale hash continuation', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { manager, id, current } = await setup(t); t.mock.timers.tick(60_001); assert.equal(current().state, 'error');
  manager.receive({ type: 'file-event', id, from: 'self', to: 'peer', action: 'accept' }, 'self'); assert.equal(current().state, 'error');
  manager.reset(); assert.equal(current(), undefined);
  const pending = manager.offer(new Blob(['x']), 'x', ['peer']); manager.setReady(false); await pending; assert.equal(current(), undefined);
});

test('files: accepted receive slots are bounded and zero-byte files still require verified end', async t => {
  const { manager, channel, id, current, file, snapshots } = await setup(t);
  manager.accept(id);
  const second = crypto.randomUUID(), third = crypto.randomUUID();
  for (const next of [second, third]) manager.receive({ type: 'file-event', id: next, from: 'peer', to: 'self', action: 'request', file }, 'self');
  manager.accept(second); assert.throws(() => manager.accept(third), /limite: 2/);
  manager.cancel(id); manager.accept(third); assert.equal(snapshots.at(-1).filter(d => d.state === 'queued').length, 2);
  manager.reset();
  const empty = { ...file, size: 0, sha256: await sha256(new Blob([])) }; const zero = crypto.randomUUID();
  manager.receive({ type: 'file-event', id: zero, from: 'peer', to: 'self', action: 'request', file: empty }, 'self');
  manager.bind('peer', channel); manager.accept(zero);
  manager.receive({ type: 'file-event', id: zero, from: 'self', to: 'peer', action: 'accept' }, 'self');
  assert.equal(current().download, undefined);
  data(channel, JSON.stringify({ type: 'end', id: zero })); await tick();
  manager.receive({ type: 'file-event', id: zero, from: 'self', to: 'peer', action: 'complete' }, 'self');
  assert.equal(current().download.size, 0); assert.equal(current().state, 'complete');
});

test('files: in-flight frames after individual cancellation preserve other deliveries on the shared channel', async t => {
  const { manager, channel, id, accept, snapshots, file } = await setup(t); accept();
  const second = crypto.randomUUID();
  manager.receive({ type: 'file-event', id: second, from: 'peer', to: 'self', action: 'request', file }, 'self'); manager.accept(second);
  manager.receive({ type: 'file-event', id: second, from: 'self', to: 'peer', action: 'accept' }, 'self');
  manager.cancel(id); manager.dismiss(id); data(channel, frame(id, 0, [0, 255])); data(channel, JSON.stringify({ type: 'end', id }));
  data(channel, frame(second, 0, [0, 255, 13, 10])); data(channel, JSON.stringify({ type: 'end', id: second })); await tick();
  assert.equal(channel.readyState, 'open');
  manager.receive({ type: 'file-event', id: second, from: 'self', to: 'peer', action: 'complete' }, 'self');
  assert.equal(snapshots.at(-1).find(d => d.id === second).state, 'complete');
});

test('files: connection queue and receive inactivity expire without retaining partial downloads', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { manager, channel, id, accept, current, file } = await setup(t); accept();
  t.mock.timers.tick(599_999); assert.equal(current().state, 'queued');
  data(channel, frame(id, 0, [0])); assert.equal(current().state, 'transferring');
  t.mock.timers.tick(30_001); assert.equal(current().state, 'error'); assert.equal(current().download, undefined);
  const next = crypto.randomUUID(); manager.dismiss(id);
  manager.receive({ type: 'file-event', id: next, from: 'peer', to: 'self', action: 'request', file }, 'self'); manager.accept(next);
  manager.receive({ type: 'file-event', id: next, from: 'self', to: 'peer', action: 'accept' }, 'self');
  t.mock.timers.tick(600_001); assert.equal(current().state, 'error'); assert.equal(current().download, undefined);
});

test('files: explicit consent accepts ordered bytes before the WebSocket acceptance echo, without early download', async t => {
  const { manager, channel, id, current, sent } = await setup(t);
  manager.accept(id);
  data(channel, frame(id, 0, [0, 255, 13, 10])); data(channel, JSON.stringify({ type: 'end', id })); await tick();
  assert.equal(current().state, 'verifying'); assert.equal(current().download, undefined);
  assert.equal(sent.at(-1).action, 'complete');
  manager.receive({ type: 'file-event', id, from: 'self', to: 'peer', action: 'accept' }, 'self');
  assert.equal(current().state, 'verifying'); assert.equal(current().download, undefined);
  manager.receive({ type: 'file-event', id, from: 'self', to: 'peer', action: 'complete' }, 'self');
  assert.equal(current().state, 'complete'); assert.equal(current().download.size, 4);
});

test('files: a connecting sender times out independently from the longer accepted delivery queue', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { manager, channel, sent, current } = await setup(t, false);
  channel.readyState = 'connecting'; await manager.offer(new Blob(['x']), 'x', ['peer']);
  const id = sent[0].id;
  manager.receive({ type: 'file-event', id, from: 'peer', to: 'self', action: 'accept' }, 'self');
  t.mock.timers.tick(30_001); assert.equal(current().state, 'error'); assert.equal(channel.sent.length, 0);
});
