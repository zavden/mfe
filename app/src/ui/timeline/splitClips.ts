/* Splitting clips of the scene at the playhead (D169): a clip becomes two that touch there. The
 * first half is the clip itself, still of its formula; the second is a clip of a **copy** of
 * that formula, named after it with a suffix (`f1` → `f1_s`, then `f1_s1`, `f1_s2`…: `splitName`),
 * that starts exactly as the object is at that instant, without an intro: where the tweens before
 * the cut left it, with the glyphs that are on screen then — the copy hides the others — and the
 * colours a Transform of a part gave some of them. The intro stays with the first half and the
 * outro goes with the second; what lies whole on one side goes with its half — the blocks, the
 * relations, the objects attached to the clip —, and what is measured on the clip from the cut on
 * (an attachment, a Transform that carries a shape or a line to its glyphs) is measured on the
 * second half. The glyphs that only come on screen after the cut — an Appear block, a relation or
 * a Morph block of the second half brings them — stay out of the first half's intro, which would
 * bring them now that nothing holds them back: the first half lists them (`Clip.startHidden`,
 * D178). A brace, a shape or a line is split the same way: its second half is another object,
 * equal to it.
 *
 * What **crosses** the cut refuses it, with a reason that names it: the intro or the outro still
 * running, a block, the window of a relation, the clip of an object attached to the clip that is
 * not split with it. So does a relation with a clip on a locked track that would go to the second
 * half: it is not edited (`relationLock`). So does a state a clip cannot start with: glyphs a
 * Transform block moved or made fainter, a shape a Transform carried elsewhere, a line whose ends
 * a Transform moved; and a brace, a shape or a line that only comes on screen after the cut — one
 * piece, which a clip cannot leave out of its intro.
 *
 * Pure. `planSplit` builds the project with the clips split and checks it against the one it
 * comes from: the stays on screen of every glyph (`clipLifetimes`) must be the ones it had, cut
 * in two; no new error may come up (`validateProject`); and, given the renders, the scene must
 * draw the same before and after (`sceneDifferences`) — what guarantees that the second half
 * starts as the object was. Every clip a check finds at fault is refused in the same round, and
 * the others are planned again without them (a clip placed by another at fault waits for the next
 * round, which looks at it again without that one). The command is `splitAtPlayhead`
 * (`splitActions.ts`). */
import { produce } from 'immer';
import type { ResolvedFormulas } from '../../engine';
import { refreshLocalRenders } from '../../engine';
import {
  actionWindow,
  causeKey,
  clipLifetimes,
  defaultIntro,
  defaultOutro,
  groupCopies,
  introWindow,
  KINDS,
  newId,
  outroWindow,
  placementUses,
  relationWindow,
  TIME_EPSILON,
  validateProject,
  type Cause,
  type Clip,
  type ClipAction,
  type ClipId,
  type ClipLifetime,
  type Formula,
  type FormulaId,
  type Issue,
  type Project,
  type Stint,
} from '../../model';
import {
  actionStates,
  createEvaluator,
  endsAtStart,
  glyphColor,
  overridesEndedBy,
  settleScene,
  stateAt,
  type Drawable,
} from '../../scene';
import { animationLabel } from '../animations/catalogue';
import { animationName } from '../animations/blockKinds';
import { lockedReason, relationName } from '../relations/lockedRelations';
import { relationLock } from '../relations/relationOps';
import { round6 } from '../time';
import { MIN_CLIP_LENGTH } from './clipOps';

const seconds = (t: number) => `${t.toFixed(2)} s`;
const span = (w: { start: number; end: number }) => `${w.start.toFixed(2)}–${seconds(w.end)}`;

/** "glyph 3", "glyphs 3, 4 and 7". */
function glyphList(glyphs: readonly number[]): string {
  const sorted = [...glyphs].sort((a, b) => a - b);
  if (sorted.length === 1) return `glyph ${sorted[0]}`;
  return `glyphs ${sorted.slice(0, -1).join(', ')} and ${sorted.at(-1)}`;
}

/** The name the copy of `name` gets from a split: `name + suffix`, and when a formula has it (or
 * it cannot be a name: `valid`) numbered from 1 — `f1_s`, `f1_s1`, `f1_s2`… */
export function splitName(
  name: string,
  suffix: string,
  used: ReadonlySet<string>,
  valid: (name: string) => boolean = () => true,
): string {
  const base = `${name}${suffix}`;
  // Among the base and that many numbered names, one is free. A name that nothing makes valid —
  // the formula's own is not one — is only kept from repeating.
  const limit = used.size + 1;
  for (const accepts of [valid, () => true]) {
    if (!used.has(base) && accepts(base)) return base;
    for (let n = 1; n <= limit; n++) {
      const numbered = `${base}${n}`;
      if (!used.has(numbered) && accepts(numbered)) return numbered;
    }
  }
  return `${base}${limit + 1}`;
}

/** The clips of `ids` the playhead (`time`) is strictly inside: those a split there would cut,
 * on a locked track or not. In the project's order. */
export function splitCandidates(project: Project, ids: readonly ClipId[], time: number): Clip[] {
  const named = new Set(ids);
  return project.clips.filter(
    (clip) =>
      named.has(clip.id) && time > clip.start + TIME_EPSILON && time < clip.end - TIME_EPSILON,
  );
}

/** One clip that was split. */
export interface SplitPiece {
  /** The clip that was split: it keeps its id, and is the first half. */
  clipId: ClipId;
  /** The clip of the second half. */
  rightId: ClipId;
  /** The object the clip was of, and the copy of it the second half is of. */
  sourceId: FormulaId;
  copy: Formula;
}

/** A clip that could not be split, with the name of its object and the reason. */
export interface SplitRefusal {
  clipId: ClipId;
  name: string;
  reason: string;
}

export interface SplitPlan {
  /** The project with the pieces split: the project given when there is none. */
  project: Project;
  pieces: SplitPiece[];
  refused: SplitRefusal[];
}

export interface SplitOptions {
  /** What the copy's name ends in (`splitSuffix.ts`). */
  suffix: string;
  /** Whether a name can be a formula's (the Creator's rule); every name when absent. */
  validName?: (name: string) => boolean;
  /** The renders of the project's formulas: with them the scene is drawn before and after, and a
   * clip whose halves do not draw as it did is refused. Without them that check is not made. */
  resolved?: ResolvedFormulas;
}

