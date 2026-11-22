/* The Camera row of the timeline (D190): there while the multicamera is on, held under the ruler
 * as the tracks scroll (beside it in the vertical timeline, `cameraTimeline.css`). Its header has
 * the row's lock and «Add camera move»; its lane, the camera's moves as blocks — each with its
 * icon and where it goes («→ Camera 1», «→ 200 %», «→ Start»), and a ring of the target cameras'
 * pink while it is the one isolated in the Preview —, the readout of the move being dragged, and
 * the playhead's line, which the row would otherwise hide. The row has no name to change and no
 * place to trade: it is the scene's one camera.
 *
 * The keyboard: the moves have one Tab stop, after the header's buttons (`cameraRowNav.ts`). The
 * arrows along time, Home and End take the focus — and the selection with it — from move to
 * move; Enter, the Menu key or Shift+F10 open the menu of the focused one. Delete, Ctrl/⌘+D and
 * Alt+←/→ act on the selected move wherever the focus is (`useTimelineKeys`), and on the focused
 * one when the focus is on a move. When the focused move is deleted, the focus goes to the row's
 * Tab stop, or to «Add camera move». */
import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { movesInOrder, type CameraMove, type CameraMoveId, type SceneCamera } from '../../model';
import { useUiStore } from '../../store';
import { AnimationIcon } from '../animations/AnimationIcon';
import { cameraMoveIcon } from '../animations/animationIcons';
import { addCameraMove, toggleCameraLock } from '../camera/cameraActions';
import { moveDescription, moveLabel, type MoveEdit } from '../camera/cameraOps';
import { keepFocus } from '../focus';
import { usePreviewView } from '../preview/viewStore';
import { arrowOf } from './axis';
import { cameraNavTarget, cameraTabStop, isCameraNavKey } from './cameraRowNav';
import { headerWidth } from './headerWidth';
import { Icon } from './icons';
import { revealScroll } from './keyboardNav';
import { blockShowsName, CAMERA_ROW_HEIGHT } from './layout';
import { useTimelineStore } from './timelineStore';
import { timelineKey } from './useTimelineKeys';
import './cameraTimeline.css';

/** A move narrower than this (px) is still drawn this wide, so that it can be grabbed. */
const MIN_WIDTH = 6;

interface CameraMoveBlockProps {
  camera: SceneCamera;
  move: CameraMove;
  pxPerSecond: number;
  selected: boolean;
  /** Isolated in the Preview (`viewStore.ts`): the block says so. */
  isolated: boolean;
  /** Whether it holds the row's Tab stop (`cameraTabStop`). */
  tabStop: boolean;
  /** Being dragged and held short of where the pointer asks (`cameraMoveGestures`): marked in the
   * danger colour, and the readout says why. */
  stopped: boolean;
  onPress(event: ReactPointerEvent, move: CameraMove, edge: MoveEdit): void;
  /** Its menu, at a point of the screen. */
  onMenu(move: CameraMove, x: number, y: number): void;
}

/** One move of the camera: a block of the animation blocks' make, in the camera's colour. Too
 * short for its name, it shows its icon alone, as they do. */
function CameraMoveBlock({
  camera,
  move,
  pxPerSecond: px,
  selected,
  isolated,
  tabStop,
  stopped,
  onPress,
  onMenu,
}: CameraMoveBlockProps) {
  const width = Math.max(MIN_WIDTH, move.duration * px);
  const name = moveLabel(camera, move);
  const named = blockShowsName(width, name);
  return (
    <div
      className={`tl-block is-camera${named ? '' : ' is-icon-only'}${selected ? ' is-selected' : ''}${stopped ? ' is-stopped' : ''}${isolated ? ' is-isolated' : ''}`}
      data-testid={`camera-move-${move.id}`}
      data-move-id={move.id}
      data-isolated={isolated || undefined}
      data-to={move.to.kind}
      data-start={move.start}
      data-duration={move.duration}
      style={{ left: move.start * px, width }}
      role="button"
      aria-label={`${moveDescription(camera, move)}${isolated ? ', isolated in the Preview' : ''}`}
      aria-current={selected || undefined}
      tabIndex={tabStop ? 0 : -1}
      data-space-plays=""
      title={`${moveDescription(camera, move)} · ${move.easing}${isolated ? ' · isolated in the Preview' : ''}`}
      onPointerDown={(event) => onPress(event, move, 'move')}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onMenu(move, event.clientX, event.clientY);
      }}
    >
      <AnimationIcon name={cameraMoveIcon(move.to.kind)} />
      <span className="tl-block-label">{name}</span>
      {!camera.locked && (
        <>
          <div
            className="tl-block-handle tl-block-handle-start"
            data-testid={`camera-move-${move.id}-start`}
            onPointerDown={(event) => onPress(event, move, 'start')}
          />
          <div
            className="tl-block-handle tl-block-handle-end"
            data-testid={`camera-move-${move.id}-end`}
            onPointerDown={(event) => onPress(event, move, 'end')}
          />
        </>
      )}
    </div>
  );
}

