/* The views of the scene's camera in the Animations panel (D190), one for each thing of the camera
 * that can be selected:
 *   - a move (a block of the timeline's Camera row): when it runs, its easing with its curve, and
 *     where it goes — a frame of its own, with its X, Y and zoom; a target camera; or back to the
 *     start;
 *   - the camera itself (a click on the row's name): the frame it rests in at the playhead, which
 *     is the frame of 0 s, the destination of the last move that ended or a target camera, and the
 *     list of the target cameras;
 *   - a target camera: its name and its frame, the moves that go to it, and «Move camera here».
 * A frame is its centre and its zoom: the app keeps its height, and the width follows from the
 * project's shape. Every field writes one undo step (`cameraActions.ts`); a locked camera shows
 * them disabled. */
import { useId, useRef, useState, type ReactNode } from 'react';
import {
  MAX_CAMERA_HEIGHT,
  MIN_CAMERA_HEIGHT,
  movesInOrder,
  type CameraFrame,
  type CameraMove,
  type Issue,
  type Project,
  type SceneCamera,
  type TargetCamera,
} from '../../model';
import { cameraLegs, cameraStateAt, endsAtStart, sameFrame } from '../../scene';
import { useProjectStore, useUiStore, type Selection } from '../../store';
import { EASING_CHOICES } from '../animations/catalogue';
import { EasingCurve } from '../animations/EasingCurve.tsx';
import { NumberField, SelectField } from '../animations/fields';
import { IssuesSection } from '../animations/IssueList';
import { projectIssues } from '../animations/issues';
import { Section } from '../animations/Section';
import { ownEscape } from '../project/modalStack';
import {
  addCameraMove,
  addTargetCamera,
  deleteCameraMove,
  deleteTargetCameraAsking,
  renameTargetCamera,
  retimeCameraMove,
  setCameraFrameField,
  setCameraMoveDestination,
  setCameraMoveEasing,
} from './cameraActions';
import {
  MIN_MOVE_DURATION,
  moveLabel,
  movesToTarget,
  restingFrameOwner,
  zoomPercent,
  type FrameField,
  type FrameOwner,
} from './cameraOps';
import './camera.css';

const seconds = (t: number) => `${+t.toFixed(3)} s`;

/** The issues of the camera whose path starts with `path` (`['camera', 'moves', 2]`). */
function cameraIssues(project: Project, path: readonly (string | number)[]): Issue[] {
  return projectIssues(project).filter((issue) => path.every((part, i) => issue.path[i] === part));
}

/** The head of a view: a dot in the colour of what it shows, its title and its buttons. */
function Header({
  tone,
  titleTestId,
  title,
  children,
}: {
  tone: 'camera' | 'target';
  titleTestId: string;
  title: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="an-props-header is-sticky">
      <span className={`an-dot camera-dot is-${tone}`} />
      {/* tabIndex -1: the panel moves the focus here when its view changes under it. */}
      <h2 data-testid={titleTestId} tabIndex={-1}>
        {title}
      </h2>
      {children}
    </header>
  );
}

/** A frame as it is edited: the centre's X and Y, in units of the scene, and the zoom in per
 * cent — 100 % is Manim's own frame, 200 % shows half as much, twice as large. A field commits
 * its own number and nothing of the others: what is shown of them may be what a drag still held
 * has, which is not what the field was typed for (`setCameraFrameField`). */
