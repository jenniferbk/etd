import type { ReactNode } from 'react';

interface ToolbarGroupProps {
  label: string;
  children: ReactNode;
}

export function ToolbarGroup({ label, children }: ToolbarGroupProps) {
  return (
    <div className="toolbar-group relative flex items-center gap-0.5">
      {children}
      <span className="toolbar-group-label" aria-hidden="true">
        {label}
      </span>
    </div>
  );
}
