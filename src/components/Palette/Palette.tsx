import { useState, useEffect } from 'react';
import { ChevronDown, Link2 } from 'lucide-react';
import { useDiagramStore } from '../../store';
import type {
  ArgumentType,
  ContributorType,
  ArgumentElement,
  SupportElement,
  SupportType,
  SupportContributor,
  InfoBoxElement,
} from '../../types';
import { COLORS, getSupportColors } from '../../utils/colors';
import { theme } from '../../utils/theme';


const CONTRIBUTOR_TYPES: { type: ContributorType; label: string; color: string }[] = [
  { type: 'given', label: 'Given', color: COLORS.given },
  { type: 'student', label: 'Student', color: COLORS.student },
  { type: 'teacher', label: 'Teacher', color: COLORS.teacher },
  { type: 'joint', label: 'Joint', color: COLORS.joint },
  { type: 'implicit', label: 'Implicit', color: COLORS.implicit },
];


const SUPPORT_CONTRIBUTORS: { type: SupportContributor; label: string; color: string }[] = [
  { type: 'teacher', label: 'Teacher', color: COLORS.teacher },
  { type: 'student', label: 'Student', color: COLORS.student },
];

interface PaletteProps {
  connectMode: boolean;
  onToggleConnectMode: () => void;
}

export function Palette({ connectMode, onToggleConnectMode }: PaletteProps) {
  const addElement = useDiagramStore((state) => state.addElement);
  const elements = useDiagramStore((state) => state.elements);
  const styleConfig = useDiagramStore((s) => s.styleConfig);

  const ARGUMENT_TYPES: { type: ArgumentType; label: string }[] = [
    { type: 'data',      label: styleConfig.argumentTypes.data.label },
    { type: 'claim',     label: styleConfig.argumentTypes.claim.label },
    { type: 'warrant',   label: styleConfig.argumentTypes.warrant.label },
    { type: 'backing',   label: styleConfig.argumentTypes.backing.label },
    { type: 'qualifier', label: styleConfig.argumentTypes.qualifier.label },
    { type: 'rebuttal',  label: styleConfig.argumentTypes.rebuttal.label },
  ];

  const SUPPORT_SUBTYPES = styleConfig.otherSubtypes;

  const [selectedContributor, setSelectedContributor] = useState<ContributorType>('student');
  const [selectedSupportContributor, setSelectedSupportContributor] = useState<SupportContributor>('teacher');
  const [selectedSubtype, setSelectedSubtype] = useState<string>(
    styleConfig.otherSubtypes[0]?.id ?? 'displays'
  );
  const [expandedSections, setExpandedSections] = useState({
    arguments: true,
    contributor: true,
    support: true,
    annotations: true,
  });

  useEffect(() => {
    const exists = styleConfig.otherSubtypes.some((s) => s.id === selectedSubtype);
    if (!exists && styleConfig.otherSubtypes[0]) {
      setSelectedSubtype(styleConfig.otherSubtypes[0].id);
    }
  }, [styleConfig.otherSubtypes, selectedSubtype]);

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

  const handleAddSupport = (supportType: SupportType) => {
    const newElement: SupportElement = {
      id: generateId(),
      type: 'support',
      contributor: selectedSupportContributor,
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
          backgroundColor: theme.button.primary.bg,
          color: theme.button.primary.text,
          boxShadow: theme.shadow.md,
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
            backgroundColor: connectMode ? 'rgba(61, 74, 50, 0.35)' : theme.sidebar.bg,
            color: connectMode ? theme.button.primary.text : theme.sidebar.muted,
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
            {ARGUMENT_TYPES.map(({ type, label }) => {
              // Implicit contributor can only create warrants.
              const isDisabled = selectedContributor === 'implicit' && type !== 'warrant';
              return (
                <button
                  key={type}
                  onClick={() => !isDisabled && handleAddArgument(type)}
                  disabled={isDisabled}
                  className="px-3 py-2 text-left text-sm rounded-md transition-colors duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{
                    backgroundColor: theme.sidebar.surface,
                    color: theme.sidebar.text,
                    borderWidth: '1px',
                    borderColor: theme.sidebar.border,
                    borderStyle: 'solid',
                  }}
                  onMouseEnter={(e) => {
                    if (isDisabled) return;
                    e.currentTarget.style.backgroundColor = theme.sidebar.surfaceHover;
                    e.currentTarget.style.borderColor = theme.sidebar.accent;
                  }}
                  onMouseLeave={(e) => {
                    if (isDisabled) return;
                    e.currentTarget.style.backgroundColor = theme.sidebar.surface;
                    e.currentTarget.style.borderColor = theme.sidebar.border;
                  }}
                >
                  {label}
                </button>
              );
            })}
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
          <div className="space-y-0.5 px-1">
            {CONTRIBUTOR_TYPES.map(({ type, label, color }) => {
              const isSelected = selectedContributor === type;
              return (
                <label
                  key={type}
                  className="flex items-center gap-2.5 cursor-pointer px-2.5 py-1.5 rounded-md transition-colors duration-100"
                  style={{
                    backgroundColor: isSelected ? theme.sidebar.surfaceActive : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = theme.sidebar.surfaceHover;
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <input
                    type="radio"
                    name="contributor"
                    value={type}
                    checked={isSelected}
                    onChange={() => setSelectedContributor(type)}
                    className="sr-only"
                  />
                  <span
                    aria-hidden="true"
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{
                      backgroundColor: color,
                      borderWidth: type === 'student' ? '1px' : '0',
                      borderStyle: 'dashed',
                      borderColor: color,
                      boxShadow: isSelected ? `0 0 0 2px ${theme.sidebar.bg}, 0 0 0 3px ${color}` : 'none',
                    }}
                  />
                  <span
                    className="text-sm"
                    style={{
                      color: isSelected ? theme.sidebar.text : theme.sidebar.textSecondary,
                      fontWeight: isSelected ? 500 : 400,
                    }}
                  >
                    {label}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Support (Teacher or Student) */}
      <div
        className="space-y-2 border-t pt-4"
        style={{ borderColor: theme.sidebar.border }}
      >
        <SectionHeader
          label="Support"
          section="support"
          isExpanded={expandedSections.support}
        />
        {expandedSections.support && (
          <div className="space-y-2 px-1">
            {/* Contributor Selector for Support */}
            <div className="flex gap-2 mb-2">
              {SUPPORT_CONTRIBUTORS.map(({ type, label, color }) => (
                <button
                  key={type}
                  onClick={() => setSelectedSupportContributor(type)}
                  className="flex-1 px-2 py-1.5 text-xs font-medium rounded-lg transition-all duration-150"
                  style={{
                    backgroundColor: selectedSupportContributor === type ? color + '20' : theme.sidebar.surface,
                    color: selectedSupportContributor === type ? color : theme.sidebar.textSecondary,
                    borderWidth: '2px',
                    borderColor: selectedSupportContributor === type ? color : 'transparent',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              onClick={() => handleAddSupport('action')}
              className="w-full px-4 py-2.5 text-left text-sm border-2 rounded-full transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] font-medium"
              style={{
                borderColor: getSupportColors('action', selectedSupportContributor).border,
                color: getSupportColors('action', selectedSupportContributor).border,
                backgroundColor: 'transparent'
              }}
            >
              {styleConfig.supportTypes.action.label}
            </button>
            <button
              onClick={() => handleAddSupport('question')}
              className="w-full px-4 py-2.5 text-left text-sm border-2 rounded-lg transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] font-medium"
              style={{ borderColor: COLORS.question, backgroundColor: COLORS.questionFill, color: '#0d7377' }}
            >
              {styleConfig.supportTypes.question.label}
            </button>
            <div className="space-y-2">
              <button
                onClick={() => handleAddSupport('other')}
                className="w-full px-4 py-2.5 text-left text-sm border-2 rounded-lg transition-all duration-150 hover:scale-[1.02] active:scale-[0.98] font-medium"
                style={{ borderColor: COLORS.otherSupport, backgroundColor: COLORS.otherSupportFill, color: '#9a7b0a' }}
              >
                {styleConfig.supportTypes.other.label}
              </button>
              <select
                value={selectedSubtype}
                onChange={(e) => setSelectedSubtype(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border transition-colors duration-150"
                style={{
                  backgroundColor: theme.sidebar.surface,
                  borderColor: theme.sidebar.border,
                  color: theme.sidebar.text,
                }}
              >
                {SUPPORT_SUBTYPES.map((subtype) => (
                  <option key={subtype.id} value={subtype.id}>
                    {subtype.label}
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
