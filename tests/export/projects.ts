/* Synthetic projects for the export validation suite. Together they cover every intro and outro
 * kind, every tween channel (position, scale, rotation, flips, opacity, clip and glyph colours,
 * an easing that ends where it started), every relation style with and without a path arc,
 * one-to-many and many-to-one pairs, overlapping events (slices and `_Part`), an instantaneous
 * intro and outro inside an overlap, a clip partly consumed before a tween, a glyph that arrives
 * after its clip moved, a hidden track, hidden glyphs (one a relation brings in, one that leaves
 * through a relation without ever having been shown, one never shown at all), packages and a
 * preamble, a non-16:9 frame, a trailing wait, and times off the frame grid. Animation blocks:
 * every appear kind on hidden glyphs (one next to the intro, overlapping ones on different
 * glyphs, one after a tween), every disappear kind on a part, glyphs that leave and come back
 * (restoring removers) or not, a tween while glyphs are away, blocks during a relation on other
 * glyphs, a glyph that appears during the outro and leaves with the clip end, a
 * quadratic-like derivation, and blocks that run at the same time on different glyphs (two Writes
 * at once with a part transform beside them, a Disappear with an Appear, two that overlap in
 * part). Several sources onto one target: arriving separately, merged as Manim aligns them, and as
 * copies, in a relation and in a Morph block. Fraction bars (SVG rects) written, unwritten, created and morphed.
 * Part transforms: shifts, scales, rotations, colour and opacity on a few glyphs, before a tween
 * of the whole formula, off screen, and beside a relation. An outline traced after a tween that
 * turned the formula changed its opacity or colour (the stroke arrives where the fill does).
 * Morph blocks: a multi-line derivation
 * written row by row (copies, a chain, one beside an Appear block, a relation from another clip
 * into a row), a block that consumes, copies and fades at once with a path arc, played in parts,
 * a consuming block during the outro whose target leaves at the clip end, and two blocks copying
 * one source at once on a back track, sliced under a front clip. Custom paths (splines): curved
 * pairs of every style, a straight two-node path beside an arc (which it ignores), a pair that
 * keeps the arc, one-to-many and many-to-one pairs (one chord per submobject) and a morph
 * block, with a smooth node and a corner. A clip that starts empty: its intro draws nothing, a
 * relation, an Appear block and a Morph block bring glyphs in, one never shows. Two clips with
 * three relations, two of them at once on different glyphs. A clip split at the playhead: its
 * second half starts, without an intro, as the first ends. The marks of the Slides mode: pauses
 * and comments in the middle of waits, on the edges of plays, after an instant, at 0 s, at the end,
 * around camera moves, and some out of place. Times are multiples of the frame length unless the
 * project is about snapping. */
import {
  type MathFormula,
  createAppear,
  createAttach,
  createBraceAttach,
  createBraceFormula,
  createClip,
  createDisappear,
  createEmphasis,
  createMorph,
  createPartTransform,
  createEmptyProject,
  createEndsAttach,
  createEndsTween,
  createFormula,
  createLineFormula,
  createRelation,
  createFitTween,
  createShapeAttach,
  createShapeFormula,
  createTexFormula,
  createTextFormula,
  createTipAttach,
  createTrack,
  createTween,
  DEFAULT_TEXT_LAYOUT,
  defaultIntro,
  defaultOutro,
  remapGlyphRefs,
  type Clip,
  type BraceFormula,
  type ClipAction,
  type ClipAttach,
  type ClipState,
  type Formula,
  type IntroKind,
  type IntroSpec,
  type LineCurve,
  type LineFormula,
  type OutroKind,
  type OutroSpec,
  type PathSpline,
  type Project,
  type Relation,
  type ShapeFormula,
  type TexFormula,
  type TextLayout,
  type Track,
} from "../../app/src/model";
import { geometryCases } from "./geometryCases";

export interface ExportCase {
  name: string;
  project: Project;
  /** Compare every frame with the evaluator (false: run and count frames only). */
  probe: boolean;
  /** Also run with MathJax snapshots, through the positional helper (`_glyphs`). */
  mathjax?: boolean;
  /** Also compare the frame at `t` pixel by pixel with the preview renderer's, in both
   * libraries (the project is made a few dozen pixels per glyph tall for it). */
  pixels?: { t: number };
}

type Spec<K extends string> = Partial<Omit<IntroSpec, "kind">> & { kind: K };

function intro(spec: Spec<IntroKind>): IntroSpec {
  return { ...defaultIntro(spec.kind), ...spec };
}
function outro(spec: Spec<OutroKind>): OutroSpec {
  return { ...defaultOutro(spec.kind), ...spec } as OutroSpec;
}

class Builder {
  readonly project: Project;
  constructor(name: string, meta: Partial<Project["meta"]> = {}) {
    this.project = createEmptyProject(name);
    this.project.tracks = [];
    Object.assign(
      this.project.meta,
      { width: 480, height: 270, fps: 30 },
      meta,
    );
  }
  track(name: string, hidden = false): Track {
    const t = { ...createTrack(name), hidden };
    this.project.tracks.push(t);
    return t;
  }
  formula(name: string, latex: string, fields: Partial<MathFormula> = {}): Formula {
    const f = createFormula({ name, source: latex, ...fields });
    this.project.formulas.push(f);
    return f;
  }
  /** A brace (`brace`), fitted to its target by the settle before the export. */
  brace(name: string, fields: Partial<BraceFormula> = {}): Formula {
    const f = createBraceFormula({ name, ...fields });
    this.project.formulas.push(f);
    return f;
  }
  /** A shape (`shape`), a box unless told otherwise, fitted to its target by the settle. */
  shape(name: string, fields: Partial<ShapeFormula> = {}): Formula {
    const f = createShapeFormula({ name, ...fields });
    this.project.formulas.push(f);
    return f;
  }
  /** A line (`line`), a plain one unless told otherwise; with an end on glyphs, the settle fits
   * its vector. */
  line(name: string, fields: Partial<LineFormula> = {}): Formula {
    const f = createLineFormula({ name, ...fields });
    this.project.formulas.push(f);
    return f;
  }
  /** A LaTeX text (`tex`) with its layout. */
  text(
    name: string,
    source: string,
    layout: Partial<TextLayout> = {},
    fields: Partial<TexFormula> = {},
  ): Formula {
    const f = createTexFormula({
      name,
      source,
      layout: { ...DEFAULT_TEXT_LAYOUT, ...layout },
      ...fields,
    });
    this.project.formulas.push(f);
    return f;
  }
  clip(
    f: Formula,
    t: Track,
    start: number,
    end: number,
    fields: {
      intro?: IntroSpec;
      outro?: OutroSpec;
      initial?: Partial<ClipState>;
      actions?: ClipAction[];
      attach?: ClipAttach;
    } = {},
  ): Clip {
    const c = createClip(f.id, t.id, start, end, {
      intro: fields.intro ?? intro({ kind: "none", duration: 0 }),
      outro: fields.outro ?? outro({ kind: "none", duration: 0 }),
      actions: fields.actions ?? [],
      attach: fields.attach ?? null,
    });
    c.initial = { ...c.initial, ...fields.initial };
    this.project.clips.push(c);
    return c;
  }
  relation(from: Clip, to: Clip, fields: Partial<Relation>): Relation {
    const r = createRelation(from.id, to.id, fields);
    this.project.relations.push(r);
    return r;
  }
}

const RED = "#FC6255";
const BLUE = "#58C4DD";
const GREEN = "#83C167";
const YELLOW = "#FFFF00";

function introsOutros(): Project {
  const b = new Builder("Intros and outros");
  const t1 = b.track("Front");
  const t2 = b.track("Back");
  const f1 = b.formula("circle", "x^2+y^2=r^2", {
    color: BLUE,
    glyphColors: { "0": YELLOW },
  });
  const f2 = b.formula("sum", "a+b", { fontSize: 60 });
  const f3 = b.formula("half", "\\frac{1}{2}");
  const f4 = b.formula("euler", "e^{i\\pi}");
  const f5 = b.formula("series", "\\sum_{k=1}^n k");
  b.clip(f1, t1, 0, 2, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "unwrite", duration: 0.6 }),
  });
  b.clip(f2, t2, 0.5, 2.5, {
    intro: intro({
      kind: "fade_in",
      duration: 1,
      shift: [0.5, -1],
      scale: 1.5,
    }),
    outro: outro({
      kind: "fade_out",
      duration: 0.8,
      shift: [-0.4, 0.7],
      scale: 0.5,
    }),
    initial: { position: [0, -2] },
  });
  b.clip(f3, t1, 2.2, 4, {
    intro: intro({ kind: "grow_from_center", duration: 0.8 }),
    outro: outro({ kind: "shrink_to_center", duration: 0.7 }),
    initial: { position: [-3, 1] },
  });
  b.clip(f4, t2, 2.8, 4.9, {
    intro: intro({
      kind: "draw_border_then_fill",
      duration: 1.2,
      easing: "rush_into",
      lagRatio: 0.25,
    }),
    outro: outro({
      kind: "unwrite",
      duration: 0.8,
      easing: "smooth",
      lagRatio: 0.3,
    }),
    initial: { position: [2, 1], color: GREEN },
  });
  b.clip(f5, t1, 4.2, 6.2, {
    intro: intro({ kind: "create", duration: 1 }),
    outro: outro({ kind: "uncreate", duration: 0.9, easing: "rush_into" }),
  });
  b.clip(f2, t2, 5, 6.6, {
    intro: intro({
      kind: "write",
      duration: 0.9,
      easing: "smooth",
      lagRatio: 0.3,
    }),
    outro: outro({ kind: "uncreate", duration: 0.6 }),
    initial: { position: [3, -2], color: RED, glyphColors: { "1": YELLOW } },
  });
  return b.project;
}

function tweens(): Project {
  const b = new Builder("Tweens");
  const t1 = b.track("Line");
  const t2 = b.track("Integral");
  const f1 = b.formula("line", "y=mx+b", { glyphColors: { "2": YELLOW } });
  const f2 = b.formula("integral", "\\int_0^1 f(x)\\,dx");
  b.clip(f1, t1, 0, 6, {
    actions: [
      createTween(0.3, 0.9, { position: [-2, 1], scale: 1.4 }, "smooth"),
      createTween(1.4, 1, { rotation: 40, flipX: true }, "linear"),
      createTween(2.6, 0.7, { opacity: 0.5, color: GREEN }, "rush_from"),
      createTween(
        3.5,
        0.8,
        { glyphColors: { "0": RED, "3": BLUE }, position: [1, -1] },
        "smooth",
      ),
      createTween(4.5, 0.9, { position: [0, 0] }, "there_and_back"),
      createTween(
        5.5,
        0.4,
        { rotation: 0, flipX: false, flipY: true, scale: 1 },
        "double_smooth",
      ),
    ],
  });
  b.clip(f2, t2, 0.5, 5.5, {
    intro: intro({ kind: "fade_in", duration: 1 }),
    outro: outro({ kind: "fade_out", duration: 1 }),
    initial: {
      position: [3, -2],
      scale: 0.8,
      rotation: -20,
      flipY: true,
      opacity: 0.8,
    },
    actions: [
      createTween(1.5, 1, { position: [2, 2], flipY: false }, "slow_into"),
    ],
  });
  return b.project;
}

function relationStyles(): Project {
  const b = new Builder("Relation styles");
  const t0 = b.track("Top");
  const t1 = b.track("Middle");
  const t2 = b.track("Bottom");
  const f1 = b.formula("sum", "a+b=c");
  const f2 = b.formula("swap", "c=a+b", { glyphColors: { "3": YELLOW } });
  const f3 = b.formula("x", "x", { color: RED });
  const c1 = b.clip(f1, t1, 0, 4, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "fade_out", duration: 1 }),
    initial: { position: [0, 1.5] },
  });
  const c2 = b.clip(f2, t2, 1, 5, {
    intro: intro({ kind: "fade_in", duration: 1 }),
    outro: outro({ kind: "fade_out", duration: 1 }),
    initial: { position: [0, -1] },
  });
  const c3 = b.clip(f3, t0, 2.5, 5, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [3, 0], scale: 2 },
  });
  b.relation(c1, c2, {
    duration: 1,
    pathArc: 90,
    style: "transform",
    pairs: [
      { from: [0], to: [2], style: null },
      { from: [2], to: [4], style: null },
      { from: [4], to: [0], style: "copy" },
      { from: [3], to: [1], style: "fade" },
    ],
  });
  b.relation(c2, c3, {
    duration: 1,
    pathArc: -60,
    style: "fade",
    easing: "linear",
    pairs: [{ from: [3], to: [0], style: null }],
  });
  return b.project;
}

/** Glyphs left out of the intro: they show only when a relation brings them in. */
function hiddenGlyphs(): Project {
  const b = new Builder("Hidden glyphs");
  const t1 = b.track("Front");
  const t2 = b.track("Back");
  const f1 = b.formula("sum", "a+b=c", { hiddenGlyphs: [3, 4] });
  const f2 = b.formula("swap", "c=a+b", {
    hiddenGlyphs: [0, 1, 4],
    color: GREEN,
  });
  // sum writes "a+b" only, then moves (its hidden "=c" moves along off screen).
  const c1 = b.clip(f1, t1, 0, 4, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [0, 1.5] },
    actions: [createTween(1, 0.5, { position: [-1, 1] })],
  });
  // swap fades in "+" only; "c" arrives from sum's never-shown "c", "a" from a copy of sum's
  // "a"; its "=" and "b" never show.
  const c2 = b.clip(f2, t2, 1, 4, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [0, -1] },
  });
  b.relation(c1, c2, {
    offset: 1,
    duration: 1,
    pairs: [
      { from: [0], to: [2], style: "copy" },
      { from: [4], to: [0], style: null },
    ],
  });
  return b.project;
}

function splitsMerges(): Project {
  const b = new Builder("Splits and merges");
  const t1 = b.track("One");
  const t2 = b.track("Two");
  const t3 = b.track("Three");
  const f1 = b.formula("twice", "x+x+y");
  const f2 = b.formula("double", "2x+y");
  const f3 = b.formula("pair", "y\\,y");
  const f4 = b.formula("ones", "1+1");
  const c1 = b.clip(f1, t1, 0, 3, {
    intro: intro({ kind: "write", duration: 1 }),
    initial: { position: [0, 2] },
  });
  const c2 = b.clip(f2, t2, 1, 5, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
  });
  const c3 = b.clip(f3, t3, 2.5, 5, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [3, -2] },
  });
  const c4 = b.clip(f4, t1, 3.2, 5, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [-3, -2] },
  });
  b.relation(c1, c2, {
    duration: 1,
    pairs: [
      { from: [0, 2], to: [1], style: null },
      { from: [1], to: [0], style: null },
      { from: [3], to: [2], style: null },
      { from: [4], to: [3], style: null },
    ],
  });
  b.relation(c2, c3, {
    duration: 1,
    style: "copy",
    pathArc: 45,
    pairs: [{ from: [3], to: [0, 1], style: null }],
  });
  b.relation(c2, c4, {
    offset: 0,
    duration: 0.8,
    easing: "rush_from",
    pairs: [{ from: [0], to: [0, 2], style: null }],
  });
  return b.project;
}

function overlaps(): Project {
  const b = new Builder("Overlaps");
  const t1 = b.track("A");
  const t2 = b.track("B");
  const t3 = b.track("Hidden", true);
  const fa = b.formula("abc", "a+b+c");
  const fb = b.formula("mix", "b-a+c");
  const fz = b.formula("z", "z");
  const fc = b.formula("c", "c", { color: GREEN });
  const ca = b.clip(fa, t1, 0, 5, {
    intro: intro({ kind: "write", duration: 1.5 }),
    outro: outro({ kind: "fade_out", duration: 1 }),
    initial: { position: [0, 1] },
    actions: [createTween(3.2, 0.6, { position: [0, 2.5] }, "smooth")],
  });
  const cb = b.clip(fb, t2, 1.8, 5, {
    intro: intro({ kind: "fade_in", duration: 0.6 }),
    outro: outro({ kind: "fade_out", duration: 0.4 }),
    initial: { position: [0, -1] },
    actions: [
      createTween(1.4, 0.6, { position: [1, -2], scale: 1.2 }, "smooth"),
    ],
  });
  // Instantaneous intro and outro while the A → B relation runs.
  b.clip(fz, t3, 2, 2.7, { initial: { position: [-4, 0] } });
  const cc = b.clip(fc, t3, 3.9, 4.8, { initial: { position: [4, 2] } });
  b.relation(ca, cb, {
    duration: 1.2,
    pairs: [{ from: [0], to: [2], style: null }],
  });
  // Arrives in B after B's tween moved it.
  b.relation(cc, cb, {
    offset: 2.2,
    duration: 0.6,
    pairs: [{ from: [0], to: [4], style: null }],
  });
  return b.project;
}

/** Appear blocks on hidden glyphs: every kind, one beside the intro, two overlapping on
 * different glyphs, and one on a glyph that moved with a tween while hidden. */
function appearBlocks(): Project {
  const b = new Builder("Appear blocks");
  const t1 = b.track("Front");
  const t2 = b.track("Back");
  // a + b + c + d + e: only "a+" is written by the intro.
  const f1 = b.formula("letters", "a+b+c+d+e", {
    color: BLUE,
    hiddenGlyphs: [2, 3, 4, 5, 6, 7, 8],
  });
  const f2 = b.formula("one", "x=1", { hiddenGlyphs: [2] });
  b.clip(f1, t1, 0, 5, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "fade_out", duration: 0.6 }),
    initial: { position: [0, 1] },
    actions: [
      createAppear(0.5, "fade_in", [2], { duration: 0.7 }),
      createAppear(1.4, "create", [3, 4], { duration: 0.8 }),
      createAppear(1.8, "grow_from_center", [5, 6], { duration: 0.8 }),
      createAppear(2.8, "draw_border_then_fill", [7], { duration: 0.8 }),
      createAppear(3, "write", [8], { duration: 0.8, lagRatio: 0.3 }),
    ],
  });
  b.clip(f2, t2, 0.5, 4.5, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [-1, -1.5] },
    actions: [
      createTween(0.6, 0.6, { position: [1, -2], scale: 1.3, color: YELLOW }),
      createAppear(1.6, "fade_in", "all", {
        duration: 0.6,
        shift: [0, 0.5],
        scale: 0.5,
      }),
    ],
  });
  return b.project;
}

/** Blocks that run at the same time on different glyphs: the two sides of an equation written at
 * once while its equals sign shifts (three blocks in one `self.play`), a Disappear with an Appear
 * starting together, and an Appear that starts while a Disappear still runs (sliced into parts). */
function parallelBlocks(): Project {
  const b = new Builder("Parallel blocks");
  const t1 = b.track("Sides");
  const t2 = b.track("Pair");
  // a + b = c + d: only "=" comes with the intro; both sides are written at once later.
  const f1 = b.formula("sides", "a+b=c+d", {
    color: BLUE,
    hiddenGlyphs: [0, 1, 2, 4, 5, 6],
  });
  const f2 = b.formula("pair", "x=y+1", { hiddenGlyphs: [4] });
  b.clip(f1, t1, 0, 5, {
    intro: intro({ kind: "write", duration: 0.6 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [0, 1] },
    actions: [
      createAppear(1, "write", [0, 1, 2], { duration: 1 }),
      createAppear(1, "write", [4, 5, 6], { duration: 1, lagRatio: 0.4 }),
      createPartTransform(1, [3], {
        duration: 1,
        shift: [0, 0.4],
        color: YELLOW,
      }),
      createDisappear(3, "unwrite", [0, 1, 2], { duration: 0.8 }),
      createDisappear(3, "fade_out", [4, 5, 6], {
        duration: 0.8,
        shift: [0.5, 0],
      }),
    ],
  });
  b.clip(f2, t2, 0.5, 4.5, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [0, -1.5] },
    actions: [
      createDisappear(1, "fade_out", [0], { duration: 0.7 }),
      createAppear(1, "write", [4], { duration: 0.7 }),
      createDisappear(2.2, "uncreate", [2], { duration: 0.8 }),
      createAppear(2.6, "fade_in", [0], { duration: 0.6, shift: [-0.5, 0] }),
    ],
  });
  return b.project;
}

/** Several sources onto one target (D54): the two "2"s of x²+y² become the one "2" of z² —
 * separately, the default (both arrive); fused as Manim aligns the groups (the second fades into
 * an invisible copy); and as copies (the first transforms, the second sends a copy and stays until
 * its clip's outro); plus a Morph block whose pair copies its extra source within the formula. */
