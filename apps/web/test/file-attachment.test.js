import React from 'react';
import test from 'node:test';
import assert from 'node:assert/strict';
import { useFileAttachment } from '../src/features/room/hooks/useFileAttachment.ts';
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

function setup(t, offer = async () => {}) {
  const calls = [];
  const manager = { offer: (...args) => { calls.push(args); return offer(...args); } };
  const clip = { blob: new Blob(['clip bytes'], { type: 'video/webm;codecs=vp8,opus' }), extension: 'webm' };
  const hook = renderHook(p => useFileAttachment(p.room, p.connected, manager, p.clip), { room: 'r', connected: true, clip });
  t.after(() => hook.unmount());
  return { hook, clip, calls };
}
test('attachment: only own clip, same Blob/MIME, explicit confirmation and no overwrite', async t => {
  const { hook, clip, calls } = setup(t);
  assert.equal(hook.current.prepareClip(clip, false), false);
  assert.equal(hook.current.prepareClip(clip, true), true);
  assert.equal(hook.current.file.blob, clip.blob);
  assert.match(hook.current.file.name, /\.webm$/);
  assert.equal(calls.length, 0);
  assert.equal(hook.current.prepareClip(clip, true), false);
  assert.equal(await hook.current.offer([]), false);
  await hook.current.offer(['peer']);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], clip.blob);
  assert.equal(hook.current.file, null);
});
for (const bytes of [20 * 1048576 - 1, 20 * 1048576, 20 * 1048576 + 1]) test(`attachment: clip boundary ${bytes}`, t => {
  const { hook } = setup(t);
  const clip = { blob: new Blob([new Uint8Array(bytes)], { type: 'video/mp4' }), extension: 'mp4' };
  assert.equal(hook.current.prepareClip(clip, true), bytes <= 20 * 1048576);
  if (bytes <= 20 * 1048576) assert.match(hook.current.file.name, /\.mp4$/);
  else assert.match(hook.current.error, /20 MiB/);
});
test('attachment: conventional draft and selection survive failed preparation and offer', async t => {
  const { hook, clip } = setup(t, async () => { throw new Error('offer failed'); });
  const file = { blob: new Blob(['normal']), name: 'normal.bin' };
  hook.current.prepare(file); hook.current.setSelected(['peer']);
  assert.equal(hook.current.prepareClip(clip, true), false);
  assert.equal(hook.current.prepare({ blob: file.blob, name: 'bad/name' }), false);
  assert.equal(hook.current.file, file);
  await hook.current.offer(['peer']);
  assert.equal(hook.current.file, file);
  assert.deepEqual(hook.current.selected, ['peer']);
  assert.match(hook.current.error, /offer failed/);
});
test('attachment: discarding preview invalidates unconfirmed clip but preserves conventional replacement', async t => {
  const { hook, clip, calls } = setup(t);
  hook.current.prepareClip(clip, true);
  hook.rerender({ clip: null });
  assert.equal(hook.current.file, null);
  await hook.current.offer(['peer']); assert.equal(calls.length, 0);
  hook.rerender({ clip }); hook.current.prepareClip(clip, true);
  hook.current.prepare({ blob: new Blob(['replacement']), name: 'replacement.bin' });
  hook.rerender({ clip: null });
  assert.equal(hook.current.file.name, 'replacement.bin');
});
for (const invalidation of ['discard', 'disconnect', 'room', 'unmount']) test(`attachment: ${invalidation} during async offer cannot restore stale state`, async t => {
  let reject;
  const { hook, clip, calls } = setup(t, () => new Promise((_, no) => { reject = no; }));
  hook.current.prepareClip(clip, true);
  const pending = hook.current.offer(['peer']);
  await hook.current.offer(['peer']); assert.equal(calls.length, 1);
  if (invalidation === 'discard') hook.rerender({ clip: null });
  if (invalidation === 'disconnect') { hook.rerender({ connected: false }); hook.rerender({ connected: true }); }
  if (invalidation === 'room') hook.rerender({ room: 'other' });
  if (invalidation === 'unmount') hook.unmount();
  reject(new Error('late failure')); await pending;
  if (invalidation !== 'unmount') { assert.equal(hook.current.file, null); assert.equal(hook.current.error, ''); assert.equal(hook.current.busy, false); }
});
test('attachment: discard after confirmation leaves offered Blob owned by F15', async t => {
  let finish;
  const { hook, clip, calls } = setup(t, () => new Promise(resolve => { finish = resolve; }));
  hook.current.prepareClip(clip, true);
  const pending = hook.current.offer(['peer']);
  hook.rerender({ clip: null });
  assert.equal(calls[0][0], clip.blob);
  finish(); await pending;
  assert.equal(hook.current.file, null);
  assert.equal(hook.current.busy, false);
});

test('attachment: obsolete offer cannot clear a new session draft or unlock its preparation', async t => {
  const pending = [];
  const { hook, clip } = setup(t, () => new Promise((resolve, reject) => pending.push({ resolve, reject })));
  hook.current.prepareClip(clip, true);
  const old = hook.current.offer(['peer']);
  hook.rerender({ connected: false }); hook.rerender({ connected: true });
  const next = { blob: new Blob(['new session']), name: 'new.bin' };
  hook.current.prepare(next);
  const fresh = hook.current.offer(['peer']);
  pending[0].reject(new Error('stale')); await old;
  assert.equal(hook.current.file, next);
  assert.equal(hook.current.busy, true);
  assert.equal(hook.current.error, '');
  pending[1].reject(new Error('current')); await fresh;
  assert.equal(hook.current.file, next);
  assert.equal(hook.current.busy, false);
  assert.equal(hook.current.error, 'current');
});
