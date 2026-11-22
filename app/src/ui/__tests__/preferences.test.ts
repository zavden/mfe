import { beforeEach, describe, expect, it } from 'vitest';
import {
  defaultPreferences,
  GUIDE_COLORS,
  GUIDE_WIDTHS,
  newClipAnimations,
  PREFERENCES_STORAGE_KEY,
  readPreferences,
  symbolReachAfterWheel,
  turnSymbolReach,
  usePreferences,
} from '../preferences';
import { defaultIntro } from '../../model';

beforeEach(() => {
  window.localStorage.clear();
  usePreferences.setState(defaultPreferences());
});

describe('editor preferences', () => {
  it('snaps dragged clips to other objects by default, and remembers the choice', () => {
    expect(readPreferences().snapObjects).toBe(true);
    usePreferences.getState().set({ snapObjects: false });
    expect(readPreferences().snapObjects).toBe(false);
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ snapObjects: 'no' }));
    expect(readPreferences().snapObjects).toBe(true);
  });

  it('draws the snap guides thin and bright yellow by default', () => {
    expect(defaultPreferences()).toMatchObject({ guideColor: '#ffe74c', guideWidth: 'thin' });
    expect(GUIDE_COLORS[0]?.value).toBe('#ffe74c');
    expect(GUIDE_COLORS.map((c) => c.id)).toEqual([
      'yellow',
      'orange',
      'magenta',
      'cyan',
      'green',
      'white',
    ]);
    for (const { value } of GUIDE_COLORS) expect(value).toMatch(/^#[0-9a-f]{6}$/);
    expect(GUIDE_WIDTHS).toEqual({ thin: 0.75, regular: 1.5, thick: 2.5 });
  });

  it('hides the grid by default, at 1 unit, holding the centre; and remembers the choices', () => {
    expect(defaultPreferences()).toMatchObject({ grid: false, gridStep: 1, gridAnchor: 'center' });
    usePreferences.getState().set({ grid: true, gridStep: 0.25, gridAnchor: 'edges' });
    expect(readPreferences()).toMatchObject({ grid: true, gridStep: 0.25, gridAnchor: 'edges' });
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ grid: 'yes', gridStep: 0.3, gridAnchor: 'corner' }),
    );
    expect(readPreferences()).toMatchObject({ grid: false, gridStep: 1, gridAnchor: 'center' });
  });

  it('lists the Creator as rows by default, and remembers blocks; anything else falls back', () => {
    expect(defaultPreferences().creatorView).toBe('list');
    usePreferences.getState().set({ creatorView: 'grid' });
    expect(readPreferences().creatorView).toBe('grid');
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ creatorView: 'cards' }));
    expect(readPreferences().creatorView).toBe('list');
  });

  it('has the previews of the Creator at 1× in both views, remembers each on its own', () => {
    expect(defaultPreferences()).toMatchObject({ creatorListPreview: 1, creatorBlockPreview: 1 });
    expect(readPreferences()).toMatchObject({ creatorListPreview: 1, creatorBlockPreview: 1 });
    usePreferences.getState().set({ creatorListPreview: 1.5 });
    expect(readPreferences()).toMatchObject({ creatorListPreview: 1.5, creatorBlockPreview: 1 });
    usePreferences.getState().set({ creatorBlockPreview: 3 });
    expect(readPreferences()).toMatchObject({ creatorListPreview: 1.5, creatorBlockPreview: 3 });
    expect(JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)!)).toMatchObject({
      creatorListPreview: 1.5,
      creatorBlockPreview: 3,
    });
    // A size that is not one of the steps is 1×, field by field, the others kept.
    for (const bad of [0, 1.25, 4, '2', null, [2]]) {
      window.localStorage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify({ creatorListPreview: bad, creatorBlockPreview: 2, creatorView: 'grid' }),
      );
      expect(readPreferences()).toMatchObject({
        creatorListPreview: 1,
        creatorBlockPreview: 2,
        creatorView: 'grid',
      });
      window.localStorage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify({ creatorListPreview: 2, creatorBlockPreview: bad }),
      );
      expect(readPreferences()).toMatchObject({ creatorListPreview: 2, creatorBlockPreview: 1 });
    }
  });

  it('leaves the list of glyphs out of a glyph view by default, and remembers it asked for', () => {
    expect(defaultPreferences().glyphList).toBe(false);
    usePreferences.getState().set({ glyphList: true });
    expect(readPreferences().glyphList).toBe(true);
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ glyphList: 'yes' }));
    expect(readPreferences().glyphList).toBe(false);
  });

  it('opens the formula editor without its keypad, and remembers it left shown', () => {
    expect(defaultPreferences().formulaKeyboardShown).toBe(false);
    expect(readPreferences().formulaKeyboardShown).toBe(false);
    usePreferences.getState().set({ formulaKeyboardShown: true });
    expect(readPreferences().formulaKeyboardShown).toBe(true);
    // There is one keyboard, the editor's keypad: which one was a choice once, and what a browser
    // kept of it is read past and not written again.
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ formulaKeyboard: 'mathlive', formulaKeyboardShown: true, glyphList: true }),
    );
    expect(readPreferences()).toMatchObject({ formulaKeyboardShown: true, glyphList: true });
    expect(readPreferences()).not.toHaveProperty('formulaKeyboard');
    usePreferences.getState().set({ glyphList: false });
    expect(JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)!)).not.toHaveProperty(
      'formulaKeyboard',
    );
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ formulaKeyboardShown: 'yes' }),
    );
    expect(readPreferences().formulaKeyboardShown).toBe(false);
  });

  it("keeps the lists of the relation editor apart from the glyph view's", () => {
    expect(defaultPreferences().relationGlyphList).toBe(false);
    usePreferences.getState().set({ relationGlyphList: true });
    expect(readPreferences()).toMatchObject({ relationGlyphList: true, glyphList: false });
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ relationGlyphList: 1 }));
    expect(readPreferences().relationGlyphList).toBe(false);
  });

  it('starts new formulas and texts at scale 1, remembers the scales as typed, refuses the rest', () => {
    expect(defaultPreferences().standardScale).toEqual({ math: '1', tex: '1' });
    usePreferences.getState().set({ standardScale: { math: '3/2', tex: '0.5' } });
    expect(readPreferences().standardScale).toEqual({ math: '3/2', tex: '0.5' });
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ standardScale: { math: '20', tex: '1' } }),
    );
    expect(readPreferences().standardScale).toEqual({ math: '1', tex: '1' });
  });

  it('keeps Zen mode, which is off until asked for', () => {
    expect(defaultPreferences().zenMode).toBe(false);
    usePreferences.getState().set({ zenMode: true });
    expect(readPreferences().zenMode).toBe(true);
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ zenMode: 'yes' }));
    expect(readPreferences().zenMode).toBe(false);
  });

  it('keeps the side of the Preview that Zen mode’s tabs are on: the top until moved', () => {
    expect(defaultPreferences().zenStrip).toBe('top');
    usePreferences.getState().set({ zenStrip: 'bottom' });
    expect(readPreferences().zenStrip).toBe('bottom');
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ zenStrip: 'left' }));
    expect(readPreferences().zenStrip).toBe('top');
  });

  it('draws the formulas locked in the preview at 40 % until told otherwise, within bounds', () => {
    expect(defaultPreferences().lockedOpacity).toBe(0.4);
    usePreferences.getState().set({ lockedOpacity: 0.8 });
    expect(readPreferences().lockedOpacity).toBe(0.8);
    usePreferences.getState().set({ lockedOpacity: 1 });
    expect(readPreferences().lockedOpacity).toBe(1);
    for (const bad of [0, -1, 1.5, '0.4', null]) {
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ lockedOpacity: bad }));
      expect(readPreferences().lockedOpacity).toBe(0.4);
    }
  });

  it('keeps the reach of align by symbol between its bounds', () => {
    expect(defaultPreferences().symbolRadius).toBe(14);
    usePreferences.getState().set({ symbolRadius: 30 });
    expect(readPreferences().symbolRadius).toBe(30);
    for (const bad of [2, 500, 'x', null]) {
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ symbolRadius: bad }));
      expect(readPreferences().symbolRadius).toBe(14);
    }
  });

  /** The reach after one event of the wheel, from a whole reach that nothing has turned finer. */
  const afterOne = (from: number, delta: number) => symbolReachAfterWheel(from, null, delta).radius;
  /** The turns of the reach over the events of a scroll, from such a reach too. */
  const scrolled = (from: number, deltas: readonly number[]) => {
    const seen = [from];
    let turn = { radius: from, kept: null as number | null };
    for (const delta of deltas) {
      turn = symbolReachAfterWheel(turn.radius, turn.kept, delta);
      seen.push(turn.radius);
    }
    return { ...turn, seen };
  };
  /** A slow scroll (60 events of 1 to 4 px), a steady one (30 of 8 to 15) and a flick with its
   * glide, each towards the user; `away` turns them the other way. */
  const SLOW = Array.from({ length: 60 }, (_, i) => 1 + (i % 4));
  const STEADY = Array.from({ length: 30 }, (_, i) => 8 + (i % 8));
  const FLICK = [12, 35, 60, 48, 36, 27, 20, 15, 11, 8, 6, 4, 3, 2, 1, 1];
  const sum = (deltas: readonly number[]) => deltas.reduce((a, b) => a + b, 0);
  const away = (deltas: readonly number[]) => deltas.map((delta) => -delta);

  it('grows and shrinks the reach with the wheel, a fifth a notch, in whole pixels within bounds', () => {
    // A notch of a wheel is 100: away from the user (negative) grows it.
    expect(afterOne(14, -100)).toBe(17);
    expect(afterOne(14, 100)).toBe(11);
    expect(afterOne(14, 0)).toBe(14);
    expect(afterOne(7, 600)).toBe(6);
    expect(afterOne(50, -600)).toBe(60);
  });

  it('adds up the events of a scroll that are too small to move the reach by themselves', () => {
    // None of these events moves a reach of 14: each would be rounded away (a trackpad's scroll).
    for (const delta of [...SLOW, ...STEADY]) {
      expect(afterOne(14, delta)).toBe(14);
      expect(afterOne(14, -delta)).toBe(14);
    }
    expect(sum(SLOW)).toBe(150);
    expect(scrolled(14, away(SLOW)).radius).toBe(19);
    expect(scrolled(14, SLOW).radius).toBe(10);
    expect(sum(STEADY)).toBe(339);
    expect(scrolled(14, away(STEADY)).radius).toBe(28);
    expect(scrolled(14, STEADY).radius).toBe(7);
    // From the smallest reach and from the largest, where an event counts least and most.
    expect(scrolled(6, away(SLOW)).radius).toBe(8);
    expect(scrolled(60, SLOW).radius).toBe(44);
    // A pixel at a time on the way, not in jumps.
    expect([...new Set(scrolled(14, away(SLOW)).seen)]).toEqual([14, 15, 16, 17, 18, 19]);
  });

  it('takes the reach as far as one event of the whole scroll, however it is cut into events', () => {
    for (const from of [6, 9, 14, 21, 33, 47, 60]) {
      for (const events of [SLOW, STEADY, FLICK, away(SLOW), away(STEADY), away(FLICK)]) {
        expect(scrolled(from, events).radius).toBe(afterOne(from, sum(events)));
      }
    }
    // A wheel's notches too: eight of them, and three times as many of a third each.
    const thirds = Array.from({ length: 24 }, () => -100 / 3);
    expect(scrolled(14, thirds).radius).toBe(afterOne(14, -800));
    expect(scrolled(7, thirds.slice(0, 12)).radius).toBe(afterOne(7, -400));
  });

  it('gives the reach it was when the fingers, or the wheel, are back where they were', () => {
    const there = scrolled(14, away(SLOW));
    expect(there.radius).toBe(19);
    const back = SLOW.reduce(
      (turn, delta) => symbolReachAfterWheel(turn.radius, turn.kept, delta),
      { radius: there.radius, kept: there.kept },
    );
    expect(back).toEqual({ radius: 14, kept: null });
    // Four notches one way and four back, short of the limit.
    const notches = scrolled(14, [100, 100, 100, 100, -100, -100, -100, -100]);
    expect(notches.seen).toEqual([14, 11, 9, 8, 6, 8, 9, 11, 14]);
    expect(notches.kept).toBeNull();
  });

  it('turns the reach a fifth with each notch of a wheel', () => {
    // The first notch from a whole reach is the reach rounded; the ones after it go on from what
    // it left, so that eight notches are e^1.6 and not eight roundings.
    expect(
      scrolled(
        14,
        Array.from({ length: 8 }, () => -100),
      ).seen,
    ).toEqual([14, 17, 21, 26, 31, 38, 46, 57, 60]);
    expect(
      scrolled(
        60,
        Array.from({ length: 13 }, () => 100),
      ).seen,
    ).toEqual([60, 49, 40, 33, 27, 22, 18, 15, 12, 10, 8, 7, 6, 6]);
    // The notches of the specs (120): six up from 14 pass 24, six down reach the smallest.
    expect(
      scrolled(
        14,
        Array.from({ length: 6 }, () => -120),
      ).radius,
    ).toBe(59);
    expect(
      scrolled(
        14,
        Array.from({ length: 6 }, () => 120),
      ).radius,
    ).toBe(6);
  });

  it('keeps nothing of a scroll past a limit: the first events back count at once', () => {
    const atTheSmallest = scrolled(
      6,
      Array.from({ length: 50 }, () => 10),
    );
    expect(atTheSmallest.radius).toBe(6);
    expect(atTheSmallest.kept).toBeNull();
    const back = (events: number) =>
      Array.from({ length: events }, () => -10).reduce(
        (turn, delta) => symbolReachAfterWheel(turn.radius, turn.kept, delta),
        { radius: 6, kept: atTheSmallest.kept },
      ).radius;
    // 6 × e^(0.02 n) passes 6.5 at the fifth event, as from a reach of 6 that was never pushed.
    expect(back(4)).toBe(6);
    expect(back(5)).toBe(7);
    const atTheLargest = scrolled(60, away(STEADY));
    expect(atTheLargest.radius).toBe(60);
    expect(atTheLargest.kept).toBeNull();
  });

  it('goes on from what a scroll left, while the reach is the one it left', () => {
    // 14.4 was kept under a reach of 14: two events of 3 px take it past 14.5.
    const first = symbolReachAfterWheel(14, 14.4, -3);
    expect(first.radius).toBe(14);
    expect(first.kept).toBeCloseTo(14.4867, 4);
    expect(symbolReachAfterWheel(14, first.kept, -3).radius).toBe(15);
    // A notch after it goes on from there too: 14.4, not 14, turned a fifth.
    expect(symbolReachAfterWheel(14, 14.4, -100).radius).toBe(18);
    // The reach was set elsewhere meanwhile (another view, a stored preference): what was kept
    // was of another reach, and the count starts from the new one.
    const elsewhere = symbolReachAfterWheel(20, 14.4, -3);
    expect(elsewhere.radius).toBe(20);
    expect(elsewhere.kept).toBeCloseTo(20.1204, 4);
    expect(symbolReachAfterWheel(20, 14.4, -100).radius).toBe(24);
  });

  it('writes the reach as a scroll turns it, once for each pixel', () => {
    const kept = { current: null as number | null };
    let told = 0;
    const stop = usePreferences.subscribe(() => {
      told += 1;
    });
    for (const delta of away(SLOW)) turnSymbolReach(kept, delta);
    stop();
    expect(usePreferences.getState().symbolRadius).toBe(19);
    expect(readPreferences().symbolRadius).toBe(19);
    // 15, 16, 17, 18, 19: the 55 events that moved no pixel wrote nothing.
    expect(told).toBe(5);
    expect(kept.current).toBeCloseTo(18.898, 3);
    // Another view has its own count: it starts from the reach as it is.
    const other = { current: null as number | null };
    turnSymbolReach(other, 100);
    expect(usePreferences.getState().symbolRadius).toBe(16);
    // And what the first view kept is of a reach that is no more.
    turnSymbolReach(kept, -3);
    expect(usePreferences.getState().symbolRadius).toBe(16);
    expect(kept.current).toBeCloseTo(16.0963, 4);
  });

  it('has the circle selector off by default, and remembers it', () => {
    expect(defaultPreferences().circleSelect).toBe(false);
    usePreferences.getState().set({ circleSelect: true });
    expect(readPreferences().circleSelect).toBe(true);
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ circleSelect: 'yes' }));
    expect(readPreferences().circleSelect).toBe(false);
  });

  it('remembers the guide colour and width', () => {
    usePreferences.getState().set({ guideColor: '#ff5c8d', guideWidth: 'thick' });
    expect(readPreferences()).toMatchObject({ guideColor: '#ff5c8d', guideWidth: 'thick' });
    // Any #rrggbb is accepted, in either case.
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ guideColor: '#4CC9F0', guideWidth: 'regular' }),
    );
    expect(readPreferences()).toMatchObject({ guideColor: '#4CC9F0', guideWidth: 'regular' });
  });

  it('marks the glyphs picked with Alt in the yellow of the guides by default; remembers another', () => {
    expect(defaultPreferences().pickColor).toBe('#ffe74c');
    expect(defaultPreferences().pickColor).toBe(GUIDE_COLORS[0]?.value);
    usePreferences.getState().set({ pickColor: '#ff5c8d' });
    expect(readPreferences()).toMatchObject({ pickColor: '#ff5c8d', guideColor: '#ffe74c' });
    // Its own preference: the guides keep theirs, and the other way round.
    usePreferences.getState().set({ guideColor: '#4cc9f0' });
    expect(readPreferences()).toMatchObject({ pickColor: '#ff5c8d', guideColor: '#4cc9f0' });
    // What was stored before the preference existed, or is no colour, is the default.
    for (const bad of [undefined, 'yellow', '#fff', '#gggggg', 7, null]) {
      window.localStorage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify({ pickColor: bad, guideColor: '#6ee76e' }),
      );
      expect(readPreferences()).toMatchObject({ pickColor: '#ffe74c', guideColor: '#6ee76e' });
    }
  });

  it('keeps the scale step as typed — a preset, a number or a fraction — and falls back otherwise', () => {
    expect(defaultPreferences().scaleStep).toBe('0.05');
    usePreferences.getState().set({ scaleStep: '1/3' });
    expect(readPreferences().scaleStep).toBe('1/3');
    for (const bad of ['', 'abc', '3', 0.2, null]) {
      window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ scaleStep: bad }));
      expect(readPreferences().scaleStep).toBe('0.05');
    }
  });

  it('names the copy of a split clip with "_s" by default, remembers another, refuses the rest', () => {
    expect(defaultPreferences().splitSuffix).toBe('_s');
    expect(readPreferences().splitSuffix).toBe('_s');
    usePreferences.getState().set({ splitSuffix: '_part' });
    expect(readPreferences().splitSuffix).toBe('_part');
    expect(JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)!)).toMatchObject({
      splitSuffix: '_part',
    });
    // Not a suffix that keeps a name a Python variable: the default, the other fields kept.
    for (const bad of ['', ' _s', '-s', '_é', 'a'.repeat(17), 2, null, ['_s']]) {
      window.localStorage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify({ splitSuffix: bad, scaleStep: '1/3' }),
      );
      expect(readPreferences()).toMatchObject({ splitSuffix: '_s', scaleStep: '1/3' });
    }
  });

  it('falls back, field by field, for a guide colour or width that is not valid', () => {
    const stored = (guideColor: unknown, guideWidth: unknown, snapObjects = false) =>
      window.localStorage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify({ guideColor, guideWidth, snapObjects }),
      );
    for (const bad of ['yellow', '#fff', '#ffe74', '#ffe74cc', 'ffe74c', '#gggggg', '', 7, null]) {
      stored(bad, 'thick');
      expect(readPreferences()).toMatchObject({
        guideColor: '#ffe74c',
        guideWidth: 'thick',
        snapObjects: false, // the other fields are kept
      });
    }
    for (const bad of ['fat', 'Thin', '', 2, null, ['thin']]) {
      stored('#6ee76e', bad);
      expect(readPreferences()).toMatchObject({ guideColor: '#6ee76e', guideWidth: 'thin' });
    }
  });

  it('draws the camera’s route and its veil by default; remembers the choice of each', () => {
    expect(defaultPreferences()).toMatchObject({ cameraRoute: true, cameraVeil: true });
    usePreferences.getState().set({ cameraRoute: false });
    expect(readPreferences()).toMatchObject({ cameraRoute: false, cameraVeil: true });
    usePreferences.getState().set({ cameraVeil: false, cameraRoute: true });
    expect(readPreferences()).toMatchObject({ cameraRoute: true, cameraVeil: false });
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ cameraRoute: 'no', cameraVeil: 0 }),
    );
    expect(readPreferences()).toMatchObject({ cameraRoute: true, cameraVeil: true });
  });

  it('hides the transform handles without Shift by default; remembers the choice', () => {
    expect(defaultPreferences().keepHandles).toBe(false);
    usePreferences.getState().set({ keepHandles: true });
    expect(readPreferences().keepHandles).toBe(true);
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify({ keepHandles: 'yes' }));
    expect(readPreferences().keepHandles).toBe(false);
  });

  it('does not suggest the pairs of a new Morph block by default; remembers the choice', () => {
    expect(defaultPreferences().autoSuggestMorphPairs).toBe(false);
    expect(readPreferences().autoSuggestMorphPairs).toBe(false);
    usePreferences.getState().set({ autoSuggestMorphPairs: true });
    expect(readPreferences().autoSuggestMorphPairs).toBe(true);
    expect(JSON.parse(window.localStorage.getItem(PREFERENCES_STORAGE_KEY)!)).toMatchObject({
      autoSuggestMorphPairs: true,
    });
    for (const bad of ['yes', 1, null, [true]]) {
      window.localStorage.setItem(
        PREFERENCES_STORAGE_KEY,
        JSON.stringify({ autoSuggestMorphPairs: bad, autoIntro: true }),
      );
      expect(readPreferences()).toMatchObject({ autoSuggestMorphPairs: false, autoIntro: true });
    }
  });

  it('creates clips without intro or outro by default', () => {
    expect(newClipAnimations()).toMatchObject({
      intro: { kind: 'none', duration: 0 },
      outro: { kind: 'none', duration: 0 },
    });
  });

  it('uses the chosen animations when "always add" is on, and persists them', () => {
    const intro = { ...defaultPreferences().intro, kind: 'fade_in' as const, duration: 0.5 };
    usePreferences.getState().set({ autoIntro: true, intro });
    const { intro: got, outro } = newClipAnimations();
    expect(got).toEqual(intro);
    expect(got).not.toBe(intro);
    expect(outro.kind).toBe('none');
    expect(readPreferences()).toMatchObject({ autoIntro: true, autoOutro: false, intro });
  });

  it('prefers the intro a formula chose, and scales it to the clip too', () => {
    const own = defaultIntro('create');
    const { intro, outro } = newClipAnimations(Infinity, own);
    expect(intro).toEqual(own);
    expect(intro).not.toBe(own);
    expect(outro.kind).toBe('none');
    usePreferences.getState().set({ autoIntro: true });
    expect(newClipAnimations(Infinity, defaultIntro('fade_in')).intro.kind).toBe('fade_in');
    expect(newClipAnimations(Infinity, null).intro.kind).toBe('write');
    expect(newClipAnimations(0.5, own).intro.duration).toBeCloseTo(0.5);
  });

  it('shrinks the animations proportionally to fit a short clip', () => {
    usePreferences.getState().set({ autoIntro: true, autoOutro: true });
    const { intro, outro } = newClipAnimations(1);
    expect(intro.duration).toBeCloseTo(0.5);
    expect(outro.duration).toBeCloseTo(0.5);
    expect(newClipAnimations(3).intro.duration).toBe(1);
  });

  it('falls back to the defaults for malformed storage', () => {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      '{"autoIntro": 3, "intro": {"kind": "none"}}',
    );
    expect(readPreferences()).toEqual(defaultPreferences());
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, 'not json');
    expect(readPreferences()).toEqual(defaultPreferences());
  });
});
