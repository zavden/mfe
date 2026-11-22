/* Frame-by-frame comparison of what Manim drew (probe.py) with what the evaluator draws.
 *
 * Each frame is reduced to a multiset of "looks": geometric bounding box, path length and area
 * (curves sampled alike on both sides, so cubic and quadratic paths compare alike), fill RGBA,
 * stroke RGBA and width. The two multisets are matched with a minimum-cost assignment; a pair
 * matches when every channel is within its tolerance (TOLERANCE): per drawable, since one the
 * preview marks `partial` (an outline being traced, a glyph being created: where the cut lands
 * differs by a few hundredths between the preview and ManimGL) gets the looser box, length and
 * area tolerances, and per library, since ManimGL draws its quadratic approximations of the
 * glyphs' cubics and aligns morphs with its own tie-breaking. Invisible things (no fill, no
 * stroke, or degenerate to a point) are left out on both sides, as neither the preview nor
 * Manim's video shows them. */
import { hungarian } from "../../app/src/engine/hungarian";
import { parseColor } from "../../app/src/geom";
import type { Drawable } from "../../app/src/scene";

export interface ProbeItem {
  box: [number, number, number, number];
  /** Length of the drawn subpaths and the area they enclose, sampled (probe.py). */
  length: number;
  area: number;
  fill: [number, number, number, number];
  stroke: [number, number, number, number];
  width: number;
  z: number;
  /** Python id() of the mobject. */
  id: number;
  /** The mobject's class, for the failure reports. */
  cls: string;
}

export interface ProbeFile {
  lib: "ce" | "gl";
  fps: number;
  frames: ProbeItem[][];
  /** The frame each frame of the video was filmed through: the centre and the height of the
   * camera's frame, in scene units (probe.py). */
  cameras: [number, number, number][];
}

/** How far the frame Manim filmed a frame through may be from the scene camera's frame of that
 * instant, in scene units, in its centre and in its height. Measured on the camera cases: ManimCE
 * within 2e-7, ManimGL — whose frames show the end of their interval, compared at its left limit,
 * 1e-5 s earlier — within 2.3e-4 on the fastest move. */
export const CAMERA_TOLERANCE = 0.002;

/** The largest difference between the frame Manim filmed through and the expected one. */
export function cameraDeviation(
  filmed: readonly [number, number, number],
  expected: { center: readonly [number, number]; height: number },
): number {
  return Math.max(
    Math.abs(filmed[0] - expected.center[0]),
    Math.abs(filmed[1] - expected.center[1]),
    Math.abs(filmed[2] - expected.height),
  );
}

export interface Look {
  box: [number, number, number, number];
  length: number;
  area: number;
  fill: [number, number, number, number];
  stroke: [number, number, number, number];
  width: number;
  /** The preview's: the path is a cut of the glyph's (`Drawable.partial`), and the drawable's key
   * for the failure reports. */
  partial?: boolean;
  key?: string;
  /** Manim's: the mobject's class. */
  cls?: string;
}

/** Per-channel tolerances. Box: scene units (a 48-pt glyph is ≈ 0.3–0.5 units, the frame 8);
 * colours: 0…1 per component (8-bit hex rounding is 0.002); opacity 0…1; stroke width: Manim
 * stroke_width units; length and area: a share of the larger of the two (per library) plus a
 * floor in scene units (and square units), the floor of a partial path (`cut`) allowing for
 * where its cut lands. Measured on the whole suite: ManimCE matches exactly on every channel;
 * ManimGL's partial outlines land within 0.06 units of length and 0.007 of area, its morph
 * pieces within 5 % — but a thin fraction bar being morphed, whose intermediate shape depends on
 * which of its equal sides ManimGL chooses to split, within 0.006 of area. */
