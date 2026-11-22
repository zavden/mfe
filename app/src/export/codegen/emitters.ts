/* What the generated scene writes for each kind of object (docs/ARCHITECTURE.md §8, "Mobjects"):
 * the Manim class per target and the lines that make one clip's mobject. The passes that follow
 * never ask for the kind: once made, a mobject is its glyphs (`glyphs.ts`), whatever it draws. A new
 * kind adds its row here (and its glyph producer in `engine/producers.ts`). */
import { texSource } from '../../engine';
import { arcUndrawn, buildLine, sameColor, splineStretches } from '../../geom';
import {
  DEFAULT_BRACE_SHARPNESS,
  DEFAULT_COLOR,
  DEFAULT_DASH_LENGTH,
  DEFAULT_FONT_SIZE,
  DEFAULT_TIP_LENGTH,
  diagonalOf,
  hasTips,
  LINE_BUFFS,
  LINE_STROKE_WIDTHS,
  SHAPE_STYLES,
  type BraceFormula,
  type Formula,
  type FormulaKind,
  type LineFormula,
  type LineKind,
  type LineTip,
  type SplineNode,
  type MathFormula,
  type ShapeFormula,
  type ShapeKind,
  type Target,
  type TexFormula,
  type TextFormula,
} from '../../model';
import { lineEndsAt } from '../../scene';
import type { ClipCtx, Codegen } from './context';
import { fillColourCall, paintedShape, repainted } from './paint';
import { num, point, pyString, quoted } from './python';

export interface Emitter<F extends Formula = Formula> {
  /** The mobject class per target (ManimCE's `Tex` is text, ManimGL's `Tex` is math). */
  className: Readonly<Record<Target, string>>;
  /** The constructor puts the mobject where the clip's first state has it (a line, between its
   * two ends): the clip's setup adds no move, turn or flip. */
  placed?: true;
  /** The lines that make the clip's mobject, `ctx.naming.name`, in the colour `base` (the clip's
   * initial colour or the formula's): the constructor call and what must follow it. `formula` is
   * the clip's, of this emitter's kind. */
  construct(gen: Codegen, ctx: ClipCtx, base: string, formula: F): string[];
}

/** The lines of a LaTeX mobject (`MathTex`, `Tex`, `TexText`) from its source: the size and
 * colour when they differ from the defaults, and the TeX template (CE) or additional preamble
 * (GL) the formula's packages and the project preamble make. */
function latexMobject(
  gen: Codegen,
  ctx: ClipCtx,
  base: string,
  className: string,
  source: string,
): string[] {
  const { formula: fc, naming } = ctx;
  const args = [pyString(source)];
  if (Math.abs(fc.fontSize - DEFAULT_FONT_SIZE) > 1e-9)
    args.push(`font_size=${num(fc.fontSize, 4)}`);
  // ManimGL's Tex ignores a `color` argument (its glyphs stay white): colour it afterwards.
  const tinted = !sameColor(base, DEFAULT_COLOR);
  if (tinted && gen.target === 'ce') args.push(`color=${quoted(base)}`);
  if (fc.texSetup) args.push(`${gen.dialect.texSetupKw}=${fc.texSetup}`);
  const lines = [`${naming.name} = ${className}(${args.join(', ')})`];
  if (tinted && gen.target === 'gl') lines.push(`${naming.name}.set_color(${quoted(base)})`);
  return lines;
}

/** `math`: `MathTex` (CE) / `Tex` (GL) of the source. */
const math: Emitter<MathFormula> = {
  className: { ce: 'MathTex', gl: 'Tex' },
  construct: (gen, ctx, base, formula) =>
    latexMobject(gen, ctx, base, math.className[gen.target], formula.source),
};

/** `tex`: `Tex` (CE) / `TexText` (GL) of the source inside the wrapper its layout needs
 * (`engine/textSource.ts`), at the size the clip is exported with. */
const tex: Emitter<TexFormula> = {
  className: { ce: 'Tex', gl: 'TexText' },
  construct: (gen, ctx, base, formula) =>
    latexMobject(
      gen,
      ctx,
      base,
      tex.className[gen.target],
      texSource({ ...formula, fontSize: ctx.formula.fontSize }, gen.target),
    ),
};