/** The playhead's line across the row. It subscribes to the time on its own, so that playback
 * does not draw the moves again. */
function PlayheadInLane() {
  const time = useUiStore((s) => s.time);
  const px = useTimelineStore((s) => s.pxPerSecond);
  return <div className="tl-playhead-in-lane" aria-hidden="true" style={{ left: time * px }} />;
}

/** The readout of the move being dragged (`cameraDrag`): its time, and why it stops where it is
 * when the pointer asked for more. It hangs under the row, over the tracks (beside it, over them,
 * in the vertical timeline). */
function CameraDragReadout({
  camera,
  pxPerSecond: px,
}: {
  camera: SceneCamera;
  pxPerSecond: number;
}) {
  const drag = useTimelineStore((s) => s.cameraDrag);
  const move = drag && camera.moves.find((m) => m.id === drag.moveId);
  if (!drag || !move) return null;
  const end = move.start + move.duration;
  return (
    <div
      className={`tl-block-readout tl-camera-readout${drag.stop ? ' is-stopped' : ''}`}
      data-testid="camera-drag-readout"
      style={{ left: move.start * px }}
    >
      <span data-testid="camera-drag-time">
        {move.start.toFixed(2)} → {end.toFixed(2)} s · {move.duration.toFixed(2)} s
      </span>
      {drag.stop && (
        <span className="tl-block-readout-stop" data-testid="camera-drag-stop">
          Stops here: {drag.stop}
        </span>
      )}
    </div>
  );
}

interface CameraRowProps {
  camera: SceneCamera;
  pxPerSecond: number;
  /** How long the lane is (px): the seconds the timeline lays out. */
  width: number;
  selectedMove: CameraMoveId | null;
  /** A press on a move, on its body or on one of its edges. */
  onMovePress(event: ReactPointerEvent, move: CameraMove, edge: MoveEdit): void;
  /** The menu of a move at a point of the screen (a right-click on it, or the keyboard's), and a
   * right-click on the lane beside the moves. */
  onMoveMenu(move: CameraMove, x: number, y: number): void;
  onLaneMenu(event: ReactMouseEvent): void;
}

