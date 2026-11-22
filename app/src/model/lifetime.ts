/* Glyph lifetime (docs/ARCHITECTURE.md §5, "Glyph lifetime"): when each glyph of a clip comes on
 * screen, what takes it off, and what animates it in between. One simulation per clip, shared by
 * validation, the scene events (and through them the evaluator and the exporter) and the editor,
 * so they never disagree about which glyphs an intro, an outro or an action animates.
 *
 * The simulation walks the clip's happenings in time order (ties: intro, relations, actions,
 * outro) and keeps, per glyph, whether it is on screen:
 *   - the intro brings every glyph except the formula's hidden glyphs and those the clip leaves
 *     out itself (its `startHidden`; every glyph, in a clip that starts empty:
 *     `startHiddenGlyphs`), the targets of incoming transfer pairs (a relation's, or a morph
 *     block's of the clip itself) and the glyphs waiting for an `appear` action: a glyph whose
 *     first appear or disappear block (in time order) is an appear is not there before it, as an
 *     Appear block means, so it needs no hiding;
 *   - an incoming pair brings its targets; a consuming pair (transform, fade) takes its sources;
 *   - an `appear` action brings the targeted glyphs that are off screen, except those consumed
 *     earlier and those an incoming pair has still to bring; a `disappear` action takes the
 *     targeted glyphs that are on screen;
 *   - the outro takes every glyph on screen except those a later pair consumes; whatever is still
 *     on screen after that leaves at the clip end.
 * A glyph changes state when the animation that moves it starts. Tweens, `transform` and
 * `emphasis` actions do not change what is on screen; they only keep their glyphs busy — an
 * emphasis acts on the targeted glyphs on screen when it starts, and keeps them busy only when it
 * animates them (`EMPHASIS[effect].animates`: Indicate, Wiggle; a Circumscribe, Flash or FocusOn
 * only measures them then). A `morph` action acts through its transfer pairs (above); as an action
 * it only lists the glyphs of both its sides. */
import { EMPHASIS, measuresOnly } from './kinds';
import { actionWindow, introWindow, outroWindow, TIME_EPSILON } from './time';
import { glyphTransfers, isMorphKey, sourceRoles } from './transfers';
import type { ActionId, Clip, ClipAction, ClipId, Formula, Project } from './types';

/** What animates a glyph during a span of time. `clip-end` is the instant a glyph the outro did
 * not take (it came on screen during the outro) leaves with the clip. */
export type Cause =
  | { kind: 'intro' }
  | { kind: 'outro' }
  | { kind: 'clip-end' }
  /** A pair of a glyph transfer (`transfers.ts`: a relation's, or a morph block's — `isMorphKey`
   * tells them apart), by the transfer's key. */
  | { kind: 'transfer'; key: string; pair: number }
  | { kind: 'action'; actionId: ActionId };

/** Absolute seconds, half-open. start === end for instantaneous changes (intro/outro `none`). */
export interface Span {
  start: number;
  end: number;
  cause: Cause;
}

/** One stay on screen: what brought the glyph and what took it off. */
export interface Stint {
  enter: Span;
  exit: Span;
}

/** Why an action leaves out a glyph it targets explicitly. */
export type SkipReason =
  /** appear: the glyph is already on screen. */
  | 'on-screen'
  /** disappear: the glyph is not on screen. */
  | 'off-screen'
  /** appear: an incoming transfer pair (a relation's or a morph block's) brings the glyph later. */
  | 'arrives-later'
  /** appear: a transfer consumed the glyph earlier (it cannot come back). */
  | 'consumed';

export interface ActionLifetime {
  /** Glyphs the action animates, ascending: every glyph for a tween, the listed glyphs for a
   * `transform`, those that change state for `appear` / `disappear`, both sides of every pair for
   * a `morph` (whose pairs animate as transfer spans, with their own causes). */
  glyphs: number[];
  /** Glyphs listed explicitly but left out. A target of `'all'` skips silently. */
  skipped: { glyph: number; reason: SkipReason }[];
}

