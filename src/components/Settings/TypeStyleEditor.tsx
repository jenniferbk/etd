import { useState } from 'react';
import type { StyleConfig, TypeStyle, BorderStyle, BorderShape } from '../../types';
import { theme } from '../../utils/theme';
import { createCurrentDefaults } from '../../utils/styleConfigDefaults';
import { StylePreview } from './StylePreview';

interface TypeStyleEditorProps {
  kind: 'argument' | 'support';
  typeKey: string; // e.g. 'claim' or 'action'
  config: StyleConfig;
  onChange: (next: StyleConfig) => void;
}

const BORDER_STYLES: BorderStyle[] = ['solid', 'dashed', 'dotted'];
const BORDER_SHAPES: BorderShape[] = ['rectangle', 'rounded', 'ellipse'];

export function TypeStyleEditor({ kind, typeKey, config, onChange }: TypeStyleEditorProps) {
  const current: TypeStyle =
    kind === 'argument'
      ? config.argumentTypes[typeKey as keyof StyleConfig['argumentTypes']]
      : config.supportTypes[typeKey as keyof StyleConfig['supportTypes']];

  // Local label state for onBlur commit.
  // TypeStyleEditor is keyed by typeKey in the parent, so this initializes fresh
  // on each type selection — no sync-in-effect needed.
  const [labelDraft, setLabelDraft] = useState(current.label);

  const updateField = (patch: Partial<TypeStyle>) => {
    if (kind === 'argument') {
      const k = typeKey as keyof StyleConfig['argumentTypes'];
      onChange({
        ...config,
        argumentTypes: { ...config.argumentTypes, [k]: { ...current, ...patch } },
      });
    } else {
      const k = typeKey as keyof StyleConfig['supportTypes'];
      onChange({
        ...config,
        supportTypes: { ...config.supportTypes, [k]: { ...current, ...patch } },
      });
    }
  };

  const handleReset = () => {
    const defaults = createCurrentDefaults();
    if (kind === 'argument') {
      const k = typeKey as keyof StyleConfig['argumentTypes'];
      onChange({
        ...config,
        argumentTypes: { ...config.argumentTypes, [k]: defaults.argumentTypes[k] },
      });
    } else {
      const k = typeKey as keyof StyleConfig['supportTypes'];
      onChange({
        ...config,
        supportTypes: { ...config.supportTypes, [k]: defaults.supportTypes[k] },
      });
    }
  };

  const fieldStyle = {
    backgroundColor: theme.sidebar.surface,
    color: theme.sidebar.text,
    border: `1px solid ${theme.sidebar.border}`,
    outlineColor: theme.focus.ring,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wider" style={{ color: theme.sidebar.text }}>
          {kind === 'argument' ? 'Argument Type' : 'Support Type'}: {typeKey}
        </h3>
        <button
          onClick={handleReset}
          className="text-xs underline"
          style={{ color: theme.sidebar.muted }}
        >
          Reset
        </button>
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wider" style={{ color: theme.sidebar.muted }}>Display label</span>
        <input
          type="text"
          value={labelDraft}
          onChange={(e) => setLabelDraft(e.target.value)}
          onBlur={() => updateField({ label: labelDraft })}
          className="mt-1 w-full px-3 py-2 text-sm rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={fieldStyle}
        />
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider" style={{ color: theme.sidebar.muted }}>Border style</span>
        <select
          value={current.borderStyle}
          onChange={(e) => updateField({ borderStyle: e.target.value as BorderStyle })}
          className="mt-1 w-full px-3 py-2 text-sm rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={fieldStyle}
        >
          {BORDER_STYLES.map((s) => (
            <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider" style={{ color: theme.sidebar.muted }}>Border shape</span>
        <select
          value={current.borderShape}
          onChange={(e) => updateField({ borderShape: e.target.value as BorderShape })}
          className="mt-1 w-full px-3 py-2 text-sm rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          style={fieldStyle}
        >
          {BORDER_SHAPES.map((s) => (
            <option key={s} value={s}>
              {s === 'rounded' ? 'Rounded rectangle' : s.charAt(0).toUpperCase() + s.slice(1)}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider" style={{ color: theme.sidebar.muted }}>Background color</span>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="color"
            value={current.backgroundColor}
            onChange={(e) => updateField({ backgroundColor: e.target.value })}
            className="w-10 h-10 rounded cursor-pointer"
            style={{ backgroundColor: 'transparent' }}
          />
          <input
            type="text"
            value={current.backgroundColor}
            onChange={(e) => updateField({ backgroundColor: e.target.value })}
            className="px-3 py-2 text-sm rounded font-mono focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{ ...fieldStyle, width: '100px' }}
          />
        </div>
      </label>

      <StylePreview kind={kind} typeKey={typeKey} config={config} />
    </div>
  );
}
