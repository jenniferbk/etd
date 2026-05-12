import { useState, forwardRef } from 'react';
import type { ComponentType } from 'react';
import { Loader2 } from 'lucide-react';
import type { LucideProps } from 'lucide-react';
import { theme } from '../../utils/theme';
import { Tooltip } from '../ui/Tooltip';

interface IconButtonProps {
  onClick: () => void;
  disabled?: boolean;
  icon: ComponentType<LucideProps>;
  tooltip: string;
  shortcut?: string;
  variant?: 'danger';
  isActive?: boolean;
  isLoading?: boolean;
  ariaHasPopup?: boolean;
  ariaExpanded?: boolean;
  ariaLabel?: string;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    onClick,
    disabled,
    icon: Icon,
    tooltip,
    shortcut,
    variant,
    isActive,
    isLoading,
    ariaHasPopup,
    ariaExpanded,
    ariaLabel,
  },
  ref,
) {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <Tooltip content={tooltip} shortcut={shortcut}>
      <button
        ref={ref}
        onClick={onClick}
        disabled={disabled || isLoading}
        aria-label={ariaLabel ?? tooltip}
        aria-haspopup={ariaHasPopup ? 'menu' : undefined}
        aria-expanded={ariaHasPopup ? ariaExpanded : undefined}
        className="w-9 h-9 flex items-center justify-center rounded-lg transition-all duration-150 ease-out disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100"
        style={{
          color:
            variant === 'danger' && isHovered
              ? theme.danger.fg
              : theme.sidebar.text,
          backgroundColor: isActive
            ? theme.sidebar.surfaceHover
            : isHovered
              ? variant === 'danger'
                ? theme.danger.bg
                : theme.sidebar.surfaceHover
              : 'transparent',
          transform: isHovered && !disabled ? 'scale(1.05)' : 'scale(1)',
        }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {isLoading ? (
          <Loader2 size={18} className="animate-spin" style={{ color: theme.sidebar.accent }} />
        ) : (
          <Icon size={18} />
        )}
      </button>
    </Tooltip>
  );
});
