/* Python source fragments: literals, names and the frame-exact duration literals. */
import type { Target } from '../../model';
import { EMITTED_SYMBOLS } from './symbols';

/** Number literal: at most 6 decimals, no trailing zeros, no "-0". From 1e21 on, where
 * `toFixed` writes an exponent, the zeros are only trimmed from the mantissa (`1e+30`). */
export function num(x: number, digits = 6): string {
  if (Math.abs(x) >= 1e21) return x.toExponential(digits).replace(/\.?0+e/, 'e');
  const s = x.toFixed(digits).replace(/\.?0+$/, '');
  return s === '-0' || s === '' ? '0' : s;
}

/** `[x, y, 0]`, the point form Manim methods accept. */
/** The `lag_ratio=` keyword of an animation, or nothing for Manim's default. */
export function lagKw(lagRatio: number | null): string[] {
  return lagRatio === null ? [] : [`lag_ratio=${num(lagRatio)}`];
}

/** `<group>.animate(<rate>)<chain>`, built into an animation when `_Part` slices it. */
export function animateExpr(
  group: string,
  rate: readonly string[],
  chain: readonly string[],
  sliced: boolean,
): string {
  const builder = rate.length > 0 ? `.animate(${rate.join(', ')})` : '.animate';
  return `${group}${builder}${chain.join('')}${sliced ? '.build()' : ''}`;
}

export function point(p: readonly [number, number]): string {
  return `[${num(p[0])}, ${num(p[1])}, 0]`;
}

/** A shift vector: `UP`, `0.5 * LEFT`, `np.array([x, y, 0])`. np.array because FadeIn / FadeOut
 * negate it. */
export function vector(v: readonly [number, number]): string {
  const [x, y] = v;
  const axis = (value: number, plus: string, minus: string) => {
    const name = value > 0 ? plus : minus;
    const size = Math.abs(value);
    return Math.abs(size - 1) < 1e-9 ? name : `${num(size)} * ${name}`;
  };
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return 'ORIGIN';
  if (Math.abs(x) < 1e-9) return axis(y, 'UP', 'DOWN');
  if (Math.abs(y) < 1e-9) return axis(x, 'RIGHT', 'LEFT');
  return `np.array([${num(x)}, ${num(y)}, 0])`;
}

/** `text` without the control characters that break Python source: U+0000 (the parser refuses
 * it) and the other C0 controls except tab, line feed and carriage return. */
