import { useState } from 'react';
import { useDiagramStore } from '../../store';
import type {
  ArgumentType,
  ContributorType,
  ArgumentElement,
  TeacherSupportElement,
  TeacherSupportType,
  OtherSupportSubtype,
  InfoBoxElement,
} from '../../types';
import { COLORS } from '../../utils/colors';

const ARGUMENT_TYPES: { type: ArgumentType; label: string }[] = [
  { type: 'data', label: 'Data' },
  { type: 'claim', label: 'Claim' },
  { type: 'warrant', label: 'Warrant' },
  { type: 'backing', label: 'Backing' },
  { type: 'qualifier', label: 'Qualifier' },
  { type: 'rebuttal', label: 'Rebuttal' },
];

const CONTRIBUTOR_TYPES: { type: ContributorType; label: string; color: string }[] = [
  { type: 'given', label: 'Given', color: COLORS.given },
  { type: 'student', label: 'Student', color: COLORS.student },
  { type: 'joint', label: 'Joint', color: COLORS.joint },
  { type: 'implicit', label: 'Implicit', color: COLORS.implicit },
];

const OTHER_SUPPORT_SUBTYPES: OtherSupportSubtype[] = [
  'displays',
  'suggests',
  'summarizes',
  'restates',
  'highlights',
  'validates',
];

interface PaletteProps {
  connectMode: boolean;
  onToggleConnectMode: () => void;
}

export function Palette({ connectMode, onToggleConnectMode }: PaletteProps) {
  const [selectedContributor, setSelectedContributor] = useState<ContributorType>('student');
  const [selectedSubtype, setSelectedSubtype] = useState<OtherSupportSubtype>('displays');
  const addElement = useDiagramStore((state) => state.addElement);
  const elements = useDiagramStore((state) => state.elements);

  const generateId = () => `elem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const countElementsOfType = (type: ArgumentType): number => {
    return elements.filter(
      (el) => el.type === 'argument' && (el as ArgumentElement).argumentType === type
    ).length;
  };

  const handleAddArgument = (argumentType: ArgumentType) => {
    const count = countElementsOfType(argumentType) + 1;
    const label = `${argumentType.charAt(0).toUpperCase() + argumentType.slice(1)} ${count}`;

    const newElement: ArgumentElement = {
      id: generateId(),
      type: 'argument',
      argumentType,
      contributor: selectedContributor,
      label,
      content: '',
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 200 },
      size: selectedContributor === 'implicit'
        ? { width: 140, height: 60 }
        : { width: 180, height: 80 },
    };

    addElement(newElement);
  };

  const handleAddTeacherSupport = (supportType: TeacherSupportType) => {
    const newElement: TeacherSupportElement = {
      id: generateId(),
      type: 'teacherSupport',
      supportType,
      subtype: supportType === 'other' ? selectedSubtype : undefined,
      content: '',
      position: { x: 150 + Math.random() * 200, y: 150 + Math.random() * 200 },
      size: supportType === 'action'
        ? { width: 140, height: 60 }
        : { width: 160, height: 50 },
    };

    addElement(newElement);
  };

  const countInfoBoxes = (): number => {
    return elements.filter((el) => el.type === 'infoBox').length;
  };

  const handleAddInfoBox = () => {
    const count = countInfoBoxes() + 1;
    const newElement: InfoBoxElement = {
      id: generateId(),
      type: 'infoBox',
      label: `Info ${count}`,
      content: '',
      position: { x: 200 + Math.random() * 200, y: 200 + Math.random() * 200 },
      size: { width: 200, height: 100 },
    };

    addElement(newElement);
  };

  return (
    <div className="w-60 bg-white border-r border-gray-200 p-4 flex flex-col gap-4 overflow-y-auto">
      <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide">
        Elements
      </h2>

      {/* Connect Mode Toggle */}
      <button
        onClick={onToggleConnectMode}
        className={`w-full px-3 py-2 text-sm font-medium rounded transition-colors ${
          connectMode
            ? 'bg-blue-500 text-white'
            : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
        }`}
      >
        {connectMode ? '✓ Connect Mode (C)' : 'Connect Mode (C)'}
      </button>

      {/* Argument Elements */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-gray-500">Argument Components</h3>
        {ARGUMENT_TYPES.map(({ type, label }) => (
          <button
            key={type}
            onClick={() => handleAddArgument(type)}
            className="w-full px-3 py-2 text-left text-sm border rounded hover:bg-gray-50 transition-colors"
            style={{
              borderColor: CONTRIBUTOR_TYPES.find((c) => c.type === selectedContributor)?.color,
              borderStyle: selectedContributor === 'student' || selectedContributor === 'joint' ? 'dashed' : 'solid',
              borderWidth: '2px',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Contributor Selector */}
      <div className="space-y-2">
        <h3 className="text-xs font-medium text-gray-500">Contributor Type</h3>
        {CONTRIBUTOR_TYPES.map(({ type, label, color }) => (
          <label
            key={type}
            className="flex items-center gap-2 cursor-pointer"
          >
            <input
              type="radio"
              name="contributor"
              value={type}
              checked={selectedContributor === type}
              onChange={() => setSelectedContributor(type)}
              className="w-4 h-4"
            />
            <span
              className="w-4 h-4 border-2 rounded-sm"
              style={{
                borderColor: color,
                borderStyle: type === 'student' || type === 'joint' ? 'dashed' : 'solid',
              }}
            />
            <span className="text-sm text-gray-700">{label}</span>
          </label>
        ))}
      </div>

      {/* Teacher Support */}
      <div className="space-y-2 border-t pt-4">
        <h3 className="text-xs font-medium text-gray-500">Teacher Support</h3>
        <button
          onClick={() => handleAddTeacherSupport('action')}
          className="w-full px-3 py-2 text-left text-sm border-2 rounded-full hover:bg-red-50 transition-colors"
          style={{ borderColor: COLORS.teacherAction, color: COLORS.teacherAction }}
        >
          Action
        </button>
        <button
          onClick={() => handleAddTeacherSupport('question')}
          className="w-full px-3 py-2 text-left text-sm border-2 rounded-lg hover:opacity-80 transition-colors"
          style={{ borderColor: COLORS.question, backgroundColor: COLORS.questionFill }}
        >
          Question
        </button>
        <div className="space-y-1">
          <button
            onClick={() => handleAddTeacherSupport('other')}
            className="w-full px-3 py-2 text-left text-sm border-2 rounded-lg hover:opacity-80 transition-colors"
            style={{ borderColor: COLORS.otherSupport, backgroundColor: COLORS.otherSupportFill }}
          >
            Other Support
          </button>
          <select
            value={selectedSubtype}
            onChange={(e) => setSelectedSubtype(e.target.value as OtherSupportSubtype)}
            className="w-full px-2 py-1 text-xs border border-gray-300 rounded"
          >
            {OTHER_SUPPORT_SUBTYPES.map((subtype) => (
              <option key={subtype} value={subtype}>
                {subtype.charAt(0).toUpperCase() + subtype.slice(1)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Info Box */}
      <div className="space-y-2 border-t pt-4">
        <h3 className="text-xs font-medium text-gray-500">Annotations</h3>
        <button
          onClick={handleAddInfoBox}
          className="w-full px-3 py-2 text-left text-sm border-2 border-black rounded hover:bg-gray-50 transition-colors"
        >
          Info Box
        </button>
      </div>
    </div>
  );
}
