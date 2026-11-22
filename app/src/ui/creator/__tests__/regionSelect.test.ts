// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  boxStyle,
  contentBox,
  contentPoint,
  regionBox,
  regionMode,
  regionSelection,
  startsRegion,
  touches,
  type RegionCard,
  type ScrollView,
} from '../regionSelect';

/** A grid of results, two columns of 100 × 80 with gaps of 10, in content coordinates: a b / c d
 * / e f. */
const box = (column: number, row: number) => ({
  left: 10 + column * 110,
  top: 10 + row * 90,
  right: 110 + column * 110,
  bottom: 90 + row * 90,
});
const cards: RegionCard[] = ['a', 'b', 'c', 'd', 'e', 'f'].map((id, i) => ({
  id,
  box: box(i % 2, Math.floor(i / 2)),
}));

describe('a region over the results of the search', () => {
  it('does what the keys held at the press say: none replaces, Shift adds, Ctrl/⌘ removes', () => {
    expect(regionMode({ shift: false, ctrl: false })).toBe('replace');
    expect(regionMode({ shift: true, ctrl: false })).toBe('add');
    expect(regionMode({ shift: false, ctrl: true })).toBe('remove');
    // Both: adds, as Ctrl/⌘+Shift+click adds a range.
    expect(regionMode({ shift: true, ctrl: true })).toBe('add');
  });

  it('is the rectangle between the press and the pointer, whichever way it was dragged', () => {
    const box = { left: 5, top: 20, right: 50, bottom: 60 };
    expect(regionBox({ x: 5, y: 20 }, { x: 50, y: 60 })).toEqual(box);
    expect(regionBox({ x: 50, y: 60 }, { x: 5, y: 20 })).toEqual(box);
    expect(regionBox({ x: 50, y: 20 }, { x: 5, y: 60 })).toEqual(box);
  });

  it('touches a card it shares a point with: edges count, a line of no width too', () => {
    const card = { left: 10, top: 10, right: 110, bottom: 90 };
    expect(touches({ left: 110, top: 0, right: 120, bottom: 5 }, card)).toBe(false);
    expect(touches({ left: 110, top: 0, right: 120, bottom: 10 }, card)).toBe(true);
    expect(touches({ left: 50, top: 0, right: 50, bottom: 200 }, card)).toBe(true);
    expect(touches({ left: 111, top: 0, right: 115, bottom: 200 }, card)).toBe(false);
  });

  it('with no key, the selection becomes what it touches, the hidden selected ones leave', () => {
    // From the gap left of a to the middle of d: a, b, c and d. «z» is selected and not shown
    // (another tab, or the search's text hides it): it leaves, as on a plain click on a card.
    const region = regionBox({ x: 2, y: 2 }, { x: 160, y: 150 });
    expect(regionSelection(['z', 'e'], cards, region, 'replace')).toEqual(['a', 'b', 'c', 'd']);
    // Over the gaps alone it touches nothing: nothing is selected.
    expect(
      regionSelection(['a'], cards, regionBox({ x: 0, y: 0 }, { x: 5, y: 300 }), 'replace'),
    ).toEqual([]);
  });

  it('Shift adds what it touches to what was selected; Ctrl/⌘ takes it out', () => {
    // A line down the first column, from the gap under a: c and e.
    const middle = regionBox({ x: 60, y: 95 }, { x: 60, y: 200 });
    expect(regionSelection(['z', 'c'], cards, middle, 'add')).toEqual(['z', 'c', 'e']);
    expect(regionSelection(['z', 'a', 'c', 'e'], cards, middle, 'remove')).toEqual(['z', 'a']);
    // What it does not touch stays, shown or hidden.
    expect(regionSelection(['z', 'f'], cards, middle, 'remove')).toEqual(['z', 'f']);
  });

  it('keeps its corners in the content, inside the part the list shows, while it scrolls', () => {
    // The results are at (300, 200) on screen, 240 × 180 of them shown, scrolled down by 150.
    const view: ScrollView = {
      left: 300,
      top: 200,
      width: 240,
      height: 180,
      scrollLeft: 0,
      scrollTop: 150,
    };
    expect(contentPoint({ x: 320, y: 230 }, view)).toEqual({ x: 20, y: 180 });
    // A pointer past an edge holds the corner at that edge.
    expect(contentPoint({ x: 900, y: 100 }, view)).toEqual({ x: 240, y: 150 });
    expect(contentPoint({ x: 0, y: 900 }, view)).toEqual({ x: 0, y: 330 });
    // A card on screen, in the content.
    expect(contentBox({ left: 310, top: 210, right: 410, bottom: 290 }, view)).toEqual({
      left: 10,
      top: 160,
      right: 110,
      bottom: 240,
    });
  });

  it('a corner put before the list scrolled stays on its card: the region grows with the scroll', () => {
    // Pressed at the top of a (content y 20) with nothing scrolled; the list then scrolls by 180
    // and the pointer stays where it was let go on screen, near the bottom of the view.
    const before: ScrollView = {
      left: 0,
      top: 0,
      width: 240,
      height: 180,
      scrollLeft: 0,
      scrollTop: 0,
    };
    const start = contentPoint({ x: 5, y: 20 }, before);
    const after = { ...before, scrollTop: 180 };
    const region = regionBox(start, contentPoint({ x: 60, y: 170 }, after));
    expect(region).toEqual({ left: 5, top: 20, right: 60, bottom: 350 });
    expect(regionSelection([], cards, region, 'replace')).toEqual(['a', 'c', 'e']);
  });
});

describe('where a region may start', () => {
  const press = (onItem: boolean, alt: boolean, inField = false) => ({ onItem, alt, inField });

  it('starts on the empty space of any list, Alt held or not', () => {
    for (const altOnItems of [false, true]) {
      expect(startsRegion(press(false, false), altOnItems)).toBe(true);
      expect(startsRegion(press(false, true), altOnItems)).toBe(true);
    }
  });

  it('leaves a press on a card of the search to the card, Alt held or not', () => {
    expect(startsRegion(press(true, false), false)).toBe(false);
    expect(startsRegion(press(true, true), false)).toBe(false);
  });

  it('starts on a row of the Creator only with Alt held', () => {
    expect(startsRegion(press(true, false), true)).toBe(false);
    expect(startsRegion(press(true, true), true)).toBe(true);
  });

  it('never starts in a text field, as the name of a row being renamed', () => {
    expect(startsRegion(press(true, true, true), true)).toBe(false);
    expect(startsRegion(press(false, true, true), true)).toBe(false);
  });

  it('is drawn where its box is, as wide and tall as the box', () => {
    expect(boxStyle({ left: 5, top: 20, right: 60, bottom: 350 })).toEqual({
      left: 5,
      top: 20,
      width: 55,
      height: 330,
    });
    // A press that has not travelled yet: a box of no size.
    expect(boxStyle(regionBox({ x: 7, y: 9 }, { x: 7, y: 9 }))).toEqual({
      left: 7,
      top: 9,
      width: 0,
      height: 0,
    });
  });
});