interface Context {
  project: Project;
  time: number;
  formulas: Map<FormulaId, Formula>;
  lifetimes: Map<ClipId, ClipLifetime>;
}

const nameOf = (ctx: Pick<Context, 'formulas'>, clip: Clip) =>
  ctx.formulas.get(clip.formulaId)?.name ?? '?';

/** What crosses the cut of `clip`, or keeps it from being cut there: the reason, or null.
 * `wanted`: the clips split with it in this round; `asked`: those the split was asked for, among
 * which an object attached to it that a round before refused (it could not be split). */
function crossing(
  ctx: Context,
  clip: Clip,
  wanted: ReadonlySet<ClipId>,
  asked: ReadonlySet<ClipId>,
): string | null {
  const { project, time } = ctx;
  if (project.tracks.find((t) => t.id === clip.trackId)?.locked) return 'Its track is locked.';
  if (
    time - clip.start < MIN_CLIP_LENGTH - TIME_EPSILON ||
    clip.end - time < MIN_CLIP_LENGTH - TIME_EPSILON
  ) {
    return `The playhead is too near an end of the clip: each half needs ${MIN_CLIP_LENGTH} s.`;
  }
  const intro = introWindow(clip);
  if (clip.intro.duration > 0 && time < intro.end - TIME_EPSILON) {
    return `Its intro (${animationLabel(clip.intro.kind)}) is still running at the playhead: it ends at ${seconds(intro.end)}.`;
  }
  const outro = outroWindow(clip);
  if (clip.outro.duration > 0 && time > outro.start + TIME_EPSILON) {
    return `Its outro (${animationLabel(clip.outro.kind)}) has started at the playhead: it starts at ${seconds(outro.start)}.`;
  }
  const crosses = (w: { start: number; end: number }) =>
    w.start < time - TIME_EPSILON && w.end > time + TIME_EPSILON;
  for (const action of clip.actions) {
    const window = actionWindow(clip, action);
    if (crosses(window)) {
      return `Its ${animationName(action)} block (${span(window)}) crosses the playhead.`;
    }
  }
  for (const relation of project.relations) {
    if (relation.fromClipId !== clip.id && relation.toClipId !== clip.id) continue;
    const from = project.clips.find((c) => c.id === relation.fromClipId);
    const to = project.clips.find((c) => c.id === relation.toClipId);
    if (!from || !to) continue;
    const window = relationWindow(relation, to);
    if (crosses(window)) {
      return `The relation from “${nameOf(ctx, from)}” to “${nameOf(ctx, to)}” (${span(window)}) crosses the playhead.`;
    }
    // One whose window starts from the cut on would be the second half's (`build`): a relation
    // with a clip on a locked track is not edited, so the clip stays whole.
    if (window.start >= time - TIME_EPSILON && relationLock(project, relation) !== null) {
      return lockedReason(
        project,
        relation,
        `The ${relationName(project, relation)} would go to the second half.`,
      );
    }
  }
  for (const other of project.clips) {
    if (other.id === clip.id || wanted.has(other.id) || !crosses(other)) continue;
    const hangs = placementUses(other).some(
      (use) =>
        use.owner.kind === 'attach' && use.spots.some((spot) => spot.target.clipId === clip.id),
    );
    if (hangs) {
      const what = `“${nameOf(ctx, other)}” (${span(other)}), attached to it, crosses the playhead`;
      // Asked for and refused: selecting it again would change nothing.
      return asked.has(other.id)
        ? `${what} and could not be split.`
        : `${what}: select it too to split both, or trim it.`;
    }
  }
  return null;
}

/** What the blocks before the cut left of `clip` that the tweens' state does not say: the
 * colours a Transform of a part gave glyphs, still theirs at the cut (`colors`); or the reason a
 * clip cannot start as this one is then. */
