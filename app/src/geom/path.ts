/* SVG path data and transform attributes → cubic contours, plus exact (curve-extrema) boxes.
 *
 * parseSvgPath implements the full SVG 1.1 path grammar (M L H V C S Q T A Z, absolute and
 * relative, implicit repeats, compact numbers such as "1.5.5" or "-.3-.2", packed arc flags).
 * Every segment becomes a cubic: quadratics are degree-elevated exactly, lines get control
 * points at 1/3 and 2/3 (the Contour convention) and arcs are split into ≤ 90° pieces, each
 * approximated by one cubic (error < 3·10⁻⁴ of the radius). A subpath without segments (a lone
 * "M") produces no contour, mirroring Manim, whose mobjects get no points from it. Malformed
 * data ends parsing at the error, keeping what came before (SVG error handling). */
import { IDENTITY, lineTo, multiply } from './primitives';
import type { Box, Contour, Mat2D } from './types';

const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/;

class PathScanner {
  private pos = 0;
  constructor(private readonly text: string) {}

  private skipSeparators(): void {
    while (this.pos < this.text.length && /[\s,]/.test(this.text[this.pos]!)) this.pos++;
  }

  /** Next command letter, or null when the next token is not a letter (or at the end). */
  peekCommand(): string | null {
    this.skipSeparators();
    const ch = this.text[this.pos];
    return ch !== undefined && /[MmLlHhVvCcSsQqTtAaZz]/.test(ch) ? ch : null;
  }

  takeCommand(): void {
    this.pos++;
  }

  atEnd(): boolean {
    this.skipSeparators();
    return this.pos >= this.text.length;
  }

  /** True when a number follows (used for implicit command repetition). */
  hasNumber(): boolean {
    this.skipSeparators();
    return NUMBER_RE.test(this.text.slice(this.pos, this.pos + 32));
  }

  number(): number {
    this.skipSeparators();
    const m = NUMBER_RE.exec(this.text.slice(this.pos, this.pos + 64));
    if (!m) throw new SyntaxError(`Expected a number at ${this.pos}`);
    this.pos += m[0].length;
    return parseFloat(m[0]);
  }

  /** Arc flags are a single "0" or "1" and need no separator ("a1 1 0 01 1 1"). */
  flag(): boolean {
    this.skipSeparators();
    const ch = this.text[this.pos];
    if (ch !== '0' && ch !== '1') throw new SyntaxError(`Expected a flag at ${this.pos}`);
    this.pos++;
    return ch === '1';
  }
}

/** Exact degree elevation of the quadratic (x0,y0)-(qx,qy)-(x,y), appended to `contour`. */
function quadTo(contour: Contour, qx: number, qy: number, x: number, y: number): void {
  const x0 = contour[contour.length - 2]!;
  const y0 = contour[contour.length - 1]!;
  contour.push(
    x0 + (2 / 3) * (qx - x0),
    y0 + (2 / 3) * (qy - y0),
    x + (2 / 3) * (qx - x),
    y + (2 / 3) * (qy - y),
    x,
    y,
  );
}

/** SVG elliptical arc (endpoint parameterisation, spec F.6.5) as cubics appended to `contour`. */
function arcTo(
  contour: Contour,
  rxIn: number,
  ryIn: number,
  rotationDeg: number,
  largeArc: boolean,
  sweep: boolean,
  x: number,
  y: number,
): void {
  const x0 = contour[contour.length - 2]!;
  const y0 = contour[contour.length - 1]!;
  if (x0 === x && y0 === y) return;
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) {
    lineTo(contour, x, y);
    return;
  }
  const phi = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x0 - x) / 2;
  const dy = (y0 - y) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  let coef = Math.sqrt(Math.max(0, num / den));
  if (largeArc === sweep) coef = -coef;
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x0 + x) / 2;
  const cy = sin * cxp + cos * cyp + (y0 + y) / 2;
  const angle = (ux: number, uy: number, vx: number, vy: number) =>
    Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const theta1 = angle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let delta = angle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!sweep && delta > 0) delta -= 2 * Math.PI;
  if (sweep && delta < 0) delta += 2 * Math.PI;

  const pieces = Math.max(1, Math.ceil(Math.abs(delta) / (Math.PI / 2) - 1e-9));
  const step = delta / pieces;
  const k = (4 / 3) * Math.tan(step / 4);
  const point = (t: number): [number, number] => {
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    return [cx + cos * ex - sin * ey, cy + sin * ex + cos * ey];
  };
  const derivative = (t: number): [number, number] => {
    const ex = -rx * Math.sin(t);
    const ey = ry * Math.cos(t);
    return [cos * ex - sin * ey, sin * ex + cos * ey];
  };
  for (let i = 0; i < pieces; i++) {
    const t1 = theta1 + i * step;
    const t2 = t1 + step;
    const p1 = point(t1);
    const p2 = i === pieces - 1 ? ([x, y] as [number, number]) : point(t2);
    const d1 = derivative(t1);
    const d2 = derivative(t2);
    contour.push(
      p1[0] + k * d1[0],
      p1[1] + k * d1[1],
      p2[0] - k * d2[0],
      p2[1] - k * d2[1],
      p2[0],
      p2[1],
    );
  }
}

