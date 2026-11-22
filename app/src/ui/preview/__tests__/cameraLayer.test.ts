// @vitest-environment node
/* The camera's rectangles as the Preview draws them: which are drawn, in what order and how
 * strong, read from a context that only records. */
import { describe, expect, it } from 'vitest';
import { createEmptyProject, type CameraMove } from '../../../model';
import { cameraSceneAt, type CameraSceneModel } from '../../camera/cameraScene';
import type { CameraPiece } from '../cameraGeometry';
import { drawCameraLayer, FAINT } from '../cameraLayer';

/** A 2D context that records the names it writes and how strong each was drawn. */
function recorder() {
  const names: { text: string; alpha: number }[] = [];
  const state: Record<string, unknown> = { globalAlpha: 1 };
  const ctx = new Proxy(state, {
    get: (target, name: string) => {
      if (name in target) return target[name];
      if (name === 'measureText') return (text: string) => ({ width: text.length * 6 });
      if (name === 'fillText') {
        return (text: string) => void names.push({ text, alpha: target.globalAlpha as number });
      }
      return () => undefined;
    },
    set: (target, name: string, value: unknown) => {
      target[name] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, names };
}

const view = { frameWidth: 16, frameHeight: 8, center: [0, 0] as [number, number], zoom: 1 };
const surface = { width: 1600, height: 800 };

/** The camera goes twice to the same place, each move to a frame of its own, and comes back to a
 * target camera in between. */
function stacked(time: number): CameraSceneModel {
  const project = createEmptyProject('test');
  const there: CameraMove['to'] = { kind: 'frame', frame: { center: [4, 0], height: 2 } };
  project.camera = {
    initial: { center: [0, 0], height: 2 },
    targets: [{ id: 'k1', name: 'Wide', center: [0, 0], height: 4 }],
    moves: [
      { id: 'n1', start: 1, duration: 1, easing: 'linear', to: there },
      { id: 'n2', start: 3, duration: 1, easing: 'linear', to: { kind: 'target', target: 'k1' } },
      { id: 'n3', start: 5, duration: 1, easing: 'linear', to: there },
    ],
  };
  return cameraSceneAt(project, time)!;
}

function drawn(model: CameraSceneModel, isolated: CameraPiece | null) {
  const { ctx, names } = recorder();
  drawCameraLayer(ctx, view, surface, model, {
    dpr: 1,
    veil: true,
    route: true,
    selected: isolated,
    hover: null,
    isolated,
  });
  return names;
}

describe('the camera’s rectangles on the Preview', () => {
  it('are drawn at full strength, the current camera last, while none is isolated', () => {
    expect(drawn(stacked(0), null)).toEqual([
      { text: '1', alpha: 1 },
      { text: '3', alpha: 1 },
      { text: 'Wide', alpha: 1 },
      { text: 'Camera', alpha: 1 },
    ]);
  });

  it('draws the isolated one last and alone at full strength', () => {
    // n1's frame lies under n3's: isolated, it is drawn over n3's and over the camera.
    expect(drawn(stacked(0), { kind: 'move', id: 'n1' })).toEqual([
      { text: '3', alpha: FAINT },
      { text: 'Wide', alpha: FAINT },
      { text: 'Camera', alpha: FAINT },
      { text: '1', alpha: 1 },
    ]);
    // The frame of 0 s, once the camera has left it.
    expect(drawn(stacked(2), { kind: 'start' })).toEqual([
      { text: '3', alpha: FAINT },
      { text: 'Wide', alpha: FAINT },
      { text: 'Camera', alpha: FAINT },
      { text: 'Start', alpha: 1 },
    ]);
  });

  it('draws the camera itself strong when the isolated frame is the one it rests in', () => {
    expect(drawn(stacked(2), { kind: 'camera' })).toEqual([
      { text: 'Start', alpha: FAINT },
      { text: '3', alpha: FAINT },
      { text: 'Wide', alpha: FAINT },
      { text: 'Camera', alpha: 1 },
    ]);
  });

  it('leaves the strength it found: what is drawn next is not faint', () => {
    const { ctx } = recorder();
    drawCameraLayer(ctx, view, surface, stacked(0), {
      dpr: 1,
      veil: false,
      route: true,
      selected: null,
      hover: null,
      isolated: { kind: 'move', id: 'n1' },
    });
    expect((ctx as unknown as { globalAlpha: number }).globalAlpha).toBe(1);
  });
});
