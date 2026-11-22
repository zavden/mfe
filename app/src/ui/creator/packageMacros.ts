/* LaTeX packages → MathLive macros, for the editor's live preview only.
 *
 * MathLive does not run real LaTeX, so "loading a package" means registering approximations of
 * its most common macros (ported from the manim-formulas-gui prototype's packages.js, plus the
 * macro approximations the MathJax backend already carries). Policy as in the prototype: macros
 * are strictly opt-in, they only activate when the formula uses the package. Commands MathLive
 * supports natively (\cancel, \coloneqq…) always render. */
import { PACKAGE_SUPPORT } from '../../engine';

type MathLiveMacros = Record<string, string | { def: string; args?: number }>;

const PROTOTYPE_MACROS: Readonly<Record<string, Record<string, string>>> = {
  physics: {
    abs: '\\left|#1\\right|',
    norm: '\\left\\Vert#1\\right\\Vert',
    eval: '\\left.#1\\right|',
    order: '\\mathcal{O}\\left(#1\\right)',
    dd: '\\mathrm{d}',
    dv: '\\frac{\\mathrm{d}#1}{\\mathrm{d}#2}',
    pdv: '\\frac{\\partial#1}{\\partial#2}',
    grad: '\\boldsymbol{\\nabla}',
    curl: '\\boldsymbol{\\nabla}\\times',
    laplacian: '\\nabla^2',
    tr: '\\operatorname{tr}',
    Tr: '\\operatorname{Tr}',
    rank: '\\operatorname{rank}',
    bra: '\\left\\langle#1\\right|',
    ket: '\\left|#1\\right\\rangle',
    braket: '\\left\\langle#1\\middle|#2\\right\\rangle',
    expval: '\\left\\langle#1\\right\\rangle',
    comm: '\\left[#1,#2\\right]',
    vb: '\\mathbf{#1}',
    va: '\\vec{#1}',
  },
  mathtools: {
    coloneqq: '\\mathrel{\\vcenter{\\hbox{:}}=}',
    eqqcolon: '\\mathrel{=\\vcenter{\\hbox{:}}}',
    ceil: '\\left\\lceil#1\\right\\rceil',
    floor: '\\left\\lfloor#1\\right\\rfloor',
  },
  bm: { bm: '\\boldsymbol{#1}' },
  // The real esvect arrow is a package font; a stretchy arrow is close enough to preview.
  esvect: { vv: '\\overrightarrow{#1}' },
  siunitx: {
    si: '\\mathrm{#1}',
    unit: '\\mathrm{#1}',
    SI: '#1\\,\\mathrm{#2}',
    qty: '#1\\,\\mathrm{#2}',
    num: '#1',
  },
};

/** Packages whose macros the preview knows. */
export function hasMacroPreview(pkg: string): boolean {
  return pkg in PROTOTYPE_MACROS || !!PACKAGE_SUPPORT[pkg]?.macros;
}

/** The MathLive macro table for a set of packages (later packages override earlier ones). */
export function macrosFor(packages: readonly string[]): MathLiveMacros {
  const macros: MathLiveMacros = {};
  for (const pkg of packages) {
    for (const [name, definition] of Object.entries(PACKAGE_SUPPORT[pkg]?.macros ?? {})) {
      macros[name] =
        typeof definition === 'string' ? definition : { def: definition[0], args: definition[1] };
    }
    Object.assign(macros, PROTOTYPE_MACROS[pkg]);
  }
  return macros;
}

/** Why a package is not previewed with MathJax, or null when it is (free mode only; exact mode
 * compiles the real package). */
export function mathJaxNote(pkg: string): string | null {
  return pkg in PACKAGE_SUPPORT
    ? null
    : `MathJax cannot load "${pkg}": the preview ignores it. Exact mode (companion) compiles it with LaTeX.`;
}
