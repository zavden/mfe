// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  FORMAT_VERSION,
  createRelation,
  glyphTransfers,
  padFamily,
  pairRoutes,
  parseProject,
  prunePairRoutes,
  remapGlyphRefs,
  remapPairRoutes,
  routePath,
  serializeProject,
  validateProject,
  type GlyphPair,
  type PathSpline,
  type RelationStyle,
} from '../index';
import { smallProject } from './fixtures';

/* The routes of a pair (D167): which source glyph goes to which target glyph, and the path of
 * its own a route can have. */

const curve = (v: number): PathSpline => ({
  nodes: [
    { at: [0, 0], in: null, out: [0.3, v], smooth: false },
    { at: [1, 0], in: [0.7, v], out: null, smooth: false },
  ],
});
const routes = (pair: Partial<GlyphPair>, style: RelationStyle = 'transform') =>
  pairRoutes({ from: [], to: [], ...pair }, style).map((r) => `${r.from}>${r.to}`);

describe('pairRoutes', () => {
  it('onto one target, every source goes to it, however they arrive', () => {
    for (const extras of [undefined, 'separate', 'merge', 'copies'] as const) {
      expect(routes({ from: [4, 1, 2], to: [7], extras })).toEqual(['4>7', '1>7', '2>7']);
    }
    expect(routes({ from: [3], to: [5] })).toEqual(['3>5']);
    expect(routes({ from: [3], to: [5] }, 'copy')).toEqual(['3>5']);
  });

  it('out of one source, it goes to every target', () => {
    expect(routes({ from: [0], to: [2, 5, 3] })).toEqual(['0>2', '0>5', '0>3']);
  });

  it('several onto several: as Manim aligns the two groups', () => {
    // As many on both sides: glyph i to glyph i, in the order the pair holds them.
    expect(routes({ from: [0, 1, 2], to: [7, 5, 6] })).toEqual(['0>7', '1>5', '2>6']);
    // Fewer sources: some cover two targets (`padFamily`: the first, here).
    expect(padFamily(2, 1).map((e) => e.index)).toEqual([0, 0, 1]);
    expect(routes({ from: [0, 1], to: [5, 6, 7] })).toEqual(['0>5', '0>6', '1>7']);
    // Fewer targets: some take two sources.
    expect(routes({ from: [0, 1, 2], to: [5, 6] })).toEqual(['0>5', '1>5', '2>6']);
    expect(routes({ from: [0, 1, 2, 3], to: [5, 6] })).toEqual(['0>5', '1>5', '2>6', '3>6']);
  });

  it('a fade has routes only where each source plays on its own onto the one target', () => {
    expect(routes({ from: [3], to: [5] }, 'fade')).toEqual(['3>5']);
    expect(routes({ from: [1, 2], to: [5] }, 'fade')).toEqual(['1>5', '2>5']); // separate
    expect(routes({ from: [1, 2], to: [5], extras: 'copies' }, 'fade')).toEqual(['1>5', '2>5']);
    // Groups cross-fade whole: no glyph of them goes to a glyph.
    expect(routes({ from: [1, 2], to: [5], extras: 'merge' }, 'fade')).toEqual([]);
    expect(routes({ from: [1], to: [5, 6] }, 'fade')).toEqual([]);
    expect(routes({ from: [1, 2], to: [5, 6] }, 'fade')).toEqual([]);
  });

  it('none for a pair that plays nothing, and a glyph named twice is one glyph', () => {
    expect(routes({ from: [], to: [1] })).toEqual([]);
    expect(routes({ from: [1], to: [] })).toEqual([]);
    expect(routes({ from: [1, 2], to: [5], extras: 'copies', principal: null })).toEqual([]);
    expect(routes({ from: [1, 1, 2], to: [5, 5] })).toEqual(['1>5', '2>5']);
  });
});

describe('the path of a route', () => {
  const own = curve(0.5);
  const common = curve(-0.2);

  it('is its own, else the pair’s, else none (the arc)', () => {
    const pair = { path: common, routes: [{ from: 1, to: 5, path: own }] };
    expect(routePath(pair, 1, 5)).toBe(own);
    expect(routePath(pair, 2, 5)).toBe(common);
    expect(routePath({ routes: pair.routes }, 2, 5)).toBeNull();
    expect(routePath({}, 1, 5)).toBeNull();
    expect(routePath({ path: null, routes: [] }, 1, 5)).toBeNull();
  });

  it('reaches the transfers, and a pair that plays nothing has none', () => {
    const p = smallProject();
    const r = p.relations[0]!;
    r.pairs = [
      { from: [0, 1], to: [3], style: null, path: common, routes: [{ from: 1, to: 3, path: own }] },
      { from: [2], to: [2], style: null },
    ];
    const [transfer] = glyphTransfers(p);
    expect(transfer!.pairs.map((pair) => pair.routes)).toEqual([
      [{ from: 1, to: 3, path: own }],
      [],
    ]);
    expect(validateProject(p).filter((i) => i.severity === 'error')).toEqual([]);
    r.pairs[0] = { ...r.pairs[0]!, extras: 'copies', principal: null };
    expect(glyphTransfers(p)[0]!.pairs[0]!.routes).toEqual([]);
  });

  it('must run from its source glyph to its target, as the path of a pair', () => {
    const p = smallProject();
    const off: PathSpline = {
      nodes: [
        { at: [0.1, 0], in: null, out: null, smooth: false },
        { at: [1, 0], in: null, out: null, smooth: false },
      ],
    };
    p.relations[0]!.pairs = [
      {
        from: [0, 1],
        to: [3],
        style: null,
        routes: [
          { from: 0, to: 3, path: own },
          { from: 1, to: 3, path: off },
        ],
      },
    ];
    const issues = validateProject(p).filter((i) => i.code === 'pair-path');
    expect(issues.map((i) => [i.severity, i.path])).toEqual([
      ['error', ['relations', 0, 'pairs', 0, 'routes', 1, 'path']],
    ]);
    expect(issues[0]!.message).toMatch(/path of a route of a pair must start at its source glyph/);
  });

  it('is kept by a file of the format, and a file of the format before has none', () => {
    const p = smallProject();
    p.relations[0]!.pairs = [
      { from: [0, 1], to: [3], style: null, routes: [{ from: 1, to: 3, path: own }] },
    ];
    const saved = serializeProject(p);
    const loaded = parseProject(saved);
    expect(loaded.ok && loaded.project.relations[0]!.pairs[0]!.routes).toEqual([
      { from: 1, to: 3, path: own },
    ]);
    expect(loaded.ok && loaded.migratedFrom).toBeNull();
    // Format 31 had neither routes nor pairs that share their targets: a valid file of 32.
    const before = JSON.parse(serializeProject(smallProject())) as { version: number };
    before.version = 31;
    const migrated = parseProject(JSON.stringify(before));
    expect(migrated.ok && migrated.migratedFrom).toBe(31);
    expect(migrated.ok && migrated.project.version).toBe(FORMAT_VERSION);
    // A route without a path is no route.
    const broken = JSON.parse(saved) as { relations: { pairs: { routes: unknown[] }[] }[] };
    broken.relations[0]!.pairs[0]!.routes = [{ from: 1, to: 3 }];
    expect(parseProject(JSON.stringify(broken)).ok).toBe(false);
  });
});

