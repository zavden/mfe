/* Glyph transfers: what moves glyphs between glyphs of clips — the relations (from one clip's
 * formula into another's) and the morph blocks (within one clip's formula, from the clip to
 * itself). Lifetime, validation, the scene events, the evaluator and the exporter work on this
 * derived description, not on the stored records, so that the two origins share one pipeline:
 * each only lowers itself here. Pure (docs/ARCHITECTURE.md §5). */
import { actionWindow, relationWindow } from './time';
import type {
  ActionId,
  ClipId,
  Easing,
  GlyphPair,
  PairExtras,
  PairRoute,
  PathSpline,
  Project,
  RelationId,
  RelationStyle,
} from './types';

/** Where a transfer comes from in the project: a relation, or a morph block of a clip. */
export type TransferOrigin =
  | { kind: 'relation'; relationId: RelationId }
  | { kind: 'morph'; clipId: ClipId; actionId: ActionId };

export interface TransferPair {
  from: number[];
  to: number[];
  /** The authored canonical source of a copies pair; null means it needs repair. */
  principal?: number | null;
  /** The pair's style with the transfer's default applied. */
  style: RelationStyle;
  /** How several sources reach one target (`effectiveExtras`: `merge` for every other shape). */
  extras: PairExtras;
  /** The pair's custom path (`GlyphPair.path`); null = the transfer's `pathArc`. */
  path: PathSpline | null;
  /** The routes with a path of their own (`GlyphPair.routes`), which they follow instead. */
  routes: PairRoute[];
}

/** The authored principal, or the lowest source when the choice has not yet been stored.
 * An explicit lost or no-longer-listed principal never promotes one of the other sources. */
export function principalOf(pair: Pick<GlyphPair, 'from' | 'principal'>): number | null {
  if (pair.principal !== undefined) {
    return pair.principal !== null && pair.from.includes(pair.principal) ? pair.principal : null;
  }
  return pair.from.reduce<number | null>(
    (lowest, g) => (lowest === null || g < lowest ? g : lowest),
    null,
  );
}

/** Persist the initial choice when a pair enters copies mode; retain an explicit loss. */
export function initializePairPrincipal<P extends GlyphPair>(pair: P): P {
  return pair.extras === 'copies' && pair.principal === undefined
    ? { ...pair, principal: principalOf(pair) }
    : pair;
}

/** A lost copies principal stays invalid after a source deletion or a style override. */
export function missingPrincipal(pair: Pick<GlyphPair, 'from' | 'extras' | 'principal'>): boolean {
  return pair.extras === 'copies' && principalOf(pair) === null;
}

/** The `extras` that apply to a pair: what it stores, `separate` when it stores none, for a pair
 * of several sources and one target; `merge` (Manim's own alignment) for every other shape, where
 * the option means nothing. */
export function effectiveExtras(pair: Pick<GlyphPair, 'from' | 'to' | 'extras'>): PairExtras {
  if (new Set(pair.from).size < 2 || new Set(pair.to).size !== 1) return 'merge';
  return pair.extras ?? 'separate';
}

/** Whether a style plays a copy of its sources, which stay where they are: `copy` and
 * `fade_copy`. The others consume them. */
export const copiesSources = (style: RelationStyle): boolean =>
  style === 'copy' || style === 'fade_copy';

/** Whether a style cross-fades its two groups whole — Manim's `FadeTransform`, which aligns no
 * glyph with a glyph — instead of morphing each glyph into one: `fade` and `fade_copy`. */
export const crossFades = (style: RelationStyle): boolean =>
  style === 'fade' || style === 'fade_copy';

/** Which sources of a pair are consumed (they leave through it) and which are only copied (they
 * stay, busy during the window), ascending and without repeats: a pair of a style that copies
 * (`copiesSources`) copies them all; with `copies` the authored principal — `lead` — is consumed
 * and the others copied; otherwise every source is consumed. `style` is the pair's with the
 * transfer's default applied. */
export interface SourceRoles {
  consumed: number[];
  copied: number[];
  /** The source that makes the transform when the others send copies; null otherwise. */
  lead: number | null;
}

export function sourceRoles(
  pair: Pick<GlyphPair, 'from' | 'to' | 'extras' | 'principal'>,
  style: RelationStyle,
): SourceRoles {
  const from = [...new Set(pair.from)].sort((a, b) => a - b);
  if (missingPrincipal(pair)) return { consumed: [], copied: [], lead: null };
  if (copiesSources(style)) return { consumed: [], copied: from, lead: null };
  if (effectiveExtras(pair) === 'copies') {
    const lead = principalOf(pair)!;
    return { consumed: [lead], copied: from.filter((g) => g !== lead), lead };
  }
  return { consumed: from, copied: [], lead: null };
}

