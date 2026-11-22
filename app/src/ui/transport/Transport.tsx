import { useEffect } from 'react';
import { sceneDuration } from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import { isModalOpen } from '../project/modalStack';
import { inOpenMenu, keepFocus } from '../focus';
import { keyHint, keysText } from '../platform';
import { trackFocusOrigin } from '../focusOrigin';
import { spaceOperates } from '../project/shortcuts';
import { isEditableTarget } from '../timeline/dom';
import { usePreferences } from '../preferences';
import { formatGridStep, GRID_STEPS, type GridAnchor, stepGrid } from '../preview/grid';
import { Icon, type IconName } from '../timeline/icons';
import { useTimelineStore } from '../timeline/timelineStore';
import { mainPlayback, useAudioPlaybackStatus } from './mainPlayback';
import { formatTimecode, frameIndex, stepTime } from './playback';
import './transport.css';

function currentDuration(): number {
  return sceneDuration(useProjectStore.getState().project);
}

function currentFps(): number {
  return useProjectStore.getState().project.meta.fps;
}

function seek(time: number): void {
  mainPlayback.seek(Math.min(Math.max(time, 0), currentDuration()));
}

function togglePlay(): void {
  if (useUiStore.getState().playing || useAudioPlaybackStatus.getState().preparing)
    mainPlayback.pause();
  else mainPlayback.play();
}

function step(direction: -1 | 1, big: boolean): void {
  seek(stepTime(useUiStore.getState().time, currentFps(), currentDuration(), direction, big));
}

function ControlButton(props: {
  testId: string;
  label: string;
  title: string;
  icon: IconName;
  active?: boolean;
  disabled?: boolean;
  /** A class of its own (the Play key). */
  className?: string;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className={`transport-button${props.className ? ` ${props.className}` : ''}${props.active ? ' is-on' : ''}`}
      data-testid={props.testId}
      aria-label={props.label}
      aria-pressed={props.active}
      title={props.title}
      disabled={props.disabled}
      onMouseDown={keepFocus}
      onClick={props.onClick}
    >
      <Icon name={props.icon} />
    </button>
  );
}

/** The anchor button shows what the grid holds now; its title and label also say what a click
 * changes it to, since the icon carries no word. */
const ANCHOR: Record<GridAnchor, { icon: IconName; label: string }> = {
  center: {
    icon: 'grid-center',
    label: "The grid holds the formula's centre while dragging; click for its nearest edges",
  },
  edges: {
    icon: 'grid-edges',
    label: "The grid holds the formula's nearest edges while dragging; click for its centre",
  },
};

/** The grid controls, in the middle of the bar: show it, make it sparser or denser, and choose
 * what it holds (the formula's centre or its nearest edges). Preferences, kept in the browser. */
function GridControls() {
  const grid = usePreferences((state) => state.grid);
  const step = usePreferences((state) => state.gridStep);
  const anchor = usePreferences((state) => state.gridAnchor);
  const set = usePreferences((state) => state.set);
  return (
    <div className="transport-grid" role="group" aria-label="Grid">
      <ControlButton
        testId="transport-grid"
        label="Show grid"
        title={`Show the grid (${keyHint("Mod+'")}): a dragged formula snaps to it (${keyHint('Mod')} held frees it)`}
        icon="grid"
        active={grid}
        onClick={() => set({ grid: !grid })}
      />
      <ControlButton
        testId="transport-grid-sparser"
        label="Sparser grid"
        title={`Sparser grid (${keyHint('Alt+↓')})`}
        icon="minus"
        disabled={!grid || step === GRID_STEPS[0]}
        onClick={() => set({ gridStep: stepGrid(step, -1) })}
      />
      <span
        className={`transport-readout transport-grid-step${grid ? '' : ' dim'}`}
        data-testid="transport-grid-step"
        title="Grid spacing, in Manim units"
      >
        {formatGridStep(step)}
      </span>
      <ControlButton
        testId="transport-grid-denser"
        label="Denser grid"
        title={`Denser grid (${keyHint('Alt+↑')})`}
        icon="plus"
        disabled={!grid || step === GRID_STEPS[GRID_STEPS.length - 1]}
        onClick={() => set({ gridStep: stepGrid(step, 1) })}
      />
      <button
        type="button"
        className="transport-button"
        data-testid="transport-grid-anchor"
        data-anchor={anchor}
        aria-label={ANCHOR[anchor].label}
        title={ANCHOR[anchor].label}
        disabled={!grid}
        onMouseDown={keepFocus}
        onClick={() => set({ gridAnchor: anchor === 'center' ? 'edges' : 'center' })}
      >
        <Icon name={ANCHOR[anchor].icon} />
      </button>
    </div>
  );
}

/** Playback controls under the preview. Playback is a clock over `useUiStore.time`: the preview
 * redraws from `time`, so playing and scrubbing take the same path. */
