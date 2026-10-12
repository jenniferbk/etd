import { useState } from 'react';
import { GripVertical, Trash2, Plus } from 'lucide-react';
import type { BorderShape, StyleConfig, Subtype, SubtypeStyle, SupportType } from '../../types';
import { useDiagramStore } from '../../store';
import { isSupportElement } from '../../types';
import { theme } from '../../utils/theme';
import { createCurrentDefaults } from '../../utils/styleConfigDefaults';
import { generateUuid } from '../../utils/uuid';

interface SubtypeListEditorProps {
  supportType: SupportType;
  config: StyleConfig;
  onChange: (next: StyleConfig) => void;
}

export function SubtypeListEditor({ supportType, config, onChange }: SubtypeListEditorProps) {
  const elements = useDiagramStore((s) => s.elements);

  const list = config.subtypes[supportType];
  const typeLabel = config.supportTypes[supportType].label;
  const defaults = createCurrentDefaults().subtypes[supportType];

  const updateSubtypes = (next: Subtype[]) => {
    onChange({
      ...config,
      subtypes: { ...config.subtypes, [supportType]: next },
    });
  };

  const handleAdd = () => {
    const id = generateUuid();
    updateSubtypes([...list, { id, label: 'New subtype' }]);
  };

  const handleRename = (id: string, label: string) => {
    updateSubtypes(list.map((s) => (s.id === id ? { ...s, label } : s)));
  };

  const handleStyleChange = (id: string, style: SubtypeStyle) => {
    updateSubtypes(list.map((s) => (s.id === id ? { ...s, style } : s)));
  };

  const countUsesForId = (id: string) =>
    elements.filter(
      (el) => isSupportElement(el) && el.supportType === supportType && el.subtype === id,
    ).length;

  const handleRemove = (id: string) => {
    const useCount = countUsesForId(id);
    if (useCount > 0) {
      const ok = window.confirm(
        `This subtype is used by ${useCount} element${useCount === 1 ? '' : 's'}. Deleting it will leave them with no assigned subtype. Continue?`
      );
      if (!ok) return;
    }
    updateSubtypes(list.filter((s) => s.id !== id));
  };

  const handleReorder = (fromIndex: number, toIndex: number) => {
    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    updateSubtypes(next);
  };

  const handleResetSubtypes = () => {
    const ok = window.confirm(
      `Replace your custom ${typeLabel.toLowerCase()} subtypes with the defaults? Elements using removed subtypes will be orphaned.`
    );
    if (!ok) return;
    updateSubtypes(defaults);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3
          className="text-sm font-semibold uppercase tracking-wider"
          style={{ color: theme.sidebar.text }}
        >
          {typeLabel} Subtypes
        </h3>
        <button
          onClick={handleResetSubtypes}
          className="text-xs underline"
          style={{ color: theme.sidebar.muted }}
        >
          Reset subtypes to defaults
        </button>
      </div>

      <div className="text-xs" style={{ color: theme.sidebar.muted }}>
        Subtypes appear in the palette dropdown and the transcript-line object-type selector.
        Renaming a subtype updates every element that uses it. Deleting one orphans those elements.
        A subtype can override the {typeLabel.toLowerCase()} shape and fill; "Type default" uses the {typeLabel} style.
      </div>

      <div className="space-y-1">
        {list.map((s, idx) => (
          <SubtypeRow
            key={`${s.id}:${s.label}`}
            subtype={s}
            index={idx}
            useCount={countUsesForId(s.id)}
            typeFill={config.supportTypes[supportType].backgroundColor}
            onRename={handleRename}
            onStyleChange={handleStyleChange}
            onRemove={handleRemove}
            onReorder={handleReorder}
          />
        ))}
      </div>

      <button
        onClick={handleAdd}
        className="flex items-center gap-2 px-3 py-2 text-sm rounded"
        style={{ backgroundColor: theme.sidebar.surface, color: theme.sidebar.text }}
      >
        <Plus size={14} /> Add subtype
      </button>
    </div>
  );
}

