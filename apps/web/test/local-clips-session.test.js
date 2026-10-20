import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { useLocalClips } from '../src/features/room/hooks/useLocalClips.ts';

function renderHook(hookFn, initialProps) {
  let currentProps = initialProps;
  const states = [];
  const refs = [];
  const effects = [];
  let result;
  let isMounted = true;
  let isRendering = false;
  let dirty = false;

  let statesIdx = 0;
  let refsIdx = 0;
  let effectsIdx = 0;

  const dispatcher = {
    useState(init) {
      const idx = statesIdx++;
      if (!(idx in states)) {
        states[idx] = typeof init === 'function' ? init() : init;
      }
      const setState = (val) => {
        if (!isMounted) return;
        const next = typeof val === 'function' ? val(states[idx]) : val;
        if (!Object.is(states[idx], next)) {
          states[idx] = next;
          if (isRendering) {
            dirty = true;
          } else {
            render();
          }
        }
      };
      return [states[idx], setState];
    },
    useRef(init) {
      const idx = refsIdx++;
      if (!(idx in refs)) {
        refs[idx] = { current: init };
      }
      return refs[idx];
    },
    useEffect(create, deps) {
      const idx = effectsIdx++;
      const prev = effects[idx];
      const changed =
        !prev ||
        !deps ||
        !prev.deps ||
        deps.length !== prev.deps.length ||
        deps.some((d, i) => !Object.is(d, prev.deps[i]));
      effects[idx] = { create, deps, cleanup: prev?.cleanup, changed };
    },
  };

  function flushEffects() {
    for (const ef of effects) {
      if (ef.changed) {
        ef.changed = false;
        if (typeof ef.cleanup === 'function') ef.cleanup();
        ef.cleanup = ef.create();
      }
    }
  }

  function render() {
    isRendering = true;
    do {
      dirty = false;
      statesIdx = 0;
      refsIdx = 0;
      effectsIdx = 0;
      const internals =
        React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
      const prevH = internals.H;
      internals.H = dispatcher;
      try {
        result = hookFn(currentProps);
      } finally {
        internals.H = prevH;
      }
      flushEffects();
    } while (dirty);
    isRendering = false;
  }

  render();

  return {
    get current() {
      return result;
    },
    rerender(nextProps) {
      currentProps = { ...currentProps, ...nextProps };
      render();
    },
    unmount() {
      isMounted = false;
      for (const ef of effects) {
        if (typeof ef.cleanup === 'function') {
          ef.cleanup();
          ef.cleanup = undefined;
        }
      }
    },
  };
}

function setup(t) {
  const hook = renderHook(() => useLocalClips('room'));
  t.after(() => hook.unmount());
  const sent = [], client = { send: message => { sent.push(message); return true; } };
  const permission = { presenterId: 'p', streamId: 'capture', version: 1, allowed: true };
  const snapshot = { type: 'clips-snapshot', roomId: 'room', revision: 1, permissions: [permission], recordings: [] };
  const target = { peerId: 'p', streamId: 'capture', isSharing: true, isLocal: false };
  const source = {};
  hook.current.receive({ type: 'peers' }, client); hook.current.receive(snapshot, client);
  return { hook, sent, client, permission, snapshot, target, source };
}
test('clip session: revocation invalidates pending grant and ignores late success', t => {
  const { hook, sent, client, snapshot, target, source, permission } = setup(t);
  hook.current.start(target, source, false);
  const request = sent.at(-1);
  assert.equal(hook.current.status, 'pending');
  hook.current.receive({ ...snapshot, revision: 2, permissions: [{ ...permission, allowed: false, version: 2 }] }, client);
  assert.equal(hook.current.status, 'idle'); assert.equal(sent.at(-1).action, 'stop');
  hook.current.receive({ type: 'clip-result', recordingId: request.recordingId, ok: true, message: 'ok' }, client);
  assert.equal(hook.current.status, 'idle'); assert.equal(hook.current.file, null);
});
test('clip session: disconnect clears pending operations; reconnect never starts old grant', t => {
  const { hook, sent, client, snapshot, target, source } = setup(t);
  hook.current.start(target, source, false); const id = sent.at(-1).recordingId;
  hook.current.reset();
  hook.current.receive({ type: 'peers' }, client); hook.current.receive(snapshot, client);
  hook.current.receive({ type: 'clip-result', recordingId: id, ok: true, message: 'ok' }, client);
  assert.equal(hook.current.status, 'idle'); assert.equal(hook.current.file, null);
});
test('clip session: stale and other-room snapshots cannot restore revoked consent', t => {
  const { hook, client, snapshot } = setup(t);
  hook.current.receive({ ...snapshot, revision: 5, permissions: [] }, client);
  hook.current.receive({ ...snapshot, revision: 4 }, client);
  hook.current.receive({ ...snapshot, roomId: 'other', revision: 6 }, client);
  assert.deepEqual(hook.current.snapshot.permissions, []);
});
test('clip session: pending timeout cancels grant and no duplicate recording can be requested', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { hook, sent, client, target, source } = setup(t);
  hook.current.start(target, source, false); hook.current.start(target, source, true);
  assert.equal(sent.filter(s => s.action === 'request').length, 1);
  const request = sent[0];
  t.mock.timers.tick(5001); assert.equal(hook.current.status, 'idle');
  hook.current.receive({ type: 'clip-result', recordingId: request.recordingId, ok: true, message: 'ok' }, client);
  assert.equal(hook.current.status, 'idle');
});
test('clip session: server denial is explicit and no local recorder starts', t => {
  const { hook, sent, client, target, source } = setup(t);
  hook.current.start(target, source, false);
  hook.current.receive({ type: 'clip-result', recordingId: sent[0].recordingId, ok: false, message: 'Sem permissão.' }, client);
  assert.equal(hook.current.notice, 'Sem permissão.'); assert.equal(hook.current.status, 'idle');
});
