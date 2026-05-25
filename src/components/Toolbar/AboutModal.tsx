import { Keyboard, Sparkles } from 'lucide-react';
import { theme } from '../../utils/theme';
import { Modal } from '../ui/Modal';

interface AboutModalProps {
  open: boolean;
  onClose: () => void;
}

export function AboutModal({ open, onClose }: AboutModalProps) {
  const features: string[] = [
    'Build Extended Toulmin diagrams by dragging from the palette to the canvas.',
    'Six argument types (claim, data, warrant, backing, qualifier, rebuttal), three support types (action, question, other), and an info box for episode metadata.',
    'Argument contributors: Given, Teacher, Student, Joint, Implicit. Support contributors: Teacher, Student. Border colors and styles reflect the contributor.',
    'Orthogonal connectors auto-route in Manhattan paths. Drag segment midpoints to reshape; drag edge anchors to slide endpoints along a box. Hover an anchor to reset.',
    'Warrants, backings, and rebuttals attach perpendicularly to the data→claim arrow they qualify. Drag a qualifier from the palette onto a connection line to attach it; it slides along the line and rebuttals targeting it render as a vertical line through the qualifier.',
    'Claims that supply data to another claim are auto-labeled "DataClaim"; claims that warrant another are auto-labeled "WarrantClaim". Labels update live as connections change, and any custom rename is preserved.',
    'Configurable subtypes for question, other, and action supports via Settings → Subtypes — added subtypes appear in the palette, properties panel, and transcript object selector.',
    'Transcript panel links lines to elements, with search and a one-click clear (trash icon or right-click on the header).',
    'Save / load JSON, import DiagramMix .drawing files, or import from a photo of a hand-drawn diagram (sent to Google Gemini for extraction — see the Import image dialog for details).',
    "Export to PDF, PNG, SVG, or .diagramx — output covers the full diagram, not just what’s visible on screen.",
    'Full-screen mode (press F) hides the chrome for distraction-free review.',
  ];

  const shortcuts = [
    { keys: 'Ctrl/Cmd + Z', action: 'Undo' },
    { keys: 'Ctrl/Cmd + Shift + Z', action: 'Redo' },
    { keys: 'Ctrl/Cmd + S', action: 'Save diagram' },
    { keys: 'Ctrl/Cmd + O', action: 'Load diagram' },
    { keys: 'Ctrl/Cmd + D', action: 'Duplicate selected' },
    { keys: 'Ctrl/Cmd + A', action: 'Select all' },
    { keys: 'Ctrl/Cmd + +', action: 'Zoom in' },
    { keys: 'Ctrl/Cmd + -', action: 'Zoom out' },
    { keys: 'Ctrl/Cmd + 0', action: 'Fit to view' },
    { keys: 'F', action: 'Toggle full-screen' },
    { keys: 'C', action: 'Toggle connect mode' },
    { keys: 'Delete / Backspace', action: 'Delete selected' },
    { keys: 'Escape', action: 'Cancel / Deselect / Exit full-screen' },
  ];

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="About Extended Toulmin Diagram Editor"
      size="lg"
      initialFocus="primary"
      footer={
        <button
          onClick={onClose}
          data-modal-focus="primary"
          className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ backgroundColor: theme.button.primary.bg, color: theme.button.primary.text }}
        >
          Close
        </button>
      }
    >
      <div className="px-5 py-4 space-y-6">
        {/* Version */}
        <div>
          <p style={{ color: theme.sidebar.text }}>
            <span className="font-medium">Version:</span>{' '}
            <span style={{ color: theme.sidebar.textSecondary }}>1.6 (May 2026)</span>
          </p>
        </div>

        {/* Credits */}
        <div>
          <h3 className="text-sm font-medium mb-2" style={{ color: theme.sidebar.text }}>
            Credits
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: theme.sidebar.textSecondary }}>
            App design and coding by{' '}
            <span style={{ color: theme.sidebar.accent }}>Jennifer Kleiman</span>.<br />
            Based on the Extended Toulmin Framework developed by{' '}
            <span style={{ color: theme.sidebar.accent }}>AnnaMarie Conner</span>{' '}
            for analyzing mathematical argumentation in classroom discourse.
          </p>
        </div>

        {/* Features */}
        <div>
          <h3
            className="text-sm font-medium mb-3 flex items-center gap-2"
            style={{ color: theme.sidebar.text }}
          >
            <Sparkles size={16} />
            Features
          </h3>
          <ul
            className="text-sm leading-relaxed space-y-1.5 list-disc pl-5"
            style={{ color: theme.sidebar.textSecondary }}
          >
            {features.map((feature, i) => (
              <li key={i}>{feature}</li>
            ))}
          </ul>
        </div>

        {/* Shortcuts */}
        <div>
          <h3
            className="text-sm font-medium mb-3 flex items-center gap-2"
            style={{ color: theme.sidebar.text }}
          >
            <Keyboard size={16} />
            Keyboard Shortcuts
          </h3>
          <div
            className="rounded-lg overflow-hidden"
            style={{ border: `1px solid ${theme.sidebar.border}` }}
          >
            <table className="w-full text-sm">
              <tbody>
                {shortcuts.map((shortcut, index) => (
                  <tr
                    key={shortcut.keys}
                    style={index % 2 === 0 ? { backgroundColor: theme.sidebar.hover } : undefined}
                  >
                    <td
                      className="px-3 py-2 font-mono text-xs"
                      style={{ color: theme.sidebar.accent }}
                    >
                      {shortcut.keys}
                    </td>
                    <td className="px-3 py-2" style={{ color: theme.sidebar.textSecondary }}>
                      {shortcut.action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </Modal>
  );
}
