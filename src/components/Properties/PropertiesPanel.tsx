import { useCallback, useEffect, useMemo, useState } from 'react';
import { Copy, MousePointer2, Trash2 } from 'lucide-react';
import { useDiagramStore } from '../../store';
import type { DiagramElement, CropArea, ArgumentType, ContributorType, SupportType, SupportSubtype, SupportContributor, ConnectionType } from '../../types';
import { isArgumentElement, isSupportElement, isTeacherSupportElement, isInfoBoxElement } from '../../types';
import { theme } from '../../utils/theme';
import { ImageUpload } from './ImageUpload';
import { useImagePaste } from '../../hooks/useImagePaste';
import { requiredWidthForImage } from '../../utils/imageLayout';

// Contributor type options
const CONTRIBUTOR_TYPES: { value: ContributorType; label: string }[] = [
  { value: 'given', label: 'Given' },
  { value: 'teacher', label: 'Teacher' },
  { value: 'student', label: 'Student' },
  { value: 'joint', label: 'Joint' },
  { value: 'implicit', label: 'Implicit' },
];

const SUPPORT_CONTRIBUTOR_TYPES: { value: SupportContributor; label: string }[] = [
  { value: 'teacher', label: 'Teacher' },
  { value: 'student', label: 'Student' },
];

const CONNECTION_TYPES: { value: ConnectionType; label: string }[] = [
  { value: 'support', label: 'Support' },
  { value: 'counterclaim', label: 'Counterclaim' },
];

// Matches the width Palette gives new (non-implicit) argument elements.
const DEFAULT_ARGUMENT_WIDTH = 180;