export function Transport() {
  const audioStatus = useAudioPlaybackStatus();
  const hasAudio = useProjectStore((state) => state.project.audioClips.length > 0);
  const time = useUiStore((s) => s.time);
  const playing = useUiStore((s) => s.playing);
  const loop = useTimelineStore((s) => s.loop);
  const setLoop = useTimelineStore((s) => s.setLoop);
  const stopAtPauses = useTimelineStore((s) => s.stopAtPauses);
  const setStopAtPauses = useTimelineStore((s) => s.setStopAtPauses);
  // The rehearsal of the Slides mode: only a project with the mode on has pauses to stop at.
  const slides = useProjectStore((s) => s.project.slides !== undefined);
  const fps = useProjectStore((s) => s.project.meta.fps);
  const duration = useProjectStore((s) => sceneDuration(s.project));

  useEffect(() => mainPlayback.connect(), []);

  // Keyboard: Space, Home / End, ← / → (Shift: one second). Not while a dialog is open, nor in an
  // open menu, whose keys are its own (`inOpenMenu`): Space presses its entry there, and the
  // playhead does not move under it.
  useEffect(() => {
    trackFocusOrigin();
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isModalOpen()) return;
      if (inOpenMenu(e.target)) return;
      // Space plays and pauses, unless the focused control uses it (a field, a checkbox, a menu
      // item, a button reached with the keyboard); a button that only kept the focus after a
      // click, or got it back from a dialog that closed, does not take it.
      if (e.key === ' ') {
        if (spaceOperates(e.target)) return;
        e.preventDefault();
        togglePlay();
        return;
      }
      if (isEditableTarget(e.target)) return;
      switch (e.key) {
        case 'Home':
          e.preventDefault();
          seek(0);
          break;
        case 'End':
          e.preventDefault();
          seek(currentDuration());
          break;
        case 'ArrowLeft':
          e.preventDefault();
          step(-1, e.shiftKey);
          break;
        case 'ArrowRight':
          e.preventDefault();
          step(1, e.shiftKey);
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="transport" data-testid="transport" role="toolbar" aria-label="Playback">
      <ControlButton
        testId="transport-start"
        label="Go to start"
        title="Go to start (Home)"
        icon="to-start"
        onClick={() => seek(0)}
      />
      <ControlButton
        testId="transport-step-back"
        label="Previous frame"
        title={keysText('Previous frame (←, Shift: 1 s)')}
        icon="step-back"
        onClick={() => step(-1, false)}
      />
      <ControlButton
        testId="transport-play"
        label={audioStatus.preparing ? 'Cancel audio preparation' : playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
        icon={playing || audioStatus.preparing ? 'pause' : 'play'}
        className="transport-play"
        active={playing}
        onClick={togglePlay}
      />
      <ControlButton
        testId="transport-step-forward"
        label="Next frame"
        title={keysText('Next frame (→, Shift: 1 s)')}
        icon="step-forward"
        onClick={() => step(1, false)}
      />
      <ControlButton
        testId="transport-end"
        label="Go to end"
        title="Go to end (End)"
        icon="to-end"
        onClick={() => seek(duration)}
      />
      <span className="transport-sep" aria-hidden="true" />
      <ControlButton
        testId="transport-stop"
        label="Stop"
        title="Stop and return to the start"
        icon="stop"
        onClick={mainPlayback.reset}
      />
      <ControlButton
        testId="transport-loop"
        label="Loop"
        title="Loop playback"
        icon="loop"
        active={loop}
        onClick={() => setLoop(!loop)}
      />
      {slides && (
        <ControlButton
          testId="transport-stop-at-pauses"
          label="Stop at pauses"
          title="Stop at each pause of the Slides mode, as the exported page does: Play goes on to the next"
          icon="stop-at-pauses"
          active={stopAtPauses}
          onClick={() => setStopAtPauses(!stopAtPauses)}
        />
      )}
      <span className="transport-spacer" />
      <GridControls />
      {hasAudio && (
        <span
          className={`transport-readout${audioStatus.peak > 1 ? ' audio-clipping' : ''}`}
          data-testid="audio-meter"
          title="Mixed audio peak. Values above 100% clip."
        >
          {audioStatus.preparing
            ? 'Preparing audio…'
            : `♪ ${Math.round(audioStatus.peak * 100)}%${audioStatus.peak > 1 ? ' Clip' : ''}`}
        </span>
      )}
      <span className="transport-spacer" />
      <span className="transport-readout is-time" data-testid="transport-seconds" title="Seconds">
        {time.toFixed(3)} s
      </span>
      <span className="transport-readout" data-testid="transport-timecode" title="MM:SS:FF">
        {formatTimecode(time, fps)}
      </span>
      <span className="transport-readout dim" data-testid="transport-frame" title="Frame">
        f{frameIndex(time, fps)} / {Math.round(duration * fps)}
      </span>
    </div>
  );
}