/** Parse SVG path data into cubic contours (same coordinate system as the input). */
export function parseSvgPath(d: string): Contour[] {
  const contours: Contour[] = [];
  const scan = new PathScanner(d);
  let current: Contour | null = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  // Reflection sources for S/T: last cubic second control point / last quadratic control point.
  let lastCubic: [number, number] | null = null;
  let lastQuad: [number, number] | null = null;
  let command: string | null = null;

  const finish = () => {
    if (current && current.length > 2) contours.push(current);
    current = null;
  };
  const ensureContour = (): Contour => {
    if (!current) current = [x, y];
    return current;
  };

  try {
    while (!scan.atEnd()) {
      const next = scan.peekCommand();
      if (next) {
        scan.takeCommand();
        command = next;
      } else if (command === null || /[Zz]/.test(command) || !scan.hasNumber()) {
        break; // data without a command, or garbage
      }
      const cmd: string = command!;
      const rel = cmd === cmd.toLowerCase();
      const ox = rel ? x : 0;
      const oy = rel ? y : 0;
      let cubic: [number, number] | null = null;
      let quad: [number, number] | null = null;
      switch (cmd.toUpperCase()) {
        case 'M': {
          finish();
          x = ox + scan.number();
          y = oy + scan.number();
          startX = x;
          startY = y;
          current = [x, y];
          // Further coordinate pairs are implicit line-tos.
          command = rel ? 'l' : 'L';
          break;
        }
        case 'L': {
          const nx = ox + scan.number();
          const ny = oy + scan.number();
          lineTo(ensureContour(), nx, ny);
          x = nx;
          y = ny;
          break;
        }
        case 'H': {
          const nx = ox + scan.number();
          lineTo(ensureContour(), nx, y);
          x = nx;
          break;
        }
        case 'V': {
          const ny = oy + scan.number();
          lineTo(ensureContour(), x, ny);
          y = ny;
          break;
        }
        case 'C': {
          const c1x = ox + scan.number();
          const c1y = oy + scan.number();
          const c2x = ox + scan.number();
          const c2y = oy + scan.number();
          const nx = ox + scan.number();
          const ny = oy + scan.number();
          ensureContour().push(c1x, c1y, c2x, c2y, nx, ny);
          cubic = [c2x, c2y];
          x = nx;
          y = ny;
          break;
        }
        case 'S': {
          const c1x: number = lastCubic ? 2 * x - lastCubic[0] : x;
          const c1y: number = lastCubic ? 2 * y - lastCubic[1] : y;
          const c2x = ox + scan.number();
          const c2y = oy + scan.number();
          const nx = ox + scan.number();
          const ny = oy + scan.number();
          ensureContour().push(c1x, c1y, c2x, c2y, nx, ny);
          cubic = [c2x, c2y];
          x = nx;
          y = ny;
          break;
        }
        case 'Q': {
          const qx = ox + scan.number();
          const qy = oy + scan.number();
          const nx = ox + scan.number();
          const ny = oy + scan.number();
          quadTo(ensureContour(), qx, qy, nx, ny);
          quad = [qx, qy];
          x = nx;
          y = ny;
          break;
        }
        case 'T': {
          const qx: number = lastQuad ? 2 * x - lastQuad[0] : x;
          const qy: number = lastQuad ? 2 * y - lastQuad[1] : y;
          const nx = ox + scan.number();
          const ny = oy + scan.number();
          quadTo(ensureContour(), qx, qy, nx, ny);
          quad = [qx, qy];
          x = nx;
          y = ny;
          break;
        }
        case 'A': {
          const rx = scan.number();
          const ry = scan.number();
          const rotation = scan.number();
          const large = scan.flag();
          const sweep = scan.flag();
          const nx = ox + scan.number();
          const ny = oy + scan.number();
          arcTo(ensureContour(), rx, ry, rotation, large, sweep, nx, ny);
          x = nx;
          y = ny;
          break;
        }
        case 'Z': {
          if (current) {
            const c: Contour = current;
            if (x !== startX || y !== startY) lineTo(c, startX, startY);
          }
          finish();
          x = startX;
          y = startY;
          break;
        }
      }
      lastCubic = cubic;
      lastQuad = quad;
    }
  } catch {
    // Malformed data: keep everything parsed so far.
  }
  finish();
  return contours;
}

