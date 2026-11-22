/* LaTeX patterns for match colours (docs/ARCHITECTURE.md §4, "Labelled renders").
 *
 * A pattern is a piece of LaTeX as typed ("x", "\frac{a}{b}", "$x^2$"). It occurs in a formula
 * wherever the formula's tokens repeat the pattern's — the way ManimGL's `Tex(t2c=…)` matches
 * substrings, but on tokens, so that spaces do not count ("x y" is "xy") and "x" is not found
 * inside "\xi". The tokens are ManimGL's (`Tex.get_command_matches`): a command (`\name` or
 * `\<char>`), a brace, a column break `&`, a row break `\\`, any other character — except that
 * `\left`, `\right`, `\middle` and `\big`… keep the delimiter after them (`\left(` is one
 * token): a delimiter cannot be coloured apart from its command, and a `\left` cannot be wrapped
 * without its `\right`, so a pattern takes both or neither (`patternIssue`).
 *
 * The labelled source wraps every occurrence in a colour group, `{\color[RGB]{1,0,k}…}` with
 * k the pattern's number: a render of it tells which glyphs each pattern covers by their fill
 * (`engine/labelled.ts`), while the glyph geometry comes from the plain render. Where patterns
 * overlap, the lower one in the list wins (as later keys of Manim's `tex_to_color_map` do): an
 * occurrence inside a later pattern's is dropped; one that partly overlaps a later pattern's is
 * dropped too, and reported. The group is a single brace, not Manim's `{{ }}`, and it never
 * touches a brace of the source (a space goes between), so that neither ManimCE's double-brace
 * splitting (which would let the colour leak out of the group) nor ManimGL's own labelling of
 * `{{ }}` groups reacts to it; the red component keeps the labels apart from the colours
 * `{0,0,k}` that ManimGL gives those groups in every render. */

export type TokenKind = 'command' | 'open' | 'close' | 'column' | 'row' | 'char';

export interface TexToken {
  text: string;
  kind: TokenKind;
  /** Character offsets in the source, [start, end). */
  start: number;
  end: number;
}

/** A command name, a `\` followed by any one character (`\\`, `\{`, `\,`…), a brace, `&`, or
 * one non-space character. */
const TOKEN = /\\(?:[a-zA-Z]+|[\s\S])|[{}&]|\S/g;

/** Commands that take the delimiter after them (`\left(`, `\big\{`…). */
const SIZING_COMMANDS = new Set([
  '\\left',
  '\\right',
  '\\middle',
  ...['', 'l', 'r', 'm'].flatMap((side) =>
    ['big', 'Big', 'bigg', 'Bigg'].map((size) => `\\${size}${side}`),
  ),
]);

/** The sizing command a token starts with, when the token is that command with its delimiter
 * (`\left` for `\left(` or `\left\{`) or the command alone; null for any other token
 * (`\leftarrow` is a command of its own). */
export function sizingCommand(token: TexToken): string | null {
  if (token.kind !== 'command') return null;
  const m = /^(\\[a-zA-Z]+)(?:\\|[^a-zA-Z]|$)/.exec(token.text);
  return m && SIZING_COMMANDS.has(m[1]!) ? m[1]! : null;
}

export function tokenizeTex(source: string): TexToken[] {
  const tokens: TexToken[] = [];
  for (const m of source.matchAll(TOKEN)) {
    const text = m[0];
    const last = tokens.at(-1);
    // A delimiter (a command or a non-letter character) right after a sizing command joins it.
    if (
      last &&
      last.kind === 'command' &&
      SIZING_COMMANDS.has(last.text) &&
      (text.startsWith('\\') || !/[a-zA-Z]/.test(text))
    ) {
      last.text += text;
      last.end = m.index + text.length;
      continue;
    }
    const kind: TokenKind =
      text === '{'
        ? 'open'
        : text === '}'
          ? 'close'
          : text === '&'
            ? 'column'
            : text === '\\\\'
              ? 'row'
              : text.startsWith('\\')
                ? 'command'
                : 'char';
    tokens.push({ text, kind, start: m.index, end: m.index + text.length });
  }
  return tokens;
}

