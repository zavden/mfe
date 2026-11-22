// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createClip, createFormula, defaultClipState, type ClipState } from '../../../model';
import type {
  DisappearEvent,
  IntroEvent,
  OutroEvent,
  PartTransformEvent,
  ResolvedPair,
  TransferEvent,
  TweenEvent,
} from '../../../scene';
import type { ClipCtx, Codegen, FormulaCtx } from '../context';
import { applyEnd, emitInstant, isWhole, mayUseWhole, stateAt } from '../membership';

const formula = createFormula({ name: 'f', source: 'abc', color: '#FFFFFF' });

function clipCtx(
  opts: { positional?: boolean; present?: number[]; gone?: number[]; name?: string } = {},
): ClipCtx {
  const fc: FormulaCtx = {
    formula,
    index: 0,
    count: 3,
    layout: [],
    positional: opts.positional ?? false,
    flat: false,
    fontSize: 48,
    texSetup: null,
    textSignature: null,
  };
  const name = opts.name ?? 'f';
  return {
    clip: createClip(formula.id, 't1', 0, 5),
    formula: fc,
    naming: { name, target: 'ce', indexing: fc.positional ? 'list' : 'literal', count: 3 },
    z: 0,
    present: new Set(opts.present ?? []),
    gone: new Set(opts.gone ?? []),
    partColor: new Map(),
    partOpacity: new Map(),
    partsMoved: false,
  };
}

/** A context with only what membership reads. */
function gen(fields: Partial<Codegen> = {}): Codegen {
  return { body: [], settled: new Map(), ...fields } as Codegen;
}

const base = { id: 'e', start: 1, end: 2, easing: 'smooth' as const };
const intro = (clipId: string): IntroEvent => ({
  ...base,
  kind: 'intro',
  clipId,
  anim: 'none',
  except: [],
  lagRatio: null,
  shift: [0, 0],
  scale: 1,
});
const outro = (clipId: string): OutroEvent => ({ ...intro(clipId), kind: 'outro', anim: 'none' });
const disappear = (clipId: string, glyphs: number[]): DisappearEvent => ({
  ...base,
  kind: 'disappear',
  clipId,
  actionId: 'a1',
  anim: 'fade_out',
  glyphs,
  lagRatio: null,
  shift: [0, 0],
  scale: 1,
});
const tween = (clipId: string, from: ClipState, to: ClipState): TweenEvent => ({
  ...base,
  kind: 'tween',
  clipId,
  actionId: 'a1',
  from,
  to,
});
const transform = (
  clipId: string,
  glyphs: number[],
  fields: Partial<PartTransformEvent> = {},
): PartTransformEvent => ({
  ...base,
  kind: 'transform',
  clipId,
  actionId: 'a1',
  glyphs,
  shift: [0, 0],
  scale: 1,
  rotation: 0,
  color: null,
  opacity: null,
  ...fields,
});
const transfer = (fromClipId: string, toClipId: string, pairs: ResolvedPair[]): TransferEvent => ({
  ...base,
  kind: 'transfer',
  key: 'k',
  origin: { kind: 'relation', relationId: 'r1' },
  fromClipId,
  toClipId,
  pathArc: 0,
  pairs,
});

describe('isWhole', () => {
  it('needs every glyph, none gone for good, and the presence the moment calls for', () => {
    const shown = clipCtx({ present: [0, 1, 2] });
    expect(isWhole(shown, [0, 1, 2], 'present')).toBe(true);
    expect(isWhole(shown, [2, 0, 1], 'present')).toBe(true);
    expect(isWhole(shown, [0, 1], 'present')).toBe(false);
    expect(isWhole(shown, [0, 1, 2], 'intro')).toBe(false);

    const empty = clipCtx();
    expect(isWhole(empty, [0, 1, 2], 'intro')).toBe(true);
    expect(isWhole(empty, [0, 1, 2], 'present')).toBe(false);

    const consumed = clipCtx({ present: [0, 1], gone: [2] });
    expect(isWhole(consumed, [0, 1, 2], 'present')).toBe(false);
    expect(isWhole(consumed, [0, 1, 2], 'intro')).toBe(false);
  });
});