const text: Emitter<TextFormula> = {
  className: { ce: 'Text', gl: 'Text' },
  construct: (gen, ctx, base, formula) => {
    const args = [
      pyString(formula.source),
      `font=${pyString(formula.font.family)}`,
      `font_size=${num(ctx.formula.fontSize, 6)}`,
      `weight=${pyString(formula.font.weight.toUpperCase())}`,
      `slant=${pyString(formula.font.slant.toUpperCase())}`,
      'disable_ligatures=False',
    ];
    if (gen.target === 'gl') args.push("alignment='LEFT'");
    const lines =
      gen.target === 'ce'
        ? [
            "with tempconfig({'pixel_width': 1920, 'pixel_height': 1080}):",
            `    ${ctx.naming.name} = Text(${args.join(', ')})`,
          ]
        : [`${ctx.naming.name} = Text(${args.join(', ')})`];
    // The scene checks what Manim built: how many glyphs and, with a fingerprint of this
    // library's outlines at hand, the outlines. The warning names the text, on one line.
    gen.helpers.add('text-geometry');
    const checked = [
      ctx.naming.name,
      pyString(formula.name.replace(/\r\n|[\r\n]/g, ' ')),
      quoted(gen.target),
      String(ctx.formula.count),
    ];
    if (ctx.formula.textSignature) checked.push(quoted(ctx.formula.textSignature));
    lines.push(`_mfe_verify_text(${checked.join(', ')})`);
    lines.push(`${ctx.naming.name}.set_color(${quoted(base)})`);
    return lines;
  },
};

/** `brace`: `Brace` in both libraries — here the brace of a detached clip, fitted to a line as
 * wide as its `width` at no gap, which the clip's setup then moves and turns like any mobject (a
 * brace its attachment places is built on its target in the step where its clip starts instead,
 * attach.ts). ManimGL's brace has no sharpness. */
const brace: Emitter<BraceFormula> = {
  className: { ce: 'Brace', gl: 'Brace' },
  construct: (gen, ctx, base, formula) => {
    const { naming } = ctx;
    const args = [`Line(ORIGIN, ${num(formula.width)} * RIGHT)`, 'DOWN', 'buff=0'];
    if (gen.target === 'ce' && Math.abs(formula.sharpness - DEFAULT_BRACE_SHARPNESS) > 1e-9) {
      args.push(`sharpness=${num(formula.sharpness)}`);
    }
    const tinted = !sameColor(base, DEFAULT_COLOR);
    if (tinted && gen.target === 'ce') args.push(`color=${quoted(base)}`);
    const lines = [`${naming.name} = Brace(${args.join(', ')})`];
    if (tinted && gen.target === 'gl') lines.push(`${naming.name}.set_color(${quoted(base)})`);
    return lines;
  },
};

/** The Manim class of each shape when it is built on its target (the same in both libraries). */
export const SHAPE_CLASSES: Readonly<Record<ShapeKind, string>> = {
  box: 'SurroundingRectangle',
  circle: 'Circle',
  underline: 'Underline',
  cross: 'Cross',
  cross_line: 'Line',
};

/** The style arguments of a shape's constructor: its stroke width when it is not the class's
 * default (`Cross` draws 6 wide, the others 4; a cross line is a `Line`, which draws 4 wide where
 * the shape's own default is a cross's 6: its width is always said), its fill opacity when it has
 * a fill and its stroke opacity when it is not full — the clip's `opacity` folded into both, since
 * `set_opacity` would fill a stroked shape. */
