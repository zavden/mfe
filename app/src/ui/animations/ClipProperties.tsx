import { useState } from 'react';
import { KINDS } from '../../model';
import { tweensOf } from '../../scene';
import { history, useProjectStore, useRenderStore, useUiStore } from '../../store';
import { deleteClipsAsking } from '../timeline/clipActions';
import { endBounds, startBounds, trackGaps, trimEnd, trimStart } from '../timeline/clipOps';
import { round6 } from '../time';
import { addKeyframeAt } from './clipEdit';
import { relatable } from '../relations/relationOps';
import { RelationsSection } from '../relations/RelationsSection';
import { Tabs } from '../Tabs';
import { useAnimationsTab } from './animationsTab';
import { NumberField, SelectField } from './fields';
import { AttachmentSection } from './AttachmentSection';
import { LineSection } from './LineSection';
import { AddAnimationButton } from './BlockMenus';
import { BlockRow } from './BlockRow';
import { Section } from './Section';
import { clipContext } from './context';
import { PropertiesHeader } from './PropertiesHeader';
import { clipIssues } from './issues';
import { IssuesSection } from './IssueList';
import { PhaseEditor } from './PhaseEditor';
import { StateFields } from './StateFields';
import { TweenEditor } from './TweenEditor';
import { useClipEdit } from './useClipEdit';

/** "Add keyframe at playhead": a tween starting at the playhead that moves to the state the clip
 * has there; edit its target afterwards (here, or by dragging the formula in the preview). */
function KeyframeButton({
  clipId,
  onNotice,
}: {
  clipId: string;
  onNotice(text: string | null): void;
}) {
  const time = useUiStore((s) => s.time);
  const update = useProjectStore((s) => s.update);

  const add = () => {
    const live = useProjectStore.getState().project;
    const target = live.clips.find((c) => c.id === clipId);
    if (!target) return;
    const t = useUiStore.getState().time;
    // Probe on a copy first, so that a refused attempt does not create an undo step.
    if (!addKeyframeAt(live, structuredClone(target), t)) {
      onNotice(
        'Move the playhead to free time inside the clip: after the intro, before the outro, clear of other tweens and relation windows.',
      );
      return;
    }
    onNotice(null);
    update((draft) => {
      const c = draft.clips.find((x) => x.id === clipId);
      if (c) addKeyframeAt(draft, c, t);
    });
  };

  return (
    <button
      type="button"
      className="an-small-button an-accent-button"
      data-testid="add-keyframe"
      title={`Add a tween that starts at the playhead (${time.toFixed(2)} s) and moves to the clip's state there. Edit its target afterwards.`}
      onClick={add}
    >
      Add keyframe at playhead
    </button>
  );
}

// --- The panel -------------------------------------------------------------------

