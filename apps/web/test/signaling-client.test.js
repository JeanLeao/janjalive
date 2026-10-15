import test from 'node:test';
import assert from 'node:assert/strict';
import { SignalingClient } from '../src/features/room/signaling/signaling-client.ts';

class MockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  constructor(url) {
    this.url = url;
    this.readyState = MockWebSocket.CONNECTING;
    this.sent = [];
    setTimeout(() => {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.();
    }, 10);
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: 1000, wasClean: true });
  }

  simulateServerMessage(msg) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

globalThis.WebSocket = MockWebSocket;

test('signaling-client: manages connection lifecycle and state', async () => {
  const states = [];
  const client = new SignalingClient({
    url: 'ws://mock-server/signal',
    onStateChange: (st) => states.push(st),
    onMessage: () => {},
  });

  assert.equal(client.getState(), 'idle');
  client.connect();
  assert.equal(client.getState(), 'connecting');

  await new Promise((r) => setTimeout(r, 20));
  assert.equal(client.getState(), 'connected');

  client.disconnect();
  assert.equal(client.getState(), 'idle');
});

test('signaling-client: sends join and signal messages properly', async () => {
  let createdSocket = null;
  const originalWs = globalThis.WebSocket;
  globalThis.WebSocket = class extends MockWebSocket {
    constructor(url) {
      super(url);
      createdSocket = this;
    }
  };

  const client = new SignalingClient({
    url: 'ws://mock-server/signal',
    onStateChange: () => {},
    onMessage: () => {},
  });

  client.connect();
  await new Promise((r) => setTimeout(r, 20));

  client.join('room-xyz', 'peer-abc');
  assert.deepEqual(createdSocket.sent[0], {
    type: 'join',
    roomId: 'room-xyz',
    peerId: 'peer-abc',
  });

  client.relaySignal('peer-abc', { type: 'offer', sdp: 'fake' });
  assert.deepEqual(createdSocket.sent[1], {
    type: 'signal',
    target: 'peer-abc',
    data: { type: 'offer', sdp: 'fake' },
  });

  client.disconnect();
  globalThis.WebSocket = originalWs;
});

test('signaling-client: receives and validates server messages', async () => {
  let createdSocket = null;
  const originalWs = globalThis.WebSocket;
  globalThis.WebSocket = class extends MockWebSocket {
    constructor(url) {
      super(url);
      createdSocket = this;
    }
  };

  const received = [];
  const client = new SignalingClient({
    url: 'ws://mock-server/signal',
    onStateChange: () => {},
    onMessage: (msg) => received.push(msg),
  });

  client.connect();
  await new Promise((r) => setTimeout(r, 20));

  createdSocket.simulateServerMessage({ type: 'peers', peers: ['p1', 'p2'], count: 3 });
  createdSocket.simulateServerMessage({ type: 'peer-joined', peerId: 'p3', count: 4 });
  createdSocket.simulateServerMessage({ type: 'peer-left', peerId: 'p1', count: 3 });
  createdSocket.simulateServerMessage({ type: 'signal', from: 'p2', data: { type: 'answer', sdp: 'fake' } });

  assert.equal(received.length, 4);
  assert.equal(received[0].type, 'peers');
  assert.equal(received[1].type, 'peer-joined');
  assert.equal(received[2].type, 'peer-left');
  assert.equal(received[3].type, 'signal');

  client.disconnect();
  globalThis.WebSocket = originalWs;
});

test('signaling-client: sends update-nickname and receives peer-updated messages', async () => {
  let createdSocket = null;
  const originalWs = globalThis.WebSocket;
  globalThis.WebSocket = class extends MockWebSocket {
    constructor(url) {
      super(url);
      createdSocket = this;
    }
  };

  const received = [];
  const client = new SignalingClient({
    url: 'ws://mock-server/signal',
    onStateChange: () => {},
    onMessage: (msg) => received.push(msg),
  });

  client.connect();
  await new Promise((r) => setTimeout(r, 20));

  client.updateNickname('NovoNome');
  assert.deepEqual(createdSocket.sent[0], {
    type: 'update-nickname',
    nickname: 'NovoNome',
  });

  client.updateNickname('');
  assert.deepEqual(createdSocket.sent[1], {
    type: 'update-nickname',
    nickname: '',
  });

  createdSocket.simulateServerMessage({
    type: 'peer-updated',
    peerId: 'p3',
    nickname: 'Ana',
  });
  createdSocket.simulateServerMessage({
    type: 'peer-updated',
    peerId: 'p3',
  });

  assert.equal(received.length, 2);
  assert.deepEqual(received[0], {
    type: 'peer-updated',
    peerId: 'p3',
    nickname: 'Ana',
  });
  assert.deepEqual(received[1], {
    type: 'peer-updated',
    peerId: 'p3',
  });

  client.disconnect();
  globalThis.WebSocket = originalWs;
});

test('collaboration drops backpressure without queues and bypasses per-event React diagnostics', async t => {
  const original = globalThis.WebSocket;
  let socket;
  globalThis.WebSocket = class extends MockWebSocket {
    constructor(url) { super(url); socket = this; this.bufferedAmount = 0; }
  };
  t.after(() => { globalThis.WebSocket = original; });
  const logs = [], received = [];
  const client = new SignalingClient({ url: 'ws://mock', onStateChange() {}, onMessage: m => received.push(m), logger: { log: (...args) => logs.push(args) } });
  client.connect(); await new Promise(r => setTimeout(r, 20)); t.after(() => client.disconnect());
  logs.length = 0;
  const event = { type: 'laser', seq: 1, eventId: crypto.randomUUID(), streamId: 'capture', point: { x: .5, y: .5 } };
  assert.ok(client.send(event));
  socket.simulateServerMessage({ type: 'collaboration', roomId: 'r', peerId: 'p', timestamp: Date.now(), event });
  assert.equal(received.length, 1); assert.equal(logs.length, 0);
  socket.bufferedAmount = 32768;
  assert.equal(client.send({ ...event, seq: 2 }), false); assert.equal(socket.sent.length, 1);
  assert.ok(client.send({ type: 'send-chat', requestId: crypto.randomUUID(), text: 'chat still usable' }));
  assert.equal(socket.sent.length, 2); assert.equal(logs.length, 1);
});
