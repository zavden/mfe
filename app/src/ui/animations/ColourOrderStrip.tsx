/* The strip of colours in order (`preview/colourOrder.ts`, D129), at the top of the Animations
 * panel while the mode is on. Copying, it lists every colour copied so far, left to right in the
 * order of the clicks; pasting, the ones still to give out, the next one marked — each leaves the
 * strip as it is pasted. A chip is the glyph the colour was read from, written in that colour on
 * the scene's background, as it is seen in the preview, under its number in the list. The buttons
 * do what the keys do: Enter, Escape. */
import { displayLabel } from '../../engine';
import { useProjectStore } from '../../store';
import {
  leaveColourOrder,
  orderChips,
  startColourPaste,
  useColourOrder,
} from '../preview/colourOrder';
import { keysText } from '../platform';

export function ColourOrderStrip() {
  const phase = useColourOrder((state) => state.phase);
  const background = useProjectStore((state) => state.project.meta.background);
  if (!phase) return null;
  const chips = orderChips(phase);
  const copying = phase.step === 'copy';
  return (
    <section
      className="an-order"
      aria-label="Colours in order"
      data-testid="colour-order-strip"
      data-step={phase.step}
      data-mode-bar=""
    >
      <header className="an-order-head">
        <h3>Colours in order</h3>
        <span className="an-order-step" data-testid="colour-order-step">
          {copying
            ? `Copying · ${chips.length}`
            : `Pasting · ${phase.pasted.length} of ${phase.list.length}`}
        </span>
      </header>
      {chips.length === 0 ? (
        <p className="an-hint" data-testid="colour-order-empty">
          Click the glyphs in the preview, one by one, in the order their colours are to be pasted.
        </p>
      ) : (
        <ol className="an-order-chips" data-testid="colour-order-chips">
          {chips.map((chip) => (
            <li
              key={chip.number}
              className={`an-order-chip${chip.next ? ' is-next' : ''}`}
              data-testid={`colour-order-chip-${chip.number}`}
              data-color={chip.color}
              aria-current={chip.next ? 'step' : undefined}
              title={`${chip.number}: the colour of “${displayLabel(chip.label)}”, ${chip.color}${chip.next ? ' — the next to paste' : ''}`}
            >
              <span className="an-order-number">{chip.number}</span>
              <span className="an-order-glyph" style={{ background, color: chip.color }}>
                {displayLabel(chip.label)}
              </span>
            </li>
          ))}
        </ol>
      )}
      <p className="an-hint">
        {copying
          ? keysText(
              'Enter pastes them, in this order · Backspace takes the last off · Esc cancels',
            )
          : 'Click the glyph that takes the marked colour · Backspace takes the last back · Esc ends'}
      </p>
      <div className="an-order-actions">
        {copying ? (
          <>
            <button
              type="button"
              className="an-small-button an-accent-button"
              data-testid="colour-order-paste"
              disabled={chips.length === 0}
              title={keysText('Go on to paste these colours, in this order (Enter)')}
              onClick={() => startColourPaste()}
            >
              Paste…
            </button>
            <button
              type="button"
              className="an-small-button"
              data-testid="colour-order-cancel"
              title="Leave without copying (Esc)"
              onClick={() => leaveColourOrder()}
            >
              Cancel
            </button>
          </>
        ) : (
          <button
            type="button"
            className="an-small-button"
            data-testid="colour-order-done"
            title="End the paste, keeping what was pasted (Esc)"
            onClick={() => leaveColourOrder()}
          >
            Done
          </button>
        )}
      </div>
    </section>
  );
}
