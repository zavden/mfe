// @vitest-environment node
/* What the Python says of a shape its clip repaints (paint.ts, D123): the colour of its fill when
 * it is built, and what each Transform changes of its paint — `set_stroke` and `set_fill` naming
 * only what changes, `set_color` while stroke and fill share their colour. */
import { describe, expect, it } from 'vitest';
import {
  createBraceFormula,
  createClip,
  createEmptyProject,
  createShapeFormula,
  createTween,
  type Clip,
  type ClipState,
  type ShapeFormula,
} from '../../../model';
import { tweenHelper, TWEEN_HELPER } from '../helpers';
import { fillColourCall, paintChain, paintedShape, repainted, tweenPaintKw } from '../paint';

const RED = '#FF0000';
const BLUE = '#0000FF';
const ORANGE = '#FF8800';

const box = (fields: Partial<ShapeFormula> = {}): ShapeFormula =>
  createShapeFormula({
    name: 's1',
    color: RED,
    style: { strokeWidth: 4, strokeOpacity: 1, fillOpacity: 0.5 },
    ...fields,
  });

const base: ClipState = {
  position: [0, 0],
  scale: 1,
  rotation: 0,
  flipX: false,
  flipY: false,
  opacity: 1,
  color: null,
  glyphColors: {},
};
const state = (fields: Partial<ClipState> = {}): ClipState => ({ ...base, ...fields });

function clipOf(formula: { id: string }, actions: Clip['actions'] = []): Clip {
  const project = createEmptyProject();
  return createClip(formula.id, project.tracks[0]!.id, 0, 6, { actions });
}

describe('repainted', () => {
  it('is a shape with a fill colour of its own, or one a state of its clip repaints', () => {
    const plain = box();
    expect(repainted(clipOf(plain), plain)).toBe(false);
    expect(repainted(clipOf(plain, [createTween(1, 1, { opacity: 0.5 })]), plain)).toBe(false);
    expect(repainted(clipOf(plain, [createTween(1, 1, { strokeWidth: 8 })]), plain)).toBe(true);
    const own = box({ fillColor: ORANGE });
    expect(repainted(clipOf(own), own)).toBe(true);
    const initial = clipOf(plain);
    initial.initial.fillOpacity = 1;
    expect(repainted(initial, plain)).toBe(true);
    // Nothing else has a paint to repaint.
    const brace = createBraceFormula({ name: 'b1' });
    expect(repainted(clipOf(brace, [createTween(1, 1, { strokeWidth: 8 })]), brace)).toBe(false);
  });
});

describe('what a repainted shape is built with', () => {
  it('says the colour of its fill: its own, else the stroke’s, the clip’s override included', () => {
    expect(fillColourCall(box({ fillColor: ORANGE }), state())).toBe('.set_fill("#FF8800")');
    expect(fillColourCall(box(), state())).toBe('.set_fill("#FF0000")');
    expect(fillColourCall(box(), state({ color: BLUE }))).toBe('.set_fill("#0000FF")');
    expect(fillColourCall(box({ fillColor: ORANGE }), state({ color: BLUE }))).toBe(
      '.set_fill("#FF8800")',
    );
    expect(fillColourCall(box(), state({ fillColor: '#00FF00' }))).toBe('.set_fill("#00FF00")');
    expect(fillColourCall(box({ shape: 'circle' }), state())).toBe('.set_fill("#FF0000")');
  });

  it('says none for a line or a cross, which have no inside', () => {
    expect(fillColourCall(box({ shape: 'underline', fillColor: ORANGE }), state())).toBe('');
    expect(fillColourCall(box({ shape: 'cross', fillColor: ORANGE }), state())).toBe('');
  });

  it('takes the style of the clip’s first state where that state sets one', () => {
    const painted = paintedShape(box(), state({ strokeWidth: 9, fillOpacity: 0 }));
    expect(painted.style).toEqual({ strokeWidth: 9, strokeOpacity: 1, fillOpacity: 0 });
    expect(paintedShape(box(), state()).style).toEqual(box().style);
  });
});