describe('mayUseWhole', () => {
  it('always with literal indices; matched by position, only without a stagger', () => {
    const literal = clipCtx();
    expect(mayUseWhole(literal, 'write', null)).toBe(true);
    expect(mayUseWhole(literal, 'fade_in', 0.5)).toBe(true);

    const positional = clipCtx({ positional: true });
    expect(mayUseWhole(positional, 'write', null)).toBe(false);
    expect(mayUseWhole(positional, 'uncreate', null)).toBe(false);
    expect(mayUseWhole(positional, 'write', 0)).toBe(true);
    expect(mayUseWhole(positional, 'fade_in', null)).toBe(true);
    expect(mayUseWhole(positional, 'fade_in', 0.1)).toBe(false);
  });
});

describe('stateAt', () => {
  it('is the state left by the latest tween that has ended, else the initial one', () => {
    const ctx = clipCtx();
    const a: ClipState = { ...defaultClipState(), scale: 2 };
    const b: ClipState = { ...defaultClipState(), scale: 3 };
    const g = gen({
      settled: new Map([
        [
          ctx.clip.id,
          [
            { end: 2, state: a },
            { end: 4, state: b },
          ],
        ],
      ]),
    });
    expect(stateAt(g, ctx, 1)).toBe(ctx.clip.initial);
    expect(stateAt(g, ctx, 2)).toBe(a);
    expect(stateAt(g, ctx, 3.5)).toBe(a);
    expect(stateAt(g, ctx, 4)).toBe(b);
    expect(stateAt(gen(), ctx, 9)).toBe(ctx.clip.initial);
  });
});

describe('applyEnd', () => {
  it('an intro leaves the ledger alone: its glyphs enter when the animation is made', () => {
    const clip = clipCtx({ present: [0] });
    applyEnd({ kind: 'intro', event: intro(clip.clip.id), clip, glyphs: [0, 1, 2] });
    expect([...clip.present]).toEqual([0]);
    expect(clip.gone.size).toBe(0);
  });

  it('an outro and the clip end take the glyphs out for good', () => {
    const clip = clipCtx({ present: [0, 1, 2] });
    applyEnd({ kind: 'outro', event: outro(clip.clip.id), clip, glyphs: [0, 1] });
    expect([...clip.present]).toEqual([2]);
    expect([...clip.gone]).toEqual([0, 1]);
    applyEnd({ kind: 'leave', event: { start: 5, end: 5 }, clip, glyphs: [2] });
    expect(clip.present.size).toBe(0);
    expect([...clip.gone]).toEqual([0, 1, 2]);
  });

  it('a disappear block: only the glyphs that never come back are gone', () => {
    const clip = clipCtx({ present: [0, 1, 2] });
    applyEnd({
      kind: 'disappear',
      event: disappear(clip.clip.id, [0, 1]),
      clip,
      glyphs: [0, 1],
      back: new Set([1]),
    });
    expect([...clip.present]).toEqual([2]);
    expect([...clip.gone]).toEqual([0]);
  });

  it('a tween takes over the part overrides of the channels it changes', () => {
    const clip = clipCtx({ present: [0, 1, 2] });
    clip.partColor.set(0, '#FF0000');
    clip.partColor.set(1, '#FF0000');
    clip.partOpacity.set(0, 0.5);
    clip.partOpacity.set(2, 0.5);
    const from = defaultClipState();
    const recoloured: ClipState = { ...from, glyphColors: { '1': '#00FF00' } };
    applyEnd({ kind: 'tween', event: tween(clip.clip.id, from, recoloured), clip });
    expect([...clip.partColor.keys()]).toEqual([0]);
    expect([...clip.partOpacity.keys()]).toEqual([0, 2]);

    const dimmed: ClipState = { ...recoloured, opacity: 0.2 };
    applyEnd({ kind: 'tween', event: tween(clip.clip.id, recoloured, dimmed), clip });
    expect([...clip.partColor.keys()]).toEqual([0]);
    expect(clip.partOpacity.size).toBe(0);
  });

  it('a part transform leaves its colour, opacity and moves on the glyphs still there', () => {
    const clip = clipCtx({ present: [0, 1], gone: [2] });
    const recolour = transform(clip.clip.id, [0, 2], { color: '#FF0000', opacity: 0.5 });
    applyEnd({ kind: 'transform', event: recolour, clip, glyphs: [0, 2] });
    expect([...clip.partColor]).toEqual([[0, '#FF0000']]);
    expect([...clip.partOpacity]).toEqual([[0, 0.5]]);
    expect(clip.partsMoved).toBe(false);

    const move = transform(clip.clip.id, [1], { shift: [1, 0] });
    applyEnd({ kind: 'transform', event: move, clip, glyphs: [1] });
    expect(clip.partsMoved).toBe(true);
    expect(clip.partColor.size).toBe(1);
  });

  it('a part transform that comes back where it started leaves nothing', () => {
    const clip = clipCtx({ present: [0, 1, 2] });
    const bounce = transform(clip.clip.id, [0], {
      color: '#FF0000',
      scale: 2,
      easing: 'there_and_back',
    });
    applyEnd({ kind: 'transform', event: bounce, clip, glyphs: [0] });
    expect(clip.partColor.size).toBe(0);
    expect(clip.partsMoved).toBe(false);
  });

  it('a transfer: the targets arrive; consumed sources are gone, copied ones stay', () => {
    const from = clipCtx({ present: [0, 1, 2], name: 'a' });
    const to = clipCtx({ name: 'b' });
    const pairs: ResolvedPair[] = [
      { from: [0], to: [0], style: 'transform', extras: 'separate', path: null, routes: [] },
      { from: [1], to: [1], style: 'copy', extras: 'separate', path: null, routes: [] },
    ];
    const event = transfer(from.clip.id, to.clip.id, pairs);
    applyEnd({ kind: 'transfer', event, from, to, pairs });
    expect([...to.present]).toEqual([0, 1]);
    expect([...from.present]).toEqual([1, 2]);
    expect([...from.gone]).toEqual([0]);
  });

  it('several sources onto one target with copies: the lowest is consumed, the rest copied', () => {
    const from = clipCtx({ present: [0, 1, 2], name: 'a' });
    const to = clipCtx({ name: 'b' });
    const pairs: ResolvedPair[] = [
      { from: [2, 0], to: [1], style: 'transform', extras: 'copies', path: null, routes: [] },
    ];
    const event = transfer(from.clip.id, to.clip.id, pairs);
    applyEnd({ kind: 'transfer', event, from, to, pairs });
    expect([...from.present]).toEqual([1, 2]);
    expect([...from.gone]).toEqual([0]);
    expect([...to.present]).toEqual([1]);
  });
});

