import { beforeEach, describe, expect, it } from 'vitest';
import {
  loadProjectFavorites,
  parseProjectFavorites,
  PROJECT_FAVORITES_KEY,
  projectFavoritesOf,
  setProjectFavorite,
  useProjectFavorites,
  withProjectFavorite,
} from '../projectFavorites';

const held = () => JSON.parse(localStorage.getItem(PROJECT_FAVORITES_KEY) ?? 'null') as unknown;

beforeEach(() => {
  localStorage.clear();
  loadProjectFavorites();
});

describe('parseProjectFavorites', () => {
  it('reads the names of the starred files by folder, each once', () => {
    expect(parseProjectFavorites('{"work":["a.mfe.json","b.mfe.json","a.mfe.json"]}')).toEqual({
      work: ['a.mfe.json', 'b.mfe.json'],
    });
  });

  it('leaves out what is not names by folder, and reads nothing from what is no record', () => {
    expect(
      parseProjectFavorites('{"work":["a.mfe.json",3,"",null],"home":"b.mfe.json","lab":[]}'),
    ).toEqual({ work: ['a.mfe.json'] });
    expect(parseProjectFavorites(null)).toEqual({});
    expect(parseProjectFavorites('not json')).toEqual({});
    expect(parseProjectFavorites('["a.mfe.json"]')).toEqual({});
    expect(parseProjectFavorites('7')).toEqual({});
  });
});

describe('withProjectFavorite', () => {
  it('stars a file of a folder and takes the star away; a folder without stars is not kept', () => {
    const one = withProjectFavorite({}, 'work', 'a.mfe.json', true);
    expect(one).toEqual({ work: ['a.mfe.json'] });
    const two = withProjectFavorite(one, 'work', 'b.mfe.json', true);
    const other = withProjectFavorite(two, 'home', 'a.mfe.json', true);
    expect(other).toEqual({ work: ['a.mfe.json', 'b.mfe.json'], home: ['a.mfe.json'] });
    expect(withProjectFavorite(other, 'work', 'a.mfe.json', false)).toEqual({
      work: ['b.mfe.json'],
      home: ['a.mfe.json'],
    });
    expect(withProjectFavorite(other, 'home', 'a.mfe.json', false)).toEqual({
      work: ['a.mfe.json', 'b.mfe.json'],
    });
  });

  it('is the same record when nothing changes', () => {
    const one = withProjectFavorite({}, 'work', 'a.mfe.json', true);
    expect(withProjectFavorite(one, 'work', 'a.mfe.json', true)).toBe(one);
    expect(withProjectFavorite(one, 'work', 'b.mfe.json', false)).toBe(one);
    expect(withProjectFavorite(one, 'home', 'a.mfe.json', false)).toBe(one);
  });

  it('takes a folder named as a member of every object for a folder like any other', () => {
    expect([...projectFavoritesOf({}, 'constructor')]).toEqual([]);
    const starred = withProjectFavorite({}, 'constructor', 'a.mfe.json', true);
    expect([...projectFavoritesOf(starred, 'constructor')]).toEqual(['a.mfe.json']);
    const proto = withProjectFavorite({}, '__proto__', 'a.mfe.json', true);
    expect([...projectFavoritesOf(proto, '__proto__')]).toEqual(['a.mfe.json']);
    expect([
      ...projectFavoritesOf(parseProjectFavorites(JSON.stringify(proto)), '__proto__'),
    ]).toEqual(['a.mfe.json']);
  });
});

describe('the stars the browser keeps', () => {
  it('are of the folder they were given in; no folder has none', () => {
    setProjectFavorite('work', 'a.mfe.json', true);
    const { favorites } = useProjectFavorites.getState();
    expect([...projectFavoritesOf(favorites, 'work')]).toEqual(['a.mfe.json']);
    expect(projectFavoritesOf(favorites, 'home').size).toBe(0);
    expect(projectFavoritesOf(favorites, null).size).toBe(0);
  });

  it('are stored as they change, and read back', () => {
    setProjectFavorite('work', 'a.mfe.json', true);
    setProjectFavorite('work', 'b.mfe.json', true);
    setProjectFavorite('work', 'a.mfe.json', false);
    expect(held()).toEqual({ work: ['b.mfe.json'] });
    useProjectFavorites.setState({ favorites: {} });
    loadProjectFavorites();
    expect(useProjectFavorites.getState().favorites).toEqual({ work: ['b.mfe.json'] });
  });

  it('change over what the browser holds then: a star given in another tab is kept', () => {
    setProjectFavorite('work', 'a.mfe.json', true);
    localStorage.setItem(
      PROJECT_FAVORITES_KEY,
      JSON.stringify({ work: ['a.mfe.json', 'other-tab.mfe.json'] }),
    );
    setProjectFavorite('work', 'b.mfe.json', true);
    expect(held()).toEqual({ work: ['a.mfe.json', 'other-tab.mfe.json', 'b.mfe.json'] });
    expect(useProjectFavorites.getState().favorites).toEqual(held());
  });
});
