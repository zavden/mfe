/* Approximate line breaking for the free render of a text with a width (PLAN-OBJETOS Prompt 6):
 * the companion lets LaTeX break the lines inside the `\parbox`; MathJax does not break lines, so
 * the app breaks each row the user wrote into words, measures every word as MathJax typesets it
 * and fills the lines greedily — first fit, a word that does not fit goes to the next line, a word
 * wider than the box stands alone on its line. The gap between words is TeX's interword space,
 * a third of an em at the text's size. The result is marked as approximate: TeX breaks lines by
 * its own optimum over the whole paragraph, and hyphenates. Pure: the measure is injected. */

/** A row split into the units a line break may fall between: at the spaces outside `$…$` and
 * outside braces, so that `$a b$`, `\emph{two words}` and `{a b}` stay whole. */
export function textWords(row: string): string[] {
  const words: string[] = [];
  let word = '';
  let depth = 0;
  let math = false;
  for (let i = 0; i < row.length; i++) {
    const ch = row[i]!;
    if (ch === '\\' && i + 1 < row.length) {
      // A command, or an escaped character (`\$`, `\{`): never a break.
      word += ch + row[i + 1];
      i += 1;
      continue;
    }
    if (ch === '$') math = !math;
    else if (ch === '{') depth += 1;
    else if (ch === '}') depth = Math.max(0, depth - 1);
    if (/\s/.test(ch) && !math && depth === 0) {
      if (word) words.push(word);
      word = '';
      continue;
    }
    word += ch;
  }
  if (word) words.push(word);
  return words;
}

/** The lines of `words` filled greedily up to `width`, with `space` between words; the width of a
 * word comes from `measure`. A word wider than the line stands alone. */
export function wrapWords(
  words: readonly string[],
  measure: (word: string) => number,
  space: number,
  width: number,
): string[] {
  const lines: string[] = [];
  let line: string[] = [];
  let used = 0;
  for (const word of words) {
    const w = measure(word);
    if (line.length > 0 && used + space + w > width) {
      lines.push(line.join(' '));
      line = [];
      used = 0;
    }
    used += (line.length > 0 ? space : 0) + w;
    line.push(word);
  }
  if (line.length > 0) lines.push(line.join(' '));
  return lines;
}

/** Each row broken into lines of at most `width` (a row that fits stays one line); `broken` says
 * whether any row had to be. */
export function wrapRows(
  rows: readonly string[],
  measure: (word: string) => number,
  space: number,
  width: number,
): { lines: string[]; broken: boolean } {
  const lines: string[] = [];
  let broken = false;
  for (const row of rows) {
    const wrapped = wrapWords(textWords(row), measure, space, width);
    if (wrapped.length > 1) broken = true;
    lines.push(...(wrapped.length === 0 ? [row] : wrapped));
  }
  return { lines, broken };
}
