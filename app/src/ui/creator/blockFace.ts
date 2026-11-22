/* The compact face of a formula's block in the Creator's block view: the owner's design for a
 * block too narrow for its name (`COMPACT_BLOCK_WIDTH`). The block is then a pane of glass tinted
 * with the colour of its tag, with the name alone on it; the rest waits in the corners for the
 * pointer — the edit, duplicate and delete buttons, the kind and a letter for the render ("M" for
 * MathJax, "e" for exact), the number of clips. What must not be missed is there all along: the
 * warning mark, and the mark of a render that failed.
 *
 * The face is chosen and painted by the stylesheet (creator.css, a container query on the block's
 * own width; the name is in the text's colour, which reads on the glass whatever the tag, as
 * blockFace.test.ts works out): what is pure is here — the width, and the letter of a render. */
import type { FormulaStatus } from './formulaStatus';

/** A block narrower than this (CSS px, its border included) shows its compact face. The
 * stylesheet says the same in its container query (`formula-block`, whose content box is 2 px
 * narrower). */
export const COMPACT_BLOCK_WIDTH = 112;

/** The mark of a render on the compact face, where its badge has room for a character: "e" for
 * exact glyphs, "M" for MathJax's, "?" for a font text nothing has shaped, "…" while it is not
 * rendered yet, "!" for an error and "∅" for an empty formula. The badge keeps its words for
 * assistive technology and its tooltip. */
export function statusMark(status: FormulaStatus): string {
  switch (status.status) {
    case 'error':
      return '!';
    case 'loading':
      return '…';
    case 'idle':
      return status.label === 'empty' ? '∅' : '…';
    default:
      return status.exact ? 'e' : status.needsCompanion ? '?' : 'M';
  }
}
