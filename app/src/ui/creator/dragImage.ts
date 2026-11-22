/* The image shown while a formula row is dragged from the Creator to the Timeline. The browser's
 * default is a snapshot of the whole card, which hides the track it is about to land on. This
 * replaces it with a small, semi-transparent chip: the formula's tag colour, its icon and name. */
import type { Formula } from '../../model';

/** Height of the chip, CSS px. */
export const DRAG_CHIP_HEIGHT = 24;
const MAX_WIDTH = 180;
/** Element opacity, for engines that apply it to the drag image. */
const OPACITY = 0.9;
/** Share of the tag colour in the chip's background; the rest is transparent. Painted, so every
 * engine shows it, whether or not it honours the element's own opacity in drag images. */
const BACKGROUND_SHARE = 78;

type ChipFormula = Pick<Formula, 'name' | 'tag'>;

/** The chip as a detached element (inline styles only, so it looks the same wherever it is
 * attached). It is positioned off-screen: browsers snapshot the element when `setDragImage`
 * is called, and it must be in the document to be rendered. */
export function createDragChip(formula: ChipFormula, doc: Document = document): HTMLElement {
  const chip = doc.createElement('div');
  chip.className = 'formula-drag-chip';
  chip.setAttribute('data-testid', 'formula-drag-chip');
  chip.setAttribute('aria-hidden', 'true');
  Object.assign(chip.style, {
    position: 'fixed',
    top: '-200px',
    left: '-200px',
    zIndex: '-1',
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    height: `${DRAG_CHIP_HEIGHT}px`,
    maxWidth: `${MAX_WIDTH}px`,
    padding: '0 10px',
    background: formula.tag.color,
    color: 'var(--on-id-color)',
    border: '1px solid rgba(0, 0, 0, 0.35)',
    borderRadius: `${DRAG_CHIP_HEIGHT / 2}px`,
    font: '600 12px system-ui, sans-serif',
    lineHeight: '1',
    whiteSpace: 'nowrap',
    opacity: String(OPACITY),
    pointerEvents: 'none',
  });
  // A plain colour first: engines without color-mix() keep it (the invalid value is ignored).
  chip.style.background = `color-mix(in srgb, ${formula.tag.color} ${BACKGROUND_SHARE}%, transparent)`;
  if (formula.tag.icon) {
    const icon = doc.createElement('span');
    icon.textContent = formula.tag.icon;
    chip.append(icon);
  }
  const name = doc.createElement('span');
  name.textContent = formula.name;
  Object.assign(name.style, { overflow: 'hidden', textOverflow: 'ellipsis' });
  chip.append(name);
  return chip;
}

/** Use the chip as the drag image of `dataTransfer`. The chip lives in the document only until
 * the drag has started (the browser has taken its snapshot by the end of the current task). */
export function setFormulaDragImage(
  dataTransfer: Pick<DataTransfer, 'setDragImage'>,
  formula: ChipFormula,
  doc: Document = document,
): void {
  if (typeof dataTransfer.setDragImage !== 'function') return;
  const chip = createDragChip(formula, doc);
  doc.body.append(chip);
  // The pointer holds the chip by its left edge, vertically centred.
  dataTransfer.setDragImage(chip, 12, DRAG_CHIP_HEIGHT / 2);
  setTimeout(() => chip.remove(), 0);
}
