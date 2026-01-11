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

  const SectionHeader = ({
    label,
    section,
    isExpanded,
  }: {
    label: string;
    section: keyof typeof expandedSections;
    isExpanded: boolean;
  }) => (
    <button
      onClick={() => toggleSection(section)}
      className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg transition-all duration-150"
      style={{
        color: theme.sidebar.textSecondary,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.backgroundColor = theme.sidebar.surfaceHover;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.backgroundColor = 'transparent';
      }}
    >
      <span className="text-xs font-semibold uppercase tracking-wider">{label}</span>
      <ChevronDown
        size={14}
        className={`transition-transform duration-200 ${isExpanded ? '' : '-rotate-90'}`}
        style={{ color: theme.sidebar.muted }}
      />
    </button>
  );

  return (
    <div
      className="w-64 border-r flex flex-col overflow-y-auto"
      style={{
        background: theme.sidebar.bgGradient,
        borderColor: theme.sidebar.border,
      }}
    >
      {/* Header */}
      <div
        className="px-5 py-4 border-b"
        style={{ borderColor: theme.sidebar.border }}
      >
        <h2
          className="font-semibold text-sm uppercase tracking-wider"
          style={{ color: theme.sidebar.text }}
        >
          Elements
        </h2>
      </div>

      <div className="p-4 flex flex-col gap-4">

      {/* Connect Mode Toggle */}
      <button
        onClick={onToggleConnectMode}
        className={`w-full px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 flex items-center justify-center gap-2.5 ${
          connectMode
            ? 'shadow-lg'
            : ''
        }`}
        style={connectMode ? {
          backgroundColor: theme.sidebar.accent,
          color: theme.colors.void[950],
          boxShadow: `0 4px 14px ${theme.colors.accent.glow}`,
        } : {
          backgroundColor: theme.sidebar.surface,
          color: theme.sidebar.text,
        }}
        onMouseEnter={(e) => {
          if (!connectMode) {
            e.currentTarget.style.backgroundColor = theme.sidebar.surfaceHover;
          }
        }}
        onMouseLeave={(e) => {
          if (!connectMode) {
            e.currentTarget.style.backgroundColor = theme.sidebar.surface;
          }
        }}
      >
        <Link2 size={18} />
        {connectMode ? 'Connecting...' : 'Connect Mode'}
        <kbd
          className="ml-auto px-1.5 py-0.5 text-[10px] rounded font-mono"
          style={{
            backgroundColor: connectMode ? 'rgba(0,0,0,0.2)' : theme.sidebar.bg,
            color: connectMode ? theme.colors.void[950] : theme.sidebar.muted,
          }}
        >
          C
        </kbd>
      </button>

      {/* Argument Elements */}
      <div className="space-y-2">
        <SectionHeader
          label="Argument Components"
          section="arguments"
          isExpanded={expandedSections.arguments}
        />
        {expandedSections.arguments && (
          <div className="grid grid-cols-2 gap-2 px-1">
            {ARGUMENT_TYPES.map(({ type, label }) => (
              <button
                key={type}
                onClick={() => handleAddArgument(type)}
                className="px-3 py-2.5 text-left text-sm rounded-lg transition-all duration-150 hover:scale-[1.02] active:scale-[0.98]"
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
        <SectionHeader
          label="Contributor Type"
          section="contributor"
          isExpanded={expandedSections.contributor}
        />
        {expandedSections.contributor && (
          <div className="space-y-1 px-1">
            {CONTRIBUTOR_TYPES.map(({ type, label, color }) => (
              <label
                key={type}
                className="flex items-center gap-3 cursor-pointer px-3 py-2.5 rounded-lg transition-all duration-150"
                style={{
                  backgroundColor: selectedContributor === type ? theme.sidebar.surfaceHover : 'transparent',
                }}
                onMouseEnter={(e) => {
                  if (selectedContributor !== type) {
                    e.currentTarget.style.backgroundColor = theme.sidebar.surface;
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedContributor !== type) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }
                }}
              >
                <input
                  type="radio"
                  name="contributor"
                  value={type}
                  checked={selectedContributor === type}
                  onChange={() => setSelectedContributor(type)}
                  className="sr-only"
                />
                <span
                  className="w-5 h-5 rounded flex-shrink-0 transition-transform duration-150"
                  style={{
                    borderWidth: '3px',
                    borderColor: color,
                    borderStyle: type === 'student' || type === 'joint' ? 'dashed' : 'solid',
                    transform: selectedContributor === type ? 'scale(1.1)' : 'scale(1)',
                    boxShadow: selectedContributor === type ? `0 0 8px ${color}40` : 'none',
                  }}
                />
                <span
                  className="text-sm font-medium"
                  style={{ color: selectedContributor === type ? theme.sidebar.text : theme.sidebar.textSecondary }}
                >
                  {label}
                </span>
                {selectedContributor === type && (
                  <span
                    className="ml-auto w-2 h-2 rounded-full"
                    style={{ backgroundColor: theme.sidebar.accent }}
                  />
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Teacher Support */}
      <div
        className="space-y-2 border-t pt-4"
        style={{ borderColor: theme.sidebar.border }}
      >
        <SectionHeader
          label="Teacher Support"
          section="teacher"
          isExpanded={expandedSections.teacher}
        />
        {expandedSections.teacher && (
          <div className="space-y-2 px-1">
            <button
              onClick={() => handleAddTeacherSupport('action')}
              className="w-full px-4 py-2.5 text-left text-sm border-2 rounded-full transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] font-medium"
              style={{ borderColor: COLORS.teacherAction, color: COLORS.teacherAction, backgroundColor: 'transparent' }}
            >
              Action
            </button>
            <button
              onClick={() => handleAddTeacherSupport('question')}
              className="w-full px-4 py-2.5 text-left text-sm border-2 rounded-lg transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] font-medium"
              style={{ borderColor: COLORS.question, backgroundColor: COLORS.questionFill, color: '#0d7377' }}
            >
              Question
            </button>
            <div className="space-y-2">
              <button
                onClick={() => handleAddTeacherSupport('other')}
                className="w-full px-4 py-2.5 text-left text-sm border-2 rounded-lg transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] font-medium"
                style={{ borderColor: COLORS.otherSupport, backgroundColor: COLORS.otherSupportFill, color: '#9a7b0a' }}
              >
                Other Support
              </button>
              <select
                value={selectedSubtype}
                onChange={(e) => setSelectedSubtype(e.target.value as OtherSupportSubtype)}
                className="w-full px-3 py-2 text-sm rounded-lg border transition-colors duration-150"
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
        className="space-y-2 border-t pt-4"
        style={{ borderColor: theme.sidebar.border }}
      >
        <SectionHeader
          label="Annotations"
          section="annotations"
          isExpanded={expandedSections.annotations}
        />
        {expandedSections.annotations && (
          <div className="px-1">
            <button
              onClick={handleAddInfoBox}
              className="w-full px-4 py-2.5 text-left text-sm border-2 rounded-lg transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] font-medium"
              style={{
                borderColor: theme.sidebar.border,
                color: theme.sidebar.text,
                backgroundColor: 'transparent',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = theme.sidebar.muted;
                e.currentTarget.style.backgroundColor = theme.sidebar.surface;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = theme.sidebar.border;
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
            >
              Info Box
            </button>
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
