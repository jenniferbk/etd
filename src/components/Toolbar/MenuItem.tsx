import { useState, forwardRef } from 'react';
import type { ComponentType } from 'react';
import { Loader2 } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { theme } from '../../utils/theme';

interface MenuItemProps {
  icon: ComponentType<LucideProps>;
  label: string;
  shortcut?: string;
  onClick: () => void;
  variant?: 'default' | 'danger';
  disabled?: boolean;
  isLoading?: boolean;
}

export const MenuItem = forwardRef<HTMLButtonElement, MenuItemProps>(function MenuItem(
  { icon: Icon, label, shortcut, onClick, variant = 'default', disabled, isLoading },
  ref,
) {
  const [isHovered, setIsHovered] = useState(false);
  const isDanger = variant === 'danger';

  return (
    <button
      ref={ref}
      role="menuitem"
      tabIndex={-1}
      onClick={onClick}
      disabled={disabled || isLoading}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left rounded-md transition-colors duration-100 ease-out disabled:opacity-40 disabled:cursor-not-allowed"
      style={{
        color: isDanger ? theme.danger.fg : theme.sidebar.text,
        backgroundColor: isHovered && !(disabled || isLoading)
          ? isDanger
            ? theme.danger.bg
            : theme.sidebar.hover
          : 'transparent',
      }}
    >
      {isLoading ? (
        <Loader2 size={16} className="animate-spin" style={{ color: theme.sidebar.accent }} />
      ) : (
        <Icon size={16} style={{ color: isDanger ? theme.danger.fg : theme.sidebar.textSecondary }} />
      )}
      <span className="flex-1">{label}</span>
      {shortcut && (
        <kbd
          className="px-1.5 py-0.5 text-[10px] rounded font-mono"
          style={{
            backgroundColor: theme.sidebar.bg,
            color: theme.sidebar.muted,
          }}
        >
          {shortcut}
        </kbd>
      )}
    </button>
  );
});
