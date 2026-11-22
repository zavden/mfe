/* The right-click menus of the Slides mode on the ruler (D200): the ruler's own at a time — add a
 * pause or a comment there, where the scene rests; where something animates both entries are
 * greyed out and a line says what runs then; and, whatever the place, the commands over every
 * pause: add one after every animation, skip or keep the wait at each (D202), delete them all —
 * and a mark's own: write its words — a comment's, a pause's note —, make a
 * pause skip its wait or keep it (D202), or delete it. */
import { useId } from 'react';
import type { SlideMarkId } from '../../model';
import { useProjectStore } from '../../store';
import { ContextMenu, MenuItem } from '../ContextMenu';
import {
  addComment,
  addPause,
  addPausesAfterAnimations,
  deleteEveryPause,
  deleteMark,
  editMarkWords,
  keepWaitAtEveryPause,
  setSkipWait,
  skipWaitAtEveryPause,
} from '../slides/slideActions';
import { markClock, markTitle, noWaitReason, wordsEntry, type RulerSpot } from '../slides/slideOps';

interface SlideRulerMenuProps {
  x: number;
  y: number;
  /** The place of the ruler that was clicked, as a mark would be put there (`rulerSpot`). */
  spot: RulerSpot;
  onClose(): void;
}

export function SlideRulerMenu({ x, y, spot, onClose }: SlideRulerMenuProps) {
  const whyId = useId();
  const pauses = useProjectStore(
    (s) => s.project.slides?.marks.some((mark) => mark.kind === 'pause') ?? false,
  );
  const free = spot.kind === 'pause';
  const reason =
    spot.kind === 'busy'
      ? `${spot.cover.charAt(0).toUpperCase()}${spot.cover.slice(1)} runs here: a pause or a comment stands where nothing animates.`
      : spot.kind === 'outside'
        ? 'Past the end of the scene.'
        : null;
  const act = (run: () => void) => () => {
    onClose();
    run();
  };
  return (
    <ContextMenu
      x={x}
      y={y}
      label={`Slides at ${markClock(spot.time)}`}
      testId="slide-ruler-menu"
      onClose={onClose}
    >
      <MenuItem
        testId="slide-menu-add-pause"
        disabled={!free}
        describedBy={reason ? whyId : undefined}
        onClick={act(() => void addPause(spot.time))}
      >
        Add pause here ({markClock(spot.time)})
      </MenuItem>
      <MenuItem
        testId="slide-menu-add-comment"
        disabled={!free}
        describedBy={reason ? whyId : undefined}
        onClick={act(() => void addComment(spot.time))}
      >
        Add comment here…
      </MenuItem>
      {reason && (
        <div className="ctx-note" id={whyId} data-testid="slide-ruler-menu-why">
          {reason}
        </div>
      )}
      <hr className="ctx-sep" />
      <MenuItem testId="slide-menu-add-pauses" onClick={act(() => void addPausesAfterAnimations())}>
        Add a pause after every animation
      </MenuItem>
      {/* The three over every pause are greyed out while the scene has none. */}
      <MenuItem
        testId="slide-menu-skip-every"
        disabled={!pauses}
        onClick={act(() => void skipWaitAtEveryPause())}
      >
        Skip the wait at every pause
      </MenuItem>
      <MenuItem
        testId="slide-menu-keep-every"
        disabled={!pauses}
        onClick={act(() => void keepWaitAtEveryPause())}
      >
        Keep the wait at every pause
      </MenuItem>
      <MenuItem
        testId="slide-menu-delete-pauses"
        danger
        disabled={!pauses}
        onClick={act(() => void deleteEveryPause())}
      >
        Delete every pause…
      </MenuItem>
    </ContextMenu>
  );
}

interface SlideMarkMenuProps {
  x: number;
  y: number;
  markId: SlideMarkId;
  onClose(): void;
}

export function SlideMarkMenu({ x, y, markId, onClose }: SlideMarkMenuProps) {
  const whyId = useId();
  const project = useProjectStore((s) => s.project);
  const mark = project.slides?.marks.find((m) => m.id === markId);
  if (!mark) return null;
  const skipping = mark.skipWait === true;
  // Why there is no wait to skip; the box stays free to clear one that skips anyway.
  const none = noWaitReason(project, mark);
  return (
    <ContextMenu x={x} y={y} label={markTitle(mark)} testId="slide-mark-menu" onClose={onClose}>
      <div className="ctx-header">{markTitle(mark)}</div>
      <MenuItem
        testId="slide-mark-menu-words"
        onClick={() => {
          onClose();
          void editMarkWords(markId);
        }}
      >
        {wordsEntry(mark)}
      </MenuItem>
      {mark.kind === 'pause' && (
        <MenuItem
          testId="slide-mark-menu-skip"
          checked={skipping}
          disabled={!skipping && none !== null}
          describedBy={none !== null ? whyId : undefined}
          onClick={() => {
            onClose();
            setSkipWait(markId, !skipping);
          }}
        >
          Skip the wait after it
        </MenuItem>
      )}
      {mark.kind === 'pause' && none !== null && (
        <div className="ctx-note" id={whyId} data-testid="slide-mark-menu-skip-why">
          {none}
        </div>
      )}
      <MenuItem
        testId="slide-mark-menu-delete"
        danger
        onClick={() => {
          onClose();
          deleteMark(markId);
        }}
      >
        Delete (Del)
      </MenuItem>
    </ContextMenu>
  );
}
