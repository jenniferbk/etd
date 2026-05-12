import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseMenuResult {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  /** Attach to the popover container so outside-click ignores its descendants. */
  menuRef: React.RefObject<HTMLDivElement | null>;
  /** Attach to the trigger button so outside-click ignores it (the click that opened
   *  the menu shouldn't immediately close it). */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
}

/**
 * Dropdown menu state with outside-click + Escape close.
 * Both ExportMenu and MoreMenu consume this hook; each layers its own
 * arrow-key item navigation on top.
 */
export function useMenu(): UseMenuResult {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  // Outside click — close when a mousedown happens outside both the menu
  // and the trigger.
  useEffect(() => {
    if (!isOpen) return;
    function handleMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (menuRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setIsOpen(false);
    }
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [isOpen]);

  // Escape — close + return focus to the trigger.
  useEffect(() => {
    if (!isOpen) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return { isOpen, open, close, toggle, menuRef, triggerRef };
}
