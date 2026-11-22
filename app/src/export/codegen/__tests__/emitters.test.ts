// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createBraceFormula,
  createClip,
  createEmptyProject,
  createFormula,
  createShapeFormula,
  createTexFormula,
  KINDS,
  type Formula,
  type ShapeFormula,
  type Target,
} from '../../../model';
import { createContext, type ClipCtx, type Codegen, type FormulaCtx } from '../context';
import { EMITTERS, emitterOf, SHAPE_CLASSES, shapeStyleArgs } from '../emitters';

function context(target: Target): Codegen {
  return createContext(createEmptyProject('Demo'), new Map(), {
    target,
    sceneName: 'Demo',
    indexing: 'auto',
    comments: false,
  });
}

/** The clip context of `formula` as prepare.ts builds it, named `f1`, with `fields` of its
 * formula context (the size as exported, a TeX template variable). */
function clipOf(gen: Codegen, formula: Formula, fields: Partial<FormulaCtx> = {}): ClipCtx {
  return {
    clip: createClip(formula.id, 't', 0, 1),
    formula: {
      formula,
      index: 0,
      count: 3,
      layout: [],
      positional: false,
      flat: false,
      fontSize: formula.fontSize,
      texSetup: null,
      textSignature: null,
      ...fields,
    },
    naming: { name: 'f1', target: gen.target, indexing: 'literal', count: 3 },
    z: 0,
    present: new Set(),
    gone: new Set(),
    partColor: new Map(),
    partOpacity: new Map(),
    partsMoved: false,
  };
}

