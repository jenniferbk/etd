import { useCallback } from 'react';
import { useDiagramStore } from '../../store';
import type { ArgumentElement, TeacherSupportElement, InfoBoxElement, DiagramElement } from '../../types';
import { isArgumentElement, isTeacherSupportElement, isInfoBoxElement } from '../../types';
import { theme } from '../../utils/theme';
import { ImageUpload } from './ImageUpload';
import { useImagePaste } from '../../hooks/useImagePaste';

export function PropertiesPanel() {
  const { elements, selectedIds, updateElement, setElementImage } = useDiagramStore();

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

  // Handle image paste - must be before early return for hooks rules
  useImagePaste({
    onImagePaste: handleImageChange,
    enabled: !!selectedElement && selectedElement.type === 'argument',
  });

  const inputStyle = {
    backgroundColor: theme.sidebar.surface,
    borderColor: theme.sidebar.border,
    color: theme.sidebar.text,
  };

  const labelStyle = {
    color: theme.sidebar.muted,
  };

  const badgeStyle = {
    backgroundColor: theme.sidebar.surface,
    color: theme.sidebar.text,
  };

  if (!selectedElement) {
    return (
      <div
        className="h-24 border-t px-4 py-3 flex items-center justify-center text-sm"
        style={{
          backgroundColor: theme.properties.bg,
          borderColor: theme.properties.border,
          color: theme.sidebar.muted,
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

  return (
    <div
      className="h-24 border-t px-4 py-3"
      style={{
        backgroundColor: theme.properties.bg,
        borderColor: theme.properties.border,
      }}
    >
      <div className="flex gap-6 items-start">
        {/* Label and Type */}
        <div className="flex gap-4">
          {isArgumentElement(selectedElement) && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={labelStyle}>Label</label>
                <input
                  type="text"
                  value={selectedElement.label}
                  onChange={(e) => handleChange('label', e.target.value)}
                  className="w-28 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  style={inputStyle}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={labelStyle}>Type</label>
                <span className="px-2 py-1 text-sm rounded capitalize" style={badgeStyle}>
                  {selectedElement.argumentType}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={labelStyle}>Contributor</label>
                <span className="px-2 py-1 text-sm rounded capitalize" style={badgeStyle}>
                  {selectedElement.contributor}
                </span>
              </div>
            </>
          )}
          {isTeacherSupportElement(selectedElement) && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={labelStyle}>Type</label>
                <span className="px-2 py-1 text-sm rounded capitalize" style={badgeStyle}>
                  {selectedElement.supportType}
                </span>
              </div>
              {selectedElement.subtype && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium" style={labelStyle}>Subtype</label>
                  <span className="px-2 py-1 text-sm rounded capitalize" style={badgeStyle}>
                    {selectedElement.subtype}
                  </span>
                </div>
              )}
            </>
          )}
          {isInfoBoxElement(selectedElement) && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={labelStyle}>Label</label>
                <input
                  type="text"
                  value={selectedElement.label}
                  onChange={(e) => handleChange('label', e.target.value)}
                  className="w-28 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  style={inputStyle}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium" style={labelStyle}>Type</label>
                <span className="px-2 py-1 text-sm rounded" style={badgeStyle}>
                  Info Box
                </span>
              </div>
            </>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-xs font-medium" style={labelStyle}>Content</label>
          <textarea
            value={selectedElement.content}
            onChange={(e) => handleChange('content', e.target.value)}
            className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            style={inputStyle}
            rows={2}
            placeholder="Enter element content..."
          />
        </div>

        {/* Attribution */}
        <div className="flex gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={labelStyle}>Speaker</label>
            <input
              type="text"
              value={selectedElement.attribution?.speaker || ''}
              onChange={(e) => handleAttributionChange('speaker', e.target.value)}
              className="w-20 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              style={inputStyle}
              placeholder="e.g., S1"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={labelStyle}>Timestamp</label>
            <input
              type="text"
              value={selectedElement.attribution?.timestamp || ''}
              onChange={(e) => handleAttributionChange('timestamp', e.target.value)}
              className="w-20 px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              style={inputStyle}
              placeholder="00:00"
            />
          </div>
        </div>

        {/* Image Upload (for argument elements) */}
        {isArgumentElement(selectedElement) && (
          <div className="w-32">
            <ImageUpload
              currentImage={selectedElement.image}
              onImageChange={handleImageChange}
            />
          </div>
        )}
      </div>
    </div>
  );
}