export interface ClipLifetime {
  clipId: ClipId;
  /** Every glyph of the clip: the formula's snapshot glyphs plus any index the project refers to,
   * ascending. `'all'` means these. */
  glyphs: number[];
  /** Glyphs the intro animates (also when it is `none`: they appear at the clip start). */
  intro: number[];
  /** Glyphs that skip the intro to wait for an `appear` action, the first block that names them. */
  waiting: number[];
  /** Glyphs the outro animates (also when it is `none`: they leave at the clip end). */
  outro: number[];
  actions: Map<ActionId, ActionLifetime>;
  /** Per glyph, its stays on screen in time order. A glyph never on screen has none. */
  stints: Map<number, Stint[]>;
  /** Per glyph, every span during which something animates it, in time order: the intro, the
   * outro, relation windows (copied sources too) and actions. Zero-length spans are left out. */
  busy: Map<number, Span[]>;
  /** Transfer pairs that take a source glyph not on screen when the window starts (hidden and
   * not arrived, taken out by a disappear, or still being brought by the intro or an appear) and
   * not consumed before: Manim adds it out of nowhere. */
  absentSources: { key: string; pair: number; glyphs: number[] }[];
  /** Transfer pairs that take a source glyph another transfer (`through`, its key) is still
   * bringing in when the window starts: two animations on one glyph, and the arrival lands on a
   * half-morphed shape in Manim. Validation reports an error. */
  arrivingSources: { key: string; pair: number; glyphs: number[]; through: string }[];
}

interface PairSpan {
  /** The transfer's key. */
  key: string;
  pair: number;
  start: number;
  end: number;
  glyphs: number[];
  role: 'arrive' | 'consume' | 'copy';
}

/** An action, or a pair of a morph block, which animates glyphs as an action of the clip would. */
export const actionLike = (cause: Cause): boolean =>
  cause.kind === 'action' || (cause.kind === 'transfer' && isMorphKey(cause.key));

/** Whether two things that animate one glyph at once may not: Manim cannot run two animations
 * on one glyph. An action (or a morph block's pair) against anything else counts, except a tween
 * against the intro or the outro, which the tween's bounds keep apart already, and an Emphasis
 * block that only measures its glyphs when it starts (a Circumscribe, a Flash, a FocusOn:
 * `measuresOnly`), which animates nothing of the clip; two transfers keep apart through the
 * ownership rules (`transferOwnershipIssues`), not here. Validation (`action-overlap`) and the
 * block planner (`actionConflicts`, `conflicts.ts`) share the rule. */
export function causesConflict(clip: Clip, a: Cause, b: Cause): boolean {
  if (a.kind === 'transfer' && b.kind === 'transfer') return false;
  if (!actionLike(a) && !actionLike(b)) return false;
  const actionOf = (c: Cause) =>
    c.kind === 'action' ? clip.actions.find((x) => x.id === c.actionId) : undefined;
  const measures = (c: Cause) => {
    const action = actionOf(c);
    return action !== undefined && measuresOnly(action);
  };
  if (measures(a) || measures(b)) return false;
  const tween = (c: Cause) => actionOf(c)?.kind === 'tween';
  const phase = (c: Cause) => c.kind === 'intro' || c.kind === 'outro';
  return !((tween(a) && phase(b)) || (tween(b) && phase(a)));
}

/** The lifetime of every clip of the project, keyed by clip id. Transfers to or from a missing
 * clip are ignored (`glyphTransfers`). Works on projects with validation errors (results may then conflict). */
export function clipLifetimes(project: Project): Map<ClipId, ClipLifetime> {
  const formulas = new Map(project.formulas.map((f) => [f.id, f]));
  const into = new Map<ClipId, PairSpan[]>();
  const outOf = new Map<ClipId, PairSpan[]>();
  const push = (map: Map<ClipId, PairSpan[]>, id: ClipId, span: PairSpan) => {
    const list = map.get(id);
    if (list) list.push(span);
    else map.set(id, [span]);
  };
  for (const transfer of glyphTransfers(project)) {
    const { key, start, end } = transfer;
    transfer.pairs.forEach((pair, i) => {
      const base = { key, pair: i, start, end };
      push(into, transfer.toClipId, { ...base, glyphs: unique(pair.to), role: 'arrive' });
      // A `copy` pair copies every source; `copies` consumes its authored principal (D54).
      const roles = sourceRoles(pair, pair.style);
      if (roles.consumed.length > 0) {
        push(outOf, transfer.fromClipId, { ...base, glyphs: roles.consumed, role: 'consume' });
      }
      if (roles.copied.length > 0) {
        push(outOf, transfer.fromClipId, { ...base, glyphs: roles.copied, role: 'copy' });
      }
    });
  }
  const out = new Map<ClipId, ClipLifetime>();
  for (const clip of project.clips) {
    const spans = [...(into.get(clip.id) ?? []), ...(outOf.get(clip.id) ?? [])];
    out.set(clip.id, simulate(clip, formulas.get(clip.formulaId), spans));
  }
  return out;
}

