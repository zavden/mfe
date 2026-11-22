// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { sceneClassName } from '../../../export/metadata';
import type { CompanionHealth, CompanionState } from '../../../engine';
import {
  createAudioClip,
  createAudioTrack,
  createEmptyProject,
  sceneDuration,
} from '../../../model';
import { smallProject } from '../../../model/__tests__/fixtures';
import {
  aspectWarning,
  companionAudioAvailability,
  companionAudioCodec,
  companionVideoLimit,
  encoderAvailability,
  exportProject,
  initialDraft,
  manimExportValues,
  manimSceneName,
  manimTargetAvailability,
  soundLengthProblem,
  validateDraft,
  videoFileName,
  type Draft,
} from '../videoExportModel';

const meta = { width: 1920, height: 1080, fps: 60, target: 'ce' as const };

function online(caps: Partial<CompanionHealth['capabilities']> = {}): CompanionState {
  return {
    status: 'online',
    health: {
      name: 'mfe-companion',
      version: '1.1.0',
      protocol: 1,
      capabilities: {
        latex: true,
        dvisvgm: true,
        ffmpeg: true,
        manimCE: { python: '/p', version: '0.22.1' },
        manimGL: null,
        manimRender: true,
        manimSandbox: true,
        ...caps,
      },
    },
  };
}

const draft = (patch: Partial<Draft> = {}): Draft => ({ ...initialDraft(meta, 4), ...patch });
const check = (patch: Partial<Draft> = {}, duration = 4) =>
  validateDraft(draft(patch), { meta, duration });

describe('encoder availability', () => {
  it('offline: only the browser, and only with WebCodecs', () => {
    const a = encoderAvailability({ status: 'offline' }, true);
    expect(a.browser.ok).toBe(true);
    expect(a.ffmpeg).toMatchObject({ ok: false });
    expect(a.ffmpeg.reason).toMatch(/not running/);
    expect(a.manim.ok).toBe(false);
    const none = encoderAvailability({ status: 'offline' }, false);
    expect(none.browser.reason).toMatch(/WebCodecs/);
  });

  it('checking and unsupported say so', () => {
    expect(encoderAvailability({ status: 'checking' }, true).ffmpeg.reason).toMatch(/Looking/);
    expect(encoderAvailability({ status: 'unsupported' }, true).ffmpeg.reason).toMatch(
      /cannot reach/,
    );
  });

  it('ffmpeg needs the capability', () => {
    expect(encoderAvailability(online(), true).ffmpeg.ok).toBe(true);
    const a = encoderAvailability(online({ ffmpeg: false }), true);
    expect(a.ffmpeg.ok).toBe(false);
    expect(a.ffmpeg.reason).toMatch(/ffmpeg is not installed/);
    // A companion older than 1.1 (no manimRender field) has ffmpeg but no /video.
    const old = encoderAvailability(online({ manimRender: undefined }), true);
    expect(old.ffmpeg).toEqual({
      ok: false,
      reason:
        'This companion is older than 1.1 and cannot encode video. Update companion/mfe_companion.py.',
    });
  });

  it('Manim needs manimRender and an interpreter', () => {
    expect(encoderAvailability(online(), true).manim).toEqual({ ok: true, reason: null });
    expect(encoderAvailability(online({ manimRender: false }), true).manim.reason).toMatch(
      /--allow-manim-render/,
    );
    expect(encoderAvailability(online({ manimRender: undefined }), true).manim.reason).toMatch(
      /older than 1\.1/,
    );
    expect(
      encoderAvailability(online({ manimCE: null, manimGL: null }), true).manim.reason,
    ).toMatch(/--ce-python/);
  });

  it('says the companion is still looking for Manim while it probes the interpreters', () => {
    const probing = online({ manimCE: null, manimGL: null, manimProbing: true });
    expect(encoderAvailability(probing, true).manim).toEqual({
      ok: false,
      reason: 'The companion is still looking for Manim…',
    });
    expect(manimTargetAvailability(probing, 'gl')).toEqual({
      ok: false,
      reason: 'The companion is still looking for Manim…',
    });
  });

  it('warns, but allows it, when Manim would run without the sandbox', () => {
    const a = encoderAvailability(online({ manimSandbox: false }), true);
    expect(a.manim.ok).toBe(true);
    expect(a.manim.reason).toMatch(/without a sandbox/);
  });

  it('checks the interpreter of the chosen Manim', () => {
    expect(manimTargetAvailability(online(), 'ce').ok).toBe(true);
    const gl = manimTargetAvailability(online(), 'gl');
    expect(gl.ok).toBe(false);
    expect(gl.reason).toMatch(/--gl-python/);
    expect(manimTargetAvailability({ status: 'offline' }, 'ce').ok).toBe(false);
  });
});

