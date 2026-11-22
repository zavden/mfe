// @vitest-environment node
/* The attach sync (store/attachSync.ts): attached clips are placed beside their targets as soon as
 * the renders are there, without an undo step, and follow every edit of the target. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMockEngine } from '../../test/mockEngine';
import {
  createAttach,
  createBraceAttach,
  createBraceFormula,
  createClip,
  createEmptyProject,
  createEndsTween,
  createFormula,
  createLineFormula,
  createTrack,
  defaultIntro,
  defaultOutro,
  type EndsTween,
  type Project,
} from '../../model';
import { createEvaluator, deriveAttachments } from '../../scene';
import {
  loadProject,
  startAttachSync,
  startRenderSync,
  useProjectStore,
  useRenderStore,
} from '../index';

/** Wait for pending promise callbacks (the mock engine's renders). */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
const project = () => useProjectStore.getState().project;
const undoSteps = () => useProjectStore.temporal.getState().pastStates.length;
const geometryAt = (p: Project, t: number, clipId: string) =>
  createEvaluator(p, useRenderStore.getState().resolved)
    .geometry(t)
    .find((g) => g.clipId === clipId)!;

let stopRender: (() => void) | null = null;
let stopAttach: (() => void) | null = null;

beforeEach(() => {
  loadProject(createEmptyProject());
  useRenderStore.getState().retain([]);
  stopRender = startRenderSync(createMockEngine());
  stopAttach = startAttachSync();
});

afterEach(() => {
  stopAttach?.();
  stopRender?.();
  stopAttach = stopRender = null;
});

/** "a+b" on track 1 over [0, 6) and "x" on track 2 over [3, 5), attached below glyph 2 (b). */
function addScene() {
  const a = createFormula({ name: 'a', source: 'a+b' });
  const x = createFormula({ name: 'x', source: 'x' });
  const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
  const [t1, t2] = project().tracks;
  const ca = createClip(a.id, t1!.id, 0, 6, { ...none });
  const cx = createClip(x.id, t2!.id, 3, 5, {
    ...none,
    attach: createAttach(ca.id, [2], { side: 'down', buff: 0.3 }),
  });
  cx.initial.position = [-4, 3];
  useProjectStore.getState().update((draft) => {
    draft.formulas.push(a, x);
    draft.clips.push(ca, cx);
  });
  return { ca, cx };
}