export const TOLERANCE = {
  box: 0.02,
  /** Partial paths: outlines being traced (Write / DrawBorderThenFill first half) and glyphs
   * being created or uncreated. The preview cuts the path as each library does, but ManimGL cuts
   * the quadratics it stores, each an approximation of a cubic of the glyph, so the cut point
   * may differ by a few hundredths (ARCHITECTURE §6); the length and the area pin it down. */
  partialBox: 0.08,
  /** ManimGL morphs quadratic paths (the preview mirrors its alignment but cuts the longest curves
   * with its own tie-breaking), so morphing glyphs may differ by a little more. */
  glBox: 0.03,
  /** A traced outline shorter than this may appear one frame earlier or later on one side
   * (where tracing starts depends on how each side cuts the path); such looks may stay
   * unmatched and are counted apart, while a tracing runs. */
  tracingExtent: 0.15,
  length: { rel: { ce: 0.03, gl: 0.05 }, abs: { ce: 0.01, gl: 0.01 }, cut: 0.08 },
  area: { rel: { ce: 0.03, gl: 0.05 }, abs: { ce: 0.002, gl: 0.008 }, cut: 0.02 },
  color: 0.02,
  opacity: 0.03,
  width: 0.15,
};

const SAMPLES = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

interface Geometry {
  box: Look["box"];
  length: number;
  area: number;
}

/** Box, length and area of cubic contours, sampled as probe.py samples Manim's curves: nine
 * points per curve, the length as the chords between the samples of each curve, the area as the
 * shoelace of every sample as one polygon (absolute) — so that how the subpaths are split changes
 * nothing (the chords linking closed subpaths cancel out) and a cut path measures the same on
 * both sides. */
function cubicGeometry(
  contours: readonly (readonly number[])[],
): Geometry | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let length = 0;
  const xs: number[] = [];
  const ys: number[] = [];
  for (const c of contours) {
    if (c.length < 2) continue;
    if (c.length === 2) {
      xs.push(c[0]!);
      ys.push(c[1]!);
    }
    for (let i = 0; i + 7 < c.length; i += 6) {
      const [x0, y0, x1, y1, x2, y2, x3, y3] = c.slice(i, i + 8) as [
        number,
        number,
        number,
        number,
        number,
        number,
        number,
        number,
      ];
      let px = 0;
      let py = 0;
      SAMPLES.forEach((t, k) => {
        const u = 1 - t;
        const a = u * u * u;
        const b = 3 * u * u * t;
        const cc = 3 * u * t * t;
        const d = t * t * t;
        const x = a * x0 + b * x1 + cc * x2 + d * x3;
        const y = a * y0 + b * y1 + cc * y2 + d * y3;
        if (k > 0) length += Math.hypot(x - px, y - py);
        px = x;
        py = y;
        xs.push(x);
        ys.push(y);
      });
    }
  }
  if (xs.length === 0) return null;
  let twice = 0;
  for (let k = 0; k < xs.length; k++) {
    const x = xs[k]!;
    const y = ys[k]!;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    const j = (k + 1) % xs.length;
    twice += x * ys[j]! - xs[j]! * y;
  }
  return { box: [minX, minY, maxX, maxY], length, area: Math.abs(twice) / 2 };
}

export function lookOfDrawable(d: Drawable): Look | null {
  const geometry = cubicGeometry(d.path.contours);
  if (!geometry) return null;
  const fill = d.fill
    ? [...parseColor(d.fill.color), d.fill.opacity]
    : [0, 0, 0, 0];
  const stroke = d.stroke
    ? [...parseColor(d.stroke.color), d.stroke.opacity]
    : [0, 0, 0, 0];
  return {
    ...geometry,
    fill: fill as Look["fill"],
    stroke: stroke as Look["stroke"],
    width: d.stroke ? d.stroke.width : 0,
    partial: d.partial,
    key: d.key,
  };
}

/** The classes of Manim's lines: a line, an arrow's shaft, and the dashes of a dashed line (each
 * a copy of the line it was cut from). */
const LINE_CLASSES = new Set(["Line", "DashedLine", "Arrow", "DoubleArrow"]);