/** What a source of a pair plays when its sources play one call each — several onto one target,
 * `separate` or `copies` —: the pair's style, or, with `copies`, a plain `copy` for every source
 * but the principal, whatever the style (under `fade_copy` the principal's copy cross-fades and
 * the others' transform). `style` is the pair's with the transfer's default applied. */
export function sourceStyle(
  pair: Pick<GlyphPair, 'from' | 'to' | 'extras' | 'principal'>,
  style: RelationStyle,
  glyph: number,
): RelationStyle {
  if (effectiveExtras(pair) !== 'copies') return style;
  return glyph === principalOf(pair) ? style : 'copy';
}

/** Invalid pairs keep their slot so diagnostic paths still name the authored pair, but have no
 * active glyphs: preview/lifetime/export must not invent a replacement principal. */
function resolvedPair(pair: GlyphPair, style: RelationStyle): TransferPair {
  const stored = initializePairPrincipal(pair);
  const invalid = missingPrincipal(stored);
  return {
    from: invalid ? [] : [...stored.from],
    to: invalid ? [] : [...stored.to],
    style: stored.style ?? style,
    extras: effectiveExtras(stored),
    path: stored.path ?? null,
    routes: invalid ? [] : (stored.routes ?? []),
    ...(stored.principal === undefined ? {} : { principal: stored.principal }),
  };
}

// --- Routes: which source glyph goes to which target glyph --------------------------------------

/** One entry of a group of glyphs as Manim aligns it with another. */
export interface FamilyEntry {
  /** Index into the side's glyph list. */
  index: number;
  /** false for the invisible copies `add_n_more_submobjects` inserts. */
  visible: boolean;
}

/** The list Manim's `add_n_more_submobjects(k)` makes out of `n` glyphs (`align_submobjects` /
 * `align_family`, ManimCE 0.22 and ManimGL 1.7): the group with fewer glyphs is padded with
 * invisible copies of its own, spread by `repeat_indices = arange(n + k) · n // (n + k)`, so a
 * glyph that has to cover two of the other side is followed by an invisible copy of itself. */
export function padFamily(n: number, k: number): FamilyEntry[] {
  if (k <= 0) return Array.from({ length: n }, (_, index) => ({ index, visible: true }));
  const target = n + k;
  const split = new Array<number>(n).fill(0);
  for (let i = 0; i < target; i++) split[Math.floor((i * n) / target)]!++;
  const out: FamilyEntry[] = [];
  for (let index = 0; index < n; index++) {
    out.push({ index, visible: true });
    for (let j = 1; j < split[index]!; j++) out.push({ index, visible: false });
  }
  return out;
}

/** A source glyph of a pair on its way to one of its target glyphs (canonical indices). */
export interface RouteRef {
  from: number;
  to: number;
}

/** The routes a pair plays: the couples (source glyph, target glyph) that a piece of its
 * animation stands for, which is what can have a path of its own (D167). `style` is the pair's
 * with the transfer's default applied.
 *
 *   - onto one target, every source goes to it — whatever the `extras`: one transform each, or
 *     Manim's merge, where the sources beyond the first fade into the target;
 *   - out of one source, it goes to every target (Manim splits it);
 *   - several onto several, Manim aligns the two groups (`padFamily`): glyph i to glyph i with as
 *     many on both sides, and with fewer on one, some of its glyphs cover two of the other;
 *   - except under `fade` and `fade_copy`, which align nothing: a group cross-fades whole,
 *     stretched over the other side's box, and no glyph of it goes to a glyph. A fade has routes
 *     only where each source plays on its own onto the one target (`separate`, `copies`, or a
 *     single source).
 *
 * In the order the pair plays them; none for a pair that plays nothing (a lost principal). */
export function pairRoutes(
  pair: Pick<GlyphPair, 'from' | 'to' | 'extras' | 'principal'>,
  style: RelationStyle,
): RouteRef[] {
  if (missingPrincipal(pair)) return [];
  const src = [...new Set(pair.from)];
  const dst = [...new Set(pair.to)];
  if (src.length === 0 || dst.length === 0) return [];
  if (dst.length === 1) {
    if (crossFades(style) && src.length > 1 && effectiveExtras(pair) === 'merge') return [];
    return src.map((from) => ({ from, to: dst[0]! }));
  }
  if (crossFades(style)) return [];
  if (src.length === 1) return dst.map((to) => ({ from: src[0]!, to }));
  const a = padFamily(src.length, dst.length - src.length);
  const b = padFamily(dst.length, src.length - dst.length);
  const seen = new Set<string>();
  const out: RouteRef[] = [];
  a.forEach((entry, i) => {
    const route = { from: src[entry.index]!, to: dst[b[i]!.index]! };
    const key = `${route.from}>${route.to}`;
    if (!seen.has(key)) out.push(route);
    seen.add(key);
  });
  return out;
}

