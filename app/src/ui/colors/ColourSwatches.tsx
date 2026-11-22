/* The colours a context menu offers for something: the Manim palette as swatches, then the roles
 * of the editor's active palette (`PaletteRoleChoices`), then a field for any other colour, typed
 * as hexadecimal (`HexColourField`, D130). The glyph menus and the menu of a brace's or a shape's
 * clip show it; the caller applies the colour and closes its menu. Test ids:
 * `<testIdPrefix>-<COLOUR NAME>`. */
import { MANIM_COLORS } from '../project/colors';
import { HexColourField } from './HexColourField';
import { PaletteRoleChoices } from './PaletteRoleChoices';

export function ColourSwatches({
  testIdPrefix,
  onPick,
}: {
  testIdPrefix: string;
  onPick(hex: string): void;
}) {
  return (
    <>
      <div className="ctx-swatches" role="group" aria-label="Colour">
        {MANIM_COLORS.map((color) => (
          <button
            key={color.hex}
            type="button"
            role="menuitem"
            className="ctx-swatch"
            style={{ background: color.hex }}
            title={`${color.name} ${color.hex}`}
            aria-label={`Colour ${color.name}`}
            data-testid={`${testIdPrefix}-${color.name}`}
            onClick={() => onPick(color.hex)}
          />
        ))}
      </div>
      <PaletteRoleChoices testIdPrefix={testIdPrefix} menu onPick={onPick} />
      <HexColourField testIdPrefix={testIdPrefix} onPick={onPick} />
    </>
  );
}