export function lookOfProbe(p: ProbeItem): Look {
  // `set_opacity` gives a line a fill opacity along with its stroke's, and a Transform of its
  // opacity carries it on. A straight line encloses nothing, so that fill paints nothing: it is
  // read as none, which is what the preview holds for a stroke.
  const noInside = LINE_CLASSES.has(p.cls ?? "") && p.area < 1e-6;
  return {
    box: p.box,
    length: p.length,
    area: p.area,
    fill: noInside ? [p.fill[0]!, p.fill[1]!, p.fill[2]!, 0] : p.fill,
    stroke: p.stroke,
    width: p.width,
    cls: p.cls,
  };
}

export function visible(l: Look): boolean {
  const extent = Math.max(l.box[2] - l.box[0], l.box[3] - l.box[1]);
  if (extent < 1e-3) return false;
  // The first stretch of an outline being traced: where it starts showing depends on how each
  // side cuts the path (see partialBox).
  if (l.fill[3] <= 0.01 && extent < TOLERANCE.partialBox) return false;
  return l.fill[3] > 0.01 || (l.stroke[3] > 0.01 && l.width > 0.05);
}

export type Channel =
  | "box"
  | "length"
  | "area"
  | "fill"
  | "opacity"
  | "stroke"
  | "width";

export interface Deviation {
  cost: number;
  channel: Channel;
}

/** Every channel's deviation as a multiple of its tolerance: `a` is Manim's look, `b` the
 * preview's (whose `partial` chooses the box tolerance). */
export function deviations(
  a: Look,
  b: Look,
  lib: "ce" | "gl" = "ce",
): Record<Channel, number> {
  const boxTolerance = b.partial
    ? TOLERANCE.partialBox
    : lib === "gl"
      ? TOLERANCE.glBox
      : TOLERANCE.box;
  const out: Record<Channel, number> = {
    box:
      Math.max(...a.box.map((v, i) => Math.abs(v - b.box[i]!))) / boxTolerance,
    // A path flattened onto a line (a glyph halfway through a flip) has no area, and the chords
    // between the samples of a folded path miss its reversals differently on each side: its box
    // says everything then.
    length:
      a.area < 1e-6 && b.area < 1e-6
        ? 0
        : Math.abs(a.length - b.length) /
          ((b.partial ? TOLERANCE.length.cut : TOLERANCE.length.abs[lib]) +
            TOLERANCE.length.rel[lib] * Math.max(a.length, b.length)),
    area:
      Math.abs(a.area - b.area) /
      ((b.partial ? TOLERANCE.area.cut : TOLERANCE.area.abs[lib]) +
        TOLERANCE.area.rel[lib] * Math.max(a.area, b.area)),
    opacity: Math.abs(a.fill[3] - b.fill[3]) / TOLERANCE.opacity,
    fill: 0,
    stroke: 0,
    width: 0,
  };
  if (a.fill[3] > 0.05 && b.fill[3] > 0.05) {
    out.fill =
      Math.max(...[0, 1, 2].map((i) => Math.abs(a.fill[i]! - b.fill[i]!))) /
      TOLERANCE.color;
  }
  const wa = a.stroke[3] > 0.01 ? a.width : 0;
  const wb = b.stroke[3] > 0.01 ? b.width : 0;
  out.width = Math.abs(wa - wb) / TOLERANCE.width;
  if (wa > 0.05 && wb > 0.05) {
    out.stroke = Math.max(
      ...[0, 1, 2].map(
        (i) => Math.abs(a.stroke[i]! - b.stroke[i]!) / TOLERANCE.color,
      ),
      Math.abs(a.stroke[3] - b.stroke[3]) / TOLERANCE.opacity,
    );
  }
  return out;
}

/** The worst channel of `deviations`. */
export function deviation(
  a: Look,
  b: Look,
  lib: "ce" | "gl" = "ce",
): Deviation {
  let worst: Deviation = { cost: 0, channel: "box" };
  for (const [channel, cost] of Object.entries(deviations(a, b, lib))) {
    if (cost > worst.cost) worst = { cost, channel: channel as Channel };
  }
  return worst;
}