function manyToOne(): Project {
  const b = new Builder("Many to one");
  const t1 = b.track("Sources");
  const t2 = b.track("Targets");
  const t3 = b.track("More");
  const squares = b.formula("squares", "x^2+y^2"); // x 2 + y 2
  const square = b.formula("square", "z^2"); // z 2
  const sum = b.formula("sum", "a+a");
  const one = b.formula("one", "a");
  const twice = b.formula("twice", "m+m");
  const once = b.formula("once", "m");
  const ones = b.formula("ones", "1+1=2", { hiddenGlyphs: [4] }); // 1 + 1 = 2
  // Separate (the default): over [1.5, 2.5) x → z and both 2s → the 2.
  const c1 = b.clip(squares, t1, 0, 2.5, {
    intro: intro({ kind: "write", duration: 0.8 }),
    initial: { position: [-3, 1.5] },
  });
  const c2 = b.clip(square, t2, 1.5, 4, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [3, 1.5] },
  });
  b.relation(c1, c2, {
    offset: 0,
    duration: 1,
    pairs: [
      { from: [0], to: [0], style: null },
      { from: [1, 4], to: [1], style: null },
    ],
  });
  // Merge: over [4, 4.5) both "a"s fuse into the one "a" (the second fades out on the way).
  const c3 = b.clip(sum, t1, 2.6, 4.5, {
    intro: intro({ kind: "fade_in", duration: 0.4 }),
    initial: { position: [-3, 0] },
  });
  const c4 = b.clip(one, t3, 3.5, 6, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [3, 0] },
  });
  b.relation(c3, c4, {
    offset: 0.5,
    duration: 0.5,
    easing: "linear",
    pairs: [{ from: [0, 2], to: [0], style: null, extras: "merge" }],
  });
  // Copies: over [5.5, 6.4) the first "m" transforms into the one "m" and the second sends a
  // copy, staying for the outro of its clip (which fades out what is left).
  const c5 = b.clip(twice, t1, 4.6, 7, {
    intro: intro({ kind: "write", duration: 0.4 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [-3, -1.5] },
  });
  const c6 = b.clip(once, t2, 5, 8, {
    outro: outro({ kind: "shrink_to_center", duration: 0.5 }),
    initial: { position: [3, -1.5] },
  });
  b.relation(c5, c6, {
    offset: 0.5,
    duration: 0.9,
    pathArc: -40,
    pairs: [{ from: [0, 2], to: [0], style: null, extras: "copies" }],
  });
  // Within one formula: both 1s become the hidden 2 — the first consumed, the second copied.
  b.clip(ones, t3, 6.5, 9, {
    intro: intro({ kind: "write", duration: 0.6 }),
    initial: { position: [0, -2.5] },
    actions: [
      createMorph(1.2, {
        duration: 1,
        style: "transform",
        pairs: [{ from: [0, 2], to: [4], style: null, extras: "copies" }],
      }),
    ],
  });
  return b.project;
}

/** Disappear blocks on parts: every kind, each glyph coming back later (restoring removers) but
 * one, and a tween that moves the formula while those glyphs are away. */
function disappearBlocks(): Project {
  const b = new Builder("Disappear blocks");
  const t1 = b.track("Only");
  const f1 = b.formula("letters", "a+b+c+d+e", { color: GREEN });
  b.clip(f1, t1, 0, 7, {
    outro: outro({ kind: "unwrite", duration: 0.7 }),
    initial: { position: [0, 0.5] },
    actions: [
      createDisappear(0.3, "fade_out", [0], { duration: 0.6, shift: [0, 1] }),
      createDisappear(0.5, "uncreate", [2], { duration: 0.6 }),
      createDisappear(1.3, "shrink_to_center", [4], { duration: 0.6 }),
      createDisappear(1.5, "unwrite", [6, 8], { duration: 0.8 }),
      createDisappear(2.5, "uncreate", [1], {
        duration: 0.5,
        easing: "rush_into",
      }),
      createTween(3.2, 0.6, { position: [0.5, -0.5], rotation: 15 }),
      createAppear(4, "write", [0], { duration: 0.6 }),
      createAppear(4.2, "fade_in", [2], { duration: 0.6 }),
      createAppear(5, "grow_from_center", [4], { duration: 0.6 }),
      createAppear(5.2, "create", [6, 8], { duration: 0.6 }),
    ],
  });
  return b.project;
}

/** Blocks beside other animations: a disappear and an appear while a relation morphs other
 * glyphs, a non-linear unwrite that comes back, and a glyph that appears during the outro and
 * leaves when its clip ends, before the scene does. */
function blocksBesideRelations(): Project {
  const b = new Builder("Blocks beside relations", { duration: 5 });
  const t1 = b.track("One");
  const t2 = b.track("Two");
  const f1 = b.formula("sum", "a+b=c");
  const f2 = b.formula("swap", "c=a+b", { hiddenGlyphs: [3, 4] });
  const c1 = b.clip(f1, t1, 0, 3.5, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [0, 1.5] },
    actions: [
      createDisappear(1.2, "unwrite", [1, 3], {
        duration: 0.6,
        easing: "smooth",
      }),
      createAppear(2.4, "write", [1, 3], { duration: 0.5 }),
    ],
  });
  const c2 = b.clip(f2, t2, 1, 4, {
    outro: outro({ kind: "shrink_to_center", duration: 0.8 }),
    initial: { position: [0, -1] },
    actions: [
      createAppear(0, "fade_in", [3], { duration: 0.5 }),
      // "b" comes in while the outro shrinks the rest; it goes with the clip end at 4 s.
      createAppear(2.4, "grow_from_center", [4], { duration: 0.4 }),
    ],
  });
  // sum's "a" and "c" move into swap while sum unwrites "+" and "=" and swap fades in its "+".
  b.relation(c1, c2, {
    offset: 0,
    duration: 1.2,
    pairs: [
      { from: [0], to: [2], style: "copy" },
      { from: [4], to: [0], style: null },
    ],
  });
  return b.project;
}

/** A derivation like the ones the blocks are made for: ax²+bx+c=0 writes its "+c" later,
 * unwrites "=0", and moves into ax²+bx=−c, whose "=−" is written afterwards. */
function quadraticBlocks(): Project {
  const b = new Builder("Quadratic blocks");
  const t1 = b.track("Top");
  const t2 = b.track("Bottom");
  // a x 2 + b x + c = 0 (10 glyphs) and a x 2 + b x = − c (9 glyphs).
  const f1 = b.formula("general", "ax^2+bx+c=0", { hiddenGlyphs: [6, 7] });
  const f2 = b.formula("moved", "ax^2+bx=-c", {
    hiddenGlyphs: [6, 7],
    color: YELLOW,
  });
  const c1 = b.clip(f1, t1, 0, 4, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [0, 1.5] },
    actions: [
      createAppear(1.2, "write", [6, 7], { duration: 0.6 }),
      createDisappear(2, "unwrite", [8, 9], { duration: 0.5 }),
    ],
  });
  const c2 = b.clip(f2, t2, 2.6, 5, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [0, -1] },
    actions: [createAppear(1.3, "write", [6, 7], { duration: 0.6 })],
  });
  b.relation(c1, c2, {
    offset: 0,
    duration: 1.2,
    pairs: [
      { from: [0, 1, 2, 3, 4, 5], to: [0, 1, 2, 3, 4, 5], style: null },
      { from: [7], to: [8], style: null },
    ],
  });
  return b.project;
}

/** TeX rules (fraction bars are SVG rects, which Manim imports as Rectangle = Polygon(UR, UL,
 * DL, DR)): a bar traced by Write and taken back by Unwrite, bars morphing into bars, a letter
 * morphing into a bar, a bar drawn by Create (cut in ManimGL), and a bar that unwrites and is
 * written again. */
function fractionBars(): Project {
  const b = new Builder("Fraction bars");
  const t1 = b.track("One");
  const t2 = b.track("Two");
  const t3 = b.track("Three");
  // Glyph order: numerator, bar, denominator.
  const f1 = b.formula("ratio", "\\frac{a}{b}+c"); // a bar b + c
  const f2 = b.formula("flipped", "c=\\frac{b}{a}+d", { color: BLUE }); // c = b bar a + d
  const f3 = b.formula("xy", "\\frac{x}{y}=z"); // x bar y = z
  const c1 = b.clip(f1, t1, 0, 3, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "unwrite", duration: 0.6 }),
    initial: { position: [-2, 1] },
  });
  const c2 = b.clip(f2, t2, 1, 4.5, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    outro: outro({ kind: "uncreate", duration: 0.6 }),
    initial: { position: [0, -0.5] },
  });
  const c3 = b.clip(f3, t3, 2.5, 5, {
    intro: intro({ kind: "create", duration: 0.6 }),
    outro: outro({ kind: "shrink_to_center", duration: 0.3 }),
    initial: { position: [2.5, 1] },
    actions: [
      createDisappear(1.2, "unwrite", [1], { duration: 0.5 }),
      createAppear(1.8, "write", [1], { duration: 0.4 }),
    ],
  });
  // Copies of ratio's glyphs land in flipped: letters onto letters, the bar onto the bar.
  b.relation(c1, c2, {
    offset: 0.2,
    duration: 1,
    style: "copy",
    pairs: [
      { from: [0], to: [4], style: null },
      { from: [1], to: [3], style: null },
      { from: [2], to: [2], style: null },
      { from: [3], to: [1], style: null },
      { from: [4], to: [0], style: null },
    ],
  });
  // flipped's "c" becomes xy's bar; "a" and "b" become "x" and "y".
  b.relation(c2, c3, {
    offset: 0,
    duration: 1,
    pairs: [
      { from: [0], to: [1], style: null },
      { from: [4], to: [0], style: null },
      { from: [2], to: [2], style: null },
    ],
  });
  return b.project;
}

/** Part transforms (DECISIONS D20): a shift and scale (`.animate`), rotations with a colour or an
 * opacity change (`_Tween` about the part's centre), two parts at once, a whole-formula tween
 * after a part moved (explicit pivot), a part that comes back (`there_and_back`), a part moved
 * while off screen and then written, and a part turning beside a relation on other glyphs. */
function partTransforms(): Project {
  const b = new Builder("Part transforms");
  const t1 = b.track("Top");
  const t2 = b.track("Bottom");
  const f1 = b.formula("sum", "a+b+c", { color: BLUE }); // a + b + c
  const f2 = b.formula("prod", "xy=z", { hiddenGlyphs: [3] }); // x y = z
  const c1 = b.clip(f1, t1, 0, 6, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [0, 1.2] },
    actions: [
      createPartTransform(1.2, [0], {
        duration: 0.6,
        shift: [0, 0.6],
        scale: 1.5,
      }),
      createPartTransform(1.2, [4], {
        duration: 0.6,
        rotation: 90,
        color: RED,
      }),
      createTween(2.2, 0.6, { position: [-1, 1.5], scale: 0.8 }),
      createPartTransform(3.2, [1, 2, 3], {
        duration: 0.6,
        shift: [0.3, -0.4],
        scale: 0.7,
        rotation: -30,
        opacity: 0.5,
      }),
      createPartTransform(4.2, [0], {
        duration: 0.6,
        shift: [0, -0.6],
        easing: "there_and_back",
      }),
      createPartTransform(4.2, [4], {
        duration: 0.5,
        scale: 0.5,
        easing: "rush_into",
      }),
      // "+" (faded to 0.5 above) and "c" (not faded) turn and fade together, each from its own.
      createPartTransform(5, [1, 4], {
        duration: 0.4,
        rotation: 30,
        opacity: 0.8,
      }),
    ],
  });
  const c2 = b.clip(f2, t2, 0.5, 6, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [0, -1.2] },
    actions: [
      // "z" is hidden: moved and recoloured off screen, then written where it is.
      createPartTransform(0.8, [3], {
        duration: 0.4,
        shift: [0.5, 0],
        color: GREEN,
      }),
      createAppear(2, "write", [3], { duration: 0.6 }),
      createPartTransform(3, [0, 1], {
        duration: 0.8,
        shift: [-0.3, 0.2],
        rotation: 180,
      }),
      // "y" leaves for good; a part of "xy" then scales about "x" alone.
      createDisappear(4, "fade_out", [1], { duration: 0.4 }),
      createPartTransform(4.6, [0, 1], { duration: 0.4, scale: 1.5 }),
    ],
  });
  // A copy of sum's turned "c" becomes prod's "=" while prod's "xy" turns.
  b.relation(c1, c2, {
    offset: 2.5,
    duration: 0.6,
    style: "copy",
    pairs: [{ from: [4], to: [2], style: null }],
  });
  return b.project;
}

/** The owner's derivation (PLAN-AUTOTRANSFORMACION §6) written row by row with Morph blocks:
 * row 1 fades in, a tween moves the formula, a copy of row 1's "= x" becomes row 2's, the
 * subscript 2 is written, row 2's "x" is copied into row 3 while its "=" comes from another
 * formula on a front track by an ordinary relation, the subscript 3 is written, row 3 shifts and
 * turns yellow, and the whole formula fades out. Meanwhile "a+b=b+a" on the middle track makes
 * its right side out of its left one in one block — "a" consumed, "+" copied, "b" faded, along
 * an arc — sliced by the blocks of the other clips, then moves without its consumed glyphs. */
function multiline(): Project {
  const b = new Builder("Multiline");
  const t0 = b.track("Front");
  const t1 = b.track("Middle");
  const t2 = b.track("Back");
  // A = x 1 / = x 2 / = x 3, typed one row per line: ten glyphs in reading order, 3 per row after
  // the "A". The subscripts wait (hidden) for their Appear blocks and row 3's "=" for the
  // relation; the glyphs the morphs bring need no hiding: they arrive.
  const f1 = b.formula("rows", "A &= x_1 \\\\\n  &= x_2 \\\\\n  &= x_3", {
    hiddenGlyphs: [6, 7, 9],
  });
  const f2 = b.formula("equals", "y=2", { color: GREEN });
  const f3 = b.formula("swap", "a+b=b+a", { color: BLUE }); // a + b = b + a
  const rows = b.clip(f1, t2, 0, 8, {
    // Not written: ManimGL's Write traces the "A" along its quadratic approximation, and at one
    // frame the preview's cubic trace is farther along than `partialBox` allows (the preview's
    // ManimGL Write, not the morphs). The subscripts below are written.
    intro: intro({ kind: "fade_in", duration: 1 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [-2.5, 1] },
    actions: [
      createTween(1.1, 0.6, { position: [-2, 1.3], scale: 1.1 }),
      createMorph(2, {
        pairs: [
          { from: [1], to: [4], style: null },
          { from: [2], to: [5], style: null },
        ],
      }),
      createAppear(3, "write", [6], { duration: 0.6 }),
      // Overlaps the Appear block above on other glyphs: both play in parts.
      createMorph(3.3, {
        easing: "linear",
        pairs: [{ from: [5], to: [8], style: null }],
      }),
      createAppear(4.3, "write", [9], { duration: 0.6 }),
      createPartTransform(5, [7, 8, 9], {
        duration: 0.6,
        shift: [0.6, 0],
        color: YELLOW,
      }),
    ],
  });
  const equals = b.clip(f2, t0, 1.5, 6, {
    intro: intro({ kind: "write", duration: 0.6 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [2.5, 1.5] },
  });
  // Row 3's "=" comes from "y=2" while row 2's "x" is copied into row 3.
  b.relation(equals, rows, {
    offset: 3.3,
    duration: 1,
    pairs: [{ from: [1], to: [7], style: null }],
  });
  b.clip(f3, t1, 0.5, 7, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [2, -1.5] },
    actions: [
      // [4.5, 5.5): beside the Appear of the subscript 3 and the part transform of row 3.
      createMorph(4, {
        style: "transform",
        pathArc: 60,
        pairs: [
          { from: [0], to: [6], style: null },
          { from: [1], to: [5], style: "copy" },
          { from: [2], to: [4], style: "fade" },
        ],
      }),
      createTween(5.3, 0.5, { position: [2.5, -2] }),
    ],
  });
  return b.project;
}

/** A consuming Morph block during the outro: `a+b=c` with "c" hidden fades out over [3, 4)
 * while, over [3.3, 3.8), "a" turns into "c" — the source leaves through the pair, not with the
 * outro; the target came on screen during the outro, so it leaves with the clip at 4 s
 * (`self.remove`), one second before the scene ends. */
function morphOutro(): Project {
  const b = new Builder("Morph outro", { duration: 5 });
  const t1 = b.track("Only");
  const f1 = b.formula("sum", "a+b=c", { hiddenGlyphs: [4] }); // a + b = c
  b.clip(f1, t1, 0, 4, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    outro: outro({ kind: "fade_out", duration: 1 }),
    actions: [
      createMorph(3.3, {
        style: "transform",
        duration: 0.5,
        pairs: [{ from: [0], to: [4], style: null }],
      }),
    ],
  });
  return b.project;
}

/** Two Morph blocks copying one source at once, on the back track under a front clip: `a+b+c`
 * with "b" and "c" hidden makes both out of copies of "a" over [1, 3), behind a big red "0" that
 * sits on the first copy's path (the copies keep their clip's depth: no raise within one clip)
 * and moves a little over [1.5, 2.5), which slices both copies into parts. */
function morphCopies(): Project {
  const b = new Builder("Morph copies");
  const t0 = b.track("Front");
  const t1 = b.track("Back");
  const f1 = b.formula("letters", "a+b+c", { hiddenGlyphs: [2, 4] }); // a + b + c
  const f2 = b.formula("zero", "0", { color: RED });
  b.clip(f1, t1, 0, 4, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { scale: 1.5 },
    actions: [
      createMorph(1, {
        duration: 2,
        pairs: [{ from: [0], to: [2], style: null }],
      }),
      createMorph(1, {
        duration: 2,
        pairs: [{ from: [0], to: [4], style: null }],
      }),
    ],
  });
  b.clip(f2, t0, 0, 4, {
    initial: { position: [-0.75, 0], scale: 4 },
    actions: [createTween(1.5, 1, { position: [-0.75, 0.3] })],
  });
  return b.project;
}

/** Custom paths: the chord with a bump to its left, a wave through a corner, and the chord. */
function customPaths(): Project {
  const bump: PathSpline = {
    nodes: [
      { at: [0, 0], in: null, out: [0.25, 0.45], smooth: false },
      { at: [1, 0], in: [0.75, 0.45], out: null, smooth: false },
    ],
  };
  const wave: PathSpline = {
    nodes: [
      { at: [0, 0], in: null, out: [0.2, -0.3], smooth: false },
      { at: [0.5, 0.1], in: [0.35, -0.2], out: [0.65, 0.4], smooth: true },
      { at: [0.8, 0.5], in: null, out: null, smooth: false },
      { at: [1, 0], in: [1.1, 0.3], out: null, smooth: false },
    ],
  };
  const chord: PathSpline = {
    nodes: [
      { at: [0, 0], in: null, out: null, smooth: false },
      { at: [1, 0], in: null, out: null, smooth: false },
    ],
  };
  const b = new Builder("Custom paths");
  const t0 = b.track("Top");
  const t1 = b.track("Middle");
  const t2 = b.track("Bottom");
  const f1 = b.formula("sum", "a+b=c");
  const f2 = b.formula("swap", "c=b+a", { glyphColors: { "0": BLUE } });
  const f3 = b.formula("letters", "abc");
  const f4 = b.formula("rows", "x+y \\\\ y+x", { hiddenGlyphs: [3, 4, 5] });
  const c1 = b.clip(f1, t0, 0, 3, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [-2, 1.5] },
  });
  const c2 = b.clip(f2, t1, 1, 5, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [2, -1] },
  });
  b.relation(c1, c2, {
    duration: 1.5,
    pathArc: 60,
    easing: "linear",
    pairs: [
      { from: [0], to: [4], style: null, path: bump },
      { from: [2], to: [2], style: "copy", path: wave },
      { from: [4], to: [0], style: "fade", path: bump },
      { from: [1], to: [3], style: null, path: chord },
      { from: [3], to: [1], style: null },
    ],
  });
  const c3 = b.clip(f3, t0, 3.5, 6, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [-2, 1], scale: 1.5 },
  });
  // One-to-many and many-to-one along a path: each submobject gets its own chord.
  b.relation(c2, c3, {
    duration: 1,
    pairs: [
      { from: [2], to: [0, 1], style: null, path: wave },
      { from: [0, 4], to: [2], style: null, extras: "separate", path: bump },
    ],
  });
  b.clip(f4, t2, 4, 6, {
    intro: intro({ kind: "write", duration: 0.5 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [2, -1] },
    actions: [
      createMorph(0.5, {
        duration: 1,
        style: "copy",
        pairs: [
          { from: [0], to: [5], style: null, path: bump },
          { from: [2], to: [3], style: null, path: wave },
          { from: [1], to: [4], style: null },
        ],
      }),
    ],
  });
  return b.project;
}

function metaVariety(): Project {
  const b = new Builder("Meta variety", {
    width: 400,
    height: 300,
    fps: 24,
    background: "#1E1E2E",
    duration: 4,
    preamble: "\\newcommand{\\R}{\\mathbb{R}}",
  });
  const t1 = b.track("Only");
  const f1 = b.formula("cancel", "\\cancel{x}+\\R", {
    packages: ["cancel"],
    color: YELLOW,
  });
  b.clip(f1, t1, 0.5, 3.5, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "fade_out", duration: 1 }),
    initial: { position: [0, 0.5], scale: 1.5 },
  });
  return b.project;
}

