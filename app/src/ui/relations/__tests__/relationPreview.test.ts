import { describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  defaultIntro,
  defaultOutro,
  type ClipAction,
  type PathSpline,
} from '../../../model';
import { linkFrame } from '../linkLayout';
import {
  framedTimes,
  rawScene,
  rawStage,
  relationSpan,
  relationWindow,
  windowBand,
  windowProgress,
} from '../relationPreview';

const from = { start: 0, end: 6 };
const to = { start: 2, end: 8 };

describe('the preview of a relation', () => {
  it('counts the window from the start of the target clip', () => {
    expect(relationWindow(to, { offset: 0.5, duration: 2 })).toEqual({ start: 2.5, end: 4.5 });
    expect(relationWindow({ start: 0.1 }, { offset: 0.2, duration: 0.3 })).toEqual({
      start: 0.3,
      end: 0.6,
    });
  });

  it('loops from a little before the window to a little after it', () => {
    expect(relationSpan(from, to, { offset: 0.5, duration: 2 })).toEqual({ start: 2, end: 5 });
    expect(relationSpan(from, to, { offset: 0.5, duration: 2 }, 0.25)).toEqual({
      start: 2.25,
      end: 4.75,
    });
  });

  it('stays within the time either clip is on the scene, and is never empty', () => {
    // The source starts with the window, and the target ends with it.
    const tight = relationSpan(
      { start: 2, end: 4 },
      { start: 2, end: 4 },
      { offset: 0, duration: 2 },
    );
    expect(tight).toEqual({ start: 2, end: 4 });
    // The source is there before the target: the pad before the window reaches into it.
    expect(relationSpan(from, to, { offset: 0, duration: 1 })).toEqual({ start: 1.5, end: 3.5 });
    const none = relationSpan(
      { start: 1, end: 1 },
      { start: 1, end: 1 },
      { offset: 0, duration: 0 },
    );
    expect(none.end).toBeGreaterThan(none.start);
  });

  it('says how far through the window a time is', () => {
    const window = { start: 2, end: 4 };
    expect(windowProgress(1, window)).toBe(0);
    expect(windowProgress(2.5, window)).toBe(0.25);
    expect(windowProgress(9, window)).toBe(1);
    expect(windowProgress(1.9, { start: 2, end: 2 })).toBe(0);
    expect(windowProgress(2, { start: 2, end: 2 })).toBe(1);
  });

  it('frames the ends of the span and the window all the way', () => {
    expect(framedTimes({ start: 1.5, end: 4.5 }, { start: 2, end: 4 }, 4)).toEqual([
      1.5, 2, 2.5, 3, 3.5, 4, 4.5,
    ]);
    // Instants that fall together are framed once.
    expect(framedTimes({ start: 2, end: 4 }, { start: 2, end: 4 }, 2)).toEqual([2, 3, 4]);
  });

  it('marks where the window lies on the bar', () => {
    expect(windowBand({ start: 1.5, end: 4 }, { start: 2, end: 4 })).toEqual({ from: 0.2, to: 1 });
    expect(windowBand({ start: 2, end: 3 }, { start: 1, end: 5 })).toEqual({ from: 0, to: 1 });
  });
});

