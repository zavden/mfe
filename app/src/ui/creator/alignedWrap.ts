/* Rows in the visual field. MathJax and Manim typeset every formula inside `align*`, so `&` and
 * `\\` outside any environment are column and row breaks: three aligned rows of `A &= x_1 \\ &=
 * x_2 \\ &= x_3`. MathLive (the visual field) typesets the formula bare, where they are errors.
 * The field therefore shows such a formula wrapped in `aligned`, which draws the same rows, and
 * the wrapper is removed again from what the field reports, so the raw LaTeX stays the user's.
 * The engine never sees the wrapper: it renders the raw LaTeX. */

/** Whether the LaTeX has a row (`\\`) or column (`&`) break outside any environment. */
export function hasTopLevelBreaks(latex: string): boolean {
  let depth = 0;
  for (let i = 0; i < latex.length; i++) {
    const c = latex[i];
    if (c === '%') {
      // A comment runs to the end of the line.
      const eol = latex.indexOf('\n', i);
      if (eol < 0) return false;
      i = eol;
    } else if (c === '&') {
      if (depth === 0) return true;
    } else if (c === '\\') {
      const next = latex[i + 1];
      if (next === undefined) return false;
      if (next === '\\') {
        if (depth === 0) return true;
        i++;
      } else if (!isLetter(next)) {
        i++; // \&, \{, \%…: an escaped character
      } else {
        let end = i + 1;
        while (end < latex.length && isLetter(latex[end]!)) end++;
        const word = latex.slice(i + 1, end);
        if (word === 'begin' || word === 'end') {
          const name = /^\s*\{[^}]*\}/.exec(latex.slice(end));
          if (name) {
            depth = Math.max(0, depth + (word === 'begin' ? 1 : -1));
            end += name[0].length;
          }
        }
        i = end - 1;
      }
    }
  }
  return false;
}

function isLetter(c: string): boolean {
  return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z');
}

/** The LaTeX as the visual field shows it: wrapped in `aligned` when it has top-level breaks (the
 * wrapper's lines are its own, so a trailing comment cannot swallow `\end{aligned}`). */
export function toFieldLatex(latex: string): { latex: string; wrapped: boolean } {
  if (!hasTopLevelBreaks(latex)) return { latex, wrapped: false };
  return { latex: `\\begin{aligned}\n${latex}\n\\end{aligned}`, wrapped: true };
}

const ENVIRONMENT = /\\(begin|end)\{([^}]*)\}/g;

/** The LaTeX the field reports, in the user's terms: when `wrapped` (the field was given the
 * wrapper of `toFieldLatex`), the outer `aligned` environment is removed and anything the user
 * typed before or after it joins the first or last row. A field that no longer starts with the
 * wrapper (the user replaced everything) is reported as it is. */
export function fromFieldLatex(latex: string, wrapped: boolean): string {
  if (!wrapped) return latex;
  ENVIRONMENT.lastIndex = 0;
  const open = ENVIRONMENT.exec(latex);
  if (!open || open[1] !== 'begin' || open[2] !== 'aligned') return latex;
  let depth = 1;
  for (let m = ENVIRONMENT.exec(latex); m; m = ENVIRONMENT.exec(latex)) {
    depth += m[1] === 'begin' ? 1 : -1;
    if (depth === 0) {
      const body = latex.slice(open.index + open[0].length, m.index).replace(/^\n|\n$/g, '');
      return latex.slice(0, open.index) + body + latex.slice(m.index + m[0].length);
    }
  }
  return latex;
}
