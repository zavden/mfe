import { describe, expect, it } from 'vitest';
import { pointerReach } from '../pointerReach';

const state = (patch: Partial<Parameters<typeof pointerReach>[0]> = {}) => ({
  world: false,
  mode: false,
  playing: false,
  flying: false,
  ...patch,
});

describe('what answers the pointer in the Preview', () => {
  it('is the objects, in a scene with no camera and in the camera view', () => {
    expect(pointerReach(state())).toBe('objects');
  });

  it('is the camera’s rectangles alone in the world view', () => {
    expect(pointerReach(state({ world: true }))).toBe('camera');
  });

  it('is the objects again while a mode has the canvas, in the world view too', () => {
    expect(pointerReach(state({ mode: true }))).toBe('objects');
    expect(pointerReach(state({ world: true, mode: true }))).toBe('objects');
  });

  it('is nothing while the scene plays, in any view', () => {
    expect(pointerReach(state({ playing: true }))).toBe('none');
    expect(pointerReach(state({ world: true, playing: true }))).toBe('none');
  });

  it('is nothing while the fly key gives the mouse to the timeline, in any view', () => {
    expect(pointerReach(state({ flying: true }))).toBe('none');
    expect(pointerReach(state({ world: true, flying: true }))).toBe('none');
  });

  it('is the objects in the world view while F is held, and the camera’s once it is let go', () => {
    expect(pointerReach(state({ world: true, objectsKey: true }))).toBe('objects');
    expect(pointerReach(state({ world: true, objectsKey: false }))).toBe('camera');
    // Not while the scene plays, nor while the fly key has the mouse.
    expect(pointerReach(state({ world: true, objectsKey: true, playing: true }))).toBe('none');
    expect(pointerReach(state({ world: true, objectsKey: true, flying: true }))).toBe('none');
  });

  it('is the objects in a mode, whatever else: the mode goes on as it was started', () => {
    expect(pointerReach(state({ mode: true, playing: true }))).toBe('objects');
    expect(pointerReach(state({ mode: true, flying: true }))).toBe('objects');
    expect(pointerReach(state({ world: true, mode: true, playing: true }))).toBe('objects');
  });
});
