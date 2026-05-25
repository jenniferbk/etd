import { useState } from 'react';
import { GripVertical, Trash2, Plus } from 'lucide-react';
import type { StyleConfig, Subtype, SupportType } from '../../types';
import { useDiagramStore } from '../../store';
import { isSupportElement } from '../../types';
import { theme } from '../../utils/theme';
import { createCurrentDefaults } from '../../utils/styleConfigDefaults';

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
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `subtype-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    updateSubtypes([...list, { id, label: 'New subtype' }]);
  };

  const handleRename = (id: string, label: string) => {
    updateSubtypes(list.map((s) => (s.id === id ? { ...s, label } : s)));
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
      </div>

      <div className="space-y-1">
        {list.map((s, idx) => (
          <SubtypeRow
            key={`${s.id}:${s.label}`}
            subtype={s}
            index={idx}
            useCount={countUsesForId(s.id)}
            onRename={handleRename}
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
  onRename: (id: string, label: string) => void;
  onRemove: (id: string) => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

function SubtypeRow({ subtype, index, useCount, onRename, onRemove, onReorder }: SubtypeRowProps) {
  // Initial label comes from props. External changes (e.g. undo) are handled by
  // the `key={id:label}` on the parent — forcing a remount with fresh state.
  const [labelDraft, setLabelDraft] = useState(subtype.label);

  return (
    <div
      className="flex items-center gap-2 px-2 py-1.5 rounded"
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
  );
}
