import { useEffect, useRef } from 'react';
import {
  Copy,
  Trash2,
  ArrowUpToLine,
  ArrowDownToLine,
  Users,
  ImagePlus,
  ArrowRightLeft,
} from 'lucide-react';
import { theme } from '../../utils/theme';
import type { ContributorType, SupportContributor, ArgumentType, SupportType } from '../../types';

interface ContextMenuProps {
  x: number;
  y: number;
  elementId: string;
  elementType: 'argument' | 'support' | 'teacherSupport' | 'infoBox' | 'connection';
  onClose: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onChangeContributor?: (contributor: ContributorType) => void;
  onChangeSupportContributor?: (contributor: SupportContributor) => void;
  onConvertToArgument?: (argumentType: ArgumentType) => void;
  onConvertToSupport?: (supportType: SupportType) => void;
  onAddImage?: () => void;
}

export function ContextMenu({
  x,
  y,
  elementType,
  onClose,
  onDuplicate,
  onDelete,
  onBringToFront,
  onSendToBack,
  onChangeContributor,
  onChangeSupportContributor,
  onConvertToArgument,
  onConvertToSupport,
  onAddImage,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  const menuItemClass = `
    w-full px-3 py-2 text-sm text-left flex items-center gap-2
    hover:bg-[#45475a] transition-colors rounded
  `;

  const contributors: { type: ContributorType; label: string }[] = [
    { type: 'given', label: 'Given' },
    { type: 'teacher', label: 'Teacher' },
    { type: 'student', label: 'Student' },
    { type: 'joint', label: 'Joint' },
    { type: 'implicit', label: 'Implicit' },
  ];

  const supportContributors: { type: SupportContributor; label: string }[] = [
    { type: 'teacher', label: 'Teacher' },
    { type: 'student', label: 'Student' },
  ];

  const ARGUMENT_TYPES_FOR_CONVERT: { type: ArgumentType; label: string }[] = [
    { type: 'claim', label: 'Claim' },
    { type: 'data', label: 'Data' },
    { type: 'warrant', label: 'Warrant' },
    { type: 'backing', label: 'Backing' },
    { type: 'qualifier', label: 'Qualifier' },
    { type: 'rebuttal', label: 'Rebuttal' },
  ];

  const SUPPORT_TYPES_FOR_CONVERT: { type: SupportType; label: string }[] = [
    { type: 'action', label: 'Action' },
    { type: 'question', label: 'Question' },
    { type: 'other', label: 'Other' },
  ];

  return (
    <div
      ref={menuRef}
      className="fixed z-50 py-1 rounded-lg shadow-xl min-w-[180px] border"
      style={{
        left: x,
        top: y,
        backgroundColor: theme.sidebar.bg,
        borderColor: theme.sidebar.border,
        color: theme.sidebar.text,
      }}
    >
      {/* Duplicate */}
      {elementType !== 'connection' && (
        <button
          onClick={() => {
            onDuplicate();
            onClose();
          }}
          className={menuItemClass}
        >
          <Copy size={16} />
          Duplicate
        </button>
      )}

      {/* Delete */}
      <button
        onClick={() => {
          onDelete();
          onClose();
        }}
        className={`${menuItemClass} text-red-400 hover:bg-red-500/20`}
      >
        <Trash2 size={16} />
        Delete
      </button>

      {elementType !== 'connection' && (
        <>
          <div
            className="my-1 border-t"
            style={{ borderColor: theme.sidebar.border }}
          />

          {/* Layer ordering */}
          <button
            onClick={() => {
              onBringToFront();
              onClose();
            }}
            className={menuItemClass}
          >
            <ArrowUpToLine size={16} />
            Bring to Front
          </button>

          <button
            onClick={() => {
              onSendToBack();
              onClose();
            }}
            className={menuItemClass}
          >
            <ArrowDownToLine size={16} />
            Send to Back
          </button>
        </>
      )}

      {/* Change contributor (only for argument elements) */}
      {elementType === 'argument' && onChangeContributor && (
        <>
          <div
            className="my-1 border-t"
            style={{ borderColor: theme.sidebar.border }}
          />
          <div className="px-3 py-1 text-xs font-medium" style={{ color: theme.sidebar.muted }}>
            <div className="flex items-center gap-1">
              <Users size={12} />
              Contributor
            </div>
          </div>
          {contributors.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => {
                onChangeContributor(type);
                onClose();
              }}
              className={`${menuItemClass} pl-6`}
            >
              {label}
            </button>
          ))}
        </>
      )}

      {/* Change contributor (only for support elements) */}
      {elementType === 'support' && onChangeSupportContributor && (
        <>
          <div
            className="my-1 border-t"
            style={{ borderColor: theme.sidebar.border }}
          />
          <div className="px-3 py-1 text-xs font-medium" style={{ color: theme.sidebar.muted }}>
            <div className="flex items-center gap-1">
              <Users size={12} />
              Contributor
            </div>
          </div>
          {supportContributors.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => {
                onChangeSupportContributor(type);
                onClose();
              }}
              className={`${menuItemClass} pl-6`}
            >
              {label}
            </button>
          ))}
        </>
      )}

      {/* Add image (for argument and infoBox elements) */}
      {(elementType === 'argument' || elementType === 'infoBox') && onAddImage && (
        <>
          <div
            className="my-1 border-t"
            style={{ borderColor: theme.sidebar.border }}
          />
          <button
            onClick={() => {
              onAddImage();
              onClose();
            }}
            className={menuItemClass}
          >
            <ImagePlus size={16} />
            Add Image
          </button>
        </>
      )}

      {/* Convert to Support (for argument elements) */}
      {elementType === 'argument' && onConvertToSupport && (
        <>
          <div
            className="my-1 border-t"
            style={{ borderColor: theme.sidebar.border }}
          />
          <div className="px-3 py-1 text-xs font-medium" style={{ color: theme.sidebar.muted }}>
            <div className="flex items-center gap-1">
              <ArrowRightLeft size={12} />
              Convert to Support
            </div>
          </div>
          {SUPPORT_TYPES_FOR_CONVERT.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => {
                onConvertToSupport(type);
                onClose();
              }}
              className={`${menuItemClass} pl-6`}
            >
              {label}
            </button>
          ))}
        </>
      )}

      {/* Convert to Argument (for support and teacherSupport elements) */}
      {(elementType === 'support' || elementType === 'teacherSupport') && onConvertToArgument && (
        <>
          <div
            className="my-1 border-t"
            style={{ borderColor: theme.sidebar.border }}
          />
          <div className="px-3 py-1 text-xs font-medium" style={{ color: theme.sidebar.muted }}>
            <div className="flex items-center gap-1">
              <ArrowRightLeft size={12} />
              Convert to Argument
            </div>
          </div>
          {ARGUMENT_TYPES_FOR_CONVERT.map(({ type, label }) => (
            <button
              key={type}
              onClick={() => {
                onConvertToArgument(type);
                onClose();
              }}
              className={`${menuItemClass} pl-6`}
            >
              {label}
            </button>
          ))}
        </>
      )}
    </div>
  );
}
