import test from 'node:test';
import assert from 'node:assert/strict';
import { DiagnosticsLogger } from '../src/features/room/diagnostics/diagnostics-logger.ts';

test('diagnostics: logs events and limits entries to buffer size', () => {
  const logger = new DiagnosticsLogger(5);
  for (let i = 1; i <= 10; i++) {
    logger.log(`event-${i}`, { index: i });
  }

  const entries = logger.getEntries();
  assert.equal(entries.length, 5);
  assert.equal(entries[0].event, 'event-10');
  assert.equal(entries[4].event, 'event-6');
});

test('diagnostics: notifies subscribers on log', () => {
  const logger = new DiagnosticsLogger(10);
  let latestNotification = null;

  const unsubscribe = logger.subscribe((entries) => {
    latestNotification = entries;
  });

  logger.log('test-event', { ok: true });
  assert.equal(latestNotification.length, 1);
  assert.equal(latestNotification[0].event, 'test-event');

  unsubscribe();
  logger.log('second-event');
  assert.equal(latestNotification.length, 1, 'Unsubscribed listener should not be called');
});
