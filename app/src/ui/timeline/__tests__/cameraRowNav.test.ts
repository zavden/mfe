// @vitest-environment node
/* The keyboard model of the Camera row: its Tab stop, and where the arrows go. */
import { describe, expect, it } from 'vitest';
import { defaultCameraFrame, type SceneCamera } from '../../../model';
import { cameraNavTarget, cameraTabStop, isCameraNavKey } from '../cameraRowNav';

/** Three moves, kept out of the order they run in: n2 over [1, 2), n1 over [3, 4), n3 over [5, 6). */
const camera = (): SceneCamera => ({
  initial: defaultCameraFrame(),
  targets: [],
  moves: [
    { id: 'n1', start: 3, duration: 1, easing: 'smooth', to: { kind: 'start' } },
    { id: 'n2', start: 1, duration: 1, easing: 'smooth', to: { kind: 'start' } },
    { id: 'n3', start: 5, duration: 1, easing: 'smooth', to: { kind: 'start' } },
  ],
});

const empty: SceneCamera = { initial: defaultCameraFrame(), targets: [], moves: [] };

describe('the Tab stop of the Camera row', () => {
  it('is the selected move, else the first to run', () => {
    expect(cameraTabStop(camera(), 'n3')?.id).toBe('n3');
    expect(cameraTabStop(camera(), null)?.id).toBe('n2');
    expect(cameraTabStop(camera(), 'gone')?.id).toBe('n2');
    expect(cameraTabStop(empty, null)).toBeNull();
  });
});

describe('the arrows of the Camera row', () => {
  it('walk the moves in the order they run; Home and End reach the ends', () => {
    const to = (from: string, key: Parameters<typeof cameraNavTarget>[2]) =>
      cameraNavTarget(camera(), from, key)?.id ?? null;
    expect(to('n2', 'ArrowRight')).toBe('n1');
    expect(to('n1', 'ArrowRight')).toBe('n3');
    expect(to('n3', 'ArrowRight')).toBeNull();
    expect(to('n1', 'ArrowLeft')).toBe('n2');
    expect(to('n2', 'ArrowLeft')).toBeNull();
    expect(to('n1', 'Home')).toBe('n2');
    expect(to('n1', 'End')).toBe('n3');
    // Already there, or not a move of the camera: nowhere.
    expect(to('n2', 'Home')).toBeNull();
    expect(to('n3', 'End')).toBeNull();
    expect(to('gone', 'ArrowRight')).toBeNull();
  });

  it('are the keys along the time, with Home and End', () => {
    for (const key of ['ArrowLeft', 'ArrowRight', 'Home', 'End'])
      expect(isCameraNavKey(key)).toBe(true);
    for (const key of ['ArrowUp', 'ArrowDown', 'Enter', 'a'])
      expect(isCameraNavKey(key)).toBe(false);
  });
});