function settledParts(
  ctx: Context,
  clip: Clip,
  formula: Formula,
): { ok: true; colors: Map<number, string> } | { ok: false; reason: string } {
  const { time } = ctx;
  const ended = (action: ClipAction) => actionWindow(clip, action).end <= time + TIME_EPSILON;
  const states = actionStates(clip);
  // A Transform that carried the shape elsewhere, or moved the ends of the line.
  for (const { action } of states) {
    if (!ended(action) || endsAtStart(action.easing)) continue;
    const at = seconds(clip.start + action.start);
    if (action.fit) {
      return {
        ok: false,
        reason: `The Transform at ${at} carried the shape to other glyphs: the second half cannot start fitted there.`,
      };
    }
    const attach = clip.attach;
    if (action.ends) {
      const same =
        attach?.rule === 'ends' &&
        action.ends.degrees === null &&
        JSON.stringify([action.ends.start, action.ends.end, action.ends.buff]) ===
          JSON.stringify([attach.start, attach.end, attach.buff]);
      if (!same) {
        return {
          ok: false,
          reason: `The Transform at ${at} moved the ends of the line: the second half cannot start between them.`,
        };
      }
      // A line draws the stroke width of its state only from a Transform of its ends on.
      if (action.to.strokeWidth !== undefined) {
        return {
          ok: false,
          reason: `The Transform at ${at} changed the stroke width of the line: the second half cannot start with it.`,
        };
      }
    }
  }
  // What comes on screen, or leaves it, with an easing that ends where it started stays half
  // drawn: a clip brings its glyphs whole.
  if (clip.intro.duration > 0 && endsAtStart(clip.intro.easing)) {
    return {
      ok: false,
      reason: `Its intro ends where it started (its easing, ${clip.intro.easing}, comes back): the second half could not start with the glyphs as that leaves them.`,
    };
  }
  for (const action of clip.actions) {
    if (!ended(action) || !endsAtStart(action.easing)) continue;
    if (action.kind === 'appear' || action.kind === 'disappear') {
      return {
        ok: false,
        reason: `The ${animationName(action)} block at ${seconds(clip.start + action.start)} ends where it started (its easing, ${action.easing}, comes back): the second half could not start with the glyphs as that leaves them.`,
      };
    }
  }
  // An object placed by what it is attached to, that a Transform of its own then moved: its
  // second half would be placed by the attachment again.
  if (clip.attach && clip.attach.rule !== 'ends') {
    const now = stateAt(clip, time, ctx.project.meta.target);
    const was = clip.initial;
    const moved =
      Math.abs(now.position[0] - was.position[0]) > 1e-6 ||
      Math.abs(now.position[1] - was.position[1]) > 1e-6 ||
      Math.abs(now.scale - was.scale) > 1e-9 ||
      Math.abs(now.rotation - was.rotation) > 1e-9 ||
      now.flipX !== was.flipX ||
      now.flipY !== was.flipY;
    if (moved) {
      return {
        ok: false,
        reason: `A Transform moved it from where its attachment placed it: the second half would be placed by the attachment again. Detach it first to split it where it is.`,
      };
    }
  }
  const colors = new Map<number, string>();
  const opacities = new Set<number>();
  const happenings = [...clip.actions]
    .filter((action) => ended(action) && (action.kind === 'transform' || action.kind === 'tween'))
    .sort((a, b) => a.start - b.start);
  for (const action of happenings) {
    if (action.kind === 'transform') {
      // A block that ends where it started leaves its glyphs as they were.
      if (endsAtStart(action.easing)) continue;
      if (action.shift[0] !== 0 || action.shift[1] !== 0 || action.scale !== 1 || action.rotation) {
        return {
          ok: false,
          reason: `The Transform block at ${seconds(clip.start + action.start)} moved ${glyphList(action.glyphs)}: a clip cannot start with a part of its formula moved.`,
        };
      }
      for (const glyph of action.glyphs) {
        if (action.color !== null) colors.set(glyph, action.color);
        if (action.opacity !== null) opacities.add(glyph);
      }
      continue;
    }
    // A tween of the whole formula takes over the colour of the glyphs whose colour it changes,
    // and their opacity when it changes the clip's — whatever its easing: one that comes back
    // has taken them all the same (`scene/anim/part.ts`).
    const state = states.find((s) => s.action.id === action.id);
    if (!state) continue;
    for (const glyph of [...colors.keys()]) {
      if (overridesEndedBy(state.from, state.to, glyph, formula).color) colors.delete(glyph);
    }
    if (state.from.opacity !== state.to.opacity) opacities.clear();
  }
  if (opacities.size > 0) {
    return {
      ok: false,
      reason: `A Transform block changed the opacity of ${glyphList([...opacities])} before the playhead: a clip cannot start with some glyphs fainter than others.`,
    };
  }
  // A tween after the cut that would take the colour over: the second half keeps it as a colour
  // of the glyph, which a tween of the clip's colour leaves alone.
  const kept = stateAt(clip, time, ctx.project.meta.target);
  for (const glyph of [...colors.keys()]) {
    if (glyphColor(glyph, kept, formula).toLowerCase() === colors.get(glyph)!.toLowerCase()) {
      colors.delete(glyph);
    }
  }
  if (colors.size > 0) {
    for (const state of states) {
      if (ended(state.action)) continue;
      // It changes their colour, or says it again: the glyph's own colour, which the second
      // half keeps the block's as, would give way to it.
      const taken = [...colors.keys()].filter(
        (glyph) =>
          overridesEndedBy(state.from, state.to, glyph, formula).color ||
          state.action.to.glyphColors?.[String(glyph)] !== undefined,
      );
      if (taken.length > 0) {
        return {
          ok: false,
          reason: `The Transform at ${seconds(clip.start + state.action.start)} changes the colour of ${glyphList(taken)}, which a Transform block coloured before the playhead: the second half could not play it the same.`,
        };
      }
    }
  }
  return { ok: true, colors };
}

const FIRST_HALF_DIFFERS =
  'The first half would not keep its glyphs on screen as they are before the playhead.';

/** Whether `stint` holds the glyph on screen at the cut: it came before, and what takes it off
 * starts then or later. */
const onAtCut = (stint: Stint, time: number) =>
  stint.enter.start < time - TIME_EPSILON && stint.exit.start >= time - TIME_EPSILON;

/** The blocks that name the glyphs they animated in the whole clip, not the target they had —
 * `'all'`, or a list with glyphs the block left out there: of the first half, the Appear blocks
 * `left` holds; of the second, every Appear and Disappear block when `right`. */
interface Explicit {
  left: ReadonlySet<string>;
  right: boolean;
}

const AS_AUTHORED: Explicit = { left: new Set(), right: false };

/** The glyphs the first half of `clip` leaves out of its intro itself (`Clip.startHidden`): those
 * the clip left out already, and those that have not been on screen by the cut when what held
 * them back goes with the second half — an Appear block they waited for, a relation or a Morph
 * block that brings them from the cut on — or when nothing else holds them. A glyph that only the
 * formula hides, or only the clip that starts empty, stays out as it is; one that came later is
 * listed even then, so that showing it again in the formula, or unticking «Starts empty», does not
 * bring it into the first half sooner than the whole clip had it. An object that is one piece (a
 * brace, a shape, a line) cannot leave any: for it, the list the clip had. Ascending. */
