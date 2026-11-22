/* What the pop-ups of the Templates tab list (D121): the templates that come with the editor,
 * the user's own, or the favourites among both — searched, filtered and under the headings of
 * their categories. Pure. */
import {
  filterTemplates,
  type FormulaTemplate,
  type TemplateFilter,
  type TemplateLibrary,
  type TemplateSource,
} from './library';
import type { UserLibrary } from './userLibrary';

export type TemplateView = 'default' | 'mine' | 'favorites';

export const VIEW_TITLES: Readonly<Record<TemplateView, string>> = {
  default: 'Default templates',
  mine: 'My templates',
  favorites: 'Favorites',
};

/** A template as a list shows it: one of the editor's, or one of the user's (which has no
 * level). */
export type ListedTemplate = TemplateSource &
  Pick<FormulaTemplate, 'id' | 'name' | 'category' | 'description'> & {
    level?: FormulaTemplate['level'];
  };

export interface BrowserItem {
  id: string;
  /** `default`: it comes with the editor and cannot be changed; `user`: one of the user's. */
  origin: 'default' | 'user';
  template: ListedTemplate;
  favorite: boolean;
}

export interface BrowserSection {
  /** The category, as its heading says it. */
  heading: string;
  items: BrowserItem[];
}

/** The heading of the templates that name no category. */
export const UNCATEGORIZED = 'Uncategorized';

/** How many templates each pop-up holds, as the tab's entries say. */
export function templateCounts(
  library: TemplateLibrary,
  user: UserLibrary,
): Record<TemplateView, number> {
  return {
    default: library.templates.length,
    mine: user.templates.length,
    favorites: viewItems('favorites', library, user).length,
  };
}

/** The templates of a pop-up, the editor's first, each in the order of its library. A favourite
 * that names a template neither library has is left out. */
export function viewItems(
  view: TemplateView,
  library: TemplateLibrary,
  user: UserLibrary,
): BrowserItem[] {
  const starred = new Set(user.favorites);
  const items: BrowserItem[] = [];
  if (view !== 'mine') {
    for (const template of library.templates) {
      const favorite = starred.has(template.id);
      if (view === 'default' || favorite) {
        items.push({ id: template.id, origin: 'default', template, favorite });
      }
    }
  }
  if (view !== 'default') {
    for (const template of user.templates) {
      const favorite = starred.has(template.id);
      if (view === 'mine' || favorite) {
        items.push({ id: template.id, origin: 'user', template, favorite });
      }
    }
  }
  return items;
}

const categoryOf = (item: BrowserItem) => item.template.category.trim() || UNCATEGORIZED;

/** The categories of `items` in the order their headings come: the editor's categories as its
 * library lists them, then the others by name, and last the templates without one. */
export function categoriesOf(items: readonly BrowserItem[], library: TemplateLibrary): string[] {
  const rank = new Map(library.categories.map((c, i) => [c.name, i]));
  return [...new Set(items.map(categoryOf))].sort((a, b) => {
    const [ra, rb] = [rank.get(a), rank.get(b)];
    if (ra !== undefined || rb !== undefined) return (ra ?? Infinity) - (rb ?? Infinity);
    if (a === UNCATEGORIZED || b === UNCATEGORIZED) return a === UNCATEGORIZED ? 1 : -1;
    return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
  });
}

/** The items that pass `filter`, under the headings of their categories. A level leaves out the
 * user's templates, which have none. */
export function browserSections(
  items: readonly BrowserItem[],
  filter: TemplateFilter,
  library: TemplateLibrary,
): BrowserSection[] {
  const kept = new Set(
    filterTemplates(
      items.map((item) => ({ ...item.template, category: categoryOf(item) })),
      filter,
    ).map((template) => template.id),
  );
  const shown = items.filter((item) => kept.has(item.id));
  return categoriesOf(shown, library).map((heading) => ({
    heading,
    items: shown.filter((item) => categoryOf(item) === heading),
  }));
}