function FrameFields({
  prefix,
  frame,
  disabled,
  onCommit,
}: {
  prefix: string;
  frame: CameraFrame;
  disabled?: boolean;
  onCommit(field: FrameField, value: number): void;
}) {
  const [x, y] = frame.center;
  return (
    <div className="an-row">
      <NumberField
        label="X"
        title="The centre of the frame, in units of the scene"
        testId={`${prefix}-x`}
        value={x}
        step={0.1}
        disabled={disabled}
        onCommit={(value) => onCommit('x', value)}
      />
      <NumberField
        label="Y"
        title="The centre of the frame, in units of the scene"
        testId={`${prefix}-y`}
        value={y}
        step={0.1}
        disabled={disabled}
        onCommit={(value) => onCommit('y', value)}
      />
      <NumberField
        label="Zoom"
        title="100 % is Manim’s own frame; 200 % shows half as much of the scene, twice as large"
        testId={`${prefix}-zoom`}
        value={zoomPercent(frame)}
        step={10}
        min={zoomPercent({ height: MAX_CAMERA_HEIGHT })}
        max={zoomPercent({ height: MIN_CAMERA_HEIGHT })}
        digits={1}
        suffix="%"
        disabled={disabled}
        onCommit={(value) => onCommit('zoom', value)}
      />
    </div>
  );
}

/** A name that is typed: committed by Enter or when the focus leaves, put back by Escape. */
function NameField({
  value,
  testId,
  disabled,
  onCommit,
}: {
  value: string;
  testId: string;
  disabled?: boolean;
  onCommit(name: string): void;
}) {
  const id = useId();
  const [draft, setDraft] = useState<string | null>(null);
  /** Set while Escape is closing the field, so that the blur it causes does not commit. */
  const cancelled = useRef(false);
  return (
    <label className="an-field" htmlFor={id}>
      <span className="an-label">Name</span>
      <input
        id={id}
        className="an-input"
        data-testid={testId}
        type="text"
        maxLength={40}
        disabled={disabled}
        value={draft ?? value}
        {...ownEscape(draft !== null)}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={(event) => {
          if (cancelled.current) cancelled.current = false;
          else if (draft !== null) onCommit(event.target.value);
          setDraft(null);
        }}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === 'Enter') event.currentTarget.blur();
          else if (event.key === 'Escape') {
            cancelled.current = true;
            setDraft(null);
            event.currentTarget.blur();
          }
        }}
      />
    </label>
  );
}

/** The frame the camera rests in at the playhead, whoever keeps it. */
const PLAYHEAD = { kind: 'playhead' } as const;

const LOCKED = (
  <p className="an-notice an-locked" data-testid="camera-locked">
    The camera is locked: unlock it on the Camera row of the timeline to edit it.
  </p>
);

const selectCamera = () => useUiStore.getState().select({ kind: 'camera' });

/** "frame", "start" or "target:<id>": a move's destination as the value of the select. */
const destinationValue = (move: CameraMove): string =>
  move.to.kind === 'target' ? `target:${move.to.target}` : move.to.kind;

// --- A move ----------------------------------------------------------------------------------

