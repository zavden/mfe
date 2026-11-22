// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import {
  producerOf,
  refreshLocalRenders,
  renderRequestFor,
  resolveFormula,
  textArtifactRender,
  textBoxesKey,
  toSnapshot,
  type CompanionClient,
  type TextRenderRequest,
} from '../../../engine';
import { CompanionJobError } from '../../../export';
import { boxSize, contoursBox } from '../../../geom';
import { OutOfMemoryError } from '../../../export/video/memoryFile';
import {
  createAudioClip,
  createAudioTrack,
  createClip,
  createEmphasis,
  createEmptyProject,
  createSceneCamera,
  createShapeFormula,
  createTextFormula,
  defaultIntro,
  defaultOutro,
  type Issue,
  type Project,
} from '../../../model';
import type { Drawable } from '../../../scene';
import { smallProject } from '../../../model/__tests__/fixtures';
import { textGeometry } from '../../../test/textGeometry';
import { manimSceneName, type ExportValues } from '../videoExportModel';
import {
  browserProgress,
  extensionOf,
  ffmpegProgress,
  manimProgress,
  runVideoExport,
  type FileDestination,
  type VideoJob,
  type VideoRun,
  type VideoRunDeps,
} from '../videoExportRun';

const client = {} as CompanionClient;
const project = createEmptyProject('My scene');
project.meta.duration = 2;
const resolved = new Map();
const values: ExportValues = {
  width: 640,
  height: 360,
  fps: 30,
  range: null,
  frames: 60,
  seconds: 2,
};
const browser: VideoJob = { encoder: 'browser', codec: 'avc', container: 'mp4' };
const ffmpeg: VideoJob = { encoder: 'ffmpeg', format: 'gif', quality: 'high' };
const manim: VideoJob = { encoder: 'manim', target: 'gl', quality: 'medium' };
const positional: Issue = {
  severity: 'warning',
  code: 'export-positional',
  message: 'f by position',
  path: [],
};

/** An exporter that runs until its signal is aborted; `begun` resolves once it is running. */
function pending() {
  let started = () => {};
  const begun = new Promise<void>((resolve) => {
    started = resolve;
  });
  const exporter = vi.fn(
    (_e: unknown, _o: unknown, _p: unknown, signal: AbortSignal) =>
      new Promise<Blob | null>((_, reject) => {
        started();
        signal.addEventListener('abort', () => reject(signal.reason));
      }),
  );
  return { exporter, begun };
}

function fakeDeps(over: Partial<VideoRunDeps> = {}): VideoRunDeps {
  return {
    companionClient: () => client,
    exportVideo: vi.fn(async () => new Blob(['mp4'])),
    exportVideoViaCompanion: vi.fn(async () => new Blob(['ffmpeg!'])),
    renderWithManim: vi.fn(async () => new Blob(['manim'])),
    generatePython: vi.fn(() => ({
      code: 'class S(Scene): pass',
      sceneName: 'S',
      issues: [],
      usedPositionalHelper: false,
    })),
    hasFileSystemAccess: () => false,
    openDestination: vi.fn(async () => null),
    downloadBlob: vi.fn(),
    notify: vi.fn(),
    ...over,
  };
}

function fakeFile(name: string, size = 2056) {
  const writable = {
    write: vi.fn(async () => undefined),
    close: vi.fn(async () => undefined),
    abort: vi.fn(async () => undefined),
  };
  const file: FileDestination = {
    name,
    writable,
    sink: { write: async () => undefined },
    size: () => size,
  };
  return { file, writable };
}

async function run(job: VideoJob, deps: VideoRunDeps, signal = new AbortController().signal) {
  const runs: VideoRun[] = [];
  await runVideoExport({ job, values, project, resolved }, (r) => runs.push(r), signal, deps);
  return runs;
}

describe('extensionOf', () => {
  it('follows the browser container, the ffmpeg format, and is mp4 for Manim', () => {
    expect(extensionOf(browser)).toBe('mp4');
    expect(extensionOf({ encoder: 'browser', codec: 'vp9', container: 'webm' })).toBe('webm');
    expect(extensionOf(ffmpeg)).toBe('gif');
    expect(extensionOf({ encoder: 'ffmpeg', format: 'mov', quality: 'low' })).toBe('mov');
    expect(extensionOf(manim)).toBe('mp4');
  });
});