function leftOutAtCut(ctx: Context, clip: Clip, formula: Formula): number[] {
  const out = new Set(clip.startHidden ?? []);
  if (KINDS[formula.kind].transfers) {
    const life = ctx.lifetimes.get(clip.id);
    const hidden = new Set(formula.hiddenGlyphs);
    const waiting = new Set(life?.waiting ?? []);
    const count = formula.snapshot?.glyphs.length ?? 0;
    for (let glyph = 0; glyph < count; glyph++) {
      // Its stays, all from the cut on: none started before it.
      const stints = life?.stints.get(glyph) ?? [];
      if (stints.some((stint) => stint.enter.start < ctx.time - TIME_EPSILON)) continue;
      const heldAnyway = hidden.has(glyph) || clip.startsEmpty === true;
      if (!heldAnyway || stints.length > 0 || waiting.has(glyph)) out.add(glyph);
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** The two halves of `clip`, of `formula`. `explicit`: the blocks that name the glyphs they
 * animated in the whole clip. */
function halves(
  ctx: Context,
  clip: Clip,
  formula: Formula,
  rightId: ClipId,
  copyId: FormulaId,
  colors: ReadonlyMap<number, string>,
  explicit: Explicit,
): { left: Clip; right: Clip } {
  const { time } = ctx;
  const life = ctx.lifetimes.get(clip.id);
  const before = (action: ClipAction) => actionWindow(clip, action).end <= time + TIME_EPSILON;
  const animatedBy = (action: ClipAction) => life?.actions.get(action.id)?.glyphs ?? [];
  /** `action` naming the glyphs it animated in the whole clip, when it is an Appear or a
   * Disappear block that animated any. */
  const named = <A extends ClipAction>(action: A): A => {
    const animated = animatedBy(action);
    if ((action.kind === 'appear' || action.kind === 'disappear') && animated.length > 0) {
      action.glyphs = [...animated];
    }
    return action;
  };
  /** The glyph was on screen and left it before the cut, never to come back. */
  const goneForGood = (glyph: number) => {
    const stints = life?.stints.get(glyph) ?? [];
    return stints.length > 0 && stints.every((s) => s.exit.start < time - TIME_EPSILON);
  };
  const left: Clip = {
    ...structuredClone(clip),
    end: time,
    outro: defaultOutro('none'),
    // An Appear block that left a glyph out because a relation or a Morph block had still to
    // bring it would bring it now: it names what it brought — nothing, when it brought nothing.
    actions: structuredClone(clip.actions.filter(before)).map((action) => {
      if (action.kind === 'appear' && explicit.left.has(action.id)) {
        action.glyphs = [...animatedBy(action)];
      }
      return action;
    }),
  };
  const leftOut = leftOutAtCut(ctx, clip, formula);
  if (leftOut.length > 0) left.startHidden = leftOut;
  else delete left.startHidden;
  const initial = structuredClone(stateAt(clip, time, ctx.project.meta.target));
  for (const [glyph, color] of colors) initial.glyphColors[String(glyph)] = color;
  const right: Clip = {
    ...structuredClone(clip),
    id: rightId,
    formulaId: copyId,
    start: time,
    initial,
    intro: defaultIntro('none'),
    actions: structuredClone(clip.actions.filter((action) => !before(action))).map((action) => {
      const moved = { ...action, start: round6(clip.start + action.start - time) };
      if (moved.kind === 'transform') {
        // A glyph that left for good before the cut is only hidden in the copy, where it would
        // count again for the centre the block scales and turns its part about: it is left out,
        // as the whole clip left it out (unless none would be left: nothing of it shows then).
        const there = moved.glyphs.filter((glyph) => !goneForGood(glyph));
        if (there.length > 0) moved.glyphs = there;
      }
      return explicit.right ? named(moved) : moved;
    }),
  };
  // The copy hides what is not on screen at the cut: the second half leaves out nothing itself.
  delete right.startsEmpty;
  delete right.startHidden;
  return { left, right };
}

/** The glyphs of `clip`'s formula that are not on screen at the cut: what the copy hides. */
function hiddenAtCut(ctx: Context, clip: Clip, formula: Formula): number[] {
  const life = ctx.lifetimes.get(clip.id);
  const count = formula.snapshot?.glyphs.length ?? 0;
  const hidden: number[] = [];
  for (let glyph = 0; glyph < count; glyph++) {
    const stints = life?.stints.get(glyph) ?? [];
    if (!stints.some((stint) => onAtCut(stint, ctx.time))) hidden.push(glyph);
  }
  return hidden;
}

/** One stay on screen, for comparing: when the glyph comes and goes, and through what. */
type Stay = [number, number, string, number, number, string];

const sameStays = (a: readonly Stay[], b: readonly Stay[]) =>
  a.length === b.length &&
  a.every((stay, i) =>
    stay.every((value, j) =>
      typeof value === 'number'
        ? Math.abs(value - (b[i]![j] as number)) < 1e-5
        : value === b[i]![j],
    ),
  );

const key = (cause: Cause) => causeKey(cause);

/** The stays of a glyph before the cut, as the first half must have them: what goes on past the
 * cut ends there. */
function staysBefore(stints: readonly Stint[], time: number): Stay[] {
  return stints
    .filter((stint) => stint.enter.start < time - TIME_EPSILON)
    .map((stint) =>
      stint.exit.start >= time - TIME_EPSILON
        ? [stint.enter.start, stint.enter.end, key(stint.enter.cause), time, time, 'cut']
        : [
            stint.enter.start,
            stint.enter.end,
            key(stint.enter.cause),
            stint.exit.start,
            stint.exit.end,
            key(stint.exit.cause),
          ],
    );
}

/** The stays of a glyph from the cut on, as the second half must have them: what was on screen
 * is there when it starts. */
function staysAfter(stints: readonly Stint[], time: number): Stay[] {
  return stints
    .filter((stint) => stint.exit.start >= time - TIME_EPSILON)
    .map((stint) => {
      const there = stint.enter.start < time + TIME_EPSILON && stint.enter.end < time + 1e-5;
      const enter: [number, number, string] =
        stint.enter.start < time - TIME_EPSILON || (there && stint.enter.cause.kind === 'intro')
          ? [time, time, 'cut']
          : [stint.enter.start, stint.enter.end, key(stint.enter.cause)];
      return [...enter, stint.exit.start, stint.exit.end, key(stint.exit.cause)];
    });
}

/** "the FadeIn block at 6.00 s", "the relation from “f0” at 6.00 s": what brings a glyph. */
function describeCause(ctx: Context, clip: Clip, cause: Cause, at: number): string {
  if (cause.kind === 'action') {
    const action = clip.actions.find((a) => a.id === cause.actionId);
    return action
      ? `the ${animationName(action)} block at ${seconds(at)}`
      : `a block at ${seconds(at)}`;
  }
  if (cause.kind === 'transfer') {
    const relation = ctx.project.relations.find((r) => `relation:${r.id}` === cause.key);
    const from = ctx.project.clips.find((c) => c.id === relation?.fromClipId);
    return relation && from
      ? `the relation from “${nameOf(ctx, from)}” at ${seconds(at)}`
      : `the Morph block at ${seconds(at)}`;
  }
  return `the ${cause.kind} at ${seconds(at)}`;
}

/** The blocks whose naming their glyphs could mend a half: Appear blocks of the first (`left`),
 * or the blocks of the second. */
type Mend = { half: 'left'; blocks: string[] } | { half: 'right' };

/** Whether the halves keep every glyph on screen when the whole clip did: the reason they do
 * not, with in `retry` what could mend it. */
function lifetimeBlocker(
  ctx: Context,
  clip: Clip,
  piece: SplitPiece,
  after: ReadonlyMap<ClipId, ClipLifetime>,
): { reason: string; retry: Mend | null } | null {
  const { time } = ctx;
  const whole = ctx.lifetimes.get(clip.id);
  const left = after.get(piece.clipId);
  const right = after.get(piece.rightId);
  if (!whole || !left || !right) return null;
  const glyphs = new Set([...whole.glyphs, ...left.glyphs, ...right.glyphs]);
  const early: number[] = [];
  let firstCause: string | null = null;
  let broken = false;
  for (const glyph of glyphs) {
    const stints = whole.stints.get(glyph) ?? [];
    const got = staysBefore(left.stints.get(glyph) ?? [], time);
    if (sameStays(staysBefore(stints, time), got)) continue;
    const later = stints.find((stint) => stint.enter.start >= time - TIME_EPSILON);
    if (later && staysBefore(stints, time).length === 0) {
      early.push(glyph);
      firstCause ??= describeCause(ctx, clip, later.enter.cause, later.enter.start);
    } else broken = true;
  }
  if (early.length > 0) {
    const source = ctx.formulas.get(piece.sourceId);
    const name = source?.name ?? '?';
    // A brace, a shape or a line is one piece: its clip cannot leave it out of its intro.
    if (source && !KINDS[source.kind].transfers) {
      return {
        reason: `“${name}” only comes on screen after the playhead (${firstCause}): the first half would show it from its start. Split after it has appeared.`,
        retry: null,
      };
    }
    // The first half leaves them out of its intro (`leftOutAtCut`), and an Appear block of it
    // brings them all the same: one that left them out in the whole clip, where they were still
    // to arrive. Naming the glyphs it brought there mends it.
    const blocks = new Set<string>();
    for (const glyph of early) {
      for (const stint of left.stints.get(glyph) ?? []) {
        const { cause } = stint.enter;
        if (stint.enter.start < time - TIME_EPSILON && cause.kind === 'action') {
          blocks.add(cause.actionId);
        }
      }
    }
    return {
      reason: FIRST_HALF_DIFFERS,
      retry: blocks.size > 0 ? { half: 'left', blocks: [...blocks] } : null,
    };
  }
  if (broken) return { reason: FIRST_HALF_DIFFERS, retry: null };
  const differing: number[] = [];
  for (const glyph of glyphs) {
    const wanted = staysAfter(whole.stints.get(glyph) ?? [], time);
    const got = staysAfter(right.stints.get(glyph) ?? [], time);
    if (!sameStays(wanted, got)) differing.push(glyph);
  }
  if (differing.length === 0) return null;
  // An Appear block that brought no glyph — they were all on screen — would hold them back in
  // the second half, where it is the first block to name them; no list of glyphs mends that.
  const idle = clip.actions.find(
    (action) =>
      action.kind === 'appear' &&
      actionWindow(clip, action).start >= time - TIME_EPSILON &&
      (whole.actions.get(action.id)?.glyphs.length ?? 0) === 0,
  );
  if (idle) {
    return {
      reason: `The ${animationName(idle)} block at ${seconds(clip.start + idle.start)} brings no glyph (they are on screen already), and in the second half it would hold back those that are there: remove it to split.`,
      retry: null,
    };
  }
  return {
    reason: `The second half could not keep on screen what is there at the playhead (${glyphList(differing)}).`,
    retry: { half: 'right' },
  };
}

/** The piece a clip of the split project belongs to: one of its halves, or a clip placed by
 * glyphs of one (an object attached to it). Null for a clip no piece touches. */
function pieceOfClip(
  project: Project,
  pieces: readonly SplitPiece[],
  clipId: ClipId | undefined,
): SplitPiece | null {
  if (clipId === undefined) return null;
  const direct = pieces.find((p) => p.clipId === clipId || p.rightId === clipId);
  if (direct) return direct;
  const clip = project.clips.find((c) => c.id === clipId);
  if (!clip) return null;
  for (const use of placementUses(clip)) {
    for (const spot of use.spots) {
      const piece = pieces.find(
        (p) => p.clipId === spot.target.clipId || p.rightId === spot.target.clipId,
      );
      if (piece) return piece;
    }
  }
  return null;
}

/** The piece an issue of the split project is about, as far as its path says. */
function pieceOfIssue(
  project: Project,
  pieces: readonly SplitPiece[],
  issue: Issue,
): SplitPiece | null {
  const [section, index] = issue.path;
  if (section === 'clips' && typeof index === 'number') {
    return pieceOfClip(project, pieces, project.clips[index]?.id);
  }
  if (section === 'relations' && typeof index === 'number') {
    const relation = project.relations[index];
    return (
      pieceOfClip(project, pieces, relation?.fromClipId) ??
      pieceOfClip(project, pieces, relation?.toClipId)
    );
  }
  if (section === 'formulas' && typeof index === 'number') {
    const formula = project.formulas[index];
    return pieces.find((p) => p.copy.id === formula?.id) ?? null;
  }
  return null;
}

/** The project with the clips `cuts` split (their checks of what crosses were made). */
function build(
  ctx: Context,
  cuts: readonly Clip[],
  options: SplitOptions,
  settled: ReadonlyMap<ClipId, ReadonlyMap<number, string>>,
  explicit: ReadonlyMap<ClipId, Explicit>,
): { project: Project; pieces: SplitPiece[] } {
  const { project, time } = ctx;
  const used = new Set(project.formulas.map((f) => f.name));
  const pieces: SplitPiece[] = [];
  const halvesOf = new Map<ClipId, { left: Clip; right: Clip }>();
  for (const clip of cuts) {
    const formula = ctx.formulas.get(clip.formulaId);
    if (!formula) continue;
    const name = splitName(formula.name, options.suffix, used, options.validName);
    used.add(name);
    const copy: Formula = {
      ...structuredClone(formula),
      id: newId('f'),
      name,
      hiddenGlyphs: hiddenAtCut(ctx, clip, formula),
    };
    const piece: SplitPiece = { clipId: clip.id, rightId: newId('c'), sourceId: formula.id, copy };
    pieces.push(piece);
    halvesOf.set(
      clip.id,
      halves(
        ctx,
        clip,
        formula,
        piece.rightId,
        copy.id,
        settled.get(clip.id) ?? new Map(),
        explicit.get(clip.id) ?? AS_AUTHORED,
      ),
    );
  }
  const rightOf = new Map(pieces.map((p) => [p.clipId, p.rightId]));
  const next = produce(project, (draft) => {
    draft.clips = draft.clips.flatMap((clip) => {
      const pair = halvesOf.get(clip.id);
      return pair ? [pair.left, pair.right] : [clip];
    });
    // What is measured on a split clip from the cut on is measured on its second half: an
    // attachment that starts then, a Transform that carries a shape or a line to it then.
    for (const clip of draft.clips) {
      for (const use of placementUses(clip)) {
        if (use.at < time - TIME_EPSILON) continue;
        for (const spot of use.spots) {
          spot.target.clipId = rightOf.get(spot.target.clipId) ?? spot.target.clipId;
        }
      }
    }
    // A relation whose window lies after the cut is the second half's; the window of one that
    // arrives at it counts from its start.
    for (const relation of draft.relations) {
      const to = project.clips.find((c) => c.id === relation.toClipId);
      if (!to) continue;
      const start = to.start + relation.offset;
      if (start < time - TIME_EPSILON) continue;
      relation.fromClipId = rightOf.get(relation.fromClipId) ?? relation.fromClipId;
      const right = rightOf.get(relation.toClipId);
      if (right !== undefined) {
        relation.toClipId = right;
        relation.offset = round6(start - time);
      }
    }
    // Each copy right after its original, in the Creator's list and in its group: the last
    // piece first, so that the copies of one formula stay in the order of their clips.
    for (const piece of [...pieces].reverse()) {
      const at = draft.formulas.findIndex((f) => f.id === piece.sourceId);
      draft.formulas.splice(at + 1, 0, piece.copy);
      groupCopies(draft, new Map([[piece.sourceId, piece.copy.id]]));
    }
  });
  return { project: next, pieces };
}

/** The name of an object the check of the scene needs and that has no render: the formula of
 * `clip`, of a clip it is placed by, or of one placed by it. Null when they all have one. */
function missingRender(ctx: Context, clip: Clip, resolved: ResolvedFormulas): string | null {
  const targets = new Set(
    placementUses(clip).flatMap((use) => use.spots.map((s) => s.target.clipId)),
  );
  const near = ctx.project.clips.filter(
    (other) =>
      other.id === clip.id ||
      targets.has(other.id) ||
      placementUses(other).some((use) => use.spots.some((s) => s.target.clipId === clip.id)),
  );
  for (const other of near) {
    if (!resolved.has(other.formulaId)) return nameOf(ctx, other);
  }
  return null;
}

/** Numbers and strings nested alike, numbers within `tolerance`. */
function near(a: unknown, b: unknown, tolerance: number): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) <= tolerance;
  if (typeof a === 'string' && typeof b === 'string') return a.toLowerCase() === b.toLowerCase();
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) =>
    near((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], tolerance),
  );
}

