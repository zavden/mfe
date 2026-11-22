/* The placeholders of a formula template (D121): the parts of its LaTeX that are named `#1`,
 * `#2`… and replaced by a value when the template is used, so that the formula's LaTeX is final
 * before its glyphs are first made.
 *
 * A placeholder is `#` and a number from 1 on (`#12` is number twelve; `\#` is LaTeX's literal
 * hash and is not one). It is replaced as TeX replaces the parameter of a macro: the braces are
 * the template's, so `x^{#2}` with `m+1` gives `x^{m+1}`. Where two pieces meet, a space goes
 * between them in the two cases where the join would change what the pieces mean: a control word
 * followed by a letter (`\alpha` + `x` would read `\alphax`), and a `{` followed by a `{`
 * (ManimCE splits a MathTex on `{{ … }}`, and its own advice is that space). TeX ignores both
 * spaces in math mode; a `{{` the author wrote is left alone. Pure.
 *
 * `formula-templates/scripts/placeholders.py`, next to the repo, states the same rules for the
 * checks of the library: keep the two in step. */

/** A placeholder as a template declares it. */
export interface TemplatePlaceholder {
  /** Its number: `#n` in the template's LaTeX. */
  n: number;
  /** The LaTeX it stands for until the user gives another. */
  value: string;
  /** What it is in the formula, in a word or two ("base", "exponent"). */
  label?: string;
}

type Piece = string | number;

const SLOT = /#([1-9][0-9]*)/g;

/** How many backslashes end `text` before `index`. */
function slashesBefore(text: string, index: number): number {
  let count = 0;
  for (let i = index - 1; i >= 0 && text[i] === '\\'; i -= 1) count += 1;
  return count;
}

/** A template's LaTeX as its literal text (strings) and its placeholders (numbers), in order. */
function piecesOf(latex: string): Piece[] {
  const out: Piece[] = [];
  let start = 0;
  for (const match of latex.matchAll(SLOT)) {
    // `\#` is a hash to print; `\\#1` is a line break and then a placeholder.
    if (slashesBefore(latex, match.index) % 2 === 1) continue;
    if (match.index > start) out.push(latex.slice(start, match.index));
    out.push(Number(match[1]));
    start = match.index + match[0].length;
  }
  if (start < latex.length) out.push(latex.slice(start));
  return out;
}

/** The numbers of the placeholders of a template's LaTeX, each once, in the order they first
 * appear. */
export function placeholderNumbers(latex: string): number[] {
  const seen = new Set<number>();
  for (const piece of piecesOf(latex)) if (typeof piece === 'number') seen.add(piece);
  return [...seen];
}

/** Whether `text` ends in a control word (`\alpha`), which would take a letter put after it. */
function endsWithControlWord(text: string): boolean {
  const letters = /[A-Za-z]+$/.exec(text);
  return letters !== null && slashesBefore(text, letters.index) % 2 === 1;
}

/** The LaTeX of a template with each `#n` replaced by `values.get(n)`. Throws when a number has
 * no value: what a template needs is known beforehand (`placeholderNumbers`, `placeholderIssues`). */
export function instantiateTemplate(latex: string, values: ReadonlyMap<number, string>): string {
  let out = '';
  for (const piece of piecesOf(latex)) {
    const text = typeof piece === 'number' ? values.get(piece) : piece;
    if (text === undefined) throw new Error(`The placeholder #${piece} has no value.`);
    if (text === '') continue;
    if (out.endsWith('{') && text.startsWith('{')) out += ' ';
    else if (/^[A-Za-z]/.test(text) && endsWithControlWord(out)) out += ' ';
    out += text;
  }
  return out;
}

/** The values a template gives its placeholders itself. */
export function defaultValues(placeholders: readonly TemplatePlaceholder[]): Map<number, string> {
  return new Map(placeholders.map((p) => [p.n, p.value]));
}

export interface PlaceholderIssue {
  /** An error makes the template unusable; a warning is only said when it is saved. */
  severity: 'error' | 'warning';
  code: 'undeclared' | 'duplicate' | 'unused';
  n: number;
  message: string;
}

/** What is wrong between a template's LaTeX and the placeholders it declares: a `#n` with no
 * declared value and a number declared twice are errors; a declared number the LaTeX does not
 * use is a warning. In the order of the LaTeX, then of the list. */
export function placeholderIssues(
  latex: string,
  placeholders: readonly TemplatePlaceholder[],
): PlaceholderIssue[] {
  const issues: PlaceholderIssue[] = [];
  const used = placeholderNumbers(latex);
  const declared = new Set(placeholders.map((p) => p.n));
  for (const n of used) {
    if (declared.has(n)) continue;
    issues.push({
      severity: 'error',
      code: 'undeclared',
      n,
      message: `#${n} is in the LaTeX and has no value.`,
    });
  }
  const seen = new Set<number>();
  for (const { n } of placeholders) {
    if (seen.has(n)) {
      issues.push({
        severity: 'error',
        code: 'duplicate',
        n,
        message: `#${n} is declared more than once.`,
      });
    } else if (!used.includes(n)) {
      issues.push({
        severity: 'warning',
        code: 'unused',
        n,
        message: `#${n} has a value and the LaTeX does not use it.`,
      });
    }
    seen.add(n);
  }
  return issues;
}

/** The placeholders a form shows for `latex`: one for each number in the text, by number, with
 * the value and the label `known` has for it (an empty value for a new one). What `known` holds
 * for numbers the text no longer has is left out. */
export function placeholderRows(
  latex: string,
  known: readonly TemplatePlaceholder[],
): TemplatePlaceholder[] {
  const byNumber = new Map<number, TemplatePlaceholder>();
  for (const placeholder of known) {
    if (!byNumber.has(placeholder.n)) byNumber.set(placeholder.n, placeholder);
  }
  return placeholderNumbers(latex)
    .sort((a, b) => a - b)
    .map((n) => byNumber.get(n) ?? { n, value: '' });
}