describe('progress words', () => {
  it('browser: encoding with the frame counter', () => {
    expect(browserProgress({ frame: 12, totalFrames: 60 })).toEqual({
      label: 'Encoding',
      frame: 12,
      total: 60,
    });
  });
  it('ffmpeg: frames are counted while they are sent, not while ffmpeg finishes or the file downloads', () => {
    expect(ffmpegProgress({ phase: 'rendering', frame: 3, totalFrames: 60 })).toEqual({
      label: 'Sending frames',
      frame: 3,
      total: 60,
    });
    expect(ffmpegProgress({ phase: 'encoding', frame: 60, totalFrames: 60 }).label).toBe(
      'ffmpeg is finishing the file…',
    );
    expect(ffmpegProgress({ phase: 'encoding', frame: 60, totalFrames: 60 }).total).toBeNull();
    expect(ffmpegProgress({ phase: 'downloading', frame: 60, totalFrames: 60 }).label).toBe(
      'Downloading the video…',
    );
  });
  it('ffmpeg: the sound is sent first, and counted as a part of the whole, not in frames', () => {
    expect(ffmpegProgress({ phase: 'sound', frame: 24000, totalFrames: 96000 })).toEqual({
      label: 'Sending the sound (25%)',
      frame: 0,
      total: null,
    });
    expect(ffmpegProgress({ phase: 'sound', frame: 95999, totalFrames: 96000 }).label).toBe(
      'Sending the sound (99%)',
    );
    expect(ffmpegProgress({ phase: 'sound', frame: 96000, totalFrames: 96000 }).label).toBe(
      'Sending the sound (100%)',
    );
  });
  it('Manim: starting, rendering with the animation, downloading', () => {
    expect(
      manimProgress({ phase: 'running', frame: 0, totalFrames: 60, animation: null }, 'ce'),
    ).toEqual({ label: 'Manim is starting…', frame: 0, total: null });
    expect(
      manimProgress({ phase: 'running', frame: 10, totalFrames: 60, animation: 1 }, 'ce'),
    ).toEqual({ label: 'Manim CE is rendering (animation 2)', frame: 10, total: 60 });
    expect(
      manimProgress({ phase: 'running', frame: 10, totalFrames: null, animation: null }, 'gl'),
    ).toEqual({ label: 'Manim GL is rendering', frame: 10, total: null });
    expect(
      manimProgress({ phase: 'downloading', frame: 60, totalFrames: 60, animation: null }, 'gl'),
    ).toEqual({ label: 'Downloading the video…', frame: 60, total: null });
  });
  it('Manim with sound: the sound is sent before, and ffmpeg adds it after', () => {
    expect(
      manimProgress({ phase: 'sound', frame: 48000, totalFrames: 96000, animation: null }, 'ce'),
    ).toEqual({ label: 'Sending the sound (50%)', frame: 0, total: null });
    expect(
      manimProgress({ phase: 'encoding', frame: 60, totalFrames: 60, animation: 3 }, 'ce'),
    ).toEqual({ label: 'ffmpeg is adding the sound…', frame: 60, total: null });
  });
});

