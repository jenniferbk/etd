import { useEffect, useRef } from 'react';
import { MoreHorizontal, Settings, Info, Trash2 } from 'lucide-react';
import { IconButton } from './IconButton';
import { MenuItem } from './MenuItem';
import { useMenu } from './useMenu';
import { theme } from '../../utils/theme';

interface MoreMenuProps {
  onOpenSettings: () => void;
  onOpenAbout: () => void;
  onClear: () => void;
}

const ITEM_COUNT = 3;

export function MoreMenu({ onOpenSettings, onOpenAbout, onClear }: MoreMenuProps) {
  const { isOpen, toggle, close, menuRef, triggerRef } = useMenu();
  const activeIndexRef = useRef(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (isOpen) {
      activeIndexRef.current = 0;
      requestAnimationFrame(() => itemRefs.current[0]?.focus());
    }
  }, [isOpen]);

  function run(handler: () => void) {
    close();
    handler();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (activeIndexRef.current + 1) % ITEM_COUNT;
      activeIndexRef.current = next;
      itemRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (activeIndexRef.current - 1 + ITEM_COUNT) % ITEM_COUNT;
      activeIndexRef.current = prev;
      itemRefs.current[prev]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      activeIndexRef.current = 0;
      itemRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      activeIndexRef.current = ITEM_COUNT - 1;
      itemRefs.current[ITEM_COUNT - 1]?.focus();
    }
  }

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null;
    if (!next) return;
    if (menuRef.current?.contains(next)) return;
    if (triggerRef.current?.contains(next)) return;
    close();
  }

  return (
    <div className="relative inline-flex">
      <IconButton
        ref={triggerRef}
        onClick={toggle}
        icon={MoreHorizontal}
        tooltip="More options"
        ariaHasPopup
        ariaExpanded={isOpen}
        ariaLabel="More options"
      />

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="More options"
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="absolute right-0 rounded-lg py-1"
          style={{
            top: 'calc(100% + 4px)',
            width: 220,
            backgroundColor: theme.sidebar.surface,
            border: `1px solid ${theme.sidebar.border}`,
            boxShadow: theme.shadow.md,
            zIndex: theme.z.dropdown,
          }}
        >
          <MenuItem
            ref={(el) => { itemRefs.current[0] = el; }}
            icon={Settings}
            label="Element styles"
            onClick={() => run(onOpenSettings)}
          />
          <MenuItem
            ref={(el) => { itemRefs.current[1] = el; }}
            icon={Info}
            label="About & shortcuts"
            onClick={() => run(onOpenAbout)}
          />
          <div
            className="my-1 mx-2"
            style={{ height: 1, backgroundColor: theme.sidebar.border }}
            role="separator"
            aria-hidden="true"
          />
          <MenuItem
            ref={(el) => { itemRefs.current[2] = el; }}
            icon={Trash2}
            label="Clear diagram"
            variant="danger"
            onClick={() => run(onClear)}
          />
        </div>
      )}
    </div>
  );
}