/** A LaTeX text: a two-line title inside a width of 6 scene units, one word coloured, written;
 * its inline formula is copied into a bigger formula below through a relation, and both fade out.
 * The glyph indices are the companion's for this text — reading order, as the snapshot of
 * examples/text-title.mfe.json (the same text) shows: "square" is 13–18, "x2+bx+c" 29–35. */
function texText(): Project {
  const b = new Builder("LaTeX text");
  const t1 = b.track("Title");
  const t2 = b.track("Formula");
  const title = b.text(
    "title",
    "Completing the square: start from $x^2+bx+c$",
    { width: 6 },
    { glyphColors: Object.fromEntries([13, 14, 15, 16, 17, 18].map((i) => [String(i), YELLOW])) },
  );
  const sum = b.formula("sum", "x^2+bx+c", { fontSize: 72 });
  const c1 = b.clip(title, t1, 0, 5, {
    intro: intro({ kind: "write", duration: 1.5 }),
    outro: outro({ kind: "fade_out", duration: 1 }),
    initial: { position: [0, 1.2] },
  });
  const c2 = b.clip(sum, t2, 2, 5, {
    outro: outro({ kind: "fade_out", duration: 1 }),
    initial: { position: [0, -0.8] },
  });
  b.relation(c1, c2, {
    duration: 1,
    style: "copy",
    pairs: [29, 30, 31, 32, 33, 34, 35].map((from, i) => ({ from: [from], to: [i], style: null })),
  });
  return b.project;
}

function offGrid(): Project {
  const b = new Builder("Off grid", { fps: 25 });
  const t1 = b.track("One");
  const t2 = b.track("Two");
  const f1 = b.formula("p", "p+q");
  const f2 = b.formula("q", "q+p");
  const c1 = b.clip(f1, t1, 0.013, 2.37, {
    intro: intro({ kind: "write", duration: 0.77 }),
    outro: outro({ kind: "fade_out", duration: 0.51 }),
  });
  const c2 = b.clip(f2, t2, 1.07, 3.33, {
    outro: outro({ kind: "fade_out", duration: 0.61 }),
    initial: { position: [0, -1.5] },
    actions: [createTween(1.03, 0.43, { position: [0, -2.5] })],
  });
  b.relation(c1, c2, {
    duration: 0.93,
    pairs: [
      { from: [0], to: [2], style: null },
      { from: [2], to: [0], style: null },
    ],
  });
  return b.project;
}

/** A formula with no ink (`\\quad`): MathJax and LaTeX give it no glyphs, so the helper gets an
 * empty layout and an empty mobject, and its animations run on nothing. */
function zeroGlyphs(): Project {
  const b = new Builder("Zero glyphs");
  const t1 = b.track("Front");
  const t2 = b.track("Back");
  const spacer = b.formula("spacer", "\\quad");
  const sum = b.formula("sum", "a+b");
  b.clip(spacer, t1, 0, 2, {
    intro: intro({ kind: "write", duration: 0.5 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
  });
  b.clip(sum, t2, 0.5, 2.5, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
  });
  return b.project;
}

/** Objects attached to glyphs of another clip (R4), placed by Manim's own `next_to` in the step
 * where each clip starts: a label below three glyphs of a scaled, rotated formula once its tween
 * has moved it; one above the whole formula from the very instant its Write ends; one to the left
 * of a glyph a part transform moved; and a label hanging on a label (a chain). The formula is
 * rotated, so ManimCE's anchors and ManimGL's every-point boxes differ, each exact for its own. */
function attachNextTo(): Project {
  const b = new Builder("Attached objects");
  const t1 = b.track("Formula");
  const t2 = b.track("Below");
  const t3 = b.track("Above");
  const t4 = b.track("Left");
  const t5 = b.track("Chain");
  const f1 = b.formula("poly", "x^2+bx+c", { glyphColors: { "3": YELLOW, "4": YELLOW } });
  const below = b.formula("below", "2a", { color: BLUE });
  const above = b.formula("above", "b^2-4ac", { color: GREEN });
  const left = b.formula("left", "y=", { color: RED });
  const chain = b.formula("chain", "k");
  const c1 = b.clip(f1, t1, 0, 7, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [0, 0.5], scale: 1.3, rotation: 20 },
    actions: [
      createTween(1.5, 1, { position: [-1, 0], scale: 1.1, rotation: -10 }, "smooth"),
      createPartTransform(2.7, [0, 1], { shift: [-0.4, 0.3], scale: 1.2 }),
    ],
  });
  b.clip(below, t2, 3, 7, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    initial: { scale: 0.8, rotation: -15 },
    attach: createAttach(c1.id, [3, 4, 5], { side: "down", buff: 0.25 }),
  });
  const c3 = b.clip(above, t3, 1, 7, {
    intro: intro({ kind: "write", duration: 0.8 }),
    initial: { scale: 0.7 },
    attach: createAttach(c1.id, "all", { side: "up", buff: 0.4 }),
  });
  b.clip(left, t4, 4.5, 7, {
    initial: { scale: 0.9 },
    attach: createAttach(c1.id, [0], { side: "left", buff: 0.15 }),
  });
  b.clip(chain, t5, 6, 7, {
    attach: createAttach(c3.id, "all", { side: "right", buff: 0.1 }),
  });
  return b.project;
}

/** Braces (D66): on three glyphs below a formula that moves, scales and turns before they appear
 * (a tween; the brace follows), above the whole with another sharpness, on a lone glyph to the
 * left (the narrow build), on two to the right, at an angle, and below a LaTeX text; a label
 * hanging below a brace through `next_to`. The target's intro is a Write of 1 s: every brace
 * starts after it. */
function braces(): Project {
  const b = new Builder("Braces");
  const t1 = b.track("Formula");
  const t2 = b.track("Below");
  const t3 = b.track("Above");
  const t4 = b.track("Left");
  const t5 = b.track("Right");
  const t6 = b.track("Angle");
  const t7 = b.track("Text");
  const t8 = b.track("Text brace");
  const t9 = b.track("Label");
  const f1 = b.formula("poly", "x^2+bx+c", { glyphColors: { "3": YELLOW, "4": YELLOW } });
  const title = b.text("title", "A brace on text", {}, { color: GREEN, fontSize: 40 });
  const label = b.formula("label", "2a", { color: BLUE, fontSize: 36 });
  const c1 = b.clip(f1, t1, 0, 8, {
    intro: intro({ kind: "write", duration: 1 }),
    initial: { position: [0, 1], scale: 1.3, rotation: 20 },
    actions: [createTween(1.5, 1, { position: [-0.5, 0.8], scale: 1.1, rotation: -10 }, "smooth")],
  });
  const ct = b.clip(title, t7, 0, 8, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    initial: { position: [0, -2.4] },
  });
  const below = b.clip(b.brace("below", { color: BLUE }), t2, 3, 8, {
    intro: intro({ kind: "grow_from_center", duration: 1 }),
    attach: createBraceAttach(c1.id, [3, 4, 5], { direction: 0, buff: 0.25 }),
  });
  b.clip(b.brace("above", { color: GREEN, sharpness: 1.2 }), t3, 1.5, 8, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    attach: createBraceAttach(c1.id, "all", { direction: 180, buff: 0.4 }),
  });
  b.clip(b.brace("left", { color: RED }), t4, 4.5, 8, {
    attach: createBraceAttach(c1.id, [0], { direction: -90, buff: 0.15 }),
  });
  b.clip(b.brace("right"), t5, 5, 8, {
    intro: intro({ kind: "write", duration: 0.5 }),
    attach: createBraceAttach(c1.id, [5, 6], { direction: 90, buff: 0.1 }),
  });
  b.clip(b.brace("angle", { color: YELLOW }), t6, 6, 8, {
    intro: intro({ kind: "grow_from_center", duration: 0.5 }),
    initial: { opacity: 0.7 },
    attach: createBraceAttach(c1.id, "all", { direction: 30, buff: 0.2 }),
  });
  b.clip(b.brace("ontext", { color: RED }), t8, 2, 8, {
    intro: intro({ kind: "grow_from_center", duration: 1 }),
    attach: createBraceAttach(ct.id, "all", { direction: 0, buff: 0.2 }),
  });
  b.clip(label, t9, 4.5, 8, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    attach: createAttach(below.id, "all", { side: "down", buff: 0.1 }),
  });
  return b.project;
}

/** Shapes (D71): fitted to a formula that moves, scales and turns before they appear (a tween;
 * the shapes follow — the highlight comes in halfway through it): a rounded box created around
 * three glyphs, a circle written around the first two, an underline created below the whole, a
 * cross written over the last two, a highlight (a box filled with no stroke) faded in behind the
 * middle on the track below, and a box drawn border then fill at the clip's opacity 0.6, with a
 * fill of its own; outros of every kind; a box that moves and fades (its fill and stroke each from
 * its own opacity) and a circle that turns and fades (the `_Tween` with its stroke pair); a
 * detached circle grown from its centre where the project put it; a box around a LaTeX text. The
 * target's intro is a Write of 1 s: every shape starts after it. */
function decorations(): Project {
  const b = new Builder("Decorations");
  const t0 = b.track("Behind");
  const t1 = b.track("Formula");
  const t2 = b.track("Box");
  const t3 = b.track("Circle");
  const t4 = b.track("Underline");
  const t5 = b.track("Cross");
  const t6 = b.track("Faded");
  const t7 = b.track("Free");
  const t8 = b.track("Text");
  const t9 = b.track("Text box");
  const f1 = b.formula("poly", "x^2+bx+c", { glyphColors: { "3": YELLOW, "4": YELLOW } });
  const title = b.text("title", "A box on text", {}, { color: GREEN, fontSize: 40 });
  const c1 = b.clip(f1, t1, 0, 8, {
    intro: intro({ kind: "write", duration: 1 }),
    initial: { position: [0, 1], scale: 1.3, rotation: 20 },
    actions: [createTween(1.5, 1, { position: [-0.5, 0.8], scale: 1.1, rotation: -10 }, "smooth")],
  });
  const ct = b.clip(title, t8, 0, 8, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    initial: { position: [0, -2.4] },
  });
  b.clip(b.shape("box", { cornerRadius: 0.15 }), t2, 3, 8, {
    intro: intro({ kind: "create", duration: 1 }),
    outro: outro({ kind: "uncreate", duration: 0.5 }),
    actions: [createTween(2, 1, { position: [-2.5, 2.5], opacity: 0.4 }, "smooth")],
    attach: createShapeAttach(c1.id, [3, 4, 5], 0.15),
  });
  b.clip(b.shape("circle", { shape: "circle" }), t3, 3.5, 8, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "unwrite", duration: 0.5 }),
    actions: [createTween(2, 1, { rotation: 40, opacity: 0.5 }, "smooth")],
    attach: createShapeAttach(c1.id, [0, 1], 0.1),
  });
  b.clip(b.shape("line", { shape: "underline", color: BLUE }), t4, 4, 8, {
    intro: intro({ kind: "create", duration: 0.5 }),
    outro: outro({ kind: "shrink_to_center", duration: 0.5 }),
    attach: createShapeAttach(c1.id, "all", 0.2),
  });
  b.clip(b.shape("cross", { shape: "cross" }), t5, 4.5, 8, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    attach: createShapeAttach(c1.id, [5, 6], 0),
  });
  b.clip(
    b.shape("highlight", { style: { fillOpacity: 0.3, strokeWidth: 0, strokeOpacity: 0 } }),
    t0,
    2,
    8,
    {
      intro: intro({ kind: "fade_in", duration: 0.5 }),
      attach: createShapeAttach(c1.id, [2, 3, 4], 0),
    },
  );
  b.clip(
    b.shape("faded", { color: RED, style: { fillOpacity: 0.2, strokeWidth: 6, strokeOpacity: 1 } }),
    t6,
    2.5,
    8,
    {
      intro: intro({ kind: "draw_border_then_fill", duration: 1 }),
      initial: { opacity: 0.6 },
      attach: createShapeAttach(c1.id, "all", 0.35),
    },
  );
  b.clip(b.shape("free", { shape: "circle", width: 1.2, height: 1.2, color: GREEN }), t7, 1, 8, {
    intro: intro({ kind: "grow_from_center", duration: 0.5 }),
    initial: { position: [4, -1] },
  });
  b.clip(b.shape("textbox", { color: YELLOW }), t9, 5, 8, {
    intro: intro({ kind: "create", duration: 0.5 }),
    attach: createShapeAttach(ct.id, "all", 0.1),
  });
  return b.project;
}

/** Braces and shapes over glyphs of two clips at once (D117, `attach.also`): Manim builds them on
 * a `VGroup` of the glyphs of each. Two formulas apart — one moved, scaled and turned by a tween
 * before anything hangs on it, so that the anchors' box and the box of every point differ — and a
 * LaTeX text: a brace below glyphs of both formulas with a label beside it, one above the whole of
 * the two, one on their right and one at an angle that reaches the text; a rounded box, a circle,
 * an underline and a cross over glyphs of both; a highlight behind a formula and the text. */
function spanning(): Project {
  const b = new Builder("Spanning");
  const t0 = b.track("Behind");
  const t1 = b.track("Left");
  const t2 = b.track("Right");
  const t3 = b.track("Text");
  const t4 = b.track("Below");
  const t5 = b.track("Above");
  const t6 = b.track("Side");
  const t7 = b.track("Angle");
  const t8 = b.track("Box");
  const t9 = b.track("Circle");
  const t10 = b.track("Underline");
  const t11 = b.track("Cross");
  const t12 = b.track("Label");
  const f1 = b.formula("left", "x^2+bx", { glyphColors: { "0": YELLOW } });
  const f2 = b.formula("right", "c=0", { color: BLUE, fontSize: 60 });
  const title = b.text("title", "Two at once", {}, { color: GREEN, fontSize: 40 });
  const c1 = b.clip(f1, t1, 0, 8, {
    intro: intro({ kind: "write", duration: 1 }),
    initial: { position: [-2.5, 1.2], scale: 1.2, rotation: 15 },
    actions: [createTween(1.5, 1, { position: [-2, 0.8], scale: 1, rotation: -10 }, "smooth")],
  });
  const c2 = b.clip(f2, t2, 0, 8, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    initial: { position: [2, -0.4] },
  });
  const ct = b.clip(title, t3, 0, 8, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    initial: { position: [0, -2.6] },
  });
  const also = (clip: Clip, glyphs: number[] | "all") => [{ clipId: clip.id, glyphs }];
  const below = b.clip(b.brace("below", { color: BLUE }), t4, 3, 8, {
    intro: intro({ kind: "grow_from_center", duration: 1 }),
    attach: createBraceAttach(c1.id, [3, 4], { direction: 0, buff: 0.25, also: also(c2, [0]) }),
  });
  b.clip(b.brace("above", { color: GREEN, sharpness: 1.2 }), t5, 3.5, 8, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    attach: createBraceAttach(c2.id, "all", { direction: 180, buff: 0.3, also: also(c1, "all") }),
  });
  b.clip(b.brace("side", { color: RED }), t6, 4, 8, {
    attach: createBraceAttach(c1.id, [0, 1], { direction: 90, buff: 0.15, also: also(c2, [1, 2]) }),
  });
  b.clip(b.brace("angle", { color: YELLOW }), t7, 4.5, 8, {
    intro: intro({ kind: "grow_from_center", duration: 0.5 }),
    attach: createBraceAttach(c1.id, "all", { direction: 30, buff: 0.2, also: also(ct, [0, 1, 2]) }),
  });
  b.clip(b.shape("box", { cornerRadius: 0.15 }), t8, 3, 8, {
    intro: intro({ kind: "create", duration: 1 }),
    attach: createShapeAttach(c1.id, [2, 3], 0.15, also(c2, [0])),
  });
  b.clip(b.shape("circle", { shape: "circle" }), t9, 5, 8, {
    intro: intro({ kind: "write", duration: 1 }),
    attach: createShapeAttach(c2.id, [2], 0.1, also(c1, [4])),
  });
  b.clip(b.shape("line", { shape: "underline", color: BLUE }), t10, 5.5, 8, {
    intro: intro({ kind: "create", duration: 0.5 }),
    attach: createShapeAttach(c1.id, "all", 0.2, also(c2, "all")),
  });
  b.clip(b.shape("cross", { shape: "cross" }), t11, 6, 8, {
    intro: intro({ kind: "write", duration: 1 }),
    attach: createShapeAttach(c1.id, [2], 0, also(c2, [1])),
  });
  b.clip(
    b.shape("highlight", { style: { fillOpacity: 0.3, strokeWidth: 0, strokeOpacity: 0 } }),
    t0,
    2.5,
    8,
    {
      intro: intro({ kind: "fade_in", duration: 0.5 }),
      attach: createShapeAttach(c2.id, "all", 0, also(ct, "all")),
    },
  );
  b.clip(b.formula("label", "2a", { color: BLUE, fontSize: 36 }), t12, 4.5, 8, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    attach: createAttach(below.id, "all", { side: "down", buff: 0.1 }),
  });
  return b.project;
}

/** Emphasis blocks (D73) on `x^2+bx+c`, written and then moved: an Indicate on `x^2` and one with
 * the pause easing, a bigger swell and a colour of its own; a Circumscribe over the whole formula
 * during a tween, which it may overlap, and a blue, thin, slow one with a wide gap that overlaps a
 * Flash (both only measure their glyphs); a Wiggle with Manim's defaults and one with its own
 * swell, angle, count and easing during a FocusOn on another glyph; the Flash and the FocusOn
 * aimed at a glyph. A formula on a front track (its own Flash on its layer, an Indicate of the
 * whole) that the FocusOn's disc must cover, and one behind everything with a slow Circumscribe
 * at layer 0. Sized for the pixel comparison of a frame where the frame is being traced over the
 * moving formula. */
function emphasis(): Project {
  const b = new Builder("Emphasis", { width: 960, height: 540 });
  const t2 = b.track("Front");
  const t1 = b.track("Formula");
  const t0 = b.track("Behind");
  const f1 = b.formula("poly", "x^2+bx+c");
  const f2 = b.formula("other", "y=1");
  const f3 = b.formula("under", "z");
  b.clip(f1, t1, 0, 12, {
    intro: intro({ kind: "write", duration: 1 }),
    initial: { position: [0, 0.5] },
    actions: [
      createEmphasis(1.5, "indicate", [0, 1]),
      createEmphasis(2.5, "indicate", [5, 6], {
        easing: "there_and_back_with_pause",
        scale: 1.5,
        color: RED,
      }),
      createTween(4, 1, { position: [-1, 0.5], scale: 1.2 }, "smooth"),
      createEmphasis(4, "circumscribe", "all"),
      createEmphasis(5.5, "wiggle", [3, 4], { duration: 1.5 }),
      createEmphasis(7, "flash", [6]),
      createEmphasis(7.5, "circumscribe", [2, 3, 4], {
        buff: 0.25,
        strokeWidth: 2,
        timeWidth: 1,
        color: BLUE,
        easing: "linear",
      }),
      createEmphasis(8.5, "focus_on", [3]),
      createEmphasis(9, "wiggle", [0], {
        duration: 1,
        scale: 1.3,
        angle: 10,
        wiggles: 3,
        easing: "linear",
      }),
    ],
  });
  b.clip(f2, t2, 3, 12, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    initial: { position: [3, -1.5] },
    actions: [
      createEmphasis(3, "flash", "all", { color: GREEN }),
      createEmphasis(6.5, "indicate", "all", { duration: 0.5 }),
    ],
  });
  b.clip(f3, t0, 0, 12, {
    initial: { position: [-3, -2] },
    actions: [createEmphasis(2, "circumscribe", "all", { duration: 2 })],
  });
  return b.project;
}

/** Labels at the tip of braces (D69): below a part of a sum at Manim's gap, coming in with their
 * brace, and with a gap of their own; above the whole sum, a label coming in once its brace has
 * grown, made of copies of the other two labels' glyphs (relations between labels); at 30° on a
 * lone glyph, the label scaled and turned, and at 62°, a LaTeX text — two angles whose direction,
 * read by Manim from the brace's centre to its tip, rounds to a corner (at 62° the angle alone
 * would give a side); and at the tip of a detached brace that a tween moved before the label
 * comes. */