export function ClipProperties({ clipId }: { clipId: string }) {
  const project = useProjectStore((s) => s.project);
  const formulas = useRenderStore((s) => s.resolved);
  const edit = useClipEdit(clipId);
  const [notice, setNotice] = useState<string | null>(null);
  const tab = useAnimationsTab((s) => s.tab);
  const setTab = useAnimationsTab((s) => s.setTab);

  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip) return null;
  const formula = project.formulas.find((f) => f.id === clip.formulaId);
  const track = project.tracks.find((t) => t.id === clip.trackId);

  const issues = clipIssues(project, clipId, formulas);

  /** The clip to plan with. A field keeps the focus when the button goes down on an edge of the
   * clip, so its Enter can come during a trim: what is on screen is then what the trim shows, and
   * the edit goes to the clip the trim leaves (`history.cancelForeignGesture`). */
  const settled = () => {
    history.cancelForeignGesture();
    const now = useProjectStore.getState().project;
    const current = now.clips.find((c) => c.id === clipId);
    return current ? { project: now, clip: current } : null;
  };

  const moveToTrack = (trackId: string) => {
    const now = settled();
    if (!now) return;
    const fits = trackGaps(now.project, trackId, new Set([clipId])).some(
      (g) => g.start <= now.clip.start + 1e-6 && g.end >= now.clip.end - 1e-6,
    );
    if (!fits) {
      setNotice('That track is occupied during this clip.');
      return;
    }
    setNotice(null);
    edit((c) => {
      c.trackId = trackId;
    });
  };
  /** Move an edge of the clip to `wanted`, as far as its bounds let it go. */
  const setEdge = (edge: 'start' | 'end', wanted: number) => {
    const now = settled();
    if (!now) return;
    const [min, max] =
      edge === 'start' ? startBounds(now.project, now.clip) : endBounds(now.project, now.clip);
    const value = round6(Math.min(Math.max(wanted, min), max));
    edit((c) => (edge === 'start' ? trimStart(c, value) : trimEnd(c, value)));
  };

  return (
    <div className="an-clip" data-testid="clip-properties">
      {track?.locked && (
        <p className="an-notice an-locked" data-testid="clip-locked">
          Track “{track.name}” is locked: unlock it on the timeline to edit this clip.
        </p>
      )}
      <fieldset className="an-fieldset" disabled={track?.locked ?? false}>
        <PropertiesHeader
          sticky
          context={clipContext(project, clip)}
          color={formula?.tag.color}
          titleTestId="clip-title"
          title={`${formula?.tag.icon ? `${formula.tag.icon} ` : ''}${formula?.name ?? '(missing formula)'}`}
        >
          <button
            type="button"
            className="an-small-button"
            data-testid="clip-delete"
            onClick={() => void deleteClipsAsking(new Set([clipId]))}
          >
            Delete clip
          </button>
        </PropertiesHeader>

        <Tabs
          label="Clip animations"
          testId="animations"
          active={tab}
          onChange={setTab}
          tabs={[
            // A brace, a shape or a line is one piece: relations are between formulas and texts.
            ...(relatable(project, clip)
              ? [
                  {
                    id: 'relations' as const,
                    label: 'Relations',
                    content: (
                      <Section title="Relations" testId="relations-section" tone="relations">
                        <RelationsSection clipId={clipId} />
                      </Section>
                    ),
                  },
                ]
              : []),
            {
              id: 'timing',
              label: 'Timing',
              content: (
                <>
                  <Section title="Timing" testId="timing-section" tone="timing">
                    <SelectField
                      label="Track"
                      testId="clip-track"
                      value={track?.id ?? ''}
                      options={project.tracks.map((t) => ({ value: t.id, label: t.name }))}
                      onChange={moveToTrack}
                    />
                    <div className="an-row">
                      <NumberField
                        label="Start"
                        testId="clip-start"
                        value={clip.start}
                        min={0}
                        suffix="s"
                        onCommit={(v) => setEdge('start', v)}
                      />
                      <NumberField
                        label="End"
                        testId="clip-end"
                        value={clip.end}
                        suffix="s"
                        onCommit={(v) => setEdge('end', v)}
                      />
                      <div className="an-field">
                        <span className="an-label">Length</span>
                        <span className="an-static" data-testid="clip-length">
                          {(clip.end - clip.start).toFixed(3)} s
                        </span>
                      </div>
                    </div>
                  </Section>

                  <PhaseEditor clip={clip} phase="intro" />

                  {formula?.kind === 'line' ? (
                    <LineSection clip={clip} formula={formula} />
                  ) : (
                    formula && <AttachmentSection clip={clip} formula={formula} />
                  )}

                  <Section title="Initial state" testId="initial-section" tone="initial">
                    <StateFields
                      idPrefix="initial"
                      attached={clip.attach !== null}
                      fitted={formula !== undefined && KINDS[formula.kind].fitted !== null}
                      unturned={formula?.kind === 'line'}
                      state={clip.initial}
                      patch={(change) =>
                        edit((c) => {
                          const fields = typeof change === 'function' ? change(c.initial) : change;
                          c.initial = { ...c.initial, ...fields };
                        })
                      }
                    />
                  </Section>

                  <Section
                    title="Animations"
                    testId="blocks-section"
                    tone="animations"
                    actions={<AddAnimationButton clipId={clipId} onNotice={setNotice} />}
                  >
                    {notice && (
                      <p className="an-notice" data-testid="clip-notice" role="status">
                        {notice}
                      </p>
                    )}
                    {clip.actions.length === 0 && (
                      <p className="an-hint">
                        No animations. Add one at the playhead, or right-click the clip on the
                        timeline.
                      </p>
                    )}
                    {clip.actions.map((action) =>
                      action.kind === 'tween' ? (
                        <TweenEditor
                          key={action.id}
                          clip={clip}
                          action={action}
                          index={tweensOf(clip).indexOf(action)}
                        />
                      ) : (
                        <BlockRow key={action.id} clip={clip} action={action} />
                      ),
                    )}
                    <KeyframeButton clipId={clipId} onNotice={setNotice} />
                  </Section>

                  <PhaseEditor clip={clip} phase="outro" />
                </>
              ),
            },
          ]}
        />

        <IssuesSection issues={issues} testId="issues-section" listTestId="clip-issues" />
      </fieldset>
    </div>
  );
}
