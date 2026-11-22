// @vitest-environment node
/* A line whose ends are on glyphs (`rule: 'ends'`, D137), through the attach sync: the object's
 * vector and the clip's position come from where the glyphs are when the line's clip starts, by
 * the library's own rule (`scene/lines.ts`, held to both libraries in lines.test.ts). Here, that
 * the sync measures the right glyphs at the right instant and writes what it finds. */
import { describe, expect, it } from 'vitest';
import { refreshLocalRenders } from '../../engine';
import {
  createClip,
  createEndsAttach,
  createLineFormula,
  createTrack,
  createTween,
  defaultIntro,
  defaultOutro,
  type Clip,
  type LineEndSpec,
  type LineFormula,
  type LineKind,
  type Target,
} from '../../model';
import { deriveAttachments, settleScene } from '../attach';
import { exportEvaluator } from '../evaluator';
import { buffedEnds, lineEndInput, lineEndsAt, manimLineEnds, type LineEndInput } from '../lines';
import { criticalPoint } from '../measure';
import { plainClip, sceneWith } from './sceneKit';

const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };

/** "a+b=c" up on the left and "x^2" down on the right, larger, both over [0, 6); a line of `kind`
 * over [2, 6) between `start` and `end` at `buff`, settled. */
async function settled(
  target: Target,
  kind: LineKind,
  ends: (a: Clip, b: Clip) => [LineEndSpec, LineEndSpec],
  buff: number,
  prepare: (a: Clip, b: Clip) => void = () => {},
) {
  const scene = await sceneWith({ a: 'a+b=c', b: 'x^2' }, target);
  const a = plainClip(scene, 'a', 0, 0, 6);
  a.initial.position = [-3, 1];
  const b = plainClip(scene, 'b', 1, 0, 6);
  b.initial.position = [3, -1.5];
  b.initial.scale = 1.5;
  prepare(a, b);
  const formula = createLineFormula({ name: 'l1', line: kind });
  scene.project.formulas.push(formula);
  const track = createTrack('Track of the line');
  scene.project.tracks.unshift(track);
  const [start, end] = ends(a, b);
  const clip = createClip(formula.id, track.id, 2, 6, {
    ...none,
    attach: createEndsAttach(start, end, buff),
  });
  scene.project.clips.push(clip);
  const result = settleScene(scene.project, scene.formulas, refreshLocalRenders);
  const line = result.project.formulas.find((f) => f.id === formula.id) as LineFormula;
  const placed = result.project.clips.find((c) => c.id === clip.id)!;
  // What Manim would draw, from the glyphs as the settled scene has them when the line starts.
  const evaluator = exportEvaluator(result.project, result.formulas);
  const input = (side: LineEndSpec): LineEndInput =>
    lineEndInput(
      evaluator,
      target,
      'point' in side ? side : { ...side, anchor: side.anchor ?? 'auto' },
      2,
    )!;
  const expected = () => buffedEnds(target, manimLineEnds(target, input(start), input(end))!, buff);
  /** The point `direction` of the box of glyphs of a clip when the line starts, as
   * `get_critical_point` reads it. */
  const corner = (clipId: string, glyphs: number[] | 'all', direction: [number, number]) =>
    criticalPoint(evaluator.measure(clipId, glyphs, 2)!, direction);
  return { result, line, placed, expected, corner, a, b };
}

const close = (have: readonly number[], want: readonly number[]) =>
  have.forEach((v, i) => expect(v).toBeCloseTo(want[i]!, 9));