function MoveView({
  project,
  camera,
  move,
}: {
  project: Project;
  camera: SceneCamera;
  move: CameraMove;
}) {
  const time = useUiStore((s) => s.time);
  const locked = camera.locked === true;
  const leg = cameraLegs(camera).find((l) => l.move.id === move.id);
  const index = camera.moves.findIndex((m) => m.id === move.id);
  const target =
    move.to.kind === 'target' ? camera.targets.find((t) => t.id === destinationId(move)) : null;
  const progress = Math.min(1, Math.max(0, (time - move.start) / move.duration));
  const pulse = endsAtStart(move.easing);
  const idle = leg !== undefined && sameFrame(leg.from, leg.to);
  const options = [
    { value: 'frame', label: 'A frame of its own' },
    { value: 'start', label: 'Start (the frame at 0 s)' },
    ...camera.targets.map((t) => ({ value: `target:${t.id}`, label: t.name })),
    // A target camera that is gone (a file written by hand): what the move still names.
    ...(move.to.kind === 'target' && !target
      ? [{ value: destinationValue(move), label: '(missing camera)' }]
      : []),
  ];
  return (
    <div className="an-clip" data-testid="camera-move-properties">
      {locked && LOCKED}
      <Header
        tone="camera"
        titleTestId="camera-move-title"
        title={
          <>
            Camera move
            <span className="an-block-chip is-camera" data-testid="camera-move-name">
              {moveLabel(camera, move)}
            </span>
          </>
        }
      >
        <button
          type="button"
          className="an-small-button"
          data-testid="camera-move-camera"
          title="The camera: its frame at the playhead and its target cameras"
          onClick={selectCamera}
        >
          Camera
        </button>
        <button
          type="button"
          className="an-small-button"
          data-testid="camera-move-delete"
          disabled={locked}
          onClick={() => deleteCameraMove(move.id)}
        >
          Delete
        </button>
      </Header>
      <fieldset className="an-fieldset" disabled={locked}>
        <Section title="Timing" testId="camera-move-timing-section" tone="timing">
          <div className="an-row">
            <NumberField
              label="Start"
              title="Seconds from the start of the scene"
              testId="camera-move-start"
              value={move.start}
              min={0}
              suffix="s"
              onCommit={(value) => retimeCameraMove(move.id, 'move', value)}
            />
            <NumberField
              label="Duration"
              testId="camera-move-duration"
              value={move.duration}
              min={MIN_MOVE_DURATION}
              suffix="s"
              onCommit={(value) => retimeCameraMove(move.id, 'end', value)}
            />
            <SelectField
              label="Easing"
              testId="camera-move-easing"
              value={move.easing}
              options={EASING_CHOICES}
              onChange={(easing) => setCameraMoveEasing(move.id, easing)}
            />
          </div>
          <p className="an-hint" data-testid="camera-move-rule">
            Nothing else animates while the camera moves: the move stays between the animations
            around it.
          </p>
          <EasingCurve easing={move.easing} target={project.meta.target} progress={progress} />
        </Section>
        <Section title="Destination" testId="camera-move-destination-section" tone="camera">
          <div className="an-row">
            <SelectField
              label="Goes to"
              testId="camera-move-to"
              value={destinationValue(move)}
              options={options}
              onChange={(value) =>
                setCameraMoveDestination(
                  move.id,
                  value === 'frame' || value === 'start'
                    ? value
                    : { target: value.slice('target:'.length) },
                )
              }
            />
          </div>
          {move.to.kind === 'frame' && (
            <FrameFields
              prefix="camera-move"
              frame={move.to.frame}
              onCommit={(field, value) =>
                setCameraFrameField({ kind: 'move', id: move.id }, field, value)
              }
            />
          )}
          {move.to.kind === 'start' && (
            <p className="an-hint" data-testid="camera-move-start-hint">
              Back to the frame the camera has at 0 s ({frameText(camera.initial)}).
            </p>
          )}
          {target && (
            <div className="an-row">
              <p className="an-hint" data-testid="camera-move-target-hint">
                {target.name}: {frameText(target)}. Every move that goes to it follows it.
              </p>
              <button
                type="button"
                className="an-small-button"
                data-testid="camera-move-edit-target"
                onClick={() =>
                  useUiStore.getState().select({ kind: 'targetCamera', id: target.id })
                }
              >
                Edit {target.name}
              </button>
            </div>
          )}
          {idle && (
            <p className="an-hint" data-testid="camera-move-idle">
              This move goes to the frame the camera is already in: it changes nothing yet. Give it
              somewhere else to go.
            </p>
          )}
          {pulse && (
            <p className="an-hint" data-testid="camera-move-pulse">
              This easing goes there and comes back: the camera ends in the frame it left.
            </p>
          )}
        </Section>
        <IssuesSection
          issues={index < 0 ? [] : cameraIssues(project, ['camera', 'moves', index])}
          testId="camera-move-issues-section"
          listTestId="camera-move-issues"
        />
      </fieldset>
    </div>
  );
}

const destinationId = (move: CameraMove) => (move.to.kind === 'target' ? move.to.target : null);

/** "(3, 1), 200 %": a frame in a line of text. */
function frameText(frame: CameraFrame): string {
  const number = (value: number) => String(+value.toFixed(2));
  return `(${number(frame.center[0])}, ${number(frame.center[1])}), ${Math.round(zoomPercent(frame))} %`;
}

