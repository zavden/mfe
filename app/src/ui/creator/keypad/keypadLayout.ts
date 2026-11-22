/* The formula keypad's layouts, as data: its tabs, their rows and what each key writes. The
 * on-screen keypad of the formula editor is drawn from here and from nowhere else, so a layout is
 * changed by editing this file.
 *
 * What a key writes is LaTeX with MathLive's marks for how it meets the formula: `#@` is what is
 * selected or, with nothing selected, what stands before the caret (the base of a power, the
 * numerator of a fraction); `#0` is what is selected, or a hole; `#?` is a hole. */

/** What a key does that is not writing: moving, deleting, the capitals, applying the draft. */
export type KeypadCommand = 'left' | 'right' | 'backspace' | 'clear' | 'shift' | 'apply';

/** The look of a key: the ones that write a structure or a name are tinted, digits and letters
 * are plain, the operators a shade apart, and Apply is the keypad's main action. */
export type KeypadTone = 'template' | 'plain' | 'operator' | 'nav' | 'action';

/** The face of a key: LaTeX, where a `\square` stands for a hole, or plain text. */
export type KeypadFace = { readonly latex: string } | { readonly text: string };

export interface KeypadKey {
  /** Unique in its tab; the test id of the key is made of it. */
  readonly id: string;
  /** What the key is, in words: its accessible name and its tooltip. */
  readonly name: string;
  readonly face: KeypadFace;
  /** The LaTeX it writes. A key has this or a command, never both. */
  readonly insert?: string;
  /** What it writes while the capitals are on (a letter). */
  readonly shifted?: string;
  readonly command?: KeypadCommand;
  readonly tone: KeypadTone;
  /** The columns it takes: one, unless said. */
  readonly width?: 2;
}

export type KeypadTabId = 'algebra' | 'trigonometry' | 'calculus' | 'alphabet';

export interface KeypadTab {
  readonly id: KeypadTabId;
  readonly label: string;
  /** Rows as wide as each other, the keys' widths added. */
  readonly rows: readonly (readonly KeypadKey[])[];
}

/** The face of what a key writes: its LaTeX with a square for every mark. (Not MathLive's
 * `\placeholder{}`: its static drawing, which the editor's keypad uses, leaves it blank.) */
