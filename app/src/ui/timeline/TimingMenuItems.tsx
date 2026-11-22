/* «Timing ›» in the menus of the timeline's clips (D150): copy when a clip starts and ends and how
 * long its intro and its outro are, and paste one of them onto the clip — or the clips — of the
 * menu (`clipTiming.ts`). One entry that opens beside the menu, so that it takes one line of it.
 * Copy is of one clip, and is there on a locked track too: it changes nothing. */
import { useProjectStore } from '../../store';
import { MenuItem, Submenu } from '../ContextMenu';
import { audioEditable } from './audioCommands';
import { editableClips } from './clipOps';
import {
  copyTiming,
  pasteTiming,
  seconds,
  TIMING_PARTS,
  timingValue,
  useTimingClipboard,
  type TimingPart,
} from './clipTiming';
import { isAudioClip, timelineClip } from './timelineClips';

interface TimingMenuItemsProps {
  /** The clips of the menu: one, or the selected ones. */
  clipIds: readonly string[];
  /** The test ids are `<testIdPrefix>-timing`, `-timing-copy` and `-timing-paste-<part>`. */
  testIdPrefix: string;
  /** Close the menu: called before an entry acts. */
  onClose(): void;
}

/** What the entry of a part says of the copied value: "starts at 1 s". */
const HINTS: Record<TimingPart, (value: string) => string> = {
  start: (value) => `starts at ${value}`,
  end: (value) => `ends at ${value}`,
  duration: (value) => `${value} long`,
  intro: (value) => value,
  outro: (value) => value,
};

export function TimingMenuItems({ clipIds, testIdPrefix: ids, onClose }: TimingMenuItemsProps) {
  const project = useProjectStore((state) => state.project);
  const timing = useTimingClipboard((state) => state.timing);
  const clips = clipIds.flatMap((id) => timelineClip(project, id) ?? []);
  if (clips.length === 0) return null;
  const single = clips.length === 1 ? clips[0]! : null;
  /** Sounds alone have no intro nor outro to give a time to. */
  const soundsOnly = clips.every(isAudioClip);
  const editable =
    editableClips(project, clipIds).length +
    project.audioClips.filter((clip) => clipIds.includes(clip.id) && audioEditable(project, clip))
      .length;
  const act = (run: () => void) => () => {
    onClose();
    run();
  };
  return (
    <Submenu
      label="Timing"
      testId={`${ids}-timing`}
      title="Copy when this clip starts and ends and how long its intro and its outro are, or paste one of them from the copied clip"
    >
      {single && (
        <>
          <MenuItem testId={`${ids}-timing-copy`} onClick={act(() => void copyTiming(single.id))}>
            Copy timing
            <span className="ctx-hint">
              {seconds(single.start)}–{seconds(single.end)}
            </span>
          </MenuItem>
          <hr className="ctx-sep" />
        </>
      )}
      <div className="ctx-header" data-testid={`${ids}-timing-from`}>
        {timing ? `From ${timing.from}` : 'Nothing copied'}
      </div>
      {TIMING_PARTS.filter(
        (part) => !soundsOnly || (part.id !== 'intro' && part.id !== 'outro'),
      ).map((part) => {
        const value = timing ? timingValue(timing, part.id) : null;
        return (
          <MenuItem
            key={part.id}
            testId={`${ids}-timing-paste-${part.id}`}
            disabled={value === null || editable === 0}
            onClick={act(() => void pasteTiming(clipIds, part.id))}
          >
            {part.label}
            {timing && (
              <span className="ctx-hint">
                {value === null ? `it has no ${part.id}` : HINTS[part.id](seconds(value))}
              </span>
            )}
          </MenuItem>
        );
      })}
    </Submenu>
  );
}