describe('emitters', () => {
  it('has one per kind of object, with the class of each library', () => {
    expect(Object.keys(EMITTERS)).toEqual(Object.keys(KINDS));
    expect(emitterOf(createFormula()).className).toEqual({ ce: 'MathTex', gl: 'Tex' });
    expect(emitterOf(createTexFormula()).className).toEqual({ ce: 'Tex', gl: 'TexText' });
    expect(emitterOf(createBraceFormula()).className).toEqual({ ce: 'Brace', gl: 'Brace' });
    expect(emitterOf(createShapeFormula()).className).toEqual({
      ce: 'SurroundingRectangle',
      gl: 'SurroundingRectangle',
    });
    expect(SHAPE_CLASSES).toEqual({
      box: 'SurroundingRectangle',
      circle: 'Circle',
      underline: 'Underline',
      cross: 'Cross',
      cross_line: 'Line',
    });
  });

  it('writes a detached shape at its fitted size, in its hex colour, the opacity folded in', () => {
    const ce = context('ce');
    const gl = context('gl');
    const lines = (gen: Codegen, shape: ShapeFormula, opacity = 1) => {
      const ctx = clipOf(gen, shape);
      ctx.clip.initial.opacity = opacity;
      return EMITTERS.shape.construct(gen, ctx, shape.color, shape);
    };
    const box = createShapeFormula({ width: 2.5, height: 1.25 });
    expect(lines(ce, box)).toEqual(['f1 = Rectangle(width=2.5, height=1.25, color="#FFFF00")']);
    expect(lines(gl, box)).toEqual(lines(ce, box));
    const rounded = createShapeFormula({
      width: 2,
      height: 1,
      cornerRadius: 0.2,
      style: { fillOpacity: 0.3, strokeWidth: 0, strokeOpacity: 0 },
    });
    expect(lines(ce, rounded, 0.5)).toEqual([
      'f1 = RoundedRectangle(width=2, height=1, corner_radius=0.2, color="#FFFF00", stroke_width=0, fill_opacity=0.15, stroke_opacity=0)',
    ]);
    // A circle's colour goes to its stroke (and fill) by name: ManimGL's Circle strokes RED over color=.
    const circle = createShapeFormula({ shape: 'circle', width: 1.5, height: 1.5 });
    expect(lines(gl, circle)).toEqual(['f1 = Circle(radius=0.75, stroke_color="#FC6255")']);
    const filled = createShapeFormula({
      shape: 'circle',
      width: 1.5,
      height: 1.5,
      style: { fillOpacity: 1, strokeWidth: 6, strokeOpacity: 1 },
    });
    expect(lines(ce, filled, 0.5)).toEqual([
      'f1 = Circle(radius=0.75, stroke_color="#FC6255", fill_color="#FC6255", stroke_width=6, fill_opacity=0.5, stroke_opacity=0.5)',
    ]);
    const line = createShapeFormula({ shape: 'underline', width: 3, height: 0, color: '#58C4DD' });
    expect(lines(ce, line)).toEqual(['f1 = Line(1.5 * LEFT, 1.5 * RIGHT, color="#58C4DD")']);
    const cross = createShapeFormula({ shape: 'cross', width: 1, height: 0.5 });
    expect(lines(gl, cross)).toEqual([
      'f1 = Cross(Rectangle(width=1, height=0.5), stroke_color="#FC6255", stroke_width=6)',
    ]);
    const thin = createShapeFormula({
      shape: 'cross',
      width: 1,
      height: 0.5,
      style: { fillOpacity: 0, strokeWidth: 2, strokeOpacity: 1 },
    });
    expect(lines(ce, thin, 0.8)).toEqual([
      'f1 = Cross(Rectangle(width=1, height=0.5), stroke_color="#FC6255", stroke_width=2).set_stroke(opacity=0.8)',
    ]);
    expect(shapeStyleArgs(thin, 1)).toEqual(['stroke_width=2']);
    expect(shapeStyleArgs(box, 1)).toEqual([]);
    // A cross line: a line between two opposite corners of its box, from the first its diagonal
    // names; its width always said, and no fill.
    const rising = createShapeFormula({ shape: 'cross_line', width: 3, height: 1 });
    expect(lines(ce, rising)).toEqual([
      'f1 = Line(1.5 * LEFT + 0.5 * DOWN, 1.5 * RIGHT + 0.5 * UP, color="#FC6255", stroke_width=6)',
    ]);
    const falling = createShapeFormula({
      shape: 'cross_line',
      diagonal: 'ul_dr',
      width: 3,
      height: 1,
      style: { fillOpacity: 1, strokeWidth: 4, strokeOpacity: 1 },
    });
    expect(lines(gl, falling, 0.5)).toEqual([
      'f1 = Line(1.5 * LEFT + 0.5 * UP, 1.5 * RIGHT + 0.5 * DOWN, color="#FC6255", stroke_width=4, stroke_opacity=0.5)',
    ]);
    expect(shapeStyleArgs(rising, 1)).toEqual(['stroke_width=6']);
  });

  it('writes a detached brace as the Brace of a line as wide as it, sharpness in CE only', () => {
    const brace = createBraceFormula({ width: 2.5, sharpness: 1.5 });
    const ce = context('ce');
    expect(EMITTERS.brace.construct(ce, clipOf(ce, brace), brace.color, brace)).toEqual([
      'b1 = Brace(Line(ORIGIN, 2.5 * RIGHT), DOWN, buff=0, sharpness=1.5)'.replace('b1', 'f1'),
    ]);
    const plain = createBraceFormula({ width: 1 });
    expect(EMITTERS.brace.construct(ce, clipOf(ce, plain), '#FC6255', plain)).toEqual([
      'f1 = Brace(Line(ORIGIN, 1 * RIGHT), DOWN, buff=0, color="#FC6255")',
    ]);
    const gl = context('gl');
    expect(EMITTERS.brace.construct(gl, clipOf(gl, brace), '#FC6255', brace)).toEqual([
      'f1 = Brace(Line(ORIGIN, 2.5 * RIGHT), DOWN, buff=0)',
      'f1.set_color("#FC6255")',
    ]);
  });

  it('writes a Tex (CE) / TexText (GL) for a LaTeX text, wrapped for its layout at the exported size', () => {
    const text = createTexFormula({
      source: 'Hello $x$',
      layout: { width: 4, align: 'left', lineSpacing: 1 },
    });
    const ce = context('ce');
    expect(EMITTERS.tex.construct(ce, clipOf(ce, text), text.color, text)).toEqual([
      'f1 = Tex(r"\\parbox{80.3pt}{\\raggedright Hello $x$\\par}")',
    ]);
    const gl = context('gl');
    // Exported for the other library at a converted size: the box keeps its 4 scene units.
    const converted = clipOf(gl, text, { fontSize: 48 * 1.03113, texSetup: 'preamble' });
    expect(EMITTERS.tex.construct(gl, converted, '#FC6255', text)).toEqual([
      'f1 = TexText(r"\\parbox{80.3003pt}{\\raggedright Hello $x$\\par}", font_size=49.4942, additional_preamble=preamble)',
      'f1.set_color("#FC6255")',
    ]);
    const plain = createTexFormula({ source: 'Hi' });
    expect(EMITTERS.tex.construct(ce, clipOf(ce, plain), plain.color, plain)).toEqual([
      'f1 = Tex(r"Hi")',
    ]);
  });

  it('writes a MathTex for ManimCE: the source, then only what differs from the defaults', () => {
    const gen = context('ce');
    const formula = createFormula({ source: 'x+1' });
    const plain = clipOf(gen, formula);
    expect(EMITTERS.math.construct(gen, plain, formula.color, formula)).toEqual([
      'f1 = MathTex(r"x+1")',
    ]);
    const dressed = clipOf(gen, formula, { fontSize: 36, texSetup: 'template' });
    expect(EMITTERS.math.construct(gen, dressed, '#FC6255', formula)).toEqual([
      'f1 = MathTex(r"x+1", font_size=36, color="#FC6255", tex_template=template)',
    ]);
  });

  it('writes a Tex for ManimGL, coloured afterwards since Tex ignores color=', () => {
    const gen = context('gl');
    const formula = createFormula({ source: 'x+1' });
    expect(EMITTERS.math.construct(gen, clipOf(gen, formula), formula.color, formula)).toEqual([
      'f1 = Tex(r"x+1")',
    ]);
    const dressed = clipOf(gen, formula, { texSetup: 'preamble' });
    expect(EMITTERS.math.construct(gen, dressed, '#FC6255', formula)).toEqual([
      'f1 = Tex(r"x+1", additional_preamble=preamble)',
      'f1.set_color("#FC6255")',
    ]);
  });
});