/** The path a route of a pair follows: its own, else the pair's; null = the transfer's arc. */
export function routePath(
  pair: { path?: PathSpline | null; routes?: readonly PairRoute[] },
  from: number,
  to: number,
): PathSpline | null {
  const own = pair.routes?.find((r) => r.from === from && r.to === to);
  return own?.path ?? pair.path ?? null;
}

/** The pair with the routes whose glyphs it still holds, one per couple (the first wins), and
 * without the field when none is left: what an edit of the pair's glyphs leaves of them. A pair
 * left with one source and one target has one route, which is the pair itself: the path of that
 * route becomes the pair's, so that what plays is what Edit path shows. The same pair when
 * nothing changes. */
export function prunePairRoutes<P extends GlyphPair>(pair: P): P {
  if (!pair.routes) return pair;
  const seen = new Set<string>();
  const kept = pair.routes.filter((r) => {
    const key = `${r.from}>${r.to}`;
    if (seen.has(key) || !pair.from.includes(r.from) || !pair.to.includes(r.to)) return false;
    seen.add(key);
    return true;
  });
  const alone = new Set(pair.from).size === 1 && new Set(pair.to).size === 1;
  if (kept.length === pair.routes.length && kept.length > 0 && !alone) return pair;
  const next = { ...pair };
  if (alone && kept[0]) next.path = kept[0].path;
  if (kept.length > 0 && !alone) next.routes = kept;
  else delete next.routes;
  return next;
}

/** The routes of a pair with one side taken through `map` (old index → new, null = gone), for
 * the remaps that renumber a formula's glyphs: a route that loses its glyph goes. */
export function remapPairRoutes(
  routes: readonly PairRoute[],
  side: 'from' | 'to',
  map: readonly (number | null)[],
): PairRoute[] {
  return routes.flatMap((route) => {
    const next = map[route[side]] ?? null;
    return next === null ? [] : [{ ...route, [side]: next }];
  });
}

export interface GlyphTransfer {
  /** Stable key, `transferKey(origin)`: what lifetime causes and scene events refer to. */
  key: string;
  origin: TransferOrigin;
  /** The same clip for a morph block. */
  fromClipId: ClipId;
  toClipId: ClipId;
  /** Absolute seconds, half-open. */
  start: number;
  end: number;
  easing: Easing;
  style: RelationStyle;
  /** Degrees. */
  pathArc: number;
  /** In their authored order. */
  pairs: TransferPair[];
  /** Where validation reports a problem of the origin (an issue path). */
  path: (string | number)[];
}

export function transferKey(origin: TransferOrigin): string {
  return origin.kind === 'relation' ? `relation:${origin.relationId}` : `morph:${origin.actionId}`;
}

/** Whether a transfer key (a lifetime cause's) names a morph block's transfer. */
export function isMorphKey(key: string): boolean {
  return key.startsWith('morph:');
}

/** Every transfer of the project: the relations in their order, then the morph blocks of each
 * clip in the clips' and their actions' order. A relation to or from a missing clip is left out
 * (its validation error says so). */
export function glyphTransfers(project: Project): GlyphTransfer[] {
  const clips = new Map(project.clips.map((c) => [c.id, c]));
  const out: GlyphTransfer[] = [];
  project.relations.forEach((relation, index) => {
    const to = clips.get(relation.toClipId);
    if (!to || !clips.has(relation.fromClipId)) return;
    const { start, end } = relationWindow(relation, to);
    const origin: TransferOrigin = { kind: 'relation', relationId: relation.id };
    out.push({
      key: transferKey(origin),
      origin,
      fromClipId: relation.fromClipId,
      toClipId: relation.toClipId,
      start,
      end,
      easing: relation.easing,
      style: relation.style,
      pathArc: relation.pathArc,
      pairs: relation.pairs.map((p) => resolvedPair(p, relation.style)),
      path: ['relations', index],
    });
  });
  project.clips.forEach((clip, ci) => {
    clip.actions.forEach((action, ai) => {
      if (action.kind !== 'morph') return;
      const { start, end } = actionWindow(clip, action);
      const origin: TransferOrigin = { kind: 'morph', clipId: clip.id, actionId: action.id };
      out.push({
        key: transferKey(origin),
        origin,
        fromClipId: clip.id,
        toClipId: clip.id,
        start,
        end,
        easing: action.easing,
        style: action.style,
        pathArc: action.pathArc,
        pairs: action.pairs.map((p) => resolvedPair(p, action.style)),
        path: ['clips', ci, 'actions', ai],
      });
    });
  });
  return out;
}