export function shapeStyleArgs(
  formula: ShapeFormula,
  opacity: number,
  target: Target = 'ce',
): string[] {
  const { style } = formula;
  const args: string[] = [];
  if (
    formula.shape === 'cross_line' ||
    (formula.shape === 'cross' && target === 'gl') ||
    Math.abs(style.strokeWidth - SHAPE_STYLES[formula.shape].strokeWidth) > 1e-9
  ) {
    args.push(`stroke_width=${num(style.strokeWidth)}`);
  }
  const fill = style.fillOpacity * opacity;
  const stroke = style.strokeOpacity * opacity;
  if (fill > 0) args.push(`fill_opacity=${num(fill)}`);
  if (Math.abs(stroke - 1) > 1e-9) args.push(`stroke_opacity=${num(stroke)}`);
  return args;
}

/** `shape`: here the shape of a detached clip, built at the size it was fitted to — a
 * `Rectangle` or `RoundedRectangle` for a box, a `Circle`, a `Line` as wide as an underline, a
 * `Cross` over a rectangle of its size — in its colour and style, which the clip's setup then
 * moves like any mobject (a shape its attachment fits is built on its target in the step where its
 * clip starts instead, attach.ts). The colour is always written: Manim's defaults differ per class
 * and per library (ManimCE's `YELLOW` is not #FFFF00). A circle's colour goes to its stroke and
 * fill by name: ManimGL's `Circle` gives its stroke `RED` over a plain `color`. */
/** The constructor of a shape built at its own size about the origin (see `shape` below), in
 * `base` and at the clip opacity `opacity`. */
export function detachedShapeCall(
  target: Target,
  formula: ShapeFormula,
  base: string,
  opacity: number,
): string {
  const style = shapeStyleArgs(formula, opacity, target);
  const colour = quoted(base);
  const w = num(formula.width);
  const h = num(formula.height);
  let call: string;
  switch (formula.shape) {
    case 'box': {
      const round = formula.cornerRadius > 0;
      const args = [`width=${w}`, `height=${h}`];
      if (round) args.push(`corner_radius=${num(formula.cornerRadius)}`);
      call = `${round ? 'RoundedRectangle' : 'Rectangle'}(${[...args, `color=${colour}`, ...style].join(', ')})`;
      break;
    }
    case 'circle': {
      const args = [`radius=${num(formula.width / 2)}`, `stroke_color=${colour}`];
      if (formula.style.fillOpacity > 0) args.push(`fill_color=${colour}`);
      call = `Circle(${[...args, ...style].join(', ')})`;
      break;
    }
    case 'underline':
      call = `Line(${num(formula.width / 2)} * LEFT, ${num(formula.width / 2)} * RIGHT, color=${colour}${style.map((a) => `, ${a}`).join('')})`;
      break;
    case 'cross': {
      // Its lines take the stroke it names; an opacity goes to them afterwards.
      const args = [`Rectangle(width=${w}, height=${h})`, `stroke_color=${colour}`];
      const width = style.find((a) => a.startsWith('stroke_width='));
      if (width) args.push(width);
      const faded = style.find((a) => a.startsWith('stroke_opacity='));
      call = `Cross(${args.join(', ')})${faded ? `.set_stroke(opacity=${faded.slice('stroke_opacity='.length)})` : ''}`;
      break;
    }
    case 'cross_line': {
      // One line between two opposite corners of a box of its size, from the first the diagonal
      // names: a line has a stroke alone.
      const x = num(formula.width / 2);
      const y = num(formula.height / 2);
      const rising = diagonalOf(formula) === 'dl_ur';
      const ends = rising
        ? [`${x} * LEFT + ${y} * DOWN`, `${x} * RIGHT + ${y} * UP`]
        : [`${x} * LEFT + ${y} * UP`, `${x} * RIGHT + ${y} * DOWN`];
      call = `Line(${[...ends, `color=${colour}`, ...strokeArgs(style)].join(', ')})`;
      break;
    }
  }
  return call;
}

/** The stroke's width and opacity among the style arguments of a shape (`shapeStyleArgs`): what
 * a line takes of them. */
export function strokeArgs(style: readonly string[]): string[] {
  return style.filter((a) => a.startsWith('stroke_width=') || a.startsWith('stroke_opacity='));
}