/** The glyphs the intro of `clip` leaves out whatever else the project says: the hidden glyphs of
 * its formula and those the clip leaves out itself (`Clip.startHidden`) or, when the clip starts
 * empty (`Clip.startsEmpty`), every glyph of it. Such a glyph appears when an incoming transfer
 * pair or an `appear` action brings it. Ascending. */
export function startHiddenGlyphs(
  clip: Pick<Clip, 'startsEmpty' | 'startHidden'>,
  formula: Pick<Formula, 'hiddenGlyphs' | 'snapshot'> | undefined,
): number[] {
  const hidden = new Set([...(formula?.hiddenGlyphs ?? []), ...(clip.startHidden ?? [])]);
  if (clip.startsEmpty) {
    const count = formula?.snapshot?.glyphs.length ?? 0;
    for (let g = 0; g < count; g++) hidden.add(g);
  }
  return [...hidden].sort((a, b) => a - b);
}

type Happening =
  | { at: number; order: 0; kind: 'intro' }
  | { at: number; order: 1; kind: 'pair'; span: PairSpan; index: number }
  | { at: number; order: 2; kind: 'action'; action: ClipAction; index: number }
  | { at: number; order: 3; kind: 'outro' };

function simulate(clip: Clip, formula: Formula | undefined, pairs: PairSpan[]): ClipLifetime {
  // The glyph universe.
  const known = new Set<number>();
  const count = formula?.snapshot?.glyphs.length ?? 0;
  for (let g = 0; g < count; g++) known.add(g);
  const hidden = new Set(startHiddenGlyphs(clip, formula));
  for (const g of hidden) known.add(g);
  for (const span of pairs) for (const g of span.glyphs) known.add(g);
  for (const action of clip.actions) {
    // A morph's glyphs are known through its transfer spans.
    if (action.kind !== 'tween' && action.kind !== 'morph' && action.glyphs !== 'all') {
      for (const g of action.glyphs) known.add(g);
    }
  }
  const glyphs = [...known].sort((a, b) => a - b);
  // A clip that starts empty hides whatever the project names of it, past its snapshot too.
  if (clip.startsEmpty) for (const g of glyphs) hidden.add(g);

  const arriving = new Set(pairs.filter((p) => p.role === 'arrive').flatMap((p) => p.glyphs));
  const waiting = waitingGlyphs(clip, glyphs);
  const pendingArrivals = new Map<number, number>();
  const pendingConsumes = new Map<number, number>();
  const bump = (map: Map<number, number>, g: number, by: number) =>
    map.set(g, (map.get(g) ?? 0) + by);
  for (const span of pairs) {
    if (span.role === 'copy') continue;
    for (const g of span.glyphs)
      bump(span.role === 'arrive' ? pendingArrivals : pendingConsumes, g, 1);
  }

  const lifetime: ClipLifetime = {
    clipId: clip.id,
    glyphs,
    intro: [],
    waiting: [...waiting].sort((a, b) => a - b),
    outro: [],
    actions: new Map(),
    stints: new Map(),
    busy: new Map(),
    absentSources: [],
    arrivingSources: [],
  };
  const entered = new Map<number, Span>(); // glyphs on screen → what brought them
  const consumed = new Set<number>();

  const open = (g: number, enter: Span) => entered.set(g, enter);
  const close = (g: number, exit: Span) => {
    const enter = entered.get(g);
    if (!enter) return;
    entered.delete(g);
    const list = lifetime.stints.get(g);
    if (list) list.push({ enter, exit });
    else lifetime.stints.set(g, [{ enter, exit }]);
  };
  const busy = (gs: Iterable<number>, span: Span) => {
    if (span.end - span.start <= 0) return;
    for (const g of gs) {
      const list = lifetime.busy.get(g);
      if (list) list.push(span);
      else lifetime.busy.set(g, [span]);
    }
  };

  const happenings: Happening[] = [{ at: clip.start, order: 0, kind: 'intro' }];
  pairs.forEach((span, index) =>
    happenings.push({ at: span.start, order: 1, kind: 'pair', span, index }),
  );
  clip.actions.forEach((action, index) =>
    happenings.push({ at: clip.start + action.start, order: 2, kind: 'action', action, index }),
  );
  happenings.push({ at: outroWindow(clip).start, order: 3, kind: 'outro' });
  happenings.sort(
    (a, b) =>
      a.at - b.at || a.order - b.order || ('index' in a && 'index' in b ? a.index - b.index : 0),
  );

  for (const h of happenings) {
    if (h.kind === 'intro') {
      const w = introWindow(clip);
      const span: Span = { ...w, cause: { kind: 'intro' } };
      lifetime.intro = glyphs.filter((g) => !hidden.has(g) && !arriving.has(g) && !waiting.has(g));
      for (const g of lifetime.intro) open(g, span);
      busy(lifetime.intro, span);
    } else if (h.kind === 'pair') {
      const { span: p } = h;
      const span: Span = {
        start: p.start,
        end: p.end,
        cause: { kind: 'transfer', key: p.key, pair: p.pair },
      };
      if (p.role === 'arrive') {
        for (const g of p.glyphs) {
          bump(pendingArrivals, g, -1);
          // A consumed glyph is part of other glyphs now: it does not come back (validation
          // reports the pair; the preview shows nothing rather than a resurrection).
          if (!entered.has(g) && !consumed.has(g)) open(g, span);
        }
      } else {
        // A source must be fully on screen when the window starts.
        const absent: number[] = [];
        const arriving = new Map<string, number[]>();
        for (const g of p.glyphs) {
          if (consumed.has(g)) continue;
          const enter = entered.get(g);
          if (!enter) absent.push(g);
          else if (enter.end > p.start + 1e-6) {
            if (enter.cause.kind === 'transfer' && enter.cause.key !== p.key) {
              arriving.set(enter.cause.key, [...(arriving.get(enter.cause.key) ?? []), g]);
            } else absent.push(g);
          }
        }
        if (absent.length > 0) {
          lifetime.absentSources.push({ key: p.key, pair: p.pair, glyphs: absent });
        }
        for (const [through, glyphs] of arriving) {
          lifetime.arrivingSources.push({ key: p.key, pair: p.pair, glyphs, through });
        }
        if (p.role === 'consume') {
          for (const g of p.glyphs) {
            bump(pendingConsumes, g, -1);
            close(g, span);
            consumed.add(g);
          }
        }
      }
      busy(p.glyphs, span);
    } else if (h.kind === 'action') {
      const { action } = h;
      const span: Span = {
        ...actionWindow(clip, action),
        cause: { kind: 'action', actionId: action.id },
      };
      const result: ActionLifetime = { glyphs: [], skipped: [] };
      if (action.kind === 'tween') {
        result.glyphs = glyphs;
      } else if (action.kind === 'transform') {
        result.glyphs = unique(action.glyphs);
      } else if (action.kind === 'morph') {
        // Its pairs run as transfer spans (busy, stints); the action itself animates nothing more.
        result.glyphs = unique(action.pairs.flatMap((p) => [...p.from, ...p.to]));
        lifetime.actions.set(action.id, result);
        continue;
      } else if (action.kind === 'emphasis') {
        // On the targeted glyphs on screen when it starts; those off screen are left alone (an
        // explicit one is reported). Only an effect that animates them keeps them busy.
        const explicit = action.glyphs !== 'all';
        const targets = explicit ? unique(action.glyphs as number[]) : glyphs;
        for (const g of targets) {
          if (entered.has(g)) result.glyphs.push(g);
          else if (explicit) result.skipped.push({ glyph: g, reason: 'off-screen' });
        }
        if (!EMPHASIS[action.effect].animates) {
          lifetime.actions.set(action.id, result);
          continue;
        }
      } else {
        const explicit = action.glyphs !== 'all';
        const targets = explicit ? unique(action.glyphs as number[]) : glyphs;
        for (const g of targets) {
          let reason: SkipReason | null = null;
          if (action.kind === 'appear') {
            if (entered.has(g)) reason = 'on-screen';
            else if (consumed.has(g)) reason = 'consumed';
            else if ((pendingArrivals.get(g) ?? 0) > 0) reason = 'arrives-later';
          } else if (!entered.has(g)) {
            reason = 'off-screen';
          }
          if (reason === null) result.glyphs.push(g);
          else if (explicit) result.skipped.push({ glyph: g, reason });
        }
        for (const g of result.glyphs) {
          if (action.kind === 'appear') open(g, span);
          else close(g, span);
        }
      }
      busy(result.glyphs, span);
      lifetime.actions.set(action.id, result);
    } else {
      const w = outroWindow(clip);
      const span: Span = { ...w, cause: { kind: 'outro' } };
      lifetime.outro = glyphs.filter((g) => entered.has(g) && (pendingConsumes.get(g) ?? 0) === 0);
      for (const g of lifetime.outro) close(g, span);
      busy(lifetime.outro, span);
    }
  }

  // Glyphs that came on screen after the outro started leave with the clip.
  const end: Span = { start: clip.end, end: clip.end, cause: { kind: 'clip-end' } };
  for (const g of [...entered.keys()]) close(g, end);
  for (const list of lifetime.busy.values()) list.sort((a, b) => a.start - b.start);
  return lifetime;
}

