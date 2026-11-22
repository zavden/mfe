import { beforeEach, describe, expect, it, vi } from 'vitest';

type Modes = typeof import('../previewModes');

describe('previewModes: turning a mode of the preview on ends the others', () => {
  let modes: Modes;
  let ended: string[];
  let on: Set<string>;

  // The list of modes is the module's: a copy of its own for each case.
  beforeEach(async () => {
    vi.resetModules();
    modes = await import('../previewModes');
    ended = [];
    on = new Set();
    for (const mode of ['path', 'retarget', 'colours', 'symbol'] as const)
      modes.registerPreviewMode(
        mode,
        () => ended.push(mode),
        () => on.has(mode),
      );
  });

  it('ends every mode but the one that turns on', () => {
    modes.endPreviewModes('symbol');
    expect(ended).toEqual(['path', 'retarget', 'colours']);
    ended = [];
    modes.endPreviewModes('path');
    expect(ended).toEqual(['retarget', 'colours', 'symbol']);
  });

  it('keeps one way to end per mode: the last one said', () => {
    modes.registerPreviewMode(
      'path',
      () => ended.push('path, again'),
      () => false,
    );
    modes.endPreviewModes('symbol');
    expect(ended).toEqual(['path, again', 'retarget', 'colours']);
  });

  it('tells who hears which mode turns on, after the others ended, until it is stopped', () => {
    const told: string[] = [];
    const stop = modes.onPreviewMode((mode) => told.push(`${mode} after ${ended.join(' ')}`));
    modes.endPreviewModes('path');
    expect(told).toEqual(['path after retarget colours symbol']);
    stop();
    modes.endPreviewModes('colours');
    expect(told).toHaveLength(1);
  });

  it('tells every one that hears, one that stops while it is told too', () => {
    const told: string[] = [];
    const stopFirst = modes.onPreviewMode(() => {
      told.push('first');
      stopFirst();
    });
    modes.onPreviewMode(() => told.push('second'));
    modes.endPreviewModes('symbol');
    modes.endPreviewModes('symbol');
    expect(told).toEqual(['first', 'second', 'second']);
  });

  it('ends nothing of a mode that never said how', async () => {
    vi.resetModules();
    const empty = await import('../previewModes');
    expect(() => empty.endPreviewModes('colours')).not.toThrow();
    expect(empty.previewModeOn()).toBe(false);
  });

  it('says whether a mode is on, as the modes themselves say it', () => {
    expect(modes.previewModeOn()).toBe(false);
    on.add('colours');
    expect(modes.previewModeOn()).toBe(true);
    on.delete('colours');
    on.add('symbol');
    expect(modes.previewModeOn()).toBe(true);
    on.clear();
    expect(modes.previewModeOn()).toBe(false);
  });
});