// --- The camera -----------------------------------------------------------------------------

/** Whose frame the camera rests in, in words. */
function ownerText(camera: SceneCamera, owner: FrameOwner): string {
  switch (owner.kind) {
    case 'initial':
      return 'The frame at 0 s (Start): where the camera is until its first move, and where a move “→ Start” comes back to.';
    case 'move': {
      const move = camera.moves.find((m) => m.id === owner.id);
      return `The destination of the move that ends at ${move ? seconds(move.start + move.duration) : '?'}: a frame of its own.`;
    }
    case 'target': {
      const target = camera.targets.find((t) => t.id === owner.id);
      const users = movesToTarget(camera, owner.id).length;
      return `${target?.name ?? 'A target camera'}: a target camera, where ${users} move${users === 1 ? ' goes' : 's go'}.`;
    }
  }
}

function TargetRow({ camera, target }: { camera: SceneCamera; target: TargetCamera }) {
  const users = movesToTarget(camera, target.id).length;
  return (
    <li className="camera-target-row" data-testid={`camera-target-${target.id}`}>
      <button
        type="button"
        className="an-small-button camera-target-name"
        data-testid={`camera-target-${target.id}-select`}
        title="Edit this target camera"
        onClick={() => useUiStore.getState().select({ kind: 'targetCamera', id: target.id })}
      >
        {target.name}
      </button>
      <span className="an-hint">
        {frameText(target)} · {users} move{users === 1 ? '' : 's'}
      </span>
    </li>
  );
}

function CameraView({ project, camera }: { project: Project; camera: SceneCamera }) {
  const time = useUiStore((s) => s.time);
  const locked = camera.locked === true;
  const owner = restingFrameOwner(camera, time);
  const state = cameraStateAt(camera, time, project.meta.target);
  return (
    <div className="an-clip" data-testid="camera-properties">
      {locked && LOCKED}
      <Header tone="camera" titleTestId="camera-title" title="Camera">
        <button
          type="button"
          className="an-small-button"
          data-testid="camera-add-move-here"
          title="Add camera move at the playhead (over the region, when one is marked)"
          disabled={locked}
          onClick={() => addCameraMove()}
        >
          Add move
        </button>
      </Header>
      <fieldset className="an-fieldset" disabled={locked}>
        <Section title="Frame at the playhead" testId="camera-frame-section" tone="camera">
          {owner ? (
            <>
              <FrameFields
                prefix="camera-frame"
                frame={state.frame}
                onCommit={(field, value) => setCameraFrameField(PLAYHEAD, field, value)}
              />
              <p className="an-hint" data-testid="camera-frame-owner">
                {ownerText(camera, owner)}
              </p>
            </>
          ) : (
            <div className="an-row">
              <p className="an-hint" data-testid="camera-frame-moving">
                The camera is on its way at {seconds(time)} ({frameText(state.frame)}): a frame is
                set where it rests.
              </p>
              {state.leg && (
                <button
                  type="button"
                  className="an-small-button"
                  data-testid="camera-frame-to-end"
                  onClick={() => useUiStore.getState().setTime(state.leg!.end)}
                >
                  Go to the end of the move
                </button>
              )}
            </div>
          )}
        </Section>
        <Section
          title="Target cameras"
          testId="camera-targets-section"
          tone="target"
          actions={
            <button
              type="button"
              className="an-small-button an-accent-button"
              data-testid="camera-add-target"
              title="A new target camera, with the frame the camera is in at the playhead"
              onClick={() => addTargetCamera()}
            >
              + Add
            </button>
          }
        >
          {camera.targets.length === 0 ? (
            <p className="an-hint" data-testid="camera-targets-empty">
              A target camera is a frame with a name, set aside for moves to go to: several moves
              can share one, and moving it moves them all.
            </p>
          ) : (
            <ul className="camera-targets" data-testid="camera-targets">
              {camera.targets.map((target) => (
                <TargetRow key={target.id} camera={camera} target={target} />
              ))}
            </ul>
          )}
        </Section>
        <IssuesSection
          issues={cameraIssues(project, ['camera', 'initial'])}
          testId="camera-issues-section"
          listTestId="camera-issues"
        />
      </fieldset>
    </div>
  );
}

