/* The intro or the outro of a clip: its animation and that animation's options. The intro of a
 * formula or a text also says whether the clip starts empty (`Clip.startsEmpty`): then nothing of
 * it comes in with the intro, which keeps its time and animates no glyph. A brace, a shape or a
 * line cannot start empty; one that does (a file written by hand: an error of the project) shows
 * the box too, so that it can be unticked.
 *
 * Under it, the intro of a clip that leaves some glyphs out itself (`Clip.startHidden`, D178: the
 * first half of a split, for the glyphs that only came on screen after the cut) says how many —
 * those the formula does not hide anyway (`leftOutGlyphs`) —, with a button that brings them
 * back; both say which glyphs, and why, in their tooltip. A clip that starts empty leaves them
 * all out, so the line waits until the box is unticked: the list is kept meanwhile.
 *
 * The length of the animation, chosen or typed in, stops where the window of a relation with a
 * clip on a locked track would no longer fit (`lockedPhaseRoom`): that window stays where it
 * plays. An animation it leaves no room for is not given, and a notice says why. */
import { KINDS, type Clip, type IntroKind, type OutroKind } from '../../model';
import { buildEvents, defaultLagRatio } from '../../scene';
import { history, useProjectStore } from '../../store';
import { notify } from '../project/noticeStore';
import {
  lockedPhaseBlocker,
  lockedPhaseReason,
  lockedPhaseRoom,
} from '../relations/lockedRelations';
import { MIN_ACTION_DURATION } from '../timeline/clipOps';
import { introChoicesOf, OUTRO_CHOICES } from './catalogue';
import {
  clearStartHidden,
  leftOutGlyphs,
  maxPhaseDuration,
  setPhaseDuration,
  setPhaseKind,
  setStartsEmpty,
  startHiddenLine,
  startHiddenReason,
  type Phase,
} from './clipEdit';
import { CheckField, SelectField } from './fields';
import { Section } from './Section';
import { SpecFields } from './SpecFields';
import { useClipEdit } from './useClipEdit';

/** What "Starts empty" means, under its box here and in the relation editor. */
export const STARTS_EMPTY_HINT =
  'Glyphs appear only when a relation, a Morph or an Appear brings them.';
/** What is left of the intro of a clip that starts empty. */
export const IDLE_INTRO_HINT =
  'The intro has no glyph to animate: it only keeps its time (None frees it).';

