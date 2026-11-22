// @vitest-environment node
/* The relation editor's rules in the player (`pairs.ts`) are the editor's own: every copy gives
 * what its original in `ui/relations/` gives, over many generated cases (the player cannot import
 * `ui/`; a test can), and takes the parameters it takes — a type check, which `tsc -b` makes: an
 * optional parameter the original gains is no case a run can see. A change of the editor fails
 * here until the copy follows. */
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  parseProject,
  type FormulaSnapshot,
  type GlyphPair,
  type PairExtras,
  type Relation,
  type RelationStyle,
} from '../../model';
import { readExample } from '../../test/examples';
import * as app from '../../ui/relations/relationOps';
import { linkFrame as appLinkFrame, textSize as appTextSize } from '../../ui/relations/linkLayout';
import * as appGestures from '../../ui/relations/pairGestures';
import { initialDraft, unpairedGlyphs as appUnpaired } from '../../ui/relations/relationDraft';
import {
  PAIR_COLORS as APP_PAIR_COLORS,
  pairColor as appPairColor,
} from '../../ui/relations/pairColors';
import { pairStyleBadge as appBadge } from '../../ui/relations/pairStyle';
import {
  EXTRAS_OPTIONS as APP_EXTRAS,
  STYLE_OPTIONS as APP_STYLES,
  styleLabel as appStyleLabel,
} from '../../ui/relations/styleOptions';
import * as own from '../pairs';

/** A small seeded generator (mulberry32), so that a failure can be run again. */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STYLES: RelationStyle[] = ['transform', 'copy', 'fade', 'fade_copy'];
const EXTRAS: (PairExtras | undefined)[] = [undefined, 'separate', 'merge', 'copies'];

/** Some glyphs out of `count`, at least one. */
function some(next: () => number, count: number, most = 3): number[] {
  const n = 1 + Math.floor(next() * most);
  return Array.from({ length: n }, () => Math.floor(next() * count));
}

function relationOf(next: () => number, glyphs: number): Relation {
  const pairs: GlyphPair[] = [];
  const n = Math.floor(next() * 5);
  for (let i = 0; i < n; i++) {
    const pair: GlyphPair = {
      from: own.sortedUnique(some(next, glyphs)),
      to: own.sortedUnique(some(next, glyphs, 2)),
      style: next() < 0.5 ? null : STYLES[Math.floor(next() * 3)]!,
    };
    const extras = EXTRAS[Math.floor(next() * EXTRAS.length)];
    if (extras) pair.extras = extras;
    if (next() < 0.2) pair.principal = pair.from[0]!;
    pairs.push(pair);
  }
  return {
    id: 'r',
    fromClipId: 'a',
    toClipId: 'b',
    offset: 0,
    duration: 1,
    easing: 'smooth',
    style: STYLES[Math.floor(next() * 3)]!,
    pathArc: 0,
    pairs,
  };
}

function snapshotOf(next: () => number, count: number): FormulaSnapshot {
  const labels = ['x', 'y', '2', '+', '=', '(', ')'];
  return {
    backend: 'mathjax',
    key: 'k',
    glyphs: Array.from({ length: count }, () => ({
      label: labels[Math.floor(next() * labels.length)]!,
      center: [Math.round(next() * 8) / 2, Math.round(next() * 4) / 2],
      size: [0.3, 0.4],
    })),
  };
}

/** A formula of these glyphs, left to right. */
function labelled(labels: readonly string[]): FormulaSnapshot {
  return {
    backend: 'mathjax',
    key: 'k',
    glyphs: labels.map((label, i) => ({ label, center: [i * 0.5, 0], size: [0.3, 0.4] })),
  };
}