function braceLabels(): Project {
  const b = new Builder("Brace labels");
  const t1 = b.track("Sum");
  const tracks = Array.from({ length: 12 }, (_, i) => b.track(`Track ${i + 2}`));
  const track = (i: number) => tracks[i]!;
  const sum = b.formula("sum", "1+2+3+4+5+6");
  const grow = intro({ kind: "grow_from_center", duration: 0.5 });
  const fade = intro({ kind: "fade_in", duration: 0.5 });
  const c1 = b.clip(sum, t1, 0, 9, {
    intro: intro({ kind: "write", duration: 1 }),
    initial: { position: [0, 0.4] },
  });
  const b1 = b.clip(b.brace("first", { color: BLUE }), track(0), 1.5, 9, {
    intro: grow,
    attach: createBraceAttach(c1.id, [0, 1, 2, 3, 4], { direction: 0, buff: 0.2 }),
  });
  const l1 = b.clip(b.formula("six", "6", { color: BLUE }), track(1), 1.5, 9, {
    intro: fade,
    attach: createTipAttach(b1.id),
  });
  const b2 = b.clip(b.brace("second", { color: GREEN }), track(2), 2, 9, {
    intro: grow,
    attach: createBraceAttach(c1.id, [6, 7, 8, 9, 10], { direction: 0, buff: 0.2 }),
  });
  const l2 = b.clip(b.formula("fifteen", "15", { color: GREEN }), track(3), 2, 9, {
    intro: fade,
    attach: createTipAttach(b2.id, 0.15),
  });
  const b3 = b.clip(b.brace("whole"), track(4), 2.5, 9, {
    intro: grow,
    attach: createBraceAttach(c1.id, "all", { direction: 180, buff: 0.25 }),
  });
  const l3 = b.clip(b.formula("total", "6+15=21"), track(5), 4, 9, {
    intro: fade,
    attach: createTipAttach(b3.id, 0.35),
  });
  b.relation(l1, l3, {
    duration: 1,
    style: "copy",
    pairs: [{ from: [0], to: [0], style: null }],
  });
  b.relation(l2, l3, {
    duration: 1,
    style: "copy",
    pairs: [{ from: [0, 1], to: [2, 3], style: null }],
  });
  const b4 = b.clip(b.brace("tilted", { color: RED }), track(6), 3, 9, {
    intro: grow,
    attach: createBraceAttach(c1.id, [0], { direction: 30, buff: 0.15 }),
  });
  b.clip(b.formula("first_term", "a", { color: RED }), track(7), 3, 9, {
    intro: fade,
    initial: { scale: 0.8, rotation: 15 },
    attach: createTipAttach(b4.id),
  });
  const b5 = b.clip(b.brace("steep", { color: YELLOW }), track(8), 3.5, 9, {
    intro: grow,
    attach: createBraceAttach(c1.id, [10], { direction: 62, buff: 0.15 }),
  });
  b.clip(b.text("last", "last term", {}, { fontSize: 32 }), track(9), 4.5, 9, {
    intro: fade,
    attach: createTipAttach(b5.id),
  });
  const b6 = b.clip(b.brace("free", { width: 1.5, color: BLUE }), track(10), 0, 9, {
    intro: grow,
    initial: { position: [-3.4, -1.8], rotation: -90 },
    actions: [createTween(5, 0.6, { position: [-2.6, -1.6] }, "smooth")],
  });
  b.clip(b.formula("w", "w"), track(11), 6, 9, {
    intro: fade,
    attach: createTipAttach(b6.id),
  });
  return b.project;
}

/** The principal follows a source edit that reorders glyph identities. Relation and Morph both
 * consume the higher-index source; a later relation can still copy the lower-index survivor. */
function rebasedPrincipal(): Project {
  const b = new Builder("Rebased principal");
  const sourceTrack = b.track("Source");
  const targetTrack = b.track("Target");
  const laterTrack = b.track("Later copy");
  const morphTrack = b.track("Morph");
  const source = b.formula("source", "a+b");
  const target = b.formula("target", "c");
  const later = b.formula("later", "d");
  const derivation = b.formula("derivation", "x+y=z");
  const a = b.clip(source, sourceTrack, 0, 5, {
    initial: { position: [-3, 1.5] },
    outro: outro({ kind: "fade_out", duration: 0.5 }),
  });
  const c = b.clip(target, targetTrack, 1, 5, {
    initial: { position: [1, 1.5] },
  });
  const d = b.clip(later, laterTrack, 3, 5, {
    initial: { position: [3, 1.5] },
  });
  b.relation(a, c, {
    pairs: [{ from: [0, 2], to: [0], style: null, extras: "copies" }],
  });
  b.relation(a, d, {
    style: "copy",
    pairs: [{ from: [2], to: [0], style: null }],
  });
  b.clip(derivation, morphTrack, 0, 5, {
    initial: { position: [0, -1.5] },
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    actions: [
      createMorph(1, {
        style: "copy",
        pairs: [
          { from: [0, 2], to: [4], style: "transform", extras: "copies" },
        ],
      }),
    ],
  });
  remapGlyphRefs(b.project, source.id, [2, 1, 0]);
  source.source = "b+a";
  remapGlyphRefs(b.project, derivation.id, [2, 1, 0, 3, 4]);
  derivation.source = "y+x=z";
  return b.project;
}

/** Braces on shapes and over whole clips (D123): Manim's `Brace(shape, …)` measures the shape's
 * own points, without its stroke. A formula written in 1 s; around three of its glyphs a rounded
 * box that moves, grows and turns before anything hangs on it (the anchors' box and the box of
 * every point then differ), around the first two a circle that turns, below the whole an
 * underline, over the last two a cross, and a detached circle apart. A brace below the box, one
 * on the left of the circle, one under the underline, one above the cross; one on the right of the
 * formula and the box, each whole (`Brace(VGroup(…))`), and one at an angle over the two circles. */
function bracesOnShapes(): Project {
  const b = new Builder("Braces on shapes");
  const t1 = b.track("Formula");
  const t2 = b.track("Box");
  const t3 = b.track("Circle");
  const t4 = b.track("Underline");
  const t5 = b.track("Cross");
  const t6 = b.track("Free");
  const t7 = b.track("Under box");
  const t8 = b.track("Left of circle");
  const t9 = b.track("Under line");
  const t10 = b.track("Over cross");
  const t11 = b.track("Both");
  const t12 = b.track("Shapes");
  const f1 = b.formula("poly", "x^2+bx+c", { glyphColors: { "3": YELLOW, "4": YELLOW } });
  const c1 = b.clip(f1, t1, 0, 8, {
    intro: intro({ kind: "write", duration: 1 }),
    initial: { position: [-1, 1.2], scale: 1.2 },
  });
  const box = b.clip(b.shape("box", { cornerRadius: 0.15 }), t2, 1.5, 8, {
    actions: [createTween(0.5, 1, { position: [-2.4, -0.6], scale: 1.3, rotation: 15 }, "smooth")],
    attach: createShapeAttach(c1.id, [3, 4, 5], 0.15),
  });
  const circle = b.clip(b.shape("circle", { shape: "circle", color: GREEN }), t3, 1.5, 8, {
    actions: [createTween(0.5, 1, { rotation: 40 }, "smooth")],
    attach: createShapeAttach(c1.id, [0, 1], 0.1),
  });
  const line = b.clip(b.shape("line", { shape: "underline", color: BLUE }), t4, 1.5, 8, {
    attach: createShapeAttach(c1.id, "all", 0.2),
  });
  const cross = b.clip(b.shape("cross", { shape: "cross" }), t5, 1.5, 8, {
    attach: createShapeAttach(c1.id, [5, 6], 0),
  });
  const free = b.clip(
    b.shape("free", { shape: "circle", width: 1.4, height: 1.4, color: YELLOW }),
    t6,
    1,
    8,
    { initial: { position: [4, -2] } },
  );
  b.clip(b.brace("underbox", { color: BLUE }), t7, 3, 8, {
    intro: intro({ kind: "grow_from_center", duration: 0.5 }),
    attach: createBraceAttach(box.id, "all", { direction: 0, buff: 0.2 }),
  });
  b.clip(b.brace("leftcircle", { color: RED }), t8, 3.5, 8, {
    attach: createBraceAttach(circle.id, "all", { direction: -90, buff: 0.1 }),
  });
  b.clip(b.brace("underline"), t9, 4, 8, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    attach: createBraceAttach(line.id, "all", { direction: 0, buff: 0.25 }),
  });
  b.clip(b.brace("overcross", { color: GREEN, sharpness: 1.2 }), t10, 4.5, 8, {
    attach: createBraceAttach(cross.id, "all", { direction: 180, buff: 0.15 }),
  });
  b.clip(b.brace("both", { color: YELLOW }), t11, 5, 8, {
    intro: intro({ kind: "write", duration: 0.5 }),
    attach: createBraceAttach(c1.id, "all", {
      direction: 90,
      buff: 0.2,
      also: [{ clipId: box.id, glyphs: "all" }],
    }),
  });
  b.clip(b.brace("shapes"), t12, 5.5, 8, {
    attach: createBraceAttach(free.id, "all", {
      direction: 30,
      buff: 0.2,
      also: [{ clipId: circle.id, glyphs: "all" }],
    }),
  });
  return b.project;
}

/** Shapes repainted by a Transform, and shapes with a fill colour of their own (D123): Manim
 * interpolates a style linearly — the stroke's width, the two opacities with the clip's in them,
 * the two colours —, and `set_stroke` / `set_fill` leave alone what they do not name. A box fitted
 * to three glyphs that moves and grows while its stroke thickens and fades and a fill of another
 * colour comes in (an `.animate` chain), then changes its stroke's colour alone, then fades as a
 * whole while its stroke thins; a disc with a fill colour of its own that turns (`_Tween`) while
 * its stroke thickens and both colours change, then turns on with other opacities; a ring whose
 * fill fades in in the stroke's colour, follows it to another (`set_color`) and comes back from a
 * there-and-back repaint; an underline and a cross that only have a stroke, the cross turning; and
 * a tile with a fill colour of its own that no Transform touches, drawn border then fill at the
 * clip's opacity 0.8 and faded out. */
function shapePaints(): Project {
  const b = new Builder("Shape paints");
  const t1 = b.track("Formula");
  const t2 = b.track("Box");
  const t3 = b.track("Disc");
  const t4 = b.track("Ring");
  const t5 = b.track("Underline");
  const t6 = b.track("Cross");
  const t7 = b.track("Tile");
  const f1 = b.formula("poly", "x^2+bx+c");
  const c1 = b.clip(f1, t1, 0, 8, {
    intro: intro({ kind: "write", duration: 1 }),
    initial: { position: [0, 2.4] },
  });
  b.clip(b.shape("box", { cornerRadius: 0.15 }), t2, 1.5, 8, {
    actions: [
      createTween(
        0.5,
        1,
        {
          position: [-3, 0.6],
          scale: 1.2,
          strokeWidth: 8,
          strokeOpacity: 0.5,
          fillOpacity: 0.6,
          fillColor: BLUE,
        },
        "linear",
      ),
      createTween(2, 1, { color: GREEN, fillOpacity: 0.2 }, "smooth"),
      createTween(3.5, 1, { opacity: 0.4, strokeWidth: 2 }, "smooth"),
    ],
    attach: createShapeAttach(c1.id, [3, 4, 5], 0.15),
  });
  b.clip(
    b.shape("disc", {
      shape: "circle",
      width: 1.4,
      height: 1.4,
      color: RED,
      fillColor: YELLOW,
      style: { fillOpacity: 0.5, strokeWidth: 4, strokeOpacity: 1 },
    }),
    t3,
    0.5,
    8,
    {
      initial: { position: [3.5, 0] },
      actions: [
        createTween(
          1,
          1.5,
          { rotation: 90, scale: 1.5, strokeWidth: 10, fillColor: GREEN, color: BLUE },
          "linear",
        ),
        createTween(
          3,
          1,
          { rotation: 180, fillOpacity: 1, strokeOpacity: 0.3, opacity: 0.6 },
          "smooth",
        ),
      ],
    },
  );
  b.clip(b.shape("ring", { shape: "circle", width: 1.2, height: 1.2, color: YELLOW }), t4, 0.5, 8, {
    initial: { position: [-4.5, -2] },
    actions: [
      createTween(1, 1, { fillOpacity: 0.7 }, "linear"),
      createTween(2.5, 1, { color: RED }, "linear"),
      createTween(4, 1.5, { strokeWidth: 12, fillColor: BLUE }, "there_and_back"),
    ],
  });
  b.clip(b.shape("line", { shape: "underline", color: BLUE }), t5, 1.5, 8, {
    actions: [createTween(1, 1, { strokeWidth: 10, strokeOpacity: 0.5 }, "linear")],
    attach: createShapeAttach(c1.id, "all", 0.2),
  });
  b.clip(b.shape("cross", { shape: "cross" }), t6, 1.5, 8, {
    actions: [createTween(1.5, 1, { strokeWidth: 2, color: YELLOW, rotation: 30 }, "linear")],
    attach: createShapeAttach(c1.id, [5, 6], 0),
  });
  b.clip(
    b.shape("tile", {
      width: 1.6,
      height: 1,
      color: GREEN,
      fillColor: RED,
      style: { fillOpacity: 0.5, strokeWidth: 6, strokeOpacity: 1 },
    }),
    t7,
    0.5,
    8,
    {
      intro: intro({ kind: "draw_border_then_fill", duration: 1 }),
      outro: outro({ kind: "fade_out", duration: 0.5 }),
      initial: { position: [0, -2.4], opacity: 0.8 },
    },
  );
  return b.project;
}

/** Shapes carried to other glyphs by a tween (D123): Manim plays `Transform(shape, new)` with
 * the new shape built on the target when the tween starts. Two formulas, the second of which
 * moves, grows and turns over [3, 4): a rounded box around two glyphs of the first that goes to
 * two glyphs of the second before it moves, then back to two of the first while its stroke
 * thickens and reddens and a yellow fill comes in, and is then moved, scaled and turned from
 * there by a plain tween; a circle that is scaled and turned first — its points cut across on the
 * way —, goes to the whole of the second formula where its move left it (turned: the anchors' box
 * and the box of every point differ), and then there and back to glyphs of both formulas while it
 * fades; an underline that goes under the second formula as it was before its move; a cross that
 * goes over one glyph while its lines thin; a detached highlight, at the gap of a new shape,
 * carried to three glyphs; and a brace made under the box once it has arrived. */
function shapeFits(): Project {
  const b = new Builder("Shape fits");
  const t0 = b.track("Behind");
  const t1 = b.track("Formula");
  const t2 = b.track("Roots");
  const t3 = b.track("Box");
  const t4 = b.track("Circle");
  const t5 = b.track("Underline");
  const t6 = b.track("Cross");
  const t7 = b.track("Brace");
  const f1 = b.formula("poly", "x^2+bx+c", { glyphColors: { "3": YELLOW } });
  const f2 = b.formula("roots", "x=-1", { color: BLUE, fontSize: 60 });
  const c1 = b.clip(f1, t1, 0, 9, {
    intro: intro({ kind: "write", duration: 1 }),
    initial: { position: [-2.5, 2] },
  });
  const c2 = b.clip(f2, t2, 0, 9, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    initial: { position: [2.5, -1] },
    actions: [createTween(3, 1, { position: [3, 0.5], scale: 1.3, rotation: 20 }, "smooth")],
  });
  const box = b.clip(b.shape("box", { cornerRadius: 0.15 }), t3, 1.5, 9, {
    attach: createShapeAttach(c1.id, [0, 1], 0.15),
    actions: [
      createFitTween(0.5, 1, { clipId: c2.id, glyphs: [0, 1] }, [], {}, "linear"),
      createFitTween(
        3,
        1,
        { clipId: c1.id, glyphs: [5, 6] },
        [],
        { color: RED, strokeWidth: 8, fillOpacity: 0.4, fillColor: YELLOW },
        "smooth",
      ),
      createTween(5, 1, { position: [0, -2.5], scale: 1.5, rotation: 30 }, "smooth"),
    ],
  });
  b.clip(b.shape("circle", { shape: "circle", color: GREEN }), t4, 1.5, 9, {
    attach: createShapeAttach(c1.id, [3], 0.1),
    actions: [
      createTween(0.5, 0.5, { scale: 1.5, rotation: 45 }, "linear"),
      createFitTween(3, 1, { clipId: c2.id, glyphs: "all" }, [], {}, "linear"),
      createFitTween(
        5,
        1.5,
        { clipId: c1.id, glyphs: [0] },
        [{ clipId: c2.id, glyphs: [3] }],
        { opacity: 0.5 },
        "there_and_back",
      ),
    ],
  });
  b.clip(b.shape("line", { shape: "underline", color: BLUE }), t5, 1.5, 9, {
    attach: createShapeAttach(c1.id, "all", 0.2),
    actions: [createFitTween(1, 1, { clipId: c2.id, glyphs: "all" }, [], {}, "smooth")],
  });
  b.clip(b.shape("cross", { shape: "cross" }), t6, 1.5, 9, {
    attach: createShapeAttach(c1.id, [2], 0),
    actions: [
      createFitTween(4, 1, { clipId: c2.id, glyphs: [1] }, [], { strokeWidth: 3 }, "linear"),
    ],
  });
  b.clip(
    b.shape("free", {
      width: 1.5,
      height: 0.8,
      color: YELLOW,
      style: { fillOpacity: 0.3, strokeWidth: 0, strokeOpacity: 0 },
    }),
    t0,
    0.5,
    9,
    {
      initial: { position: [-4.5, -2.5] },
      actions: [createFitTween(1, 1, { clipId: c1.id, glyphs: [2, 3, 4] }, [], {}, "smooth")],
    },
  );
  b.clip(b.brace("under", { color: BLUE }), t7, 3.2, 9, {
    attach: createBraceAttach(box.id, "all", { direction: 0, buff: 0.2 }),
  });
  return b.project;
}

/** Shapes carried to an attached object that comes on later (D123, `attach-target-hidden`): the
 * editor measures such a target where it will be, and the Python builds it there before the tween
 * that reads it. A formula that moves over [2, 3); on it, from 3 s, a box around two glyphs and a
 * label above three, scaled and turned, and from 4 s a brace under it all, with a label at its
 * tip from 4.5 s. Free shapes are carried there ahead of time — each to where its target will be
 * once the formula has moved, not to where the formula is —: a box at 1 s to the box to come, a
 * circle at 1.2 s to two glyphs of the label, a box at 1.4 s to the brace, a circle at 1.6 s to
 * the label of the brace, and a box at 1.8 s to the box to come and a glyph of the label
 * together. A last circle goes to the label in the very instant the label comes on. */
function futureFits(): Project {
  const b = new Builder("Future fits");
  const t1 = b.track("Formula");
  const t2 = b.track("Box to come");
  const t3 = b.track("Label to come");
  const t4 = b.track("Brace to come");
  const t5 = b.track("Tip to come");
  const t6 = b.track("To the box");
  const t7 = b.track("To the label");
  const t8 = b.track("To the brace");
  const t9 = b.track("To the tip");
  const t10 = b.track("To both");
  const t11 = b.track("At its start");
  const c1 = b.clip(b.formula("poly", "x^2+bx+c"), t1, 0, 6, {
    initial: { position: [-2.5, 1.5] },
    actions: [createTween(2, 1, { position: [1, 0.5] }, "smooth")],
  });
  const box = b.clip(b.shape("late", { color: GREEN }), t2, 3, 6, {
    attach: createShapeAttach(c1.id, [0, 1], 0.2),
  });
  const label = b.clip(b.formula("note", "y=2", { color: BLUE }), t3, 3, 6, {
    initial: { scale: 0.8, rotation: -15 },
    attach: createAttach(c1.id, [3, 4, 5], { side: "up", buff: 0.4 }),
  });
  const brace = b.clip(b.brace("under", { color: RED }), t4, 4, 6, {
    attach: createBraceAttach(c1.id, "all", { direction: 0, buff: 0.2 }),
  });
  const tip = b.clip(b.formula("total", "s"), t5, 4.5, 6, {
    attach: createTipAttach(brace.id),
  });
  const free = (
    name: string,
    track: Track,
    position: [number, number],
    circle: boolean,
    at: number,
    target: { clipId: string; glyphs: "all" | number[] },
    also: { clipId: string; glyphs: "all" | number[] }[] = [],
  ) =>
    b.clip(
      b.shape(name, { width: 1, height: 0.6, ...(circle ? { shape: "circle" as const } : {}) }),
      track,
      0,
      6,
      {
        initial: { position },
        actions: [createFitTween(at, 1, target, also, {}, "linear")],
      },
    );
  free("first", t6, [-5, -2.5], false, 1, { clipId: box.id, glyphs: "all" });
  free("second", t7, [5, 2.5], true, 1.2, { clipId: label.id, glyphs: [0, 1] });
  free("third", t8, [-5, 2.5], false, 1.4, { clipId: brace.id, glyphs: "all" });
  free("fourth", t9, [5, -2.5], true, 1.6, { clipId: tip.id, glyphs: "all" });
  free("fifth", t10, [0, -3], false, 1.8, { clipId: box.id, glyphs: "all" }, [
    { clipId: label.id, glyphs: [2] },
  ]);
  free("sixth", t11, [0, 3], true, 3, { clipId: label.id, glyphs: "all" });
  return b.project;
}

