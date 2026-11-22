/* A formula's glyphs as a row of toggle buttons: the way to pick glyphs from the keyboard (and
 * with a screen reader) where the drawing only takes pointer clicks. A press gives the click to
 * `onPick` with its modifiers, like a click on the glyph in the drawing; where the drawing has a
 * menu for a glyph, the menu key (or a right-click) on its button asks for it (`onContext`). */
import type { MouseEvent } from 'react';
import type { FormulaSnapshot } from '../../model';

interface GlyphChipsProps {
  glyphs: FormulaSnapshot['glyphs'];
  selected: ReadonlySet<number>;
  onPick: (index: number, event: MouseEvent) => void;
  /** The glyph's menu, as a right-click on it in the drawing opens it; without it, the
   * browser's own. */
  onContext?: (index: number, event: MouseEvent) => void;
  /** The group's accessible name ("Glyphs of f1"). */
  label: string;
  testIdPrefix: string;
}

export function GlyphChips({
  glyphs,
  selected,
  onPick,
  onContext,
  label,
  testIdPrefix,
}: GlyphChipsProps) {
  return (
    <div className="glyph-chips glyph-chips-compact" role="group" aria-label={label}>
      {glyphs.map(({ label: text }, index) => {
        return (
          <button
            key={index}
            type="button"
            className={`glyph-chip${selected.has(index) ? ' active' : ''}`}
            aria-pressed={selected.has(index)}
            aria-label={`Glyph ${index}: ${text}`}
            data-testid={`${testIdPrefix}-chip-${index}`}
            onClick={(event) => onPick(index, event)}
            onContextMenu={
              onContext &&
              ((event) => {
                event.preventDefault();
                onContext(index, event);
              })
            }
          >
            <span className="glyph-chip-index">{index}</span>
            <span className="glyph-chip-label">{text}</span>
          </button>
        );
      })}
    </div>
  );
}
