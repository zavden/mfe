/* A row of one-click colour choices, the Manim palette, followed by whatever the caller adds (a
 * custom colour field). Each swatch is a button named "Colour <name>" with the test id
 * `<testIdPrefix>-<name>`. */
import type { ReactNode } from 'react';
import { MANIM_COLORS } from './colors';
import { PaletteRoleChoices } from '../colors/PaletteRoleChoices';

interface SwatchRowProps {
  /** Accessible name of the group. */
  label: string;
  testIdPrefix: string;
  disabled?: boolean;
  onPick(hex: string): void;
  children?: ReactNode;
}

export function SwatchRow({ label, testIdPrefix, disabled, onPick, children }: SwatchRowProps) {
  return (
    <div className="palette" role="group" aria-label={label}>
      {MANIM_COLORS.map((color) => (
        <button
          key={color.hex}
          type="button"
          className="palette-swatch"
          style={{ background: color.hex }}
          title={`${color.name} ${color.hex}`}
          aria-label={`Colour ${color.name}`}
          data-testid={`${testIdPrefix}-${color.name}`}
          disabled={disabled}
          onClick={() => onPick(color.hex)}
        />
      ))}
      {children}
      <PaletteRoleChoices testIdPrefix={testIdPrefix} disabled={disabled} onPick={onPick} />
    </div>
  );
}
