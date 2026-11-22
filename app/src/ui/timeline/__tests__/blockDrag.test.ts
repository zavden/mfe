// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createAppear,
  createDisappear,
  createMorph,
  createPartTransform,
  createTween,
} from '../../../model';
import { oneClipScene } from '../../animations/__tests__/fixtures';
import { parallelWith } from '../../animations/parallel';
import { describeBlock, parallelText, stoppedShort, stopReason } from '../blockDrag';

describe('describeBlock', () => {
  it('names the animation and its glyphs as runs', () => {
    expect(describeBlock(createAppear(0, 'write', [7, 8, 9, 10, 20, 21, 22, 23]))).toBe(
      'Write · 7–10, 20–23',
    );
    expect(describeBlock(createDisappear(0, 'fade_out', [3]))).toBe('FadeOut · 3');
    expect(describeBlock(createAppear(0, 'create', 'all'))).toBe('Create · all glyphs');
    expect(describeBlock(createPartTransform(0, [1, 2]))).toBe('Transform · 1–2');
    expect(describeBlock(createTween(0, 1, {}))).toBe('Transform · all glyphs');
    expect(describeBlock(createMorph(0, { pairs: [{ from: [0], to: [1], style: null }] }))).toBe(
      'Morph · 1 pair',
    );
  });
});

describe('parallelWith', () => {
  it('lists the blocks of the clip that overlap in time, not those that only touch', () => {
    const a = createAppear(1, 'write', [0], { duration: 2 }); // [1, 3)
    const b = createDisappear(2, 'fade_out', [1], { duration: 2 }); // [2, 4)
    const c = createAppear(3, 'create', [2], { duration: 1 }); // [3, 4): touches a
    const { clip } = oneClipScene({ glyphs: 3, start: 0, end: 10, actions: [a, b, c] });
    expect(parallelWith(clip, a).map((x) => x.id)).toEqual([b.id]);
    expect(parallelWith(clip, b).map((x) => x.id)).toEqual([a.id, c.id]);
    expect(parallelText(clip, b)).toBe('in parallel with Write · 0 and Create · 2');
    expect(parallelText(clip, c)).toBe('in parallel with FadeOut · 1');
    const { clip: alone } = oneClipScene({ glyphs: 3, start: 0, end: 10, actions: [a] });
    expect(parallelText(alone, a)).toBeNull();
  });
});

describe('stoppedShort', () => {
  it('compares the edge the gesture moves', () => {
    const got = { start: 2, duration: 1 };
    expect(stoppedShort(got, { start: 2, end: 3 }, 'move')).toBe(false);
    expect(stoppedShort(got, { start: 2.5, end: 3.5 }, 'move')).toBe(true);
    expect(stoppedShort(got, { start: 1.5, end: 3 }, 'start')).toBe(true);
    expect(stoppedShort(got, { start: 2, end: 3.5 }, 'end')).toBe(true);
    expect(stoppedShort(got, { start: 2, end: 3 }, 'end')).toBe(false);
  });
});

describe('stopReason', () => {
  it("is the planner's sentence for the block where the pointer asked it to be", () => {
    // Write of glyph 1 at [2, 3); FadeOut of the same glyph at [5, 6): asked to sit at 5, the
    // Write would run with the FadeOut.
    const write = createAppear(2, 'write', [1], { duration: 1 });
    const fade = createDisappear(5, 'fade_out', [1], { duration: 1 });
    const { project, clip } = oneClipScene({
      glyphs: 3,
      start: 0,
      end: 10,
      actions: [write, fade],
    });
    const got = { start: 4, duration: 1 }; // where the planner leaves it: before the FadeOut
    expect(stopReason(project, clip, write.id, { start: 5, end: 6 }, got, 'move')).toBe(
      'The FadeOut block at 5.00 s animates glyph 1 “1” at the same time.',
    );
    expect(stopReason(project, clip, write.id, { start: 9.5, end: 10.5 }, got, 'move')).toBe(
      'A block stays inside its clip.',
    );
    expect(
      stopReason(
        project,
        clip,
        write.id,
        { start: 2, end: 2.01 },
        { start: 2, duration: 0.05 },
        'end',
      ),
    ).toBe('A block lasts at least 0.05 s.');
  });

  it('names what the block cannot pass when the position asked for is fine in itself', () => {
    // Asked to sit after the FadeOut, at [7, 8): fine there, but the Write cannot jump over the
    // FadeOut of its glyph, so the planner leaves it at [4, 5) — the FadeOut is the reason.
    const write = createAppear(2, 'write', [1], { duration: 1 });
    const fade = createDisappear(5, 'fade_out', [1], { duration: 1 });
    const { project, clip } = oneClipScene({
      glyphs: 3,
      start: 0,
      end: 10,
      actions: [write, fade],
    });
    const got = { start: 4, duration: 1 };
    expect(stopReason(project, clip, write.id, { start: 7, end: 8 }, got, 'move')).toBe(
      'The FadeOut block at 5.00 s animates glyph 1 “1” at the same time.',
    );
    expect(stopReason(project, clip, write.id, { start: 2, end: 8 }, got, 'end')).toBe(
      'The FadeOut block at 5.00 s animates glyph 1 “1” at the same time.',
    );
  });
});
