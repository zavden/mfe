import { useState } from 'react';
import { ContextMenu } from '../ContextMenu';
import { PALETTE_ROLES } from './palette';
import { usePaletteStore } from './paletteStore';
import './palettes.css';

/* The colors of the active palette by role, wherever a color is chosen: its eleven roles, then the
 * roles the user added to it (D154). `named` shows each as a block with its name beside its
 * color, two to a line, the user's roles under a heading of their own; without it they are
 * swatches in a row, their names in the tooltips. */
export function PaletteRoleChoices({
  onPick,
  testIdPrefix,
  disabled,
  menu = false,
  named = false,
}: {
  onPick(hex: string): void;
  testIdPrefix: string;
  disabled?: boolean;
  menu?: boolean;
  /** Each role with its name (the pop-up of the Roles button, the color menu of Match colors). */
  named?: boolean;
}) {
  const entry = usePaletteStore(
    (state) =>
      state.library.palettes.find((item) => item.id === state.library.activePaletteId) ?? null,
  );
  if (!entry) return null;
  const custom = entry.source.customRoles ?? [];
  const choice = (name: string, color: string, testId: string) => (
    <button
      key={testId}
      type="button"
      role={menu ? 'menuitem' : undefined}
      className={named ? 'palette-role-block' : menu ? 'ctx-swatch' : 'palette-swatch'}
      style={named ? undefined : { background: color }}
      title={`${name} ${color}`}
      aria-label={`Colour ${name} ${color}`}
      data-testid={testId}
      disabled={disabled}
      onClick={() => onPick(color)}
    >
      {named && (
        <>
          <span className="palette-role-chip" style={{ background: color }} aria-hidden="true" />
          <span className="palette-role-block-name">{name}</span>
        </>
      )}
    </button>
  );
  const own = PALETTE_ROLES.map((role) =>
    choice(role, entry.source.colors[role], `${testIdPrefix}-role-${role}`),
  );
  const added = custom.map((role, index) =>
    choice(role.name, role.color, `${testIdPrefix}-custom-role-${index}`),
  );
  const list = named ? 'palette-role-blocks' : 'palette-role-choices';
  return (
    <div role="group" aria-label={`Palette roles: ${entry.displayName}`}>
      <p className="palette-role-heading">{entry.displayName}</p>
      {named ? (
        <>
          <div className={list}>{own}</div>
          {added.length > 0 && (
            <>
              <p className="palette-role-heading" data-testid={`${testIdPrefix}-custom-roles`}>
                Your roles
              </p>
              <div className={list}>{added}</div>
            </>
          )}
        </>
      ) : (
        <div className={list}>
          {own}
          {added}
        </div>
      )}
    </div>
  );
}

/** Compact role access for property rows; the native picker remains its own unchanged control. */
interface PaletteRoleButtonProps {
  onPick(hex: string): void;
  testIdPrefix: string;
  disabled?: boolean;
}

export function PaletteRoleButton(props: PaletteRoleButtonProps) {
  const active = usePaletteStore((state) => state.library.activePaletteId);
  if (!active) return null;
  return <PaletteRoleButtonControl key={`${active}:${Boolean(props.disabled)}`} {...props} />;
}

/** A popup belongs to one active palette and one enabled lifetime. */
function PaletteRoleButtonControl({ onPick, testIdPrefix, disabled }: PaletteRoleButtonProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <button
        type="button"
        className="btn palette-role-trigger"
        // Named by its text, as a voice command would say it; what it does is its tooltip.
        title="Choose a palette role"
        aria-haspopup="menu"
        aria-expanded={position !== null}
        data-testid={`${testIdPrefix}-roles`}
        disabled={disabled}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setPosition(position ? null : { x: rect.left, y: rect.bottom + 4 });
        }}
      >
        Roles
      </button>
      {position && !disabled && (
        <ContextMenu
          x={position.x}
          y={position.y}
          label="Palette roles"
          testId={`${testIdPrefix}-role-menu`}
          onClose={() => setPosition(null)}
        >
          <div className="palette-role-popup">
            <PaletteRoleChoices
              testIdPrefix={testIdPrefix}
              menu
              named
              onPick={(hex) => {
                setPosition(null);
                onPick(hex);
              }}
            />
          </div>
        </ContextMenu>
      )}
    </>
  );
}
