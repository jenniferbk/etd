import { useDiagramStore } from '../../store';
import type { ArgumentElement, TeacherSupportElement, InfoBoxElement, DiagramElement } from '../../types';
import { isArgumentElement, isTeacherSupportElement, isInfoBoxElement } from '../../types';

export function PropertiesPanel() {
  const { elements, selectedIds, updateElement } = useDiagramStore();

  // Get the first selected element
  const selectedElement = selectedIds.length === 1
    ? elements.find((el) => el.id === selectedIds[0])
    : null;

  if (!selectedElement) {
    return (
      <div className="h-32 bg-white border-t border-gray-200 px-4 py-3 flex items-center justify-center text-gray-400 text-sm">
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
    <div className="h-32 bg-white border-t border-gray-200 px-4 py-3">
      <div className="flex gap-6 items-start">
        {/* Label and Type */}
        <div className="flex gap-4">
          {isArgumentElement(selectedElement) && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Label</label>
                <input
                  type="text"
                  value={selectedElement.label}
                  onChange={(e) => handleChange('label', e.target.value)}
                  className="w-32 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Type</label>
                <span className="px-2 py-1 text-sm bg-gray-100 rounded capitalize">
                  {selectedElement.argumentType}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Contributor</label>
                <span className="px-2 py-1 text-sm bg-gray-100 rounded capitalize">
                  {selectedElement.contributor}
                </span>
              </div>
            </>
          )}
          {isTeacherSupportElement(selectedElement) && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Type</label>
                <span className="px-2 py-1 text-sm bg-gray-100 rounded capitalize">
                  {selectedElement.supportType}
                </span>
              </div>
              {selectedElement.subtype && (
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500">Subtype</label>
                  <span className="px-2 py-1 text-sm bg-gray-100 rounded capitalize">
                    {selectedElement.subtype}
                  </span>
                </div>
              )}
            </>
          )}
          {isInfoBoxElement(selectedElement) && (
            <>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Label</label>
                <input
                  type="text"
                  value={selectedElement.label}
                  onChange={(e) => handleChange('label', e.target.value)}
                  className="w-32 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-gray-500">Type</label>
                <span className="px-2 py-1 text-sm bg-gray-100 rounded">
                  Info Box
                </span>
              </div>
            </>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">Content</label>
          <textarea
            value={selectedElement.content}
            onChange={(e) => handleChange('content', e.target.value)}
            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none"
            rows={3}
            placeholder="Enter element content..."
          />
        </div>

        {/* Attribution */}
        <div className="flex gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Speaker</label>
            <input
              type="text"
              value={selectedElement.attribution?.speaker || ''}
              onChange={(e) => handleAttributionChange('speaker', e.target.value)}
              className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="e.g., S1"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-gray-500">Timestamp</label>
            <input
              type="text"
              value={selectedElement.attribution?.timestamp || ''}
              onChange={(e) => handleAttributionChange('timestamp', e.target.value)}
              className="w-20 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="00:00"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