describe('paintChain: what a Transform changes of a shape’s paint', () => {
  const chain = (formula: ShapeFormula, from: Partial<ClipState>, to: Partial<ClipState>) =>
    paintChain(formula, state(from), state({ ...from, ...to })).join('');

  it('names only what changes: nothing for a move', () => {
    expect(chain(box(), {}, { position: [1, 0] })).toBe('');
  });

  it('writes the stroke’s width and opacity, and the fill’s opacity, each alone', () => {
    expect(chain(box(), {}, { strokeWidth: 8 })).toBe('.set_stroke(width=8)');
    expect(chain(box(), {}, { strokeOpacity: 0.4 })).toBe('.set_stroke(opacity=0.4)');
    expect(chain(box(), {}, { fillOpacity: 1 })).toBe('.set_fill(opacity=1)');
    expect(chain(box(), {}, { strokeWidth: 8, strokeOpacity: 0.4, fillOpacity: 0 })).toBe(
      '.set_fill(opacity=0).set_stroke(width=8, opacity=0.4)',
    );
  });

  it('folds the clip’s opacity into both opacities, as a fade of the whole shape always was', () => {
    expect(chain(box(), {}, { opacity: 0.5 })).toBe(
      '.set_fill(opacity=0.25).set_stroke(opacity=0.5)',
    );
    // Both change, and one of the products does not: it is not named.
    expect(chain(box(), {}, { opacity: 0.5, fillOpacity: 1 })).toBe('.set_stroke(opacity=0.5)');
  });

  it('recolours stroke and fill together with set_color while they share their colour', () => {
    expect(chain(box(), {}, { color: BLUE })).toBe('.set_color("#0000FF")');
    expect(chain(box(), {}, { color: BLUE, strokeWidth: 2 })).toBe(
      '.set_color("#0000FF").set_stroke(width=2)',
    );
  });

  it('recolours them apart once the fill has a colour of its own', () => {
    const own = box({ fillColor: ORANGE });
    // The stroke alone: the fill keeps its colour.
    expect(chain(own, {}, { color: BLUE })).toBe('.set_stroke(color="#0000FF")');
    expect(chain(own, {}, { fillColor: '#00FF00' })).toBe('.set_fill(color="#00FF00")');
    expect(chain(own, {}, { color: BLUE, fillColor: '#00FF00', fillOpacity: 1 })).toBe(
      '.set_fill(color="#00FF00", opacity=1).set_stroke(color="#0000FF")',
    );
    // A Transform gives a fill that followed the stroke a colour of its own.
    expect(chain(box(), {}, { fillColor: ORANGE })).toBe('.set_fill(color="#FF8800")');
    expect(chain(box(), {}, { fillColor: ORANGE, color: BLUE })).toBe(
      '.set_fill(color="#FF8800").set_stroke(color="#0000FF")',
    );
    // Given the stroke's own colour, nothing is to change yet.
    expect(chain(box(), {}, { fillColor: RED })).toBe('');
  });

  it('leaves the fill of a line and of a cross out', () => {
    const line = box({ shape: 'underline' });
    expect(chain(line, {}, { fillOpacity: 1, fillColor: ORANGE, strokeWidth: 8 })).toBe(
      '.set_stroke(width=8)',
    );
    expect(chain(box({ shape: 'cross' }), {}, { opacity: 0.5 })).toBe('.set_stroke(opacity=0.5)');
  });
});

describe('tweenPaintKw: the same for a Transform that turns the shape', () => {
  const kw = (formula: ShapeFormula, from: Partial<ClipState>, to: Partial<ClipState>) =>
    tweenPaintKw(formula, state(from), state({ ...from, ...to }));

  it('gives the pairs that change, the clip’s opacity in the two opacities', () => {
    expect(kw(box(), {}, { rotation: 90 })).toEqual([]);
    expect(kw(box(), {}, { strokeWidth: 10 })).toEqual(['width=(4, 10)']);
    expect(kw(box(), {}, { opacity: 0.5, strokeOpacity: 0.4 })).toEqual([
      'opacity=(0.5, 0.25)',
      'stroke=(1, 0.2)',
    ]);
  });

  it('gives the fill’s colours whenever it has one of its own and a colour changes', () => {
    const own = box({ fillColor: ORANGE });
    expect(kw(own, {}, { fillColor: '#00FF00' })).toEqual(['fills=("#FF8800", "#00FF00")']);
    // The stroke alone changes: the fill's pair keeps the helper from painting it in the stroke's.
    expect(kw(own, {}, { color: BLUE })).toEqual(['fills=("#FF8800", "#FF8800")']);
    expect(kw(own, {}, { rotation: 90 })).toEqual([]);
    expect(kw(box(), {}, { color: BLUE })).toEqual([]);
    expect(kw(box(), {}, { fillColor: ORANGE })).toEqual(['fills=("#FF0000", "#FF8800")']);
  });
});

describe('the _Tween helper', () => {
  it('is the same text as ever unless a shape’s style goes along', () => {
    expect(tweenHelper()).toBe(TWEEN_HELPER);
    expect(tweenHelper(false, false)).toBe(TWEEN_HELPER);
    expect(TWEEN_HELPER).not.toContain('width');
    expect(tweenHelper(true)).not.toContain('self.fills');
  });

  it('takes a pair of stroke widths and a pair of fill colours when it does', () => {
    const helper = tweenHelper(false, true);
    expect(helper).toContain('stroke=None, width=None, fills=None, **kwargs');
    expect(helper).toContain('inside = _mix(*self.fills, t) if self.fills else fill');
    expect(helper).toContain('glyph.set_stroke(fill, width=w, opacity=s)');
    expect(tweenHelper(true, true)).toBe(helper);
  });
});