describe('runVideoExport', () => {
  it('projects native duration, Python and progress while keeping the captured document intact', async () => {
    const captured = smallProject();
    const row = createAudioTrack('Voice');
    captured.tracks.unshift(row);
    captured.audioClips.push(createAudioClip('missing-source', row.id, 0, 120));
    const runs: VideoRun[] = [];
    const deps = fakeDeps();
    const ownership = vi.fn(() => captured.audioClips.length === 1);
    await runVideoExport(
      {
        job: manim,
        values: { ...values, frames: 3600, seconds: 120 },
        project: captured,
        resolved,
      },
      (state) => runs.push(state),
      new AbortController().signal,
      deps,
      ownership,
    );
    const exported = vi.mocked(deps.generatePython).mock.calls[0]![0];
    expect(exported.audioClips).toEqual([]);
    expect(exported.audioAssets).toEqual([]);
    expect(exported.tracks).toHaveLength(2);
    expect(vi.mocked(deps.renderWithManim).mock.calls[0]![1].frames).toBe(180);
    expect(runs[0]).toMatchObject({ status: 'running', total: 180 });
    expect(runs.at(-1)).toMatchObject({ status: 'done' });
    expect(captured.audioClips).toHaveLength(1);
    expect(ownership).toHaveBeenCalled();
  });

  it('does not send an audio-only automatic scene to Manim', async () => {
    const captured = createEmptyProject();
    const row = createAudioTrack('Voice');
    captured.tracks.push(row);
    captured.audioClips.push(createAudioClip('missing-source', row.id, 0, 120));
    const runs: VideoRun[] = [];
    const deps = fakeDeps();
    await runVideoExport(
      { job: manim, values, project: captured, resolved },
      (state) => runs.push(state),
      new AbortController().signal,
      deps,
    );
    expect(runs.at(-1)).toMatchObject({
      status: 'error',
      message: expect.stringContaining('visual scene'),
    });
    expect(deps.generatePython).not.toHaveBeenCalled();
    expect(deps.renderWithManim).not.toHaveBeenCalled();
  });

  it.each([false, true])('checks ownership after encoder cleanup (file: %s)', async (toFile) => {
    let owned = true;
    const { file, writable } = fakeFile('owned.mp4');
    const deps = fakeDeps({
      hasFileSystemAccess: () => toFile,
      openDestination: async () => file,
      exportVideo: async () => {
        owned = false;
        return new Blob(['video']);
      },
    });
    const states: VideoRun[] = [];
    await runVideoExport(
      { job: browser, values, project, resolved },
      (state) => states.push(state),
      new AbortController().signal,
      deps,
      () => owned,
    );
    expect(states.at(-1)).toEqual({ status: 'cancelled' });
    expect(states.some((state) => state.status === 'committing')).toBe(false);
    expect(writable.close).not.toHaveBeenCalled();
    expect(deps.downloadBlob).not.toHaveBeenCalled();
    expect(writable.abort).toHaveBeenCalledTimes(toFile ? 1 : 0);
  });

  it('aborts a file returned by a picker after the run was cancelled', async () => {
    const abort = new AbortController();
    const { file, writable } = fakeFile('picked.mp4');
    const deps = fakeDeps({
      hasFileSystemAccess: () => true,
      openDestination: async () => {
        abort.abort();
        return file;
      },
    });
    expect((await run(browser, deps, abort.signal)).at(-1)).toEqual({ status: 'cancelled' });
    expect(deps.exportVideo).not.toHaveBeenCalled();
    expect(writable.abort).toHaveBeenCalledOnce();
    expect(writable.close).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'treats cancellation after commit began as irreversible (close fails: %s)',
    async (fails) => {
      const abort = new AbortController();
      const { file, writable } = fakeFile('committing.mp4');
      const diskError = new Error('Could not commit the file');
      writable.close.mockImplementation(async () => {
        abort.abort();
        if (fails) throw diskError;
      });
      const deps = fakeDeps({ hasFileSystemAccess: () => true, openDestination: async () => file });
      const states = await run(browser, deps, abort.signal);
      expect(states.at(-2)).toEqual({ status: 'committing' });
      expect(states.at(-1)).toMatchObject(
        fails ? { status: 'error', message: diskError.message } : { status: 'done' },
      );
      expect(states.some((state) => state.status === 'cancelled')).toBe(false);
      expect(writable.close).toHaveBeenCalledOnce();
      expect(writable.abort).toHaveBeenCalledTimes(fails ? 1 : 0);
    },
  );

  it('browser: the options, the progress, then the download of <name>.<ext>', async () => {
    const deps = fakeDeps();
    vi.mocked(deps.exportVideo).mockImplementation(async (_e, _o, onProgress) => {
      onProgress({ frame: 12, totalFrames: 60 });
      return new Blob(['mp4']);
    });
    const runs = await run(browser, deps);
    expect(deps.exportVideo).toHaveBeenCalledTimes(1);
    const [, options, , signal] = vi.mocked(deps.exportVideo).mock.calls[0]!;
    expect(options).toEqual({
      background: project.meta.background,
      width: 640,
      height: 360,
      fps: 30,
      codec: 'avc',
      container: 'mp4',
      bitrate: null,
      range: null,
      sink: null,
    });
    expect(signal.aborted).toBe(false);
    expect(runs).toEqual([
      { status: 'running', label: 'Starting…', frame: 0, total: 60 },
      { status: 'running', label: 'Encoding', frame: 12, total: 60 },
      { status: 'committing' },
      { status: 'done', fileName: 'My scene.mp4', size: 3, blob: expect.any(Blob) },
    ]);
    expect(deps.downloadBlob).toHaveBeenCalledWith('My scene.mp4', expect.any(Blob));
  });

  it('ffmpeg: the companion client, the format and quality, the phases', async () => {
    const deps = fakeDeps();
    vi.mocked(deps.exportVideoViaCompanion).mockImplementation(async (_c, _e, _o, onProgress) => {
      onProgress({ phase: 'rendering', frame: 5, totalFrames: 60 });
      onProgress({ phase: 'downloading', frame: 60, totalFrames: 60 });
      return new Blob(['ffmpeg!']);
    });
    const runs = await run(ffmpeg, deps);
    const [c, , options] = vi.mocked(deps.exportVideoViaCompanion).mock.calls[0]!;
    expect(c).toBe(client);
    expect(options).toMatchObject({
      format: 'gif',
      quality: 'high',
      width: 640,
      height: 360,
      fps: 30,
      range: null,
      sink: null,
    });
    expect(runs.map((r) => (r.status === 'running' ? r.label : r.status))).toEqual([
      'Starting…',
      'Sending frames',
      'Downloading the video…',
      'committing',
      'done',
    ]);
    expect(runs.at(-1)).toMatchObject({ fileName: 'My scene.gif', size: 7 });
  });

  it.each([
    ['browser', browser],
    ['ffmpeg', ffmpeg],
  ] as const)(
    '%s: the scene is evaluated in the frame of the video, as Manim renders it',
    async (_name, job) => {
      // A 16:9 project exported as a square video. A FocusOn disc starts at the frame's half
      // width plus its half height: 4 + 4 in that video, not the project's 7.11 + 4.
      const scene = createEmptyProject('Focus');
      Object.assign(scene.meta, { width: 1920, height: 1080, fps: 10, duration: 4 });
      const shape = createShapeFormula({ name: 'box', width: 2, height: 1 });
      const clip = createClip(shape.id, scene.tracks[0]!.id, 0, 4, {
        intro: defaultIntro('none'),
        outro: defaultOutro('none'),
      });
      clip.actions.push(createEmphasis(1, 'focus_on', 'all', { duration: 2, easing: 'linear' }));
      scene.formulas.push(shape);
      scene.clips.push(clip);
      const drawn = refreshLocalRenders(scene, new Map());
      let filmed: Drawable[] = [];
      const deps = fakeDeps({
        exportVideo: vi.fn(async (evaluator) => {
          filmed = evaluator.evaluate(2.5);
          return new Blob(['video']);
        }),
        exportVideoViaCompanion: vi.fn(async (_client, evaluator) => {
          filmed = evaluator.evaluate(2.5);
          return new Blob(['video']);
        }),
      });
      const square: ExportValues = {
        width: 320,
        height: 320,
        fps: 10,
        range: null,
        frames: 40,
        seconds: 4,
      };
      const runs: VideoRun[] = [];
      await runVideoExport(
        { job, values: square, project: drawn.project, resolved: drawn.formulas },
        (r) => runs.push(r),
        new AbortController().signal,
        deps,
      );
      expect(runs.at(-1)).toMatchObject({ status: 'done' });
      const disc = filmed.find((d) => d.role === 'temp');
      // Three quarters of the way of a linear block: a quarter of the radius 8 is left.
      expect(boxSize(contoursBox(disc!.path.contours))[0]).toBeCloseTo(4, 6);
    },
  );

  it.each([
    ['browser', browser],
    ['ffmpeg', ffmpeg],
  ] as const)(
    '%s: a scene with a camera that moves is filmed through it; one without is asked for as ever',
    async (_name, job) => {
      const framingOf = async (scene: Project) => {
        const deps = fakeDeps();
        const runs: VideoRun[] = [];
        await runVideoExport(
          { job, values, project: scene, resolved },
          (r) => runs.push(r),
          new AbortController().signal,
          deps,
        );
        expect(runs.at(-1)).toMatchObject({ status: 'done' });
        const options =
          job.encoder === 'browser'
            ? vi.mocked(deps.exportVideo).mock.calls[0]![1]
            : vi.mocked(deps.exportVideoViaCompanion).mock.calls[0]![2];
        return { options, framing: options.framing };
      };
      // No camera, and the camera a project starts with: no framing at all in the options.
      expect('framing' in (await framingOf(project)).options).toBe(false);
      const still: Project = { ...project, camera: createSceneCamera() };
      expect('framing' in (await framingOf(still)).options).toBe(false);
      // A move to a frame half as tall, three units to the right, during [1, 3), linear.
      const moving: Project = {
        ...project,
        camera: {
          ...createSceneCamera(),
          moves: [
            {
              id: 'n1',
              start: 1,
              duration: 2,
              easing: 'linear',
              to: { kind: 'frame', frame: { center: [3, 0], height: 4 } },
            },
          ],
        },
      };
      const { framing } = await framingOf(moving);
      expect(framing!(0)).toEqual({ center: [0, 0], height: 8 });
      expect(framing!(2)).toEqual({ center: [1.5, 0], height: 6 });
      expect(framing!(3)).toEqual({ center: [3, 0], height: 4 });
    },
  );

  it('Manim: the Python of the output size and frame rate, the request, the issues as a notice', async () => {
    const deps = fakeDeps({
      // The class the generator wrote is not the one asked for (a name the scene could not take:
      // B-10 of the final audit): the render is asked for the class there is.
      generatePython: vi.fn(() => ({
        code: 'class MySceneScene(Scene): pass',
        sceneName: 'MySceneScene',
        issues: [positional],
        usedPositionalHelper: true,
      })),
    });
    const runs = await run(manim, deps);
    const [exported, formulas, options] = vi.mocked(deps.generatePython).mock.calls[0]!;
    expect(exported.meta).toMatchObject({ name: 'My scene', width: 640, height: 360, fps: 30 });
    expect(project.meta.width).not.toBe(640); // the project itself is left alone
    expect(formulas).toBe(resolved);
    expect(options).toEqual({
      target: 'gl',
      sceneName: manimSceneName('My scene'),
      indexing: 'auto',
      comments: true,
    });
    const [c, request, , , manimOptions] = vi.mocked(deps.renderWithManim).mock.calls[0]!;
    expect(c).toBe(client);
    expect(manimSceneName('My scene')).toBe('MyScene');
    expect(request).toEqual({
      target: 'gl',
      code: 'class MySceneScene(Scene): pass',
      scene: 'MySceneScene',
      quality: 'medium',
      width: 640,
      height: 360,
      fps: 30,
      frames: 60,
    });
    expect(manimOptions).toEqual({ sink: null });
    expect(deps.notify).toHaveBeenCalledWith({
      kind: 'warning',
      title: 'Notes about the exported scene',
      details: ['f by position'],
    });
    expect(runs.at(-1)).toMatchObject({ status: 'done', fileName: 'My scene.mp4' });
  });

  it('Manim: a font text the companion cannot vouch for does not stop the render', async () => {
    // Its fonts may have changed, or the companion shapes no text: the dialog says so, the
    // scene checks itself, and the render goes on (D82).
    const artifact = textGeometry('AB', undefined, 'ce');
    const shape = textArtifactRender(artifact);
    const text = createTextFormula({ name: 'title', source: 'AB', snapshot: toSnapshot(shape) });
    const withText = createEmptyProject('My scene');
    withText.formulas.push(text);
    withText.clips.push(createClip(text.id, withText.tracks[0]!.id, 0, 2));
    const shapes = new Map([[text.id, resolveFormula(text, shape)]]);
    const offline = { state: () => ({ status: 'offline' }) } as unknown as CompanionClient;
    for (const target of ['ce', 'gl'] as const) {
      const deps = fakeDeps({ companionClient: () => offline });
      const runs: VideoRun[] = [];
      await runVideoExport(
        { job: { ...manim, target }, values, project: withText, resolved: shapes },
        (r) => runs.push(r),
        new AbortController().signal,
        deps,
      );
      expect(runs.at(-1)).toMatchObject({ status: 'done' });
      expect(deps.renderWithManim).toHaveBeenCalledOnce();
    }
  });

  it('a font text the project’s library has not shaped is drawn from the shape it has', async () => {
    // The project names ManimGL and the text still is ManimCE's (nothing shaped it again): the
    // preview draws that shape, and so do the three encoders.
    const artifact = textGeometry('AB', undefined, 'ce');
    const shape = textArtifactRender(artifact);
    const text = createTextFormula({ name: 'title', source: 'AB', snapshot: toSnapshot(shape) });
    const withText = createEmptyProject('My scene');
    withText.meta.target = 'gl';
    withText.formulas.push(text);
    withText.clips.push(createClip(text.id, withText.tracks[0]!.id, 0, 2));
    const shapes = new Map([[text.id, resolveFormula(text, shape)]]);
    for (const job of [browser, ffmpeg, manim]) {
      const deps = fakeDeps();
      const runs: VideoRun[] = [];
      await runVideoExport(
        { job, values, project: withText, resolved: shapes },
        (r) => runs.push(r),
        new AbortController().signal,
        deps,
      );
      expect(runs.at(-1), job.encoder).toMatchObject({ status: 'done' });
    }
  });

  it('a font text nothing has shaped is filmed as its boxes, and rendered by Manim', async () => {
    // What the preview shows is what Browser and ffmpeg film; Manim gets the text written.
    const draft = createTextFormula({ name: 'title', source: 'AB' });
    const withText = createEmptyProject('My scene');
    const request = renderRequestFor(draft, withText.meta, 'auto') as TextRenderRequest;
    const boxes = producerOf('text').free(request, textBoxesKey(request));
    if (!boxes.ok) throw new Error(boxes.error.message);
    const text = { ...draft, snapshot: toSnapshot(boxes.render) };
    withText.formulas.push(text);
    withText.clips.push(createClip(text.id, withText.tracks[0]!.id, 0, 2));
    const drawn = new Map([[text.id, resolveFormula(text, boxes.render)]]);
    for (const job of [browser, ffmpeg, manim]) {
      const deps = fakeDeps();
      const runs: VideoRun[] = [];
      await runVideoExport(
        { job, values, project: withText, resolved: drawn },
        (r) => runs.push(r),
        new AbortController().signal,
        deps,
      );
      expect(runs.at(-1), job.encoder).toMatchObject({ status: 'done' });
    }
  });

  it('Manim: boxes that count nothing stop the render, which would leave the text out', async () => {
    // Boxes of the text as it stands, over a snapshot nothing could carry over (confidence 0).
    const draft = createTextFormula({ name: 'title', source: 'AB' });
    const withText = createEmptyProject('My scene');
    const request = renderRequestFor(draft, withText.meta, 'auto') as TextRenderRequest;
    const boxes = producerOf('text').free(request, textBoxesKey(request));
    if (!boxes.ok) throw new Error(boxes.error.message);
    const text = {
      ...draft,
      snapshot: { ...toSnapshot(boxes.render), key: 'pango-of-an-earlier-text' },
    };
    withText.formulas.push(text);
    withText.clips.push(createClip(text.id, withText.tracks[0]!.id, 0, 2));
    const unsure = new Map([
      [
        text.id,
        { ...resolveFormula(text, boxes.render), canonToRender: [null, null], confidence: 0 },
      ],
    ]);
    const run = async (job: VideoJob) => {
      const deps = fakeDeps();
      const runs: VideoRun[] = [];
      await runVideoExport(
        { job, values, project: withText, resolved: unsure },
        (r) => runs.push(r),
        new AbortController().signal,
        deps,
      );
      return { last: runs.at(-1), deps };
    };
    // Browser films the boxes, as the preview shows them.
    expect((await run(browser)).last).toMatchObject({ status: 'done' });
    const stopped = await run(manim);
    expect(stopped.last).toMatchObject({
      status: 'error',
      message:
        'Nothing counts the glyphs of font text "title" as it stands, so the scene for Manim ' +
        'would leave it out: Refresh appearance, in its editor, shapes it again.',
    });
    expect(stopped.deps.generatePython).not.toHaveBeenCalled();
  });

  it('a font text with no shape of its current source stops the export, and says which', async () => {
    const shape = textArtifactRender(textGeometry('AB', undefined, 'ce'));
    const text = createTextFormula({ name: 'title', source: 'ABC', snapshot: toSnapshot(shape) });
    const withText = createEmptyProject('My scene');
    withText.formulas.push(text);
    withText.clips.push(createClip(text.id, withText.tracks[0]!.id, 0, 2));
    const shapes = new Map([[text.id, resolveFormula(text, shape)]]);
    const deps = fakeDeps();
    const runs: VideoRun[] = [];
    await runVideoExport(
      { job: browser, values, project: withText, resolved: shapes },
      (r) => runs.push(r),
      new AbortController().signal,
      deps,
    );
    expect(runs.at(-1)).toMatchObject({
      status: 'error',
      message:
        'Font text "title" has no shape of its current source and font: the companion shapes it.',
    });
    expect(deps.exportVideo).not.toHaveBeenCalled();
  });

  it('Manim: a code generator failure is reported without calling the companion', async () => {
    const deps = fakeDeps({
      generatePython: vi.fn(() => {
        throw new Error('boom');
      }),
    });
    const runs = await run(manim, deps);
    expect(runs.at(-1)).toEqual({
      status: 'error',
      message: 'The Python exporter failed: boom',
      log: '',
    });
    expect(deps.renderWithManim).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
  });

  it.each([
    { encoder: 'ffmpeg', job: ffmpeg, message: 'ffmpeg exited with 1', log: 'the log tail' },
    {
      encoder: 'Manim',
      job: { ...manim, target: 'ce' } as const,
      message: "NameError: name 'foo' is not defined",
      log: 'Traceback…\nNameError',
    },
  ])(
    '$encoder: a companion job that fails shows its message and log',
    async ({ job, message, log }) => {
      const fail = async () => {
        throw new CompanionJobError(message, log);
      };
      const deps = fakeDeps({
        exportVideoViaCompanion: vi.fn(fail),
        renderWithManim: vi.fn(fail),
      });
      const runs = await run(job, deps);
      expect(runs.at(-1)).toEqual({ status: 'error', message, log });
      expect(deps.downloadBlob).not.toHaveBeenCalled();
      expect(deps.exportVideoViaCompanion).toHaveBeenCalledTimes(job.encoder === 'ffmpeg' ? 1 : 0);
      expect(deps.renderWithManim).toHaveBeenCalledTimes(job.encoder === 'manim' ? 1 : 0);
    },
  );

  it('an encoder that returns no file (and wrote none) is an error', async () => {
    const deps = fakeDeps({ exportVideo: vi.fn(async () => null) });
    const runs = await run(browser, deps);
    expect(runs.at(-1)).toEqual({
      status: 'error',
      message: 'The encoder returned no file.',
      log: '',
    });
  });

  describe('a file assembled in memory that the browser cannot hold', () => {
    const refused = new RangeError('Array buffer allocation failed');

    it('ends with an error that says what happened and what to do, with the engine’s words in it', async () => {
      const runs = await run(
        browser,
        fakeDeps({ exportVideo: vi.fn().mockRejectedValue(refused) }),
      );
      expect(runs.at(-1)).toEqual({
        status: 'error',
        message:
          'The browser ran out of memory while it assembled the file (it said: “Array buffer ' +
          'allocation failed”). Export a shorter range, a smaller size or a lower frame rate, ' +
          'use the companion, or a browser that writes the file as it is encoded (Chrome or Edge).',
        log: '',
      });
    });

    it('says how far the file got when the app’s own file in memory was refused a page', async () => {
      const runs = await run(
        browser,
        fakeDeps({
          exportVideo: vi.fn().mockRejectedValue(new OutOfMemoryError(1536 * 1024 ** 2)),
        }),
      );
      expect(runs.at(-1)).toMatchObject({
        status: 'error',
        message:
          'The browser ran out of memory after 1536 MB of the file. Export a shorter range, ' +
          'a smaller size or a lower frame rate, use the companion, or a browser that writes ' +
          'the file as it is encoded (Chrome or Edge).',
      });
    });

    it('the companion’s file: the advice does not send the user to the companion', async () => {
      const runs = await run(
        ffmpeg,
        fakeDeps({ exportVideoViaCompanion: vi.fn().mockRejectedValue(refused) }),
      );
      expect(runs.at(-1)).toMatchObject({
        status: 'error',
        message:
          'The browser ran out of memory while it assembled the file (it said: “Array buffer ' +
          'allocation failed”). Export a shorter range, a smaller size or a lower frame rate, ' +
          'or use a browser that writes the file as it arrives (Chrome or Edge).',
      });
    });

    it('Render with Manim: the advice names no range, for there is none to shorten', async () => {
      const runs = await run(
        manim,
        fakeDeps({ renderWithManim: vi.fn().mockRejectedValue(refused) }),
      );
      expect(runs.at(-1)).toMatchObject({
        status: 'error',
        message:
          'The browser ran out of memory while it assembled the file (it said: “Array buffer ' +
          'allocation failed”). Export a smaller size or a lower frame rate, or use a browser ' +
          'that writes the file as it arrives (Chrome or Edge).',
      });
    });

    it('what a job of the companion says of its own memory keeps its words and its log', async () => {
      // Manim, or ffmpeg, out of memory on the companion's side: not the browser's file.
      const failed = new CompanionJobError('Cairo: out of memory', 'Traceback…\nMemoryError');
      const runs = await run(
        manim,
        fakeDeps({ renderWithManim: vi.fn().mockRejectedValue(failed) }),
      );
      expect(runs.at(-1)).toEqual({
        status: 'error',
        message: 'Cairo: out of memory',
        log: 'Traceback…\nMemoryError',
      });
    });

    it('a file the user chose is not assembled in memory: its errors stay as they are', async () => {
      const { file } = fakeFile('scene.mp4');
      const runs = await run(
        browser,
        fakeDeps({
          hasFileSystemAccess: () => true,
          openDestination: vi.fn(async () => file),
          exportVideo: vi.fn().mockRejectedValue(refused),
        }),
      );
      expect(runs.at(-1)).toMatchObject({
        status: 'error',
        message: 'Array buffer allocation failed',
      });
    });
  });

  it('aborting the signal ends the export as cancelled, as does an AbortError', async () => {
    const abort = new AbortController();
    const { exporter, begun } = pending();
    const deps = fakeDeps({ exportVideo: exporter });
    const running = run(browser, deps, abort.signal);
    await begun;
    abort.abort();
    expect((await running).at(-1)).toEqual({ status: 'cancelled' });
    expect(deps.downloadBlob).not.toHaveBeenCalled();

    const aborted = Object.assign(new Error('The job was cancelled'), { name: 'AbortError' });
    const other = fakeDeps({ exportVideoViaCompanion: vi.fn(async () => Promise.reject(aborted)) });
    expect((await run(ffmpeg, other)).at(-1)).toEqual({ status: 'cancelled' });
  });

  describe('a file the user chooses (File System Access API)', () => {
    it('is asked for first, written through its sink, closed, and nothing is downloaded', async () => {
      const { file, writable } = fakeFile('chosen.mp4');
      const order: string[] = [];
      const deps = fakeDeps({
        hasFileSystemAccess: () => true,
        openDestination: vi.fn(async () => {
          order.push('pick');
          return file;
        }),
        exportVideo: vi.fn(async (_e, options) => {
          order.push('encode');
          expect(options.sink?.write).toEqual(expect.any(Function));
          return null;
        }),
      });
      const runs = await run(browser, deps);
      expect(deps.openDestination).toHaveBeenCalledWith('My scene.mp4', 'mp4');
      expect(order).toEqual(['pick', 'encode']);
      expect(writable.close).toHaveBeenCalledTimes(1);
      expect(writable.abort).not.toHaveBeenCalled();
      expect(runs.at(-1)).toEqual({
        status: 'done',
        fileName: 'chosen.mp4',
        size: 2056,
        blob: null,
      });
      expect(deps.downloadBlob).not.toHaveBeenCalled();
    });

    it('a cancelled picker starts nothing and reports nothing', async () => {
      const deps = fakeDeps({ hasFileSystemAccess: () => true });
      const runs = await run(browser, deps);
      expect(runs).toEqual([]);
      expect(deps.exportVideo).not.toHaveBeenCalled();
    });

    it('a picker that fails is an error before anything starts', async () => {
      const deps = fakeDeps({
        hasFileSystemAccess: () => true,
        openDestination: vi.fn(async () => {
          throw new Error('denied');
        }),
      });
      const runs = await run(browser, deps);
      expect(runs).toEqual([
        { status: 'error', message: 'Could not open the file: denied', log: '' },
      ]);
      expect(deps.exportVideo).not.toHaveBeenCalled();
    });

    it('a half-written file is thrown away when the export fails or is cancelled', async () => {
      const failed = fakeFile('chosen.gif');
      const deps = fakeDeps({
        hasFileSystemAccess: () => true,
        openDestination: vi.fn(async () => failed.file),
        exportVideoViaCompanion: vi.fn(async () => {
          throw new Error('The companion went away.');
        }),
      });
      expect((await run(ffmpeg, deps)).at(-1)).toMatchObject({
        status: 'error',
        message: 'The companion went away.',
      });
      expect(failed.writable.abort).toHaveBeenCalledTimes(1);
      expect(failed.writable.close).not.toHaveBeenCalled();

      const cancelled = fakeFile('chosen.mp4');
      const abort = new AbortController();
      const { exporter, begun } = pending();
      const other = fakeDeps({
        hasFileSystemAccess: () => true,
        openDestination: vi.fn(async () => cancelled.file),
        exportVideo: exporter,
      });
      const running = run(browser, other, abort.signal);
      await begun;
      abort.abort();
      expect((await running).at(-1)).toEqual({ status: 'cancelled' });
      expect(cancelled.writable.abort).toHaveBeenCalledTimes(1);
    });
  });
});