/** Cross lines (D128): one line over a diagonal of its target's box, as each line of Manim's
 * `Cross` — fitted like a cross in each library (`_cross_line` builds the cross and takes a line of
 * it) and drawn from the corner its diagonal starts at. A rising line over two glyphs, created
 * from the lower left corner, then thickened, faded and recoloured, with a brace under it; a
 * falling one over two others, created from the upper left corner and then moved, scaled and
 * turned; a rising one over the whole of a formula that was moved and turned first (the anchors'
 * box and the box of every point then differ), faded out; a detached falling one carried to two
 * glyphs while it thickens; and a rising one over one glyph carried to a glyph of the other
 * formula. */
function crossLines(): Project {
  const b = new Builder("Cross lines");
  const t1 = b.track("Formula");
  const t2 = b.track("Roots");
  const t3 = b.track("Rising");
  const t4 = b.track("Falling");
  const t5 = b.track("Whole");
  const t6 = b.track("Free");
  const t7 = b.track("Carried");
  const t8 = b.track("Brace");
  const f1 = b.formula("poly", "x^2+bx+c", { glyphColors: { "3": YELLOW } });
  const f2 = b.formula("roots", "x=-1", { color: BLUE, fontSize: 60 });
  const c1 = b.clip(f1, t1, 0, 9, {
    intro: intro({ kind: "write", duration: 1 }),
    initial: { position: [-2.5, 2] },
  });
  const c2 = b.clip(f2, t2, 0, 9, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    initial: { position: [2.5, -1] },
    actions: [createTween(3, 1, { position: [3, 0.5], scale: 1.3, rotation: 20 }, "smooth")],
  });
  const rising = b.clip(b.shape("rising", { shape: "cross_line" }), t3, 1.5, 9, {
    intro: intro({ kind: "create", duration: 1 }),
    attach: createShapeAttach(c1.id, [0, 1], 0),
    actions: [
      createTween(2, 1, { color: GREEN, strokeWidth: 10, strokeOpacity: 0.5 }, "smooth"),
    ],
  });
  b.clip(
    b.shape("falling", {
      shape: "cross_line",
      diagonal: "ul_dr",
      color: BLUE,
      style: { fillOpacity: 0, strokeWidth: 3, strokeOpacity: 1 },
    }),
    t4,
    1.5,
    9,
    {
      intro: intro({ kind: "create", duration: 0.5 }),
      attach: createShapeAttach(c1.id, [3, 4], 0),
      actions: [createTween(1, 1, { position: [-4, -1], scale: 1.4, rotation: 25 }, "smooth")],
    },
  );
  b.clip(b.shape("whole", { shape: "cross_line", diagonal: "dl_ur" }), t5, 4.5, 9, {
    attach: createShapeAttach(c2.id, "all", 0),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
  });
  b.clip(
    b.shape("free", {
      shape: "cross_line",
      diagonal: "ul_dr",
      width: 1.5,
      height: 0.8,
      color: YELLOW,
    }),
    t6,
    0.5,
    9,
    {
      initial: { position: [-4.5, -2.5] },
      actions: [
        createFitTween(1, 1, { clipId: c1.id, glyphs: [5, 6] }, [], { strokeWidth: 8 }, "smooth"),
      ],
    },
  );
  b.clip(b.shape("carried", { shape: "cross_line" }), t7, 1.5, 9, {
    attach: createShapeAttach(c1.id, [2], 0),
    actions: [createFitTween(3.5, 1, { clipId: c2.id, glyphs: [1] }, [], {}, "linear")],
  });
  b.clip(b.brace("under", { color: BLUE }), t8, 5, 9, {
    attach: createBraceAttach(rising.id, "all", { direction: 0, buff: 0.2 }),
  });
  return b.project;
}

/** Lines and arrows (D137): each end on glyphs of a clip or at a point, measured when the line's
 * clip starts. Two formulas apart, the first moved, scaled and turned over [2, 3). On them: a
 * double arrow between one glyph of each from 1 s — before the first moves —, faded in and out; a
 * dashed line from a point to the second formula, created and uncreated; an arrow from two glyphs
 * of the first to the whole second from 3.5 s — where the first has come to rest —, created, then
 * moved and recoloured; a line from a glyph to a glyph of the same formula; and an arrow to a
 * formula that only appears later, built where that formula will be. Free ones: a line that is
 * written, moved and faded; a short arrow and a short double arrow, whose tips and strokes Manim
 * caps; an arrow at half opacity; and one line object on two clips, the second a copy lower
 * down. */
function arrows(): Project {
  const b = new Builder("Arrows");
  const t1 = b.track("Arrows");
  const t2 = b.track("Lines");
  const t3 = b.track("Free");
  const t4 = b.track("Short");
  const t5 = b.track("Copies");
  const t9 = b.track("Under");
  const t10 = b.track("Tiny");
  const t6 = b.track("Left");
  const t7 = b.track("Right");
  const t8 = b.track("Late");
  const f1 = b.formula("poly", "x^2+bx+c", { glyphColors: { "3": YELLOW } });
  const f2 = b.formula("slope", "y=mx", { color: BLUE, fontSize: 60 });
  const f3 = b.formula("late", "z", { fontSize: 72 });
  const c1 = b.clip(f1, t6, 0, 9, {
    intro: intro({ kind: "write", duration: 0.8 }),
    initial: { position: [-3.5, 1.5] },
    actions: [createTween(2, 1, { position: [-3, 2.25], scale: 1.2, rotation: 15 }, "smooth")],
  });
  const c2 = b.clip(f2, t7, 0, 9, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    initial: { position: [3, -0.5] },
  });
  const c3 = b.clip(f3, t8, 5, 9, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    initial: { position: [0, -3] },
  });
  // Between a glyph of each, while the first formula is still where it started.
  b.clip(b.line("both", { line: "double_arrow", color: GREEN }), t1, 1, 3.3, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    attach: createEndsAttach({ clipId: c1.id, glyphs: [6] }, { clipId: c2.id, glyphs: [0] }, 0.25),
  });
  // From a point to the whole of the second formula.
  b.clip(b.line("dashes", { line: "dashed", color: YELLOW, dashLength: 0.1 }), t2, 1.5, 8, {
    intro: intro({ kind: "create", duration: 1 }),
    outro: outro({ kind: "uncreate", duration: 0.8 }),
    attach: createEndsAttach({ point: [5.5, 3] }, { clipId: c2.id, glyphs: "all", anchor: "ur" }, 0.1),
  });
  // From two glyphs of the first, moved and turned by then, to the second; then it moves on.
  b.clip(b.line("points", { line: "arrow" }), t1, 3.5, 9, {
    intro: intro({ kind: "create", duration: 0.8 }),
    attach: createEndsAttach({ clipId: c1.id, glyphs: [0, 1] }, { clipId: c2.id, glyphs: "all" }, 0.25),
    actions: [createTween(2, 1, { position: [0.5, 2.5], color: YELLOW }, "smooth")],
  });
  // Two glyphs of one formula, joined under it.
  b.clip(b.line("under", { color: BLUE, strokeWidth: 2 }), t9, 4, 9, {
    attach: createEndsAttach(
      { clipId: c1.id, glyphs: [2], anchor: "dl" },
      { clipId: c1.id, glyphs: [5], anchor: "down" },
      0.05,
    ),
  });
  // To a formula that comes on later: measured where it will be.
  b.clip(b.line("ahead", { line: "arrow", color: BLUE, tipLength: 0.25 }), t3, 4.3, 9, {
    intro: intro({ kind: "write", duration: 0.5 }),
    attach: createEndsAttach({ point: [-5, -3] }, { clipId: c3.id, glyphs: "all", anchor: "left" }, 0.3),
  });
  // Free: written, moved and faded.
  b.clip(b.line("free", { vector: [2.5, -0.75], strokeWidth: 8 }), t3, 0.3, 4, {
    intro: intro({ kind: "write", duration: 0.5 }),
    outro: outro({ kind: "unwrite", duration: 0.5 }),
    initial: { position: [-4.5, -1.5] },
    actions: [createTween(1, 1, { position: [-4, -2.25], opacity: 0.4 }, "smooth")],
  });
  // Short ones: the tip is a quarter of the arrow, the stroke thinner than asked.
  b.clip(b.line("short", { line: "arrow", vector: [0.6, 0.3] }), t4, 0.5, 9, {
    initial: { position: [5.5, -3] },
  });
  b.clip(b.line("tiny", { line: "double_arrow", vector: [0.5, 0], color: YELLOW }), t10, 0.5, 9, {
    initial: { position: [4.5, -3.25], opacity: 0.5 },
    intro: intro({ kind: "create", duration: 0.5 }),
  });
  // One object, two clips: the second is the same line lower down.
  const twice = b.line("twice", { line: "dashed", vector: [1.5, 0.5] });
  b.clip(twice, t5, 0.5, 9, { initial: { position: [-0.5, -1] } });
  b.clip(twice, t7, 9, 9.8, { initial: { position: [-0.5, -2] } });
  return b.project;
}

/** Curved lines and arrows, and the tips that are not the triangle (D145, D146): an arc by each
 * class's `path_arc=` and a spline by the `_spline` helper, of each kind, on glyphs — with the gap
 * Manim leaves along an arc — and free; a stealth tip and a dot, one shape at each end of a double
 * arrow, by ManimCE's own classes and, in ManimGL, its own dot and the `_arrow` helper; the dashes
 * of a spline by `_dashed`. Short ones take the caps of an arrow on a curve; an arc with two clips
 * is built, for each, between the points its gap was taken from. Three arrows — straight, an arc
 * with two tips, a spline — come in with `GrowArrow`, from their start. */
function curves(): Project {
  const b = new Builder("Curves");
  const tracks = Array.from({ length: 13 }, (_, k) => b.track(`Line ${k + 1}`));
  const t6 = b.track("Left");
  const t7 = b.track("Right");
  const f1 = b.formula("poly", "x^2+bx+c", { glyphColors: { "3": YELLOW } });
  const f2 = b.formula("slope", "y=mx", { color: BLUE, fontSize: 60 });
  const c1 = b.clip(f1, t6, 0, 9, {
    intro: intro({ kind: "write", duration: 0.8 }),
    initial: { position: [-3.5, 1.5] },
  });
  const c2 = b.clip(f2, t7, 0, 9, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    initial: { position: [3, -0.5] },
  });
  const arc = (degrees: number): LineCurve => ({ shape: "arc", degrees, trim: 0 });
  const node = (
    at: [number, number],
    into: [number, number] | null,
    out: [number, number] | null,
  ) => ({ at, in: into, out, smooth: false });
  const s: LineCurve = { shape: "spline", nodes: [node([0, 0], null, [0.3, 0.4]), node([1, 0], [0.7, -0.4], null)] };
  const bow: LineCurve = { shape: "spline", nodes: [node([0, 0], null, [0.25, 0.5]), node([1, 0], null, null)] };
  const corner: LineCurve = {
    shape: "spline",
    nodes: [node([0, 0], null, null), node([0.35, 0.3], null, [0.5, 0.45]), node([1, 0], [0.9, 0.35], null)],
  };
  // An arc between a glyph of each, with a stealth tip: the gap is left along the arc.
  b.clip(b.line("arc", { line: "arrow", color: GREEN, curve: arc(30), tip: "stealth" }), tracks[0]!, 1, 9, {
    intro: intro({ kind: "create", duration: 0.8 }),
    attach: createEndsAttach({ clipId: c1.id, glyphs: [6] }, { clipId: c2.id, glyphs: [0] }, 0.25),
  });
  // The other way round, between a corner of the one and a point: a dot and a triangle.
  b.clip(
    b.line("both", { line: "double_arrow", color: YELLOW, curve: arc(-60), tip: "dot" }),
    tracks[1]!,
    1.5,
    9,
    {
      intro: intro({ kind: "grow_arrow", duration: 0.8 }),
      attach: createEndsAttach({ clipId: c1.id, glyphs: "all", anchor: "dl" }, { point: [1, -3] }, 0.25),
    },
  );
  // A quarter turn of dashes from a point to the whole of the second formula.
  b.clip(b.line("dashes", { line: "dashed", curve: arc(90), dashLength: 0.1 }), tracks[2]!, 1.5, 8, {
    intro: intro({ kind: "create", duration: 1 }),
    outro: outro({ kind: "uncreate", duration: 0.8 }),
    attach: createEndsAttach({ point: [5.5, 3] }, { clipId: c2.id, glyphs: "all" }, 0.1),
  });
  // A clockwise arc with a gap, where ManimGL measures the arc by the distance between its ends.
  b.clip(b.line("clockwise", { color: BLUE, curve: arc(-120) }), tracks[3]!, 2, 9, {
    intro: intro({ kind: "write", duration: 0.5 }),
    attach: createEndsAttach({ clipId: c1.id, glyphs: [0, 1] }, { clipId: c2.id, glyphs: "all", anchor: "up" }, 0.3),
  });
  // A free arc: written, moved and faded.
  b.clip(b.line("free", { vector: [2.5, -0.75], strokeWidth: 8, curve: arc(150) }), tracks[4]!, 0.3, 4, {
    intro: intro({ kind: "write", duration: 0.5 }),
    outro: outro({ kind: "unwrite", duration: 0.5 }),
    initial: { position: [-4.5, -1.5] },
    actions: [createTween(1, 1, { position: [-4, -2.25], opacity: 0.4 }, "smooth")],
  });
  // Splines: an S with a tip between glyphs, a bow with two, dashes, and a corner.
  b.clip(b.line("wave", { line: "arrow", color: YELLOW, curve: s }), tracks[5]!, 3, 9, {
    intro: intro({ kind: "grow_arrow", duration: 0.8, easing: "linear" }),
    attach: createEndsAttach({ clipId: c1.id, glyphs: [2], anchor: "down" }, { clipId: c2.id, glyphs: [3] }, 0.25),
  });
  b.clip(
    b.line("bow", { line: "double_arrow", vector: [3, 0.5], curve: bow, tip: "stealth", startTip: "dot" }),
    tracks[6]!,
    0.5,
    9,
    { initial: { position: [-1, -3] }, intro: intro({ kind: "fade_in", duration: 0.5 }) },
  );
  b.clip(b.line("beads", { line: "dashed", color: GREEN, curve: s, dashLength: 0.15 }), tracks[7]!, 2.5, 9, {
    intro: intro({ kind: "create", duration: 0.8 }),
    attach: createEndsAttach({ point: [-6, 3.5] }, { clipId: c1.id, glyphs: "all", anchor: "ul" }, 0.1),
  });
  b.clip(b.line("corner", { vector: [2, 1], color: BLUE, curve: corner }), tracks[8]!, 0.5, 9, {
    initial: { position: [5, 2] },
    actions: [createTween(4, 1, { position: [5, 1.5], color: YELLOW }, "smooth")],
  });
  // Straight, with the other tips; and short ones, whose tips and stroke are capped.
  b.clip(b.line("dot", { line: "arrow", vector: [1.5, 0], tip: "dot" }), tracks[9]!, 0.5, 9, {
    initial: { position: [-5.5, -3.5] },
    intro: intro({ kind: "grow_arrow", duration: 1 }),
  });
  b.clip(
    b.line("notched", { line: "double_arrow", vector: [0, 1.5], tip: "stealth", startTip: "stealth" }),
    tracks[10]!,
    0.5,
    9,
    { initial: { position: [6.3, -2] } },
  );
  b.clip(b.line("short", { line: "arrow", vector: [0.6, 0.3], curve: arc(80), tip: "dot" }), tracks[11]!, 0.5, 4, {
    initial: { position: [5.5, -3] },
  });
  b.clip(
    b.line("tiny", { line: "double_arrow", vector: [0.5, 0.1], color: YELLOW, curve: bow, startTip: "stealth" }),
    tracks[11]!,
    4,
    9,
    { initial: { position: [5.5, -3.2], opacity: 0.5 }, intro: intro({ kind: "create", duration: 0.5 }) },
  );
  // One arc, two clips, free since its ends were let go: it keeps the part its gap took, and
  // each clip is built between the points that gap was taken from.
  const twice = b.line("twice", {
    line: "arrow",
    vector: [1.2, -0.8],
    curve: { shape: "arc", degrees: 100, trim: 0.12 },
    tipLength: 0.25,
  });
  b.clip(twice, tracks[12]!, 0.5, 4, { initial: { position: [-5.8, -0.7] } });
  b.clip(twice, tracks[12]!, 4, 9, { initial: { position: [-5.8, -1.7] } });
  // One arc on glyphs, two clips: the second runs along what the first is fitted to.
  const pair = b.line("pair", { color: GREEN, curve: arc(60) });
  b.clip(pair, tracks[4]!, 4.5, 6.5, {
    attach: createEndsAttach({ clipId: c2.id, glyphs: [1], anchor: "down" }, { point: [4, -3.5] }, 0.2),
  });
  b.clip(pair, tracks[4]!, 6.5, 9, {
    attach: createEndsAttach({ clipId: c2.id, glyphs: [2], anchor: "down" }, { point: [4.5, -3.5] }, 0.2),
  });
  return b.project;
}

/* Tweens that carry the ends of a line (D144): an arrow and a double arrow built anew between
 * their new ends by `Transform` — onto glyphs, to points, to a line too short for its tip and its
 * stroke, an arc that takes other degrees —; a line and a dashed line carried as they are by
 * `put_start_and_end_on`, straight, an arc and a spline, with another stroke width, colour and
 * opacity; the dashes of a spline by `_carried`; a line whose arc takes other degrees, built
 * anew, then cut by an outro; an easing that comes back; a plain tween after one of them. Some
 * overlap, and play in parts. */
function lineEnds(): Project {
  const b = new Builder("Line ends");
  const tracks = Array.from({ length: 9 }, (_, k) => b.track(`Line ${k + 1}`));
  const t1 = b.track("Left");
  const t2 = b.track("Right");
  const f1 = b.formula("poly", "x^2+bx+c", { glyphColors: { "3": YELLOW } });
  const f2 = b.formula("slope", "y=mx", { color: BLUE, fontSize: 60 });
  const c1 = b.clip(f1, t1, 0, 9, { initial: { position: [-3.5, 2.5] } });
  const c2 = b.clip(f2, t2, 0, 9, { initial: { position: [3, 1] } });
  const arc = (degrees: number): LineCurve => ({ shape: "arc", degrees, trim: 0 });
  const node = (
    at: [number, number],
    into: [number, number] | null,
    out: [number, number] | null,
  ) => ({ at, in: into, out, smooth: false });
  const s: LineCurve = { shape: "spline", nodes: [node([0, 0], null, [0.3, 0.4]), node([1, 0], [0.7, -0.4], null)] };
  const at = (x: number, y: number) => ({ point: [x, y] as [number, number] });
  // An arrow: onto a glyph of each formula, then to a line too short for its tip and its stroke,
  // in another colour, then moved as it is.
  b.clip(b.line("arrow", { line: "arrow", vector: [2, 0], color: YELLOW }), tracks[0]!, 0.5, 9, {
    initial: { position: [-5, -1] },
    actions: [
      createEndsTween(1, 0.8, {
        start: { clipId: c1.id, glyphs: [0], anchor: "down" },
        end: { clipId: c2.id, glyphs: [0], anchor: "auto" },
        buff: 0.25,
      }),
      createEndsTween(2.5, 0.6, { start: at(-2, -3.6), end: at(-2, -3) }, { strokeWidth: 9, color: RED }),
      createTween(4, 0.5, { position: [-1, -3.3] }),
    ],
  });
  // A double arrow on an arc: to two points with other degrees, thinner and half there; then
  // back the other way round, an end on the second formula.
  b.clip(
    b.line("both", { line: "double_arrow", vector: [2, 0.5], curve: arc(60), tip: "stealth", startTip: "dot" }),
    tracks[1]!,
    0.5,
    9,
    {
      initial: { position: [-5, -2.5] },
      outro: outro({ kind: "fade_out", duration: 0.5 }),
      actions: [
        createEndsTween(1.3, 0.7, { start: at(-6.5, 0), end: at(-4.5, -1.2), degrees: 150 }, { strokeWidth: 3, opacity: 0.5 }),
        createEndsTween(
          3,
          0.8,
          { start: at(0, -1), end: { clipId: c2.id, glyphs: "all", anchor: "down" }, buff: 0.2, degrees: -45 },
          { opacity: 1 },
          "linear",
        ),
      ],
    },
  );
  // A line: an end on a glyph and one at a point, thinner; then away and back.
  b.clip(b.line("line", { vector: [1.5, 1] }), tracks[2]!, 0.5, 9, {
    initial: { position: [0, 3] },
    actions: [
      createEndsTween(1.6, 0.6, { start: { clipId: c1.id, glyphs: [3], anchor: "up" }, end: at(-1, 3.6), buff: 0.1 }, { strokeWidth: 2 }),
      createEndsTween(3.5, 1, { start: at(0, 3.7), end: at(2, 3.2) }, { color: GREEN }, "there_and_back"),
    ],
  });
  // An arc: carried as it is, then built anew with other degrees on a glyph, and cut by its outro.
  b.clip(b.line("bow", { vector: [2, 0], curve: arc(60), color: GREEN }), tracks[3]!, 0.5, 8, {
    initial: { position: [5.5, 3] },
    outro: outro({ kind: "uncreate", duration: 0.6 }),
    actions: [
      createEndsTween(1, 0.5, { start: at(4.5, 2.2), end: at(6.5, 3.4) }),
      createEndsTween(
        2.6,
        0.8,
        { start: { clipId: c2.id, glyphs: [3], anchor: "right" }, end: at(6.5, -0.5), buff: 0.15, degrees: -45 },
        { color: RED },
      ),
      createEndsTween(4.5, 0.6, { start: at(5, 0), end: at(6.8, 1.5), degrees: 200 }),
    ],
  });
  // Dashed lines: the same dashes however long — straight with another stroke, an arc onto a
  // glyph, and the dashes of a spline, which a helper carries.
  b.clip(b.line("dashes", { line: "dashed", vector: [2, 0], dashLength: 0.15 }), tracks[4]!, 0.5, 9, {
    initial: { position: [-5.5, 0.8] },
    actions: [createEndsTween(1.1, 0.7, { start: at(-6.6, 1.6), end: at(-6.2, 0.2) }, { strokeWidth: 8, color: YELLOW })],
  });
  b.clip(b.line("beads", { line: "dashed", vector: [1.5, -0.5], dashLength: 0.1, curve: arc(90) }), tracks[5]!, 0.5, 9, {
    initial: { position: [1, -2.8] },
    actions: [
      createEndsTween(2, 0.8, { start: { clipId: c2.id, glyphs: [1], anchor: "down" }, end: at(4.5, -3), buff: 0.2 }),
    ],
  });
  b.clip(b.line("pearls", { line: "dashed", vector: [2, 0.4], dashLength: 0.12, curve: s, color: BLUE }), tracks[6]!, 0.5, 9, {
    initial: { position: [5, -1.8] },
    actions: [
      createEndsTween(1.4, 0.6, { start: at(3.5, -2), end: at(6.8, -3.4) }, { opacity: 0.6, strokeWidth: 6 }),
      createEndsTween(3, 0.5, { start: at(6.8, -3.4), end: { clipId: c2.id, glyphs: "all", anchor: "dr" }, buff: 0.1 }),
    ],
  });
  // Splines keep their shape between their new ends: a line carried, an arrow built anew.
  b.clip(b.line("wave", { vector: [2, 0], curve: s }), tracks[7]!, 0.5, 9, {
    initial: { position: [-3.5, 0.3] },
    actions: [createEndsTween(1.2, 0.9, { start: at(-4.5, 0.9), end: at(-2.2, -0.4) }, { strokeWidth: 7 })],
  });
  b.clip(b.line("swirl", { line: "arrow", vector: [1.6, 0.4], curve: s, tip: "stealth", color: RED }), tracks[8]!, 0.5, 9, {
    initial: { position: [-3.3, -1.7] },
    intro: intro({ kind: "grow_arrow", duration: 0.5 }),
    actions: [
      createEndsTween(2.2, 0.7, { start: { clipId: c1.id, glyphs: [5, 6], anchor: "down" }, end: at(0.5, 0.3), buff: 0.2 }),
    ],
  });
  return b.project;
}