/** Why an Appear of every glyph that starts at absolute `time` would leave out `glyph` of the clip
 * whose lifetime is `life`, besides its being on screen then: a transfer consumed it by then
 * (`consumed`: it cannot come back, and an explicit list that names it is an error,
 * `appear-consumed`), or one brings it later (`arrives-later`). Null when neither. Read off the
 * stays of `life`, which may hold that Appear or not, as `simulate` decides at the instant: a pair
 * that starts with it plays first. A new block beside others names what such an Appear would
 * bring there (`glyphsLeftFor`, audit A8-02). */
export function appearSkipReason(
  life: ClipLifetime,
  glyph: number,
  time: number,
): 'consumed' | 'arrives-later' | null {
  for (const stint of life.stints.get(glyph) ?? []) {
    // A transfer takes a glyph off screen only to consume it.
    if (stint.exit.cause.kind === 'transfer' && stint.exit.start <= time + TIME_EPSILON) {
      return 'consumed';
    }
    if (stint.enter.cause.kind === 'transfer' && stint.enter.start > time + TIME_EPSILON) {
      return 'arrives-later';
    }
  }
  return null;
}

/** The glyphs whose first appear or disappear block (by start, then order in the clip) is an
 * appear: they wait for it instead of coming in with the intro. */
function waitingGlyphs(clip: Clip, glyphs: readonly number[]): Set<number> {
  const waiting = new Set<number>();
  const decided = new Set<number>();
  const blocks = clip.actions
    .map((action, index) => ({ action, index }))
    .filter(({ action }) => action.kind === 'appear' || action.kind === 'disappear')
    .sort((a, b) => a.action.start - b.action.start || a.index - b.index);
  for (const { action } of blocks) {
    if (action.kind !== 'appear' && action.kind !== 'disappear') continue;
    for (const g of action.glyphs === 'all' ? glyphs : action.glyphs) {
      if (decided.has(g)) continue;
      decided.add(g);
      if (action.kind === 'appear') waiting.add(g);
    }
  }
  return waiting;
}

