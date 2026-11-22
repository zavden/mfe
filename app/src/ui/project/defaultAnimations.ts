/* Edit → Default intro & outro…: the editable draft behind the dialog, its validation and the
 * names shown in the menus. The result is stored with `usePreferences` (see ui/preferences.ts):
 * it only affects clips created afterwards. */
import {
  defaultIntro,
  defaultOutro,
  type ClipAnimationSpec,
  type Easing,
  type IntroKind,
  type IntroSpec,
  type OutroKind,
  type OutroSpec,
} from '../../model';
import { DROPPED_CLIP_LENGTH } from '../timeline/layout';

/** Shortest animation a clip can have (the Timeline's MIN_ACTION_DURATION). */
export const MIN_DURATION = 0.05;

/** One phase as the text fields show it. */
export interface PhaseDraft {
  kind: string;
  duration: string;
  easing: Easing;
  lagMode: 'auto' | 'custom';
  lag: string;
  shiftX: string;
  shiftY: string;
  scale: string;
}

export interface AnimationsDraft {
  intro: PhaseDraft;
  outro: PhaseDraft;
}

export const isFade = (kind: string) => kind === 'fade_in' || kind === 'fade_out';

export function phaseToDraft(spec: ClipAnimationSpec<string>): PhaseDraft {
  return {
    kind: spec.kind,
    duration: String(spec.duration),
    easing: spec.easing,
    lagMode: spec.lagRatio === null ? 'auto' : 'custom',
    lag: String(spec.lagRatio ?? 0),
    shiftX: String(spec.shift[0]),
    shiftY: String(spec.shift[1]),
    scale: String(spec.scale),
  };
}

/** The draft after choosing another animation: that animation's own defaults, as in the
 * clip properties. */
export function phaseForKind(phase: 'intro' | 'outro', kind: string): PhaseDraft {
  return phaseToDraft(
    phase === 'intro' ? defaultIntro(kind as IntroKind) : defaultOutro(kind as OutroKind),
  );
}

export function toDraft(intro: IntroSpec, outro: OutroSpec): AnimationsDraft {
  return { intro: phaseToDraft(intro), outro: phaseToDraft(outro) };
}

export type DraftErrors = Record<string, string>;

type Parsed = { ok: true; intro: IntroSpec; outro: OutroSpec } | { ok: false; errors: DraftErrors };

const parseNumber = (text: string): number | null => {
  if (text.trim() === '') return null;
  const n = Number(text.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

function parsePhase<K extends string>(
  phase: 'intro' | 'outro',
  draft: PhaseDraft,
  errors: DraftErrors,
): ClipAnimationSpec<K> {
  const name = phase === 'intro' ? 'Intro' : 'Outro';
  const duration = parseNumber(draft.duration);
  if (duration === null || duration < MIN_DURATION) {
    errors[`${phase}.duration`] = `${name} duration: seconds, at least ${MIN_DURATION}.`;
  }
  let lagRatio: number | null = null;
  if (draft.lagMode === 'custom') {
    lagRatio = parseNumber(draft.lag);
    if (lagRatio === null || lagRatio < 0) {
      errors[`${phase}.lag`] = `${name} lag ratio: a number, 0 or more.`;
    }
  }
  const fade = isFade(draft.kind);
  let shift: [number, number] = [0, 0];
  let scale = 1;
  if (fade) {
    const x = parseNumber(draft.shiftX);
    const y = parseNumber(draft.shiftY);
    if (x === null || y === null) errors[`${phase}.shift`] = `${name} shift: two numbers.`;
    else shift = [x, y];
    const s = parseNumber(draft.scale);
    if (s === null || s <= 0) errors[`${phase}.scale`] = `${name} scale: a number above 0.`;
    else scale = s;
  }
  return {
    kind: draft.kind as K,
    duration: duration ?? 0,
    easing: draft.easing,
    lagRatio,
    shift,
    scale,
  };
}

/** Validate the draft like the clip properties do (positive durations, lag ratio ≥ 0, fade
 * scale > 0). Intro and outro must also fit together in the clip a drop creates, or the new
 * clip would be invalid. */
export function parseDraft(draft: AnimationsDraft): Parsed {
  const errors: DraftErrors = {};
  const intro = parsePhase<IntroKind>('intro', draft.intro, errors);
  const outro = parsePhase<OutroKind>('outro', draft.outro, errors);
  const total = intro.duration + outro.duration;
  if (
    !errors['intro.duration'] &&
    !errors['outro.duration'] &&
    total > DROPPED_CLIP_LENGTH + 1e-9
  ) {
    errors.total =
      `Intro and outro last ${+total.toFixed(3)} s together; a clip dropped on the timeline ` +
      `is ${DROPPED_CLIP_LENGTH} s long.`;
  }
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, intro, outro };
}
