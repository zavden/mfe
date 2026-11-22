// @vitest-environment node
/* Dragging the inner edge of a clip's intro or outro (phaseDrag.ts): how long the animation may
 * get, the duration an edge gives it, and what the edge snaps to. */
import { describe, expect, it } from 'vitest';
import {
  createAppear,
  createClip,
  createEmptyProject,
  createFormula,
  createTween,
  defaultCameraFrame,
  defaultIntro,
  defaultOutro,
  type Clip,
} from '../../../model';
import {
  cameraPhaseRoom,
  phaseDurationAt,
  phaseEdge,
  phaseLimits,
  phaseSnapPoints,
} from '../phaseDrag';

/** A clip over [2, 10) with a Write of 1 s and a FadeOut of 1 s. */
function clip(actions: Clip['actions'] = []): Clip {
  return createClip('f', 't', 2, 10, {
    intro: defaultIntro('write'),
    outro: defaultOutro('fade_out'),
    actions,
  });
}

describe('phaseEdge', () => {
  it('is where the intro ends and where the outro starts', () => {
    expect(phaseEdge(clip(), 'intro')).toBe(3);
    expect(phaseEdge(clip(), 'outro')).toBe(9);
  });
});

describe('phaseLimits', () => {
  it('lets one of the two take the clip but what the other one has', () => {
    expect(phaseLimits(clip(), 'intro')).toEqual({ min: 0.05, max: 7 });
    expect(phaseLimits(clip(), 'outro')).toEqual({ min: 0.05, max: 7 });
  });

  it('stops at a Transform of the whole formula: the first one for the intro, the last for the outro', () => {
    // Tweens over [4, 5) and [7, 8.5) of the scene: 2 s and 5 s into the clip.
    const c = clip([createTween(2, 1, { opacity: 0.5 }), createTween(5, 1.5, { opacity: 1 })]);
    expect(phaseLimits(c, 'intro').max).toBe(2);
    expect(phaseLimits(c, 'outro').max).toBe(1.5);
  });

  it('is not stopped by the blocks that name glyphs: they may run beside the intro', () => {
    const c = clip([createAppear(1.5, 'fade_in', [0])]);
    expect(phaseLimits(c, 'intro').max).toBe(7);
  });

  it('never asks a press to shorten what is already longer than the room', () => {
    const c = clip([createTween(0.5, 1, { opacity: 0.5 })]); // a tween inside the intro
    expect(phaseLimits(c, 'intro').max).toBe(1);
  });
});

describe('phaseDurationAt', () => {
  const c = clip();
  const limits = phaseLimits(c, 'intro');

  it('runs the intro from the clip’s start to the edge, the outro from the edge to its end', () => {
    expect(phaseDurationAt(c, 'intro', 4.25, limits)).toBe(2.25);
    expect(phaseDurationAt(c, 'outro', 6.5, limits)).toBe(3.5);
  });

  it('stays within the limits', () => {
    expect(phaseDurationAt(c, 'intro', 1, limits)).toBe(0.05);
    expect(phaseDurationAt(c, 'intro', 30, limits)).toBe(7);
    expect(phaseDurationAt(c, 'outro', 30, limits)).toBe(0.05);
    expect(phaseDurationAt(c, 'outro', 0, limits)).toBe(7);
  });
});

describe('phaseSnapPoints', () => {
  it('offers the playhead, the clip’s edges, its blocks’ edges and the other animation’s edge', () => {
    const project = createEmptyProject();
    const formula = createFormula({ name: 'f' });
    project.formulas.push(formula);
    const c = createClip(formula.id, project.tracks[0]!.id, 2, 10, {
      intro: defaultIntro('write'),
      outro: defaultOutro('fade_out'),
      actions: [createTween(2, 1, { opacity: 0.5 })],
    });
    project.clips.push(c);
    const points = phaseSnapPoints(project, c, 6.5);
    for (const point of [6.5, 2, 10, 3, 9, 4, 5]) expect(points).toContain(point);
  });
});

describe('the camera and the edge of an intro or an outro', () => {
  /** A project whose camera moves over each of `windows`. */
  const cameraOver = (...windows: [number, number][]) => ({
    camera: {
      initial: defaultCameraFrame(),
      targets: [],
      moves: windows.map(([start, end], i) => ({
        id: `n${i}`,
        start,
        duration: end - start,
        easing: 'smooth' as const,
        to: { kind: 'start' as const },
      })),
    },
  });

  it('gives the animation the time up to the nearest move, on its own side', () => {
    // The clip is over [2, 10): its Write over [2, 3), its FadeOut over [9, 10).
    const project = cameraOver([4.5, 5], [7, 8.25]);
    expect(cameraPhaseRoom(project, clip(), 'intro')).toBe(2.5);
    expect(cameraPhaseRoom(project, clip(), 'outro')).toBe(1.75);
    // No move, or none on its side: nothing holds it.
    expect(cameraPhaseRoom({}, clip(), 'intro')).toBe(Infinity);
    expect(cameraPhaseRoom(cameraOver([0, 1]), clip(), 'intro')).toBe(Infinity);
    // A move the animation runs into already does not hold it.
    expect(cameraPhaseRoom(cameraOver([2.5, 4]), clip(), 'intro')).toBe(Infinity);
  });

  it('stops the edge there, with the project of the clip', () => {
    const project = { ...createEmptyProject(), ...cameraOver([4.5, 5], [7, 8.25]) };
    expect(phaseLimits(clip(), 'intro', project)).toEqual({ min: 0.05, max: 2.5 });
    expect(phaseLimits(clip(), 'outro', project)).toEqual({ min: 0.05, max: 1.75 });
    // The edge snaps to the edges of the moves.
    expect(phaseSnapPoints(project, clip(), 0)).toEqual(expect.arrayContaining([4.5, 5, 7, 8.25]));
  });
});