const shape: Emitter<ShapeFormula> = {
  className: { ce: 'SurroundingRectangle', gl: 'SurroundingRectangle' },
  construct: (gen, ctx, base, object) => {
    const { naming } = ctx;
    // A shape its clip repaints is built with the paint of the clip's first state, and with the
    // colour of its fill said (paint.ts).
    const apart = repainted(ctx.clip, object);
    const formula = apart ? paintedShape(object, ctx.clip.initial) : object;
    let call = detachedShapeCall(gen.target, formula, base, ctx.clip.initial.opacity);
    if (apart) call += fillColourCall(formula, ctx.clip.initial);
    return [`${naming.name} = ${call}`];
  },
};

/** The Manim class of each line in ManimCE; ManimGL has `Line` and `DashedLine`, and builds an
 * arrow as a `Line` with a tip (its own `Arrow` is another object, a filled polygon). */
export const LINE_CLASSES: Readonly<Record<LineKind, string>> = {
  line: 'Line',
  dashed: 'DashedLine',
  arrow: 'Arrow',
  double_arrow: 'DoubleArrow',
};

/** ManimCE's class of each shape of tip. */
const CE_TIP_CLASSES: Readonly<Record<LineTip, string>> = {
  triangle: 'ArrowTriangleFilledTip',
  stealth: 'StealthTip',
  dot: 'ArrowCircleFilledTip',
};

/** The stretches of a spline as the `_spline` helper reads them: for each, its two handles and
 * the point it ends at. */
function stretchesLiteral(nodes: readonly SplineNode[]): string {
  const pair = ([u, v]: readonly [number, number]) => `(${num(u)}, ${num(v)})`;
  return `[${splineStretches(nodes)
    .map((stretch) => `(${stretch.map(pair).join(', ')})`)
    .join(', ')}]`;
}

/** The lines that make the mobject `name` of a line object between `start` and `end` — Python
 * expressions: a point, or the glyphs an end is on, which Manim finds the edge of — at `buff`,
 * in the colour `base`. ManimCE builds each with its own class, which caps a short arrow's tip
 * and stroke width itself and takes the shape of each tip (`tip_shape=`; a double arrow's
 * `tip_shape_end=` and `tip_shape_start=`). ManimGL builds an arrow as
 * `Line(…).add_tip(length=, width=)` — its dot by `tip_style=2`, asked twice as long —, and a
 * stealth tip or two tips with the `_arrow` helper, with ManimCE's values: they are worked out
 * here from the line as it is built (`buildLine`), along the object's `vector`. A line that has
 * no length takes no tip there. An arc is the `path_arc=` of the class in both; a spline, the
 * straight line of the class bent by the `_spline` helper, and cut into dashes by `_dashed`.
 * Arguments that are the class's defaults are left out — but the colour in ManimGL, whose line
 * is not white by default. */
