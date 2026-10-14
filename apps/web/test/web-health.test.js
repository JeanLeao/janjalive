import test from 'node:test';
import assert from 'node:assert/strict';
import { handleWebHealth } from '../src/health.ts';

test('OPS-01: web health check handler responds with 200 and json status without SSR', async () => {
  // 1. Check /healthz-web
  const req1 = new Request('http://localhost:3001/healthz-web');
  const res1 = handleWebHealth(req1);

  assert.ok(res1 !== null, 'Handler must handle /healthz-web');
  assert.equal(res1.status, 200);
  assert.equal(res1.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(res1.headers.get('cache-control'), 'no-store');

  const data1 = await res1.json();
  assert.deepEqual(data1, { status: 'ok', service: 'web' });

  // 2. Check /health-web alias
  const req2 = new Request('http://localhost:3001/health-web');
  const res2 = handleWebHealth(req2);
  assert.ok(res2 !== null);
  assert.equal(res2.status, 200);
  const data2 = await res2.json();
  assert.deepEqual(data2, { status: 'ok', service: 'web' });

  // 3. Normal application routes must NOT be intercepted by health handler
  const req3 = new Request('http://localhost:3001/room/my-room');
  const res3 = handleWebHealth(req3);
  assert.equal(res3, null, 'Normal app paths should not be intercepted');
});