describe('routes through the edits of a pair', () => {
  const a = curve(0.1);
  const b = curve(0.2);
  const c = curve(0.3);

  it('prunePairRoutes drops the routes of glyphs the pair no longer holds, and repeats', () => {
    const pair: GlyphPair = {
      from: [0, 1],
      to: [3],
      style: null,
      routes: [
        { from: 0, to: 3, path: a },
        { from: 2, to: 3, path: b }, // glyph 2 is not a source
        { from: 0, to: 3, path: c }, // the route again
        { from: 1, to: 4, path: c }, // glyph 4 is not a target
      ],
    };
    expect(prunePairRoutes(pair).routes).toEqual([{ from: 0, to: 3, path: a }]);
    // Nothing to drop: the same pair. Nothing left: no field.
    const clean: GlyphPair = {
      from: [0, 1],
      to: [3],
      style: null,
      routes: [{ from: 0, to: 3, path: a }],
    };
    expect(prunePairRoutes(clean)).toBe(clean);
    const bare: GlyphPair = { from: [0], to: [3], style: null };
    expect(prunePairRoutes(bare)).toBe(bare);
    expect('routes' in prunePairRoutes({ ...clean, from: [1, 2] })).toBe(false);
  });

  it('a pair left with one route takes that route’s path as its own', () => {
    // Two sources onto one target, each on its path; then one source goes.
    const pair: GlyphPair = {
      from: [1],
      to: [3],
      style: null,
      path: c,
      routes: [
        { from: 0, to: 3, path: a },
        { from: 1, to: 3, path: b },
      ],
    };
    // What played for 1 → 3 was its own path: it is the pair's now, and no route is left.
    expect(prunePairRoutes(pair)).toEqual({ from: [1], to: [3], style: null, path: b });
    // Without a path of its own, the route followed the pair's: nothing to take.
    expect(prunePairRoutes({ ...pair, routes: [{ from: 0, to: 3, path: a }] })).toEqual({
      from: [1],
      to: [3],
      style: null,
      path: c,
    });
  });

  it('remapPairRoutes takes one side through a renumbering', () => {
    const list = [
      { from: 0, to: 3, path: a },
      { from: 1, to: 3, path: b },
    ];
    expect(remapPairRoutes(list, 'from', [1, null])).toEqual([{ from: 1, to: 3, path: a }]);
    expect(remapPairRoutes(list, 'to', [0, 1, 2, 0])).toEqual([
      { from: 0, to: 0, path: a },
      { from: 1, to: 0, path: b },
    ]);
  });

  it('a re-rendered formula renumbers the routes with its glyphs', () => {
    const p = smallProject(); // a (5 glyphs) → b (4 glyphs)
    const r = createRelation(p.clips[0]!.id, p.clips[1]!.id, {
      pairs: [
        {
          from: [0, 2, 4],
          to: [3],
          style: null,
          routes: [
            { from: 0, to: 3, path: a },
            { from: 2, to: 3, path: b },
          ],
        },
      ],
    });
    p.relations = [r];
    // The source formula: glyphs 0 and 2 swap places… then glyph 0 is gone, with its route.
    remapGlyphRefs(p, p.formulas[0]!.id, [2, 1, 0, 3, 4]);
    expect(r.pairs[0]!.routes).toEqual([
      { from: 2, to: 3, path: a },
      { from: 0, to: 3, path: b },
    ]);
    remapGlyphRefs(p, p.formulas[0]!.id, [null, 1, 2, 3, 4]);
    expect(r.pairs[0]).toMatchObject({ from: [2, 4], routes: [{ from: 2, to: 3, path: a }] });
    // The target formula: its glyph 3 becomes 0.
    remapGlyphRefs(p, p.formulas[1]!.id, [1, 2, 3, 0]);
    expect(r.pairs[0]!.routes).toEqual([{ from: 2, to: 0, path: a }]);
    // One source is left: its route is the pair itself, and its path the pair's.
    remapGlyphRefs(p, p.formulas[0]!.id, [0, 1, 2, 3, null]);
    expect(r.pairs[0]).toEqual({ from: [2], to: [0], style: null, path: a });
  });
});