export function lineConstruct(
  gen: Codegen,
  name: string,
  formula: LineFormula,
  start: string,
  end: string,
  buff: number,
  base: string,
): string[] {
  const tips = hasTips(formula.line);
  const { curve } = formula;
  // ManimGL's `Line` is light grey unless told (ManimCE's is white): there the colour is always
  // written.
  const colour =
    gen.target === 'ce' && sameColor(base, DEFAULT_COLOR) ? [] : [`color=${quoted(base)}`];
  const said = (value: number, usual: number, kw: string) =>
    Math.abs(value - usual) > 1e-9 ? [`${kw}=${num(value)}`] : [];
  const arc =
    curve?.shape === 'arc' && curve.degrees !== 0
      ? [`path_arc=${num(curve.degrees)} * DEGREES`]
      : [];
  const bent = (call: string): string => {
    if (curve?.shape !== 'spline') return call;
    gen.helpers.add('spline-line');
    return `_spline(${call}, ${stretchesLiteral(curve.nodes)})`;
  };
  if (gen.target === 'ce' || !tips) {
    // The dashes of a spline are cut from the bent line (`_dashed`), not by `DashedLine`.
    const cut = formula.line === 'dashed' && curve?.shape === 'spline';
    const dashLength =
      formula.line === 'dashed' ? said(formula.dashLength, DEFAULT_DASH_LENGTH, 'dash_length') : [];
    const shapes =
      formula.line === 'arrow'
        ? formula.tip === 'triangle'
          ? []
          : [`tip_shape=${CE_TIP_CLASSES[formula.tip]}`]
        : formula.line === 'double_arrow'
          ? [
              ...(formula.tip === 'triangle'
                ? []
                : [`tip_shape_end=${CE_TIP_CLASSES[formula.tip]}`]),
              ...(formula.startTip === 'triangle'
                ? []
                : [`tip_shape_start=${CE_TIP_CLASSES[formula.startTip]}`]),
            ]
          : [];
    const args = [
      start,
      end,
      // An `Arrow` leaves a gap by default; a `Line` leaves none.
      ...said(buff, tips && gen.target === 'ce' ? LINE_BUFFS.arrow : 0, 'buff'),
      ...arc,
      ...(cut ? [] : dashLength),
      ...colour,
      ...said(formula.strokeWidth, LINE_STROKE_WIDTHS[formula.line], 'stroke_width'),
      ...(tips ? said(formula.tipLength, DEFAULT_TIP_LENGTH, 'tip_length') : []),
      ...shapes,
    ];
    const call = bent(
      `${cut ? LINE_CLASSES.line : LINE_CLASSES[formula.line]}(${args.join(', ')})`,
    );
    if (!cut) return [`${name} = ${call}`];
    gen.helpers.add('dashed');
    return [`${name} = _dashed(${[call, ...dashLength].join(', ')})`];
  }
  const { strokeWidth, tip } = buildLine(gen.target, formula.line, [0, 0], formula.vector, formula);
  const call = bent(
    `Line(${[start, end, ...said(buff, 0, 'buff'), ...arc, `stroke_width=${num(strokeWidth)}`, ...colour].join(', ')})`,
  );
  if (!(tip > 0)) return [`${name} = ${call}`];
  if (formula.line === 'arrow' && formula.tip === 'triangle') {
    return [`${name} = ${call}.add_tip(length=${num(tip)}, width=${num(tip)})`];
  }
  if (formula.line === 'arrow' && formula.tip === 'dot') {
    return [`${name} = ${call}.add_tip(length=${num(2 * tip)}, tip_style=2)`];
  }
  gen.helpers.add('arrow');
  const shapes = [
    ...(formula.tip === 'triangle' ? [] : [`end=${quoted(formula.tip)}`]),
    ...(formula.line === 'double_arrow' ? [`start=${quoted(formula.startTip)}`] : []),
  ];
  return [`${name} = _arrow(${[call, `tip=${num(tip)}`, ...shapes].join(', ')})`];
}

/** `line`: here a line that hangs on nothing, between the two points its clip's first state puts
 * its ends at (`lineEndsAt`), at no gap — but an arc whose gap took a part of it (`trim`), which
 * is written between the two points that arc was built from, at that gap (`arcUndrawn`): the
 * constructor places it, so the setup moves nothing (a line with an end on glyphs is built on
 * them in the step where its clip starts instead, attach.ts). The clip's position is the centre
 * the project's library reads of the line, which on an arc is not where the other one reads it:
 * the ends are that library's, and the line is built between them in the export's (audit A4-05). */
const line: Emitter<LineFormula> = {
  className: { ce: 'Line', gl: 'Line' },
  placed: true,
  construct: (gen, ctx, base, formula) => {
    const drawn = lineEndsAt(gen.project.meta.target, formula, ctx.clip.initial);
    const { start, end, buff } =
      formula.curve?.shape === 'arc'
        ? arcUndrawn(gen.target, drawn.start, drawn.end, formula.curve.degrees, formula.curve.trim)
        : { ...drawn, buff: 0 };
    return lineConstruct(gen, ctx.naming.name, formula, point(start), point(end), buff, base);
  },
};

export const EMITTERS: Readonly<Record<FormulaKind, Emitter>> = {
  math,
  tex,
  text,
  brace,
  shape,
  line,
};

/** The emitter of `formula`'s kind. */
export function emitterOf(formula: Pick<Formula, 'kind'>): Emitter {
  return EMITTERS[formula.kind];
}