export interface FrameResult {
  /** Every look matched within tolerance; unmatched short traced outlines are allowed. */
  ok: boolean;
  /** Matched pairs over tolerance. */
  mismatches: number;
  /** Unmatched looks of the preview / of Manim that are not short traced outlines. */
  missing: number;
  extra: number;
  /** Unmatched traced outlines (stroke only, shorter than TOLERANCE.tracingExtent) while a
   * tracing runs in the frame. */
  tracing: number;
  worst: Deviation;
  /** The largest deviation of every channel among the matched pairs. */
  channels: Record<Channel, number>;
  manim: Look[];
  preview: Look[];
  duplicates: number;
}

/** Drop a mobject painted twice in the same state (ManimCE paints a frozen frame's mobjects
 * over the static image of themselves). Distinct mobjects in the same place stay. */
function unique(items: ProbeItem[]): {
  items: ProbeItem[];
  duplicates: number;
} {
  const seen = new Set<string>();
  const out: ProbeItem[] = [];
  for (const item of items) {
    const key = JSON.stringify(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return { items: out, duplicates: items.length - out.length };
}

/** A short outline being traced: the preview's by its own word, Manim's by having no fill
 * while something in the frame is being traced (Manim does not say). */
function shortTracing(l: Look, tracing: boolean): boolean {
  const extent = Math.max(l.box[2] - l.box[0], l.box[3] - l.box[1]);
  const cut = l.partial ?? (tracing && l.fill[3] <= 0.01);
  return cut && extent < TOLERANCE.tracingExtent;
}

export const NO_DEVIATION: Record<Channel, number> = {
  box: 0,
  length: 0,
  area: 0,
  fill: 0,
  opacity: 0,
  stroke: 0,
  width: 0,
};

export function compareFrame(
  manimItems: ProbeItem[],
  drawables: Drawable[],
  lib: "ce" | "gl",
): FrameResult {
  const { items, duplicates } = unique(manimItems);
  const manim = items.map(lookOfProbe).filter(visible);
  const preview = drawables
    .flatMap((d) => lookOfDrawable(d) ?? [])
    .filter(visible);
  let worst: Deviation = { cost: 0, channel: "box" };
  const channels: Record<Channel, number> = { ...NO_DEVIATION };
  let mismatches = 0;
  const matchedManim = new Set<number>();
  const matchedPreview = new Set<number>();
  if (manim.length > 0 && preview.length > 0) {
    const cost = manim.map((m) =>
      preview.map((p) => deviation(m, p, lib).cost),
    );
    const { assignment } = hungarian(cost);
    assignment.forEach((j, i) => {
      if (j < 0) return;
      matchedManim.add(i);
      matchedPreview.add(j);
      const all = deviations(manim[i]!, preview[j]!, lib);
      for (const [channel, value] of Object.entries(all)) {
        const key = channel as Channel;
        if (value > channels[key]) channels[key] = value;
        if (value > worst.cost) worst = { cost: value, channel: key };
      }
      if (Math.max(...Object.values(all)) > 1) mismatches++;
    });
  }
  // Something is being traced in the frame (the preview's own word, before the short first
  // stretch of an outline is dropped as invisible).
  const tracingRuns = drawables.some((d) => d.partial);
  let tracing = 0;
  let extra = 0;
  let missing = 0;
  manim.forEach((l, i) => {
    if (matchedManim.has(i)) return;
    if (shortTracing(l, tracingRuns)) tracing++;
    else extra++;
  });
  preview.forEach((l, j) => {
    if (matchedPreview.has(j)) return;
    if (shortTracing(l, tracingRuns)) tracing++;
    else missing++;
  });
  return {
    ok: mismatches === 0 && missing === 0 && extra === 0,
    mismatches,
    missing,
    extra,
    tracing,
    worst,
    channels,
    manim,
    preview,
    duplicates,
  };
}
