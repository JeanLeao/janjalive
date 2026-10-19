import test from 'node:test';
import assert from 'node:assert/strict';
import { isEditableElement, isWithinNavigationContext } from '../src/features/room/hooks/useRoomShortcuts.ts';

// Mock minimal DOM element for node test environment
class MockElement {
  constructor(tagName, options = {}) {
    this.tagName = tagName.toUpperCase();
    this.isContentEditable = options.isContentEditable ?? false;
    this._closest = options.closest ?? {};
  }
  closest(selector) {
    if (this._closest[selector]) return new MockElement('div');
    for (const [key, val] of Object.entries(this._closest)) {
      if (val && selector.split(',').some(part => part.trim() === key)) {
        return new MockElement('div');
      }
    }
    return null;
  }
}

// Global HTMLElement mock if needed
if (typeof globalThis.HTMLElement === 'undefined') {
  globalThis.HTMLElement = MockElement;
}

test('isEditableElement detects inputs, textareas, selects and contenteditable elements', () => {
  assert.equal(isEditableElement(null), false);
  assert.equal(isEditableElement(new MockElement('div')), false);
  assert.equal(isEditableElement(new MockElement('button')), false);
  assert.equal(isEditableElement(new MockElement('input')), true);
  assert.equal(isEditableElement(new MockElement('textarea')), true);
  assert.equal(isEditableElement(new MockElement('select')), true);
  assert.equal(isEditableElement(new MockElement('div', { isContentEditable: true })), true);
  assert.equal(isEditableElement(new MockElement('p', { closest: { '[contenteditable="true"]': true } })), true);
});

test('isWithinNavigationContext detects menus, popovers, drawers and modals', () => {
  assert.equal(isWithinNavigationContext(null), false);
  assert.equal(isWithinNavigationContext(new MockElement('div')), false);
  assert.equal(isWithinNavigationContext(new MockElement('button')), false);
  assert.equal(isWithinNavigationContext(new MockElement('button', { closest: { '[role="menu"]': true } })), true);
  assert.equal(isWithinNavigationContext(new MockElement('div', { closest: { '.mantine-Menu-dropdown': true } })), true);
  assert.equal(isWithinNavigationContext(new MockElement('div', { closest: { '.mantine-Popover-dropdown': true } })), true);
  assert.equal(isWithinNavigationContext(new MockElement('input', { closest: { '.mantine-Drawer-content': true } })), true);
  assert.equal(isWithinNavigationContext(new MockElement('button', { closest: { '.mantine-Modal-content': true } })), true);
});

test('circular stream indexing correctly navigates streams forwards and backwards', () => {
  const streamIds = ['stream-1', 'stream-2', 'stream-3'];
  const getNext = (currentId) => {
    const idx = streamIds.indexOf(currentId);
    return streamIds[(idx + 1) % streamIds.length];
  };
  const getPrev = (currentId) => {
    const idx = streamIds.indexOf(currentId);
    return streamIds[(idx - 1 + streamIds.length) % streamIds.length];
  };

  // Next circular
  assert.equal(getNext('stream-1'), 'stream-2');
  assert.equal(getNext('stream-2'), 'stream-3');
  assert.equal(getNext('stream-3'), 'stream-1');

  // Prev circular
  assert.equal(getPrev('stream-1'), 'stream-3');
  assert.equal(getPrev('stream-3'), 'stream-2');
  assert.equal(getPrev('stream-2'), 'stream-1');
});
