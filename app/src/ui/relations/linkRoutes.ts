/* The links of the drawing that links glyphs (GlyphLinkCanvas.tsx), from the marks of the sources
 * of each pair to the marks of its targets: the lines of the sources go to a junction, and from
 * there on the targets, which they reach from above. The badge of the pair is at the junction,
 * or beside it. The badges are the screen's (CSS pixels), so where the links go depends on the
 * scale the drawing has: a badge is never under another.
 *
 * Stacked, the lines of the sources come down to a junction in the gap between the two formulas.
 * The junctions are on rows across the gap. Each pair has a row of its own while the gap holds
 * them — the links stay apart —, eight at most, and a row is never nearer to the next than a badge
 * is high. Where pairs share a row, a pair moves to another row rather than lay its badge on a
 * badge that is there; and the badges of a row that still meet (a tall formula drawn small has a
 * gap of one row) move apart sideways, their junctions with them, as little as it takes.
 *
 * Side by side, a link is an arc over the two formulas: the lines go up from the sources to a
 * junction over the highest glyph of the pair, and come down on the targets. Each pair is at its
 * own height — a pair of the third line arcs over the third line —, and arcs that would run along
 * each other are one over another, the first the lowest. They are nearer than a badge is high, so
 * the badge of an arc that would lie on another's is put beside its junction, on the flat of the
 * arc. Pure. */
import type { Box, Vec2 } from '../../geom';
import type { LinkFrame } from './linkLayout';

// What is the screen's, in CSS pixels.
/** The size of the text of a pair's badge; its box is `BADGE_HEIGHT` of it high. */
export const BADGE_FONT_PX = 11;
const BADGE_HEIGHT = 1.4;
/** How far from the mark of its source a link starts, and from its target's the arrow ends. */
const LINK_START_PX = 1;
const LINK_END_PX = 2;
/** What two badges leave between them, each way. */
const BADGE_GAP_PX = 2;
/** The least a junction keeps from the edge of the gap: half a badge and a little more. */
const ROW_MARGIN_PX = 11;

/** The most rows of junctions a gap has. */
const MAX_ROWS = 8;
/** Side by side: how far over the marks it joins the lowest arc turns, and each arc over the
 * arc under it; and the most arcs one over another. */
const ARC_BASE_PX = 22;
const ARC_STEP_PX = 9;
const MAX_ARCS = 10;

/** The width of a badge with this text, in CSS pixels. */
export const badgeWidthPx = (text: string): number => BADGE_FONT_PX * (0.62 * text.length + 0.9);
/** The height of a badge, in CSS pixels. */
export const BADGE_HEIGHT_PX = BADGE_FONT_PX * BADGE_HEIGHT;

/** What a link joins. */
export interface LinkEnds {
  /** The marks of the sources and of the targets of the pair that the drawing has, in the
   * drawing's coordinates. A side without any: the pair is not drawn. */
  sources: readonly Box[];
  targets: readonly Box[];
  /** The width of its badge in CSS pixels; 0 for a link without one (a suggested pair). */
  badgePx: number;
}

/** A link as it is drawn, in the drawing's coordinates (y up). */
export interface LinkRoute {
  /** Where the lines of the sources meet. */
  junction: Vec2;
  /** The centre of the badge: the junction, or beside it. */
  badge: Vec2;
  /** Where the line of each source starts: under its mark (stacked), over it (side by side). */
  starts: Vec2[];
  /** Where the arrow on each target ends, over its mark. */
  ends: Vec2[];
}

const centreX = (box: Box): number => (box.minX + box.maxX) / 2;
const mean = (values: readonly number[]): number =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/** The routes of `links`, one per link in its order (null for one that is not drawn), in a
 * drawing laid out as `frame` where a CSS pixel measures `px` units. */
export function linkRoutes(
  frame: LinkFrame,
  links: readonly LinkEnds[],
  px: number,
): (LinkRoute | null)[] {
  return frame.layout === 'side' ? arcRoutes(links, px) : gapRoutes(frame, links, px);
}

/** Stacked: through the gap. */
function gapRoutes(frame: LinkFrame, links: readonly LinkEnds[], px: number): (LinkRoute | null)[] {
  const gap = frame.gapTop - frame.gapBottom;
  const margin = Math.min(gap / 2, Math.max(frame.unit * 0.7, ROW_MARGIN_PX * px));
  const span = gap - 2 * margin;
  const step = (BADGE_HEIGHT_PX + BADGE_GAP_PX) * px;
  const rows = Math.max(1, Math.min(links.length, MAX_ROWS, Math.floor(span / step)));
  /** The badges of each row: where each is, and how wide. */
  const taken: { x: number; width: number; index: number }[][] = Array.from(
    { length: rows },
    () => [],
  );
  const free = (row: number, x: number, width: number): boolean =>
    taken[row]!.every(
      (other) => Math.abs(other.x - x) >= (other.width + width) / 2 + BADGE_GAP_PX * px,
    );

  const routes = links.map((link, index): LinkRoute | null => {
    if (link.sources.length === 0 || link.targets.length === 0) return null;
    const sx = link.sources.map(centreX);
    const tx = link.targets.map(centreX);
    const jx = (mean(sx) + mean(tx)) / 2;
    const width = link.badgePx * px;
    // Its own row; with a badge that would lie on another there, the next row that has room.
    const own = index % rows;
    let row = own;
    if (width > 0) {
      for (let k = 0; k < rows; k++) {
        const candidate = (own + k) % rows;
        if (free(candidate, jx, width)) {
          row = candidate;
          break;
        }
      }
      taken[row]!.push({ x: jx, width, index });
    }
    const jy = frame.gapTop - margin - span * ((row + 0.5) / rows);
    return {
      junction: [jx, jy],
      badge: [jx, jy],
      starts: link.sources.map((box, i) => [sx[i]!, box.minY - LINK_START_PX * px]),
      ends: link.targets.map((box, i) => [tx[i]!, box.maxY + LINK_END_PX * px]),
    };
  });
  // The badges of a row that meet move apart, each junction with its badge.
  for (const row of taken) {
    const placed = apart(row, BADGE_GAP_PX * px, frame.left, frame.right);
    row.forEach((badge, i) => {
      const route = routes[badge.index]!;
      route.junction[0] = placed[i]!;
      route.badge[0] = placed[i]!;
    });
  }
  return routes;
}

