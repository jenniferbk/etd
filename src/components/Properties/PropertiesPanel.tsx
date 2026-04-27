import { useCallback, useMemo } from 'react';
import { useDiagramStore } from '../../store';
import type { DiagramElement, CropArea, ArgumentType, ContributorType, SupportType, SupportSubtype } from '../../types';
import { isArgumentElement, isSupportElement, isTeacherSupportElement, isInfoBoxElement } from '../../types';
import { theme } from '../../utils/theme';
import { ImageUpload } from './ImageUpload';
import { useImagePaste } from '../../hooks/useImagePaste';

// Contributor type options
const CONTRIBUTOR_TYPES: { value: ContributorType; label: string }[] = [
  { value: 'given', label: 'Given' },
  { value: 'student', label: 'Student' },
  { value: 'joint', label: 'Joint' },
  { value: 'implicit', label: 'Implicit' },
];

export function PropertiesPanel() {
  const { elements, selectedIds, updateElement, setElementImage, setElementImageSettings, changeSupportType, convertToArgument, convertToSupport } = useDiagramStore();
  const styleConfig = useDiagramStore((s) => s.styleConfig);

  const ARGUMENT_TYPES = (
    ['claim', 'data', 'warrant', 'backing', 'qualifier', 'rebuttal'] as const
  ).map((value) => ({ value, label: styleConfig.argumentTypes[value].label }));

  const SUPPORT_TYPES = (
    ['action', 'question', 'other'] as const
  ).map((value) => ({ value, label: styleConfig.supportTypes[value].label }));

  const SUPPORT_SUBTYPES = styleConfig.otherSubtypes.map((s) => ({
    value: s.id,
    label: s.label,
  }));

  // Get the first selected element
  const selectedElement = selectedIds.length === 1
    ? elements.find((el) => el.id === selectedIds[0])
    : null;

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

  // Handle image scale change
  const handleScaleChange = useCallback(
    (scale: number) => {
      if (selectedElement) {
        setElementImageSettings(selectedElement.id, { scale });
      }
    },
    [selectedElement, setElementImageSettings]
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
  };

  if (!selectedElement) {
    return (
      <div
        className="h-16 border-t px-5 flex items-center justify-center text-sm panel-transition"
        style={{
          background: theme.properties.bgGradient,
          borderColor: theme.properties.border,
          color: theme.sidebar.muted,
          boxShadow: theme.properties.shadow,
        }}
      >
        Select an element to edit its properties
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

  return (
    <div
      className={`${panelHeight} border-t px-5 py-4 panel-transition`}
      style={{
        background: theme.properties.bgGradient,
        borderColor: theme.properties.border,
        boxShadow: theme.properties.shadow,
      }}
    >
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
                  className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 w-32 focus:outline-none focus:ring-2"
                  style={inputStyle}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label style={labelStyle}>Type</label>
                <select
                  value={selectedElement.argumentType}
                  onChange={(e) => handleChange('argumentType', e.target.value)}
                  className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 capitalize cursor-pointer focus:outline-none focus:ring-2"
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
                  className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 capitalize cursor-pointer focus:outline-none focus:ring-2"
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
                  className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2"
                  style={selectStyle}
                >
                  <option value="">To Support...</option>
                  <option value="action">Action</option>
                  <option value="question">Question</option>
                  <optgroup label="Other Support">
                    {SUPPORT_SUBTYPES.map((subtype) => (
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
                  className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 capitalize cursor-pointer focus:outline-none focus:ring-2"
                  style={selectStyle}
                >
                  {SUPPORT_TYPES.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>
              {selectedElement.supportType === 'other' && (
                <div className="flex flex-col gap-1.5">
                  <label style={labelStyle}>Subtype</label>
                  <select
                    value={selectedElement.subtype || 'displays'}
                    onChange={(e) => changeSupportType(selectedElement.id, 'other', e.target.value as SupportSubtype)}
                    className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 capitalize cursor-pointer focus:outline-none focus:ring-2"
                    style={selectStyle}
                  >
                    {SUPPORT_SUBTYPES.map((subtype) => (
                      <option key={subtype.value} value={subtype.value}>
                        {subtype.label}
                      </option>
                    ))}
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
                  className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 cursor-pointer focus:outline-none focus:ring-2"
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
                  className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 w-32 focus:outline-none focus:ring-2"
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
            className="w-full px-3 py-2 text-sm border rounded-lg resize-y min-h-[60px] transition-all duration-150 focus:outline-none focus:ring-2"
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
              className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 w-20 focus:outline-none focus:ring-2"
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
              className="px-3 py-2 text-sm border rounded-lg transition-all duration-150 w-20 focus:outline-none focus:ring-2"
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
      </div>
    </div>
  );
}