/** The pattern without the math delimiters people type around it (`$…$`, `$$…$$`, `\(…\)`,
 * `\[…\]`) and without surrounding spaces. */
export function normalizePattern(text: string): string {
  let s = text.trim();
  const wrappers: [string, string][] = [
    ['$$', '$$'],
    ['$', '$'],
    ['\\(', '\\)'],
    ['\\[', '\\]'],
  ];
  for (const [open, close] of wrappers) {
    if (s.length >= open.length + close.length && s.startsWith(open) && s.endsWith(close)) {
      s = s.slice(open.length, s.length - close.length).trim();
      break;
    }
  }
  return s;
}

/** Why a (normalised) pattern cannot be matched, or null when it can. */
export function patternIssue(pattern: string): string | null {
  const tokens = tokenizeTex(pattern);
  if (tokens.length === 0) return 'Type some LaTeX.';
  if (tokens.some((t) => t.kind === 'row' || t.kind === 'column')) {
    return 'A pattern cannot include a row or column break (\\\\ or &).';
  }
  let depth = 0;
  for (const t of tokens) {
    if (t.kind === 'open') depth++;
    else if (t.kind === 'close' && --depth < 0) return 'The braces are not balanced.';
  }
  if (depth !== 0) return 'The braces are not balanced.';
  // A `\left` cannot be wrapped in a colour group without its `\right`.
  const pair = '\\left and \\right go together: a pattern takes both or neither.';
  let delimiters = 0;
  for (const t of tokens) {
    const command = sizingCommand(t);
    if (command === '\\left') delimiters++;
    else if (command === '\\right' && --delimiters < 0) return pair;
    else if (command === '\\middle' && delimiters === 0) {
      return '\\middle goes between \\left and \\right.';
    }
  }
  return delimiters === 0 ? null : pair;
}

/** Token indices, [start, end). */
export interface TokenSpan {
  start: number;
  end: number;
}

/** Where `pattern` occurs in `source`: leftmost first, never overlapping each other. A pattern
 * with balanced braces only ever matches balanced runs of the source. */
export function findOccurrences(
  source: readonly TexToken[],
  pattern: readonly TexToken[],
): TokenSpan[] {
  const spans: TokenSpan[] = [];
  if (pattern.length === 0) return spans;
  let i = 0;
  while (i + pattern.length <= source.length) {
    let k = 0;
    while (k < pattern.length && source[i + k]!.text === pattern[k]!.text) k++;
    if (k === pattern.length) {
      spans.push({ start: i, end: i + pattern.length });
      i += pattern.length;
    } else {
      i++;
    }
  }
  return spans;
}

export interface LabelledSpan extends TokenSpan {
  /** The pattern's index in the list. */
  label: number;
}

export interface SpanPlan {
  /** Disjoint or properly nested, sorted by start; an inner span always has the higher label. */
  spans: LabelledSpan[];
  /** Patterns (indices) that lost an occurrence because it partly overlapped a later pattern's. */
  overlapping: number[];
}

/** Which occurrences stand, when several patterns cover the same tokens: the later pattern
 * wins. Its occurrence keeps the tokens; an earlier one inside it is dropped, one partly
 * overlapping it is dropped and reported; an earlier one that contains it stays, nested. */
