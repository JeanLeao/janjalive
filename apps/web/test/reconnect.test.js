import test from 'node:test';
import assert from 'node:assert/strict';
import { SignalingClient } from '../src/features/room/signaling/signaling-client.ts';

class ReconnectMockWebSocket {
  static OPEN = 1;
  static CONNECTING = 0;
  static CLOSING = 2;
  static CLOSED = 3;

  static instances = [];

  constructor(url) {
    this.url = url;
    this.readyState = ReconnectMockWebSocket.CONNECTING;
    this.sent = [];
    ReconnectMockWebSocket.instances.push(this);
    setTimeout(() => {
      if (this.readyState === ReconnectMockWebSocket.CONNECTING) {
        this.readyState = ReconnectMockWebSocket.OPEN;
        this.onopen?.();
      }
    }, 10);
  }

  send(data) {
    this.sent.push(JSON.parse(data));
  }

  close(code = 1000) {
    this.readyState = ReconnectMockWebSocket.CLOSED;
    this.onclose?.({ code, wasClean: true });
  }

  simulateUnexpectedClose() {
    this.readyState = ReconnectMockWebSocket.CLOSED;
    this.onclose?.({ code: 1006, wasClean: false });
  }
}

test('REL-01: client automatically reconnects with backoff upon unexpected disconnection', async () => {
  const originalWs = globalThis.WebSocket;
  globalThis.WebSocket = ReconnectMockWebSocket;
  ReconnectMockWebSocket.instances = [];

  const states = [];
  const client = new SignalingClient({
    url: 'ws://mock/signal',
    autoReconnect: true,
    initialReconnectDelayMs: 20,
    maxReconnectDelayMs: 50,
    jitterMs: 5,
    onStateChange: (st) => states.push(st),
    onMessage: () => {},
  });

  client.connect();
  await new Promise((r) => setTimeout(r, 25));
  assert.equal(client.getState(), 'connected');
  assert.equal(ReconnectMockWebSocket.instances.length, 1);

  // Simulate server crash or dropped connection
  const firstSocket = ReconnectMockWebSocket.instances[0];
  firstSocket.simulateUnexpectedClose();

  assert.equal(client.getState(), 'disconnected');

  // Wait for reconnect timer to fire
  await new Promise((r) => setTimeout(r, 60));

  // A second WebSocket instance must have been created
  assert.equal(ReconnectMockWebSocket.instances.length, 2);
  assert.equal(client.getState(), 'connected');

  client.disconnect();
  assert.equal(client.getState(), 'idle');
  globalThis.WebSocket = originalWs;
});

test('REL-01: voluntary disconnect cancels reconnection attempts and cleans up timers', async () => {
  const originalWs = globalThis.WebSocket;
  globalThis.WebSocket = ReconnectMockWebSocket;
  ReconnectMockWebSocket.instances = [];

  const client = new SignalingClient({
    url: 'ws://mock/signal',
    autoReconnect: true,
    initialReconnectDelayMs: 40,
    onStateChange: () => {},
    onMessage: () => {},
  });

  client.connect();
  await new Promise((r) => setTimeout(r, 25));

  // User voluntarily leaves room: disconnect called
  client.disconnect();
  assert.equal(client.getState(), 'idle');

  const instanceCount = ReconnectMockWebSocket.instances.length;

  // Wait past reconnect delay
  await new Promise((r) => setTimeout(r, 80));

  // No new socket should have been created
  assert.equal(ReconnectMockWebSocket.instances.length, instanceCount);
  assert.equal(client.getState(), 'idle');

  globalThis.WebSocket = originalWs;
});

test('REL-01: prevents concurrent connection attempts', async () => {
  const originalWs = globalThis.WebSocket;
  globalThis.WebSocket = ReconnectMockWebSocket;
  ReconnectMockWebSocket.instances = [];

  const client = new SignalingClient({
    url: 'ws://mock/signal',
    onStateChange: () => {},
    onMessage: () => {},
  });

  // Call connect multiple times simultaneously
  client.connect();
  client.connect();
  client.connect();

  await new Promise((r) => setTimeout(r, 25));

  // Only one socket instance should be created
  assert.equal(ReconnectMockWebSocket.instances.length, 1);

  client.disconnect();
  globalThis.WebSocket = originalWs;
});

test('REL-01 & CAP-01: terminal close codes (4000, 4009, 4403) inhibit auto-reconnect and prevent loops', async () => {
  const originalWs = globalThis.WebSocket;
  globalThis.WebSocket = ReconnectMockWebSocket;

  const testCodes = [
    { code: 4000, name: 'Superseded' },
    { code: 4009, name: 'Room full' },
    { code: 4403, name: 'Forbidden origin' },
  ];

  for (const { code } of testCodes) {
    ReconnectMockWebSocket.instances = [];
    const states = [];
    const client = new SignalingClient({
      url: 'ws://mock/signal',
      autoReconnect: true,
      initialReconnectDelayMs: 20,
      onStateChange: (st) => states.push(st),
      onMessage: () => {},
    });

    client.connect();
    await new Promise((r) => setTimeout(r, 25));
    assert.equal(client.getState(), 'connected');
    assert.equal(ReconnectMockWebSocket.instances.length, 1);

    // Simulate server closing with terminal code
    const socket = ReconnectMockWebSocket.instances[0];
    socket.close(code);

    assert.equal(client.getState(), 'disconnected');

    // Wait past the reconnect delay
    await new Promise((r) => setTimeout(r, 60));

    // Verify no new connection was attempted (reconnect inhibited)
    assert.equal(ReconnectMockWebSocket.instances.length, 1, `Code ${code} must not trigger reconnection`);
    assert.equal(client.getState(), 'disconnected');

    client.disconnect();
  }

  globalThis.WebSocket = originalWs;
});
