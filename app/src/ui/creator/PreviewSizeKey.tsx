/* The size of the previews of the Creator's list (D173): one key of its toolbar, «+/−» (D183),
 * for the view that is shown — the rendering of each row in the list view, the tooltip beside a
 * block in the block view —, each view its own size, an editor preference (ui/preferences.ts).
 * A click makes it a step larger, a right-click or a Shift+click a step smaller (Enter and Space
 * click it, Shift+Enter and Shift+Space smaller); with the focus on the key ↑ and ↓ do the same.
 * Never off: at an end the press that would go past it does nothing, and the key says so. Each
 * press is announced. `previewSize.ts` has the steps and the words. */
import { announce } from '../announcer';
import { focusedByKeyboard } from '../focusOrigin';
import { usePreferences, type CreatorView, type Preferences } from '../preferences';
import {
  previewSizeWords,
  previewStepOfKey,
  previewStepOfPress,
  steppedPreview,
  type PreviewScale,
} from './previewSize';

/** The size of the previews of `view` in `preferences`. */
const scaleOf = (preferences: Preferences, view: CreatorView): PreviewScale =>
  view === 'grid' ? preferences.creatorBlockPreview : preferences.creatorListPreview;

/** The size of the previews of `view`, from the preferences. */
export function usePreviewScale(view: CreatorView): PreviewScale {
  return usePreferences((state) => scaleOf(state, view));
}

/** The preferences that give `view` the size `scale`. */
const sizeOf = (view: CreatorView, scale: PreviewScale): Partial<Preferences> =>
  view === 'grid' ? { creatorBlockPreview: scale } : { creatorListPreview: scale };

/** Space is the key's only when the key was reached with the keyboard, as for every button of the
 * app (`spaceOperates`, project/shortcuts.ts): one that kept the focus after a click leaves it to
 * playback, Shift held or not. Any other key is the key's. */
const spaceIsMine = (event: { key: string; currentTarget: Element }): boolean =>
  event.key !== ' ' || focusedByKeyboard(event.currentTarget);

export function PreviewSizeKey({ view }: { view: CreatorView }) {
  const scale = usePreviewScale(view);
  const { title } = previewSizeWords(view, scale);
  /** One step that way, unless an end is reached; the size there is announced either way. */
  const step = (by: 1 | -1) => {
    const preferences = usePreferences.getState();
    const now = scaleOf(preferences, view);
    const next = steppedPreview(now, by) ?? now;
    if (next !== now) preferences.set(sizeOf(view, next));
    announce(previewSizeWords(view, next).status);
  };
  return (
    <button
      type="button"
      className="icon-btn creator-size-key"
      data-testid="creator-preview-size"
      data-scale={scale}
      aria-label={title}
      title={title}
      onClick={(event) => step(previewStepOfPress({ secondary: false, shift: event.shiftKey }))}
      onContextMenu={(event) => {
        // The secondary click is the key's own: no menu of the browser's.
        event.preventDefault();
        step(previewStepOfPress({ secondary: true, shift: event.shiftKey }));
      }}
      onKeyDown={(event) => {
        const by = previewStepOfKey(event);
        if (by === null || !spaceIsMine(event)) return;
        event.preventDefault();
        event.stopPropagation();
        step(by);
      }}
      onKeyUp={(event) => {
        // Shift+Space was taken as it went down: a browser that clicks as Space comes up must not
        // step again.
        if (event.key === ' ' && event.shiftKey && spaceIsMine(event)) event.preventDefault();
      }}
    >
      <span className="creator-size-mark" aria-hidden="true">
        +/−
      </span>
    </button>
  );
}