describe('emitInstant', () => {
  it('adds the whole formula, or its glyphs, and marks them present', () => {
    const g = gen();
    const whole = clipCtx();
    emitInstant(g, { kind: 'intro', event: intro(whole.clip.id), clip: whole, glyphs: [0, 1, 2] });
    expect(g.body).toEqual(['self.add(f)']);
    expect([...whole.present]).toEqual([0, 1, 2]);

    const part = clipCtx();
    emitInstant(g, { kind: 'intro', event: intro(part.clip.id), clip: part, glyphs: [0, 2] });
    expect(g.body[1]).toBe('self.add(f[0][0], f[0][2])');
    expect([...part.present]).toEqual([0, 2]);
  });

  it('removes only what is on screen, and nothing when nothing is', () => {
    const g = gen();
    const clip = clipCtx({ present: [0, 1] });
    emitInstant(g, { kind: 'outro', event: outro(clip.clip.id), clip, glyphs: [1, 2] });
    expect(g.body).toEqual(['self.remove(f[0][1])']);
    expect([...clip.present]).toEqual([0]);
    expect([...clip.gone]).toEqual([1]);
    emitInstant(g, { kind: 'leave', event: { start: 5, end: 5 }, clip, glyphs: [2] });
    expect(g.body).toHaveLength(1);

    const shown = clipCtx({ present: [0, 1, 2] });
    emitInstant(g, { kind: 'outro', event: outro(shown.clip.id), clip: shown, glyphs: [0, 1, 2] });
    expect(g.body[1]).toBe('self.remove(f)');
    expect(shown.present.size).toBe(0);
  });

  it('ignores what is not instant', () => {
    const g = gen();
    const clip = clipCtx({ present: [0, 1, 2] });
    const from = defaultClipState();
    const event = tween(clip.clip.id, from, { ...from, scale: 2 });
    emitInstant(g, { kind: 'tween', event, clip });
    expect(g.body).toEqual([]);
  });
});
