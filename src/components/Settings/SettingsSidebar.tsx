import type { StyleConfig } from '../../types';
import type { SettingsSelection } from './SettingsModal';
import { theme } from '../../utils/theme';

interface SettingsSidebarProps {
  config: StyleConfig;
  selection: SettingsSelection;
  onSelect: (sel: SettingsSelection) => void;
}

const ARGUMENT_TYPES = ['data', 'claim', 'warrant', 'backing', 'qualifier', 'rebuttal'] as const;
const SUPPORT_TYPES = ['action', 'question', 'other'] as const;

export function SettingsSidebar({ config, selection, onSelect }: SettingsSidebarProps) {
  const isSelected = (sel: SettingsSelection): boolean => {
    if (sel.kind !== selection.kind) return false;
    if (sel.kind === 'subtypes') return true;
    if (sel.kind === 'argument' && selection.kind === 'argument') return sel.type === selection.type;
    if (sel.kind === 'support'  && selection.kind === 'support')  return sel.type === selection.type;
    return false;
  };

  const rowClass = (active: boolean) =>
    `w-full text-left px-3 py-2 text-sm rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${active ? '' : 'sidebar-row-hover'}`;

  const rowStyle = (active: boolean) => ({
    backgroundColor: active ? theme.sidebar.surfaceHover : 'transparent',
    color: active ? theme.sidebar.text : theme.sidebar.textSecondary,
    outlineColor: theme.focus.ring,
  });

  return (
    <div
      className="w-56 border-r overflow-y-auto py-4"
      style={{ borderColor: theme.sidebar.border, backgroundColor: theme.sidebar.bg }}
    >
      <div className="px-3 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.sidebar.muted }}>
          Arguments
        </span>
      </div>
      {ARGUMENT_TYPES.map((type) => {
        const sel: SettingsSelection = { kind: 'argument', type };
        const active = isSelected(sel);
        return (
          <button
            key={type}
            onClick={() => onSelect(sel)}
            className={rowClass(active)}
            style={rowStyle(active)}
          >
            {config.argumentTypes[type].label}
          </button>
        );
      })}

      <div className="px-3 mt-4 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.sidebar.muted }}>
          Supports
        </span>
      </div>
      {SUPPORT_TYPES.map((type) => {
        const sel: SettingsSelection = { kind: 'support', type };
        const active = isSelected(sel);
        return (
          <button
            key={type}
            onClick={() => onSelect(sel)}
            className={rowClass(active)}
            style={rowStyle(active)}
          >
            {config.supportTypes[type].label}
          </button>
        );
      })}

      <div className="px-3 mt-4 mb-2">
        <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: theme.sidebar.muted }}>
          Other
        </span>
      </div>
      {(() => {
        const sel: SettingsSelection = { kind: 'subtypes' };
        const active = isSelected(sel);
        return (
          <button onClick={() => onSelect(sel)} className={rowClass(active)} style={rowStyle(active)}>
            Other-Support Subtypes
          </button>
        );
      })()}
    </div>
  );
}
