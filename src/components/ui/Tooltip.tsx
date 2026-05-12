import { useState, useRef, useCallback } from 'react';
import { theme } from '../../utils/theme';

interface TooltipProps {
  content: string;
  shortcut?: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom';
  delay?: number;
}

export function Tooltip({
  content,
  shortcut,
  children,
  position = 'bottom',
  delay = 400,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showTooltip = useCallback(() => {
    timeoutRef.current = setTimeout(() => {
      setIsVisible(true);
    }, delay);
  }, [delay]);

  const hideTooltip = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsVisible(false);
  }, []);

  const positionStyles = position === 'top'
    ? { bottom: '100%', marginBottom: '8px' }
    : { top: '100%', marginTop: '8px' };

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
    >
      {children}
      {isVisible && (
        <div
          className="tooltip-animate absolute left-1/2 -translate-x-1/2 px-2.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap pointer-events-none"
          style={{
            ...positionStyles,
            backgroundColor: theme.sidebar.surface,
            color: theme.sidebar.text,
            boxShadow: theme.shadow.md,
            border: `1px solid ${theme.sidebar.border}`,
            zIndex: theme.z.dropdown,
          }}
        >
          <div className="flex items-center gap-2">
            <span>{content}</span>
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
          </div>
          {/* Tooltip arrow */}
          <div
            className="absolute left-1/2 -translate-x-1/2 w-2 h-2 rotate-45"
            style={{
              backgroundColor: theme.sidebar.surface,
              borderColor: theme.sidebar.border,
              ...(position === 'top'
                ? { bottom: '-5px', borderRight: '1px solid', borderBottom: '1px solid' }
                : { top: '-5px', borderLeft: '1px solid', borderTop: '1px solid' }),
            }}
          />
        </div>
      )}
    </div>
  );
}
