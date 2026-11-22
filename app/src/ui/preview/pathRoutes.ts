/* The routes of a pair in the Edit-path mode (D167). A route is one source glyph of a pair on its
 * way to one of its target glyphs (`pairRoutes`, model/transfers.ts); one may have a path of its
 * own (`GlyphPair.routes`), which its glyph follows instead of the pair's. The mode edits the
 * pair's common path ("All together") or, with «Path per glyph» on (D175), one route's: these are
 * the pure helpers it reads — which routes a pair offers, whether the mode opens with them shown,
 * what a route follows, how its own path is written or dropped, how routes are named, stepped
 * through, hit and found by their glyphs. */
import {
  applyToPoint,
  arcSpline,
  equalSplines,
  invert,
  nearestPoint,
  type Mat2D,
  type Vec2,
} from '../../geom';
import {
  pairRoutes,
  routePath,
  type FormulaSnapshot,
  type GlyphPair,
  type PathSpline,
  type RelationStyle,
  type RouteRef,
} from '../../model';
import type { Drawable, SceneEvaluator } from '../../scene';
import { glyphLabel, hasEditedPath } from '../relations/relationOps';

/** What of a relation or of a Morph block the routes of its pairs depend on. */
export interface RouteHolder {
  style: RelationStyle;
  pathArc: number;
}

export function sameRoute(a: RouteRef | null, b: RouteRef | null): boolean {
  return a === b || (a !== null && b !== null && a.from === b.from && a.to === b.to);
}

/** The routes the mode offers on a pair, in the order the pair plays them: those of `pairRoutes`
 * (with the holder's style when the pair has none) when there are two or more; none otherwise —
 * a pair with a single route is edited as a whole, as before routes existed. */
export function routeChoices(pair: GlyphPair, holder: RouteHolder): RouteRef[] {
  const routes = pairRoutes(pair, pair.style ?? holder.style);
  return routes.length >= 2 ? routes : [];
}

/** The route's own path, or null when it follows the common one. */
export function ownRoutePath(pair: GlyphPair, route: RouteRef): PathSpline | null {
  return pair.routes?.find((r) => r.from === route.from && r.to === route.to)?.path ?? null;
}

/** How many of `routes` have a path of their own. */
export function ownRouteCount(pair: GlyphPair, routes: readonly RouteRef[]): number {
  return routes.filter((r) => ownRoutePath(pair, r) !== null).length;
}

/** Whether the mode opens on the pair with «Path per glyph» on (D175): a route the pair plays
 * (`routeChoices`) has a path of its own. Otherwise it opens on the common path alone. */
export function opensPerGlyph(pair: GlyphPair, holder: RouteHolder): boolean {
  return ownRouteCount(pair, routeChoices(pair, holder)) > 0;
}

/** What the mode's bar says with «Path per glyph» off (D175), where the one curve drawn is the
 * common path: the path of all the glyphs, or, when `own` routes have a path of their own (which
 * they keep playing), the common path beside how many those are (`ownRoutesText`). */
export function commonTitle(own: number): string {
  return own > 0 ? 'Common path' : 'One path for all the glyphs';
}

/** "1 route with its own path", "2 routes with their own paths"; null for none. */
export function ownRoutesText(own: number): string | null {
  if (own <= 0) return null;
  return own === 1 ? '1 route with its own path' : `${own} routes with their own paths`;
}

/** The common path, as nodes: the pair's own, else its holder's arc (the chord at 0°). What a
 * route without a path of its own follows. */
export function commonSpline(pair: GlyphPair, holder: RouteHolder): PathSpline {
  return pair.path ?? arcSpline(holder.pathArc);
}

/** The path a route follows now, as nodes: its own, else the common one. */
export function routeSpline(pair: GlyphPair, holder: RouteHolder, route: RouteRef): PathSpline {
  return routePath(pair, route.from, route.to) ?? arcSpline(holder.pathArc);
}

/** Whether the route's own path says nothing of its own: it is what the route would follow
 * without it. False for a route without one. */
export function plainRoutePath(pair: GlyphPair, holder: RouteHolder, route: RouteRef): boolean {
  const own = ownRoutePath(pair, route);
  return own !== null && equalSplines(own, commonSpline(pair, holder));
}

/** Give a route of a (draft) pair its own path, or take it away (`null`): the entry is replaced in
 * place, added at the end, or removed, and the field goes with its last entry. */
export function setRoutePath(pair: GlyphPair, route: RouteRef, path: PathSpline | null): void {
  const match = (r: RouteRef) => r.from === route.from && r.to === route.to;
  if (path) {
    const entry = pair.routes?.find(match);
    if (entry) entry.path = path;
    else pair.routes = [...(pair.routes ?? []), { from: route.from, to: route.to, path }];
    return;
  }
  if (!pair.routes) return;
  const kept = pair.routes.filter((r) => !match(r));
  if (kept.length === pair.routes.length) return;
  if (kept.length > 0) pair.routes = kept;
  else delete pair.routes;
}

/** What the mode lets go of when it closes, on a (draft) pair: the pair's path when it says
 * nothing of its own (`hasEditedPath`), then each route's own path that is what the route would
 * follow without it — judged against the common path as it is left, so that a route plays what
 * it played. Routes the pair does not play are left alone. Whether anything went. */
export function dropPlainPaths(pair: GlyphPair, holder: RouteHolder): boolean {
  let dropped = false;
  if (pair.path && !hasEditedPath(pair, holder)) {
    delete pair.path;
    dropped = true;
  }
  for (const route of pairRoutes(pair, pair.style ?? holder.style)) {
    if (!plainRoutePath(pair, holder, route)) continue;
    setRoutePath(pair, route, null);
    dropped = true;
  }
  return dropped;
}