export function faceOf(insert: string): string {
  return insert.replace(/#[@?0]/g, '{\\square}');
}

/** The lines of text a face is as tall as: two for a fraction or a limit, three for a sum or a
 * product with what goes over and under it. The keypad draws a taller face smaller, to fit its
 * key. */
export function faceLines(face: KeypadFace): 1 | 2 | 3 {
  if (!('latex' in face)) return 1;
  if (/\\(sum|prod)_/.test(face.latex)) return 3;
  return /\\(frac|lim)(?![a-zA-Z])|\\int_/.test(face.latex) ? 2 : 1;
}

/** The columns a key takes. */
export const keyWidth = (key: KeypadKey): number => key.width ?? 1;

/** The columns of a tab: the width of its rows. */
export function keypadColumns(tab: KeypadTab): number {
  return (tab.rows[0] ?? []).reduce((sum, key) => sum + keyWidth(key), 0);
}

const writes = (id: string, name: string, insert: string, tone: KeypadTone): KeypadKey => ({
  id,
  name,
  face: { latex: faceOf(insert) },
  insert,
  tone,
});

const template = (id: string, name: string, insert: string) => writes(id, name, insert, 'template');
const operator = (id: string, name: string, insert: string) => writes(id, name, insert, 'operator');
const digit = (n: number) => writes(`d${n}`, String(n), String(n), 'plain');
const letter = (c: string): KeypadKey => ({
  ...writes(c, c, c, 'plain'),
  shifted: c.toUpperCase(),
});
const greek = (name: string, capital = false) => {
  const command = capital ? name[0]!.toUpperCase() + name.slice(1) : name;
  return template(
    capital ? `cap-${name}` : name,
    capital ? `Capital ${name}` : name,
    `\\${command}`,
  );
};

const does = (
  command: KeypadCommand,
  name: string,
  text: string,
  tone: KeypadTone,
  width: 1 | 2,
): KeypadKey => ({
  id: command,
  name,
  face: { text },
  command,
  tone,
  ...(width === 2 ? { width } : {}),
});

/** The last row of every tab: moving, deleting and Apply, over all of the tab's columns. */
function lastRow(columns: 6 | 10): KeypadKey[] {
  const width = columns === 10 ? 2 : 1;
  return [
    does('left', 'Move left', '←', 'nav', width),
    does('right', 'Move right', '→', 'nav', width),
    does('backspace', 'Delete backward', '⌫', 'nav', width),
    does('clear', 'Clear all', 'AC', 'nav', width),
    does('apply', 'Apply', 'Apply', 'action', 2),
  ];
}

const FRAC = template('frac', 'Fraction', '\\frac{#@}{#?}');
const SQRT = template('sqrt', 'Square root', '\\sqrt{#0}');
const POWER = template('power', 'Power', '#@^{#?}');
const SQUARE = template('square', 'Square', '#@^{2}');
const LPAREN = template('lparen', 'Left parenthesis', '(');
const RPAREN = template('rparen', 'Right parenthesis', ')');
const X = template('x', 'x', 'x');
const EQUALS = operator('eq', 'Equals', '=');

/** The digits and the four operations: the same block, in the same place, in three tabs. */
const NUMBERS: readonly (readonly KeypadKey[])[] = [
  [digit(7), digit(8), digit(9), operator('div', 'Divided by', '\\div')],
  [digit(4), digit(5), digit(6), operator('times', 'Times', '\\times')],
  [digit(1), digit(2), digit(3), operator('minus', 'Minus', '-')],
  [
    digit(0),
    writes('dot', 'Decimal point', '.', 'plain'),
    writes('percent', 'Percent', '\\%', 'plain'),
    operator('plus', 'Plus', '+'),
  ],
];

/** Four rows: two keys of the tab's own, then the numbers. */
const withNumbers = (own: readonly (readonly [KeypadKey, KeypadKey])[]): KeypadKey[][] =>
  NUMBERS.map((numbers, row) => [...own[row]!, ...numbers]);

export const KEYPAD_TABS: readonly KeypadTab[] = [
  {
    id: 'algebra',
    label: 'Algebra',
    rows: [
      [
        FRAC,
        template('mixed', 'Mixed fraction', '#@\\frac{#?}{#?}'),
        template('abs', 'Absolute value', '\\left|#0\\right|'),
        template('factorial', 'Factorial', '#@!'),
        template('log', 'Logarithm', '\\log_{#?}'),
        EQUALS,
      ],
      [
        SQRT,
        template('root', 'Root', '\\sqrt[#?]{#0}'),
        operator('lt', 'Less than', '<'),
        operator('le', 'Less than or equal to', '\\le'),
        operator('gt', 'Greater than', '>'),
        operator('ge', 'Greater than or equal to', '\\ge'),
      ],
      ...withNumbers([
        [POWER, SQUARE],
        [template('function', 'Function', 'f(#?)'), template('imaginary', 'Imaginary unit', 'i')],
        [LPAREN, RPAREN],
        [X, template('y', 'y', 'y')],
      ]),
      lastRow(6),
    ],
  },
  {
    id: 'trigonometry',
    label: 'Trigonometry',
    rows: [
      [
        template('sin', 'Sine', '\\sin'),
        template('cos', 'Cosine', '\\cos'),
        template('tan', 'Tangent', '\\tan'),
        template('cot', 'Cotangent', '\\cot'),
        template('sec', 'Secant', '\\sec'),
        template('csc', 'Cosecant', '\\csc'),
      ],
      [
        template('arcsin', 'Arcsine', '\\arcsin'),
        template('arccos', 'Arccosine', '\\arccos'),
        template('arctan', 'Arctangent', '\\arctan'),
        greek('pi'),
        greek('theta'),
        template('degrees', 'Degrees', '#@^{\\circ}'),
      ],
      ...withNumbers([
        [POWER, SQUARE],
        [FRAC, SQRT],
        [LPAREN, RPAREN],
        [X, EQUALS],
      ]),
      lastRow(6),
    ],
  },
  {
    id: 'calculus',
    label: 'Calculus',
    rows: [
      [
        template('limit', 'Limit', '\\lim_{#?\\to#?}'),
        template('derivative', 'Derivative', '\\frac{d}{dx}'),
        template('partial', 'Partial derivative', '\\frac{\\partial}{\\partial x}'),
        template('integral', 'Integral', '\\int#0\\,dx'),
        template('definite-integral', 'Definite integral', '\\int_{#?}^{#?}'),
        template('sum', 'Sum', '\\sum_{#?}^{#?}'),
      ],
      [
        template('product', 'Product', '\\prod_{#?}^{#?}'),
        template('infinity', 'Infinity', '\\infty'),
        operator('to', 'Tends to', '\\to'),
        template('euler', "Euler's number", 'e'),
        template('ln', 'Natural logarithm', '\\ln'),
        template('dx', 'Differential of x', 'dx'),
      ],
      ...withNumbers([
        [POWER, template('subscript', 'Subscript', '#@_{#?}')],
        [FRAC, SQRT],
        [LPAREN, RPAREN],
        [X, EQUALS],
      ]),
      lastRow(6),
    ],
  },
  {
    id: 'alphabet',
    label: 'Alphabet',
    rows: [
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map(digit),
      [...'qwertyuiop'].map(letter),
      [...[...'asdfghjkl'].map(letter), writes('comma', 'Comma', ',', 'plain')],
      [
        does('shift', 'Capitals', '⇧', 'nav', 1),
        ...[...'zxcvbnm'].map(letter),
        writes('prime', 'Prime', "'", 'plain'),
        EQUALS,
      ],
      ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'theta', 'lambda', 'mu', 'pi', 'rho'].map(
        (name) => greek(name),
      ),
      [
        ...['sigma', 'tau', 'phi', 'omega'].map((name) => greek(name)),
        ...['gamma', 'delta', 'theta', 'sigma', 'phi', 'omega'].map((name) => greek(name, true)),
      ],
      lastRow(10),
    ],
  },
];
