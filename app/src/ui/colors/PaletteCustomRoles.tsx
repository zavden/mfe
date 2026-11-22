/* The roles the user added to a palette, in the palette editor (D154): under the eleven roles, a
 * row for each — its name, its color and a button that deletes it — and a last row that adds one.
 * A name the palette cannot have is said beside its field, and is not sent. */
import { useState } from 'react';
import { CommitInput } from '../creator/CommitInput';
import { HexColorField } from '../project/HexColorField';
import {
  customRoleName,
  PALETTE_CUSTOM_ROLE_LIMIT,
  PALETTE_CUSTOM_ROLE_NAME_LIMIT,
  type PaletteCustomRole,
} from './palette';
import type { CustomRoleChange } from './paletteEdit';

/** The color a new role is offered with: Manim's white. */
const NEW_ROLE_COLOR = '#FFFFFF';

/** Why `name` cannot be the name of a role of `roles` (of the one named `own`, when it is being
 * renamed), or null when it can. */
function nameIssue(name: string, roles: readonly PaletteCustomRole[], own?: string): string | null {
  const taken = new Set(
    roles.filter((role) => role.name !== own).map((role) => role.name.toLowerCase()),
  );
  try {
    customRoleName(name, taken);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

interface PaletteCustomRolesProps {
  roles: readonly PaletteCustomRole[];
  disabled?: boolean;
  onChange(change: CustomRoleChange): void;
}

export function PaletteCustomRoles({ roles, disabled, onChange }: PaletteCustomRolesProps) {
  const [name, setName] = useState('');
  const [color, setColor] = useState(NEW_ROLE_COLOR);
  const full = roles.length >= PALETTE_CUSTOM_ROLE_LIMIT;
  const issue = name.trim() ? nameIssue(name, roles) : null;
  const add = () => {
    if (disabled || full || !name.trim() || issue) return;
    onChange({ do: 'add', name, color });
    setName('');
  };
  return (
    <div
      className="palette-roles palette-custom-roles"
      role="group"
      aria-label="Your roles"
      data-testid="palette-custom-roles"
    >
      <p className="palette-custom-heading">
        Your roles
        <span> — colours of your own, with a name: they are offered wherever a role is chosen</span>
      </p>
      {roles.map((role, index) => (
        <div key={role.name} className="palette-role-row palette-custom-row">
          <CommitInput
            value={role.name}
            label={`Name of the role ${role.name}`}
            testId={`palette-custom-name-${index}`}
            maxLength={PALETTE_CUSTOM_ROLE_NAME_LIMIT}
            normalize={(value) => value.trim()}
            validate={(value) => nameIssue(value, roles, role.name)}
            onCommit={(next) => onChange({ do: 'rename', role: role.name, name: next })}
          />
          <HexColorField
            value={role.color}
            label={`${role.name} colour`}
            testId={`palette-custom-color-${index}`}
            roles={false}
            onCommit={(next) => onChange({ do: 'recolor', role: role.name, color: next })}
          />
          <button
            type="button"
            className="btn btn-small"
            aria-label={`Delete the role ${role.name}`}
            data-testid={`palette-custom-delete-${index}`}
            disabled={disabled}
            onClick={() => onChange({ do: 'delete', role: role.name })}
          >
            Delete
          </button>
        </div>
      ))}
      {full ? (
        <p className="palette-help" data-testid="palette-custom-full">
          A palette holds up to {PALETTE_CUSTOM_ROLE_LIMIT} roles of your own.
        </p>
      ) : (
        <div className="palette-role-row palette-custom-row palette-custom-add">
          <span className="commit-input">
            <input
              type="text"
              aria-label="Name of the new role"
              placeholder="New role…"
              spellCheck={false}
              maxLength={PALETTE_CUSTOM_ROLE_NAME_LIMIT}
              data-testid="palette-custom-new-name"
              value={name}
              aria-invalid={issue ? true : undefined}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') return;
                event.preventDefault();
                add();
              }}
            />
            {issue && (
              <span className="field-error" role="alert" data-testid="palette-custom-new-error">
                {issue}
              </span>
            )}
          </span>
          <HexColorField
            value={color}
            label="Colour of the new role"
            testId="palette-custom-new-color"
            roles={false}
            onCommit={setColor}
          />
          <button
            type="button"
            className="btn btn-small"
            data-testid="palette-custom-add"
            disabled={disabled || !name.trim() || issue !== null}
            onClick={add}
          >
            Add role
          </button>
        </div>
      )}
    </div>
  );
}