function sameDrawable(a: Drawable, b: Drawable): boolean {
  if (a.role !== b.role || a.partial !== b.partial || a.glyph !== b.glyph) return false;
  if (!near(a.fill, b.fill, 1e-3) || !near(a.stroke, b.stroke, 1e-3)) return false;
  // A path being traced is cut where the progress says, to a number of points of its own.
  return a.partial || near(a.path.contours, b.path.contours, 1e-4);
}

/** The instants at which the scene is compared: inside each half of each piece, between the
 * things that happen to it there (at most `limit` of them). */
function sampleTimes(project: Project, cuts: readonly Clip[], time: number, limit = 48): number[] {
  const times = new Set<number>();
  for (const clip of cuts) {
    const marks = new Set<number>([clip.start, time, clip.end]);
    marks.add(clip.start + clip.intro.duration);
    marks.add(clip.end - clip.outro.duration);
    for (const action of clip.actions) {
      const window = actionWindow(clip, action);
      marks.add(window.start);
      marks.add(window.end);
    }
    for (const relation of project.relations) {
      if (relation.fromClipId !== clip.id && relation.toClipId !== clip.id) continue;
      const to = project.clips.find((c) => c.id === relation.toClipId);
      if (!to) continue;
      const window = relationWindow(relation, to);
      marks.add(window.start);
      marks.add(window.end);
    }
    for (const other of project.clips) {
      if (!placementUses(other).some((use) => use.spots.some((s) => s.target.clipId === clip.id))) {
        continue;
      }
      marks.add(other.start);
      marks.add(other.end);
    }
    const sorted = [...marks]
      .filter((t) => t >= clip.start - TIME_EPSILON && t <= clip.end + TIME_EPSILON)
      .sort((a, b) => a - b);
    times.add(round6(time));
    for (let i = 0; i + 1 < sorted.length; i++) {
      if (sorted[i + 1]! - sorted[i]! > 1e-4) times.add(round6((sorted[i]! + sorted[i + 1]!) / 2));
    }
  }
  const all = [...times].sort((a, b) => a - b);
  if (all.length <= limit) return all;
  const step = all.length / limit;
  const picked = new Set<number>([round6(time)]);
  for (let i = 0; i < limit; i++) picked.add(all[Math.floor(i * step)]!);
  return [...picked].sort((a, b) => a - b);
}

