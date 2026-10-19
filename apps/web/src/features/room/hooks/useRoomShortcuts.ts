import { useEffect } from 'react';

export const SHORTCUTS_STORAGE_KEY = 'screen_room_shortcuts_enabled';

export function getStoredShortcutsPreference(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(SHORTCUTS_STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

export function setStoredShortcutsPreference(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, enabled ? 'true' : 'false');
  } catch {
    // ignore local storage errors
  }
}

export interface UseRoomShortcutsOptions {
  enabled?: boolean;
  onNextStream?: () => void;
  onPrevStream?: () => void;
  canCycleStreams?: boolean;
  onToggleFullscreen?: () => void;
  canFullscreen?: boolean;
  onOpenOrFocusInteractions?: () => void;
  canInteractions?: boolean;
}

export function isEditableElement(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  const tagName = target.tagName;
  if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return true;
  if (target.isContentEditable) return true;
  if (target.closest('[contenteditable="true"], [contenteditable=""], [role="textbox"], [role="searchbox"]')) return true;
  return false;
}

export function isWithinNavigationContext(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (
    target.closest(
      '[role="menu"], [role="menuitem"], [role="menuitemcheckbox"], [role="dialog"], [role="alertdialog"], .mantine-Menu-dropdown, .mantine-Popover-dropdown, .mantine-Drawer-content, .mantine-Modal-content'
    )
  ) {
    return true;
  }
  return false;
}

export function useRoomShortcuts({
  enabled = false,
  onNextStream,
  onPrevStream,
  canCycleStreams = false,
  onToggleFullscreen,
  canFullscreen = false,
  onOpenOrFocusInteractions,
  canInteractions = false,
}: UseRoomShortcutsOptions) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Avoid repeated execution on continuous keydown
      if (event.repeat) return;

      // Ignore already-handled events
      if (event.defaultPrevented) return;

      // Ignore IME composition
      if (event.isComposing || event.keyCode === 229) return;

      // Single-character shortcuts: ignore any modified keys (Alt, Ctrl, Meta, Shift)
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        return;
      }

      // Ignore if user is currently interacting with an editable field
      if (isEditableElement(event.target) || isEditableElement(document.activeElement)) {
        return;
      }

      const key = event.key.toLowerCase();

      // Check navigation context (menus, popovers, drawers, modals, dialogs)
      const inNavContext =
        isWithinNavigationContext(event.target) ||
        isWithinNavigationContext(document.activeElement);

      if (inNavContext) {
        // Special case: if inside #room-chat-panel and key is 'i', focus the chat input rather than closing
        const isChatPanel =
          (event.target instanceof HTMLElement && Boolean(event.target.closest('#room-chat-panel'))) ||
          (document.activeElement instanceof HTMLElement && Boolean(document.activeElement.closest('#room-chat-panel')));

        if (key === 'i' && isChatPanel) {
          if (canInteractions && onOpenOrFocusInteractions) {
            event.preventDefault();
            onOpenOrFocusInteractions();
          }
        }
        return;
      }

      // N: Next primary stream
      if (key === 'n') {
        if (canCycleStreams && onNextStream) {
          event.preventDefault();
          onNextStream();
        }
        return;
      }

      // P: Previous primary stream
      if (key === 'p') {
        if (canCycleStreams && onPrevStream) {
          event.preventDefault();
          onPrevStream();
        }
        return;
      }

      // F: Toggle stage fullscreen
      if (key === 'f') {
        if (canFullscreen && onToggleFullscreen) {
          event.preventDefault();
          onToggleFullscreen();
        }
        return;
      }

      // I: Open or focus interactions panel
      if (key === 'i') {
        if (canInteractions && onOpenOrFocusInteractions) {
          event.preventDefault();
          onOpenOrFocusInteractions();
        }
        return;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [
    enabled,
    onNextStream,
    onPrevStream,
    canCycleStreams,
    onToggleFullscreen,
    canFullscreen,
    onOpenOrFocusInteractions,
    canInteractions,
  ]);
}
