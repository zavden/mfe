/* What a transfer pair (a relation's or a Morph block's) looks like while it runs: Manim's
 * `Transform` family on glyph groups (docs/ARCHITECTURE.md §5, "Relations in Manim").
 *
 *   transform  ReplacementTransform(src, dst, path_arc=θ)
 *   copy       GL TransformFromCopy(src, dst, path_arc=θ) = Transform(src.copy(), dst);
 *              CE ReplacementTransform(src.copy(), dst, path_arc=θ) (D16: copy follows ManimGL)
 *   fade       FadeTransform(src, dst, path_arc=θ)
 *
 * `src` / `dst` are the glyph itself when both sides are one glyph, otherwise a VGroup of the
 * glyphs on *both* sides. Per library (ManimCE 0.22 / ManimGL 1.7, `animation/transform.py`,
 * `animation/fading.py`, `mobject/mobject.py`):
 *
 *   - Family alignment (`align_submobjects` / `align_family`): the group with fewer glyphs is
 *     padded with invisible copies (`fade(1)` / `set_opacity(0)`) of its own glyphs, spread by
 *     `add_n_more_submobjects` — `repeat_indices = arange(n + k) · n // (n + k)` — so a glyph
 *     that has to cover two targets is followed by an invisible copy of itself (a split), and a
 *     target that has to take two sources is followed by an invisible copy of itself (a merge).
 *   - Point alignment per pair of glyphs (`geom/morph.ts`), then `interpolate`: every point moves
 *     along `path_along_arc` (straight for |θ| < 0.01 rad) — or, for a pair with a custom path
 *     (D48), straight plus the path's shift (`interpolateAlongPath`: the path laid on the chord
 *     between the piece's centres at the start and at the end, as the export's `path_func` helper
 *     does per submobject; a chord of no length plays straight); a piece that stands for a route
 *     of the pair — one source glyph going to one target glyph — follows the path of that route
 *     when it has one of its own (D167, `routes`) —, and the style interpolates
 *     linearly (`interpolate_color`): fill RGBA, stroke RGBA and the stroke width alike, so a
 *     stroked circle becoming a filled glyph loses its stroke as it fills.
 *   - ReplacementTransform and copy: glyph i of the source goes to glyph i of the target, forward
 *     in both libraries. (ManimCE's own TransformFromCopy would animate the target towards the
 *     source and play it backwards, mirroring rate functions and arcs; the user chose GL's
 *     semantics for both targets, so CE exports the copy as ReplacementTransform(src.copy(), dst).)
 *   - FadeTransform does not align anything: it animates Group(src, dst.copy()) between a start
 *     where the target copy sits stretched over the source's box (`replace(stretch=True)`,
 *     opacity 0) and an end where the source sits stretched over the target's box; so each source
 *     glyph fades out while deforming onto the target's box and each target glyph fades in while
 *     deforming from the source's box, each keeping its own stroke width and colours — except
 *     that ManimGL's ghosts take the fill colour of what they replace (below).
 *   - Several sources, one target (`extras`, D54): `merge` is the family alignment above (the
 *     extra sources fade into invisible copies of the target); `separate` plays one transform per
 *     source onto the same target, so every source arrives and they coincide; `copies` plays the
 *     pair's style for the authored principal and a copy for each other source, which
 *     stays where it is. Each is one group of pieces, built as for a pair of its own.
 *
 * The caller supplies glyph states: formula-local contours (their identity is the cache key of
 * the point alignment), the placement matrix, the colour, the clip opacity and the glyph's own
 * style at the relevant instant (the source at the window start, the target at its end). */
import {
  alignPointPaths,
  arcLengths,
  chordFrame,
  interpolateAlongPath,
  interpolatePoints,
  isStraightSpline,
  lerpColor,
  pathPair,
  pointsCenter,
  pointsToContours,
  toPointPath,
  transformPointPath,
  type ArcLengths,
  type Contour,
  type Mat2D,
  type PathPair,
  type PointPath,
} from '../../geom';
import {
  crossFades,
  missingPrincipal,
  padFamily,
  routePath,
  sourceStyle,
  type GlyphStyle,
  type PairExtras,
  type PairRoute,
  type PathSpline,
  type RelationStyle,
  type RouteRef,
  type Target,
} from '../../model';
import { manimBoxes, type ManimBoxes } from '../measure';
import type { Drawable } from '../types';

export interface MorphGlyph {
  /** Formula-local cubic contours of the glyph (the render's own arrays). */
  local: readonly Contour[];
  /** Placement of the formula, formula-local → scene. */
  matrix: Mat2D;
  color: string;
  /** 0…1, the clip opacity. */
  opacity: number;
  /** The glyph's own style (its paints at full opacity). */
  style: GlyphStyle;
  clipId: string;
  /** Canonical glyph index. */
  glyph: number;
}