/** What the split project (`after`, attachments not yet placed) draws differently from the
 * project it comes from: each clip of `after` that draws something otherwise, or misses something,
 * with the first instant it does (in the order it is found). None when the two draw the same at
 * every instant compared — the second half of each piece standing for its clip from the cut on.
 * Every instant is compared, so that one round of `planSplit` refuses every clip at fault. */
export function sceneDifferences(
  before: Project,
  after: Project,
  pieces: readonly SplitPiece[],
  resolved: ResolvedFormulas,
  time: number,
): { at: number; clipId: ClipId }[] {
  const seeded = new Map(resolved);
  for (const piece of pieces) {
    const render = resolved.get(piece.sourceId);
    if (render) seeded.set(piece.copy.id, render);
  }
  const settled = settleScene(after, seeded, refreshLocalRenders);
  const was = createEvaluator(before, resolved, { includeHidden: true });
  const is = createEvaluator(settled.project, settled.formulas, { includeHidden: true });
  const leftOf = new Map(pieces.map((p) => [p.rightId, p.clipId]));
  const cuts = before.clips.filter((clip) => pieces.some((p) => p.clipId === clip.id));
  /** A drawable's key with the first half's id where the second's is. */
  const keyOf = (drawable: Drawable) => {
    let out = drawable.key;
    for (const [right, left] of leftOf) out = out.split(right).join(left);
    return out;
  };
  const found = new Map<ClipId, number>();
  const differs = (clipId: ClipId, at: number) => {
    if (!found.has(clipId)) found.set(clipId, at);
  };
  for (const at of sampleTimes(before, cuts, time)) {
    const expected = new Map(was.evaluate(at).map((d) => [d.key, d]));
    for (const drawable of is.evaluate(at)) {
      const twin = expected.get(keyOf(drawable));
      if (!twin || !sameDrawable(twin, drawable)) differs(drawable.clipId, at);
      expected.delete(keyOf(drawable));
    }
    for (const missing of expected.values()) {
      const piece = pieces.find((p) => p.clipId === missing.clipId);
      differs(piece && at >= time - TIME_EPSILON ? piece.rightId : missing.clipId, at);
    }
  }
  return [...found].map(([clipId, at]) => ({ at, clipId }));
}

