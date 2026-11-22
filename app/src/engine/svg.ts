/* dvisvgm SVG → shapes, in the order Manim turns them into submobjects.
 *
 * Mirrors ManimCE's `SVGMobject.get_mobjects_from` (and ManimGL's `mobjects_from_svg`) on top of
 * svgelements: a depth-first walk in document order; `<g>` and `<use>` are containers (a `<use>`
 * instantiates its `xlink:href`/`href` target with `translate(x, y)` after its own transform);
 * `<defs>`, `<symbol>`, `<clipPath>`, `<mask>`… are never drawn directly; every shape element
 * (`path`, `rect`, `line`, `polyline`, `polygon`, `circle`, `ellipse`) becomes one shape with all
 * ancestor transforms applied. The root `<svg>`'s viewBox/size are ignored, because Manim strips
 * the root attributes before parsing (modify_xml_tree).
 *
 * Empty geometry: a path or polyline without segments has no points and Manim drops it; a rect
 * always yields points (even with zero height), so rects always count. Coordinates stay in SVG
 * space (y down); engine/glyphs.ts flips, centres and scales them. */
import {
  IDENTITY,
  ellipseContour,
  lineTo,
  multiply,
  parseSvgPath,
  parseSvgTransform,
  rectContour,
  transformContour,
  translate,
  type Contour,
  type Mat2D,
} from '../geom';

export interface SvgShape {
  /** 'rule' for `<rect>` (TeX rules: fraction bars, radical overlines); 'char' otherwise. */
  kind: 'char' | 'rule';
  /** Element name, e.g. "path" or "rect". */
  tag: string;
  /** Closed or open cubic contours in SVG units, y down, all transforms applied. */
  contours: Contour[];
  /** The `fill` attribute of the element or of its nearest ancestor that has one (a colour
   * group: `<g fill='#000001'>`), when any. */
  fill?: string;
}

const NOT_RENDERED = new Set([
  'defs',
  'symbol',
  'clipPath',
  'mask',
  'pattern',
  'marker',
  'linearGradient',
  'radialGradient',
  'filter',
  'title',
  'desc',
  'metadata',
  'style',
  'script',
  'text',
  'foreignObject',
  'image',
]);

const XLINK_NS = 'http://www.w3.org/1999/xlink';

function num(el: Element, name: string, fallback = 0): number {
  const v = el.getAttribute(name);
  if (v === null || v.trim() === '') return fallback;
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

function pointList(text: string | null): number[] {
  return (text?.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);
}

/** Contours of one shape element in its own user space, or null when it has no geometry. */
function shapeContours(el: Element): Contour[] | null {
  switch (el.localName) {
    case 'path': {
      const contours = parseSvgPath(el.getAttribute('d') ?? '');
      return contours.length > 0 ? contours : null;
    }
    case 'rect': {
      const x = num(el, 'x');
      const y = num(el, 'y');
      const w = num(el, 'width');
      const h = num(el, 'height');
      const rxAttr = el.getAttribute('rx');
      const ryAttr = el.getAttribute('ry');
      let rx = rxAttr !== null ? num(el, 'rx') : ryAttr !== null ? num(el, 'ry') : 0;
      let ry = ryAttr !== null ? num(el, 'ry') : rx;
      if (rx === 0 || ry === 0)
        return [rectContour({ minX: x, minY: y, maxX: x + w, maxY: y + h })];
      rx = Math.min(Math.abs(rx), Math.abs(w) / 2);
      ry = Math.min(Math.abs(ry), Math.abs(h) / 2);
      const d =
        `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}` +
        `A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}` +
        `V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
      return parseSvgPath(d);
    }
    case 'line': {
      const c: Contour = [num(el, 'x1'), num(el, 'y1')];
      lineTo(c, num(el, 'x2'), num(el, 'y2'));
      return [c];
    }
    case 'polyline':
    case 'polygon': {
      const p = pointList(el.getAttribute('points'));
      if (p.length < 2) return null;
      const c: Contour = [p[0]!, p[1]!];
      for (let i = 2; i + 1 < p.length; i += 2) lineTo(c, p[i]!, p[i + 1]!);
      if (el.localName === 'polygon' && (c[0] !== p[p.length - 2] || c[1] !== p[p.length - 1]))
        lineTo(c, p[0]!, p[1]!);
      return c.length > 2 ? [c] : null;
    }
    case 'circle': {
      const r = num(el, 'r');
      return [ellipseContour(num(el, 'cx'), num(el, 'cy'), r, r)];
    }
    case 'ellipse':
      return [ellipseContour(num(el, 'cx'), num(el, 'cy'), num(el, 'rx'), num(el, 'ry'))];
    default:
      return null;
  }
}

/** Parse dvisvgm output into shapes in Manim's submobject order. Throws on malformed XML. */
export function parseDvisvgmSvg(svgText: string): SvgShape[] {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.documentElement;
  if (!root || root.localName !== 'svg' || doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('Invalid SVG from dvisvgm.');
  }
  const byId = new Map<string, Element>();
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    const id = el.getAttribute('id');
    if (id && !byId.has(id)) byId.set(id, el);
  }

  const shapes: SvgShape[] = [];
  const active = new Set<Element>(); // <use> cycle guard

  const visit = (el: Element, parent: Mat2D, isRoot: boolean, inherited?: string) => {
    const name = el.localName;
    if (NOT_RENDERED.has(name)) return;
    const own = isRoot ? IDENTITY : parseSvgTransform(el.getAttribute('transform'));
    let m = multiply(parent, own);
    const ownFill = el.getAttribute('fill')?.trim();
    const fill = ownFill && ownFill !== 'currentColor' ? ownFill : inherited;
    if (name === 'svg' || name === 'g' || name === 'a' || name === 'switch') {
      if (name === 'svg' && !isRoot) m = multiply(m, translate(num(el, 'x'), num(el, 'y')));
      for (const child of Array.from(el.children)) visit(child, m, false, fill);
      return;
    }
    if (name === 'use') {
      const href = el.getAttribute('href') ?? el.getAttributeNS(XLINK_NS, 'href');
      const target = href?.startsWith('#') ? byId.get(href.slice(1)) : undefined;
      if (!target || active.has(target)) return;
      const targetName = target.localName;
      if (targetName !== 'symbol' && NOT_RENDERED.has(targetName)) return;
      m = multiply(m, translate(num(el, 'x'), num(el, 'y')));
      active.add(target);
      // The referenced element is rendered even though it lives inside <defs>.
      if (targetName === 'symbol') {
        for (const child of Array.from(target.children)) visit(child, m, false, fill);
      } else {
        visit(target, m, false, fill);
      }
      active.delete(target);
      return;
    }
    const contours = shapeContours(el);
    if (!contours) return;
    shapes.push({
      kind: name === 'rect' ? 'rule' : 'char',
      tag: name,
      contours: contours.map((c) => transformContour(m, c)),
      ...(fill ? { fill } : {}),
    });
  };

  visit(root, IDENTITY, true);
  return shapes;
}