export interface MorphSpec {
  style: RelationStyle;
  target: Target;
  /** `path_arc` in radians. */
  pathArc: number;
  src: readonly MorphGlyph[];
  dst: readonly MorphGlyph[];
  /** How several sources reach one target (`effectiveExtras`); `merge` when absent. */
  extras?: PairExtras;
  /** The canonical source chosen when the copies pair was authored, remapped with that glyph. */
  principal?: number | null;
  /** The pair's custom path, which replaces the arc (D48). */
  path?: PathSpline | null;
  /** The routes of the pair with a path of their own, which replaces the pair's (D167). */
  routes?: readonly PairRoute[];
}

/** A paint at progress 0 and 1 of the *interpolation* (see `Morph.start`), interpolated
 * linearly between: its colour and its opacity (the clip's times the style's). */
export interface PaintRange {
  color0: string;
  color1: string;
  opacity0: number;
  opacity1: number;
}

export interface StrokeRange extends PaintRange {
  width0: number;
  width1: number;
}

export interface MorphPiece {
  pair: PathPair;
  /** The custom path the piece follows — its route's own, else the pair's —, null for the arc. */
  path: MorphPath | null;
  /** With a custom path: the frame of the piece's chord (`chordFrame` of its centres at the
   * start and at the end), null when the two coincide (the piece plays straight then). */
  chord: Mat2D | null;
  /** The route of the pair the piece stands for (a source glyph going to a target glyph), null
   * for a piece of a group that goes to no glyph in particular (a cross-fade of groups). */
  route: RouteRef | null;
  fill: PaintRange;
  stroke: StrokeRange;
  /** `<clipId>:<glyph>`, made unique within the morph. */
  key: string;
  clipId: string;
  glyph: number;
}

/** A custom path prepared for playing: its arc-length table, and whether it is the chord itself. */
export interface MorphPath {
  spline: PathSpline;
  lengths: ArcLengths;
  straight: boolean;
}

export interface Morph {
  style: RelationStyle;
  target: Target;
  pathArc: number;
  pieces: MorphPiece[];
}

// --- Caches ------------------------------------------------------------------------

type ContourList = readonly Contour[];
const pathCache: Record<Target, WeakMap<ContourList, PointPath>> = {
  ce: new WeakMap(),
  gl: new WeakMap(),
};
const alignCache: Record<
  Target,
  WeakMap<ContourList, WeakMap<ContourList, [PointPath, PointPath]>>
> = {
  ce: new WeakMap(),
  gl: new WeakMap(),
};

/** The glyph's path as the target library stores it (`toPointPath`), computed once per shape. */
export function pointPathOf(local: ContourList, target: Target): PointPath {
  let path = pathCache[target].get(local);
  if (!path) {
    path = toPointPath(local, target);
    pathCache[target].set(local, path);
  }
  return path;
}

/** `align_points` of two glyphs, computed once per pair of shapes and target. */
function alignedPaths(a: ContourList, b: ContourList, target: Target): [PointPath, PointPath] {
  let inner = alignCache[target].get(a);
  if (!inner) {
    inner = new WeakMap();
    alignCache[target].set(a, inner);
  }
  let aligned = inner.get(b);
  if (!aligned) {
    aligned = alignPointPaths(pointPathOf(a, target), pointPathOf(b, target));
    inner.set(b, aligned);
  }
  return aligned;
}

// The family alignment (`padFamily`) is the model's: it also tells the routes of a pair.
export { padFamily };

// --- Building ----------------------------------------------------------------------

/** `source.replace(target, stretch=True)`: stretch each axis to the target's extent about the
 * source's centre (an axis of length 0 stays), then move the centres together. */
function ghostMatrix(from: ManimBoxes, onto: ManimBoxes): Mat2D {
  const fw = from.size.maxX - from.size.minX;
  const fh = from.size.maxY - from.size.minY;
  const sx = fw === 0 ? 1 : (onto.size.maxX - onto.size.minX) / fw;
  const sy = fh === 0 ? 1 : (onto.size.maxY - onto.size.minY) / fh;
  const cx = (from.critical.minX + from.critical.maxX) / 2;
  const cy = (from.critical.minY + from.critical.maxY) / 2;
  const tx = (onto.critical.minX + onto.critical.maxX) / 2;
  const ty = (onto.critical.minY + onto.critical.maxY) / 2;
  return [sx, 0, 0, sy, tx - sx * cx, ty - sy * cy];
}

function scenePath(glyph: MorphGlyph, target: Target): PointPath {
  return transformPointPath(glyph.matrix, pointPathOf(glyph.local, target));
}

/** The paints of a glyph at a progress end: its own, both opacities times `factor` (0 for an
 * invisible copy or a ghost). */
