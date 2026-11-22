// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { defaultMeta } from '../../../model';
import { parseDraft, toDraft } from '../settingsModel';

describe('project settings draft', () => {
  it('round-trips the default meta through the draft', () => {
    const meta = defaultMeta('Demo');
    const parsed = parseDraft(toDraft(meta));
    expect(parsed).toEqual({ ok: true, meta });
  });

  it('recognises presets and custom values', () => {
    expect(toDraft({ ...defaultMeta(), width: 1280, height: 720 }).resolution).toBe('1280x720');
    expect(toDraft({ ...defaultMeta(), width: 1000, height: 500 }).resolution).toBe('custom');
    expect(toDraft({ ...defaultMeta(), fps: 30 }).fps).toBe('30');
    expect(toDraft({ ...defaultMeta(), fps: 48 })).toMatchObject({
      fps: 'custom',
      customFps: '48',
    });
    expect(toDraft({ ...defaultMeta(), duration: 12 })).toMatchObject({
      durationMode: 'fixed',
      duration: '12',
    });
  });

  it('applies a custom resolution, frame rate and fixed duration', () => {
    const draft = {
      ...toDraft(defaultMeta()),
      resolution: 'custom',
      width: '1000',
      height: '500',
      fps: 'custom',
      customFps: '48',
      durationMode: 'fixed' as const,
      duration: '7.5',
      target: 'gl' as const,
      preamble: '\\newcommand{\\R}{\\mathbb{R}}',
    };
    const parsed = parseDraft(draft);
    expect(parsed.ok && parsed.meta).toMatchObject({
      width: 1000,
      height: 500,
      fps: 48,
      duration: 7.5,
      target: 'gl',
      preamble: '\\newcommand{\\R}{\\mathbb{R}}',
    });
  });

  it('rejects values outside the schema ranges', () => {
    const base = { ...toDraft(defaultMeta()), resolution: 'custom' };
    const bad = (patch: object) => {
      const parsed = parseDraft({ ...base, ...patch });
      return parsed.ok ? null : parsed.errors;
    };
    expect(bad({ width: '8', height: '500' })).toHaveProperty('width');
    expect(bad({ width: '9000' })).toHaveProperty('width');
    expect(bad({ height: '5000' })).toHaveProperty('height');
    expect(bad({ width: '12.5' })).toHaveProperty('width');
    expect(bad({ fps: 'custom', customFps: '0' })).toHaveProperty('fps');
    expect(bad({ fps: 'custom', customFps: '300' })).toHaveProperty('fps');
    expect(bad({ durationMode: 'fixed', duration: '0' })).toHaveProperty('duration');
    expect(bad({ durationMode: 'fixed', duration: 'abc' })).toHaveProperty('duration');
    expect(bad({})).toBeNull();
  });

  it('falls back to "Untitled" for a blank name', () => {
    const parsed = parseDraft({ ...toDraft(defaultMeta()), name: '   ' });
    expect(parsed.ok && parsed.meta.name).toBe('Untitled');
  });
});