describe('the relation editor in the player', () => {
  it('takes what the editor takes and gives what it gives, copy by copy', () => {
    // Types only: `tsc -b` fails here while a copy's parameters or result differ from its
    // original's — an optional parameter the original gains included.
    expectTypeOf(own.styleLabel).parameters.toEqualTypeOf<Parameters<typeof appStyleLabel>>();
    expectTypeOf(own.styleLabel).returns.toEqualTypeOf<ReturnType<typeof appStyleLabel>>();
    expectTypeOf(own.pairStyleBadge).parameters.toEqualTypeOf<Parameters<typeof appBadge>>();
    expectTypeOf(own.pairStyleBadge).returns.toEqualTypeOf<ReturnType<typeof appBadge>>();
    expectTypeOf(own.pairColor).parameters.toEqualTypeOf<Parameters<typeof appPairColor>>();
    expectTypeOf(own.pairColor).returns.toEqualTypeOf<ReturnType<typeof appPairColor>>();
    expectTypeOf(own.sortedUnique).parameters.toEqualTypeOf<Parameters<typeof app.sortedUnique>>();
    expectTypeOf(own.sortedUnique).returns.toEqualTypeOf<ReturnType<typeof app.sortedUnique>>();
    expectTypeOf(own.styleOfPair).parameters.toEqualTypeOf<Parameters<typeof app.styleOfPair>>();
    expectTypeOf(own.styleOfPair).returns.toEqualTypeOf<ReturnType<typeof app.styleOfPair>>();
    expectTypeOf(own.sameGlyphs).parameters.toEqualTypeOf<Parameters<typeof app.sameGlyphs>>();
    expectTypeOf(own.sameGlyphs).returns.toEqualTypeOf<ReturnType<typeof app.sameGlyphs>>();
    expectTypeOf(own.linkPair).parameters.toEqualTypeOf<Parameters<typeof app.linkPair>>();
    expectTypeOf(own.linkPair).returns.toEqualTypeOf<ReturnType<typeof app.linkPair>>();
    expectTypeOf(own.removePairs).parameters.toEqualTypeOf<Parameters<typeof app.removePairs>>();
    expectTypeOf(own.removePairs).returns.toEqualTypeOf<ReturnType<typeof app.removePairs>>();
    expectTypeOf(own.setPairsStyle).parameters.toEqualTypeOf<
      Parameters<typeof app.setPairsStyle>
    >();
    expectTypeOf(own.setPairsStyle).returns.toEqualTypeOf<ReturnType<typeof app.setPairsStyle>>();
    expectTypeOf(own.setPairExtras).parameters.toEqualTypeOf<
      Parameters<typeof app.setPairExtras>
    >();
    expectTypeOf(own.setPairExtras).returns.toEqualTypeOf<ReturnType<typeof app.setPairExtras>>();
    expectTypeOf(own.readingOrder).parameters.toEqualTypeOf<Parameters<typeof app.readingOrder>>();
    expectTypeOf(own.readingOrder).returns.toEqualTypeOf<ReturnType<typeof app.readingOrder>>();
    expectTypeOf(own.suggestPairs).parameters.toEqualTypeOf<Parameters<typeof app.suggestPairs>>();
    expectTypeOf(own.suggestPairs).returns.toEqualTypeOf<ReturnType<typeof app.suggestPairs>>();
    expectTypeOf(own.glyphLabel).parameters.toEqualTypeOf<Parameters<typeof app.glyphLabel>>();
    expectTypeOf(own.glyphLabel).returns.toEqualTypeOf<ReturnType<typeof app.glyphLabel>>();
    expectTypeOf(own.describePair).parameters.toEqualTypeOf<Parameters<typeof app.describePair>>();
    expectTypeOf(own.describePair).returns.toEqualTypeOf<ReturnType<typeof app.describePair>>();
    expectTypeOf(own.relationSummary).parameters.toEqualTypeOf<
      Parameters<typeof app.relationSummary>
    >();
    expectTypeOf(own.relationSummary).returns.toEqualTypeOf<
      ReturnType<typeof app.relationSummary>
    >();
    // The editor's takes its draft; the player has none, and takes the relation as it is (what a
    // draft is as it opens). The rest of the two is the same.
    type AppUnpaired = Parameters<typeof appUnpaired>;
    expectTypeOf(own.unpairedGlyphs).parameters.toEqualTypeOf<
      [AppUnpaired[0], Relation, AppUnpaired[2], AppUnpaired[3]]
    >();
    expectTypeOf(own.unpairedGlyphs).returns.toEqualTypeOf<ReturnType<typeof appUnpaired>>();
    expectTypeOf(own.glyphClick).parameters.toEqualTypeOf<
      Parameters<typeof appGestures.glyphClick>
    >();
    expectTypeOf(own.glyphClick).returns.toEqualTypeOf<ReturnType<typeof appGestures.glyphClick>>();
    expectTypeOf(own.pairsHolding).parameters.toEqualTypeOf<
      Parameters<typeof appGestures.pairsHolding>
    >();
    expectTypeOf(own.pairsHolding).returns.toEqualTypeOf<
      ReturnType<typeof appGestures.pairsHolding>
    >();
    expectTypeOf(own.linkFrame).parameters.toEqualTypeOf<Parameters<typeof appLinkFrame>>();
    expectTypeOf(own.linkFrame).returns.toEqualTypeOf<ReturnType<typeof appLinkFrame>>();
    expectTypeOf(own.textSize).parameters.toEqualTypeOf<Parameters<typeof appTextSize>>();
    expectTypeOf(own.textSize).returns.toEqualTypeOf<ReturnType<typeof appTextSize>>();
  });

  it('names and colours styles and pairs as the editor does', () => {
    expect(own.STYLE_OPTIONS).toEqual(APP_STYLES);
    expect(own.EXTRAS_OPTIONS).toEqual(APP_EXTRAS);
    expect([...own.PAIR_COLORS]).toEqual([...APP_PAIR_COLORS]);
    for (const style of STYLES) expect(own.styleLabel(style)).toBe(appStyleLabel(style));
    for (const style of [null, ...STYLES]) {
      for (const holder of STYLES) {
        const pair = { from: [0], to: [0], style };
        expect(own.pairStyleBadge(pair, holder)).toBe(appBadge(pair, holder));
      }
    }
  });

  it('links glyphs into pairs as Link does, failures and their messages included', () => {
    const next = random(7);
    let joined = 0;
    let failed = 0;
    for (let i = 0; i < 1500; i++) {
      const relation = relationOf(next, 6);
      const from = some(next, 6);
      const to = some(next, 6, 2);
      const style = next() < 0.6 ? null : STYLES[Math.floor(next() * 3)]!;
      const labels =
        next() < 0.5 ? { from: (g: number) => `f${g}`, to: (g: number) => `t${g}` } : undefined;
      // A link that stays a pair of its own, now and then (D167).
      const options = next() < 0.25 ? { separate: true } : {};
      const want = app.linkPair(relation, from, to, style, labels, options);
      expect(own.linkPair(relation, from, to, style, labels, options), `case ${i}`).toEqual(want);
      if (want.ok && want.joined !== undefined) joined++;
      if (!want.ok) failed++;
    }
    // The cases reach every branch: new pairs, joined ones and refusals.
    expect(joined).toBeGreaterThan(50);
    expect(failed).toBeGreaterThan(50);
    const empty = relationOf(next, 4);
    expect(own.linkPair(empty, [], [1])).toEqual(app.linkPair(empty, [], [1]));
  });

  it('removes pairs and sets their style and extras as the editor does', () => {
    const next = random(11);
    for (let i = 0; i < 300; i++) {
      const relation = relationOf(next, 5);
      const indices = some(next, Math.max(1, relation.pairs.length));
      const style = next() < 0.3 ? null : STYLES[Math.floor(next() * 3)]!;
      const extras = (['separate', 'merge', 'copies'] as const)[Math.floor(next() * 3)]!;
      expect(own.removePairs(relation, indices)).toEqual(app.removePairs(relation, indices));
      expect(own.setPairsStyle(relation, indices, style)).toEqual(
        app.setPairsStyle(relation, indices, style),
      );
      expect(own.setPairExtras(relation, indices[0]!, extras)).toEqual(
        app.setPairExtras(relation, indices[0]!, extras),
      );
      for (const pair of relation.pairs) {
        expect(own.styleOfPair(pair, relation)).toBe(app.styleOfPair(pair, relation));
      }
    }
  });

  it('suggests links by label and reads glyphs in reading order as the editor does', () => {
    const next = random(3);
    let kept = 0;
    for (let i = 0; i < 400; i++) {
      const from = snapshotOf(next, 1 + Math.floor(next() * 9));
      const to = snapshotOf(next, 1 + Math.floor(next() * 9));
      const existing = relationOf(next, Math.min(from.glyphs.length, to.glyphs.length)).pairs;
      expect(own.readingOrder(from)).toEqual(app.readingOrder(from));
      expect(own.suggestPairs(from, to, existing)).toEqual(app.suggestPairs(from, to, existing));
      // The glyphs another relation or a Morph block keeps from this one (`taken`): one side,
      // both or none.
      const taken = {
        ...(next() < 0.6 ? { from: some(next, from.glyphs.length) } : {}),
        ...(next() < 0.6 ? { to: new Set(some(next, to.glyphs.length)) } : {}),
      };
      const suggested = own.suggestPairs(from, to, existing, taken);
      expect(suggested, `case ${i}`).toEqual(app.suggestPairs(from, to, existing, taken));
      if (suggested.length < own.suggestPairs(from, to, existing).length) kept++;
      for (const pair of existing) {
        expect(own.describePair(pair, from, to)).toBe(app.describePair(pair, from, to));
      }
      expect(own.glyphLabel(null, 3)).toBe(app.glyphLabel(null, 3));
    }
    // The cases reach glyphs kept from a suggestion.
    expect(kept).toBeGreaterThan(50);
    // Glyph 0 of the source is consumed by another relation, glyph 2 of the target brought by
    // another one: the editor suggests 3 onto 3 alone.
    const x3 = labelled(['x', '+', '3']);
    const x4 = labelled(['x', '=', '+', '3']);
    const taken = { from: [0], to: [2] };
    expect(own.suggestPairs(x3, x4, [], taken)).toEqual([{ from: [2], to: [3], style: null }]);
    expect(own.suggestPairs(x3, x4, [], taken)).toEqual(app.suggestPairs(x3, x4, [], taken));
    for (const [p, l, a] of [
      [0, 0, 0],
      [1, 1, 1],
      [4, 2, 0],
      [2, 1, 3],
    ] as const) {
      expect(own.relationSummary(p, l, a)).toBe(app.relationSummary(p, l, a));
      // A target that starts empty: the glyphs no pair brings stay out.
      for (const staysOut of [false, true]) {
        expect(own.relationSummary(p, l, a, staysOut)).toBe(app.relationSummary(p, l, a, staysOut));
      }
    }
    expect(own.relationSummary(2, 1, 3, true)).toBe(
      '2 linked pairs · 1 glyph leaves · 3 glyphs stay out',
    );
  });

  it('answers a click on a glyph and finds the pairs of a selection as the editor does', () => {
    const next = random(5);
    const pick = () => new Set(some(next, 5).filter(() => next() < 0.7));
    for (let i = 0; i < 600; i++) {
      const selection = { from: pick(), to: pick() };
      const side = next() < 0.5 ? 'from' : 'to';
      const glyph = Math.floor(next() * 5);
      const additive = next() < 0.3;
      const plain = (click: own.GlyphClick | appGestures.GlyphClick) =>
        click.kind === 'link'
          ? click
          : { kind: 'select', from: [...click.selection.from], to: [...click.selection.to] };
      expect(plain(own.glyphClick(selection, side, glyph, additive))).toEqual(
        plain(appGestures.glyphClick(selection, side, glyph, additive)),
      );
      const pairs = relationOf(next, 5).pairs;
      expect(own.pairsHolding(pairs, selection)).toEqual(
        appGestures.pairsHolding(pairs, selection),
      );
    }
  });

  it('finds the glyphs no pair takes as the editor does, its draft as it opens', () => {
    const parsed = parseProject(readExample('one-to-many.mfe.json'));
    if (!parsed.ok) throw new Error(parsed.error);
    const project = parsed.project;
    const clip = (id: string) => project.clips.find((c) => c.id === id)!;
    const next = random(13);
    for (const original of project.relations) {
      for (let i = 0; i < 40; i++) {
        const relation = { ...original, ...relationOf(next, 6), id: original.id };
        relation.fromClipId = original.fromClipId;
        relation.toClipId = original.toClipId;
        const draft = initialDraft(relation, clip(relation.fromClipId), clip(relation.toClipId));
        expect(own.unpairedGlyphs(project, relation, 6, 5)).toEqual(
          appUnpaired(project, draft, 6, 5),
        );
      }
    }
  });
});

describe('the drawing of the relation editor in the player', () => {
  it('lays the two formulas out as the editor does', () => {
    const next = random(17);
    for (let i = 0; i < 200; i++) {
      const box = () => {
        const minX = -next() * 4;
        const minY = -next() * 1.5;
        return { minX, minY, maxX: minX + next() * 8, maxY: minY + next() * 3 };
      };
      const a = box();
      const b = box();
      // The text of the two, as the glyphs of a few boxes say it; now and then no glyph at all.
      const glyphs = Array.from({ length: Math.floor(next() * 7) }, box);
      const text = own.textSize(glyphs);
      expect(text).toBe(appTextSize(glyphs));
      expect(own.linkFrame(a, b, text)).toEqual(appLinkFrame(a, b, text));
      expect(own.linkFrame(a, b, text, 'side')).toEqual(appLinkFrame(a, b, text, 'side'));
      expect(own.linkFrame(a, b, text, 'stacked')).toEqual(appLinkFrame(a, b, text));
    }
  });
});
