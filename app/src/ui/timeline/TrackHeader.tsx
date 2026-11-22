import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Track } from '../../model';
import { useProjectStore } from '../../store';
import { keepFocus } from '../focus';
import { isMainClick, trackPointer } from '../pointer';
import { deleteTrackAsking } from './clipActions';
import { moveTrack } from './clipOps';
import { Icon } from './icons';
import {
  MAX_ROW_SCALE,
  MIN_ROW_ZOOM,
  rowScale,
  scaleForHeight,
  steppedScale,
  withTrackScale,
} from './rowSizes';
import { useTimelineStore } from './timelineStore';
import type { TrackRow } from './trackLayout';
import { across } from './axis';
import { keysText } from '../platform';

interface TrackHeaderProps {
  track: Track;
  index: number;
  /** The track's row, as the layout has it: the header's edges resize it. */
  row: TrackRow;
  count: number;
  clipCount: number;
}

/** A drag of the header's top or bottom edge gives the track a height of its own (rowSizes.ts):
 * pulling an edge away from the track makes it taller — the bottom edge follows the pointer, and
 * since the tracks are laid from the top, so does the growth from the top edge. Escape puts the
 * height back; it is a view state, no undo step. */
function startRowResize(
  event: ReactPointerEvent,
  track: Track,
  row: TrackRow,
  edge: 'top' | 'bottom',
): void {
  if (!isMainClick(event)) return;
  event.preventDefault();
  event.stopPropagation();
  const before = useTimelineStore.getState().rowSizes;
  const startY = across(event);
  const element = event.currentTarget as HTMLElement;
  element.dataset.dragging = '';
  trackPointer(event.pointerId, {
    move: (e) => {
      const pulled = edge === 'bottom' ? across(e) - startY : startY - across(e);
      const scale = scaleForHeight(row.height + pulled, track.kind, row.lanes);
      useTimelineStore.getState().setRowSizes(withTrackScale(before, track.id, scale));
    },
    end: (_e, cancelled) => {
      delete element.dataset.dragging;
      if (cancelled) useTimelineStore.getState().setRowSizes(before);
    },
  });
}

/** The keys beside the track's name: this track alone a step lower or taller (rowSizes.ts). The
 * way to its own height from the keyboard, and without aiming at an edge. */
function stepRowSize(track: Track, steps: number): void {
  const { rowSizes, setRowSizes } = useTimelineStore.getState();
  const scale = steppedScale(rowScale(rowSizes, track.id), steps);
  setRowSizes(withTrackScale(rowSizes, track.id, scale));
}

/** A double-click on an edge: the track is as tall as the others again. */
function resetRowSize(track: Track): void {
  const { rowSizes, setRowSizes } = useTimelineStore.getState();
  setRowSizes(withTrackScale(rowSizes, track.id, null));
}

