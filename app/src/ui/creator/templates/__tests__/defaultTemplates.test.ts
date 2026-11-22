// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { producerOf, type Glyph } from '../../../../engine';
import { templateLatex, templateLibrary } from '../library';
import { placeholderNumbers } from '../placeholders';
import before from './fixtures/template-latex.json';

/* The templates that come with the editor got placeholders (D121) without changing what they
 * draw: `fixtures/template-latex.json` is the LaTeX each one was before, and with its default
 * values a template still makes it. A new template adds its line there. */
const was = before as Record<string, string>;
const bare = (latex: string) => latex.replace(/[{}\s]/g, '');

function glyphsOf(latex: string): Pick<Glyph, 'label' | 'kind' | 'contours' | 'bbox'>[] {
  const result = producerOf('math').free(
    {
      kind: 'math',
      latex,
      packages: [],
      preamble: '',
      target: 'ce',
      fontSize: 48,
      prefer: 'mathjax',
    },
    latex,
  );
  if (!result.ok) throw new Error(`${latex}: ${result.error.message}`);
  return result.render.glyphs.map(({ label, kind, contours, bbox }) => ({
    label,
    kind,
    contours,
    bbox,
  }));
}

describe('the placeholders of the templates that come with the editor', () => {
  const { templates } = templateLibrary();

  it('give back, with their default values, the LaTeX each template was', () => {
    expect(Object.keys(was).sort()).toEqual(templates.map((t) => t.id).sort());
    const braced: string[] = [];
    for (const template of templates) {
      const made = templateLatex(template);
      if (made === was[template.id]) continue;
      // The one difference allowed: braces put around a placeholder that is the argument of a
      // script (`a_n` is `#1_{#2}`, so that `n+1` fits too).
      expect(bare(made), template.id).toBe(bare(was[template.id]!));
      braced.push(template.id);
    }
    expect(braced).toHaveLength(20);
    // And those braces change nothing of what is drawn: the same glyphs in the same places.
    for (const id of braced) {
      const template = templates.find((t) => t.id === id)!;
      expect(glyphsOf(templateLatex(template)), id).toEqual(glyphsOf(was[id]!));
    }
  });

  it('are numbered from 1 in the order they first appear, each with a value of its own and a label', () => {
    let withPlaceholders = 0;
    for (const template of templates) {
      const numbers = placeholderNumbers(template.latex);
      expect(numbers, template.id).toEqual(numbers.map((_, i) => i + 1));
      expect(
        template.placeholders.map((p) => p.n),
        template.id,
      ).toEqual(numbers);
      const values = template.placeholders.map((p) => p.value);
      expect(new Set(values).size, template.id).toBe(values.length);
      for (const placeholder of template.placeholders) {
        expect(placeholder.value.trim(), template.id).not.toBe('');
        expect(placeholder.label, template.id).toMatch(/^[a-z][a-z0-9 ,/()'-]{0,27}$/);
      }
      if (numbers.length > 0) withPlaceholders += 1;
    }
    // All but the formulas with no variable at all (Euler's identity…).
    expect(withPlaceholders).toBe(254);
  });

  it('draw with MathJax, every one', () => {
    for (const template of templates) {
      expect(glyphsOf(templateLatex(template)).length, template.id).toBeGreaterThan(0);
    }
  });
});