describe('the sound of a video the companion makes', () => {
  it('is AAC in MP4 and MOV, Opus in WebM, and a GIF has none', () => {
    expect(companionAudioCodec('mp4')).toBe('AAC');
    expect(companionAudioCodec('mov')).toBe('AAC');
    expect(companionAudioCodec('webm')).toBe('Opus');
    expect(companionAudioCodec('gif')).toBeNull();
  });

  it('is offered for the formats the companion lists', () => {
    const state = online({ videoAudio: ['mp4', 'mov'] });
    expect(companionAudioAvailability(state, 'mp4')).toEqual({ ok: true, reason: null });
    expect(companionAudioAvailability(state, 'mov')).toEqual({ ok: true, reason: null });
    expect(companionAudioAvailability(state, 'webm')).toEqual({
      ok: false,
      reason:
        'The companion’s ffmpeg has no Opus encoder (libopus): it cannot add sound to this format.',
    });
    expect(companionAudioAvailability(online({ videoAudio: ['webm'] }), 'mp4').reason).toBe(
      'The companion’s ffmpeg has no AAC encoder: it cannot add sound to this format.',
    );
  });

  it('a GIF has no sound, whatever the companion', () => {
    expect(companionAudioAvailability(online({ videoAudio: ['mp4'] }), 'gif')).toEqual({
      ok: false,
      reason: 'A GIF has no sound.',
    });
    expect(companionAudioAvailability({ status: 'offline' }, 'gif').reason).toBe(
      'A GIF has no sound.',
    );
  });

  it('says what is missing: the companion, its ffmpeg, or a newer companion', () => {
    expect(companionAudioAvailability({ status: 'offline' }, 'mp4')).toMatchObject({
      ok: false,
      reason: expect.stringContaining('The companion is not running'),
    });
    expect(companionAudioAvailability(online({ ffmpeg: false, videoAudio: [] }), 'mp4')).toEqual({
      ok: false,
      reason:
        'ffmpeg is not installed on the companion’s machine (or not on PATH): it adds the sound.',
    });
    // companions before 1.5 do not send the field
    expect(companionAudioAvailability(online(), 'mp4')).toEqual({
      ok: false,
      reason:
        'This companion is older than 1.5 and cannot add sound. Update companion/mfe_companion.py.',
    });
  });
});

describe('how large a video the companion writes', () => {
  /** A companion that reports `videoBytes` as the limit of its videos (1.7). */
  const limited = (videoBytes: unknown): CompanionState => {
    const state = online();
    if (state.status === 'online') state.health.limits = { videoBytes: videoBytes as number };
    return state;
  };
  const GIB = 1024 ** 3;
  const said = (size: string) =>
    `Up to ${size} per video: the companion’s limit. Start it with --max-video-gib to give it another.`;

  it('says the limit the companion reports, in the unit its option takes', () => {
    expect(companionVideoLimit(limited(4 * GIB))).toEqual({ text: said('4 GiB'), caution: false });
    expect(companionVideoLimit(limited(16 * GIB))?.text).toBe(said('16 GiB'));
    expect(companionVideoLimit(limited(64 * GIB))?.text).toBe(said('64 GiB'));
    // whatever a companion reports is said as it is
    expect(companionVideoLimit(limited(1.5 * GIB))?.text).toBe(said('1.5 GiB'));
    expect(companionVideoLimit(limited(300 * 1024 ** 2))?.text).toBe(said('300 MiB'));
    expect(companionVideoLimit(limited(2000))?.text).toBe(said('2000 bytes'));
  });

  it('warns of a companion older than 1.7, whose video may come back cut short', () => {
    const old = {
      text: 'This companion is older than 1.7: a video over 4 GiB may come back cut short, with no warning. Update companion/mfe_companion.py.',
      caution: true,
    };
    expect(companionVideoLimit(online())).toEqual(old);
    // a value that is no size is no limit either
    for (const value of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, '4', null])
      expect(companionVideoLimit(limited(value)), String(value)).toEqual(old);
  });

  it('has nothing to say without a companion that encodes video', () => {
    expect(companionVideoLimit({ status: 'offline' })).toBeNull();
    expect(companionVideoLimit({ status: 'checking' })).toBeNull();
    expect(companionVideoLimit(online({ ffmpeg: false }))).toBeNull();
    expect(companionVideoLimit(online({ manimRender: undefined }))).toBeNull(); // before 1.1: no /video
  });
});