/** An outline drawn after a tween that turned the formula (`_Tween`) and changed its opacity or
 * its colour: the outline is the glyph's stroke, so the stroke has to arrive where the fill does.
 * Top left: faded by a plain tween (`.animate.set_opacity`, fill and stroke), then brought back
 * while turning — unwritten at full opacity. Top right: faded while turning — unwritten at that
 * opacity. Bottom left: recoloured while turning — uncreated in the new colour. Bottom right: two
 * glyphs turned and faded as a part — unwritten at that opacity, then written back. */
function tweenOutline(): Project {
  const b = new Builder("Tween outline");
  const t1 = b.track("Back and up");
  const t2 = b.track("Faded");
  const t3 = b.track("Recoloured");
  const t4 = b.track("Part");
  b.clip(b.formula("ab", "ab"), t1, 0, 4, {
    outro: outro({ kind: "unwrite", duration: 1 }),
    initial: { position: [-3, 1.5], scale: 2 },
    actions: [
      createTween(0.5, 0.5, { opacity: 0.4 }),
      createTween(1.2, 0.6, { opacity: 1, rotation: 30 }),
    ],
  });
  b.clip(b.formula("cd", "cd"), t2, 0, 4, {
    outro: outro({ kind: "unwrite", duration: 1 }),
    initial: { position: [3, 1.5], scale: 2 },
    actions: [createTween(0.5, 0.6, { opacity: 0.5, rotation: -30 })],
  });
  b.clip(b.formula("ef", "ef"), t3, 0, 4, {
    outro: outro({ kind: "uncreate", duration: 1 }),
    initial: { position: [-3, -1.5], scale: 2 },
    actions: [createTween(0.5, 0.6, { color: RED, rotation: 45 })],
  });
  b.clip(b.formula("ghi", "ghi"), t4, 0, 4, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [3, -1.5], scale: 2 },
    actions: [
      createPartTransform(0.5, [0, 1], { duration: 0.6, rotation: 90, opacity: 0.5 }),
      createDisappear(1.4, "unwrite", [0, 1], { duration: 0.8 }),
      createAppear(2.4, "write", [0, 1], { duration: 0.8 }),
    ],
  });
  return b.project;
}

export function syntheticCases(): ExportCase[] {
  return [
    { name: "intros-outros", project: introsOutros(), probe: true },
    { name: "tweens", project: tweens(), probe: true },
    { name: "relation-styles", project: relationStyles(), probe: true },
    { name: "splits-merges", project: splitsMerges(), probe: true },
    { name: "hidden-glyphs", project: hiddenGlyphs(), probe: true },
    { name: "overlaps", project: overlaps(), probe: true },
    { name: "appear-blocks", project: appearBlocks(), probe: true },
    { name: "disappear-blocks", project: disappearBlocks(), probe: true },
    {
      name: "blocks-beside-relations",
      project: blocksBesideRelations(),
      probe: true,
    },
    { name: "quadratic-blocks", project: quadraticBlocks(), probe: true },
    { name: "parallel-blocks", project: parallelBlocks(), probe: true },
    { name: "many-to-one", project: manyToOne(), probe: true },
    { name: "fraction-bars", project: fractionBars(), probe: true },
    { name: "part-transforms", project: partTransforms(), probe: true },
    {
      name: "multiline",
      project: multiline(),
      probe: true,
      mathjax: true,
    },
    { name: "morph-outro", project: morphOutro(), probe: true },
    { name: "morph-copies", project: morphCopies(), probe: true },
    { name: "custom-paths", project: customPaths(), probe: true },
    { name: "meta-variety", project: metaVariety(), probe: true },
    { name: "tex-text", project: texText(), probe: true },
    { name: "attach-next-to", project: attachNextTo(), probe: true },
    { name: "braces", project: braces(), probe: true },
    { name: "brace-labels", project: braceLabels(), probe: true },
    { name: "decorations", project: decorations(), probe: true },
    { name: "emphasis", project: emphasis(), probe: true, pixels: { t: 4.5 } },
    { name: "off-grid", project: offGrid(), probe: false },
    { name: "zero-glyphs", project: zeroGlyphs(), probe: true, mathjax: true },
    { name: "rebased-principal", project: rebasedPrincipal(), probe: true, mathjax: true },
    { name: "paint-channels", project: paintChannels(), probe: true, pixels: { t: 3.75 } },
    ...geometryCases(),
    { name: "pango-text", project: pangoText(), probe: true, pixels: { t: 2.1 } },
    { name: "pango-line", project: pangoLine(), probe: true },
    // A new case goes last: the ids of a case come from one sequence in the pinned Python, and
    // a case put before others would reorder what they play at the same instant.
    { name: "spanning", project: spanning(), probe: true },
    { name: "braces-on-shapes", project: bracesOnShapes(), probe: true },
    { name: "shape-paints", project: shapePaints(), probe: true },
    { name: "shape-fits", project: shapeFits(), probe: true },
    { name: "cross-lines", project: crossLines(), probe: true },
    { name: "future-fits", project: futureFits(), probe: true },
    { name: "arrows", project: arrows(), probe: true },
    { name: "curves", project: curves(), probe: true },
    { name: "line-ends", project: lineEnds(), probe: true },
    { name: "starts-empty", project: startsEmpty(), probe: true },
    { name: "relations-twice", project: relationsTwice(), probe: true },
    { name: "route-paths", project: routePaths(), probe: true },
    { name: "shared-targets", project: sharedTargets(), probe: true },
    { name: "split-clip", project: splitClip(), probe: true },
    { name: "split-left-out", project: splitLeftOut(), probe: true },
    { name: "fade-copies", project: fadeCopies(), probe: true },
    { name: "arrow-unwrites", project: arrowUnwrites(), probe: true },
    { name: "hidden-line-ends", project: hiddenLineEnds(), probe: true },
    { name: "grow-arrow-lags", project: growArrowLags(), probe: true },
    { name: "arrows-regrown", project: arrowsRegrown(), probe: true },
    { name: "loose-arcs", project: looseArcs(), probe: true },
    { name: "line-blocks", project: lineBlocks(), probe: true },
    { name: "fade-copy-paths", project: fadeCopyPaths(), probe: true },
    { name: "start-hidden-moves", project: startHiddenMoves(), probe: true },
    { name: "split-tex-ends", project: splitTexEnds(), probe: true, mathjax: true },
    { name: "camera-moves", project: cameraMoves(), probe: true, pixels: { t: 3.2 } },
    { name: "camera-cuts", project: cameraCuts(), probe: true },
    { name: "camera-portrait", project: cameraPortrait(), probe: true },
    // The last one made, at the end: the cases are built in a row with ids in sequence, so a
    // case put before another would renumber it, and with it the order of what it plays at once.
    { name: "tween-outline", project: tweenOutline(), probe: true },
    { name: "route-coincident", project: routeCoincident(), probe: true, mathjax: true },
    { name: "slide-marks", project: slideMarks(), probe: true },
    { name: "slide-pauses-camera", project: slidePausesCamera(), probe: true },
  ];
}

/* The camera cases run at 10 fps, with every time on that grid: the frames Manim films are then
 * the instants the preview is asked for, and a move starts on a frame as it starts in the editor. */

/** The scene's camera (D190): a move to a target camera, one to a frame of its own that zooms
 * out, one that goes there and back, and one back to the start, each alone in its time, with a
 * Write, a Create, a tween and a FadeOut between them. A box with a thick stroke is what the
 * camera closes in on: the frame compared pixel by pixel is the camera resting on its target,
 * where the stroke is drawn thicker by both libraries as by the preview. */
function cameraMoves(): Project {
  const b = new Builder("Camera moves", { width: 960, height: 540, fps: 10 });
  const t1 = b.track("Formula");
  const t2 = b.track("Box");
  const f1 = b.formula("sum", "a^2+b^2=c^2", { glyphColors: { "0": YELLOW } });
  b.clip(f1, t1, 0, 12, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "fade_out", duration: 1 }),
    initial: { position: [-1.5, 1] },
    actions: [createTween(5.5, 1, { position: [-1, 0.5], scale: 1.3 }, "smooth")],
  });
  const box = b.shape("box", {
    width: 2,
    height: 1.2,
    color: BLUE,
    style: { fillOpacity: 0, strokeWidth: 8, strokeOpacity: 1 },
  });
  b.clip(box, t2, 0, 12, {
    intro: intro({ kind: "create", duration: 1 }),
    initial: { position: [3, -1] },
  });
  b.project.camera = {
    initial: { center: [0, 0], height: 8 },
    targets: [{ id: "k_close", name: "Close up", center: [1, 0], height: 4.5 }],
    moves: [
      { id: "n_1", start: 1.5, duration: 1.5, easing: "smooth", to: { kind: "target", target: "k_close" } },
      {
        id: "n_2",
        start: 3.5,
        duration: 1,
        easing: "linear",
        to: { kind: "frame", frame: { center: [-1, 0.5], height: 12 } },
      },
      {
        id: "n_3",
        start: 7,
        duration: 1.2,
        easing: "there_and_back",
        to: { kind: "target", target: "k_close" },
      },
      { id: "n_4", start: 9, duration: 1, easing: "rush_from", to: { kind: "start" } },
    ],
  };
  return b.project;
}

/** A camera that starts away from Manim's own frame, and what cuts one of its moves: a dot that
 * appears and a square that goes, each without an animation, in the middle of the move, so that
 * the move is played in three parts. Then a FocusOn with the camera away (Manim sizes its disc
 * for its own frame, whatever the camera sees), and the way back to the start, which is the
 * frame the scene set at 0 s. */
function cameraCuts(): Project {
  const b = new Builder("Camera cuts", { fps: 10 });
  const t1 = b.track("Formula");
  const t2 = b.track("Dot");
  const t3 = b.track("Square");
  const f1 = b.formula("line", "y=mx+b");
  b.clip(f1, t1, 0, 8, {
    actions: [createEmphasis(4.5, "focus_on", "all", { duration: 1 })],
  });
  b.clip(b.shape("dot", { shape: "circle", width: 0.8, height: 0.8, color: GREEN }), t2, 2, 8, {
    initial: { position: [-2.5, 1.5] },
  });
  b.clip(b.shape("square", { width: 1, height: 1, color: RED }), t3, 0, 2.6, {
    initial: { position: [2.5, -1] },
  });
  b.project.camera = {
    initial: { center: [1, 0.5], height: 6 },
    targets: [],
    moves: [
      {
        id: "n_1",
        start: 1.4,
        duration: 2,
        easing: "smooth",
        to: { kind: "frame", frame: { center: [-1, 0], height: 9 } },
      },
      { id: "n_2", start: 6, duration: 1, easing: "smooth", to: { kind: "start" } },
    ],
  };
  return b.project;
}

/** A camera in a tall picture (9:16): its frame is as much narrower than tall as the picture,
 * at the start and on the move. */
function cameraPortrait(): Project {
  const b = new Builder("Camera portrait", { width: 270, height: 480, fps: 10 });
  const t1 = b.track("Formula");
  const f1 = b.formula("short", "x=1");
  b.clip(f1, t1, 0, 4, {
    intro: intro({ kind: "fade_in", duration: 0.6 }),
    initial: { position: [0, 2] },
  });
  b.project.camera = {
    initial: { center: [0, 0], height: 8 },
    targets: [{ id: "k_top", name: "Top", center: [0, 2], height: 3 }],
    moves: [
      { id: "n_1", start: 1, duration: 1, easing: "smooth", to: { kind: "target", target: "k_top" } },
      { id: "n_2", start: 2.6, duration: 1, easing: "double_smooth", to: { kind: "start" } },
    ],
  };
  return b.project;
}

/** Lines taken out and brought back by blocks (audit A4-03): the restoring removers on an arrow
 * (Uncreate, moved and recoloured while it is away), on dashes (Unwrite) and on a bent arrow
 * (Uncreate, grown back along its way), a double arrow faded out and grown back, an arrow with a
 * stealth tip unwritten and faded back before its outro uncreates it; and the effects that only
 * measure a line (Circumscribe, Flash, FocusOn). */
function lineBlocks(): Project {
  const b = new Builder("Line blocks");
  const t = Array.from({ length: 6 }, (_, k) => b.track(`Line ${k + 1}`));
  b.clip(b.line("arrow", { line: "arrow", vector: [2, 0.5], color: YELLOW }), t[0]!, 0, 3.6, {
    initial: { position: [-3, 1.5] },
    intro: intro({ kind: "create", duration: 0.5 }),
    actions: [
      createDisappear(0.7, "uncreate", "all", { duration: 0.5 }),
      createTween(1.3, 0.3, { position: [-3, 0.5], color: GREEN }),
      createAppear(1.8, "create", "all", { duration: 0.5 }),
    ],
  });
  b.clip(b.line("dashes", { line: "dashed", vector: [2, 0], color: BLUE }), t[1]!, 0, 3.6, {
    initial: { position: [2.5, 1.5] },
    intro: intro({ kind: "write", duration: 0.6 }),
    actions: [
      createDisappear(0.9, "unwrite", "all", { duration: 0.6 }),
      createAppear(2, "write", "all", { duration: 0.6 }),
    ],
  });
  b.clip(b.line("both", { line: "double_arrow", vector: [1.5, -0.5] }), t[2]!, 0, 3.6, {
    initial: { position: [0, -2] },
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    actions: [
      createDisappear(1, "fade_out", "all", { duration: 0.5 }),
      createAppear(2, "grow_arrow", "all", { duration: 0.6 }),
    ],
  });
  b.clip(b.line("plain", { vector: [2, 1], color: RED }), t[3]!, 0, 3.6, {
    initial: { position: [3, -1.5] },
    actions: [
      createEmphasis(0.3, "circumscribe", "all"),
      createEmphasis(1.5, "flash", "all"),
      createEmphasis(2.4, "focus_on", "all", { duration: 1 }),
    ],
  });
  b.clip(
    b.line("bent", { line: "arrow", vector: [2, 0.3], curve: { shape: "arc", degrees: 60, trim: 0 }, color: GREEN }),
    t[4]!,
    0,
    3.6,
    {
      initial: { position: [-3, -2] },
      intro: intro({ kind: "grow_arrow", duration: 0.8 }),
      actions: [
        createDisappear(1.1, "uncreate", "all", { duration: 0.6 }),
        createAppear(2.1, "grow_arrow", "all", { duration: 0.8 }),
      ],
    },
  );
  b.clip(b.line("notched", { line: "arrow", vector: [1.5, 0], tip: "stealth" }), t[5]!, 0, 3.6, {
    initial: { position: [0, 2.8] },
    intro: intro({ kind: "write", duration: 0.6 }),
    actions: [
      createDisappear(0.8, "unwrite", "all", { duration: 0.5 }),
      createAppear(1.6, "fade_in", "all", { duration: 0.5 }),
    ],
    outro: outro({ kind: "uncreate", duration: 0.5 }),
  });
  return b.project;
}

/** Fade copy (D185) where it meets the paths (audit A4-03): in a Morph block — a fade copy along
 * a path of its own beside a copy, and a transform whose route has its own —, and in a relation
 * whose fade copies leave glyphs a part transform moved and recoloured, one along a path of its
 * own and one with a route that has one; a glyph that arrived through a fade copy is taken out
 * and brought back. */
function fadeCopyPaths(): Project {
  const b = new Builder("Fade copy paths");
  const top = b.track("Top");
  const front = b.track("Front");
  const mid = b.track("Middle");
  const DIP: PathSpline = {
    nodes: [
      { at: [0, 0], in: null, out: [0.3, -0.5], smooth: false },
      { at: [1, 0], in: [0.7, -0.5], out: null, smooth: false },
    ],
  };
  const rows = b.formula("rows", "a+b \\\\ b+a");
  b.clip(rows, top, 0, 4, {
    intro: intro({ kind: "write", duration: 0.8 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [-4, 1.5] },
    actions: [
      createMorph(1, {
        duration: 1,
        style: "copy",
        pairs: [
          { from: [0], to: [5], style: null, path: ROUTE_BUMP },
          { from: [1], to: [4], style: "fade_copy", path: DIP },
          { from: [2], to: [3], style: "transform", routes: [{ from: 2, to: 3, path: DIP }] },
        ],
      }),
    ],
  });
  const f1 = b.formula("sum", "a+b=c");
  const f2 = b.formula("swap", "c=a+b", { color: GREEN });
  const c1 = b.clip(f1, mid, 0, 4, {
    intro: intro({ kind: "write", duration: 0.8 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [1.5, 2] },
    actions: [
      createPartTransform(0.9, [0], { duration: 0.4, color: RED, shift: [0, -0.4], rotation: 20 }),
      createTween(2.8, 0.5, { position: [2, 2.5], scale: 1.2 }),
    ],
  });
  const c2 = b.clip(f2, front, 1, 4, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [1.5, -0.5] },
    actions: [
      createDisappear(1.4, "fade_out", [2], { duration: 0.4 }),
      createAppear(2.1, "fade_in", [2], { duration: 0.4 }),
    ],
  });
  c2.startsEmpty = true;
  b.relation(c1, c2, {
    offset: 0.4,
    duration: 0.9,
    style: "fade_copy",
    pairs: [
      { from: [0], to: [2], style: null, path: ROUTE_BUMP },
      { from: [2], to: [4], style: null, routes: [{ from: 2, to: 4, path: DIP }] },
      { from: [4], to: [0], style: null },
      { from: [1, 3], to: [1, 3], style: "fade_copy" },
    ],
  });
  return b.project;
}

/** Glyphs a clip leaves out of its intro (`startHidden`, D178; audit A4-03): moved, scaled and
 * recoloured by a part transform and turned by a tween while they are away, then brought by an
 * Appear block where those left them; and a clip that leaves out its only glyph, which a relation
 * takes to another clip. */
