// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { smallProject } from '../../model/__tests__/fixtures';
import { readExample } from '../../test/examples';
import {
  createAppear,
  createDisappear,
  createPartTransform,
  parseProject,
  type Easing,
} from '../../model';
import { buildEvents, defaultLagRatio, lagWindow, rateFunction } from '../index';

describe('buildEvents', () => {
  it('flattens the hello example', () => {
    const parsed = parseProject(readExample('hello.mfe.json'));
    if (!parsed.ok) throw new Error(parsed.error);
    const events = buildEvents(parsed.project);
    const round = (x: number) => Math.round(x * 1e9) / 1e9;
    expect(events.map((e) => [e.id, round(e.start), round(e.end)])).toEqual([
      ['intro:c_a1', 0, 1],
      ['outro:c_a1', 2, 3],
      ['relation:r_a1_f2', 2, 3],
      ['intro:c_f2', 2, 2],
      ['tween:a_up', 3.2, 3.8],
      ['outro:c_f2', 4, 5],
    ]);
    const byId = new Map(events.map((e) => [e.id, e]));
    // "0" (glyph 5) is the only glyph of a1 not consumed: the outro animates just it.
    expect(byId.get('outro:c_a1')).toMatchObject({ except: [0, 1, 2, 3, 4] });
    // Every glyph of f2 arrives through the relation.
    expect(byId.get('intro:c_f2')).toMatchObject({ except: [0, 1, 2, 3, 4] });
    expect(byId.get('tween:a_up')).toMatchObject({
      from: { position: [0, 0] },
      to: { position: [0, 1.5] },
    });
  });

  it('keeps copied source glyphs for the outro', () => {
    const parsed = parseProject(readExample('one-to-many.mfe.json'));
    if (!parsed.ok) throw new Error(parsed.error);
    const outro = buildEvents(parsed.project).find((e) => e.id === 'outro:c_f1');
    expect(outro).toMatchObject({ except: [] });
  });

  it('emits the actions that animate glyphs, with the glyphs that change state', () => {
    const p = smallProject();
    p.relations = [];
    p.clips = [p.clips[0]!]; // [0, 4]: write [0, 1), fade-out [3, 4)
    const clip = p.clips[0]!;
    p.formulas[0]!.hiddenGlyphs = [4];
    const appear = createAppear(1, 'write', [4], { duration: 0.5 }); // brings 4
    const gone = createDisappear(2, 'fade_out', [1, 2], { duration: 0.5, shift: [0, -1] });
    const noop = createDisappear(2.5, 'uncreate', [1], { duration: 0.25 }); // 1 is gone already
    const part = createPartTransform(1, [0], { shift: [1, 0], color: '#FF0000' });
    clip.actions.push(gone, appear, noop, part);

    const events = buildEvents(p);
    expect(events.map((e) => e.id)).toEqual([
      `intro:${clip.id}`,
      `transform:${part.id}`,
      `appear:${appear.id}`,
      `disappear:${gone.id}`,
      `outro:${clip.id}`,
    ]);
    const byId = new Map(events.map((e) => [e.id, e]));
    expect(byId.get(`intro:${clip.id}`)).toMatchObject({ except: [4] });
    expect(byId.get(`appear:${appear.id}`)).toMatchObject({
      start: 1,
      end: 1.5,
      anim: 'write',
      glyphs: [4],
      easing: 'linear',
    });
    expect(byId.get(`disappear:${gone.id}`)).toMatchObject({
      start: 2,
      end: 2.5,
      anim: 'fade_out',
      glyphs: [1, 2],
      shift: [0, -1],
    });
    expect(byId.get(`transform:${part.id}`)).toMatchObject({
      glyphs: [0],
      shift: [1, 0],
      scale: 1,
      color: '#FF0000',
      opacity: null,
    });
    expect(byId.get(`outro:${clip.id}`)).toMatchObject({ except: [1, 2] });
  });
});

// Reference values computed with ManimCE 0.22.1 and ManimGL 1.7.2 at t = 0.1, 0.25, 0.5, 0.8.
const REFERENCE: Record<'ce' | 'gl', Partial<Record<Easing, number[]>>> = {
  ce: {
    smooth: [0.0114465795, 0.0701037165, 0.5, 0.9587143402],
    rush_into: [0.008704702, 0.0330109122, 0.1402074331, 0.5316131561],
    rush_from: [0.2482415498, 0.5621241486, 0.8597925669, 0.9771068409],
    slow_into: [0.4358898944, 0.6614378278, 0.8660254038, 0.9797958971],
    double_smooth: [0.0206428299, 0.25, 0.5, 0.867096711],
    there_and_back: [0.0412856598, 0.5, 1.0, 0.265806578],
    there_and_back_with_pause: [0.1140365301, 0.9298962835, 1.0, 0.734193422],
  },
  gl: {
    smooth: [0.00856, 0.103515625, 0.5, 0.94208],
    rush_into: [0.00231625, 0.0321044922, 0.20703125, 0.63488],
    rush_from: [0.18625375, 0.4495849609, 0.79296875, 0.98288],
    slow_into: [0.4358898944, 0.6614378278, 0.8660254038, 0.9797958971],
    double_smooth: [0.02896, 0.25, 0.5, 0.84128],
    there_and_back: [0.05792, 0.5, 1.0, 0.31744],
    there_and_back_with_pause: [0.16308, 0.896484375, 1.0, 0.68256],
  },
};

describe('rateFunction', () => {
  for (const target of ['ce', 'gl'] as const) {
    for (const [easing, values] of Object.entries(REFERENCE[target])) {
      it(`${target} ${easing} matches Manim`, () => {
        const f = rateFunction(easing as Easing, target);
        [0.1, 0.25, 0.5, 0.8].forEach((t, i) => expect(f(t)).toBeCloseTo(values![i]!, 8));
      });
    }
  }

  it('clamps input', () => {
    expect(rateFunction('linear', 'ce')(1.5)).toBe(1);
    expect(rateFunction('smooth', 'gl')(-1)).toBe(0);
  });
});

describe('lag ratios', () => {
  it('follows Manim defaults per target', () => {
    expect(defaultLagRatio('write', 6, 'ce')).toBeCloseTo(0.2);
    expect(defaultLagRatio('write', 30, 'ce')).toBeCloseTo(4 / 30);
    expect(defaultLagRatio('write', 30, 'gl')).toBeCloseTo(4 / 31);
    expect(defaultLagRatio('create', 5, 'gl')).toBe(1);
    expect(defaultLagRatio('fade_in', 5, 'ce')).toBe(0);
  });

  it('computes lagged sub-windows', () => {
    expect(lagWindow(0, 1, 0.2)).toEqual([0, 1]);
    const [s, e] = lagWindow(2, 3, 1);
    expect(s).toBeCloseTo(2 / 3);
    expect(e).toBeCloseTo(1);
  });
});
