import type { CloudGroup } from '../../api/types';
import { theme } from '../../utils/theme';
import { AccountChip } from './AccountChip';

interface WorkspaceHeaderProps {
  groupName: string;
  groups: CloudGroup[];
  selectedGroupId: number | null;
  onSelectGroup: (groupId: number) => void;
}

/** "<group name> Workspace" heading + group switcher (only when the user
 *  belongs to more than one group) + the account chip, right-aligned. */
export function WorkspaceHeader({ groupName, groups, selectedGroupId, onSelectGroup }: WorkspaceHeaderProps) {
  return (
    <header
      className="h-16 px-6 flex items-center justify-between border-b flex-shrink-0"
      style={{
        background: theme.toolbar.bgGradient,
        borderColor: theme.toolbar.border,
        boxShadow: theme.toolbar.shadow,
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <h1 className="text-lg font-semibold truncate" style={{ color: theme.sidebar.text }}>
          {groupName ? `${groupName} Workspace` : 'Workspace'}
        </h1>
        {groups.length > 1 && (
          <select
            value={selectedGroupId ?? ''}
            onChange={(e) => onSelectGroup(Number(e.target.value))}
            aria-label="Switch group"
            className="px-2.5 py-1.5 text-sm border rounded-lg cursor-pointer transition-all duration-150 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              backgroundColor: theme.input.bg,
              borderColor: theme.input.border,
              color: theme.input.text,
              outlineColor: theme.focus.ring,
            }}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
      </div>
      <AccountChip />
    </header>
  );
}