function startHiddenMoves(): Project {
  const b = new Builder("Start hidden moves");
  const t1 = b.track("Front");
  const t2 = b.track("Back");
  const t3 = b.track("Other");
  const f1 = b.formula("sum", "a+b=c");
  const f2 = b.formula("d", "d", { color: YELLOW });
  const f3 = b.formula("e", "e+d", { color: GREEN });
  const c1 = b.clip(f1, t1, 0, 4, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [-1, 1] },
    actions: [
      createPartTransform(1.1, [3, 4], { duration: 0.5, shift: [0.5, 0.2], scale: 1.4, color: RED }),
      createTween(1.7, 0.5, { position: [0, 1.5], rotation: 25 }),
      createAppear(2.4, "fade_in", [3, 4], { duration: 0.5 }),
    ],
  });
  c1.startHidden = [3, 4];
  const c2 = b.clip(f2, t2, 0.5, 4, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    initial: { position: [-3, -2], scale: 1.5 },
  });
  c2.startHidden = [0];
  const c3 = b.clip(f3, t3, 1.2, 4, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [2, -2] },
  });
  b.relation(c2, c3, {
    offset: 0.8,
    duration: 0.8,
    pairs: [{ from: [0], to: [2], style: "transform" }],
  });
  return b.project;
}

/** A formula split by `{{ … }}` (audit A4-03), whose glyphs ManimCE addresses through
 * `family_members_with_points()`: an arrow from one of its glyphs, a fade copy out of it into a
 * clip that starts empty, a glyph shrunk away and grown back, and a tween of the whole formula. */
function splitTexEnds(): Project {
  const b = new Builder("Split tex ends");
  const t1 = b.track("Front");
  const t2 = b.track("Back");
  const t3 = b.track("Line");
  const f1 = b.formula("parts", "{{a}}+{{b}}^2");
  const f2 = b.formula("swap", "b+a", { color: GREEN });
  const c1 = b.clip(f1, t1, 0, 4, {
    intro: intro({ kind: "write", duration: 0.8 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [-2, 1] },
    actions: [
      createDisappear(0.9, "shrink_to_center", [1], { duration: 0.4 }),
      createAppear(1.6, "grow_from_center", [1], { duration: 0.4 }),
      createTween(3, 0.4, { position: [-2.5, 0.5], color: YELLOW }),
    ],
  });
  const c2 = b.clip(f2, t2, 1, 4, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [2, -1] },
  });
  c2.startsEmpty = true;
  b.relation(c1, c2, {
    offset: 1.2,
    duration: 0.8,
    style: "fade_copy",
    pairs: [
      { from: [2], to: [0], style: null },
      { from: [0], to: [2], style: null },
    ],
  });
  b.clip(b.line("arrow", { line: "arrow", color: BLUE }), t3, 1, 4, {
    intro: intro({ kind: "create", duration: 0.5 }),
    attach: createEndsAttach({ clipId: c1.id, glyphs: [3], anchor: "ur" }, { point: [3, 3] }, 0.1),
  });
  return b.project;
}

/** Bent lines and arrows that hang on nothing (audit A4-05), drawn alike by both libraries: arcs
 * of several degrees, with each shape of tip, faded in and out on a steady rate and moved. A
 * clip of a line is placed by the centre the project's library reads of it, which on an arc is
 * not the other library's (the box of the anchors in ManimCE, of every point in ManimGL); the
 * export check also exports this project to the other library, frame by frame. Nothing here cuts a
 * line by its curves (Create, Write, GrowArrow) or draws dashes: those differ between the two. */
function looseArcs(): Project {
  const b = new Builder("Loose arcs");
  const arc = (degrees: number): LineCurve => ({ shape: "arc", degrees, trim: 0 });
  const fades = {
    intro: intro({ kind: "fade_in", duration: 0.4, easing: "linear" }),
    outro: outro({ kind: "fade_out", duration: 0.4, easing: "linear" }),
  };
  b.clip(b.line("wide", { vector: [3, 0], curve: arc(120), color: YELLOW }), b.track("Wide"), 0, 2, {
    initial: { position: [-3, 2] },
    ...fades,
  });
  b.clip(b.line("arrow", { line: "arrow", vector: [2.5, 0.5], curve: arc(60), color: GREEN }), b.track("Arrow"), 0, 2, {
    initial: { position: [3, 2] },
    ...fades,
    actions: [createTween(0.6, 0.6, { position: [3.5, 1.5] }, "linear")],
  });
  b.clip(
    b.line("both", { line: "double_arrow", vector: [3, -0.5], curve: arc(120), tip: "stealth", color: BLUE }),
    b.track("Double"),
    0,
    2,
    { initial: { position: [-3, -1.5] }, ...fades },
  );
  b.clip(b.line("hook", { line: "arrow", vector: [2, 1], curve: arc(-150), tip: "dot", color: RED }), b.track("Hook"), 0, 2, {
    initial: { position: [3, -1.5] },
    ...fades,
  });
  return b.project;
}

/** Arrows grown again by an Appear block after a Transform carried their ends (audit A4-02, B4-02):
 * a bent one is traced along the way the Transform left (`_TraceArrow`), its tip on the end of
 * what is drawn; a straight one grows from the start the Transform left. An arc carried while
 * away, one carried on screen and then faded out, one that takes other degrees while away, a bent
 * double arrow with a stealth tip, and a straight arrow. */
function arrowsRegrown(): Project {
  const b = new Builder("Arrows regrown");
  const arc = (degrees: number): LineCurve => ({ shape: "arc", degrees, trim: 0 });
  const at = (x: number, y: number) => ({ point: [x, y] as [number, number] });
  const out = () => createDisappear(0.2, "fade_out", "all", { duration: 0.3 });
  const back = (start: number) => createAppear(start, "grow_arrow", "all", { duration: 0.8, easing: "linear" });
  b.clip(b.line("away", { line: "arrow", vector: [2, 0], curve: arc(60), color: RED }), b.track("Away"), 0, 2.2, {
    initial: { position: [-4, 2.5] },
    actions: [out(), createEndsTween(0.6, 0.3, { start: at(-6, 0.5), end: at(-2.5, 1.5) }), back(1)],
  });
  b.clip(b.line("shown", { line: "arrow", vector: [2, 0], curve: arc(60), color: GREEN }), b.track("Shown"), 0, 2.2, {
    initial: { position: [0, 2.5] },
    actions: [
      createEndsTween(0.1, 0.4, { start: at(-1, 0.3), end: at(2, 1.4) }),
      createDisappear(0.6, "fade_out", "all", { duration: 0.3 }),
      back(1),
    ],
  });
  b.clip(b.line("turned", { line: "arrow", vector: [2.5, 0], curve: arc(60), color: BLUE }), b.track("Turned"), 0, 2.2, {
    initial: { position: [4, 2.5] },
    actions: [out(), createEndsTween(0.6, 0.3, { start: at(3, -0.5), end: at(6, 0.8), degrees: 120 }), back(1)],
  });
  b.clip(
    b.line("both", { line: "double_arrow", vector: [2.5, 0.5], curve: arc(-80), tip: "stealth", color: YELLOW }),
    b.track("Double"),
    0,
    2.2,
    {
      initial: { position: [-3.5, -2] },
      actions: [out(), createEndsTween(0.6, 0.3, { start: at(-6, -3.5), end: at(-2.5, -1.5) }), back(1)],
    },
  );
  b.clip(b.line("plain", { line: "arrow", vector: [2.5, 0.5] }), b.track("Straight"), 0, 2.2, {
    initial: { position: [3, -2] },
    actions: [out(), createEndsTween(0.6, 0.3, { start: at(1, -3.5), end: at(4.5, -1.2) }), back(1)],
  });
  return b.project;
}

/** GrowArrow with a lag ratio of its own (audit A5-03): Manim's `GrowArrow` is a `Transform`, and
 * the export's `_TraceArrow` an `Animation`, so a `lag_ratio` staggers the members of the arrow —
 * the shaft, then the tip at its end, then the one at its start — as it staggers the glyphs of a
 * formula. A straight arrow and a double arrow with stealth tips, an arc and a bent double arrow
 * grown by their intros, and a double arrow faded out and grown back by an Appear block. */
function growArrowLags(): Project {
  const b = new Builder("Grow arrow lags");
  const arc = (degrees: number): LineCurve => ({ shape: "arc", degrees, trim: 0 });
  const grow = (lagRatio: number, duration: number, easing: "linear" | "smooth" = "linear") =>
    intro({ kind: "grow_arrow", duration, easing, lagRatio });
  b.clip(b.line("arrow", { line: "arrow", vector: [3, 0.8], color: YELLOW }), b.track("Arrow"), 0, 2.5, {
    initial: { position: [-3, 2.2] },
    intro: grow(0.5, 1),
  });
  b.clip(
    b.line("both", { line: "double_arrow", vector: [3, -0.6], tip: "stealth", startTip: "stealth", color: GREEN }),
    b.track("Double"),
    0.2,
    2.5,
    { initial: { position: [-3, 0.3] }, intro: grow(0.3, 1.2, "smooth") },
  );
  b.clip(b.line("bow", { line: "arrow", vector: [3, 0], curve: arc(70), color: BLUE }), b.track("Arc"), 0, 2.5, {
    initial: { position: [-3, -1.8] },
    intro: grow(0.5, 1),
  });
  b.clip(
    b.line("hook", { line: "double_arrow", vector: [2.5, -0.5], curve: arc(-100), tip: "stealth", color: RED }),
    b.track("Hook"),
    0.3,
    2.5,
    { initial: { position: [3, 1.6] }, intro: grow(0.25, 0.9) },
  );
  b.clip(b.line("back", { line: "double_arrow", vector: [2.5, 0.6], color: YELLOW }), b.track("Back"), 0, 2.5, {
    initial: { position: [3, -1.6] },
    actions: [
      createDisappear(0.2, "fade_out", "all", { duration: 0.3 }),
      createAppear(0.9, "grow_arrow", "all", { duration: 1, easing: "linear", lagRatio: 0.6 }),
    ],
  });
  return b.project;
}

/** Tweens that carry the ends of a line while it is away (audit A5-05): each line is faded out
 * by a Disappear block, its ends carried while it is off screen, and faded back in by an Appear
 * block. An easing that comes back leaves the line where it was — an arrow built anew, an arc
 * carried, the dashes of a spline carried by `_carried` —; one that does not leaves a double
 * arrow at its new ends, taken at once. */
function hiddenLineEnds(): Project {
  const b = new Builder("Hidden line ends");
  const node = (
    at: [number, number],
    into: [number, number] | null,
    out: [number, number] | null,
  ) => ({ at, in: into, out, smooth: false });
  const s: LineCurve = { shape: "spline", nodes: [node([0, 0], null, [0.3, 0.4]), node([1, 0], [0.7, -0.4], null)] };
  const at = (x: number, y: number) => ({ point: [x, y] as [number, number] });
  const away = (easing: "there_and_back" | "there_and_back_with_pause" | "smooth", to: ReturnType<typeof at>[]) => [
    createDisappear(0.3, "fade_out", "all", { duration: 0.4 }),
    createEndsTween(0.9, 0.6, { start: to[0]!, end: to[1]! }, { strokeWidth: 9, color: RED }, easing),
    createAppear(1.8, "fade_in", "all", { duration: 0.4 }),
  ];
  b.clip(b.line("arrow", { line: "arrow", vector: [3, 0.5], color: YELLOW }), b.track("Arrow"), 0, 2.5, {
    initial: { position: [-3, 2.2] },
    actions: away("there_and_back", [at(-5, -3), at(-4, -2)]),
  });
  b.clip(
    b.line("bow", { vector: [3, 0], curve: { shape: "arc", degrees: 80, trim: 0 }, color: GREEN }),
    b.track("Arc"),
    0,
    2.5,
    { initial: { position: [-3, 0.2] }, actions: away("there_and_back_with_pause", [at(1, -3), at(3, -3.5)]) },
  );
  b.clip(b.line("beads", { line: "dashed", vector: [3, 0.6], curve: s, dashLength: 0.12, color: BLUE }), b.track("Dashes"), 0, 2.5, {
    initial: { position: [3, 2] },
    actions: away("there_and_back", [at(2, -1), at(5, 0)]),
  });
  b.clip(b.line("both", { line: "double_arrow", vector: [2.5, -0.5] }), b.track("Double"), 0, 2.5, {
    initial: { position: [3, -0.5] },
    actions: away("smooth", [at(-5.5, -2.5), at(-2.5, -3.2)]),
  });
  return b.project;
}

/** Arrows unwritten (audit A4-01): Manim erases an arrow's shaft first — ManimCE's `Unwrite`
 * inverts every list of submobjects, and a mobject stays before its own, so the line comes before
 * its tips, the last tip first; ManimGL's `_Unwrite` takes them in that order too. A straight
 * arrow written and a double arrow created, both unwritten by their outros at once; a bent double
 * arrow with stealth tips unwritten on another easing; and an arrow and a bent one, each with a
 * stealth tip, taken out by a Disappear block that unwrites them and brought back by an Appear
 * block (the restoring helpers). */
function arrowUnwrites(): Project {
  const b = new Builder("Arrow unwrites");
  const arc = (degrees: number): LineCurve => ({ shape: "arc", degrees, trim: 0 });
  b.clip(b.line("arrow", { line: "arrow", vector: [3, 0.5], color: YELLOW }), b.track("Arrow"), 0, 2.5, {
    initial: { position: [-3, 2.2] },
    intro: intro({ kind: "write", duration: 0.6 }),
    outro: outro({ kind: "unwrite", duration: 1.2 }),
  });
  b.clip(b.line("both", { line: "double_arrow", vector: [3, -0.5], color: GREEN }), b.track("Double"), 0, 2.5, {
    initial: { position: [-3, 0.7] },
    intro: intro({ kind: "create", duration: 0.6 }),
    outro: outro({ kind: "unwrite", duration: 1.2 }),
  });
  b.clip(
    b.line("bow", {
      line: "double_arrow",
      vector: [3, 0],
      curve: arc(70),
      tip: "stealth",
      startTip: "stealth",
      color: BLUE,
    }),
    b.track("Bent"),
    0,
    2.5,
    {
      initial: { position: [-3, -1.6] },
      outro: outro({ kind: "unwrite", duration: 1.2, easing: "smooth" }),
    },
  );
  b.clip(b.line("back", { line: "arrow", vector: [2.5, 1], tip: "stealth", color: RED }), b.track("Back"), 0, 3, {
    initial: { position: [3, 1.8] },
    actions: [
      createDisappear(0.3, "unwrite", "all", { duration: 0.9 }),
      createAppear(1.6, "fade_in", "all", { duration: 0.5 }),
    ],
  });
  b.clip(
    b.line("hook", { line: "arrow", vector: [2.5, -0.5], curve: arc(-90), tip: "stealth", color: YELLOW }),
    b.track("Hook"),
    0,
    3,
    {
      initial: { position: [3, -1.2] },
      actions: [
        createDisappear(0.5, "unwrite", "all", { duration: 1, easing: "linear" }),
        createAppear(2, "write", "all", { duration: 0.6 }),
      ],
    },
  );
  return b.project;
}

const ROUTE_BUMP: PathSpline = {
  nodes: [
    { at: [0, 0], in: null, out: [0.25, 0.45], smooth: false },
    { at: [1, 0], in: [0.75, 0.45], out: null, smooth: false },
  ],
};
const ROUTE_WAVE: PathSpline = {
  nodes: [
    { at: [0, 0], in: null, out: [0.2, -0.3], smooth: false },
    { at: [0.5, 0.1], in: [0.35, -0.2], out: [0.65, 0.4], smooth: true },
    { at: [1, 0], in: [0.9, 0.3], out: null, smooth: false },
  ],
};

/** Routes with a path of their own (D167), one shape of pair each: two sources onto one target
 * that arrive separately (a call per source, each with its path), two that merge and one source
 * split in two (one call whose glyphs follow different paths: the `_route_paths` helper, beside
 * the pair's path and beside the relation's arc), two onto three as Manim aligns them (a copy),
 * and, in a second relation, a cross-fade of two sources and a pair of one glyph each whose
 * route has a path that wins over the pair's. */
function routePaths(): Project {
  const b = new Builder("Route paths");
  const t0 = b.track("Top");
  const t1 = b.track("Middle");
  const t2 = b.track("Bottom");
  const f1 = b.formula("letters", "abcdefg");
  const f2 = b.formula("others", "pqrstuv", { color: GREEN });
  const f3 = b.formula("two", "mn", { color: BLUE });
  const c1 = b.clip(f1, t0, 0, 4, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [-1, 2], scale: 1.5 },
  });
  const c2 = b.clip(f2, t1, 1, 6, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [1, 0], scale: 1.5 },
  });
  c2.startsEmpty = true;
  b.relation(c1, c2, {
    duration: 1.5,
    pathArc: 60,
    easing: "linear",
    pairs: [
      {
        from: [0, 1],
        to: [0],
        style: null,
        routes: [
          { from: 0, to: 0, path: ROUTE_BUMP },
          { from: 1, to: 0, path: ROUTE_WAVE },
        ],
      },
      {
        from: [2, 3],
        to: [1],
        style: null,
        extras: "merge",
        path: ROUTE_BUMP,
        routes: [{ from: 3, to: 1, path: ROUTE_WAVE }],
      },
      { from: [4], to: [2, 3], style: null, routes: [{ from: 4, to: 3, path: ROUTE_BUMP }] },
      {
        from: [5, 6],
        to: [4, 5, 6],
        style: "copy",
        routes: [{ from: 5, to: 5, path: ROUTE_WAVE }],
      },
    ],
  });
  const c3 = b.clip(f3, t2, 3, 6, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [-1, -2], scale: 2 },
  });
  c3.startsEmpty = true;
  b.relation(c2, c3, {
    duration: 1.5,
    pairs: [
      { from: [0, 1], to: [0], style: "fade", routes: [{ from: 1, to: 0, path: ROUTE_BUMP }] },
      {
        from: [2],
        to: [1],
        style: null,
        path: ROUTE_BUMP,
        routes: [{ from: 2, to: 1, path: ROUTE_WAVE }],
      },
    ],
  });
  return b.project;
}

const ROUTE_OVER: PathSpline = {
  nodes: [
    { at: [0, 0], in: null, out: [0.25, 0.5], smooth: false },
    { at: [1, 0], in: [0.75, 0.5], out: null, smooth: false },
  ],
};
const ROUTE_UNDER: PathSpline = {
  nodes: [
    { at: [0, 0], in: null, out: [0.25, -0.5], smooth: false },
    { at: [1, 0], in: [0.75, -0.5], out: null, smooth: false },
  ],
};

/** Glyphs drawn on one spot whose routes have paths of their own (B-80 of the final audit):
 * `\mathrlap{x}x` is two glyphs with the same points. They merge into one glyph, one over the
 * chord and one under it; then that glyph splits into the two of another clip, again one over and
 * one under. Nothing of the points Manim hands a path function tells such pieces apart: each has
 * to take the path of its route by which piece it is (`_route_paths`). */
function routeCoincident(): Project {
  const b = new Builder("Route coincident");
  const t0 = b.track("Top");
  const t1 = b.track("Middle");
  const t2 = b.track("Bottom");
  const f1 = b.formula("twice", "\\mathrlap{x}x", { packages: ["mathtools"] });
  const f2 = b.formula("once", "x", { color: GREEN });
  const c1 = b.clip(f1, t0, 0, 2, { initial: { position: [-2, 1], scale: 2 } });
  const c2 = b.clip(f2, t1, 0.5, 4, { initial: { position: [2, 0], scale: 2 } });
  c2.startsEmpty = true;
  b.relation(c1, c2, {
    duration: 1,
    easing: "linear",
    pairs: [
      {
        from: [0, 1],
        to: [0],
        style: null,
        extras: "merge",
        routes: [
          { from: 0, to: 0, path: ROUTE_OVER },
          { from: 1, to: 0, path: ROUTE_UNDER },
        ],
      },
    ],
  });
  const c3 = b.clip(f1, t2, 2, 4, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [-2, -1], scale: 2 },
  });
  c3.startsEmpty = true;
  b.relation(c2, c3, {
    duration: 1,
    easing: "linear",
    pairs: [
      {
        from: [0],
        to: [0, 1],
        style: null,
        routes: [
          { from: 0, to: 0, path: ROUTE_OVER },
          { from: 0, to: 1, path: ROUTE_UNDER },
        ],
      },
    ],
  });
  return b.project;
}

/** Pairs that bring the same targets (D167), a join taken apart: in a relation, a transform and
 * a copy onto one glyph, each on its own path, a fade and then a transform onto another, and a
 * transform and then a fade onto a third — and onto the first two, after them, a pair of two
 * sources each (D54): `separate`, both of which arrive, and `copies`, whose principal arrives
 * and whose other source sends a copy (audit B4-01: in ManimCE they play as Transforms that
 * remove themselves, a second `Scene.replace` onto one target shifting the indices after it); in a
 * Morph block, a copy and a transform onto one glyph of the formula. */