describe('the sound of an export', () => {
  it('lasts an hour at most; longer, the reason says how long it is', () => {
    expect(soundLengthProblem(2)).toBeNull();
    expect(soundLengthProblem(3600)).toBeNull();
    expect(soundLengthProblem(3600.5)).toBe(
      'An export takes at most 60 minutes of sound, and this one lasts 60.1 minutes.',
    );
    expect(soundLengthProblem(4000)).toBe(
      'An export takes at most 60 minutes of sound, and this one lasts 66.7 minutes.',
    );
  });
});

describe('draft validation', () => {
  it('defaults to the project size, frame rate and whole scene', () => {
    const r = check();
    expect(r.ok && r.values).toEqual({
      width: 1920,
      height: 1080,
      fps: 60,
      range: null,
      frames: 240,
      seconds: 4,
    });
  });

  it('uses presets and custom sizes', () => {
    const r = check({ sizePreset: '720p' });
    expect(r.ok && [r.values.width, r.values.height]).toEqual([1280, 720]);
    const c = check({ sizePreset: 'custom', width: '640', height: '480' });
    expect(c.ok && [c.values.width, c.values.height]).toEqual([640, 480]);
  });

  it('rejects odd, tiny and huge sizes (odd is fine for GIF)', () => {
    expect(check({ sizePreset: 'custom', width: '641', height: '480' }).errors).toHaveProperty(
      'width',
    );
    expect(check({ sizePreset: 'custom', width: '8', height: '480' }).errors).toHaveProperty(
      'width',
    );
    expect(check({ sizePreset: 'custom', width: '640', height: '9999' }).errors).toHaveProperty(
      'height',
    );
    expect(check({ sizePreset: 'custom', width: 'abc', height: '480' }).ok).toBe(false);
    expect(
      check({
        encoder: 'ffmpeg',
        ffmpegFormat: 'gif',
        sizePreset: 'custom',
        width: '641',
        height: '481',
        fps: '25',
      }).ok,
    ).toBe(true);
  });

  it('validates the frame rate; GIF is limited to 50 fps', () => {
    expect(check({ fps: 'custom', customFps: '0' }).errors).toHaveProperty('fps');
    expect(check({ fps: 'custom', customFps: '241' }).errors).toHaveProperty('fps');
    expect(check({ fps: 'custom', customFps: '12' }).ok).toBe(true);
    expect(check({ fps: '24' }).ok).toBe(true);
    const gif = check({ encoder: 'ffmpeg', ffmpegFormat: 'gif' }); // project fps = 60
    expect(gif.errors).toHaveProperty('fps');
    expect(check({ encoder: 'ffmpeg', ffmpegFormat: 'gif', fps: '30' }).ok).toBe(true);
  });

  it('validates the range against the scene length and counts its frames', () => {
    const ok = check({ rangeMode: 'custom', start: '1', end: '2.5', fps: '30' });
    expect(ok.ok && ok.values).toMatchObject({ range: [1, 2.5], frames: 45, seconds: 1.5 });
    expect(check({ rangeMode: 'custom', start: '3', end: '2' }).errors).toHaveProperty('end');
    expect(check({ rangeMode: 'custom', start: '0', end: '5' }).errors.end).toMatch(/lasts 4 s/);
    expect(check({ rangeMode: 'custom', start: 'x', end: '2' }).errors).toHaveProperty('start');
    expect(check({ rangeMode: 'custom', start: '0', end: '0.001' }).errors).toHaveProperty('range');
  });

  it('the default custom range validates, even when the length does not round exactly', () => {
    for (const duration of [2 / 3, 5, 0.0004 + 1, 12.3456789]) {
      const initial = { ...initialDraft(meta, duration), rangeMode: 'custom' as const };
      const r = validateDraft(initial, { meta, duration });
      expect(r.ok, `${duration}: ${JSON.stringify(r.errors)}`).toBe(true);
    }
    // a typed end that only differs by the 1 ms display rounding is the scene's end
    const r = validateDraft(draft({ rangeMode: 'custom', start: '0', end: '0.667' }), {
      meta,
      duration: 2 / 3,
    });
    expect(r.ok && r.values.range).toEqual([0, 2 / 3]);
  });

  it('Render with Manim always exports the whole scene', () => {
    const r = check({ encoder: 'manim', rangeMode: 'custom', start: '1', end: '2', fps: '30' });
    expect(r.ok && r.values).toMatchObject({ range: null, frames: 120 });
    expect(check({ encoder: 'manim', rangeMode: 'custom', start: 'x', end: '9' }).ok).toBe(true);
  });

  it('refuses an empty scene', () => {
    expect(check({}, 0).errors).toHaveProperty('range');
  });
});

