// @vitest-environment node
/* The frame of the scene as a picture (`frameImage.ts`): the frame a video shows at that instant,
 * at the project's size or twice it, over the scene's background or over nothing. */
import { describe, expect, it } from 'vitest';
import type { SceneCamera } from '../../../model';
import type { Camera, FrameStyle, Renderer, Surface } from '../../../render';
import { exportEvaluator, sceneFraming, type Drawable } from '../../../scene';
import { plainClip, sceneWith, type Scene } from '../../../scene/__tests__/sceneKit';
import { frameDrawer } from '../../video/frames';
import { frameTime } from '../../video/timing';
import { frameImage, imageSize, IMAGE_SCALES, type FrameImageDeps } from '../frameImage';

interface Drawn {
  drawables: readonly Drawable[];
  camera: Camera;
  surface: Surface;
  style: FrameStyle;
}

/** What a picture is drawn with, recording what it was asked. */
function recording() {
  const drawn: Drawn[] = [];
  const canvases: { width: number; height: number; alpha: boolean }[] = [];
  const renderer = {
    draw: (
      _ctx: unknown,
      drawables: Drawn['drawables'],
      camera: Camera,
      surface: Surface,
      style: FrameStyle,
    ) => void drawn.push({ drawables, camera, surface, style }),
  } as unknown as Renderer;
  const deps: FrameImageDeps = {
    renderer,
    createCanvas(width, height, alpha) {
      canvases.push({ width, height, alpha });
      return {
        ctx: {} as CanvasRenderingContext2D,
        toPng: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })),
      };
    },
  };
  return { deps, renderer, drawn, canvases };
}

/** Two formulas on two tracks, the second one from 1 s to 3 s. */
async function twoTracks(): Promise<Scene> {
  const scene = await sceneWith({ a: 'a+b', b: 'xy' });
  plainClip(scene, 'a', 0, 0, 2);
  plainClip(scene, 'b', 1, 1, 3);
  return scene;
}

const camera = (): SceneCamera => ({
  initial: { center: [0, 0], height: 8 },
  targets: [],
  moves: [
    {
      id: 'm1',
      start: 0,
      duration: 2,
      easing: 'linear',
      to: { kind: 'frame', frame: { center: [2, 1], height: 4 } },
    },
  ],
});

describe('the size of the picture', () => {
  it('is the project’s, or twice it', () => {
    expect(IMAGE_SCALES).toEqual([1, 2]);
    expect(imageSize({ width: 1920, height: 1080 }, 1)).toEqual({ width: 1920, height: 1080 });
    expect(imageSize({ width: 1080, height: 1920 }, 2)).toEqual({ width: 2160, height: 3840 });
  });
});

describe('the frame of the scene as a picture', () => {
  it('is the frame a video of the project’s size draws at that instant', async () => {
    const scene = await twoTracks();
    const { width, height, fps, background } = scene.project.meta;
    for (const k of [0, 7, 45]) {
      const time = frameTime(k, 0, fps);
      const picture = recording();
      const made = await frameImage(
        scene.project,
        scene.formulas,
        { time, scale: 1, transparent: false },
        picture.deps,
      );
      expect(made).toMatchObject({ width, height });
      expect(made.blob.type).toBe('image/png');
      expect(picture.canvases).toEqual([{ width, height, alpha: false }]);

      const video = recording();
      frameDrawer(
        video.renderer,
        exportEvaluator(scene.project, scene.formulas, { width, height }),
        { width, height, fps, background },
        0,
      )({} as CanvasRenderingContext2D, k);
      expect(picture.drawn).toHaveLength(1);
      expect(picture.drawn).toEqual(video.drawn);
      expect(picture.drawn[0]!.style).toEqual({ background, outside: null });
    }
  });

  it('draws the tracks hidden in the Preview, as a video does', async () => {
    const scene = await twoTracks();
    scene.project.tracks[0]!.hidden = true;
    const { deps, drawn } = recording();
    await frameImage(
      scene.project,
      scene.formulas,
      { time: 1.5, scale: 1, transparent: false },
      deps,
    );
    expect(drawn[0]!.drawables).toHaveLength(5);
  });

  it('is filmed through the scene’s camera of that instant', async () => {
    const scene = await twoTracks();
    scene.project.camera = camera();
    const { deps, drawn } = recording();
    await frameImage(
      scene.project,
      scene.formulas,
      { time: 1, scale: 1, transparent: false },
      deps,
    );
    // Half way to a frame 4 units tall at (2, 1), which fills the picture.
    expect(drawn[0]!.camera).toMatchObject({ center: [1, 0.5], frameHeight: 6, zoom: 1 });
    const through = sceneFraming(scene.project)!;
    expect(through(1)).toEqual({ center: [1, 0.5], height: 6 });
  });

  it('has twice the pixels at 2×, of the same frame of the scene', async () => {
    const scene = await twoTracks();
    scene.project.camera = camera();
    const { width, height } = scene.project.meta;
    const once = recording();
    const twice = recording();
    const options = { time: 1, transparent: false };
    await frameImage(scene.project, scene.formulas, { ...options, scale: 1 }, once.deps);
    const made = await frameImage(
      scene.project,
      scene.formulas,
      { ...options, scale: 2 },
      twice.deps,
    );
    expect(made).toMatchObject({ width: 2 * width, height: 2 * height });
    expect(twice.canvases).toEqual([{ width: 2 * width, height: 2 * height, alpha: false }]);
    expect(twice.drawn[0]!.surface).toEqual({ width: 2 * width, height: 2 * height });
    // The scene and the frame it is seen through are the same: only the pixels are more.
    expect(twice.drawn[0]!.camera).toEqual(once.drawn[0]!.camera);
    expect(twice.drawn[0]!.drawables).toEqual(once.drawn[0]!.drawables);
  });

  it('keeps nothing behind what is drawn when it is transparent', async () => {
    const scene = await twoTracks();
    const { width, height } = scene.project.meta;
    const { deps, drawn, canvases } = recording();
    await frameImage(
      scene.project,
      scene.formulas,
      { time: 0.5, scale: 1, transparent: true },
      deps,
    );
    // A canvas with an alpha channel, and a background that paints nothing on it.
    expect(canvases).toEqual([{ width, height, alpha: true }]);
    expect(drawn[0]!.style).toEqual({ background: 'transparent', outside: null });
    expect(drawn[0]!.drawables).toHaveLength(3);
  });

  it('draws the end of the scene for an instant past it', async () => {
    const scene = await twoTracks();
    const at = async (time: number) => {
      const { deps, drawn } = recording();
      await frameImage(scene.project, scene.formulas, { time, scale: 1, transparent: false }, deps);
      return drawn[0]!.drawables;
    };
    expect(await at(99)).toEqual(await at(3));
    expect(await at(3)).toHaveLength(2);
  });
});
