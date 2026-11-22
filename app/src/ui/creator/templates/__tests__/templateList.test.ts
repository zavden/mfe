// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { NO_TEMPLATE_FILTER, templateLibrary } from '../library';
import {
  browserSections,
  categoriesOf,
  templateCounts,
  UNCATEGORIZED,
  viewItems,
} from '../templateList';
import { userTemplate, type UserLibrary } from '../userLibrary';

const library = templateLibrary();

const mine = (id: string, name: string, category: string) =>
  userTemplate(
    id,
    {
      name,
      category,
      description: '',
      latex: '#1+1',
      placeholders: [{ n: 1, value: 'a' }],
      packages: [],
    },
    1,
  );

const user: UserLibrary = {
  templates: [
    mine('u1', 'Zeta sum', 'My course'),
    mine('u2', 'Loose', ''),
    mine('u3', 'My square', 'Algebra'),
    mine('u4', 'Another', 'analysis'),
  ],
  favorites: ['u3', 'physics-ohms-law', 'gone-template', 'algebra-square-of-a-sum', 'u2'],
};

const ids = (items: { id: string }[]) => items.map((item) => item.id);

describe('viewItems', () => {
  it('lists the editor’s templates, the user’s, or the favourites among both', () => {
    const all = viewItems('default', library, user);
    expect(all).toHaveLength(257);
    expect(all.every((item) => item.origin === 'default')).toBe(true);
    expect(all.filter((item) => item.favorite).map((item) => item.id)).toEqual([
      'algebra-square-of-a-sum',
      'physics-ohms-law',
    ]);
    expect(ids(viewItems('mine', library, user))).toEqual(['u1', 'u2', 'u3', 'u4']);
    // The editor's first, each in the order of its library; a star on nothing is left out.
    const favorites = viewItems('favorites', library, user);
    expect(ids(favorites)).toEqual(['algebra-square-of-a-sum', 'physics-ohms-law', 'u2', 'u3']);
    expect(favorites.map((item) => item.origin)).toEqual(['default', 'default', 'user', 'user']);
  });

  it('counts what each pop-up holds', () => {
    expect(templateCounts(library, user)).toEqual({ default: 257, mine: 4, favorites: 4 });
    expect(templateCounts(library, { templates: [], favorites: [] })).toEqual({
      default: 257,
      mine: 0,
      favorites: 0,
    });
  });
});

describe('browserSections', () => {
  it('puts the editor’s categories first, in its order, then the others by name, then the rest', () => {
    const items = [...viewItems('mine', library, user), ...viewItems('favorites', library, user)];
    expect(categoriesOf(items, library)).toEqual([
      'Algebra',
      'Physics',
      'analysis',
      'My course',
      UNCATEGORIZED,
    ]);
    const sections = browserSections(
      viewItems('favorites', library, user),
      NO_TEMPLATE_FILTER,
      library,
    );
    expect(sections.map((s) => [s.heading, ids(s.items)])).toEqual([
      ['Algebra', ['algebra-square-of-a-sum', 'u3']],
      ['Physics', ['physics-ohms-law']],
      [UNCATEGORIZED, ['u2']],
    ]);
  });

  it('searches and filters; a level leaves the user’s templates out', () => {
    const items = viewItems('mine', library, user);
    const sections = (filter: Partial<typeof NO_TEMPLATE_FILTER>) =>
      browserSections(items, { ...NO_TEMPLATE_FILTER, ...filter }, library).map((s) => [
        s.heading,
        ids(s.items),
      ]);
    expect(sections({ query: 'square' })).toEqual([['Algebra', ['u3']]]);
    expect(sections({ query: 'uncategorized' })).toEqual([[UNCATEGORIZED, ['u2']]]);
    expect(sections({ category: 'My course' })).toEqual([['My course', ['u1']]]);
    expect(sections({ category: UNCATEGORIZED })).toEqual([[UNCATEGORIZED, ['u2']]]);
    expect(sections({ level: 'university' })).toEqual([]);
    expect(sections({ query: 'nothing like this' })).toEqual([]);
    const defaults = browserSections(
      viewItems('default', library, user),
      { query: 'derivative', category: 'Derivatives', level: 'university' },
      library,
    );
    expect(defaults).toHaveLength(1);
    expect(defaults[0]!.items).toHaveLength(4);
  });
});
