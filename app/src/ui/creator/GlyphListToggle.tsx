/* The key that lists glyphs under a drawing, a key per glyph with its index and label: the list
 * is the way to pick glyphs from the keyboard, but the room it takes grows with the formula, so
 * it shows only when asked for. Two lists have one: a glyph view's (`GlyphColors`, in the formula
 * editor and the text workspace) and the two sides of a pair editor (the relation editor's and
 * that of Morph blocks, which share the choice). Each is an editor preference of its own, which
 * the browser remembers; the caller places the key and gives it the look of its neighbours. */
import { usePreferences } from '../preferences';
import { Icon } from '../timeline/icons';

/** The preferences a key of this kind switches. */
type GlyphListPreference = 'glyphList' | 'relationGlyphList';

interface GlyphListToggleProps {
  /** Which list it switches; a glyph view's by default. */
  preference?: GlyphListPreference;
  /** Its look; by default the bare icon key that stands beside a title. */
  className?: string;
  testId?: string;
  /** Nothing to list (no glyphs yet): the key waits. */
  disabled?: boolean;
}

export function GlyphListToggle({
  preference = 'glyphList',
  className = 'icon-btn glyph-list-toggle',
  testId = 'glyph-list-toggle',
  disabled = false,
}: GlyphListToggleProps) {
  const shown = usePreferences((state) => state[preference]);
  const setPreferences = usePreferences((state) => state.set);
  return (
    <button
      type="button"
      className={`${className}${shown ? ' is-on' : ''}`}
      data-testid={testId}
      aria-pressed={shown}
      aria-label="Glyph list"
      title={
        shown
          ? 'Hide the list of glyphs'
          : 'List the glyphs under the drawing, with index and label (and to pick them from the keyboard)'
      }
      disabled={disabled}
      onClick={() => setPreferences({ [preference]: !shown })}
    >
      <Icon name="view-list" />
    </button>
  );
}
