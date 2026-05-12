import { useEffect, useRef, useState } from 'react';
import { Download, FileImage, FileText, FileJson, FileCode } from 'lucide-react';
import { IconButton } from './IconButton';
import { MenuItem } from './MenuItem';
import { useMenu } from './useMenu';
import { theme } from '../../utils/theme';

export type ExportVariant = 'png' | 'svg' | 'pdf' | 'diagramx';

interface ExportMenuProps {
  onExportPNG: () => void | Promise<void>;
  onExportSVG: () => void | Promise<void>;
  onExportPDF: () => void | Promise<void>;
  onExportDiagramx: () => void | Promise<void>;
}

const ITEM_COUNT = 4;

export function ExportMenu({
  onExportPNG,
  onExportSVG,
  onExportPDF,
  onExportDiagramx,
}: ExportMenuProps) {
  const { isOpen, toggle, close, menuRef, triggerRef } = useMenu();
  const [exporting, setExporting] = useState<ExportVariant | null>(null);
  const activeIndexRef = useRef(0);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // When the menu opens, reset focus to the first item on the next frame.
  useEffect(() => {
    if (isOpen) {
      activeIndexRef.current = 0;
      requestAnimationFrame(() => itemRefs.current[0]?.focus());
    }
  }, [isOpen]);

  function runExport(variant: ExportVariant, handler: () => void | Promise<void>) {
    setExporting(variant);
    close();
    Promise.resolve(handler()).finally(() => setExporting(null));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = (activeIndexRef.current + 1) % ITEM_COUNT;
      activeIndexRef.current = next;
      itemRefs.current[next]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = (activeIndexRef.current - 1 + ITEM_COUNT) % ITEM_COUNT;
      activeIndexRef.current = prev;
      itemRefs.current[prev]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      activeIndexRef.current = 0;
      itemRefs.current[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      activeIndexRef.current = ITEM_COUNT - 1;
      itemRefs.current[ITEM_COUNT - 1]?.focus();
    }
  }

  function handleBlur(e: React.FocusEvent<HTMLDivElement>) {
    // Close if focus moves outside the menu container AND outside the trigger.
    const next = e.relatedTarget as Node | null;
    if (!next) return;
    if (menuRef.current?.contains(next)) return;
    if (triggerRef.current?.contains(next)) return;
    close();
  }

  return (
    <div className="relative inline-flex">
      <IconButton
        ref={triggerRef}
        onClick={toggle}
        icon={Download}
        tooltip="Export…"
        ariaHasPopup
        ariaExpanded={isOpen}
        ariaLabel="Export options"
        isLoading={exporting !== null}
      />

      {isOpen && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Export options"
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          className="absolute right-0 rounded-lg py-1"
          style={{
            top: 'calc(100% + 4px)',
            width: 220,
            backgroundColor: theme.sidebar.surface,
            border: `1px solid ${theme.sidebar.border}`,
            boxShadow: theme.shadow.md,
            zIndex: theme.z.dropdown,
          }}
        >
          <MenuItem
            ref={(el) => { itemRefs.current[0] = el; }}
            icon={FileImage}
            label="Export as PNG"
            onClick={() => runExport('png', onExportPNG)}
            isLoading={exporting === 'png'}
          />
          <MenuItem
            ref={(el) => { itemRefs.current[1] = el; }}
            icon={FileCode}
            label="Export as SVG"
            onClick={() => runExport('svg', onExportSVG)}
            isLoading={exporting === 'svg'}
          />
          <MenuItem
            ref={(el) => { itemRefs.current[2] = el; }}
            icon={FileText}
            label="Export as PDF"
            onClick={() => runExport('pdf', onExportPDF)}
            isLoading={exporting === 'pdf'}
          />
          <MenuItem
            ref={(el) => { itemRefs.current[3] = el; }}
            icon={FileJson}
            label="Export as DiagramMix"
            onClick={() => runExport('diagramx', onExportDiagramx)}
            isLoading={exporting === 'diagramx'}
          />
        </div>
      )}
    </div>
  );
}
