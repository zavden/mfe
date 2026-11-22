// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { planSteps, snapEvents, snapFrame, type Timed } from '../timeline';

const timed = (name: string, f0: number, f1: number): Timed<string> => ({ event: name, f0, f1 });

describe('frame grid', () => {
  it('snaps to the nearest frame and keeps animations at least one frame long', () => {
    expect(snapFrame(1, 60)).toBe(60);
    expect(snapFrame(0.3333333, 30)).toBe(10);
    expect(snapFrame(1 / 3, 60)).toBe(20);
    const events = [
      { start: 0.008, end: 0.79, id: 'a' },
      { start: 1, end: 1.004, id: 'b' },
      { start: 2, end: 2, id: 'c' },
    ];
    const { items, moved, maxShift } = snapEvents(events, 25, (e) => e.start === e.end);
    expect(items.map((i) => [i.f0, i.f1])).toEqual([
      [0, 20],
      [25, 26],
      [50, 50],
    ]);
    expect(moved.map((e) => e.id)).toEqual(['b']);
    expect(maxShift).toBeCloseTo(0.036, 6);
  });
});

describe('slices', () => {
  it('plays events that run alone as they are, with waits in between', () => {
    const steps = planSteps([timed('write', 0, 30), timed('fade', 60, 90)], 120);
    expect(steps.map((s) => s.kind)).toEqual(['play', 'wait', 'play', 'wait']);
    const first = steps[0]!;
    expect(first.kind === 'play' && first.parts.map((p) => p.whole)).toEqual([true]);
    expect(steps[3]).toEqual({ kind: 'wait', f0: 90, f1: 120 });
  });

  it('plays events with the same interval together, still whole', () => {
    const steps = planSteps([timed('a', 0, 30), timed('b', 0, 30)], 30);
    expect(steps).toHaveLength(1);
    const step = steps[0]!;
    expect(step.kind === 'play' && step.parts.every((p) => p.whole)).toBe(true);
  });

  it('cuts overlapping events into parts at every boundary', () => {
    const steps = planSteps([timed('a', 0, 30), timed('b', 15, 45)], 45);
    expect(
      steps.map((s) =>
        s.kind === 'play'
          ? [s.f0, s.f1, s.parts.map((p) => `${p.item.event} ${p.from}/${p.to}`)]
          : s.kind,
      ),
    ).toEqual([
      [0, 15, ['a 0/15']],
      [15, 30, ['a 15/30', 'b 0/15']],
      [30, 45, ['b 15/30']],
    ]);
    const middle = steps[1]!;
    expect(middle.kind === 'play' && middle.parts.map((p) => [p.first, p.last])).toEqual([
      [false, true],
      [true, false],
    ]);
  });

  it('puts instantaneous events at their frame, cutting what runs over it', () => {
    const steps = planSteps([timed('long', 0, 30), timed('pop', 10, 10), timed('end', 30, 30)], 30);
    expect(steps.map((s) => s.kind)).toEqual(['play', 'instant', 'play']);
    const instant = steps[1]!;
    expect(instant.kind === 'instant' && instant.frame).toBe(10);
  });

  it('ends at the last frame', () => {
    const steps = planSteps([timed('long', 0, 90), timed('late', 100, 120)], 60);
    expect(steps).toHaveLength(1);
    const step = steps[0]!;
    expect(step.kind === 'play' && [step.f1, step.parts[0]!.to, step.parts[0]!.last]).toEqual([
      60,
      60,
      false,
    ]);
    expect(planSteps([], 0)).toEqual([]);
  });
});

describe('an event that starts before the scene does', () => {
  it('is taken from frame 0, where the scene starts, and said to have moved', () => {
    const events = [
      { start: -0.066667, end: 0.933333, id: 'window' },
      { start: -2, end: -1, id: 'gone' },
      { start: -0.5, end: -0.5, id: 'instant' },
    ];
    const { items, moved } = snapEvents(events, 30, (e) => e.start === e.end);
    expect(items.map((i) => [i.f0, i.f1])).toEqual([
      [0, 28],
      [0, 1],
      [0, 0],
    ]);
    expect(moved.map((e) => e.id)).toEqual(['window', 'gone', 'instant']);
  });

  it('has a first part in the steps, as every animation the code writes has', () => {
    const { items } = snapEvents([{ start: -0.066667, end: 0.933333 }], 30, () => false);
    const steps = planSteps(items, 60);
    const play = steps.find((step) => step.kind === 'play');
    expect(play?.kind === 'play' && play.parts.map((part) => [part.first, part.whole])).toEqual([
      [true, true],
    ]);
  });
});