describe('attach sync', () => {
  it('settles more than eight links synchronously when an already-rendered target moves', async () => {
    const p = createEmptyProject();
    const f = createFormula({ name: 'host', source: 'x' });
    p.formulas.push(f);
    const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
    let previous = createClip(f.id, p.tracks[0]!.id, 0, 6, none);
    p.clips.push(previous);
    for (let i = 0; i < 24; i++) {
      const track = createTrack(`Link ${i}`);
      p.tracks.push(track);
      const next = createClip(f.id, track.id, 0, 6, {
        ...none,
        attach: createAttach(previous.id, 'all', { side: 'right', buff: 0.2 }),
      });
      p.clips.push(next);
      previous = next;
    }
    loadProject(p);
    await settle();
    expect(deriveAttachments(project(), useRenderStore.getState().resolved)).toEqual([]);
    const before = project().clips.at(-1)!.initial.position;
    const steps = undoSteps();
    useProjectStore.getState().update((draft) => {
      draft.clips[0]!.initial.position = [3, 2];
    });
    expect(deriveAttachments(project(), useRenderStore.getState().resolved)).toEqual([]);
    expect(project().clips.at(-1)!.initial.position[0]).toBeCloseTo(before[0] + 3, 9);
    expect(project().clips.at(-1)!.initial.position[1]).toBeCloseTo(before[1] + 2, 9);
    expect(undoSteps()).toBe(steps + 1);
  });

  it('places an attached clip once the renders are there, without an undo step', async () => {
    const { ca, cx } = addScene();
    expect(project().clips[1]!.initial.position).toEqual([-4, 3]); // nothing to measure yet
    await settle();
    const steps = undoSteps();
    const label = geometryAt(project(), 3, cx.id).box;
    const target = geometryAt(project(), 3, ca.id).glyphs.get(2)!;
    expect(label.maxY).toBeCloseTo(target.minY - 0.3, 9);
    expect((label.minX + label.maxX) / 2).toBeCloseTo((target.minX + target.maxX) / 2, 9);
    expect(undoSteps()).toBe(steps);
    // The one undo step is the user's edit; undoing it takes the clips away, placement and all.
    useProjectStore.temporal.getState().undo();
    expect(project().clips).toEqual([]);
  });

  it('follows the target when it moves, and lets go when detached', async () => {
    const { ca, cx } = addScene();
    await settle();
    const before = project().clips[1]!.initial.position;
    useProjectStore.getState().update((draft) => {
      draft.clips[0]!.initial.position = [1, 2];
    });
    const after = project().clips[1]!.initial.position;
    expect(after[0]).toBeCloseTo(before[0] + 1, 9);
    expect(after[1]).toBeCloseTo(before[1] + 2, 9);
    // The target scaled: the label stays below its glyph.
    useProjectStore.getState().update((draft) => {
      draft.clips[0]!.initial.scale = 2;
    });
    const label = geometryAt(project(), 3, cx.id).box;
    const target = geometryAt(project(), 3, ca.id).glyphs.get(2)!;
    expect(label.maxY).toBeCloseTo(target.minY - 0.3, 9);
    // Detached: frozen where it is.
    useProjectStore.getState().update((draft) => {
      draft.clips[1]!.attach = null;
    });
    const frozen = project().clips[1]!.initial.position;
    useProjectStore.getState().update((draft) => {
      draft.clips[0]!.initial.position = [0, 0];
    });
    expect(project().clips[1]!.initial.position).toEqual(frozen);
  });

  it('fits a brace to its target as the renders come, follows it, and lets go when detached', async () => {
    const a = createFormula({ name: 'a', source: 'a+b' });
    const b = createBraceFormula({ name: 'b1' });
    const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
    const [t1, t2] = project().tracks;
    const ca = createClip(a.id, t1!.id, 0, 6, { ...none });
    const cb = createClip(b.id, t2!.id, 2, 5, {
      ...none,
      attach: createBraceAttach(ca.id, [2], { direction: 180, buff: 0.25 }),
    });
    useProjectStore.getState().update((draft) => {
      draft.formulas.push(a, b);
      draft.clips.push(ca, cb);
    });
    await settle(); // a renders: the brace is fitted and placed
    await settle(); // the brace renders at its width
    const steps = undoSteps();
    const width = (project().formulas[1] as { width: number }).width;
    const g = geometryAt(project(), 2, ca.id).glyphs.get(2)!;
    expect(width).toBeCloseTo(g.maxX - g.minX, 9);
    const brace = geometryAt(project(), 2, cb.id).box;
    expect(brace.minY).toBeCloseTo(g.maxY + 0.25, 6);
    expect(brace.maxX - brace.minX).toBeCloseTo(width, 6);
    expect(project().clips[1]!.initial.rotation).toBe(180);
    expect(undoSteps()).toBe(steps);
    // The target scaled: the brace grows with it, re-rendered at the new width.
    useProjectStore.getState().update((draft) => {
      draft.clips[0]!.initial.scale = 2;
    });
    await settle();
    expect((project().formulas[1] as { width: number }).width).toBeCloseTo(width * 2, 9);
    const grown = geometryAt(project(), 2, cb.id).box;
    expect(grown.maxX - grown.minX).toBeCloseTo(width * 2, 6);
    // Detached: frozen where it is, its width kept.
    useProjectStore.getState().update((draft) => {
      draft.clips[1]!.attach = null;
    });
    const frozen = project().clips[1]!.initial;
    useProjectStore.getState().update((draft) => {
      draft.clips[0]!.initial.position = [3, 3];
    });
    await settle();
    expect(project().clips[1]!.initial).toEqual(frozen);
    expect((project().formulas[1] as { width: number }).width).toBeCloseTo(width * 2, 9);
  });

  it('leaves the end a Transform carried a line to where it was drawn once a new render loses its glyphs', async () => {
    // "a+b=c" on the left and "x^2" on the right over [0, 8); an arrow over the same time whose
    // Transform at 1 s carries its ends onto "a+b=c" and onto the "2" of "x^2", at a gap.
    const a = createFormula({ name: 'a', source: 'a+b=c' });
    const b = createFormula({ name: 'b', source: 'x^2' });
    const line = createLineFormula({ name: 'l1', line: 'arrow', vector: [2, 0] });
    const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
    const [t1, t2] = project().tracks;
    const t3 = createTrack('Track 3');
    const ca = createClip(a.id, t1!.id, 0, 8, none);
    ca.initial.position = [-3, 1];
    const cb = createClip(b.id, t2!.id, 0, 8, none);
    cb.initial.position = [3, -1.5];
    const cl = createClip(line.id, t3.id, 0, 8, none);
    cl.initial.position = [0, 3];
    cl.actions.push(
      createEndsTween(1, 1, {
        start: { clipId: ca.id, glyphs: 'all', anchor: 'auto' },
        end: { clipId: cb.id, glyphs: [1], anchor: 'auto' },
        buff: 0.25,
      }),
    );
    useProjectStore.getState().update((draft) => {
      draft.formulas.push(a, b, line);
      draft.tracks.push(t3);
      draft.clips.push(ca, cb, cl);
    });
    const ends = () => (project().clips.find((c) => c.id === cl.id)!.actions[0] as EndsTween).ends;
    await settle();
    const before = ends().drawn!;
    expect(before).not.toBeNull();
    // "x^2" becomes "x": its "2" is gone, and the end with it is free — where it was drawn.
    useProjectStore.getState().update((draft) => {
      draft.formulas.find((f) => f.id === b.id)!.source = 'x';
    });
    await settle();
    expect(ends().end).toEqual({ point: expect.any(Array) });
    const after = ends().drawn!;
    expect(Math.hypot(after.end[0] - before.end[0], after.end[1] - before.end[1])).toBeLessThan(
      1e-6,
    );
    expect(
      Math.hypot(after.start[0] - before.start[0], after.start[1] - before.start[1]),
    ).toBeLessThan(1e-6);
  });

  it('stops after unsubscribe', async () => {
    addScene();
    await settle();
    stopAttach!();
    stopAttach = null;
    const before = project().clips[1]!.initial.position;
    useProjectStore.getState().update((draft) => {
      draft.clips[0]!.initial.position = [1, 2];
    });
    expect(project().clips[1]!.initial.position).toEqual(before);
  });
});
