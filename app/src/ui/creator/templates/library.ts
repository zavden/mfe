/* The formula templates of the Creator's Templates tab: 257 LaTeX formulas, high school to
 * university, in 15 categories. The source of truth is `formula-templates/` next to the repo;
 * `src/data/templates.json` and `template-categories.json` are verbatim copies. The data is part
 * of the app's single bundle (the build does not split code, see vite.config.ts); it is checked
 * against a small schema the first time the tab asks for it. Search and filters are pure.
 *
 * A template's LaTeX names its variable parts `#1`, `#2`… and declares a default value for each
 * (`placeholders.ts`): with those it is the formula the library shows. */
import { z } from 'zod';
import rawCategories from '../../../data/template-categories.json';
import rawTemplates from '../../../data/templates.json';
import { defaultValues, instantiateTemplate, placeholderIssues } from './placeholders';

export const TEMPLATE_LEVELS = ['high-school', 'university'] as const;
export type TemplateLevel = (typeof TEMPLATE_LEVELS)[number];

export const LEVEL_LABELS: Readonly<Record<TemplateLevel, string>> = {
  'high-school': 'High school',
  university: 'University',
};

export const placeholderSchema = z.object({
  n: z.number().int().min(1),
  value: z.string(),
  label: z.string().optional(),
});

const templateSchema = z.object({
  id: z.string().min(1),
  category: z.string().min(1),
  name: z.string().min(1),
  description: z.string(),
  level: z.enum(TEMPLATE_LEVELS),
  /** One math-mode string, as in Manim's MathTex, with `#n` for each placeholder. */
  latex: z.string().min(1),
  placeholders: z.array(placeholderSchema),
  packages: z.array(z.string()),
});

const categorySchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  description: z.string(),
});

/** A template of the library that comes with the editor. */
export type FormulaTemplate = z.infer<typeof templateSchema>;
export type TemplateCategory = z.infer<typeof categorySchema>;

/** What makes a formula of a template: the library's, or one of the user's. */
export type TemplateSource = Pick<FormulaTemplate, 'latex' | 'placeholders' | 'packages'>;

/** A template's LaTeX with the default values of its placeholders: the formula it shows in a
 * list, and the one it makes when nothing is changed. */
export function templateLatex(template: Pick<TemplateSource, 'latex' | 'placeholders'>): string {
  return instantiateTemplate(template.latex, defaultValues(template.placeholders));
}

export interface TemplateLibrary {
  /** In the source's order. */
  categories: readonly TemplateCategory[];
  /** By category, in that order; within one, as the source lists them. */
  templates: readonly FormulaTemplate[];
}

/** The library from the raw JSON: shapes checked, ids unique, every template in a listed
 * category, and the placeholders of each LaTeX the ones it declares, no more and no fewer.
 * Throws on the first problem. */
export function parseLibrary(rawTemplates: unknown, rawCategories: unknown): TemplateLibrary {
  const categories = z.array(categorySchema).parse(rawCategories);
  const templates = z.array(templateSchema).parse(rawTemplates);
  const rank = new Map(categories.map((c, i) => [c.name, i]));
  const ids = new Set<string>();
  for (const template of templates) {
    if (ids.has(template.id)) throw new Error(`Duplicate template id "${template.id}".`);
    ids.add(template.id);
    if (!rank.has(template.category)) {
      throw new Error(`Template "${template.id}" has an unknown category "${template.category}".`);
    }
    const [issue] = placeholderIssues(template.latex, template.placeholders);
    if (issue) throw new Error(`Template "${template.id}": ${issue.message}`);
  }
  return {
    categories,
    templates: [...templates].sort((a, b) => rank.get(a.category)! - rank.get(b.category)!),
  };
}

let library: TemplateLibrary | null = null;

/** The library, checked on first use. */
export function templateLibrary(): TemplateLibrary {
  library ??= parseLibrary(rawTemplates, rawCategories);
  return library;
}

export interface TemplateFilter {
  /** Words that must all appear in the name, description, LaTeX (as the template shows it, with
   * its default values) or category (any case). */
  query: string;
  /** A category name, or null for all. */
  category: string | null;
  level: TemplateLevel | null;
}

export const NO_TEMPLATE_FILTER: TemplateFilter = { query: '', category: null, level: null };

/** What the search and the filters read of a template: one of the editor's, or one of the
 * user's, which has no level. */
type Searchable = Pick<FormulaTemplate, 'name' | 'description' | 'category'> &
  Pick<TemplateSource, 'latex' | 'placeholders'> & { level?: TemplateLevel };

/** The templates that pass `filter`, in the order given. */
export function filterTemplates<T extends Searchable>(
  templates: readonly T[],
  filter: TemplateFilter,
): T[] {
  const words = filter.query.toLowerCase().split(/\s+/).filter(Boolean);
  return templates.filter((t) => {
    if (filter.category !== null && t.category !== filter.category) return false;
    if (filter.level !== null && t.level !== filter.level) return false;
    if (words.length === 0) return true;
    const text = `${t.name}\n${t.description}\n${templateLatex(t)}\n${t.category}`.toLowerCase();
    return words.every((word) => text.includes(word));
  });
}
