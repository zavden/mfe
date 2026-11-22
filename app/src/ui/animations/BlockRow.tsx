import type { Clip, ClipAction } from '../../model';
import { useUiStore } from '../../store';
import { blockCategory, blockLabel } from './blockKinds';

/** A compact line for a block in the clip's list of animations: a click selects the block, whose
 * settings then show in the panel. */
export function BlockRow({ clip, action }: { clip: Clip; action: ClipAction }) {
  const start = clip.start + action.start;
  return (
    <button
      type="button"
      className="an-block-row"
      data-testid={`block-row-${action.id}`}
      onClick={() =>
        useUiStore.getState().select({ kind: 'action', clipId: clip.id, actionId: action.id })
      }
    >
      <span className={`an-block-chip is-${blockCategory(action)}`}>{blockLabel(action)}</span>
      <span className="an-block-times">
        {start.toFixed(2)} s → {(start + action.duration).toFixed(2)} s
      </span>
    </button>
  );
}
