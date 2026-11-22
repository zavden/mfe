// @vitest-environment node
import { describe, expect, it } from 'vitest';
import rawCategories from '../../../../data/template-categories.json';
import rawTemplates from '../../../../data/templates.json';
import {
  filterTemplates,
  NO_TEMPLATE_FILTER,
  parseLibrary,
  templateLatex,
  templateLibrary,
  type FormulaTemplate,
} from '../library';

describe('template data', () => {
  it('passes the schema: unique ids, known categories, ids prefixed by their category', () => {
    const library = templateLibrary();
    expect(library.templates).toHaveLength(257);
    expect(library.categories).toHaveLength(15);
    for (const category of library.categories) {
      const own = library.templates.filter((t) => t.category === category.name);
      expect(own.length, category.name).toBeGreaterThan(0);
      for (const t of own) expect(t.id.startsWith(`${category.slug}-`), t.id).toBe(true);
    }
    // Every template is one non-empty math-mode string, without packages.
    for (const t of library.templates) {
      expect(t.latex.trim(), t.id).not.toBe('');
      expect(templateLatex(t), t.id).not.toMatch(/\$|\\\[|\\begin\{(align|equation)/);
    }
  });

  it('lists the templates by category, in the order of the categories', () => {
    const library = templateLibrary();
    const ranks = library.templates.map((t) =>
      library.categories.findIndex((c) => c.name === t.category),
    );
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    // Within a category the source order is kept.
    const source = (rawTemplates as FormulaTemplate[]).filter((t) => t.category === 'Physics');
    expect(library.templates.filter((t) => t.category === 'Physics')).toEqual(source);
  });

  it('refuses duplicate ids, unknown categories and malformed entries', () => {
    const [first] = rawTemplates as FormulaTemplate[];
    expect(() => parseLibrary([first, first], rawCategories)).toThrow(/Duplicate template id/);
    expect(() => parseLibrary([{ ...first, category: 'Alchemy' }], rawCategories)).toThrow(
      /unknown category "Alchemy"/,
    );
    expect(() => parseLibrary([{ ...first, level: 'kindergarten' }], rawCategories)).toThrow();
    expect(() => parseLibrary([{ ...first, latex: '' }], rawCategories)).toThrow();
  });

  it('refuses a template whose LaTeX and placeholders do not agree', () => {
    const [first] = rawTemplates as FormulaTemplate[];
    const withLatex = (latex: string, numbers: number[]) =>
      parseLibrary(
        [{ ...first, latex, placeholders: numbers.map((n) => ({ n, value: 'x' })) }],
        rawCategories,
      );
    expect(() => withLatex('#1+#2', [1])).toThrow(
      'Template "algebra-square-of-a-sum": #2 is in the LaTeX and has no value.',
    );
    expect(() => withLatex('#1', [1, 2])).toThrow(/#2 has a value and the LaTeX does not use it/);
    expect(() => withLatex('#1', [1, 1])).toThrow(/#1 is declared more than once/);
    expect(() => parseLibrary([{ ...first, placeholders: undefined }], rawCategories)).toThrow();
    expect(withLatex('#1^{#2}', [1, 2]).templates).toHaveLength(1);
  });

  it('shows a template as the formula its default values make', () => {
    const power = templateLibrary().templates.find((t) => t.id === 'algebra-product-of-powers')!;
    expect(power.latex).toBe('#1^{#2}\\cdot #1^{#3}=#1^{#2+#3}');
    expect(power.placeholders).toEqual([
      { n: 1, value: 'a', label: 'base' },
      { n: 2, value: 'm', label: 'first exponent' },
      { n: 3, value: 'n', label: 'second exponent' },
    ]);
    expect(templateLatex(power)).toBe('a^{m}\\cdot a^{n}=a^{m+n}');
  });
});

describe('filterTemplates', () => {
  const t = (id: string, fields: Partial<FormulaTemplate>): FormulaTemplate => ({
    id,
    category: 'Algebra',
    name: id,
    description: '',
    level: 'high-school',
    latex: 'x',
    placeholders: [],
    packages: [],
    ...fields,
  });
  const all = [
    t('square', { name: 'Square of a sum', latex: '(a+b)^2=a^2+2ab+b^2' }),
    t('chain', { category: 'Derivatives', name: 'Chain rule', level: 'university' }),
    t('power', { category: 'Derivatives', name: 'Power rule', description: 'Derivative of x^n.' }),
    t('euler', { category: 'Complex numbers', latex: 'e^{i\\pi}+1=0', level: 'university' }),
    t('power', {
      id: 'product',
      name: 'Product of powers',
      latex: '#1^{#2}\\cdot #1^{#3}',
      placeholders: [
        { n: 1, value: 'a' },
        { n: 2, value: 'm' },
        { n: 3, value: 'n' },
      ],
    }),
  ];
  const ids = (filter: Partial<typeof NO_TEMPLATE_FILTER>) =>
    filterTemplates(all, { ...NO_TEMPLATE_FILTER, ...filter }).map((x) => x.id);

  it('keeps everything without a filter, in order', () => {
    expect(ids({})).toEqual(['square', 'chain', 'power', 'euler', 'product']);
  });

  it('searches the name, description, LaTeX and category, every word, in any case', () => {
    expect(ids({ query: 'derivative' })).toEqual(['chain', 'power']); // category, description
    expect(ids({ query: 'SQUARE' })).toEqual(['square']);
    expect(ids({ query: '\\pi' })).toEqual(['euler']);
    expect(ids({ query: '  rule   power ' })).toEqual(['power']);
    expect(ids({ query: 'rule square' })).toEqual([]);
  });

  it('searches the LaTeX a template shows, with its default values', () => {
    expect(ids({ query: 'a^{m}' })).toEqual(['product']);
    expect(ids({ query: '#1' })).toEqual([]);
  });

  it('filters by category and level, together with the search', () => {
    expect(ids({ category: 'Derivatives' })).toEqual(['chain', 'power']);
    expect(ids({ level: 'university' })).toEqual(['chain', 'euler']);
    expect(ids({ category: 'Derivatives', level: 'university' })).toEqual(['chain']);
    expect(ids({ category: 'Derivatives', query: 'power' })).toEqual(['power']);
  });
});