function sharedTargets(): Project {
  const b = new Builder("Shared targets");
  const t0 = b.track("Top");
  const t1 = b.track("Middle");
  const t2 = b.track("Bottom");
  const f1 = b.formula("letters", "abcdefghij");
  const f2 = b.formula("others", "wxy", { color: GREEN });
  const f3 = b.formula("rows", "x+y \\\\ y+x", { hiddenGlyphs: [3, 4, 5] });
  const c1 = b.clip(f1, t0, 0, 4, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [-2, 2], scale: 1.5 },
  });
  const c2 = b.clip(f2, t1, 1, 5, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [-2, 0], scale: 2 },
  });
  c2.startsEmpty = true;
  b.relation(c1, c2, {
    duration: 1.5,
    easing: "linear",
    pairs: [
      { from: [0], to: [0], style: null, path: ROUTE_BUMP },
      { from: [1], to: [0], style: "copy", path: ROUTE_WAVE },
      { from: [2], to: [1], style: "fade" },
      { from: [3], to: [1], style: null },
      { from: [4], to: [2], style: null },
      { from: [5], to: [2], style: "fade" },
      { from: [6, 7], to: [0], style: null, extras: "separate" },
      { from: [8, 9], to: [1], style: null, extras: "copies", principal: 9 },
    ],
  });
  b.clip(f3, t2, 1, 5, {
    intro: intro({ kind: "write", duration: 0.5 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [2.5, 0] },
    actions: [
      createMorph(1, {
        duration: 1.5,
        style: "copy",
        pairs: [
          { from: [0], to: [5], style: null },
          { from: [2], to: [5], style: "transform", path: ROUTE_BUMP },
        ],
      }),
    ],
  });
  return b.project;
}

/** A clip split at the playhead (D169), as `planSplit` leaves it (`ui/timeline/splitClips.ts`).
 * The first half ends at 3 s without an outro; there the second, a clip of a copy of the
 * formula, starts without an intro, as the formula is then: where a tween left it, at its
 * scale, with the colour a Transform block gave a glyph and without the glyph a Disappear took
 * (the copy hides it). After the cut an Appear brings that glyph back, a tween moves the second
 * half, a relation leaves from it and it fades out. The cut itself must not show. */
function splitClip(): Project {
  const b = new Builder("Split clip");
  const t0 = b.track("Front");
  const t1 = b.track("Back");
  const f1 = b.formula("sum", "a+b=c");
  const f1s = b.formula("sum_s", "a+b=c", { hiddenGlyphs: [3] });
  const f2 = b.formula("result", "c", { color: GREEN });
  b.clip(f1, t0, 0, 3, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "none", duration: 0 }),
    initial: { position: [-2, 1] },
    actions: [
      createTween(1.2, 1, { position: [1, 1.5], scale: 1.3 }),
      createDisappear(2.2, "fade_out", [3], { duration: 0.4 }),
      createPartTransform(2.4, [0], { duration: 0.4, color: RED }),
    ],
  });
  const right = b.clip(f1s, t0, 3, 6, {
    intro: intro({ kind: "none", duration: 0 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [1, 1.5], scale: 1.3, glyphColors: { "0": RED } },
    actions: [
      createAppear(0.5, "fade_in", [3], { duration: 0.5 }),
      createTween(1, 0.5, { position: [0, -1] }),
    ],
  });
  const c2 = b.clip(f2, t1, 4.2, 6.5, {
    intro: intro({ kind: "none", duration: 0 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [3, 1], scale: 1.5 },
  });
  b.relation(right, c2, {
    offset: 0.4,
    duration: 0.8,
    pairs: [{ from: [4], to: [0], style: "copy" }],
  });
  return b.project;
}

/** Fade copy (D185): a copy of the sources cross-fades into the targets, and the sources stay —
 * "sum" is whole, but for its "=", until its outro. One glyph to one along an arc and a group to
 * a group (it cross-fades whole), onto a clip in front, beside a plain copy and a plain fade that
 * consumes its source; two sources onto one target, each through a copy of its own (`separate`),
 * onto a clip on the front track; and, onto a clip behind, a principal whose copy cross-fades
 * while the other source sends a plain copy (`copies`). */
function fadeCopies(): Project {
  const b = new Builder("Fade copies");
  const top = b.track("Top");
  const t0 = b.track("Front");
  const t1 = b.track("Middle");
  const t2 = b.track("Back");
  const f1 = b.formula("sum", "a+b=c");
  const f2 = b.formula("swap", "c=a+b", { color: GREEN });
  const f3 = b.formula("x", "x", { color: RED });
  const f4 = b.formula("y", "y", { color: YELLOW });
  const c1 = b.clip(f1, t1, 0, 6, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [0, 2] },
  });
  const c2 = b.clip(f2, t0, 1, 6, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [0, 0] },
  });
  c2.startsEmpty = true;
  const c3 = b.clip(f3, top, 3, 6, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [-3, -2], scale: 2 },
  });
  c3.startsEmpty = true;
  const c4 = b.clip(f4, t2, 4, 6, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [3, -2], scale: 2 },
  });
  c4.startsEmpty = true;
  // [1.5, 2.5): every style at once; the relation's own is the fade of a copy.
  b.relation(c1, c2, {
    offset: 0.5,
    duration: 1,
    pathArc: 90,
    style: "fade_copy",
    pairs: [
      { from: [0], to: [2], style: null },
      { from: [1, 2], to: [3, 4], style: null },
      { from: [4], to: [0], style: "copy" },
      { from: [3], to: [1], style: "fade" },
    ],
  });
  // [3.5, 4.3): "a" and "b" onto "x", a copy of each.
  b.relation(c1, c3, {
    offset: 0.5,
    duration: 0.8,
    style: "fade_copy",
    pairs: [{ from: [0, 2], to: [0], style: null, extras: "separate" }],
  });
  // [4.5, 5.3): "a" and "c" onto "y": the copy of "c" cross-fades, "a" sends a plain copy.
  b.relation(c1, c4, {
    offset: 0.5,
    duration: 0.8,
    easing: "linear",
    pairs: [{ from: [0, 4], to: [0], style: "fade_copy", extras: "copies", principal: 4 }],
  });
  return b.project;
}

/** A clip split before some of its glyphs came on screen (D178), as `planSplit` leaves it. In
 * the whole clip "=" waited for an Appear block and "c" for a relation, both after the cut: the
 * first half leaves them out of its intro itself (`startHidden`), so it writes "a+b" and nothing
 * else, and the second, a clip of a copy of the formula that hides them, gets them when the
 * block and the relation play. Neither may show before its time, and the cut must not show. */
function splitLeftOut(): Project {
  const b = new Builder("Split left out");
  const t0 = b.track("Front");
  const t1 = b.track("Back");
  const f1 = b.formula("sum", "a+b=c");
  const f1s = b.formula("sum_s", "a+b=c", { hiddenGlyphs: [3, 4] });
  const f2 = b.formula("result", "c", { color: GREEN });
  const left = b.clip(f1, t0, 0, 3, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "none", duration: 0 }),
    initial: { position: [-1, 1] },
    actions: [createTween(1.5, 1, { position: [0, 1.5] })],
  });
  left.startHidden = [3, 4];
  const right = b.clip(f1s, t0, 3, 6, {
    intro: intro({ kind: "none", duration: 0 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [0, 1.5] },
    actions: [createAppear(0.5, "write", [3], { duration: 0.5 })],
  });
  const c2 = b.clip(f2, t1, 2, 6.5, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [2.5, -1], scale: 1.5 },
  });
  b.relation(c2, right, {
    offset: 1.2,
    duration: 0.8,
    pairs: [{ from: [0], to: [4], style: "copy" }],
  });
  return b.project;
}

/** Two clips with three relations, the same source into the same target each time: two whose
 * windows overlap, on different glyphs (played in parts), and a third later, with a path arc.
 * The target starts empty, so that it is made of what they bring and nothing else. */
function relationsTwice(): Project {
  const b = new Builder("Relations twice");
  const t1 = b.track("Front");
  const t2 = b.track("Back");
  const f1 = b.formula("sum", "a+b=c");
  const f2 = b.formula("swap", "c=a+b", { color: GREEN });
  const c1 = b.clip(f1, t1, 0, 6, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [0, 1.5] },
  });
  const c2 = b.clip(f2, t2, 1, 7, {
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [0, -1] },
  });
  c2.startsEmpty = true;
  // [1.5, 2.5): "a".
  b.relation(c1, c2, {
    offset: 0.5,
    duration: 1,
    pairs: [{ from: [0], to: [2], style: null }],
  });
  // [2, 3), while the first still runs: "c", and a copy of "b" (sum keeps its own).
  b.relation(c1, c2, {
    offset: 1,
    duration: 1,
    pairs: [
      { from: [4], to: [0], style: null },
      { from: [2], to: [4], style: "copy" },
    ],
  });
  // [4, 4.6): the signs, along an arc; "+" fades across.
  b.relation(c1, c2, {
    offset: 3,
    duration: 0.6,
    pathArc: 90,
    pairs: [
      { from: [3], to: [1], style: null },
      { from: [1], to: [3], style: "fade" },
    ],
  });
  return b.project;
}

/** A clip that starts empty: its intro draws nothing, and only what a relation, an Appear block
 * and a Morph block bring ever shows; a glyph nothing brings never does. */
function startsEmpty(): Project {
  const b = new Builder("Starts empty");
  const t1 = b.track("Front");
  const t2 = b.track("Back");
  const f1 = b.formula("sum", "a+b=c");
  const f2 = b.formula("swap", "c=a+b", { color: GREEN });
  const c1 = b.clip(f1, t1, 0, 4, {
    intro: intro({ kind: "write", duration: 1 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [0, 1.5] },
  });
  // swap: "c" comes from sum's "c" and "a" from a copy of sum's "a"; "+" is written by a block,
  // "=" comes out of swap's own "c"; "b" never shows. Its fade-in has nothing to fade.
  const c2 = b.clip(f2, t2, 1, 5, {
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    outro: outro({ kind: "fade_out", duration: 0.5 }),
    initial: { position: [0, -1] },
    actions: [
      createAppear(2, "write", [3], { duration: 0.5 }),
      createMorph(2.6, {
        duration: 0.5,
        style: "copy",
        pairs: [{ from: [0], to: [1], style: null }],
      }),
    ],
  });
  c2.startsEmpty = true;
  b.relation(c1, c2, {
    offset: 0.5,
    duration: 1,
    pairs: [
      { from: [0], to: [2], style: "copy" },
      { from: [4], to: [0], style: null },
    ],
  });
  return b.project;
}

/** Paint transitions retain a glyph's own fill/stroke mask and prior opacity. The last clip
 * splits both Cross Unwrites; the frame after they end must contain neither erased line. */
function paintChannels(): Project {
  const b = new Builder("Paint channels", { width: 960, height: 540 });
  const hollow = b.shape("hollow", { width: 1.4, height: 0.8, color: RED });
  b.clip(hollow, b.track("Reset hollow"), 0, 5, {
    initial: { position: [-4.5, 1.5] },
    actions: [
      createPartTransform(0.5, [0], { duration: 0.5, opacity: 0.2, easing: "linear" }),
      createTween(1.5, 0.5, { opacity: 0.5 }, "linear"),
    ],
  });
  const future = b.shape("future", {
    width: 1.4, height: 0.8, color: BLUE,
    style: { fillOpacity: 0.35, strokeWidth: 4, strokeOpacity: 0.7 },
  });
  b.clip(future, b.track("Future mixed paint"), 0, 5, {
    initial: { position: [-1.5, 1.5] },
    actions: [
      createTween(0.5, 0.5, { opacity: 0.5 }, "linear"),
      createAppear(2, "fade_in", [0], { duration: 0.5, easing: "linear" }),
    ],
  });
  const turn = b.shape("turn", { width: 1.4, height: 0.8, color: RED });
  b.clip(turn, b.track("Turn and color"), 0, 5, {
    initial: { position: [1.5, 1.5] },
    actions: [createTween(0.5, 1, { rotation: 90, color: GREEN }, "linear")],
  });
  const part = b.shape("part", {
    width: 1.4, height: 0.8, color: RED,
    style: { fillOpacity: 0.3, strokeWidth: 4, strokeOpacity: 0.7 },
  });
  b.clip(part, b.track("Part turn and color"), 0, 5, {
    initial: { position: [4.5, 1.5] },
    actions: [createPartTransform(0.5, [0], {
      duration: 1, rotation: 90, color: GREEN, easing: "linear",
    })],
  });
  const cross = (name: string) => b.shape(name, {
    shape: "cross", width: 1.4, height: 0.8, color: BLUE,
  });
  b.clip(cross("lines"), b.track("Independent line opacity"), 0, 5, {
    initial: { position: [-4.5, -1.5] },
    actions: [
      createPartTransform(0.5, [0], { duration: 0.5, opacity: 0.2, easing: "linear" }),
      createPartTransform(1.5, [0, 1], {
        duration: 1, rotation: 90, opacity: 0.6, easing: "there_and_back",
      }),
    ],
  });
  b.clip(cross("erase"), b.track("Sliced Unwrite"), 0, 3.5, {
    initial: { position: [-1.5, -1.5] },
    outro: outro({ kind: "unwrite", duration: 1 }),
  });
  b.clip(cross("returning"), b.track("Disappear and return"), 0, 5, {
    initial: { position: [1.5, -1.5] },
    actions: [
      createDisappear(2.5, "unwrite", [0, 1], { duration: 1, easing: "linear" }),
      createAppear(4, "fade_in", [0, 1], { duration: 0.5, easing: "linear" }),
    ],
  });
  const boundary = b.shape("Circle", { shape: "circle", width: 0.8, height: 0.8 });
  b.clip(boundary, b.track("Unrelated boundary"), 3, 5, {
    initial: { position: [4.5, -1.5] },
  });
  return b.project;
}

/** Literal braces, ligatures, per-glyph paint, manual lines, font style and transformed text
 * exercise native child membership rather than TeX's CE f[0][g] wrapper. */
function pangoText(): Project {
  const b = new Builder("Pango text", { width: 960, height: 540 });
  const title = createTextFormula({
    name: "p1",
    source: "AV office\né",
    font: { family: "Noto Serif", weight: "normal", slant: "normal" },
    glyphColors: { "0": RED, "3": BLUE },
    fontSize: 48,
  });
  const accent = createTextFormula({
    name: "p2",
    source: "ÁV {{x}}",
    font: { family: "Noto Sans", weight: "bold", slant: "italic" },
    color: GREEN,
    fontSize: 36,
  });
  b.project.formulas.push(title, accent);
  b.clip(title, b.track("Title"), 0, 3, {
    initial: { position: [-1, 1] },
    intro: intro({ kind: "write", duration: 0.5 }),
    actions: [
      createPartTransform(0.8, [3], {
        duration: 0.5,
        color: YELLOW,
        easing: "linear",
      }),
      createTween(1.5, 0.5, { position: [0.5, 1], rotation: 10 }, "linear"),
    ],
    outro: outro({ kind: "unwrite", duration: 0.5 }),
  });
  b.clip(accent, b.track("Literal source"), 0, 3, {
    initial: { position: [0, -1.5] },
    intro: intro({ kind: "fade_in", duration: 0.5 }),
    actions: [createTween(1, 0.5, { scale: 1.2, opacity: 0.7 }, "linear")],
  });
  return b.project;
}

/** Font texts of one line each, with per-glyph paint and a part transform: what the two
 * libraries draw alike (they space the lines and the tabs of a text each its own way), so an
 * export for the library that did not shape them can be compared frame by frame. Every easing
 * is linear: the libraries' own curves differ. */
function pangoLine(): Project {
  const b = new Builder("Pango line", { width: 960, height: 540 });
  const title = createTextFormula({
    name: "p1",
    source: "AV office é",
    font: { family: "Noto Serif", weight: "normal", slant: "normal" },
    glyphColors: { "0": RED, "3": BLUE },
    fontSize: 48,
  });
  const accent = createTextFormula({
    name: "p2",
    source: "ÁV {{x}}",
    font: { family: "Noto Sans", weight: "bold", slant: "italic" },
    color: GREEN,
    fontSize: 36,
  });
  b.project.formulas.push(title, accent);
  b.clip(title, b.track("Title"), 0, 3, {
    initial: { position: [-1, 1] },
    intro: intro({ kind: "fade_in", duration: 0.5, easing: "linear" }),
    actions: [
      createPartTransform(0.8, [3], {
        duration: 0.5,
        color: YELLOW,
        easing: "linear",
      }),
      createTween(1.5, 0.5, { position: [0.5, 1], rotation: 10 }, "linear"),
    ],
    outro: outro({ kind: "fade_out", duration: 0.5, easing: "linear" }),
  });
  b.clip(accent, b.track("Literal source"), 0, 3, {
    initial: { position: [0, -1.5] },
    intro: intro({ kind: "fade_in", duration: 0.5, easing: "linear" }),
    actions: [createTween(1, 0.5, { scale: 1.2, opacity: 0.7 }, "linear")],
  });
  return b.project;
}

/* The marks of the Slides mode (D200): comments and pauses at instants where nothing animates,
 * written in the Python as comments at their instant. A mark inside a wait splits it in two waits
 * of the same frames; a wrong split would move every frame after it, which the probe sees. */

/** A pause at 0 s, one under the Write (left out), a comment and a pause in the middle of a wait
 * — one that skips its wait on the exported page (D202): its line says so, and its wait stays —,
 * a comment where the Write ends, a pause on the edge between a tween and an Indicate, one just
 * after a formula appears without an animation as another fades in, a comment in the middle of
 * the last wait whose words try to remove the formula, and a pause at the end of the scene. */
function slideMarks(): Project {
  const b = new Builder("Slide marks");
  const t1 = b.track("Formula");
  const t2 = b.track("Label");
  const t3 = b.track("Answer");
  b.clip(b.formula("eq", "a+b=c"), t1, 0, 6, {
    intro: intro({ kind: "write", duration: 1 }),
    actions: [
      createTween(2, 1, { position: [0, 1], scale: 1.2 }, "smooth"),
      createEmphasis(3, "indicate", "all", { duration: 0.6 }),
    ],
    outro: outro({ kind: "fade_out", duration: 1 }),
  });
  b.clip(b.formula("label", "x^2"), t2, 3.6, 6, { initial: { position: [-2, -1.5] } });
  b.clip(b.formula("answer", "y"), t3, 3.6, 6, {
    intro: intro({ kind: "fade_in", duration: 0.6 }),
    initial: { position: [2, -1.5] },
  });
  b.project.slides = {
    marks: [
      { id: "p_1", time: 0, kind: "pause", text: "Before anything" },
      { id: "p_2", time: 0.5, kind: "pause" },
      { id: "p_3", time: 1.5, kind: "pause", skipWait: true },
      { id: "p_4", time: 1.5, kind: "comment", text: "Say what a, b and c are\nthen go on" },
      { id: "p_5", time: 1, kind: "comment", text: "Written" },
      { id: "p_6", time: 3, kind: "pause" },
      { id: "p_7", time: 3.6, kind: "pause", text: "The label is there" },
      { id: "p_8", time: 4.5, kind: "comment", text: 'A box here\nself.remove(eq)  # "not code"' },
      { id: "p_9", time: 6, kind: "pause" },
    ],
  };
  return b.project;
}

/** Marks around the moves of the scene's camera (10 fps, as the other camera cases): in the
 * middle of a wait, just where a move starts, just after one ends as a box appears without an
 * animation, one under a move (left out), and at the end of the scene. */
function slidePausesCamera(): Project {
  const b = new Builder("Slide pauses camera", { width: 960, height: 540, fps: 10 });
  const t1 = b.track("Formula");
  const t2 = b.track("Box");
  b.clip(b.formula("sum", "x+y=z"), t1, 0, 6, {
    intro: intro({ kind: "fade_in", duration: 1 }),
    initial: { position: [-1, 0.5] },
  });
  b.clip(b.shape("box", { width: 1.2, height: 0.8, color: BLUE }), t2, 3, 6, {
    initial: { position: [2, -1] },
  });
  b.project.camera = {
    initial: { center: [0, 0], height: 8 },
    targets: [],
    moves: [
      {
        id: "n_1",
        start: 1.5,
        duration: 1.5,
        easing: "smooth",
        to: { kind: "frame", frame: { center: [1, 0], height: 5 } },
      },
      { id: "n_2", start: 4, duration: 1, easing: "linear", to: { kind: "start" } },
    ],
  };
  b.project.slides = {
    marks: [
      { id: "p_1", time: 1, kind: "pause" },
      { id: "p_2", time: 1.2, kind: "comment", text: "Point at x" },
      { id: "p_3", time: 1.5, kind: "pause", skipWait: true },
      { id: "p_4", time: 2, kind: "pause" },
      { id: "p_5", time: 3, kind: "pause", text: "The box is there" },
      { id: "p_6", time: 3.5, kind: "comment", text: "Zoom on the box later" },
      { id: "p_7", time: 4, kind: "pause" },
      { id: "p_8", time: 5.5, kind: "pause" },
      { id: "p_9", time: 6, kind: "pause" },
    ],
  };
  return b.project;
}