/** The errors of the split project that the project it comes from did not have, among `errors`
 * (those of the split project that count): each one is told by its code and by what it is about —
 * a clip, a relation, a formula by its id; anything else by its path —, and those the project had
 * already, as many times, are left out. */
function newErrors(
  project: Project,
  before: readonly Issue[],
  split: Project,
  errors: readonly Issue[],
): Issue[] {
  const about = (p: Project, issue: Issue): string => {
    const [section, index] = issue.path;
    const id =
      typeof index !== 'number'
        ? undefined
        : section === 'clips'
          ? p.clips[index]?.id
          : section === 'relations'
            ? p.relations[index]?.id
            : section === 'formulas'
              ? p.formulas[index]?.id
              : undefined;
    return `${issue.code} ${id ?? JSON.stringify(issue.path)}`;
  };
  const had = new Map<string, number>();
  for (const issue of before) {
    const key = about(project, issue);
    had.set(key, (had.get(key) ?? 0) + 1);
  }
  return errors.filter((issue) => {
    const key = about(split, issue);
    const left = had.get(key) ?? 0;
    if (left === 0) return true;
    had.set(key, left - 1);
    return false;
  });
}

/** Which half of `piece` an issue of the split project is about: the first (the clip, which keeps
 * its id), the second (its clip, or the copy it is of), either through a relation of it — or null,
 * for something else (an object placed by it). */
function halfOfIssue(split: Project, piece: SplitPiece, issue: Issue): 'first' | 'second' | null {
  const [section, index] = issue.path;
  if (typeof index !== 'number') return null;
  const ids =
    section === 'clips'
      ? [split.clips[index]?.id]
      : section === 'formulas'
        ? [split.formulas[index]?.id === piece.copy.id ? piece.rightId : undefined]
        : section === 'relations'
          ? [split.relations[index]?.fromClipId, split.relations[index]?.toClipId]
          : [];
  if (ids.includes(piece.rightId)) return 'second';
  if (ids.includes(piece.clipId)) return 'first';
  return null;
}

/** A new error of the split project said as a reason of the split (A2-04): the copy a second half
 * would be of was never made, so it is named as that half, and what validation advises for an edit
 * that moves a clip gives way to where to split. An object placed at the cut on glyphs still
 * animated: "Its second half would be attached to glyph 0 of "a" while the FadeOut block is still
 * animating it (at 6.5 s): Manim would measure a formula half drawn. Split it before that starts,
 * or once it has ended." Any other: "Its second half would have this error: …". */
function errorReason(
  split: Project,
  pieces: readonly SplitPiece[],
  piece: SplitPiece | null,
  issue: Issue,
): string {
  const half = piece ? halfOfIssue(split, piece, issue) : null;
  const copies = pieces.flatMap((p) => [`"${p.copy.name}"`, `“${p.copy.name}”`]);
  const own = piece ? [`"${piece.copy.name}"`, `“${piece.copy.name}”`] : [];
  let text = issue.message;
  const subject = own.find((name) => text.startsWith(`${name} is `));
  if (issue.code === 'attach-target-busy' && subject) {
    const advice = / Start the clip once that has ended, or before it starts\.$/;
    return `Its second half would be ${text.slice(subject.length + ' is '.length)}`.replace(
      advice,
      ' Split it before that starts, or once it has ended.',
    );
  }
  for (const name of copies) text = text.split(name).join('the second half');
  const who =
    half === 'first' ? 'Its first half' : half === 'second' ? 'Its second half' : 'The split';
  return `${who} would have this error: ${text}`;
}

/** What splitting the clips `ids` at `time` does: the project with those that can be split cut
 * in two, and the reason for each of the others. Only the clips the playhead is strictly inside
 * take part (`splitCandidates`). */
