/* Render errors in the user's terms. Both renderers typeset the formula inside `align*`, as
 * Manim does, so some messages name that wrapper ("Missing \begin{align*} or extra
 * \end{align*}") when the formula left something open; the companion's LaTeX names an undefined
 * command only in the context line of its log; and a command from a package the formula does not
 * load is worth naming the package. Pure. */
import type { RenderError } from '../../engine';

/** Commands of the packages people most often forget to add. */
const COMMAND_PACKAGE: Readonly<Record<string, string>> = {
  ...Object.fromEntries(['cancel', 'bcancel', 'xcancel', 'cancelto'].map((c) => [c, 'cancel'])),
  ...Object.fromEntries(
    [
      'qty',
      'abs',
      'norm',
      'dv',
      'pdv',
      'dd',
      'ket',
      'bra',
      'braket',
      'ketbra',
      'expval',
      'vb',
      'vu',
      'va',
      'mqty',
      'pmqty',
      'bmqty',
      'eval',
      'order',
      'grad',
      'curl',
      'laplacian',
      'comm',
      'acomm',
      'tr',
      'Tr',
      'rank',
      'erf',
    ].map((c) => [c, 'physics']),
  ),
  bm: 'bm',
  vv: 'esvect',
  mathscr: 'mathrsfs',
  mathds: 'dsfont',
  ce: 'mhchem',
  ...Object.fromEntries(
    ['coloneqq', 'eqqcolon', 'mathclap', 'prescript'].map((c) => [c, 'mathtools']),
  ),
  ...Object.fromEntries(['SI', 'si', 'num', 'unit', 'ang'].map((c) => [c, 'siunitx'])),
  ...Object.fromEntries(['degree', 'celsius', 'ohm', 'micro'].map((c) => [c, 'gensymb'])),
};

/** The command an "Undefined control sequence" error is about: MathJax names it in the message,
 * LaTeX at the end of the first context line of its log. */
function undefinedCommand(error: RenderError): string | null {
  const named = /^Undefined control sequence (\\[A-Za-z@]+)/.exec(error.message);
  if (named) return named[1]!;
  const context = error.log?.split('\n').find((line) => /^<[a-z ]+>/i.test(line));
  return /(\\[A-Za-z@]+)\s*$/.exec(context ?? '')?.[1] ?? null;
}

const count = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0;

/** What the formula leaves open, when the renderer only noticed it at the end of the wrapper. */
function openingHint(latex: string): string | null {
  const text = latex.trim();
  const script = /([\^_])$/.exec(text);
  if (script) return `${script[1]} at the end needs an argument, as in x${script[1]}{2}.`;
  const command = /(\\[A-Za-z]+)$/.exec(text);
  if (command) return `${command[1]} at the end is missing its argument.`;
  if (count(text, /\\left(?![A-Za-z])/g) > count(text, /\\right(?![A-Za-z])/g)) {
    return '\\left needs a matching \\right (\\right. closes it without a delimiter).';
  }
  if (count(text, /(?<!\\)\{/g) > count(text, /(?<!\\)\}/g)) return 'Missing close brace.';
  return null;
}

/** The message to show for a failed render of `formula`. */
export function describeRenderError(
  error: RenderError,
  /** The object: its source, and its packages when its kind has them (a text has none). */
  formula: { source: string; packages?: readonly string[] },
): string {
  let message = error.message;
  const command = /^Undefined control sequence/.test(message) ? undefinedCommand(error) : null;
  const begun = /^\\begin\{([^}]+)\} ended with \\end\{align\*\}/.exec(message);
  const ended = /^\\begin\{align\*\} ended with \\end\{([^}]+)\}/.exec(message);
  if (command) {
    message = `Undefined control sequence ${command}.`;
    const pkg = COMMAND_PACKAGE[command.slice(1)];
    if (pkg && !(formula.packages ?? []).includes(pkg)) {
      message += ` It comes from the "${pkg}" package: add it under Packages.`;
    }
  } else if (begun) {
    message = `\\begin{${begun[1]}} is never closed: add \\end{${begun[1]}}.`;
  } else if (ended) {
    message = `\\end{${ended[1]}} has no matching \\begin{${ended[1]}}.`;
  } else if (
    /align\*/.test(message) ||
    message === 'Missing argument for \\end' ||
    /^Missing [{}] inserted\.$/.test(message)
  ) {
    message =
      openingHint(formula.source) ??
      (/align\*|\\end$/.test(message)
        ? 'Something is not closed: a ^ or _ without its argument, a { without its }, or a \\left without its \\right.'
        : message);
  }
  // A line number only helps when the formula has more than one line.
  if (error.line !== undefined && formula.source.includes('\n')) message += ` (line ${error.line})`;
  return message;
}
