import { useState } from 'react';
import { ChevronDown, Link2 } from 'lucide-react';
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
import { theme } from '../../utils/theme';

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
  const [expandedSections, setExpandedSections] = useState({
    arguments: true,
    contributor: true,
    teacher: true,
    annotations: true,
  });
  const addElement = useDiagramStore((state) => state.addElement);
  const elements = useDiagramStore((state) => state.elements);

  const generateId = () => `elem-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  const toggleSection = (section: keyof typeof expandedSections) => {
    setExpandedSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

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

  const sectionHeaderClass = `
    flex items-center justify-between w-full py-2 text-xs font-semibold uppercase tracking-wider
    cursor-pointer hover:opacity-80 transition-opacity
  `;

  return (
    <div
      className="w-60 border-r p-4 flex flex-col gap-3 overflow-y-auto"
      style={{
        backgroundColor: theme.sidebar.bg,
        borderColor: theme.sidebar.border,
      }}
    >
      <h2
        className="font-semibold text-sm uppercase tracking-wide"
        style={{ color: theme.sidebar.text }}
      >
        Elements
      </h2>

      {/* Connect Mode Toggle */}
      <button
        onClick={onToggleConnectMode}
        className={`w-full px-3 py-2.5 text-sm font-medium rounded-lg transition-all duration-150 flex items-center justify-center gap-2 ${
          connectMode
            ? 'bg-blue-500 text-white'
            : ''
        }`}
        style={!connectMode ? {
          backgroundColor: theme.sidebar.surface,
          color: theme.sidebar.text,
        } : {}}
      >
        <Link2 size={16} />
        {connectMode ? 'Connecting... (C)' : 'Connect Mode (C)'}
      </button>

      {/* Argument Elements */}
      <div className="space-y-2">
        <button
          onClick={() => toggleSection('arguments')}
          className={sectionHeaderClass}
          style={{ color: theme.sidebar.muted }}
        >
          <span>Argument Components</span>
          <ChevronDown
            size={14}
            className={`transition-transform ${expandedSections.arguments ? '' : '-rotate-90'}`}
          />
        </button>
        {expandedSections.arguments && (
          <div className="space-y-1.5">
            {ARGUMENT_TYPES.map(({ type, label }) => (
              <button
                key={type}
                onClick={() => handleAddArgument(type)}
                className="w-full px-3 py-2 text-left text-sm rounded-lg hover:opacity-90 transition-all"
                style={{
                  backgroundColor: theme.sidebar.surface,
                  color: theme.sidebar.text,
                  borderWidth: '2px',
                  borderColor: CONTRIBUTOR_TYPES.find((c) => c.type === selectedContributor)?.color,
                  borderStyle: selectedContributor === 'student' || selectedContributor === 'joint' ? 'dashed' : 'solid',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Contributor Selector */}
      <div className="space-y-2">
        <button
          onClick={() => toggleSection('contributor')}
          className={sectionHeaderClass}
          style={{ color: theme.sidebar.muted }}
        >
          <span>Contributor Type</span>
          <ChevronDown
            size={14}
            className={`transition-transform ${expandedSections.contributor ? '' : '-rotate-90'}`}
          />
        </button>
        {expandedSections.contributor && (
          <div className="space-y-2">
            {CONTRIBUTOR_TYPES.map(({ type, label, color }) => (
              <label
                key={type}
                className="flex items-center gap-2.5 cursor-pointer px-2 py-1.5 rounded-lg hover:bg-[#313244]/50 transition-colors"
              >
                <input
                  type="radio"
                  name="contributor"
                  value={type}
                  checked={selectedContributor === type}
                  onChange={() => setSelectedContributor(type)}
                  className="w-4 h-4 accent-blue-500"
                />
                <span
                  className="w-4 h-4 border-2 rounded-sm flex-shrink-0"
                  style={{
                    borderColor: color,
                    borderStyle: type === 'student' || type === 'joint' ? 'dashed' : 'solid',
                  }}
                />
                <span className="text-sm" style={{ color: theme.sidebar.text }}>
                  {label}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Teacher Support */}
      <div
        className="space-y-2 border-t pt-3"
        style={{ borderColor: theme.sidebar.border }}
      >
        <button
          onClick={() => toggleSection('teacher')}
          className={sectionHeaderClass}
          style={{ color: theme.sidebar.muted }}
        >
          <span>Teacher Support</span>
          <ChevronDown
            size={14}
            className={`transition-transform ${expandedSections.teacher ? '' : '-rotate-90'}`}
          />
        </button>
        {expandedSections.teacher && (
          <div className="space-y-1.5">
            <button
              onClick={() => handleAddTeacherSupport('action')}
              className="w-full px-3 py-2 text-left text-sm border-2 rounded-full hover:opacity-90 transition-all"
              style={{ borderColor: COLORS.teacherAction, color: COLORS.teacherAction, backgroundColor: 'transparent' }}
            >
              Action
            </button>
            <button
              onClick={() => handleAddTeacherSupport('question')}
              className="w-full px-3 py-2 text-left text-sm border-2 rounded-lg hover:opacity-90 transition-all"
              style={{ borderColor: COLORS.question, backgroundColor: COLORS.questionFill }}
            >
              Question
            </button>
            <div className="space-y-1.5">
              <button
                onClick={() => handleAddTeacherSupport('other')}
                className="w-full px-3 py-2 text-left text-sm border-2 rounded-lg hover:opacity-90 transition-all"
                style={{ borderColor: COLORS.otherSupport, backgroundColor: COLORS.otherSupportFill }}
              >
                Other Support
              </button>
              <select
                value={selectedSubtype}
                onChange={(e) => setSelectedSubtype(e.target.value as OtherSupportSubtype)}
                className="w-full px-2 py-1.5 text-xs rounded-lg border"
                style={{
                  backgroundColor: theme.sidebar.surface,
                  borderColor: theme.sidebar.border,
                  color: theme.sidebar.text,
                }}
              >
                {OTHER_SUPPORT_SUBTYPES.map((subtype) => (
                  <option key={subtype} value={subtype}>
                    {subtype.charAt(0).toUpperCase() + subtype.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Info Box */}
      <div
        className="space-y-2 border-t pt-3"
        style={{ borderColor: theme.sidebar.border }}
      >
        <button
          onClick={() => toggleSection('annotations')}
          className={sectionHeaderClass}
          style={{ color: theme.sidebar.muted }}
        >
          <span>Annotations</span>
          <ChevronDown
            size={14}
            className={`transition-transform ${expandedSections.annotations ? '' : '-rotate-90'}`}
          />
        </button>
        {expandedSections.annotations && (
          <button
            onClick={handleAddInfoBox}
            className="w-full px-3 py-2 text-left text-sm border-2 border-white/50 rounded-lg hover:bg-white/10 transition-all"
            style={{ color: theme.sidebar.text }}
          >
            Info Box
          </button>
        )}
      </div>
    </div>
  );
}
