/* LaTeX packages → MathJax configuration (free mode only; exact mode loads the real packages).
 *
 * Each target starts from what its Manim template loads: CE has amsmath + amssymb; GL's
 * `default` template also loads physics, xcolor, dsfont, textcomp… A requested package maps to
 * a MathJax 3.2.2 extension when one exists (physics, mathtools, cancel…) or to macro
 * approximations ported from the manim-formulas-gui prototype (bm, esvect, siunitx…). Packages
 * that only affect text typesetting are accepted silently; unknown ones render anyway with a
 * warning. Extensions are opt-in, as in LaTeX: \cancel fails unless `cancel` is requested. */
import type { Target } from '../model';

/** MathJax macro table entry: replacement text, or [replacement, argument count]. */
export type MathJaxMacro = string | [string, number];

interface PackageSupport {
  extensions?: string[];
  macros?: Record<string, MathJaxMacro>;
}

/** Extensions every render loads (amsmath/amssymb are part of both Manim templates). */
const BASE_EXTENSIONS = ['base', 'ams', 'newcommand', 'configmacros', 'boldsymbol', 'textmacros'];

const NO_OP: PackageSupport = {};

export const PACKAGE_SUPPORT: Readonly<Record<string, PackageSupport>> = {
  // Covered by the base configuration.
  amsmath: NO_OP,
  amssymb: NO_OP,
  amsfonts: NO_OP,
  amsthm: NO_OP,
  mathrsfs: NO_OP, // \mathscr is built into MathJax
  // Text/typesetting only; nothing to do for formula glyphs.
  babel: NO_OP,
  inputenc: NO_OP,
  fontenc: NO_OP,
  setspace: NO_OP,
  ragged2e: NO_OP,
  microtype: NO_OP,
  relsize: NO_OP,
  // Native MathJax extensions.
  physics: { extensions: ['physics'] },
  mathtools: { extensions: ['mathtools'] },
  cancel: { extensions: ['cancel'] },
  braket: { extensions: ['braket'] },
  xcolor: { extensions: ['color'] },
  color: { extensions: ['color'] },
  mhchem: { extensions: ['mhchem'] },
  upgreek: { extensions: ['upgreek'] },
  gensymb: { extensions: ['gensymb'] },
  textcomp: { extensions: ['textcomp'] },
  centernot: { extensions: ['centernot'] },
  cases: { extensions: ['cases'] },
  extpfeil: { extensions: ['extpfeil'] },
  empheq: { extensions: ['empheq'] },
  amscd: { extensions: ['amscd'] },
  // Macro approximations (from manim-formulas-gui/packages.js).
  bm: { macros: { bm: ['\\boldsymbol{#1}', 1] } },
  // The real esvect arrow is a package font; a stretchy arrow is close enough for a preview.
  esvect: { macros: { vv: ['\\overrightarrow{#1}', 1] } },
  siunitx: {
    macros: {
      si: ['\\mathrm{#1}', 1],
      unit: ['\\mathrm{#1}', 1],
      SI: ['#1\\,\\mathrm{#2}', 2],
      qty: ['#1\\,\\mathrm{#2}', 2],
      num: ['#1', 1],
    },
  },
  dsfont: { macros: { mathds: ['\\mathbb{#1}', 1] } },
  bbm: { macros: { mathbbm: ['\\mathbb{#1}', 1] } },
};

/** Packages implied by each target's Manim template (beyond amsmath/amssymb). */
const TEMPLATE_PACKAGES: Record<Target, string[]> = {
  ce: [],
  gl: ['physics', 'xcolor', 'dsfont', 'textcomp'],
};

/** Macros the GL default template defines itself. */
const TEMPLATE_MACROS: Record<Target, Record<string, MathJaxMacro>> = {
  ce: {},
  gl: { minus: '\\mathbin{-}' },
};

/** braket.sty's definitions. LaTeX loads requested packages after the template, so on GL
 * (whose template loads physics) braket's \bra/\ket/\braket win; MathJax's physics extension
 * would shadow its braket extension, so they are re-declared as macros, which take precedence. */
const BRAKET_OVER_PHYSICS: Record<string, MathJaxMacro> = {
  bra: ['\\mathinner{\\langle{#1}|}', 1],
  ket: ['\\mathinner{|{#1}\\rangle}', 1],
  braket: ['\\mathinner{\\langle{#1}\\rangle}', 1],
};

export interface MathJaxSetup {
  /** MathJax TeX extensions to load (sorted, unique). */
  extensions: string[];
  macros: Record<string, MathJaxMacro>;
  /** Definitions from the preamble (\newcommand, \def, \DeclareMathOperator…) to run once. */
  definitions: string;
  warnings: string[];
}

const USEPACKAGE_RE = /\\usepackage\s*(?:\[[^\]]*\])?\s*\{([^}]*)\}/g;

/** Strip TeX comments (an unescaped % to the end of the line). */
function stripComments(text: string): string {
  return text.replace(/(^|[^\\])%.*$/gm, '$1');
}

export function mathJaxSetup(
  target: Target,
  packages: readonly string[],
  preamble: string,
): MathJaxSetup {
  const warnings: string[] = [];
  const extensions = new Set(BASE_EXTENSIONS);
  const macros: Record<string, MathJaxMacro> = { ...TEMPLATE_MACROS[target] };

  // \usepackage lines in the preamble count as requested packages.
  const body = stripComments(preamble);
  const fromPreamble: string[] = [];
  for (const m of body.matchAll(USEPACKAGE_RE)) {
    for (const name of m[1]!.split(',')) if (name.trim()) fromPreamble.push(name.trim());
  }
  const definitions = body.replace(USEPACKAGE_RE, '').trim();

  const seen = new Set<string>();
  for (const name of [...TEMPLATE_PACKAGES[target], ...packages, ...fromPreamble]) {
    if (seen.has(name)) continue;
    seen.add(name);
    const support = PACKAGE_SUPPORT[name];
    if (!support) {
      warnings.push(`Package "${name}" has no MathJax support; rendered without it.`);
      continue;
    }
    for (const ext of support.extensions ?? []) extensions.add(ext);
    Object.assign(macros, support.macros);
  }
  if (seen.has('braket') && extensions.has('physics')) Object.assign(macros, BRAKET_OVER_PHYSICS);
  return { extensions: [...extensions].sort(), macros, definitions, warnings };
}