export function resolveSpans(perPattern: readonly (readonly TokenSpan[])[]): SpanPlan {
  const accepted: LabelledSpan[] = [];
  const overlapping = new Set<number>();
  for (let label = perPattern.length - 1; label >= 0; label--) {
    for (const span of perPattern[label]!) {
      let keep = true;
      for (const later of accepted) {
        if (span.end <= later.start || span.start >= later.end) continue; // disjoint
        const contains = span.start <= later.start && span.end >= later.end;
        const inside = later.start <= span.start && later.end >= span.end;
        if (contains && !inside) continue; // the later one sits inside: it wins there, nested
        keep = false;
        if (!inside) overlapping.add(label);
        break;
      }
      if (keep) accepted.push({ ...span, label });
    }
  }
  accepted.sort((a, b) => a.start - b.start || b.end - a.end);
  return { spans: accepted, overlapping: [...overlapping].sort((a, b) => a - b) };
}

/** The first label, as a colour number: `#010001`. ManimGL colours its `{{ }}` groups
 * `#000001`, `#000002`… (`Tex.get_attr_dict_from_command_pair`), which a render through the
 * companion carries, so the labels start past every colour with a zero red component. */
const FIRST_LABEL = 0x010001;

/** The fill a labelled render gives the glyphs of pattern `label`: `#010001` for the first. */
export function labelColor(label: number): [number, number, number] {
  const n = FIRST_LABEL + label;
  return [Math.floor(n / 65536) % 256, Math.floor(n / 256) % 256, n % 256];
}

/** The pattern index a glyph's fill stands for, or null when the fill is no label (the plain
 * colour, one of ManimGL's own, `currentColor`, no fill…). */
export function labelOfFill(fill: string | null | undefined): number | null {
  const m = fill ? /^#([0-9a-f]{6})$/i.exec(fill.trim()) : null;
  if (!m) return null;
  const n = parseInt(m[1]!, 16);
  return n < FIRST_LABEL ? null : n - FIRST_LABEL;
}

/** `source` with every span wrapped in its colour group. Groups that start together open
 * outermost first and groups that end together close innermost first, so nested spans stay
 * nested. A group that opens right after a brace of the source gets a space before it (a
 * `{{` run would be Manim's double brace; the space means nothing in math mode). */
export function labelledLatex(
  source: string,
  tokens: readonly TexToken[],
  spans: readonly LabelledSpan[],
): string {
  interface Insertion {
    at: number;
    /** Closers before openers at the same offset; then outer openers and inner closers first. */
    order: number;
    text: string;
  }
  const insertions: Insertion[] = [];
  for (const span of spans) {
    const length = span.end - span.start;
    const [r, g, b] = labelColor(span.label);
    const at = tokens[span.start]!.start;
    insertions.push({
      at,
      order: 1e6 - length,
      text: `${source[at - 1] === '{' ? ' ' : ''}{\\color[RGB]{${r},${g},${b}}`,
    });
    insertions.push({ at: tokens[span.end - 1]!.end, order: -1e6 + length, text: '}' });
  }
  insertions.sort((a, b) => a.at - b.at || a.order - b.order);
  let out = '';
  let cursor = 0;
  for (const { at, text } of insertions) {
    out += source.slice(cursor, at) + text;
    cursor = at;
  }
  return out + source.slice(cursor);
}

export interface PatternMatch {
  /** The source to render for the labels. */
  labelled: string;
  spans: LabelledSpan[];
  /** As in SpanPlan. */
  overlapping: number[];
  /** Patterns (indices) that could not be matched at all (`patternIssue`). */
  invalid: number[];
}

/** Where the `patterns` (as typed) occur in `latex`, and the labelled source to render. */
export function matchPatterns(latex: string, patterns: readonly string[]): PatternMatch {
  const tokens = tokenizeTex(latex);
  const invalid: number[] = [];
  const perPattern = patterns.map((text, i) => {
    const pattern = normalizePattern(text);
    if (patternIssue(pattern) !== null) {
      invalid.push(i);
      return [];
    }
    return findOccurrences(tokens, tokenizeTex(pattern));
  });
  const { spans, overlapping } = resolveSpans(perPattern);
  return { labelled: labelledLatex(latex, tokens, spans), spans, overlapping, invalid };
}