/** Side by side: arcs over the formulas. */
function arcRoutes(links: readonly LinkEnds[], px: number): (LinkRoute | null)[] {
  const step = ARC_STEP_PX * px;
  const room = BADGE_GAP_PX * px;
  /** The arcs drawn so far: what they span, and how high they turn. */
  const arcs: { from: number; to: number; y: number }[] = [];
  const badges: Box[] = [];
  return links.map((link, index): LinkRoute | null => {
    if (link.sources.length === 0 || link.targets.length === 0) return null;
    const sx = link.sources.map(centreX);
    const tx = link.targets.map(centreX);
    const jx = (mean(sx) + mean(tx)) / 2;
    const from = Math.min(...sx, ...tx);
    const to = Math.max(...sx, ...tx);
    const top = Math.max(...[...link.sources, ...link.targets].map((box) => box.maxY));
    // The lowest height at which it runs along no arc that is there.
    const height = (slot: number) => top + (ARC_BASE_PX + ARC_STEP_PX * slot) * px;
    const clear = (y: number) =>
      arcs.every((arc) => arc.to < from || arc.from > to || Math.abs(arc.y - y) >= step * 0.999);
    let slot = 0;
    while (slot < MAX_ARCS && !clear(height(slot))) slot += 1;
    if (slot === MAX_ARCS) slot = index % MAX_ARCS;
    const jy = height(slot);
    arcs.push({ from, to, y: jy });
    // Its badge at the junction, or as near beside it as the badges that are there leave room.
    let bx = jx;
    const width = link.badgePx * px;
    if (width > 0) {
      const half = (BADGE_HEIGHT_PX * px) / 2;
      const at = (x: number): Box => ({
        minX: x - width / 2,
        maxX: x + width / 2,
        minY: jy - half,
        maxY: jy + half,
      });
      const free = (box: Box) =>
        badges.every(
          (other) =>
            box.minX >= other.maxX + room ||
            box.maxX <= other.minX - room ||
            box.minY >= other.maxY + room ||
            box.maxY <= other.minY - room,
        );
      for (const k of [0, 1, -1, 2, -2, 3, -3]) {
        const x = jx + k * (width + room);
        if (free(at(x))) {
          bx = x;
          break;
        }
      }
      badges.push(at(bx));
    }
    return {
      junction: [jx, jy],
      badge: [bx, jy],
      starts: link.sources.map((box, i) => [sx[i]!, box.maxY + LINK_START_PX * px]),
      ends: link.targets.map((box, i) => [tx[i]!, box.maxY + LINK_END_PX * px]),
    };
  });
}

/** Where to put the centres of segments that are `width` long about `x` so that none is nearer
 * than `gap` to another, each as near to its `x` as the others allow, in the order of their `x`
 * (the answer is in the order given). Those that meet form a run, which is put where its
 * segments are the least moved together; a run stays between `left` and `right` while it fits,
 * and is centred there when it does not. */
export function apart(
  segments: readonly { x: number; width: number }[],
  gap: number,
  left: number,
  right: number,
): number[] {
  interface Run {
    /** The indices of its segments, in order. */
    items: number[];
    start: number;
    length: number;
  }
  const order = segments.map((_, i) => i).sort((a, b) => segments[a]!.x - segments[b]!.x);
  /** The start of a run whose segments are the least moved together, within the bounds. */
  const place = (items: number[], length: number): number => {
    let offset = 0;
    let sum = 0;
    for (const i of items) {
      const { x, width } = segments[i]!;
      sum += x - width / 2 - offset;
      offset += width + gap;
    }
    const start = sum / items.length;
    if (length > right - left) return (left + right - length) / 2;
    return Math.min(Math.max(start, left), right - length);
  };
  const runs: Run[] = [];
  for (const i of order) {
    const { x, width } = segments[i]!;
    let run: Run = { items: [i], start: x - width / 2, length: width };
    run.start = place(run.items, run.length);
    while (runs.length > 0) {
      const before = runs[runs.length - 1]!;
      if (before.start + before.length + gap <= run.start) break;
      runs.pop();
      const items = [...before.items, ...run.items];
      const length = before.length + gap + run.length;
      run = { items, length, start: place(items, length) };
    }
    runs.push(run);
  }
  const out = new Array<number>(segments.length);
  for (const run of runs) {
    let at = run.start;
    for (const i of run.items) {
      const { width } = segments[i]!;
      out[i] = at + width / 2;
      at += width + gap;
    }
  }
  return out;
}

/** A route as SVG path data (y up: for a group flipped upright): a line from each source to the
 * junction, then one from the junction to each target. */
export function routePaths(route: LinkRoute, digits = 4): string[] {
  const f = (n: number) => +n.toFixed(digits);
  const [jx, jy] = route.junction;
  return [
    ...route.starts.map(([x, y]) => `M${f(x)} ${f(y)} Q${f(x)} ${f(jy)} ${f(jx)} ${f(jy)}`),
    ...route.ends.map(([x, y]) => `M${f(jx)} ${f(jy)} Q${f(x)} ${f(jy)} ${f(x)} ${f(y)}`),
  ];
}