export function PhaseEditor({ clip, phase }: { clip: Clip; phase: Phase }) {
  const edit = useClipEdit(clip.id);
  const target = useProjectStore((s) => s.project.meta.target);
  const project = useProjectStore((s) => s.project);
  const spec = clip[phase];
  const none = spec.kind === 'none';
  const fade = spec.kind === 'fade_in' || spec.kind === 'fade_out';

  // What "Auto" resolves to, from the number of glyphs this animation moves.
  const event = buildEvents(project).find((e) => e.id === `${phase}:${clip.id}`);
  const formula = project.formulas.find((f) => f.id === clip.formulaId);
  // The animations its kind takes: a line is drawn or faded, never grown.
  const kind = formula ? KINDS[formula.kind] : null;
  const choices =
    phase === 'intro'
      ? introChoicesOf(formula)
      : OUTRO_CHOICES.filter((choice) => !kind || kind.outros.includes(choice.value));

  /** The project and the clip to plan with, once a drag still held is given up. */
  const settled = () => {
    history.cancelForeignGesture();
    const now = useProjectStore.getState().project;
    const current = now.clips.find((c) => c.id === clip.id);
    return current ? { project: now, clip: current } : null;
  };
  /** The animation `chosen`, as long as the windows of the clip's relations with clips on locked
   * tracks leave it (they stay where they play); when they leave it no room at all, a notice says
   * so and the clip stays as it is. */
  const chooseKind = (chosen: IntroKind | OutroKind) => {
    const now = settled();
    if (!now) return;
    const blocker =
      chosen === 'none'
        ? null
        : lockedPhaseBlocker(now.project, now.clip, phase, MIN_ACTION_DURATION);
    if (blocker) {
      const label = choices.find((choice) => choice.value === chosen)?.label ?? chosen;
      notify({
        kind: 'info',
        title: `No room for ${label}`,
        message: lockedPhaseReason(now.project, blocker.relation, phase, formula?.name ?? '?'),
      });
      return;
    }
    const longest = lockedPhaseRoom(now.project, now.clip, phase);
    edit((c) => setPhaseKind(c, phase, chosen, undefined, longest));
  };
  /** The length typed in, as far as those windows let it go. */
  const setDuration = (duration: number) => {
    const now = settled();
    if (!now) return;
    const longest = lockedPhaseRoom(now.project, now.clip, phase);
    edit((c) => setPhaseDuration(c, phase, Math.min(duration, longest)));
  };

  const glyphs = formula?.snapshot?.glyphs.length;
  const animated =
    glyphs !== undefined && event && (event.kind === 'intro' || event.kind === 'outro')
      ? Math.max(0, glyphs - event.except.length)
      : undefined;
  const auto =
    !none && animated !== undefined ? defaultLagRatio(spec.kind, animated, target) : undefined;
  const leftOut = phase === 'intro' && !clip.startsEmpty ? leftOutGlyphs(clip, formula) : [];
  const leftOutReason = startHiddenReason(leftOut, (g) => formula?.snapshot?.glyphs[g]?.label);

  return (
    <Section title={phase === 'intro' ? 'Intro' : 'Outro'} testId={`${phase}-section`} tone={phase}>
      {phase === 'intro' && (kind?.transfers || clip.startsEmpty) && (
        <>
          <CheckField
            label="Starts empty"
            testId="clip-starts-empty"
            checked={clip.startsEmpty === true}
            onChange={(on) => edit((c) => setStartsEmpty(c, on))}
          />
          <p className="an-hint" data-testid="clip-starts-empty-hint">
            {STARTS_EMPTY_HINT}
            {clip.startsEmpty && !none ? ` ${IDLE_INTRO_HINT}` : ''}
          </p>
        </>
      )}
      {leftOut.length > 0 && (
        <div className="an-left-out" data-testid="clip-start-hidden" data-count={leftOut.length}>
          <p className="an-hint" title={leftOutReason}>
            {startHiddenLine(leftOut.length)}
          </p>
          <button
            type="button"
            className="an-small-button"
            data-testid="clip-start-hidden-clear"
            title={`${leftOutReason} The intro brings ${leftOut.length === 1 ? 'it' : 'them'} in again, as the other glyphs.`}
            onClick={() => edit((c) => clearStartHidden(c, formula))}
          >
            {leftOut.length === 1 ? 'Bring it back' : 'Bring them back'}
          </button>
        </div>
      )}
      <SelectField
        label="Animation"
        testId={`${phase}-kind`}
        value={spec.kind}
        options={choices}
        onChange={chooseKind}
      />
      <SpecFields
        prefix={phase}
        duration={spec.duration}
        maxDuration={Math.min(maxPhaseDuration(clip, phase), lockedPhaseRoom(project, clip, phase))}
        easing={spec.easing}
        lagRatio={spec.lagRatio}
        manimLag={auto}
        shift={spec.shift}
        scale={spec.scale}
        fade={fade}
        unscaled={formula?.kind === 'line'}
        disabled={none}
        onDuration={setDuration}
        onEasing={(easing) =>
          edit((c) => {
            c[phase].easing = easing;
          })
        }
        onLagRatio={(value) =>
          edit((c) => {
            c[phase].lagRatio = value;
          })
        }
        onShift={(value) =>
          edit((c) => {
            c[phase].shift = value;
          })
        }
        onScale={(value) =>
          edit((c) => {
            c[phase].scale = value;
          })
        }
      />
    </Section>
  );
}
