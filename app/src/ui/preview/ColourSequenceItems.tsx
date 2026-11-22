/* «Copy colour sequence» and «Paste colour sequence» in the menus of the glyphs picked in the
 * preview (D92): the own colours of the pick go to an in-app clipboard, and from it onto a pick
 * of the same symbols, in this object or another (`glyphActions.ts`, `colourSequence.ts`). The
 * line under Paste (`pasteNote`) says what would be pasted — and what to know of the pairing:
 * that it is by symbol, when the two picks have their glyphs in another order; that glyphs
 * without a known symbol go in glyph order; that the two picks come from different renderers —
 * or why it cannot be: nothing copied yet, another number of glyphs, other symbols. */
import { useId } from 'react';
import type { Formula } from '../../model';
import { MenuItem } from '../ContextMenu';
import { pasteNote } from './colourSequence';
import {
  colourSequencePairing,
  copyPickedColourSequence,
  pastePickedColourSequence,
  useColourSequenceClipboard,
} from './glyphActions';
import type { GlyphPick } from './glyphPick';

interface ColourSequenceItemsProps {
  pick: GlyphPick;
  formula: Formula;
  /** The picked glyphs, ascending. */
  glyphs: readonly number[];
  /** The entries are `<prefix>-copy-sequence` and `<prefix>-paste-sequence`, the line under
   * Paste `<prefix>-paste-sequence-note`. */
  testIdPrefix: string;
  onClose(): void;
}

export function ColourSequenceItems({
  pick,
  formula,
  glyphs,
  testIdPrefix,
  onClose,
}: ColourSequenceItemsProps) {
  const sequence = useColourSequenceClipboard((state) => state.sequence);
  const noteId = useId();
  const pairing = sequence ? colourSequencePairing(formula, glyphs, sequence) : null;
  const note = pasteNote(sequence, pairing);
  return (
    <>
      <MenuItem
        testId={`${testIdPrefix}-copy-sequence`}
        onClick={() => {
          copyPickedColourSequence(pick);
          onClose();
        }}
      >
        Copy colour sequence
      </MenuItem>
      <MenuItem
        testId={`${testIdPrefix}-paste-sequence`}
        disabled={!pairing?.ok}
        describedBy={noteId}
        onClick={() => {
          pastePickedColourSequence(pick);
          onClose();
        }}
      >
        Paste colour sequence
      </MenuItem>
      <div className="ctx-note" id={noteId} data-testid={`${testIdPrefix}-paste-sequence-note`}>
        {note}
      </div>
    </>
  );
}
