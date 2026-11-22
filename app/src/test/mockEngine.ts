/* A formula engine for the tests: glyphs at once, with no MathJax and no companion.
 *
 * Lays out one rectangle per visible token, left to right: letters, digits and operators,
 * a few symbol commands, plus a "rule" glyph for \frac and \sqrt. It knows nothing about
 * real TeX layout; renders are marked inexact and carry a warning. A brace or a shape is drawn by
 * its own producer, as every engine draws it. The app never uses it: it is among the helpers of
 * the tests so that the product's sources carry nothing that only a test runs. */
import {
  LATEX_BACKEND_VERSION,
  producerOf,
  renderKey,
  type CompanionState,
  type FormulaEngine,
  type Glyph,
  type RenderRequest,
  type RenderResult,
} from '../engine';
import { contoursBox, rectContour, unionBox, type Box } from '../geom';

const SYMBOLS: Record<string, string> = {
  alpha: 'α',
  beta: 'β',
  gamma: 'γ',
  delta: 'δ',
  theta: 'θ',
  lambda: 'λ',
  mu: 'μ',
  pi: 'π',
  sigma: 'σ',
  phi: 'φ',
  omega: 'ω',
  sum: '∑',
  int: '∫',
  prod: '∏',
  cdot: '·',
  times: '×',
  to: '→',
  infty: '∞',
  partial: '∂',
  nabla: '∇',
  pm: '±',
  leq: '≤',
  geq: '≥',
  neq: '≠',
};
const RULE_COMMANDS = new Set(['frac', 'sqrt', 'over', 'overline']);
const IGNORED = new Set([
  'left',
  'right',
  'text',
  'mathrm',
  'mathbf',
  'displaystyle',
  'quad',
  'qquad',
]);

interface Token {
  label: string;
  kind: Glyph['kind'];
}

export function mockTokens(latex: string): Token[] {
  const tokens: Token[] = [];
  for (let i = 0; i < latex.length;) {
    const ch = latex[i]!;
    if (ch === '\\') {
      const m = /^\\([A-Za-z]+|.)/.exec(latex.slice(i));
      const name = m ? m[1]! : '';
      i += 1 + name.length;
      if (SYMBOLS[name]) tokens.push({ label: SYMBOLS[name], kind: 'char' });
      else if (RULE_COMMANDS.has(name)) tokens.push({ label: '—', kind: 'rule' });
      // `\\` breaks the line and spacing commands (`\,`) draw nothing; `\{` and the like do.
      else if (name.length === 1 && !/[,;:! \\]/.test(name))
        tokens.push({ label: name, kind: 'char' });
      else if (!IGNORED.has(name) && name.length > 1) tokens.push({ label: name, kind: 'char' });
      continue;
    }
    i++;
    if (/[\s{}^_&]/.test(ch)) continue;
    tokens.push({ label: ch, kind: 'char' });
  }
  return tokens;
}

export function createMockEngine(): FormulaEngine {
  const version = 'mock-1';
  const state: CompanionState = { status: 'unsupported' };
  return {
    version,
    async render(request: RenderRequest): Promise<RenderResult> {
      // A brace or a shape is geometry in every engine: its producer builds it, exact.
      if (producerOf(request.kind).local) {
        return producerOf(request.kind).free(
          request,
          renderKey(request, 'latex', LATEX_BACKEND_VERSION),
        );
      }
      const k = request.fontSize / 48;
      const source =
        request.kind === 'math' ? request.latex : request.kind === 'tex' ? request.source : '';
      const tokens = mockTokens(source);
      if (tokens.length === 0 && source.trim() === '') {
        return { ok: false, error: { message: 'Empty formula.', backend: 'mathjax' } };
      }
      // LaTeX without ink (\quad) renders to no glyphs, as with the real backends.
      const boxes: Box[] = [];
      let x = 0;
      for (const t of tokens) {
        const w = (t.kind === 'rule' ? 0.4 : 0.22) * k;
        const h = (t.kind === 'rule' ? 0.02 : 0.32) * k;
        const y = t.kind === 'rule' ? 0.12 * k : 0;
        boxes.push({ minX: x, minY: y - h / 2, maxX: x + w, maxY: y + h / 2 });
        x += w + 0.06 * k;
      }
      const all = unionBox(boxes);
      const dx = (all.minX + all.maxX) / 2;
      const dy = (all.minY + all.maxY) / 2;
      const glyphs: Glyph[] = tokens.map((t, index) => {
        const b = boxes[index]!;
        const contours = [
          rectContour({
            minX: b.minX - dx,
            minY: b.minY - dy,
            maxX: b.maxX - dx,
            maxY: b.maxY - dy,
          }),
        ];
        return { index, label: t.label, kind: t.kind, contours, bbox: contoursBox(contours) };
      });
      return {
        ok: true,
        render: {
          key: renderKey(request, 'mathjax', version),
          backend: 'mathjax',
          exact: false,
          target: request.target,
          fontSize: request.fontSize,
          glyphs,
          bbox: unionBox(glyphs.map((g) => g.bbox)),
          warnings: ['Mock engine: placeholder glyph boxes, not real TeX layout.'],
        },
      };
    },
    companion: () => state,
    onCompanionChange: () => () => {},
  };
}