describe.each(['ce', 'gl'] as const)('a line with ends on glyphs (%s)', (target) => {
  it('runs between the glyphs of two clips, at its gap, as the library finds their edges', async () => {
    const { result, line, placed, ...found } = await settled(
      target,
      'arrow',
      (a, b) => [
        { clipId: a.id, glyphs: [0, 1] },
        { clipId: b.id, glyphs: 'all' },
      ],
      0.25,
    );
    const expected = found.expected();
    expect(result.readiness).toEqual({ ready: true, pending: [] });
    expect(deriveAttachments(result.project, result.formulas)).toEqual([]);
    const drawn = lineEndsAt(target, line, placed.initial);
    close(drawn.start, expected.start);
    close(drawn.end, expected.end);
    close(line.vector, [expected.end[0] - expected.start[0], expected.end[1] - expected.start[1]]);
    // From the left formula down to the right one, shorter than between their centres.
    expect(line.vector[0]).toBeGreaterThan(3);
    expect(line.vector[1]).toBeLessThan(-1);
    expect(Math.hypot(...line.vector)).toBeLessThan(Math.hypot(6, 2.5) - 0.5);
    expect(placed.initial.rotation).toBe(0);
    // The render follows: a shaft and a tip, about the origin.
    const render = result.formulas.get(line.id)!.render;
    expect(render.glyphs.map((g) => g.label)).toEqual(['—', '▸']);
    expect((render.bbox.minX + render.bbox.maxX) / 2).toBeCloseTo(0, 9);
    expect((render.bbox.minY + render.bbox.maxY) / 2).toBeCloseTo(0, 9);
  });

  it('runs from a point of the scene to glyphs, leaving its gap at both ends, as Manim does', async () => {
    const { line, placed, ...found } = await settled(
      target,
      'line',
      (_a, b) => [{ point: [-1, 3] }, { clipId: b.id, glyphs: [0] }],
      0.2,
    );
    const expected = found.expected();
    const drawn = lineEndsAt(target, line, placed.initial);
    close(drawn.start, expected.start);
    close(drawn.end, expected.end);
    // The free end stops the gap short of its point, along the line.
    expect(Math.hypot(drawn.start[0] + 1, drawn.start[1] - 3)).toBeCloseTo(0.2, 6);
  });

  it('runs between the points of the boxes its ends name, not the edges Manim would find', async () => {
    const { line, placed, corner, a, b } = await settled(
      target,
      'arrow',
      (a, b) => [
        { clipId: a.id, glyphs: [0, 1], anchor: 'ur' },
        { clipId: b.id, glyphs: 'all', anchor: 'left' },
      ],
      0.25,
    );
    // `Arrow(a[0:2].get_corner(UR), b.get_left())`: two points, the gap at each.
    const between = { start: corner(a.id, [0, 1], [1, 1]), end: corner(b.id, 'all', [-1, 0]) };
    const want = buffedEnds(target, between, 0.25);
    const drawn = lineEndsAt(target, line, placed.initial);
    close(drawn.start, want.start);
    close(drawn.end, want.end);
    // The corner is not where the automatic edge is.
    const auto = await settled(
      target,
      'arrow',
      (a, b) => [
        { clipId: a.id, glyphs: [0, 1] },
        { clipId: b.id, glyphs: 'all' },
      ],
      0.25,
    );
    const free = lineEndsAt(target, auto.line, auto.placed.initial);
    expect(
      Math.hypot(free.start[0] - drawn.start[0], free.start[1] - drawn.start[1]),
    ).toBeGreaterThan(0.05);
  });

  it('takes the centre of its glyphs, and leaves the other end to Manim', async () => {
    const { line, placed, corner, expected, a } = await settled(
      target,
      'line',
      (a, b) => [
        { clipId: a.id, glyphs: [2], anchor: 'center' },
        { clipId: b.id, glyphs: 'all' },
      ],
      0,
    );
    const drawn = lineEndsAt(target, line, placed.initial);
    close(drawn.start, corner(a.id, [2], [0, 0]));
    close(drawn.end, expected().end);
  });

  it('measures its glyphs where they are when its clip starts', async () => {
    // "a+b=c" moves up and right over [0.5, 1.5): the line, which starts at 2 s, finds it there.
    const moved = await settled(
      target,
      'double_arrow',
      (a, b) => [
        { clipId: a.id, glyphs: 'all' },
        { clipId: b.id, glyphs: 'all' },
      ],
      0.25,
      (a) => a.actions.push(createTween(0.5, 1, { position: [-1, 3] })),
    );
    const still = await settled(
      target,
      'double_arrow',
      (a, b) => [
        { clipId: a.id, glyphs: 'all' },
        { clipId: b.id, glyphs: 'all' },
      ],
      0.25,
    );
    const drawn = lineEndsAt(target, moved.line, moved.placed.initial);
    close(drawn.start, moved.expected().start);
    close(drawn.end, moved.expected().end);
    expect(moved.line.vector).not.toEqual(still.line.vector);
    expect(drawn.start[1]).toBeGreaterThan(
      lineEndsAt(target, still.line, still.placed.initial).start[1] + 1,
    );
    expect(moved.result.formulas.get(moved.line.id)!.render.glyphs).toHaveLength(3);
  });

  it('is left as it is while an end cannot be measured', async () => {
    const { result, line } = await settled(
      target,
      'arrow',
      (a) => [
        { clipId: a.id, glyphs: 'all' },
        { clipId: 'gone', glyphs: 'all' },
      ],
      0.25,
    );
    expect(line.vector).toEqual([1, 0]);
    expect(result.readiness.ready).toBe(false);
  });

  it('fits its vector to its first clip, and starts a second clip along it where its own ends are', async () => {
    const scene = await sceneWith({ a: 'a+b=c' }, target);
    const a = plainClip(scene, 'a', 0, 0, 6);
    a.initial.position = [-3, 1];
    const formula = createLineFormula({ name: 'l1', line: 'arrow' });
    scene.project.formulas.push(formula);
    const track = createTrack('Track of the line');
    scene.project.tracks.unshift(track);
    const from = (anchor: 'right' | 'down', to: [number, number], start: number, end: number) => {
      const attach = createEndsAttach({ clipId: a.id, glyphs: 'all', anchor }, { point: to }, 0.25);
      const clip = createClip(formula.id, track.id, start, end, { ...none, attach });
      scene.project.clips.push(clip);
      return { clip, attach };
    };
    const first = from('right', [1, 2], 0, 2);
    const second = from('down', [0, -2], 2, 4);
    const result = settleScene(scene.project, scene.formulas, refreshLocalRenders);
    const line = result.project.formulas.find((f) => f.id === formula.id) as LineFormula;
    const evaluator = exportEvaluator(result.project, result.formulas);
    /** What Manim draws between the ends of one of the two clips, when it starts. */
    const drawn = ({ clip, attach }: typeof first) =>
      buffedEnds(
        target,
        manimLineEnds(
          target,
          lineEndInput(evaluator, target, attach.start, clip.start)!,
          lineEndInput(evaluator, target, attach.end, clip.start)!,
        )!,
        attach.buff,
      );
    const placed = ({ clip }: typeof first) =>
      lineEndsAt(target, line, result.project.clips.find((c) => c.id === clip.id)!.initial);
    // The object runs along what its first clip draws…
    const own = drawn(first);
    expect(line.vector[0]).toBeCloseTo(own.end[0] - own.start[0], 9);
    expect(line.vector[1]).toBeCloseTo(own.end[1] - own.start[1], 9);
    expect(placed(first).start[0]).toBeCloseTo(own.start[0], 9);
    expect(placed(first).start[1]).toBeCloseTo(own.start[1], 9);
    // … and its second clip starts where its own ends put it, along that same vector.
    const other = drawn(second);
    expect(placed(second).start[0]).toBeCloseTo(other.start[0], 9);
    expect(placed(second).start[1]).toBeCloseTo(other.start[1], 9);
    expect(placed(second).end[0]).toBeCloseTo(other.start[0] + line.vector[0], 9);
    expect(placed(second).end[1]).toBeCloseTo(other.start[1] + line.vector[1], 9);
    expect(result.readiness.ready).toBe(true);
  });
});