export function PropertiesPanel() {
  const { elements, selectedIds, updateElement, resizeElement, setElementImage, setElementImageSettings, changeSupportType, convertToArgument, convertToSupport, duplicateElements, removeElement } = useDiagramStore();
  const styleConfig = useDiagramStore((s) => s.styleConfig);

  const ARGUMENT_TYPES = (
    ['claim', 'data', 'warrant', 'backing', 'qualifier', 'rebuttal'] as const
  ).map((value) => ({ value, label: styleConfig.argumentTypes[value].label }));

  const SUPPORT_TYPES = (
    ['action', 'question', 'other'] as const
  ).map((value) => ({ value, label: styleConfig.supportTypes[value].label }));

  const OTHER_SUBTYPES = styleConfig.subtypes.other.map((s) => ({
    value: s.id,
    label: s.label,
  }));
  const QUESTION_SUBTYPES = styleConfig.subtypes.question.map((s) => ({
    value: s.id,
    label: s.label,
  }));

  const connections = useDiagramStore((s) => s.connections);
  const resetConnectionRouting = useDiagramStore((s) => s.resetConnectionRouting);
  const setConnectionType = useDiagramStore((s) => s.setConnectionType);

  // Get the first selected element
  const selectedElement = selectedIds.length === 1
    ? elements.find((el) => el.id === selectedIds[0])
    : null;

  const selectedConnection = selectedIds.length === 1 && !selectedElement
    ? connections.find((c) => c.id === selectedIds[0])
    : null;

  const isOrphanedSubtype = !!(
    selectedElement &&
    isSupportElement(selectedElement) &&
    selectedElement.supportType !== 'action' &&
    selectedElement.subtype !== undefined &&
    !styleConfig.subtypes[selectedElement.supportType].some((s) => s.id === selectedElement.subtype)
  );

  // Handle image changes - must be before early return for hooks rules
  const handleImageChange = useCallback(
    (imageData: string | null) => {
      if (selectedElement) {
        setElementImage(selectedElement.id, imageData);
      }
    },
    [selectedElement, setElementImage]
  );

  // Handle crop changes
  const handleCropChange = useCallback(
    (cropArea: CropArea) => {
      if (selectedElement) {
        setElementImageSettings(selectedElement.id, { cropArea });
      }
    },
    [selectedElement, setElementImageSettings]
  );

  // Aspect ratio (w/h) of the selected element's image after crop — needed to
  // widen the element when the image is scaled above 100%.
  const selectedImage = selectedElement?.image ?? null;
  const selectedCrop = selectedElement?.imageSettings?.cropArea;
  const [measuredAspect, setMeasuredAspect] = useState<{
    image: string;
    crop: CropArea | undefined;
    aspect: number;
  } | null>(null);
  const imageAspect =
    measuredAspect && measuredAspect.image === selectedImage && measuredAspect.crop === selectedCrop
      ? measuredAspect.aspect
      : null;
  useEffect(() => {
    if (!selectedImage) return;
    let cancelled = false;
    const img = new window.Image();
    img.onload = () => {
      if (cancelled) return;
      const w = selectedCrop ? selectedCrop.width * img.width : img.width;
      const h = selectedCrop ? selectedCrop.height * img.height : img.height;
      if (h > 0) setMeasuredAspect({ image: selectedImage, crop: selectedCrop, aspect: w / h });
    };
    img.src = selectedImage;
    return () => {
      cancelled = true;
    };
  }, [selectedImage, selectedCrop]);

  // Handle image scale change. Above 100% the element widens to fit the
  // image (it never narrows automatically — the user may have sized it).
  const handleScaleChange = useCallback(
    (scale: number) => {
      if (!selectedElement) return;
      // 12 = the larger of ArgumentShape's paddings (cloud); 2px slack on rects is harmless.
      const neededWidth = imageAspect ? requiredWidthForImage(imageAspect, scale, 12) : null;
      const oldScale = selectedElement.imageSettings?.scale ?? 1;
      const autoWidenedWidth = imageAspect ? requiredWidthForImage(imageAspect, oldScale, 12) : null;
      let nextWidth = selectedElement.size.width;
      if (neededWidth && neededWidth > nextWidth) {
        nextWidth = neededWidth;
      } else if (scale < oldScale && autoWidenedWidth === selectedElement.size.width) {
        // Still at the width we auto-widened to (user hasn't resized) → shrink
        // back with the image, down to the default argument width.
        nextWidth = Math.max(DEFAULT_ARGUMENT_WIDTH, neededWidth ?? 0);
      }
      if (nextWidth !== selectedElement.size.width) {
        resizeElement(selectedElement.id, { width: nextWidth, height: selectedElement.size.height });
      }
      // Scale update re-runs auto height against the (possibly new) width.
      setElementImageSettings(selectedElement.id, { scale });
    },
    [selectedElement, imageAspect, resizeElement, setElementImageSettings]
  );

  // Handle image paste - must be before early return for hooks rules
  useImagePaste({
    onImagePaste: handleImageChange,
    enabled: !!selectedElement && selectedElement.type === 'argument',
  });

  // Calculate dynamic panel height based on element type
  const panelHeight = useMemo(() => {
    if (!selectedElement) return 'h-16';
    if (isArgumentElement(selectedElement)) {
      return selectedElement.image ? 'min-h-40' : 'min-h-32';
    }
    return 'min-h-28';
  }, [selectedElement]);

  // Shared styles
  const inputStyle = {
    backgroundColor: theme.input.bg,
    borderColor: theme.input.border,
    color: theme.input.text,
    outlineColor: theme.focus.ring,
  };

  const labelStyle = {
    color: theme.sidebar.textSecondary,
    fontSize: '0.6875rem',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
  };

  const selectStyle = {
    backgroundColor: theme.input.bg,
    borderColor: theme.input.border,
    color: theme.input.text,
    outlineColor: theme.focus.ring,
  };

  if (selectedConnection) {
    const hasManualRouting =
      (selectedConnection.waypoints && selectedConnection.waypoints.length > 0) ||
      selectedConnection.fromAnchor !== undefined ||
      selectedConnection.toAnchor !== undefined;
    return (
      <div
        className="min-h-28 border-t px-5 py-4 panel-transition"
        style={{
          background: theme.properties.bgGradient,
          borderColor: theme.properties.border,
          boxShadow: theme.properties.shadow,
        }}
      >
        <div className="flex items-center gap-4 h-full">
          <div
            role="group"
            aria-label="Connection type"
            className="flex rounded-md overflow-hidden border"
            style={{ borderColor: theme.input.border }}
            onClick={(e) => {
              const target = (e.target as HTMLElement).closest('button[data-connection-type]');
              const match = CONNECTION_TYPES.find((c) => c.value === target?.getAttribute('data-connection-type'));
              if (match) {
                setConnectionType(selectedConnection.id, match.value);
              }
            }}
          >
            {CONNECTION_TYPES.map(({ value, label }) => {
              const active = selectedConnection.type === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  data-connection-type={value}
                  className="px-3 py-1.5 text-sm transition-colors duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={{
                    backgroundColor: active ? theme.sidebar.accent : theme.input.bg,
                    color: active ? theme.sidebar.accentText : theme.input.text,
                    outlineColor: theme.focus.ring,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
          <span className="text-sm" style={{ color: theme.sidebar.textSecondary }}>
            Connection — {hasManualRouting ? 'manual routing applied' : 'auto-routed'}
          </span>
          <button
            onClick={() => resetConnectionRouting(selectedConnection.id)}
            disabled={!hasManualRouting}
            className="px-3 py-1.5 text-sm border rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
            style={{
              borderColor: theme.input.border,
              color: theme.input.text,
              backgroundColor: theme.input.bg,
            }}
            onMouseEnter={(e) => {
              if (!hasManualRouting) return;
              e.currentTarget.style.backgroundColor = theme.input.bgHover;
            }}
            onMouseLeave={(e) => {
              if (!hasManualRouting) return;
              e.currentTarget.style.backgroundColor = theme.input.bg;
            }}
          >
            Reset routing
          </button>
        </div>
      </div>
    );
  }

  if (!selectedElement) {
    return (
      <div
        className="min-h-28 border-t panel-transition"
        style={{
          background: theme.properties.bgGradient,
          borderColor: theme.properties.border,
          boxShadow: theme.properties.shadow,
        }}
      >
        <div
          className="m-4 rounded-md flex flex-col items-center justify-center gap-2 text-sm italic h-[calc(100%-2rem)] min-h-20"
          style={{
            color: theme.sidebar.textSecondary,
            borderWidth: '1px',
            borderStyle: 'dashed',
            borderColor: theme.sidebar.border,
          }}
        >
          <MousePointer2
            size={24}
            aria-hidden="true"
            style={{ color: theme.sidebar.muted }}
          />
          <span>No element selected · click an element on the canvas to edit it</span>
        </div>
      </div>
    );
  }

  const handleChange = (field: string, value: string) => {
    // When changing contributor to implicit, force argumentType to warrant
    if (field === 'contributor' && value === 'implicit' && isArgumentElement(selectedElement)) {
      updateElement(selectedElement.id, { contributor: 'implicit', argumentType: 'warrant' } as Partial<DiagramElement>);
      return;
    }
    updateElement(selectedElement.id, { [field]: value } as Partial<DiagramElement>);
  };

  const handleAttributionChange = (field: 'speaker' | 'timestamp', value: string) => {
    updateElement(selectedElement.id, {
      attribution: {
        ...selectedElement.attribution,
        speaker: selectedElement.attribution?.speaker || '',
        timestamp: selectedElement.attribution?.timestamp || '',
        [field]: value,
      },
    });
  };

  const isUnattachedQualifier =
    isArgumentElement(selectedElement) &&
    selectedElement.argumentType === 'qualifier' &&
    selectedElement.attachedTo === undefined;

  return (
    <div
      className={`${panelHeight} border-t px-5 py-4 panel-transition`}
      style={{
        background: theme.properties.bgGradient,
        borderColor: theme.properties.border,
        boxShadow: theme.properties.shadow,
      }}
    >
      {isUnattachedQualifier && (
        <div
          className="mb-3 px-3 py-2 rounded text-xs"
          style={{
            backgroundColor: '#FFEBEB',
            border: '1px solid #CC0000',
            color: '#9B0000',
          }}
        >
          ⚠ Unattached qualifier — drag onto a connection line to attach.
        </div>
      )}
      <div className="flex gap-6 items-start h-full">
        {/* Label and Type */}
        <div className="flex gap-4 flex-shrink-0">
          {isArgumentElement(selectedElement) && (
            <>
              <div className="flex flex-col gap-1.5">
                <label style={labelStyle}>Label</label>
                <input
                  type="text"
                  value={selectedElement.label}
                  onChange={(e) => handleChange('label', e.target.value)}
                  className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 w-32 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={inputStyle}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label style={labelStyle}>Type</label>
                <select
                  value={selectedElement.argumentType}
                  onChange={(e) => handleChange('argumentType', e.target.value)}
                  className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 capitalize cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={selectStyle}
                >
                  {ARGUMENT_TYPES.map((type) => (
                    <option
                      key={type.value}
                      value={type.value}
                      disabled={selectedElement.contributor === 'implicit' && type.value !== 'warrant'}
                    >
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label style={labelStyle}>Contributor</label>
                <select
                  value={selectedElement.contributor}
                  onChange={(e) => handleChange('contributor', e.target.value)}
                  className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 capitalize cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={selectStyle}
                >
                  {CONTRIBUTOR_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label style={labelStyle}>Convert</label>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      const [supportType, subtype] = e.target.value.split(':') as [SupportType, SupportSubtype?];
                      convertToSupport(selectedElement.id, supportType, subtype);
                    }
                  }}
                  className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={selectStyle}
                >
                  <option value="">To Support...</option>
                  <option value="action">Action</option>
                  <option value="question">Question</option>
                  {QUESTION_SUBTYPES.length > 0 && (
                    <optgroup label="Question subtypes">
                      {QUESTION_SUBTYPES.map((subtype) => (
                        <option key={subtype.value} value={`question:${subtype.value}`}>
                          {subtype.label}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Other Support">
                    {OTHER_SUBTYPES.map((subtype) => (
                      <option key={subtype.value} value={`other:${subtype.value}`}>
                        {subtype.label}
                      </option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </>
          )}
          {(isSupportElement(selectedElement) || isTeacherSupportElement(selectedElement)) && (
            <>
              <div className="flex flex-col gap-1.5">
                <label style={labelStyle}>Type</label>
                <select
                  value={selectedElement.supportType}
                  onChange={(e) => changeSupportType(selectedElement.id, e.target.value as SupportType)}
                  className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 capitalize cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={selectStyle}
                >
                  {SUPPORT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              {isSupportElement(selectedElement) && (
                <div className="flex flex-col gap-1.5">
                  <label style={labelStyle}>Contributor</label>
                  <select
                    value={selectedElement.contributor}
                    onChange={(e) =>
                      updateElement(selectedElement.id, {
                        contributor: e.target.value as SupportContributor,
                      } as Partial<DiagramElement>)
                    }
                    className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 capitalize cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={selectStyle}
                  >
                    {SUPPORT_CONTRIBUTOR_TYPES.map((type) => (
                      <option key={type.value} value={type.value}>
                        {type.label}
                      </option>
                    ))}
                  </select>
                </div>
              )}
              {selectedElement.supportType !== 'action' && (() => {
                const subtypeOptions =
                  selectedElement.supportType === 'question' ? QUESTION_SUBTYPES : OTHER_SUBTYPES;
                // Hide the dropdown entirely when there are no subtypes defined for this
                // supportType and the element has no orphan to display — nothing for the
                // user to pick from. They can add subtypes in Settings.
                if (subtypeOptions.length === 0 && !isOrphanedSubtype) return null;
                return (
                  <div className="flex flex-col gap-1.5">
                    <label style={labelStyle}>Subtype</label>
                    <select
                      value={isOrphanedSubtype ? '__orphan__' : (selectedElement.subtype ?? '')}
                      onChange={(e) =>
                        changeSupportType(
                          selectedElement.id,
                          selectedElement.supportType,
                          e.target.value as SupportSubtype,
                        )
                      }
                      className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 capitalize cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                      style={{ ...selectStyle, color: isOrphanedSubtype ? theme.danger.fg : selectStyle.color }}
                    >
                      {isOrphanedSubtype && (
                        <option value="__orphan__" disabled>
                          [Deleted Subtype — pick a new one]
                        </option>
                      )}
                      <option value="">(none)</option>
                      {subtypeOptions.map((subtype) => (
                        <option key={subtype.value} value={subtype.value}>
                          {subtype.label}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })()}
              {isSupportElement(selectedElement) && (
                <div className="flex flex-col gap-1.5">
                  <label style={labelStyle}>Associated with</label>
                  <select
                    value={selectedElement.associatedWith ?? ''}
                    onChange={(e) => {
                      const next = e.target.value;
                      updateElement(selectedElement.id, {
                        associatedWith: next === '' ? undefined : next,
                      } as Partial<DiagramElement>);
                    }}
                    className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                    style={selectStyle}
                  >
                    <option value="">(none)</option>
                    {elements
                      .filter(isArgumentElement)
                      .slice()
                      .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
                      .map((arg) => {
                        const preview = arg.content.length > 40
                          ? arg.content.slice(0, 40) + '…'
                          : arg.content;
                        const labelText = preview ? `${arg.label}: "${preview}"` : arg.label;
                        return (
                          <option key={arg.id} value={arg.id}>
                            {labelText}
                          </option>
                        );
                      })}
                  </select>
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <label style={labelStyle}>Convert</label>
                <select
                  value=""
                  onChange={(e) => {
                    if (e.target.value) {
                      convertToArgument(selectedElement.id, e.target.value as ArgumentType);
                    }
                  }}
                  className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 cursor-pointer focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={selectStyle}
                >
                  <option value="">To Argument...</option>
                  {ARGUMENT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          {isInfoBoxElement(selectedElement) && (
            <>
              <div className="flex flex-col gap-1.5">
                <label style={labelStyle}>Label</label>
                <input
                  type="text"
                  value={selectedElement.label}
                  onChange={(e) => handleChange('label', e.target.value)}
                  className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 w-32 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                  style={inputStyle}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label style={labelStyle}>Type</label>
                <span
                  className="px-3 py-2 text-sm rounded-lg font-medium"
                  style={{
                    backgroundColor: theme.sidebar.surface,
                    color: theme.sidebar.text,
                    border: `1px solid ${theme.sidebar.border}`,
                  }}
                >
                  Info Box
                </span>
              </div>
            </>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col gap-1.5 min-w-0">
          <label style={labelStyle}>Content</label>
          <textarea
            value={selectedElement.content}
            onChange={(e) => handleChange('content', e.target.value)}
            className="w-full px-3 py-2 text-sm border rounded-lg resize-y min-h-[60px] transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={inputStyle}
            rows={3}
            placeholder="Enter element content..."
          />
        </div>

        {/* Attribution */}
        <div className="flex gap-3 flex-shrink-0">
          <div className="flex flex-col gap-1.5">
            <label style={labelStyle}>Speaker</label>
            <input
              type="text"
              value={selectedElement.attribution?.speaker || ''}
              onChange={(e) => handleAttributionChange('speaker', e.target.value)}
              placeholder="S1"
              className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 w-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={inputStyle}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label style={labelStyle}>Time</label>
            <input
              type="text"
              value={selectedElement.attribution?.timestamp || ''}
              onChange={(e) => handleAttributionChange('timestamp', e.target.value)}
              placeholder="00:00"
              className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 w-20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Image Upload (for argument elements) */}
        {isArgumentElement(selectedElement) && (
          <div className="w-40 flex-shrink-0">
            <ImageUpload
              currentImage={selectedElement.image}
              onImageChange={handleImageChange}
              currentCrop={selectedElement.imageSettings?.cropArea}
              onCropChange={handleCropChange}
              scale={selectedElement.imageSettings?.scale ?? 1}
              onScaleChange={handleScaleChange}
            />
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-1.5 ml-auto flex-shrink-0 self-start">
          <span style={labelStyle}>Actions</span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => duplicateElements([selectedElement.id])}
              className="px-3 py-2 text-sm border rounded-md inline-flex items-center gap-1.5 transition-colors duration-150"
              style={{
                backgroundColor: theme.button.secondary.bg,
                color: theme.button.secondary.text,
                borderColor: theme.button.secondary.border,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.button.secondary.bgHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = theme.button.secondary.bg;
              }}
              title="Duplicate (⌘D)"
            >
              <Copy size={14} aria-hidden="true" />
              Duplicate
            </button>
            <button
              type="button"
              onClick={() => removeElement(selectedElement.id)}
              className="px-3 py-2 text-sm rounded-md inline-flex items-center gap-1.5 transition-colors duration-150"
              style={{
                backgroundColor: theme.button.danger.bg,
                color: theme.button.danger.text,
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: theme.button.danger.bg,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.button.danger.bgHover;
                e.currentTarget.style.borderColor = theme.button.danger.bgHover;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = theme.button.danger.bg;
                e.currentTarget.style.borderColor = theme.button.danger.bg;
              }}
              title="Delete (Del / Backspace)"
            >
              <Trash2 size={14} aria-hidden="true" />
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
