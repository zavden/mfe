// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { buildGlyphs } from '../../engine/glyphs';
import { glyphLikes, toSnapshot } from '../../engine/key';
import { glyphsFromSvg, latexScale } from '../../engine/latex';
import { matchGlyphs } from '../../engine/match';
import { mathJaxSource, renderWithMathJax } from '../../engine/mathjax';
import type { CompanionGlyphInfo, FormulaRender } from '../../engine/types';
import fracSvg from '../../engine/__tests__/fixtures/frac.svg?raw';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  defaultIntro,
  defaultOutro,
  remapGlyphRefs,
  sourceRoles,
} from '../index';

describe('principal across production backend matching', () => {
  it('keeps the denominator consuming and the fraction bar copied in both directions', () => {
    const result = renderWithMathJax(
      {
        tex: mathJaxSource('\\frac{a}{b}'),
        packages: [],
        preamble: '',
        target: 'ce',
        fontSize: 48,
      },
      'principal-mathjax',
    );
    if (!result.ok) throw new Error(result.error.message);
    const labels: CompanionGlyphInfo[] = ['a', '—', 'b'].map((label) => ({
      label,
      kind: label === '—' ? 'rule' : 'char',
      font: null,
      code: null,
    }));
    const { raw } = glyphsFromSvg(fracSvg, labels);
    const { glyphs, bbox } = buildGlyphs(raw, latexScale('ce', 48, 0), 'ce');
    const exact: FormulaRender = {
      key: 'principal-latex',
      backend: 'latex',
      exact: true,
      target: 'ce',
      fontSize: 48,
      glyphs,
      bbox,
      warnings: [],
    };
    const project = createEmptyProject();
    const source = createFormula({ source: '\\frac{a}{b}', snapshot: toSnapshot(result.render) });
    const target = createFormula({ name: 'target', source: 'x' });
    project.formulas.push(source, target);
    const plain = { intro: defaultIntro('none'), outro: defaultOutro('none') };
    const a = createClip(source.id, project.tracks[0]!.id, 0, 5, plain);
    const b = createClip(target.id, project.tracks[1]!.id, 1, 5, plain);
    project.clips.push(a, b);
    const relation = createRelation(a.id, b.id, {
      pairs: [{ from: [1, 2], to: [0], style: null, extras: 'copies' }],
    });
    project.relations.push(relation);
    for (const [before, after] of [
      [result.render, exact],
      [exact, result.render],
    ]) {
      const match = matchGlyphs(glyphLikes(before!), glyphLikes(after!), 'position');
      expect(match.map).toEqual([0, 2, 1]);
      expect(match.confidence).toBe(1);
      remapGlyphRefs(project, source.id, match.map);
      source.snapshot = toSnapshot(after!);
      const roles = sourceRoles(relation.pairs[0]!, relation.style);
      expect(roles.consumed.map((g) => source.snapshot!.glyphs[g]!.label)).toEqual(['b']);
      expect(roles.copied.map((g) => source.snapshot!.glyphs[g]!.label)).toEqual(['—']);
    }
  });
});
