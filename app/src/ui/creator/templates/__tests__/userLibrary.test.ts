// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  applyImport,
  copyName,
  emptyUserLibrary,
  libraryOf,
  mergeLibraries,
  overLimit,
  planImport,
  readLibrary,
  removeTemplates,
  saveTemplate,
  serializeLibrary,
  setFavorite,
  USER_TEMPLATE_LIMIT,
  userTemplate,
  type TemplateFields,
  type UserLibrary,
  type UserTemplate,
} from '../userLibrary';

const fields = (over: Partial<TemplateFields> = {}): TemplateFields => ({
  name: 'Commutative sum',
  category: 'Algebra',
  description: 'The order of the terms does not matter.',
  latex: '{#1}+{#2}={#2}+{#1}',
  placeholders: [
    { n: 1, value: 'a' },
    { n: 2, value: 'b', label: 'second term' },
  ],
  packages: [],
  ...over,
});

const made = (id: string, over: Partial<TemplateFields> = {}, modified = 1000): UserTemplate =>
  userTemplate(id, fields(over), modified);

const library = (...templates: UserTemplate[]): UserLibrary => ({ templates, favorites: [] });

describe('userTemplate', () => {
  it('keeps the fields trimmed and the placeholders of its LaTeX, by number', () => {
    const template = userTemplate(
      't1',
      fields({
        name: '  Sum  ',
        category: ' Mine ',
        latex: ' #2+#1 ',
        placeholders: [
          { n: 2, value: 'b', label: '  ' },
          { n: 1, value: 'a', label: ' first ' },
          { n: 7, value: 'unused' },
        ],
        packages: [' amsmath ', ''],
      }),
      42,
    );
    expect(template).toEqual({
      id: 't1',
      name: 'Sum',
      category: 'Mine',
      description: 'The order of the terms does not matter.',
      latex: '#2+#1',
      placeholders: [
        { n: 1, value: 'a', label: 'first' },
        { n: 2, value: 'b' },
      ],
      packages: ['amsmath'],
      modified: 42,
    });
  });

  it('refuses a placeholder without a value, a number declared twice, and an empty name or LaTeX', () => {
    expect(() => made('t', { latex: '#1+#3' })).toThrow('#3 is in the LaTeX and has no value.');
    expect(() =>
      made('t', {
        placeholders: [
          { n: 1, value: 'a' },
          { n: 1, value: 'b' },
          { n: 2, value: 'c' },
        ],
      }),
    ).toThrow('#1 is declared more than once.');
    expect(() => made('t', { name: '   ' })).toThrow(/name/);
    expect(() => made('t', { latex: ' ', placeholders: [] })).toThrow(/latex/);
  });
});

describe('changes', () => {
  it('adds a template, and puts a changed one in its place', () => {
    const one = saveTemplate(emptyUserLibrary(), made('a'));
    const two = saveTemplate(one, made('b', { name: 'Other' }));
    const again = saveTemplate(two, made('a', { name: 'Renamed' }, 2000));
    expect(again.templates.map((t) => `${t.id}:${t.name}`)).toEqual(['a:Renamed', 'b:Other']);
    expect(one.templates).toHaveLength(1); // nothing is changed in place
  });

  it('holds no more than its limit', () => {
    const full = library(...Array.from({ length: USER_TEMPLATE_LIMIT }, (_, i) => made(`t${i}`)));
    expect(() => saveTemplate(full, made('one-more'))).toThrow(/full/);
    expect(saveTemplate(full, made('t3', { name: 'Edited' })).templates[3]!.name).toBe('Edited');
  });

  it('marks favourites among any templates, and forgets the ones of a deleted template', () => {
    let lib = library(made('a'), made('b'));
    lib = setFavorite(lib, 'algebra-square-of-a-sum', true);
    lib = setFavorite(lib, 'b', true);
    expect(setFavorite(lib, 'b', true)).toBe(lib);
    expect(lib.favorites).toEqual(['algebra-square-of-a-sum', 'b']);
    lib = removeTemplates(lib, ['b']);
    expect(lib.templates.map((t) => t.id)).toEqual(['a']);
    expect(lib.favorites).toEqual(['algebra-square-of-a-sum']);
    expect(setFavorite(lib, 'algebra-square-of-a-sum', false).favorites).toEqual([]);
  });

  it('names a copy after the original, numbered when taken', () => {
    const lib = library(made('a', { name: 'Sum' }), made('b', { name: 'Sum copy' }));
    expect(copyName('Product', lib)).toBe('Product copy');
    expect(copyName('Sum', lib)).toBe('Sum copy 2');
    expect(copyName('Sum copy', lib)).toBe('Sum copy 2');
  });
});

