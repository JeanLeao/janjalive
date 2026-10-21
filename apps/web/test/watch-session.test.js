import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { useWatchParty } from '../src/features/room/hooks/useWatchParty.ts';

function renderHook(hookFn, initialProps) {
  let currentProps = initialProps;
  const states = [];
  const refs = [];
  const effects = [];
  const memos = [];
  let memoIdx = 0;
  let result;
  let isMounted = true;
  let isRendering = false;
  let dirty = false;

  let statesIdx = 0;
  let refsIdx = 0;
  let effectsIdx = 0;

  const dispatcher = {
    useMemo(create, deps) {
      const idx = memoIdx++; const previous = memos[idx];
      if (!previous || deps.some((v, i) => !Object.is(v, previous.deps[i]))) memos[idx] = { value: create(), deps };
      return memos[idx].value;
    },
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
      memoIdx = 0;
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
const id = '628e19de-801e-4513-b27e-19f3df97c641';
const state = { sessionId: id, controllerId: 'self', file: { name: 'x.webm', mime: 'video/webm', size: 1, sha256: 'a'.repeat(64) }, duration: 60, position: 0, playing: false, referenceTime: 0 };
function setup(t) {
  const sent = [], released = [];
  const files = { releaseWatch: id => released.push(id), verifiedBlob: () => undefined };
  const send = m => { sent.push(m); return true; };
  const hook = renderHook(() => useWatchParty('room', files, [], send, [{ peerId: 'self', isLocal: true }]));
  t.after(() => hook.unmount());
  hook.current.receive({ type: 'peers', serverTime: 1000, watch: { type: 'watch-snapshot', roomId: 'room', serverTime: 1000, revision: 1, state } });
  return { hook, sent, released };
}
test('watch session: old/wrong-room state ignored; pending commands serialized and released on end', t => {
  const { hook, sent, released } = setup(t);
  hook.current.command('play'); const command = sent.at(-1);
  assert.equal(command.revision, 1); assert.equal(hook.current.pending, true);
  hook.current.command('seek', 3); assert.equal(sent.at(-1), command);
  hook.current.receive({ type: 'watch-snapshot', roomId: 'room', revision: 0, serverTime: 0, state: null });
  hook.current.receive({ type: 'watch-snapshot', roomId: 'other', revision: 4, serverTime: 0, state: null });
  assert.equal(hook.current.state.sessionId, id);
  hook.current.receive({ type: 'watch-result', requestId: 'other', ok: true, message: 'ok' }); assert.equal(hook.current.pending, true);
  hook.current.receive({ type: 'watch-result', requestId: command.requestId, ok: true, message: 'ok' }); assert.equal(hook.current.pending, false);
  hook.current.receive({ type: 'watch-snapshot', roomId: 'room', revision: 2, serverTime: 1000, state: null });
  assert.equal(hook.current.state, null); assert.deepEqual(released, [id]);
});
test('watch session: disconnect drops pending commands; old confirmations never restore a session', t => {
  const { hook, sent } = setup(t);
  hook.current.command('play'); const command = sent.at(-1);
  hook.current.reset(); assert.equal(hook.current.state, null); assert.equal(hook.current.pending, false);
  hook.current.receive({ type: 'watch-snapshot', roomId: 'room', revision: 5, serverTime: 1000, state });
  assert.equal(hook.current.state, null);
  hook.current.receive({ type: 'watch-result', requestId: command.requestId, ok: true, message: 'ok' });
  assert.equal(hook.current.state, null);
});

test('watch session: disconnect during metadata preparation releases the element/URL and never creates a session', async t => {
  const oldDocument = globalThis.document;
  const video = { canPlayType: () => 'probably', pause() { this.paused = true; }, removeAttribute() {}, load() { this.cleaned = true; } };
  globalThis.document = { createElement: () => video };
  t.after(() => { if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument; });
  const revoked = [];
  t.mock.method(URL, 'createObjectURL', () => 'blob:pending');
  t.mock.method(URL, 'revokeObjectURL', url => revoked.push(url));
  const sent = [];
  const hook = renderHook(() => useWatchParty('room', { releaseWatch() {} }, [], m => { sent.push(m); return true; }, []));
  t.after(() => hook.unmount());
  const pending = hook.current.create(new File(['x'], 'pending.webm', { type: 'video/webm' }));
  assert.equal(hook.current.busy, true);
  hook.current.reset(); await pending;
  assert.deepEqual(revoked, ['blob:pending']); assert.equal(video.cleaned, true); assert.equal(video.paused, true);
  assert.equal(hook.current.busy, false); assert.equal(hook.current.state, null); assert.deepEqual(sent, []);
});

test('watch session: readiness is bounded to the current session and reset with connection state', t => {
  const { hook, sent } = setup(t);
  hook.current.receive({ type: 'watch-readiness-updated', roomId: 'room', sessionId: 'old', peerId: 'viewer', status: 'ready' });
  assert.deepEqual(hook.current.availability, {});
  hook.current.receive({ type: 'watch-readiness-updated', roomId: 'room', sessionId: id, peerId: 'viewer', status: 'blocked' });
  assert.equal(hook.current.availability.viewer, 'blocked');
  hook.current.reportStatus('ready'); const last = sent.at(-1);
  hook.current.reportStatus('ready'); assert.equal(sent.at(-1), last);
  hook.current.reset(); assert.deepEqual(hook.current.availability, {});
});

test('watch session: replacement announcements coalesce, serialize offers and do not retry failures', async t => {
  const oldDocument = globalThis.document;
  const video = { canPlayType: () => 'probably', duration: 60, videoWidth: 320, videoHeight: 180,
    set src(_) { queueMicrotask(() => this.onloadeddata?.()); }, pause() {}, removeAttribute() {}, load() {} };
  globalThis.document = { createElement: () => video };
  t.after(() => { if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument; });
  const offers = [];
  let finish;
  const files = { releaseWatch() {}, offer: (...args) => { offers.push(args); return new Promise(resolve => { finish = resolve; }); } };
  const participants = [{ peerId: 'self', isLocal: true }, { peerId: 'viewer', isLocal: false }];
  const hook = renderHook(() => useWatchParty('room', files, [], () => true, participants));
  t.after(() => hook.unmount());
  await hook.current.create(new File(['x'], 'x.webm', { type: 'video/webm' }));
  hook.current.receive({ type: 'peers', watch: { revision: 1, state }, serverTime: 1000 });
  assert.equal(offers.length, 1);
  const joined = { type: 'peer-joined', peerId: 'viewer', count: 2 };
  hook.current.receive(joined); hook.current.receive(joined);
  assert.equal(offers.length, 1, 'no concurrent offer while preparation is pending');
  finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(offers.length, 2, 'one queued replacement offer for repeated announcements');
  finish(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(offers.length, 2, 'settling does not start another offer');
  files.offer = async () => { offers.push('failed'); throw new Error('F15 busy'); };
  hook.current.receive(joined);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(offers.length, 3);
  hook.rerender({});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(offers.length, 3, 'F15 rejection requires explicit retry');
  assert.equal(hook.current.error, 'F15 busy');
});