function paintsAt(g: MorphGlyph, factor: number) {
  const opacity = g.opacity * factor;
  return {
    fill: opacity * g.style.fillOpacity,
    stroke: opacity * g.style.strokeOpacity,
    width: g.style.strokeWidth,
  };
}

/** The style ranges of a piece from glyph `from` (its paints times `f0`) to glyph `to` (times
 * `f1`); `fillColor0` / `fillColor1` override the fill colours (ManimGL's ghosts). */
function ranges(
  from: MorphGlyph,
  f0: number,
  to: MorphGlyph,
  f1: number,
  fillColor0 = from.color,
  fillColor1 = to.color,
): Pick<MorphPiece, 'fill' | 'stroke'> {
  const a = paintsAt(from, f0);
  const b = paintsAt(to, f1);
  return {
    fill: { color0: fillColor0, color1: fillColor1, opacity0: a.fill, opacity1: b.fill },
    stroke: {
      color0: from.color,
      color1: to.color,
      opacity0: a.stroke,
      opacity1: b.stroke,
      width0: a.width,
      width1: b.width,
    },
  };
}

/** One Manim call of a pair: a style on a source group and a target group. */
interface MorphGroup {
  style: RelationStyle;
  src: readonly MorphGlyph[];
  dst: readonly MorphGlyph[];
}

/** The calls a pair plays as: one for the whole pair, or, for several sources onto one target
 * with `separate` or `copies`, one per source in glyph order. Copies uses the authored principal
 * for the pair's style; every other source sends a copy (`sourceStyle`). */
export function morphGroups(spec: MorphSpec): MorphGroup[] {
  const { style, src, dst } = spec;
  const extras = spec.extras ?? 'merge';
  const pair = {
    from: src.map((g) => g.glyph),
    to: dst.map((g) => g.glyph),
    extras,
    principal: spec.principal,
  };
  if (missingPrincipal(pair)) return [];
  if (extras === 'merge' || src.length < 2 || dst.length !== 1) return [{ style, src, dst }];
  return [...src]
    .sort((a, b) => a.glyph - b.glyph)
    .map((glyph) => ({ style: sourceStyle(pair, style, glyph.glyph), src: [glyph], dst }));
}

/** The pieces of one pair. Returns no pieces when a side is empty. `used` holds the keys taken
 * so far, for the pieces of several pairs drawn together (those of one transfer that bring the
 * same targets) to be told apart; the keys of this pair's pieces are added to it. */
export function buildMorph(spec: MorphSpec, used = new Set<string>()): Morph {
  const { style, target, src, dst } = spec;
  const prepared = new Map<PathSpline, MorphPath>();
  const prepare = (spline: PathSpline | null): MorphPath | null => {
    if (!spline) return null;
    let path = prepared.get(spline);
    if (!path) {
      path = { spline, lengths: arcLengths(spline), straight: isStraightSpline(spline) };
      prepared.set(spline, path);
    }
    return path;
  };
  const morph: Morph = { style, target, pathArc: spec.pathArc, pieces: [] };
  if (src.length === 0 || dst.length === 0) return morph;
  const unique = (base: string): string => {
    let key = base;
    for (let n = 1; used.has(key); n++) key = `${base}~${n}`;
    used.add(key);
    return key;
  };
  for (const group of morphGroups(spec)) {
    for (const piece of groupPieces(group, target, unique)) {
      const path = prepare(
        piece.route ? routePath(spec, piece.route.from, piece.route.to) : (spec.path ?? null),
      );
      morph.pieces.push({ ...piece, path, chord: path ? chordOf(piece.pair) : null });
    }
  }
  return morph;
}

/** The chord a custom path is laid on for a piece: from the centre of its points at the start
 * to their centre at the end. */
function chordOf(pair: PathPair): Mat2D | null {
  const from = pointsCenter(pair.start);
  const to = pointsCenter(pair.end);
  return from && to ? chordFrame(from, to) : null;
}

/** A piece before its path is known. */
type BarePiece = Omit<MorphPiece, 'chord' | 'path'>;

