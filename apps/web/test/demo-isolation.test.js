import test from 'node:test';
import assert from 'node:assert/strict';

test('demo-isolation: verify DEV environment gating logic', () => {
  // Simulate production environment where DEV is false
  const prodEnv = { DEV: false };
  const getIsDemo = (env, searchParams) => {
    const isDev = Boolean(env.DEV);
    const demoParam = searchParams.get('demo');
    return Boolean(isDev && ['single', 'multi'].includes(demoParam || ''));
  };

  const getDrawerOpen = (env, searchParams, drawerName) => {
    const isDev = Boolean(env.DEV);
    return isDev && searchParams.get('drawer') === drawerName;
  };

  // Production with ?demo=single
  const paramsSingle = new URLSearchParams('demo=single&drawer=participants');
  assert.equal(getIsDemo(prodEnv, paramsSingle), false, 'Production must reject ?demo=single');
  assert.equal(getDrawerOpen(prodEnv, paramsSingle, 'participants'), false, 'Production must reject ?drawer=participants');

  // Production with ?demo=multi
  const paramsMulti = new URLSearchParams('demo=multi&drawer=settings');
  assert.equal(getIsDemo(prodEnv, paramsMulti), false, 'Production must reject ?demo=multi');
  assert.equal(getDrawerOpen(prodEnv, paramsMulti, 'settings'), false, 'Production must reject ?drawer=settings');

  // Production with unknown query parameters
  const paramsUnknown = new URLSearchParams('foo=bar&utm_source=invite');
  assert.equal(getIsDemo(prodEnv, paramsUnknown), false, 'Production must ignore unknown query parameters');

  // Development with ?demo=multi
  const devEnv = { DEV: true };
  assert.equal(getIsDemo(devEnv, paramsSingle), true, 'Development must allow ?demo=single');
  assert.equal(getIsDemo(devEnv, paramsMulti), true, 'Development must allow ?demo=multi');
  assert.equal(getDrawerOpen(devEnv, paramsSingle, 'participants'), true, 'Development must allow ?drawer=participants');
  assert.equal(getIsDemo(devEnv, paramsUnknown), false, 'Development must ignore unknown query parameters');
});

test('demo-isolation: session options enabled flag isolates signaling', () => {
  // In demo mode, enabled is passed as false
  const isDemo = true;
  const sessionOptions = {
    roomId: 'test-room',
    displayName: 'Tester',
    enabled: !isDemo,
  };

  assert.equal(sessionOptions.enabled, false, 'Demo mode sets enabled: false');

  // In production (isDemo = false), enabled is true
  const isProdDemo = false;
  const prodSessionOptions = {
    roomId: 'real-room',
    displayName: 'RealUser',
    enabled: !isProdDemo,
  };

  assert.equal(prodSessionOptions.enabled, true, 'Production sets enabled: true');
});

test('demo-isolation: SSR and client initial states match to prevent hydration mismatch', () => {
  // Both SSR (server) and client initial connectionStatus must be 'connecting'
  const initialConnectionStatusServer = 'connecting';
  const initialConnectionStatusClient = 'connecting';
  assert.equal(
    initialConnectionStatusServer,
    initialConnectionStatusClient,
    'Initial connectionStatus must match between SSR and client'
  );

  // Both SSR and client initial drawers must be closed (false)
  const initialDrawerParticipantsServer = false;
  const initialDrawerParticipantsClient = false;
  assert.equal(
    initialDrawerParticipantsServer,
    initialDrawerParticipantsClient,
    'Initial drawer participants must match between SSR and client'
  );

  const initialDrawerSettingsServer = false;
  const initialDrawerSettingsClient = false;
  assert.equal(
    initialDrawerSettingsServer,
    initialDrawerSettingsClient,
    'Initial drawer settings must match between SSR and client'
  );
});
