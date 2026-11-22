import { describe, expect, it } from 'vitest';
import { boxSize, contoursBox, exactContoursBox } from '../../geom';
import { parseDvisvgmSvg } from '../svg';
import fracSvg from './fixtures/frac.svg?raw';
import zeroGlSvg from './fixtures/zero-gl.svg?raw';

const wrap = (body: string, defs = '') =>
  `<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink' ` +
  `viewBox='100 100 10 10' width='99pt'><defs>${defs}</defs>${body}</svg>`;

describe('parseDvisvgmSvg', () => {
  it('reads dvisvgm output in document order: a, bar, b', () => {
    const shapes = parseDvisvgmSvg(fracSvg);
    expect(shapes.map((s) => s.tag)).toEqual(['path', 'rect', 'path']);
    expect(shapes.map((s) => s.kind)).toEqual(['char', 'rule', 'char']);
    // y down: the numerator is above (smaller y than) the denominator.
    expect(contoursBox(shapes[0]!.contours).maxY).toBeLessThan(
      contoursBox(shapes[2]!.contours).minY,
    );
  });

  it('measures the GL calibration glyph like ManimGL (exact height of "0")', () => {
    const shapes = parseDvisvgmSvg(zeroGlSvg);
    expect(shapes).toHaveLength(1);
    expect(boxSize(exactContoursBox(shapes[0]!.contours))[1]).toBeCloseTo(6.874222, 4);
  });

  it('passes the fill of a group or a <use> down to its shapes (colour labels)', () => {
    const svg = wrap(
      `<g fill='#000001'><use href='#p'/><g><use href='#p'/></g></g>` +
        `<use href='#p' fill='#000002'/><use href='#p'/>`,
      `<path id='p' d='M0 0L1 0L1 1Z'/>`,
    );
    expect(parseDvisvgmSvg(svg).map((s) => s.fill)).toEqual([
      '#000001',
      '#000001',
      '#000002',
      undefined,
    ]);
  });

  it('resolves <use> through href or xlink:href with x/y and nested transforms', () => {
    const svg = wrap(
      `<g transform='translate(10 0)'><use x='1' y='2' xlink:href='#p'/>` +
        `<g transform='scale(2)'><use href='#p' transform='translate(1 1)'/></g></g>`,
      `<path id='p' d='M0 0L1 0L1 1Z'/>`,
    );
    const shapes = parseDvisvgmSvg(svg);
    expect(shapes).toHaveLength(2);
    expect(contoursBox(shapes[0]!.contours)).toEqual({ minX: 11, minY: 2, maxX: 12, maxY: 3 });
    expect(contoursBox(shapes[1]!.contours)).toEqual({ minX: 12, minY: 2, maxX: 14, maxY: 4 });
  });

  it('ignores the root viewBox and anything inside <defs> that is not referenced', () => {
    const shapes = parseDvisvgmSvg(wrap(`<path d='M0 0L1 1'/>`, `<path id='q' d='M5 5L6 6'/>`));
    expect(shapes).toHaveLength(1);
    expect(contoursBox(shapes[0]!.contours)).toEqual({ minX: 0, minY: 0, maxX: 1, maxY: 1 });
  });

  it('skips paths without segments but keeps zero-height rects', () => {
    const shapes = parseDvisvgmSvg(
      wrap(`<path d='M1 1'/><path d=''/><rect x='0' y='3' width='4' height='0'/>`),
    );
    expect(shapes.map((s) => s.tag)).toEqual(['rect']);
    expect(contoursBox(shapes[0]!.contours)).toEqual({ minX: 0, minY: 3, maxX: 4, maxY: 3 });
  });

  it('traces a <rect> as Manim does: from (maxX, maxY) by (minX, maxY) and (minX, minY)', () => {
    // SVGMobject turns a rect into Rectangle = Polygon(UR, UL, DL, DR); where the contour starts
    // decides how a morph pairs its points and where Write begins to trace it.
    const [shape] = parseDvisvgmSvg(wrap(`<rect x='1' y='2' width='4' height='1'/>`));
    const c = shape!.contours[0]!;
    const anchors = [0, 6, 12, 18, 24].map((i) => [c[i], c[i + 1]]);
    expect(anchors).toEqual([
      [5, 3],
      [1, 3],
      [1, 2],
      [5, 2],
      [5, 3],
    ]);
  });

  it('converts line, polyline, polygon, circle and ellipse', () => {
    const shapes = parseDvisvgmSvg(
      wrap(
        `<line x1='0' y1='0' x2='2' y2='0'/><polyline points='0,0 1,1 2,0'/>` +
          `<polygon points='0 0 1 0 1 1'/><circle cx='5' cy='5' r='1'/>` +
          `<ellipse cx='0' cy='0' rx='2' ry='1'/><polyline points=''/>`,
      ),
    );
    expect(shapes.map((s) => s.tag)).toEqual(['line', 'polyline', 'polygon', 'circle', 'ellipse']);
    expect(exactContoursBox(shapes[3]!.contours).maxX).toBeCloseTo(6, 9);
    const polygon = shapes[2]!.contours[0]!;
    expect(polygon.slice(-2)).toEqual([0, 0]); // closed
  });

  it('does not loop on cyclic <use>', () => {
    const svg = wrap(
      `<use xlink:href='#g'/>`,
      `<g id='g'><use xlink:href='#g'/><path d='M0 0L1 1'/></g>`,
    );
    expect(parseDvisvgmSvg(svg)).toHaveLength(1);
  });

  it('rejects malformed XML', () => {
    expect(() => parseDvisvgmSvg('<svg><g></svg>')).toThrow();
  });
});