describe('the raw preview of a relation', () => {
  const a = { minX: -1, maxX: 3, minY: -0.5, maxY: 0.5 };
  const b = { minX: 0, maxX: 2, minY: 0, maxY: 2 };
  /** The size of their text: a letter of a formula at Manim's default size. */
  const TEXT = 0.25;

  it('lays the drawing out with the source above a gap and the target below, centred', () => {
    const frame = linkFrame(a, b, TEXT);
    // The source's bottom edge and the target's top edge are the edges of the gap.
    expect(a.minY + frame.from.dy).toBeCloseTo(frame.gapTop);
    expect(b.maxY + frame.to.dy).toBeCloseTo(frame.gapBottom);
    expect(frame.gapTop).toBeCloseTo(-frame.gapBottom);
    expect((a.minX + a.maxX) / 2 + frame.from.dx).toBeCloseTo(0);
    expect((b.minX + b.maxX) / 2 + frame.to.dx).toBeCloseTo(0);
    // The box holds both, with a margin.
    expect(frame.left).toBeLessThan(-2);
    expect(frame.right).toBeCloseTo(-frame.left);
    expect(frame.top).toBeGreaterThan(frame.gapTop + 1);
    expect(frame.bottom).toBeLessThan(frame.gapBottom - 2);
  });

  it('puts the centre of each formula where the drawing has it, under a camera of its box', () => {
    const frame = linkFrame(a, b, TEXT);
    const stage = rawStage(a, b, TEXT);
    expect(stage.from[0]).toBeCloseTo(0);
    expect(stage.from[1]).toBeCloseTo(frame.gapTop + 0.5);
    expect(stage.to[0]).toBeCloseTo(0);
    expect(stage.to[1]).toBeCloseTo(frame.gapBottom - 1);
    expect(stage.offsets).toEqual({ from: frame.from, to: frame.to });
    expect(stage.camera.zoom).toBe(1);
    expect(stage.camera.frameWidth).toBeCloseTo(frame.right - frame.left);
    expect(stage.camera.frameHeight).toBeCloseTo(frame.top - frame.bottom);
    expect(stage.camera.center[0]).toBeCloseTo(0);
    expect(stage.camera.center[1]).toBeCloseTo((frame.top + frame.bottom) / 2);
  });

  it('follows the layout of the drawing: side by side, the source at the left', () => {
    const frame = linkFrame(a, b, TEXT, 'side');
    const stage = rawStage(a, b, TEXT, 'side');
    expect(stage.offsets).toEqual({ from: frame.from, to: frame.to });
    expect(stage.from[1]).toBeCloseTo(0);
    expect(stage.to[1]).toBeCloseTo(0);
    expect(stage.from[0]).toBeLessThan(0);
    expect(stage.to[0]).toBeGreaterThan(0);
    expect(stage.camera.frameWidth).toBeCloseTo(frame.right - frame.left);
    expect(stage.camera.frameHeight).toBeCloseTo(frame.top - frame.bottom);
    expect(stage.camera.center[1]).toBeCloseTo((frame.top + frame.bottom) / 2);
  });

  it('makes the scene of the two clips alone, laid out raw, their relation going straight', () => {
    const project = createEmptyProject();
    const formulas = ['a', 'b', 'c', 'd'].map((source) => createFormula({ name: source, source }));
    project.formulas.push(...formulas);
    const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
    const [fa, fb, fc, fd] = formulas.map((f) => f.id);
    const track = project.tracks[0]!.id;
    const from = createClip(fa!, track, 0, 6, none);
    const to = createClip(fb!, track, 2, 8, none);
    const third = createClip(fc!, track, 0, 8, none);
    const fourth = createClip(fd!, track, 0, 8, none);
    from.initial = { ...from.initial, position: [3, 2], scale: 2, rotation: 30, flipX: true };
    const action = (kind: string) => ({ id: kind, kind, start: 0, duration: 1 }) as ClipAction;
    from.actions = ['appear', 'transform', 'disappear', 'morph', 'emphasis'].map(action);
    project.clips.push(from, to, third, fourth);
    const bump: PathSpline = {
      nodes: [
        { at: [0, 0], in: null, out: [0.3, 0.4], smooth: false },
        { at: [1, 0], in: [0.7, 0.4], out: null, smooth: false },
      ],
    };
    const relation = createRelation(from.id, to.id, {
      pathArc: 45,
      pairs: [
        {
          from: [0],
          to: [0],
          style: 'copy',
          path: bump,
          // A path of one route goes too (D167).
          routes: [{ from: 0, to: 0, path: bump }],
        },
      ],
    });
    const feeding = createRelation(third.id, from.id, { pairs: [] });
    const apart = createRelation(third.id, fourth.id, { pairs: [] });
    project.relations.push(feeding, relation, apart);
    const before = JSON.stringify(project);

    const scene = rawScene(project, relation.id, { from: [0, 1.5], to: [0, -1.5] });
    const clip = (id: string) => scene.clips.find((c) => c.id === id)!;
    // The two clips: where the stage says, at their formula's own size, upright, attached to
    // nothing, with the blocks that show and hide glyphs only.
    expect(clip(from.id).initial).toMatchObject({
      position: [0, 1.5],
      scale: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
    });
    expect(clip(from.id).initial.opacity).toBe(from.initial.opacity);
    expect(clip(from.id).attach).toBeNull();
    expect(clip(from.id).actions.map((a) => a.kind)).toEqual(['appear', 'disappear']);
    expect(clip(to.id).initial.position).toEqual([0, -1.5]);
    // The other clips are the project's own.
    expect(clip(third.id)).toBe(third);
    // The relation alone between the two, straight: no arc, no path; its style is kept.
    expect(scene.relations.map((r) => r.id)).toEqual([relation.id, apart.id]);
    const straight = scene.relations[0]!;
    expect(straight.pathArc).toBe(0);
    expect(straight.pairs).toEqual([{ from: [0], to: [0], style: 'copy' }]);
    expect('path' in straight.pairs[0]!).toBe(false);
    // Nothing of the project is changed for it.
    expect(JSON.stringify(project)).toBe(before);
    // A source that starts empty is filled by a relation left out: here it is whole. A target
    // that starts empty stays so: the transformation shows what its pairs bring.
    from.startsEmpty = true;
    to.startsEmpty = true;
    const empty = rawScene(project, relation.id, { from: [0, 1.5], to: [0, -1.5] });
    expect('startsEmpty' in empty.clips.find((c) => c.id === from.id)!).toBe(false);
    expect(empty.clips.find((c) => c.id === to.id)!.startsEmpty).toBe(true);
    expect(from.startsEmpty).toBe(true);
    delete from.startsEmpty;
    delete to.startsEmpty;
    // So with the glyphs a clip leaves out of its intro itself (the first half of a split).
    from.startHidden = [1];
    to.startHidden = [2];
    const listed = rawScene(project, relation.id, { from: [0, 1.5], to: [0, -1.5] });
    expect('startHidden' in listed.clips.find((c) => c.id === from.id)!).toBe(false);
    expect(listed.clips.find((c) => c.id === to.id)!.startHidden).toEqual([2]);
    expect(from.startHidden).toEqual([1]);
    delete from.startHidden;
    delete to.startHidden;
    // A relation that is not there leaves the scene as it is.
    expect(rawScene(project, 'nope' as typeof relation.id, { from: [0, 0], to: [0, 0] })).toBe(
      project,
    );
  });
});