describe('mergeLibraries', () => {
  it('keeps every template of either and, of one both have, the one changed last', () => {
    const ours = {
      templates: [made('a', { name: 'A old' }, 100), made('b', { name: 'B new' }, 300)],
      favorites: ['a', 'x'],
    };
    const theirs = {
      templates: [
        made('b', { name: 'B old' }, 200),
        made('a', { name: 'A new' }, 200),
        made('c', { name: 'C' }, 50),
      ],
      favorites: ['x', 'c'],
    };
    const merged = mergeLibraries(ours, theirs);
    expect(merged.templates.map((t) => t.name)).toEqual(['A new', 'B new', 'C']);
    expect(merged.favorites).toEqual(['a', 'x', 'c']);
    // The same on both sides: nothing changes.
    expect(mergeLibraries(merged, merged)).toEqual(merged);
  });

  it('keeps every one of both, also when together they are more than a library holds', () => {
    const many = (prefix: string, count: number) => ({
      templates: Array.from({ length: count }, (_, i) => made(`${prefix}${i}`, {}, 100)),
      favorites: [],
    });
    const merged = mergeLibraries(many('here', 300), many('there', 300));
    expect(merged.templates).toHaveLength(600);
    // What does not fit is for whoever keeps the result to see, not for the merge to drop.
    expect(overLimit(merged)).toBe(600 - USER_TEMPLATE_LIMIT);
    expect(overLimit(many('here', USER_TEMPLATE_LIMIT))).toBe(0);
  });
});

describe('import', () => {
  const own = {
    templates: [made('a', { name: 'A' }), made('b', { name: 'B' })],
    favorites: ['b'],
  };
  const file = {
    templates: [
      made('a', { name: 'A' }, 5), // the same, written at another moment
      made('b', { name: 'B of the file' }),
      made('c', { name: 'C' }),
    ],
    favorites: ['a', 'b', 'c', 'algebra-square-of-a-sum'],
  };

  it('tells the new templates from the ones the library has, the same or changed', () => {
    const plan = planImport(own, file);
    expect(plan.fresh.map((t) => t.id)).toEqual(['c']);
    expect(plan.clashes.map((t) => t.id)).toEqual(['b']);
    expect(plan.same).toBe(1);
  });

  it('replaces the ones that clash', () => {
    const next = applyImport(own, planImport(own, file), 'replace', () => 'new');
    expect(next.templates.map((t) => `${t.id}:${t.name}`)).toEqual([
      'a:A',
      'b:B of the file',
      'c:C',
    ]);
    expect(next.favorites).toEqual(['b', 'a', 'c', 'algebra-square-of-a-sum']);
  });

  it('or keeps both, the file’s as a copy that takes the file’s star', () => {
    const next = applyImport(own, planImport(own, file), 'copy', () => 'copy-1');
    expect(next.templates.map((t) => `${t.id}:${t.name}`)).toEqual([
      'a:A',
      'b:B',
      'c:C',
      'copy-1:B of the file copy',
    ]);
    expect(next.favorites).toEqual(['b', 'a', 'copy-1', 'c', 'algebra-square-of-a-sum']);
  });

  it('or leaves the library’s', () => {
    const next = applyImport(own, planImport(own, file), 'skip', () => 'new');
    expect(next.templates.map((t) => `${t.id}:${t.name}`)).toEqual(['a:A', 'b:B', 'c:C']);
    expect(next.favorites).toEqual(['b', 'a', 'c', 'algebra-square-of-a-sum']);
  });

  it('exports the chosen templates with their stars only', () => {
    const lib = { ...own, favorites: ['b', 'algebra-square-of-a-sum'] };
    expect(libraryOf(lib, ['b'])).toEqual({ templates: [own.templates[1]], favorites: ['b'] });
  });
});

describe('the file', () => {
  const lib = {
    templates: [made('a'), made('b', { latex: 'x^2', placeholders: [] })],
    favorites: ['b'],
  };

  it('is read back as it was written', () => {
    const text = serializeLibrary(lib);
    expect(JSON.parse(text)).toMatchObject({ format: 'mfe-templates', version: 1 });
    expect(text.endsWith('}\n')).toBe(true);
    expect(readLibrary(text)).toEqual({ ok: true, library: lib, skipped: 0 });
    // The keys of a template in the order of the format.
    expect(Object.keys(JSON.parse(text).templates[0])).toEqual([
      'id',
      'name',
      'category',
      'description',
      'latex',
      'placeholders',
      'packages',
      'modified',
    ]);
  });

  it('refuses what is not a templates file, and a file of a later version', () => {
    expect(readLibrary('{')).toMatchObject({ ok: false, reason: 'damaged' });
    expect(readLibrary('[]')).toMatchObject({ ok: false, reason: 'damaged' });
    expect(readLibrary('{"version":18,"formulas":[]}')).toMatchObject({
      ok: false,
      reason: 'damaged',
      message: 'The file is not a templates file.',
    });
    expect(readLibrary('{"format":"mfe-templates","version":2,"templates":[]}')).toMatchObject({
      ok: false,
      reason: 'newer',
    });
  });

  it('leaves out the entries that are not templates and reads the rest', () => {
    const file = JSON.parse(serializeLibrary(lib));
    file.templates.push(
      { ...file.templates[0] }, // the same id again
      { ...file.templates[0], id: 'c', latex: '#1+#9' }, // a placeholder without its value
      { id: 'd', name: 'No LaTeX' },
      'nonsense',
    );
    file.favorites.push(7, '', 'b', 'algebra-square-of-a-sum');
    const read = readLibrary(JSON.stringify(file));
    expect(read).toMatchObject({ ok: true, skipped: 4 });
    if (!read.ok) return;
    expect(read.library.templates.map((t) => t.id)).toEqual(['a', 'b']);
    expect(read.library.favorites).toEqual(['b', 'algebra-square-of-a-sum']);
  });
});