describe('exportProject', () => {
  it('uses only visual rows and duration for native frame totals, keeping explicit duration', () => {
    const project = smallProject();
    const row = createAudioTrack('Music');
    project.tracks.unshift(row);
    project.audioClips.push(createAudioClip('asset', row.id, 0, 40));
    const values = {
      width: 640,
      height: 480,
      fps: 24,
      frames: 960,
      seconds: 40,
      range: [1, 2] as [number, number],
    };
    const exported = exportProject(project, values);
    expect(sceneDuration(exported)).toBe(6);
    expect(manimExportValues(exported, values)).toMatchObject({
      frames: 144,
      seconds: 6,
      range: null,
    });
    expect(project.audioClips).toHaveLength(1);
    project.meta.duration = 12;
    expect(manimExportValues(exportProject(project, values), values)).toMatchObject({
      frames: 288,
      seconds: 12,
    });
  });

  it('gives the project the output size and frame rate, and leaves the project alone', () => {
    const project = createEmptyProject('p');
    project.meta.width = 1920;
    project.meta.height = 1080;
    project.meta.fps = 60;
    const exported = exportProject(project, { width: 320, height: 320, fps: 24 });
    expect(exported.meta).toMatchObject({ width: 320, height: 320, fps: 24, name: 'p' });
    expect(exported.formulas).toBe(project.formulas);
    expect(project.meta).toMatchObject({ width: 1920, height: 1080, fps: 60 });
  });

  it('carries no marks of the Slides mode: a render has no use for them', () => {
    const project = createEmptyProject('p');
    project.slides = { marks: [{ id: 'p1', time: 40, kind: 'pause' }] };
    const exported = exportProject(project, { width: 320, height: 320, fps: 24 });
    expect(exported.slides).toBeUndefined();
    expect('slides' in exported).toBe(false);
    expect(project.slides.marks).toHaveLength(1);
  });
});

describe('names and warnings', () => {
  it('warns when the aspect differs from the project', () => {
    expect(aspectWarning(1280, 720, meta)).toBeNull();
    expect(aspectWarning(1000, 1000, meta)).toMatch(/less space at the sides/);
    expect(aspectWarning(2560, 1080, meta)).toMatch(/more space at the sides/);
  });

  it('builds file names from the project name', () => {
    expect(videoFileName('Quadratic formula', 'mp4')).toBe('Quadratic formula.mp4');
    expect(videoFileName('a/b:c*?', 'webm')).toBe('a-b-c.webm');
    expect(videoFileName('   ', 'gif')).toBe('video.gif');
    expect(videoFileName('..', 'mov')).toBe('video.mov');
  });

  it('names the Scene class as the Python export does', () => {
    for (const name of ['My Proof', 'quadratic formula', '3 steps', '¡¡', 'None', 'Scene']) {
      expect(manimSceneName(name)).toBe(sceneClassName(name));
    }
    expect(manimSceneName('My Proof')).toBe('MyProof');
    expect(manimSceneName('3 steps')).toBe('Scene3Steps');
  });

  it("stays within the companion's 64 characters", () => {
    expect(manimSceneName('x'.repeat(200))).toBe(`X${'x'.repeat(63)}`);
    for (const name of ['', '   ', '1', '日本語', 'a-b_c d', '999 problems', 'x'.repeat(200)]) {
      expect(manimSceneName(name)).toMatch(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/);
    }
  });
});