interface SubtypeRowProps {
  subtype: Subtype;
  index: number;
  useCount: number;
  typeFill: string;
  onRename: (id: string, label: string) => void;
  onStyleChange: (id: string, style: SubtypeStyle) => void;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

const SHAPE_OPTIONS: { value: '' | BorderShape; label: string }[] = [
  { value: '', label: 'Type default' },
  { value: 'rectangle', label: 'Rectangle' },
  { value: 'rounded', label: 'Rounded rectangle' },
  { value: 'ellipse', label: 'Ellipse' },
];

function SubtypeRow({ subtype, index, useCount, typeFill, onRename, onStyleChange, onRemove, onReorder }: SubtypeRowProps) {
  // Initial label comes from props. External changes (e.g. undo) are handled by
  // the `key={id:label}` on the parent — forcing a remount with fresh state.
  const [labelDraft, setLabelDraft] = useState(subtype.label);
  const style = subtype.style ?? {};
  const fieldStyle = {
    backgroundColor: theme.sidebar.bg,
    color: theme.sidebar.text,
    border: `1px solid ${theme.sidebar.border}`,
  };

  return (
    <div
      className="px-2 py-1.5 rounded space-y-1.5"
      style={{ backgroundColor: theme.sidebar.surface }}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('text/plain', String(index));
        e.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => {
        e.preventDefault();
        const fromStr = e.dataTransfer.getData('text/plain');
        const from = fromStr === '' ? NaN : Number(fromStr);
        if (Number.isFinite(from) && from !== index) onReorder(from, index);
      }}
    >
      <div className="flex items-center gap-2">
      <GripVertical size={14} style={{ color: theme.sidebar.muted, cursor: 'grab' }} />
      <input
        type="text"
        value={labelDraft}
        onChange={(e) => setLabelDraft(e.target.value)}
        onBlur={() => {
          if (labelDraft !== subtype.label) onRename(subtype.id, labelDraft);
        }}
        className="flex-1 px-2 py-1 text-sm rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{
          backgroundColor: theme.sidebar.bg,
          color: theme.sidebar.text,
          border: `1px solid ${theme.sidebar.border}`,
          outlineColor: theme.focus.ring,
        }}
      />
      {useCount > 0 && (
        <span className="text-xs" style={{ color: theme.sidebar.muted }}>
          {useCount} use{useCount === 1 ? '' : 's'}
        </span>
      )}
      <button
        onClick={() => onRemove(subtype.id)}
        className="p-1 rounded transition-colors"
        aria-label={`Remove subtype ${subtype.label}`}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.sidebar.hover; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; }}
      >
        <Trash2 size={14} style={{ color: theme.sidebar.muted }} />
      </button>
      </div>
      <div className="flex items-center gap-2 pl-6 text-xs" style={{ color: theme.sidebar.muted }}>
        <label className="flex items-center gap-1">
          Shape
          <select
            value={style.borderShape ?? ''}
            onChange={(e) => {
              const v = e.target.value as '' | BorderShape;
              const { borderShape: _drop, ...rest } = style;
              void _drop;
              onStyleChange(subtype.id, v === '' ? rest : { ...rest, borderShape: v });
            }}
            aria-label={`Shape for subtype ${subtype.label}`}
            className="px-1 py-0.5 rounded"
            style={fieldStyle}
          >
            {SHAPE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          Fill
          <input
            type="color"
            value={style.backgroundColor ?? typeFill}
            onChange={(e) => onStyleChange(subtype.id, { ...style, backgroundColor: e.target.value.toUpperCase() })}
            aria-label={`Fill color for subtype ${subtype.label}`}
            className="w-6 h-6 rounded cursor-pointer"
            style={{ backgroundColor: 'transparent' }}
          />
        </label>
        {style.backgroundColor !== undefined && (
          <button
            onClick={() => {
              const { backgroundColor: _drop, ...rest } = style;
              void _drop;
              onStyleChange(subtype.id, rest);
            }}
            className="underline"
          >
            Use type fill
          </button>
        )}
      </div>
    </div>
  );
}