/** Whether `dropPlainPaths` would drop anything from the pair (which it leaves as it is). */
export function hasPlainPaths(pair: GlyphPair, holder: RouteHolder): boolean {
  return dropPlainPaths({ ...pair }, holder);
}

/** The route `delta` steps from `route` in the cycle All together → 1 → … → m → All together. */
export function stepRoute(
  choices: readonly RouteRef[],
  route: RouteRef | null,
  delta: 1 | -1,
): RouteRef | null {
  if (choices.length === 0) return null;
  const at = route ? choices.findIndex((r) => sameRoute(r, route)) : -1;
  const count = choices.length + 1;
  // Place 0 is All together, place k the route k − 1.
  const place = (((at + 1 + delta) % count) + count) % count;
  return place === 0 ? null : choices[place - 1]!;
}

/** A route named by its glyphs, as the pair editors name them: "a → x". */
export function routeName(
  route: RouteRef,
  from: FormulaSnapshot | null,
  to: FormulaSnapshot | null,
): string {
  return `${glyphLabel(from, route.from)} → ${glyphLabel(to, route.to)}`;
}

/** What the mode's bar says is being edited: "All 3 routes", or "Route 2 of 3: a → x". */
export function routeTitle(
  choices: readonly RouteRef[],
  route: RouteRef | null,
  from: FormulaSnapshot | null,
  to: FormulaSnapshot | null,
): string {
  if (!route) return `All ${choices.length} routes`;
  const at = choices.findIndex((r) => sameRoute(r, route));
  return `Route ${at + 1} of ${choices.length}: ${routeName(route, from, to)}`;
}

/** The route whose source glyph (`side` 'from') or target glyph ('to') `glyph` is, when it is
 * the glyph of exactly one route; null when it is of none or of several. */
export function routeOfGlyph(
  choices: readonly RouteRef[],
  side: 'from' | 'to',
  glyph: number,
): RouteRef | null {
  const routes = choices.filter((r) => r[side] === glyph);
  return routes.length === 1 ? routes[0]! : null;
}

/** Where a route's curve (a polyline) carries its mark: a third of the way along it, clear of the
 * glyph the morph draws halfway at the playhead, which the mode puts in the middle of the
 * window. */
export function routeMark(curve: readonly Vec2[]): Vec2 {
  return curve[Math.round((curve.length - 1) / 3)] ?? [0, 0];
}

/** A route drawn where it runs: the path it follows laid on its own chord. */
export interface RouteCurve {
  route: RouteRef;
  spline: PathSpline;
  /** Chord coordinates → scene; null when its two ends coincide (nothing is drawn). */
  matrix: Mat2D | null;
}

/** The route whose curve passes within `reach` (scene units) of `point`, the nearest of them;
 * `skip` (the route being edited) is not one. Null for none. */
export function hitRoute(
  curves: readonly RouteCurve[],
  point: Vec2,
  reach: number,
  skip: RouteRef | null,
): RouteRef | null {
  let best: RouteRef | null = null;
  let bestDistance = reach;
  for (const curve of curves) {
    if (!curve.matrix || sameRoute(curve.route, skip)) continue;
    // In the chord's frame: distances there scale with the chord's length.
    const length = Math.hypot(curve.matrix[0], curve.matrix[1]);
    const nearest = nearestPoint(curve.spline, applyToPoint(invert(curve.matrix), point));
    const distance = nearest.distance * length;
    if (distance <= bestDistance) {
      best = curve.route;
      bestDistance = distance;
    }
  }
  return best;
}

// --- The pair's glyphs, drawn faintly --------------------------------------------------------

/** The prefix of the key of a glyph the mode draws faintly: a source glyph as the window starts
 * (`from`), a target glyph as it ends (`to`), or a source glyph as it ends, when the targets are
 * not drawn then (`from-end`). */
type GhostTag = 'from' | 'to' | 'from-end';

/** The side of the pair a faint glyph of the mode is a glyph of, and which, from its key; null
 * for any other drawable. */
export function ghostGlyph(d: Drawable): { side: 'from' | 'to'; glyph: number } | null {
  const tag = /^ghost:(from|to|from-end):/.exec(d.key)?.[1] as GhostTag | undefined;
  if (!tag) return null;
  return { side: tag === 'to' ? 'to' : 'from', glyph: d.glyph };
}

/** The pair's glyphs as its window starts and as it ends, at `opacity` of their paint and under
 * the scene, for reference: the sources at the start, and the targets at the end — the sources
 * there when the targets are not drawn. Keys tell them apart (`ghostGlyph`). */
export function pairGhosts(
  evaluator: SceneEvaluator,
  window: { start: number; end: number; fromClipId: string; toClipId: string },
  pair: Pick<GlyphPair, 'from' | 'to'>,
  opacity: number,
): Drawable[] {
  const fade = <P extends { opacity: number }>(paint: P | null) =>
    paint && { ...paint, opacity: paint.opacity * opacity };
  const side = (t: number, clipId: string, glyphs: readonly number[], tag: GhostTag) => {
    const wanted = new Set(glyphs);
    return evaluator
      .evaluate(t)
      .filter((d) => d.clipId === clipId && wanted.has(d.glyph))
      .map((d) => ({
        ...d,
        key: `ghost:${tag}:${d.key}`,
        z: -1,
        fill: fade(d.fill),
        stroke: fade(d.stroke),
      }));
  };
  const end = Math.max(window.start, window.end - 1e-6);
  const arrived = side(window.end, window.toClipId, pair.to, 'to');
  return [
    ...side(window.start, window.fromClipId, pair.from, 'from'),
    ...(arrived.length > 0 ? arrived : side(end, window.fromClipId, pair.from, 'from-end')),
  ];
}
