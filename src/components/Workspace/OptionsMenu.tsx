import { Fragment, useEffect, useRef } from 'react';
import type { ComponentType } from 'react';
import type { LucideProps } from 'lucide-react';
import { MoreHorizontal } from 'lucide-react';
import { IconButton } from '../Toolbar/IconButton';
import { MenuItem } from '../Toolbar/MenuItem';
import { useMenu } from '../Toolbar/useMenu';
import { theme } from '../../utils/theme';

export interface OptionsMenuItem {
  icon: ComponentType<LucideProps>;
  label: string;
  onClick: () => void;
  variant?: 'danger';
  /** Draw a divider above this item. */
  separatorBefore?: boolean;
}

interface OptionsMenuProps {
  items: OptionsMenuItem[];
  tooltip: string;
  ariaLabel: string;
}

/** The ⋯ button and popover used on workspace cards, rows, and folders.
 *  Lives inside clickable cards, so it stops clicks and Enter/Space from
 *  reaching the card (Escape still bubbles to useMenu's document listener). */
export function OptionsMenu({ items, tooltip, ariaLabel }: OptionsMenuProps) {
  const { isOpen, toggle, close, menuRef, triggerRef } = useMenu();
  const activeIndexRef = useRef(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const count = items.length;

  useEffect(() => {
    if (isOpen) {
      activeIndexRef.current = 0;
      requestAnimationFrame(() => itemRefs.current[0]?.focus());
    }
  }, [isOpen]);

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    const next = e.relatedTarget as Node | null;
    if (!next) return;
    if (menuRef.current?.contains(next)) return;
    if (triggerRef.current?.contains(next)) return;
    close();
  }

  // Roving-tabindex arrow-key navigation, matching MoreMenu/AccountChip — menu
  // items render with tabIndex={-1} so Tab skips them entirely.
  function handleMenuKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const focus = (i: number) => {
      activeIndexRef.current = i;
      itemRefs.current[i]?.focus();
    };
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focus((activeIndexRef.current + 1) % count);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focus((activeIndexRef.current - 1 + count) % count);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focus(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focus(count - 1);
    } else if (e.key === 'Enter' || e.key === ' ') {
      // Let the native click-on-activation run the item, but keep the keydown
      // from reaching the card's own onKeyDown (which would open it).
      e.stopPropagation();
    }
  }

  return (
    <div className="relative inline-flex flex-shrink-0" onClick={(e) => e.stopPropagation()}>
      <IconButton
        ref={triggerRef}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') e.stopPropagation();
        }}
        icon={MoreHorizontal}
        tooltip={tooltip}
        ariaHasPopup
        ariaExpanded={isOpen}
        ariaLabel={ariaLabel}
      />

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={tooltip}
          onKeyDown={handleMenuKeyDown}
          onBlur={handleBlur}
          className="absolute right-0 rounded-lg py-1"
          style={{
            top: 'calc(100% + 4px)',
            width: 200,
            backgroundColor: theme.sidebar.surface,
            border: `1px solid ${theme.sidebar.border}`,
            boxShadow: theme.shadow.md,
            zIndex: theme.z.dropdown,
          }}
        >
          {items.map((item, i) => (
            <Fragment key={item.label}>
              {item.separatorBefore && (
                <div
                  className="my-1 mx-2"
                  style={{ height: 1, backgroundColor: theme.sidebar.border }}
                  role="separator"
                  aria-hidden="true"
                />
              )}
              <MenuItem
                ref={(el) => { itemRefs.current[i] = el; }}
                icon={item.icon}
                label={item.label}
                variant={item.variant}
                onClick={() => {
                  close();
                  item.onClick();
                }}
              />
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