export function safeText(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\0-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/** One comment line from free text (a project or formula name): line breaks become spaces, so
 * that the text cannot end the comment and go on as a statement. */
export function pyComment(text: string): string {
  return `# ${safeText(text).replace(/\r\n|[\r\n]/g, ' ')}`;
}

/** The comment that opens a file, from free text. Python reads the first two lines of a file for
 * the declaration of its encoding (PEP 263): `coding:` or `coding=` and a name, anywhere in a
 * comment. A project called "Huffman coding: an example" would declare the encoding `an`, and
 * Python would refuse the file. A space before the sign is no declaration, and the words stay. */
export function pyHeadComment(text: string): string {
  return pyComment(text).replace(/coding(?=[:=])/g, 'coding ');
}

/** Python string literal for `text`: a raw string when that is possible (LaTeX reads best
 * without doubled backslashes) — triple-quoted for a text of several lines, so that a multi-line
 * formula reads as it was typed — else an escaped one. A raw string cannot end in an odd number
 * of backslashes, nor a triple-quoted one hold `"""` or end in a quote; `\r` is always escaped.
 * The lines of a triple-quoted string after the first are its own text: the generated scene
 * does not indent them (`physicalLines`). */
export function pyString(raw: string): string {
  const text = safeText(raw);
  const oddEnd = /\\$/.test(text.replace(/\\\\/g, ''));
  const rawSafe = (quote: string) => !text.includes(quote) && !/[\n\r]/.test(text) && !oddEnd;
  if (rawSafe('"')) return `r"${text}"`;
  if (rawSafe("'")) return `r'${text}'`;
  if (/\n/.test(text) && !/\r/.test(text) && !text.includes('"""') && !/"$/.test(text) && !oddEnd) {
    return `r"""${text}"""`;
  }
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r');
  return `"${escaped}"`;
}

/** The physical lines of generated Python source, each with whether it starts inside a string
 * literal — a continuation line of a triple-quoted string, whose leading spaces are part of the
 * string (so the scene must not indent it). Knows the literals and comments the generator
 * writes: `#` outside a literal comments out the rest of the line; inside one, a backslash keeps
 * the next character from closing it (raw literals included). */
export function physicalLines(code: string): { text: string; inString: boolean }[] {
  const out: { text: string; inString: boolean }[] = [];
  let quote: string | null = null;
  let start = 0;
  let inString = false;
  const lineEnd = (i: number) => {
    out.push({ text: code.slice(start, i), inString });
    start = i + 1;
    inString = quote !== null;
  };
  for (let i = 0; i < code.length; i++) {
    const c = code[i]!;
    if (c === '\n') lineEnd(i);
    else if (quote === null) {
      if (c === '#') {
        while (i + 1 < code.length && code[i + 1] !== '\n') i++;
      } else if (c === '"' || c === "'") {
        quote = code.startsWith(c.repeat(3), i) ? c.repeat(3) : c;
        i += quote.length - 1;
      }
    } else if (c === '\\') {
      if (code[i + 1] !== '\n') i++;
    } else if (code.startsWith(quote, i)) {
      i += quote.length - 1;
      quote = null;
    }
  }
  out.push({ text: code.slice(start), inString });
  return out;
}

/** Plain (non-raw) string literal, for colours and messages. */
export function quoted(text: string): string {
  return `"${safeText(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

const KEYWORDS = new Set(
  (
    'False None True and as assert async await break class continue def del elif else except ' +
    'finally for from global if import in is lambda nonlocal not or pass raise return try ' +
    'while with yield match case type'
  ).split(' '),
);

/** Fixed emitted names plus the historical preferred names of allocated setup variables. */
const RESERVED = new Set([...EMITTED_SYMBOLS, 'template', 'preamble']);

/** A valid, non-reserved Python identifier derived from `name`. */
export function identifier(name: string, fallback = 'f'): string {
  let id = name
    .normalize('NFKD')
    .replace(/[^\w]+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!/^[A-Za-z_]/.test(id)) id = id ? `${fallback}_${id}` : fallback;
  if (id.startsWith('_')) id = `${fallback}${id}`;
  if (KEYWORDS.has(id) || RESERVED.has(id)) id = `${id}_`;
  return id;
}

/** A PascalCase class name from a project name ("Hello: one-to-one" → "HelloOneToOne"). */
export function sceneClassName(name: string): string {
  const words = name
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  let id = words.map((w) => w[0]!.toUpperCase() + w.slice(1)).join('');
  if (!id) id = 'FormulaScene';
  if (/^[0-9]/.test(id)) id = `Scene${id}`;
  if (KEYWORDS.has(id) || RESERVED.has(id)) id = `${id}Scene`;
  return id;
}

/** True when `name` can be used as the Scene class name. */
export function isValidClassName(name: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && !KEYWORDS.has(name) && !RESERVED.has(name);
}

/** Allocates unique identifiers (`f1`, `f1_2`, …). */
export class NameAllocator {
  private used = new Set<string>();
  constructor(reserved: Iterable<string> = []) {
    for (const r of reserved) this.used.add(r);
  }
  /** A free name from `base`; with `suffixes`, `name + suffix` is free too and reserved. */
  take(base: string, suffixes: readonly string[] = []): string {
    const free = (name: string) =>
      !this.used.has(name) && suffixes.every((s) => !this.used.has(name + s));
    let name = base;
    for (let n = 2; !free(name); n++) name = `${base}_${n}`;
    this.used.add(name);
    for (const s of suffixes) this.used.add(name + s);
    return name;
  }
}

/** How a Manim duration is turned into frames:
 *  - 'ceil':  `len(np.arange(0, t, 1 / fps))` — every `play`, and `wait` in ManimGL;
 *  - 'floor': `int(t / (1 / fps))` — a static `wait` in ManimCE (`freeze_current_frame`). */
export type FrameRounding = 'ceil' | 'floor';

export function frameRounding(target: Target, call: 'play' | 'wait'): FrameRounding {
  return target === 'ce' && call === 'wait' ? 'floor' : 'ceil';
}

/** Frames Manim renders for a duration literal (same IEEE arithmetic as NumPy / Python). */
export function framesOf(literal: string, fps: number, rounding: FrameRounding): number {
  const q = Number(literal) / (1 / fps);
  return rounding === 'ceil' ? Math.ceil(q) : Math.floor(q);
}

/** A short decimal literal for `frames / fps` seconds that Manim turns into exactly `frames`
 * frames. `frames / fps` itself often lands a hair above or below a whole number of frames in
 * floating point (23 / 60 → `np.arange` yields 24 frames), so when the plain value does not
 * work the literal is rounded to 6 decimals in the safe direction (a shift of < 1 µs). */
export function secondsLiteral(frames: number, fps: number, rounding: FrameRounding): string {
  const ok = (s: string) => framesOf(s, fps, rounding) === frames;
  const micro = frames * 1_000_000;
  if (micro % fps === 0) {
    const exact = num(frames / fps);
    if (ok(exact)) return exact;
  }
  // Round in the direction that keeps the frame count: down for ceil, up for floor.
  const step = rounding === 'ceil' ? -1 : 1;
  let units = rounding === 'ceil' ? Math.floor(micro / fps) : Math.ceil(micro / fps);
  for (let i = 0; i < 8; i++, units += step) {
    const s = num(units / 1_000_000);
    // ManimCE refuses run times below one frame (it warns and uses 1 / fps).
    if (Number(s) * fps < 1 - 1e-12) break;
    if (ok(s)) return s;
  }
  const plain = String(frames / fps);
  if (ok(plain)) return plain;
  // Nudge by one ulp at a time (always terminates within a couple of steps).
  let value = frames / fps;
  for (let i = 0; i < 64; i++) {
    value = nextDouble(value, rounding === 'ceil' ? -1 : 1);
    if (ok(String(value))) return String(value);
  }
  return plain;
}

function nextDouble(x: number, direction: 1 | -1): number {
  const buffer = new DataView(new ArrayBuffer(8));
  buffer.setFloat64(0, x);
  const bits = buffer.getBigUint64(0);
  buffer.setBigUint64(0, x > 0 === direction > 0 ? bits + 1n : bits - 1n);
  return buffer.getFloat64(0);
}

/** Literal for the fraction p / q in [0, 1] (exactly `0` and `1` at the ends: `_Part` compares
 * with them). */
export function fractionLiteral(p: number, q: number): string {
  if (p === 0) return '0';
  if (p === q) return '1';
  const g = gcd(p, q);
  const [a, b] = [p / g, q / g];
  // Denominators of the form 2^i 5^j are short decimals.
  let d = b;
  while (d % 2 === 0) d /= 2;
  while (d % 5 === 0) d /= 5;
  if (d === 1 && num(a / b, 6) === String(a / b)) return String(a / b);
  return `${a} / ${b}`;
}

function gcd(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return Math.abs(a);
}