export function planSplit(
  project: Project,
  ids: readonly ClipId[],
  time: number,
  options: SplitOptions,
): SplitPlan {
  const ctx: Context = {
    project,
    time: round6(time),
    formulas: new Map(project.formulas.map((f) => [f.id, f])),
    lifetimes: clipLifetimes(project),
  };
  const refused: SplitRefusal[] = [];
  const refuse = (clip: Clip, reason: string) =>
    refused.push({ clipId: clip.id, name: nameOf(ctx, clip), reason });
  let wanted = splitCandidates(project, ids, ctx.time);
  const asked = new Set(wanted.map((clip) => clip.id));
  const errorsBefore = validateProject(project).filter((issue) => issue.severity === 'error');
  const explicit = new Map<ClipId, Explicit>();
  // Each round refuses at least one clip, has more blocks of a half of one name their glyphs, or
  // ends: what a clip crosses depends on the others that are split with it.
  const rounds =
    2 * project.clips.length + project.clips.reduce((n, clip) => n + clip.actions.length, 0) + 1;
  for (let round = 0; round <= rounds && wanted.length > 0; round++) {
    const out = new Set<ClipId>();
    const drop = (clip: Clip | undefined, reason: string) => {
      if (!clip || out.has(clip.id)) return;
      out.add(clip.id);
      refuse(clip, reason);
    };
    const set = new Set(wanted.map((clip) => clip.id));
    const settled = new Map<ClipId, ReadonlyMap<number, string>>();
    for (const clip of wanted) {
      const formula = ctx.formulas.get(clip.formulaId);
      const reason = formula ? crossing(ctx, clip, set, asked) : 'Its formula is missing.';
      if (reason) {
        drop(clip, reason);
        continue;
      }
      // Without its render, or that of what it hangs on or of what hangs on it, the scene
      // cannot be compared before and after: the split waits for it.
      const undrawn = options.resolved ? missingRender(ctx, clip, options.resolved) : null;
      if (undrawn) {
        drop(clip, `“${undrawn}” has no render yet: split the clip once the preview draws it.`);
        continue;
      }
      const parts = settledParts(ctx, clip, formula!);
      if (parts.ok) settled.set(clip.id, parts.colors);
      else drop(clip, parts.reason);
    }
    if (out.size === 0) {
      const attempt = build(ctx, wanted, options, settled, explicit);
      const byId = new Map(wanted.map((clip) => [clip.id, clip]));
      const lifetimes = clipLifetimes(attempt.project);
      let retry = false;
      for (const piece of attempt.pieces) {
        const clip = byId.get(piece.clipId)!;
        const blocker = lifetimeBlocker(ctx, clip, piece, lifetimes);
        if (!blocker) continue;
        const named = explicit.get(clip.id) ?? AS_AUTHORED;
        const mend = blocker.retry;
        const more = mend?.half === 'left' ? mend.blocks.filter((id) => !named.left.has(id)) : [];
        if (mend?.half === 'right' && !named.right) {
          explicit.set(clip.id, { ...named, right: true });
          retry = true;
        } else if (more.length > 0) {
          explicit.set(clip.id, { ...named, left: new Set([...named.left, ...more]) });
          retry = true;
        } else drop(clip, blocker.reason);
      }
      if (retry && out.size === 0) continue;
      if (out.size === 0) {
        // An error of a copy, or of a second half, that its original had is the same error said
        // once more: it is not new.
        const copies = new Set(attempt.pieces.map((piece) => piece.copy.id));
        const had = (clipId: ClipId, code: string) =>
          errorsBefore.some(
            (issue) =>
              issue.code === code &&
              issue.path[0] === 'clips' &&
              typeof issue.path[1] === 'number' &&
              project.clips[issue.path[1]]?.id === clipId,
          );
        const errors = validateProject(attempt.project).filter((issue) => {
          if (issue.severity !== 'error') return false;
          const [section, index] = issue.path;
          if (typeof index !== 'number') return true;
          if (section === 'formulas') return !copies.has(attempt.project.formulas[index]?.id ?? '');
          if (section !== 'clips') return true;
          const id = attempt.project.clips[index]?.id;
          const piece = attempt.pieces.find((p) => p.rightId === id);
          return !(piece && had(piece.clipId, issue.code));
        });
        // Every new error is told in the same round: each refuses the clip of its piece, and one
        // that is of no piece refuses them all.
        for (const fresh of newErrors(project, errorsBefore, attempt.project, errors)) {
          const piece = pieceOfIssue(attempt.project, attempt.pieces, fresh);
          const blamed = piece ? [byId.get(piece.clipId)] : wanted;
          const reason = errorReason(attempt.project, attempt.pieces, piece, fresh);
          for (const clip of blamed) drop(clip, reason);
        }
      }
      if (out.size === 0 && options.resolved) {
        const differences = sceneDifferences(
          project,
          attempt.project,
          attempt.pieces,
          options.resolved,
          ctx.time,
        );
        // Each piece at fault, at the first instant it differs; a difference of no piece blames
        // them all.
        const faults = new Map<ClipId, number>();
        let unowned: number | null = null;
        for (const { at, clipId } of differences) {
          const piece = pieceOfClip(attempt.project, attempt.pieces, clipId);
          if (!piece) unowned ??= at;
          else if (!faults.has(piece.clipId)) faults.set(piece.clipId, at);
        }
        if (unowned !== null) for (const clip of wanted) faults.set(clip.id, unowned);
        // A clip placed by another one at fault may differ only because of that one: it waits for
        // the next round, which looks at it again without it — unless all of them would wait.
        const placedByFault = (clipId: ClipId) =>
          placementUses(byId.get(clipId)!).some((use) =>
            use.spots.some(
              (spot) => spot.target.clipId !== clipId && faults.has(spot.target.clipId),
            ),
          );
        const waiting = new Set(unowned === null ? [...faults.keys()].filter(placedByFault) : []);
        const blamed =
          waiting.size < faults.size
            ? [...faults].filter(([clipId]) => !waiting.has(clipId))
            : [...faults];
        for (const [clipId, at] of blamed) {
          const clip = byId.get(clipId);
          const where = at < ctx.time - TIME_EPSILON ? 'The first half' : 'The second half';
          // An attached object is placed again when its second half starts: by its target as it
          // is then, which is not where it was placed if the target moved since.
          const why = clip?.attach
            ? 'it is attached to something that has moved since it was placed, and its second half would be placed by it again. Detach it first to split it where it is.'
            : 'the state it has there cannot be kept in a clip that starts at the playhead.';
          drop(clip, `${where} would not look as the clip does now at ${seconds(at)}: ${why}`);
        }
      }
      if (out.size === 0) return { project: attempt.project, pieces: attempt.pieces, refused };
    }
    wanted = wanted.filter((clip) => !out.has(clip.id));
  }
  return { project, pieces: [], refused };
}
