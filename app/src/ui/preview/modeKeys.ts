/* Whose a key is while a mode of the Preview is on — Edit path, the choice of a shape's target,
 * colours in order, align by symbol, drawing a line, Edit curve: the six of `previewModes.ts` — or
 * glyphs picked with Alt wait for their Escape.
 *
 * The rule, one for them all: a mode takes its keys in the capture phase, before what has the
 * focus hears them — a clip of the timeline would open its formula with the same Enter, move
 * the selection with the same arrow, the Backspace would delete what is selected —, and stops
 * them, so that a key does one thing. It leaves them alone when they are somebody else's: a
 * dialog is open, a field is being typed in, the search of formulas covers the Preview
 * (`previewCover.ts`: nothing a mode does would be seen), or a menu is open (`inOpenMenu`). The
 * menu bar with its menus closed owns no key of a mode: an entry chosen there leaves the focus
 * on its button, and that is where a mode started from the menus has its keys.
 *
 * A key held with Ctrl, ⌘ or Alt is a shortcut's, not a mode's: the six ask `modeOwnsKey` for both
 * things. Two Escapes are taken with them held too, and so ask `keyIsTaken` alone: the one that
 * cancels a drag, which holds the pointer, and the one that lets go the glyphs picked with Alt —
 * the key that picked them is easily still down.
 *
 * A mode's own bar — the strip of colours in order, the routes of Edit path — has buttons that
 * Enter and Space press, as anywhere else (`pressesModeBar`; the bars carry `data-mode-bar`):
 * there the mode leaves the two keys, but to a drag it holds. */
import { inOpenMenu } from '../focus';
import { isModalOpen } from '../project/modalStack';
import { isTextEntryTarget } from '../project/shortcuts';
import { isPreviewCovered } from './previewCover';

/** Whether Enter or Space is pressed on a button of a mode's own bar (`data-mode-bar`), which
 * the key presses: the mode leaves it alone, unless it holds a drag. */
export function pressesModeBar(event: KeyboardEvent): boolean {
  const { target } = event;
  if ((event.key !== 'Enter' && event.key !== ' ') || !(target instanceof Element)) return false;
  return target.closest('[data-mode-bar] button') !== null;
}

/** Whether a key pressed while a mode of the Preview is on is somebody else's. */
export function keyIsTaken(event: KeyboardEvent): boolean {
  return (
    isModalOpen() ||
    isPreviewCovered() ||
    isTextEntryTarget(event.target) ||
    inOpenMenu(event.target)
  );
}

/** Whether a key pressed while a mode of the Preview is on is the mode's to take: nobody else's,
 * and pressed alone — held with Ctrl, ⌘ or Alt it is a shortcut's. Shift changes nothing. */
export function modeOwnsKey(event: KeyboardEvent): boolean {
  return !keyIsTaken(event) && !event.ctrlKey && !event.metaKey && !event.altKey;
}