export function CameraRow({
  camera,
  pxPerSecond,
  width,
  selectedMove,
  onMovePress,
  onMoveMenu,
  onLaneMenu,
}: CameraRowProps) {
  const locked = camera.locked === true;
  const stopped = useTimelineStore((s) => (s.cameraDrag?.stop ? s.cameraDrag.moveId : null));
  const laneRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const tabMove = cameraTabStop(camera, selectedMove);
  const cameraSelected = useUiStore((s) => s.selection.kind === 'camera');
  const isolatedMove = usePreviewView((s) => s.isolatedMove);
  /** The move that has the focus, while one has it. */
  const focused = useRef<CameraMoveId | null>(null);

  /** Give the focus to a move, with the view scrolled along time to show it beside the headers. */
  const focusMove = (move: CameraMove) => {
    const lane = laneRef.current;
    const scroll = lane?.closest<HTMLElement>('.tl-scroll');
    if (scroll) {
      scroll.scrollLeft = revealScroll(
        scroll.scrollLeft,
        scroll.clientWidth,
        headerWidth(),
        move.start * pxPerSecond,
        move.duration * pxPerSecond,
      );
    }
    lane?.querySelector<HTMLElement>(`[data-move-id="${move.id}"]`)?.focus({ preventScroll: true });
  };

  // The focused move is gone (deleted, undone away): the browser leaves the focus on the page
  // without a blur. It goes to the row's Tab stop, or to «Add camera move» when no move is left —
  // unless the focus is somewhere else by now.
  useEffect(() => {
    const lost = focused.current;
    if (lost === null || camera.moves.some((move) => move.id === lost)) return;
    focused.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    if (tabMove) focusMove(tabMove);
    else addRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the moves change
  }, [camera.moves]);

  // While the focus is on a move, it follows the selection: on the copy a move was just given
  // (Ctrl/⌘+D), so that the next key acts on what is selected.
  useEffect(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !laneRef.current?.contains(active)) return;
    const selected = camera.moves.find((move) => move.id === selectedMove);
    if (selected && active.dataset.moveId !== selected.id) focusMove(selected);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- when the selection changes
  }, [selectedMove]);

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.defaultPrevented) return;
    const element = event.target as HTMLElement;
    const move = camera.moves.find((m) => m.id === element.dataset.moveId);
    if (!move) return;
    // Delete, Ctrl/⌘+D and Alt+←/→ act on the selected move (`useTimelineKeys`, which hears the
    // key after this): pressed on a move that Tab reached, on that one — it is selected first.
    const acts = timelineKey(event.nativeEvent);
    if (acts === 'delete' || acts === 'duplicate' || acts === 'nudge') {
      useUiStore.getState().select({ kind: 'cameraMove', id: move.id });
      return;
    }
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    // The arrows follow the screen: in a vertical timeline up and down go along time (axis.ts).
    const key = arrowOf(event.key);
    if (isCameraNavKey(key) && !event.shiftKey) {
      event.preventDefault();
      const next = cameraNavTarget(camera, move.id, key);
      if (!next) return;
      useUiStore.getState().select({ kind: 'cameraMove', id: next.id });
      focusMove(next);
      return;
    }
    if (key === 'Enter' || key === 'ContextMenu' || (event.shiftKey && key === 'F10')) {
      event.preventDefault();
      const rect = element.getBoundingClientRect();
      onMoveMenu(move, rect.left + 8, rect.bottom);
    }
  };

  return (
    <div
      className={`tl-row tl-camera-row${locked ? ' is-locked' : ''}`}
      role="group"
      aria-label="Camera"
      data-testid="camera-row"
      style={{
        height: CAMERA_ROW_HEIGHT,
        // Drawn vertical, the header is as wide as the row (timeline.css).
        ['--row-height' as string]: `${CAMERA_ROW_HEIGHT}px`,
      }}
    >
      <div className="tl-header tl-camera-header" data-testid="camera-header">
        <div className="tl-header-body">
          <div className="tl-header-top">
            <button
              type="button"
              className="tl-name tl-camera-name"
              data-testid="camera-name"
              aria-label="Camera"
              aria-pressed={cameraSelected}
              title="The scene's camera: its frame at the playhead and its target cameras (Animations panel)"
              onClick={() => useUiStore.getState().select({ kind: 'camera' })}
            >
              <Icon name="camera" />
              <span className="tl-camera-name-text">Camera</span>
            </button>
          </div>
          <div className="tl-header-buttons">
            <button
              type="button"
              className={`tl-icon-button${locked ? ' is-on' : ''}`}
              data-testid="camera-lock"
              aria-pressed={locked}
              aria-label="Lock the camera"
              title={locked ? 'Unlock the camera' : 'Lock the camera (it cannot be edited)'}
              onMouseDown={keepFocus}
              onClick={toggleCameraLock}
            >
              <Icon name={locked ? 'lock' : 'unlock'} />
            </button>
            <button
              type="button"
              className="tl-icon-button"
              data-testid="camera-add-move"
              aria-label="Add camera move"
              title="Add camera move at the playhead (over the region, when one is marked)"
              disabled={locked}
              ref={addRef}
              onMouseDown={keepFocus}
              onClick={() => addCameraMove()}
            >
              <Icon name="plus" />
            </button>
          </div>
        </div>
      </div>
      <div
        className={`tl-lane tl-camera-lane${locked ? ' is-locked' : ''}`}
        data-testid="camera-lane"
        ref={laneRef}
        style={{ width }}
        onContextMenu={onLaneMenu}
        onKeyDown={onKeyDown}
        onFocus={(event) => {
          focused.current = (event.target as HTMLElement).dataset.moveId ?? null;
        }}
        onBlur={(event) => {
          // Into the move's own menu, the focus is still the move's: it comes back to it.
          const to = event.relatedTarget;
          if (!(to instanceof Element && to.closest('[role="menu"]'))) focused.current = null;
        }}
      >
        {movesInOrder(camera).map((move) => (
          <CameraMoveBlock
            key={move.id}
            camera={camera}
            move={move}
            pxPerSecond={pxPerSecond}
            selected={selectedMove === move.id}
            isolated={isolatedMove === move.id}
            tabStop={tabMove?.id === move.id}
            stopped={stopped === move.id}
            onPress={onMovePress}
            onMenu={onMoveMenu}
          />
        ))}
        <CameraDragReadout camera={camera} pxPerSecond={pxPerSecond} />
        <PlayheadInLane />
      </div>
    </div>
  );
}