/** The pieces of one call (`MorphGroup`), keyed through `unique`. */
function groupPieces(
  { style, src, dst }: MorphGroup,
  target: Target,
  unique: (base: string) => string,
): BarePiece[] {
  const pieces: BarePiece[] = [];
  if (crossFades(style)) {
    // Under `fade_copy` the source stays, drawn by its clip: what fades out is a copy of it,
    // which takes another key (the source glyph's, marked as a padding copy's is).
    const copy = style === 'fade_copy' ? '~' : '';
    const srcPaths = src.map((g) => scenePath(g, target));
    const dstPaths = dst.map((g) => scenePath(g, target));
    const srcBox = manimBoxes(srcPaths, target);
    const dstBox = manimBoxes(dstPaths, target);
    if (!srcBox || !dstBox) return pieces;
    const srcOnto = ghostMatrix(srcBox, dstBox); // the source stretched over the target
    const dstOnto = ghostMatrix(dstBox, srcBox);
    // ManimGL's ghost_to also copies the uniforms of the group it replaces — the fill colour; the
    // stroke colour is per point and stays —: a VGroup holds the uniforms of its first glyph. So
    // every GL piece's fill ends at the colour of the target group's first glyph (the source's
    // pieces) or starts from the source group's first glyph (the target's); in CE a ghost keeps
    // its own colours and only loses its opacity.
    const gl = target === 'gl';
    // One glyph cross-fading with one glyph is that route; a group cross-fades whole, stretched
    // over the other side's box, and none of its glyphs goes to a glyph in particular.
    const route =
      src.length === 1 && dst.length === 1 ? { from: src[0]!.glyph, to: dst[0]!.glyph } : null;
    src.forEach((g, i) => {
      pieces.push({
        pair: pathPair(srcPaths[i]!, transformPointPath(srcOnto, srcPaths[i]!)),
        ...ranges(g, 1, g, 0, g.color, gl ? dst[0]!.color : g.color),
        key: unique(`${g.clipId}:${g.glyph}${copy}`),
        clipId: g.clipId,
        glyph: g.glyph,
        route,
      });
    });
    dst.forEach((g, j) => {
      pieces.push({
        pair: pathPair(transformPointPath(dstOnto, dstPaths[j]!), dstPaths[j]!),
        ...ranges(g, 0, g, 1, gl ? src[0]!.color : g.color, g.color),
        key: unique(`${g.clipId}:${g.glyph}`),
        clipId: g.clipId,
        glyph: g.glyph,
        route,
      });
    });
    return pieces;
  }

  const n = src.length;
  const m = dst.length;
  const srcEntries = padFamily(n, m - n);
  const dstEntries = padFamily(m, n - m);
  srcEntries.forEach((s, i) => {
    const d = dstEntries[i]!;
    const from = src[s.index]!;
    const to = dst[d.index]!;
    const [pa, pb] = alignedPaths(from.local, to.local, target);
    const a = transformPointPath(from.matrix, pa);
    const b = transformPointPath(to.matrix, pb);
    // The piece is named after the glyph that stays on screen (the copy, for TransformFromCopy).
    const owner = style === 'copy' ? to : from;
    const visible = style === 'copy' ? d.visible : s.visible;
    const base = `${owner.clipId}:${owner.glyph}`;
    pieces.push({
      pair: pathPair(a, b),
      ...ranges(from, s.visible ? 1 : 0, to, d.visible ? 1 : 0),
      key: unique(visible ? base : `${base}~`),
      clipId: owner.clipId,
      glyph: owner.glyph,
      route: { from: from.glyph, to: to.glyph },
    });
  });
  return pieces;
}

// --- Evaluating --------------------------------------------------------------------

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

/** The drawables of a morph at interpolation progress `p`; pieces with no opacity are left out
 * (Manim draws nothing for them). With `transfer`, each says which transfer it is a piece of
 * (`Drawable.transfer`). */
export function morphDrawables(morph: Morph, p: number, z: number, transfer?: string): Drawable[] {
  const out: Drawable[] = [];
  for (const piece of morph.pieces) {
    const fillOpacity = lerp(piece.fill.opacity0, piece.fill.opacity1, p);
    const strokeOpacity = lerp(piece.stroke.opacity0, piece.stroke.opacity1, p);
    const width = lerp(piece.stroke.width0, piece.stroke.width1, p);
    const fill =
      fillOpacity > 0
        ? { color: lerpColor(piece.fill.color0, piece.fill.color1, p), opacity: fillOpacity }
        : null;
    const stroke =
      strokeOpacity > 0 && width > 0
        ? {
            color: lerpColor(piece.stroke.color0, piece.stroke.color1, p),
            opacity: strokeOpacity,
            width,
          }
        : null;
    if (!fill && !stroke) continue;
    const { start, end } = piece.pair;
    const points =
      piece.path && !piece.path.straight && piece.chord
        ? interpolateAlongPath(start, end, p, piece.path.spline, piece.path.lengths, piece.chord)
        : interpolatePoints(start, end, p, piece.path ? 0 : morph.pathArc);
    out.push({
      key: piece.key,
      clipId: piece.clipId,
      glyph: piece.glyph,
      path: { contours: pointsToContours(piece.pair, points) },
      fill,
      stroke,
      z,
      role: 'object',
      partial: false,
      ...(transfer === undefined ? {} : { transfer }),
    });
  }
  return out;
}