function unique(glyphs: readonly number[]): number[] {
  return [...new Set(glyphs)].sort((a, b) => a - b);
}

/** Whether the glyphs `cause` animates are half drawn, half gone or half morphed while it runs:
 * the intro, the outro, an Appear or Disappear block and a transfer pair leave them so; a tween, a
 * part Transform or an Emphasis block only moves them, and Manim measures the interpolated glyph
 * as the preview does. */
export function measuresHalfDrawn(clip: Clip, cause: Cause): boolean {
  if (cause.kind === 'action') {
    const kind = clip.actions.find((a) => a.id === cause.actionId)?.kind;
    return kind === 'appear' || kind === 'disappear';
  }
  return cause.kind !== 'clip-end';
}

/** One key per cause: `transfer:<key>`, `action:<id>`, else its kind. */
export function causeKey(cause: Cause): string {
  switch (cause.kind) {
    case 'transfer':
      return `transfer:${cause.key}`;
    case 'action':
      return `action:${cause.actionId}`;
    default:
      return cause.kind;
  }
}

/** What is still drawing, removing or morphing `glyphs` of the clip at `t` — a span of theirs
 * that `t` is strictly inside and that `measuresHalfDrawn` — grouped by cause, in the order met:
 * there Manim would measure a formula half drawn, which an object attached to those glyphs at its
 * clip's start (`attach-target-busy`) and an Emphasis effect that measures them when it starts
 * (`emphasis-target-busy`) must not do. */
export function measuringConflicts(
  clip: Clip,
  life: ClipLifetime,
  glyphs: readonly number[],
  t: number,
): { cause: Cause; glyphs: number[] }[] {
  const busy = new Map<string, { cause: Cause; glyphs: number[] }>();
  for (const g of glyphs) {
    for (const span of life.busy.get(g) ?? []) {
      if (t <= span.start + TIME_EPSILON || t >= span.end - TIME_EPSILON) continue;
      if (!measuresHalfDrawn(clip, span.cause)) continue;
      const key = causeKey(span.cause);
      const known = busy.get(key);
      if (known) known.glyphs.push(g);
      else busy.set(key, { cause: span.cause, glyphs: [g] });
    }
  }
  return [...busy.values()];
}