/** SVG `transform` attribute → matrix (matrix, translate, scale, rotate, skewX, skewY). An
 * invalid list yields the identity, as in browsers. */
export function parseSvgTransform(text: string | null | undefined): Mat2D {
  if (!text) return [...IDENTITY];
  let m: Mat2D = [...IDENTITY];
  const re = /([a-zA-Z]+)\s*\(([^)]*)\)/g;
  for (const match of text.matchAll(re)) {
    const name = match[1]!;
    const args = (match[2]!.match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) ?? []).map(Number);
    const [p = 0, q, r] = args;
    let t: Mat2D;
    switch (name) {
      case 'matrix':
        if (args.length !== 6) return [...IDENTITY];
        t = args as Mat2D;
        break;
      case 'translate':
        t = [1, 0, 0, 1, p, q ?? 0];
        break;
      case 'scale':
        t = [p, 0, 0, q ?? p, 0, 0];
        break;
      case 'rotate': {
        const a = (p * Math.PI) / 180;
        const rot: Mat2D = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a), 0, 0];
        t =
          q !== undefined && r !== undefined
            ? multiply(multiply([1, 0, 0, 1, q, r], rot), [1, 0, 0, 1, -q, -r])
            : rot;
        break;
      }
      case 'skewX':
        t = [1, 0, Math.tan((p * Math.PI) / 180), 1, 0, 0];
        break;
      case 'skewY':
        t = [1, Math.tan((p * Math.PI) / 180), 0, 1, 0, 0];
        break;
      default:
        return [...IDENTITY];
    }
    m = multiply(m, t);
  }
  return m;
}

/** Closed ellipse contour (four cubic quarter arcs, starting at the rightmost point). */
export function ellipseContour(cx: number, cy: number, rx: number, ry: number): Contour {
  const k = (4 / 3) * Math.tan(Math.PI / 8);
  return [
    cx + rx,
    cy,
    cx + rx,
    cy + k * ry,
    cx + k * rx,
    cy + ry,
    cx,
    cy + ry,
    cx - k * rx,
    cy + ry,
    cx - rx,
    cy + k * ry,
    cx - rx,
    cy,
    cx - rx,
    cy - k * ry,
    cx - k * rx,
    cy - ry,
    cx,
    cy - ry,
    cx + k * rx,
    cy - ry,
    cx + rx,
    cy - k * ry,
    cx + rx,
    cy,
  ];
}

/** Parameters t ∈ (0, 1) where one coordinate of a cubic Bézier has a local extremum. */
function cubicExtrema(p0: number, p1: number, p2: number, p3: number): number[] {
  // B'(t)/3 = a t² + b t + c
  const a = -p0 + 3 * p1 - 3 * p2 + p3;
  const b = 2 * (p0 - 2 * p1 + p2);
  const c = p1 - p0;
  const out: number[] = [];
  if (Math.abs(a) < 1e-12) {
    if (Math.abs(b) > 1e-12) out.push(-c / b);
  } else {
    const disc = b * b - 4 * a * c;
    if (disc >= 0) {
      const s = Math.sqrt(disc);
      out.push((-b + s) / (2 * a), (-b - s) / (2 * a));
    }
  }
  return out.filter((t) => t > 0 && t < 1);
}

function cubicAt(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const u = 1 - t;
  return u * u * u * p0 + 3 * u * u * t * p1 + 3 * u * t * t * p2 + t * t * t * p3;
}

/** Tight box of the drawn outline (curve extrema, not control points). This is the box
 * svgelements' `bbox()` returns, which ManimGL uses to calibrate Tex sizes. */
export function exactContoursBox(contours: readonly Contour[]): Box {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const addX = (x: number) => {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
  };
  const addY = (y: number) => {
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  };
  for (const c of contours) {
    if (c.length < 2) continue;
    addX(c[0]!);
    addY(c[1]!);
    for (let i = 2; i + 5 < c.length; i += 6) {
      const x0 = c[i - 2]!;
      const y0 = c[i - 1]!;
      const [x1, y1, x2, y2, x3, y3] = [
        c[i]!,
        c[i + 1]!,
        c[i + 2]!,
        c[i + 3]!,
        c[i + 4]!,
        c[i + 5]!,
      ];
      addX(x3);
      addY(y3);
      for (const t of cubicExtrema(x0, x1, x2, x3)) addX(cubicAt(x0, x1, x2, x3, t));
      for (const t of cubicExtrema(y0, y1, y2, y3)) addY(cubicAt(y0, y1, y2, y3, t));
    }
  }
  return minX === Infinity ? { minX: 0, minY: 0, maxX: 0, maxY: 0 } : { minX, minY, maxX, maxY };
}
