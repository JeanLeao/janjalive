import { useEffect } from 'react';

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
  if (target.closest('[contenteditable="true"]')) return true;
  return false;
}

export function isWithinNavigationContext(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (
    target.closest(
      '[role="menu"], [role="menuitem"], [role="menuitemcheckbox"], .mantine-Menu-dropdown, .mantine-Popover-dropdown, .mantine-Drawer-content, .mantine-Modal-content'
    )
  ) {
    return true;
  }
  return false;
}

export function useRoomShortcuts({
  enabled = true,
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

      // Ignore IME composition
      if (event.isComposing || event.keyCode === 229) return;

      // Check modifier keys: Alt + Shift (without Ctrl or Meta/Cmd)
      // On macOS, Alt is Option.
      if (!event.altKey || !event.shiftKey || event.ctrlKey || event.metaKey) {
        return;
      }

      // Ignore if user is currently interacting with an editable field
      if (isEditableElement(event.target) || isEditableElement(document.activeElement)) {
        return;
      }

      // Ignore if inside a menu, popover, or modal/drawer with its own navigation
      if (isWithinNavigationContext(event.target) || isWithinNavigationContext(document.activeElement)) {
        return;
      }

      const key = event.key.toLowerCase();
      const code = event.code;

      // Alt+Shift+N: Next primary stream
      if (code === 'KeyN' || key === 'n') {
        if (canCycleStreams && onNextStream) {
          event.preventDefault();
          onNextStream();
        }
        return;
      }

      // Alt+Shift+P: Previous primary stream
      if (code === 'KeyP' || key === 'p') {
        if (canCycleStreams && onPrevStream) {
          event.preventDefault();
          onPrevStream();
        }
        return;
      }

      // Alt+Shift+F: Toggle stage fullscreen
      if (code === 'KeyF' || key === 'f') {
        if (canFullscreen && onToggleFullscreen) {
          event.preventDefault();
          onToggleFullscreen();
        }
        return;
      }

      // Alt+Shift+I: Open or focus interactions panel
      if (code === 'KeyI' || key === 'i') {
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
