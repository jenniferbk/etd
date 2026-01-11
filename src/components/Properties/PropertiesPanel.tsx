import { useCallback, useMemo } from 'react';
import { useDiagramStore } from '../../store';
import type { DiagramElement, CropArea } from '../../types';
import { isArgumentElement, isTeacherSupportElement, isInfoBoxElement } from '../../types';
import { theme } from '../../utils/theme';
import { ImageUpload } from './ImageUpload';
import { useImagePaste } from '../../hooks/useImagePaste';

export function PropertiesPanel() {
  const { elements, selectedIds, updateElement, setElementImage, setElementImageSettings } = useDiagramStore();

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

  // Input styling with new theme
  const inputStyle = {
    backgroundColor: theme.input.bg,
    borderColor: theme.input.border,
    color: theme.input.text,
  };

  const inputHoverStyle = {
    borderColor: theme.input.borderHover,
  };

  const inputFocusStyle = {
    borderColor: theme.input.borderFocus,
    backgroundColor: theme.input.bgFocus,
    boxShadow: `0 0 0 3px ${theme.input.ring}`,
  };

  // Label styling - more visible
  const labelStyle = {
    color: theme.sidebar.textSecondary,
    fontSize: '0.6875rem',
    fontWeight: 600,
    letterSpacing: '0.05em',
    textTransform: 'uppercase' as const,
  };

  // Badge styling
  const badgeStyle = {
    backgroundColor: theme.sidebar.surface,
    color: theme.sidebar.text,
    border: `1px solid ${theme.sidebar.border}`,
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

  // Enhanced input component with proper focus handling
  const Input = ({
    value,
    onChange,
    placeholder,
    className = '',
  }: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    className?: string;
  }) => (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`px-3 py-2 text-sm border rounded-lg transition-all duration-150 ${className}`}
      style={inputStyle}
      onMouseEnter={(e) => {
        Object.assign(e.currentTarget.style, inputHoverStyle);
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = theme.input.border;
      }}
      onFocus={(e) => {
        Object.assign(e.currentTarget.style, inputFocusStyle);
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = theme.input.border;
        e.currentTarget.style.backgroundColor = theme.input.bg;
        e.currentTarget.style.boxShadow = 'none';
      }}
    />
  );

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
                <Input
                  value={selectedElement.label}
                  onChange={(value) => handleChange('label', value)}
                  className="w-32"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label style={labelStyle}>Type</label>
                <span className="px-3 py-2 text-sm rounded-lg capitalize font-medium" style={badgeStyle}>
                  {selectedElement.argumentType}
                </span>
              </div>
              <div className="flex flex-col gap-1.5">
                <label style={labelStyle}>Contributor</label>
                <span className="px-3 py-2 text-sm rounded-lg capitalize font-medium" style={badgeStyle}>
                  {selectedElement.contributor}
                </span>
              </div>
            </>
          )}
          {isTeacherSupportElement(selectedElement) && (
            <>
              <div className="flex flex-col gap-1.5">
                <label style={labelStyle}>Type</label>
                <span className="px-3 py-2 text-sm rounded-lg capitalize font-medium" style={badgeStyle}>
                  {selectedElement.supportType}
                </span>
              </div>
              {selectedElement.subtype && (
                <div className="flex flex-col gap-1.5">
                  <label style={labelStyle}>Subtype</label>
                  <span className="px-3 py-2 text-sm rounded-lg capitalize font-medium" style={badgeStyle}>
                    {selectedElement.subtype}
                  </span>
                </div>
              )}
            </>
          )}
          {isInfoBoxElement(selectedElement) && (
            <>
              <div className="flex flex-col gap-1.5">
                <label style={labelStyle}>Label</label>
                <Input
                  value={selectedElement.label}
                  onChange={(value) => handleChange('label', value)}
                  className="w-32"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label style={labelStyle}>Type</label>
                <span className="px-3 py-2 text-sm rounded-lg font-medium" style={badgeStyle}>
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
            className="w-full px-3 py-2 text-sm border rounded-lg resize-y min-h-[60px] transition-all duration-150"
            style={inputStyle}
            rows={3}
            placeholder="Enter element content..."
            onMouseEnter={(e) => {
              Object.assign(e.currentTarget.style, inputHoverStyle);
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = theme.input.border;
            }}
            onFocus={(e) => {
              Object.assign(e.currentTarget.style, inputFocusStyle);
            }}
            onBlur={(e) => {
              e.currentTarget.style.borderColor = theme.input.border;
              e.currentTarget.style.backgroundColor = theme.input.bg;
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>

        {/* Attribution */}
        <div className="flex gap-3 flex-shrink-0">
          <div className="flex flex-col gap-1.5">
            <label style={labelStyle}>Speaker</label>
            <Input
              value={selectedElement.attribution?.speaker || ''}
              onChange={(value) => handleAttributionChange('speaker', value)}
              placeholder="S1"
              className="w-20"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label style={labelStyle}>Time</label>
            <Input
              value={selectedElement.attribution?.timestamp || ''}
              onChange={(value) => handleAttributionChange('timestamp', value)}
              placeholder="00:00"
              className="w-20"
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
