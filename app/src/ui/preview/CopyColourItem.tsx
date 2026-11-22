/* «Copy colour to clipboard», in the menus of the glyphs picked in the preview when the pick is
 * a single glyph (D130): the colour that glyph is seen in — its own, else its object's
 * (`seenColour`) — goes to the system clipboard as `#RRGGBB`, to be pasted wherever a colour is
 * typed: the Hex field of a «Colour» menu, a colour dialog, another program. The entry shows the
 * colour it would copy. */
import type { Formula } from '../../model';
import { copyColour } from '../clipboard';
import { MenuItem } from '../ContextMenu';
import { seenColour } from './colourOrder';

interface CopyColourItemProps {
  formula: Formula;
  /** The picked glyph. */
  glyph: number;
  /** The entry is `<prefix>-copy-colour`. */
  testIdPrefix: string;
  onClose(): void;
}

export function CopyColourItem({ formula, glyph, testIdPrefix, onClose }: CopyColourItemProps) {
  const color = seenColour(formula, glyph).toUpperCase();
  return (
    <MenuItem
      testId={`${testIdPrefix}-copy-colour`}
      onClick={() => {
        onClose();
        void copyColour(color);
      }}
    >
      Copy colour to clipboard
      <span className="ctx-hint" data-testid={`${testIdPrefix}-copy-colour-value`}>
        {color}
      </span>
    </MenuItem>
  );
}