// --- A target camera --------------------------------------------------------------------------

function TargetView({
  project,
  camera,
  target,
}: {
  project: Project;
  camera: SceneCamera;
  target: TargetCamera;
}) {
  const locked = camera.locked === true;
  const users = movesToTarget(camera, target.id);
  const index = camera.targets.findIndex((t) => t.id === target.id);
  return (
    <div className="an-clip" data-testid="target-camera-properties">
      {locked && LOCKED}
      <Header tone="target" titleTestId="target-camera-title" title={target.name}>
        <button
          type="button"
          className="an-small-button"
          data-testid="target-camera-camera"
          title="The camera: its frame at the playhead and its target cameras"
          onClick={selectCamera}
        >
          Camera
        </button>
        <button
          type="button"
          className="an-small-button"
          data-testid="target-camera-delete"
          disabled={locked}
          onClick={() => void deleteTargetCameraAsking(target.id)}
        >
          {users.length > 0 ? 'Delete…' : 'Delete'}
        </button>
      </Header>
      <fieldset className="an-fieldset" disabled={locked}>
        <Section title="Target camera" testId="target-camera-section" tone="target">
          <div className="an-row">
            <NameField
              value={target.name}
              testId="target-camera-name"
              onCommit={(name) => renameTargetCamera(target.id, name)}
            />
          </div>
          <FrameFields
            prefix="target-camera"
            frame={target}
            onCommit={(field, value) =>
              setCameraFrameField({ kind: 'target', id: target.id }, field, value)
            }
          />
        </Section>
        <Section
          title="Moves that go to it"
          testId="target-camera-moves-section"
          tone="camera"
          actions={
            <button
              type="button"
              className="an-small-button an-accent-button"
              data-testid="target-camera-move-here"
              title="Add a camera move to this target camera, at the playhead"
              onClick={() => addCameraMove(undefined, target.id)}
            >
              Move camera here
            </button>
          }
        >
          {users.length === 0 ? (
            <p className="an-hint" data-testid="target-camera-unused">
              No move goes to it yet.
            </p>
          ) : (
            <ul className="camera-targets" data-testid="target-camera-moves">
              {users.map((move) => (
                <li key={move.id} className="camera-target-row">
                  <button
                    type="button"
                    className="an-small-button"
                    data-testid={`target-camera-move-${move.id}`}
                    onClick={() =>
                      useUiStore.getState().select({ kind: 'cameraMove', id: move.id })
                    }
                  >
                    {seconds(move.start)} – {seconds(move.start + move.duration)}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>
        <IssuesSection
          issues={index < 0 ? [] : cameraIssues(project, ['camera', 'targets', index])}
          testId="target-camera-issues-section"
          listTestId="target-camera-issues"
        />
      </fieldset>
    </div>
  );
}

/** The view of what is selected of the camera; nothing for any other selection, and nothing once
 * the move, the target camera or the camera itself is gone (the selection is then pruned). */
export function CameraProperties({ selection }: { selection: Selection }) {
  const project = useProjectStore((s) => s.project);
  const camera = project.camera;
  if (!camera) return null;
  if (selection.kind === 'camera') return <CameraView project={project} camera={camera} />;
  if (selection.kind === 'cameraMove') {
    const move = movesInOrder(camera).find((m) => m.id === selection.id);
    return move ? <MoveView project={project} camera={camera} move={move} /> : null;
  }
  if (selection.kind === 'targetCamera') {
    const target = camera.targets.find((t) => t.id === selection.id);
    return target ? <TargetView project={project} camera={camera} target={target} /> : null;
  }
  return null;
}
