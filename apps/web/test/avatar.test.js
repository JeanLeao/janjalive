import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatDisplayName,
  getInitials,
  getAvatarColor,
} from '../src/features/room/utils/avatar.ts';

test('avatar: formatDisplayName removes redundancy and distinguishes local vs remote', () => {
  // Remote visitor without nickname
  assert.equal(formatDisplayName(undefined, false), 'Visitante');
  assert.equal(formatDisplayName('', false), 'Visitante');

  // Local visitor without nickname
  assert.equal(formatDisplayName(undefined, true), 'Visitante (você)');
  assert.equal(formatDisplayName('', true), 'Visitante (você)');

  // Custom nickname
  assert.equal(formatDisplayName('Marina', false), 'Marina');
  assert.equal(formatDisplayName('Marina', true), 'Marina (você)');

  // Protection against redundant "Você (você)"
  assert.equal(formatDisplayName('Você', true), 'Você');
  assert.equal(formatDisplayName('você', true), 'Você');
  assert.equal(formatDisplayName('voce', true), 'Você');
  assert.equal(formatDisplayName('Você', false), 'Visitante');
});

test('avatar: getInitials generates consistent uppercase initials', () => {
  assert.equal(getInitials(), 'V');
  assert.equal(getInitials(''), 'V');
  assert.equal(getInitials('Você'), 'V');
  assert.equal(getInitials('Marina'), 'MA');
  assert.equal(getInitials('Carlos Silva'), 'CS');
  assert.equal(getInitials('Ana Paula Souza'), 'AP');
});

test('avatar: getAvatarColor returns valid color palette', () => {
  const c1 = getAvatarColor('Marina');
  assert.ok(c1.bg.startsWith('#'));
  assert.ok(c1.text.startsWith('#'));

  const c2 = getAvatarColor('Carlos');
  assert.ok(c2.bg.startsWith('#'));
  assert.ok(c2.text.startsWith('#'));
});
