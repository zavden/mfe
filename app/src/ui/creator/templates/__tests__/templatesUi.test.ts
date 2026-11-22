// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import { NO_TEMPLATE_FILTER } from '../library';
import type { ListedTemplate } from '../templateList';
import { useTemplatesUi } from '../templatesUi';

const template: ListedTemplate = {
  id: 't',
  name: 'Sum',
  category: '',
  description: '',
  latex: '#1+1',
  placeholders: [{ n: 1, value: 'a' }],
  packages: [],
};

const ui = () => useTemplatesUi.getState();

beforeEach(() => {
  ui().closeAll();
});

describe('what the Templates tab has open', () => {
  it('closes the dialog on top first: the values being given, then the list', () => {
    ui().open('default');
    ui().use(template);
    expect(ui()).toMatchObject({ view: 'default', using: template });
    ui().close();
    expect(ui()).toMatchObject({ view: 'default', using: null });
    ui().close();
    expect(ui()).toMatchObject({ view: null, using: null });
  });

  it('closes everything once a formula was made, and opens another list in place of one', () => {
    ui().open('mine');
    ui().use(template);
    ui().closeAll();
    expect(ui()).toMatchObject({ view: null, using: null });
    ui().open('default');
    ui().use(template);
    ui().open('favorites');
    expect(ui()).toMatchObject({ view: 'favorites', using: null });
  });

  it('opens the form alone or over a list, and closes it before the list', () => {
    ui().write(null);
    expect(ui()).toMatchObject({ view: null, form: { editing: null } });
    ui().close();
    expect(ui().form).toBeNull();
    ui().open('mine');
    ui().write(null);
    expect(ui()).toMatchObject({ view: 'mine', form: { editing: null }, using: null });
    ui().close();
    expect(ui()).toMatchObject({ view: 'mine', form: null });
    // One dialog over the list at a time.
    ui().write(null);
    ui().use(template);
    expect(ui()).toMatchObject({ form: null, using: template });
    ui().closeAll();
    expect(ui()).toMatchObject({ view: null, form: null, using: null });
  });

  it('keeps the search and the filters of each list apart', () => {
    ui().setFilter('default', { query: 'chain', level: 'university' });
    ui().setFilter('mine', { category: 'Mine' });
    ui().setFilter('default', { category: 'Derivatives' });
    expect(ui().filters.default).toEqual({
      query: 'chain',
      category: 'Derivatives',
      level: 'university',
    });
    expect(ui().filters.mine).toEqual({ ...NO_TEMPLATE_FILTER, category: 'Mine' });
    expect(ui().filters.favorites).toEqual(NO_TEMPLATE_FILTER);
    ui().closeAll();
    expect(ui().filters.default.query).toBe('chain');
  });
});