export function TrackHeader({ track, index, row, count, clipCount }: TrackHeaderProps) {
  const update = useProjectStore((s) => s.update);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(track.name);
  /** The edit was already committed or cancelled (a blur may follow Enter / Escape). */
  const finished = useRef(false);
  const nameRef = useRef<HTMLButtonElement>(null);
  /** Enter or Escape ended the edit: the focus goes back to the name. */
  const refocus = useRef(false);
  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    nameRef.current?.focus();
  }, [editing]);
  const startEditing = () => {
    setDraft(track.name);
    finished.current = false;
    setEditing(true);
  };

  const commit = () => {
    if (finished.current) return;
    finished.current = true;
    setEditing(false);
    const name = draft.trim();
    if (name && name !== track.name) {
      update((d) => {
        const t = d.tracks.find((x) => x.id === track.id);
        if (t) t.name = name;
      });
    }
  };
  const toggle = (field: 'hidden' | 'locked' | 'muted') =>
    update((d) => {
      const t = d.tracks.find((x) => x.id === track.id);
      if (!t) return;
      if (field === 'locked') t.locked = !t.locked;
      else if (field === 'hidden' && t.kind === 'visual') t.hidden = !t.hidden;
      else if (field === 'muted' && t.kind === 'audio') t.muted = !t.muted;
    });

  return (
    <div
      className={`tl-header${track.hidden ? ' is-hidden' : ''}${track.locked ? ' is-locked' : ''}`}
      role="rowheader"
      aria-label={track.name}
      data-testid={`track-header-${track.id}`}
    >
      {/* The name and the buttons: no box of its own while the timeline is horizontal; drawn
          vertical, the box that stands them upright in the column's top (timeline.css). */}
      <div className="tl-header-body">
        <div className="tl-header-top">
          {editing ? (
            <input
              className="tl-name-input"
              data-testid={`track-name-input-${track.id}`}
              aria-label="Track name"
              autoFocus
              value={draft}
              maxLength={40}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') {
                  refocus.current = true;
                  commit();
                }
                if (e.key === 'Escape') {
                  refocus.current = true;
                  finished.current = true;
                  setEditing(false);
                }
              }}
            />
          ) : (
            <button
              type="button"
              ref={nameRef}
              className="tl-name"
              data-testid={`track-name-${track.id}`}
              title={keysText('Double-click, or press Enter or F2, to rename')}
              onDoubleClick={startEditing}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' && e.key !== 'F2') return;
                e.preventDefault();
                e.stopPropagation();
                startEditing();
              }}
            >
              {track.name}
            </button>
          )}
          <div className="tl-header-keys" role="group" aria-label={`Height of ${track.name}`}>
            <button
              type="button"
              className="tl-icon-button"
              data-testid={`track-lower-${track.id}`}
              aria-label={`Lower ${track.name}`}
              title="Lower this track"
              disabled={row.scale <= MIN_ROW_ZOOM}
              onMouseDown={keepFocus}
              onClick={() => stepRowSize(track, -1)}
            >
              <Icon name="minus" />
            </button>
            <button
              type="button"
              className="tl-icon-button"
              data-testid={`track-taller-${track.id}`}
              aria-label={`Taller ${track.name}`}
              title="Taller this track (the keys in the corner size every track)"
              disabled={row.scale >= MAX_ROW_SCALE}
              onMouseDown={keepFocus}
              onClick={() => stepRowSize(track, 1)}
            >
              <Icon name="plus" />
            </button>
          </div>
        </div>
        <div className="tl-header-buttons">
          <button
            type="button"
            className={`tl-icon-button${(track.kind === 'audio' ? track.muted : track.hidden) ? ' is-on' : ''}`}
            data-testid={`track-${track.kind === 'audio' ? 'mute' : 'hide'}-${track.id}`}
            aria-pressed={track.kind === 'audio' ? track.muted : track.hidden}
            aria-label={`${track.kind === 'audio' ? 'Mute' : 'Hide'} ${track.name}`}
            title={
              track.kind === 'audio'
                ? track.muted
                  ? 'Unmute'
                  : 'Mute in playback and export'
                : track.hidden
                  ? 'Show in preview'
                  : 'Hide in preview (still exported)'
            }
            onMouseDown={keepFocus}
            onClick={() => toggle(track.kind === 'audio' ? 'muted' : 'hidden')}
          >
            {track.kind === 'audio' ? (
              <Icon name={track.muted ? 'volume-off' : 'volume'} />
            ) : (
              <Icon name={track.hidden ? 'eye-off' : 'eye'} />
            )}
          </button>
          <button
            type="button"
            className={`tl-icon-button${track.locked ? ' is-on' : ''}`}
            data-testid={`track-lock-${track.id}`}
            aria-pressed={track.locked}
            aria-label={`Lock ${track.name}`}
            title={track.locked ? 'Unlock track' : 'Lock track (clips cannot be edited)'}
            onMouseDown={keepFocus}
            onClick={() => toggle('locked')}
          >
            <Icon name={track.locked ? 'lock' : 'unlock'} />
          </button>
          <button
            type="button"
            className="tl-icon-button"
            data-testid={`track-up-${track.id}`}
            aria-label={`Move ${track.name} up`}
            title="Move up (towards the front)"
            disabled={index === 0}
            onMouseDown={keepFocus}
            onClick={() => update((d) => moveTrack(d, track.id, -1))}
          >
            <Icon name="up" />
          </button>
          <button
            type="button"
            className="tl-icon-button"
            data-testid={`track-down-${track.id}`}
            aria-label={`Move ${track.name} down`}
            title="Move down (towards the back)"
            disabled={index === count - 1}
            onMouseDown={keepFocus}
            onClick={() => update((d) => moveTrack(d, track.id, 1))}
          >
            <Icon name="down" />
          </button>
          <button
            type="button"
            className="tl-icon-button"
            data-testid={`track-delete-${track.id}`}
            aria-label={`Delete ${track.name}`}
            title={
              clipCount > 0
                ? `Delete track and its ${clipCount} clip${clipCount === 1 ? '' : 's'} (undoable)`
                : 'Delete track'
            }
            onMouseDown={keepFocus}
            onClick={() => void deleteTrackAsking(track.id)}
          >
            <Icon name="close" />
          </button>
        </div>
      </div>
      {/* The edges that resize the track: a pointer's tool (the keys beside the name do it in
          steps, and are reached with Tab). */}
      {(['top', 'bottom'] as const).map((edge) => (
        <div
          key={edge}
          className={`tl-header-size is-${edge}`}
          data-testid={`track-size-${edge}-${track.id}`}
          aria-hidden="true"
          title="Drag to resize this track (double-click: the height of the others)"
          onPointerDown={(e) => startRowResize(e, track, row, edge)}
          onDoubleClick={() => resetRowSize(track)}
        />
      ))}
    </div>
  );
}
