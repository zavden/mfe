import { useEffect } from 'react';
import type { Project } from '../../model';
import { useUiStore, type Selection } from '../../store';
import {
  endStateTime,
  startStateTime,
  useTransformEdit,
  type StateBlock,
} from '../animations/transformEdit';
import { clipSubject } from '../animations/blockKinds';
import { selectedBlock } from '../selection';
import { mainPlayback } from '../transport/mainPlayback';
import { CLIP_INSET } from './layout';
import type { TracksLayout } from './trackLayout';

interface BlockStateIconsProps {
  project: Project;
  layout: TracksLayout;
  pxPerSecond: number;
  selection: Selection;
}

/** The start and end icons of the selected Transform block (a tween or a part transform), on its
 * top corners: the start icon shows where the transformation starts from, the end icon where it
 * ends — and lets the preview edit that end state until the playhead or the selection changes,
 * or Escape (transformEdit.ts). */
export function BlockStateIcons({
  project,
  layout,
  pxPerSecond: px,
  selection,
}: BlockStateIconsProps) {
  const editing = useTransformEdit((s) => s.editing);
  const time = useUiStore((s) => s.time);

  const block = selectedBlock(selection, project.clips);
  const clip = block?.clip;
  const found = block?.action;
  const action: StateBlock | null =
    found?.kind === 'tween' || found?.kind === 'transform' ? found : null;

  // The edit ends as soon as the playhead leaves its instant or the block is no longer selected.
  useEffect(() => {
    if (!editing) return;
    const stillSelected =
      selection.kind === 'action' &&
      selection.clipId === editing.clipId &&
      selection.actionId === editing.actionId;
    const exists = project.clips.some(
      (c) => c.id === editing.clipId && c.actions.some((a) => a.id === editing.actionId),
    );
    if (!stillSelected || !exists || Math.abs(time - editing.time) > 1e-9) {
      useTransformEdit.getState().stopEditing();
    }
  }, [editing, selection, time, project]);

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') useTransformEdit.getState().stopEditing();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing]);

  if (!clip || !action) return null;
  const row = layout.rowOf(clip.trackId);
  if (!row) return null;
  const lane = layout.clips.get(clip.id)?.laneOf.get(action.id) ?? 0;
  const top = row.top + CLIP_INSET + lane * row.lane + 1;
  const left = (clip.start + action.start) * px;
  const right = left + Math.max(6, action.duration * px);
  const locked = project.tracks.find((t) => t.id === clip.trackId)?.locked ?? false;
  const active = editing?.actionId === action.id;

  // A Transform that carries its shape to other glyphs ends on their fit: nothing to edit by hand.
  const carries = action.kind === 'tween' && action.fit !== undefined;

  const showStart = () => {
    useTransformEdit.getState().stopEditing();
    mainPlayback.seek(startStateTime(clip, action));
  };
  const toggleEnd = () => {
    const store = useTransformEdit.getState();
    if (active) {
      store.stopEditing();
      return;
    }
    const t = endStateTime(clip, action);
    mainPlayback.seek(t);
    if (!locked && !carries) store.startEditing({ clipId: clip.id, actionId: action.id, time: t });
  };

  return (
    <div className="tl-state-icons" data-testid="block-state-icons">
      <button
        type="button"
        className="tl-state-icon is-start"
        data-testid={`block-start-state-${action.id}`}
        style={{ left, top }}
        title="Show the start state: where this transformation starts from"
        aria-label="Show the start state"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={showStart}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="4.2" />
          <circle className="tl-state-dot" cx="6" cy="6" r="1.6" />
        </svg>
      </button>
      <button
        type="button"
        className={`tl-state-icon is-end${active ? ' is-active' : ''}`}
        data-testid={`block-end-state-${action.id}`}
        style={{ left: right, top }}
        title={
          locked
            ? 'Show the end state (the track is locked, so it cannot be edited)'
            : carries
              ? 'Show the end state: the shape fitted to what it goes to (Pick again…, in the panel, chooses another target)'
              : active
                ? 'Editing the end state in the preview: click again or press Esc to finish'
                : action.kind === 'transform'
                  ? 'Edit the end state: move, scale or rotate the part in the preview'
                  : `Edit the end state: move, scale or rotate the ${clipSubject(project, clip)} in the preview`
        }
        aria-label={carries ? 'Show the end state' : 'Edit the end state'}
        aria-pressed={active}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={toggleEnd}
      >
        <svg viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="4.2" />
          <path className="tl-state-arrow" d="M3.6 6h4.2M6.3 4.3 8 6 6.3 7.7" />
        </svg>
      </button>
    </div>
  );
}
