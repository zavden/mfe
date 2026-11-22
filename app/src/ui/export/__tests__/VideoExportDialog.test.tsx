import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BACKEND_VERSIONS,
  producerOf,
  renderKey,
  renderRequestFor,
  resolveFormula,
  savedBoxesRender,
  textArtifactRender,
  textBoxesKey,
  textSavedBoxesKey,
  toSnapshot,
  type CompanionClient,
  type CompanionHealth,
  type CompanionState,
  type TextRenderRequest,
} from '../../../engine';
import {
  packagesOf,
  createAudioAsset,
  createAudioClip,
  createAudioTrack,
  createClip,
  createEmptyProject,
  createFormula,
  createTextFormula,
} from '../../../model';
import type { SceneEvaluator } from '../../../scene';
import { loadProject, useProjectStore, useRenderStore } from '../../../store';
import { useNoticeStore } from '../../project/noticeStore';
import { useDocumentStore } from '../../project/documentStore';
import { resolvedBoxes } from '../../preview/__tests__/resolvedBoxes';
import { textGeometry } from '../../../test/textGeometry';

const hoisted = vi.hoisted(() => ({
  companion: { status: 'offline' } as CompanionState,
  canEncode: true,
  support: { avc: true, av1: false, vp9: true },
  aac: true,
  client: {} as CompanionClient,
  exportVideo: vi.fn(),
  generatePython: vi.fn(),
  exportVideoViaCompanion: vi.fn(),
  renderWithManim: vi.fn(),
  downloadBlob: vi.fn(),
  fileSystemAccess: false,
  pickSaveHandleFor: vi.fn(),
  holdRecordings: vi.fn(),
}));

vi.mock('../../useCompanion', () => ({
  useCompanionState: () => hoisted.companion,
}));
vi.mock('../../../engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../engine')>()),
  companionClient: () => hoisted.client,
}));
vi.mock('../../../export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../export')>()),
  exportVideo: hoisted.exportVideo,
  generatePython: hoisted.generatePython,
  browserCanEncode: () => hoisted.canEncode,
  probeCodecs: async () => hoisted.support,
  exportVideoViaCompanion: hoisted.exportVideoViaCompanion,
  renderWithManim: hoisted.renderWithManim,
}));
vi.mock('../../../export/audio', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../export/audio')>()),
  canEncodeAac: async () => hoisted.aac,
}));
vi.mock('../soundSources', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../soundSources')>()),
  holdRecordings: hoisted.holdRecordings,
}));
vi.mock('../../project/files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../project/files')>()),
  downloadBlob: hoisted.downloadBlob,
  hasFileSystemAccess: () => hoisted.fileSystemAccess,
  pickSaveHandleFor: hoisted.pickSaveHandleFor,
}));

import { VideoExportDialog } from '../VideoExportDialog';

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
        manimCE: { python: '/ce', version: '0.22.1' },
        manimGL: null,
        manimRender: false,
        manimSandbox: true,
        ...caps,
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.companion = { status: 'offline' };
  hoisted.canEncode = true;
  hoisted.support = { avc: true, av1: false, vp9: true };
  hoisted.aac = true;
  const project = createEmptyProject();
  project.meta = { ...project.meta, name: 'My scene', width: 1280, height: 720, fps: 30 };
  const formula = { ...createFormula({ name: 'f1', source: 'x' }), id: 'f_1' };
  project.formulas.push(formula);
  const track = project.tracks[0]!;
  project.clips.push({
    ...createClip(formula.id, track.id, 0, 2),
    id: 'c_1',
  });
  loadProject(project);
  useRenderStore.setState({ prefer: 'auto', entries: {}, resolved: new Map() });
  useNoticeStore.getState().clear();
  withRender();
});

/** Fresh glyph boxes with the real current-render key: readiness needs correspondence, not TeX. */
function renderF1() {
  const { formulas, meta } = useProjectStore.getState().project;
  const formula = formulas[0]!;
  const request = {
    kind: 'math' as const,
    latex: formula.source,
    packages: packagesOf(formula),
    preamble: meta.preamble,
    target: meta.target,
    fontSize: formula.fontSize,
    prefer: 'auto' as const,
  };
  const resolved = resolvedBoxes(formula, [{ minX: -0.11, minY: -0.16, maxX: 0.11, maxY: 0.16 }]);
  resolved.render.key = renderKey(request, 'mathjax', BACKEND_VERSIONS.mathjax);
  return resolved;
}

/** f1 has a render. */
function withRender() {
  const resolved = renderF1();
  useRenderStore.getState().setEntry(resolved.formula.id, { status: 'ok', resolved, error: null });
}

/** f1's current LaTeX fails; its earlier render ("x") is kept. */
function failWithOldRender() {
  const resolved = renderF1();
  useRenderStore.getState().setEntry(resolved.formula.id, {
    status: 'error',
    resolved,
    error: { message: 'Missing close brace', backend: 'mathjax' },
  });
}

/** f1's LaTeX fails and it never rendered. */
function failWithoutRender() {
  useRenderStore.getState().setEntry('f_1', {
    status: 'error',
    resolved: null,
    error: { message: 'Missing close brace', backend: 'mathjax' },
  });
}

const open = async () => {
  const user = userEvent.setup();
  render(<VideoExportDialog onClose={vi.fn()} />);
  await screen.findByTestId('export-video');
  return user;
};

describe('encoder choices', () => {
  it('offline: only the browser is usable and the others say why', async () => {
    await open();
    expect(screen.getByTestId('video-encoder-browser')).toBeEnabled();
    expect(screen.getByTestId('video-encoder-browser')).toBeChecked();
    expect(screen.getByTestId('video-encoder-ffmpeg')).toBeDisabled();
    expect(screen.getByTestId('video-encoder-manim')).toBeDisabled();
    expect(screen.getByTestId('video-encoder-hint-ffmpeg')).toHaveTextContent(/not running/);
    expect(screen.getByTestId('video-encoder-hint-manim')).toHaveTextContent(/not running/);
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });

  it('without WebCodecs and offline nothing can be exported', async () => {
    hoisted.canEncode = false;
    await open();
    expect(screen.getByTestId('video-encoder-browser')).toBeDisabled();
    expect(screen.getByTestId('video-encoder-hint-browser')).toHaveTextContent(/WebCodecs/);
    expect(screen.getByTestId('video-start')).toBeDisabled();
  });

  it('without WebCodecs but with ffmpeg it hands over to the companion', async () => {
    hoisted.canEncode = false;
    hoisted.companion = online();
    await open();
    expect(screen.getByTestId('video-encoder-ffmpeg')).toBeChecked();
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });

  it('ffmpeg only: Manim says the companion must be started with --allow-manim-render', async () => {
    hoisted.companion = online();
    await open();
    expect(screen.getByTestId('video-encoder-ffmpeg')).toBeEnabled();
    expect(screen.getByTestId('video-encoder-manim')).toBeDisabled();
    expect(screen.getByTestId('video-encoder-hint-manim')).toHaveTextContent(
      /--allow-manim-render/,
    );
  });

  it('an old companion cannot render with Manim', async () => {
    hoisted.companion = online({ manimRender: undefined });
    await open();
    expect(screen.getByTestId('video-encoder-hint-manim')).toHaveTextContent(/older than 1\.1/);
  });

  it('ffmpeg missing on the companion', async () => {
    hoisted.companion = online({ ffmpeg: false });
    await open();
    expect(screen.getByTestId('video-encoder-ffmpeg')).toBeDisabled();
    expect(screen.getByTestId('video-encoder-hint-ffmpeg')).toHaveTextContent(
      /ffmpeg is not installed/,
    );
  });

  it('Manim enabled: the target needs its interpreter', async () => {
    hoisted.companion = online({ manimRender: true });
    const user = await open();
    expect(screen.getByTestId('video-encoder-manim')).toBeEnabled();
    await user.click(screen.getByTestId('video-encoder-manim'));
    await user.selectOptions(screen.getByTestId('video-manim-target'), 'gl');
    expect(screen.getByTestId('video-manim-target-hint')).toHaveTextContent(/--gl-python/);
    expect(screen.getByTestId('video-start')).toBeDisabled();
    await user.selectOptions(screen.getByTestId('video-manim-target'), 'ce');
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });

  it('filters the browser formats by what the browser supports', async () => {
    await open();
    const select = screen.getByTestId('video-format') as HTMLSelectElement;
    await waitFor(() => {
      const av1 = [...select.options].find((o) => o.value === 'av1-mp4')!;
      expect(av1.disabled).toBe(true);
    });
    expect([...select.options].find((o) => o.value === 'vp9-webm')!.disabled).toBe(false);
  });
});

describe('how large a video the companion writes', () => {
  const limit = () => screen.queryByTestId('video-size-limit');
  /** A companion that reports the limit of its videos (1.7). */
  const limited = (videoBytes: number): CompanionState => {
    const state = online();
    if (state.status === 'online') state.health.limits = { videoBytes };
    return state;
  };

  it('is said with the ffmpeg options, and only there', async () => {
    hoisted.companion = limited(8 * 1024 ** 3);
    const user = await open();
    expect(limit()).toBeNull(); // the browser encodes: the limit is not its own
    await user.click(screen.getByTestId('video-encoder-ffmpeg'));
    expect(limit()).toHaveTextContent(
      'Up to 8 GiB per video: the companion’s limit. Start it with --max-video-gib to give it another.',
    );
    expect(limit()).toHaveClass('field-hint');
    await user.click(screen.getByTestId('video-encoder-browser'));
    expect(limit()).toBeNull();
  });

  it('is a warning with a companion older than 1.7, which says nothing of it', async () => {
    hoisted.companion = online();
    const user = await open();
    await user.click(screen.getByTestId('video-encoder-ffmpeg'));
    expect(limit()).toHaveTextContent(
      'This companion is older than 1.7: a video over 4 GiB may come back cut short, with no warning. Update companion/mfe_companion.py.',
    );
    expect(limit()).toHaveClass('field-warning');
    // the options still work: the export is not held back
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });
});

describe('the sound of an MP4', () => {
  const withSound = () =>
    useProjectStore.getState().update((draft) => {
      const track = createAudioTrack('Voice');
      draft.tracks.unshift(track);
      draft.audioClips.push(createAudioClip('narration', track.id, 0, 2));
    });
  const notice = () => screen.queryByTestId('video-audio-opus');

  it('is AAC where the browser encodes it: nothing to say', async () => {
    withSound();
    await open();
    await waitFor(() => expect(screen.getByTestId('video-estimate')).toBeInTheDocument());
    expect(notice()).toBeNull();
  });

  it('is Opus where the browser has no AAC encoder, and the dialog says who reads it', async () => {
    hoisted.aac = false;
    withSound();
    const user = await open();
    expect(await screen.findByTestId('video-audio-opus')).toHaveTextContent(
      'The sound of this MP4 will be Opus: this browser has no AAC encoder.',
    );
    // WebM always carried Opus, and a video without sound has none to warn about.
    await user.selectOptions(screen.getByTestId('video-format'), 'vp9-webm');
    expect(notice()).toBeNull();
    await user.selectOptions(screen.getByTestId('video-format'), 'avc-mp4');
    expect(notice()).not.toBeNull();
    await user.click(screen.getByTestId('video-include-audio'));
    expect(notice()).toBeNull();
  });

  it('is not mentioned for a project without audio', async () => {
    hoisted.aac = false;
    await open();
    await waitFor(() => expect(screen.getByTestId('video-estimate')).toBeInTheDocument());
    expect(notice()).toBeNull();
  });

  describe('one click to the companion’s ffmpeg, which has the AAC encoder', () => {
    const shortcut = () => screen.queryByTestId('video-audio-use-ffmpeg');

    it('goes to Companion · ffmpeg with MP4, the sound still included', async () => {
      hoisted.aac = false;
      withSound();
      hoisted.companion = online({ videoAudio: ['mp4', 'mov', 'webm'] });
      const user = await open();
      await screen.findByTestId('video-audio-opus');
      expect(shortcut()).toHaveTextContent('Use Companion · ffmpeg for AAC (MP4 · H.264)');
      await user.click(shortcut()!);
      expect(screen.getByTestId('video-encoder-ffmpeg')).toBeChecked();
      expect(screen.getByTestId('video-format')).toHaveValue('mp4');
      expect(screen.getByTestId('video-include-audio')).toBeChecked();
      expect(screen.getByTestId('video-audio-note')).toHaveTextContent(
        'ffmpeg encodes the sound as AAC.',
      );
      expect(notice()).toBeNull();
    });

    it('goes to MP4 even when the ffmpeg format was another one', async () => {
      hoisted.aac = false;
      withSound();
      hoisted.companion = online({ videoAudio: ['mp4', 'mov', 'webm'] });
      const user = await open();
      await user.click(screen.getByTestId('video-encoder-ffmpeg'));
      await user.selectOptions(screen.getByTestId('video-format'), 'gif');
      await user.click(screen.getByTestId('video-encoder-browser'));
      await user.click((await screen.findByTestId('video-audio-use-ffmpeg'))!);
      expect(screen.getByTestId('video-format')).toHaveValue('mp4');
    });

    it('is offered only when that ffmpeg can do it', async () => {
      hoisted.aac = false;
      withSound();
      for (const state of [
        { status: 'offline' } as const,
        online(), // before 1.5
        online({ videoAudio: ['webm'] }), // no AAC encoder there either
        online({ ffmpeg: false, videoAudio: [] }),
      ]) {
        hoisted.companion = state;
        const view = render(<VideoExportDialog onClose={vi.fn()} />);
        await screen.findByTestId('video-audio-opus');
        expect(shortcut()).toBeNull();
        view.unmount();
      }
    });

    it('is not there when nothing is wrong with the sound', async () => {
      withSound(); // the browser encodes AAC
      hoisted.companion = online({ videoAudio: ['mp4'] });
      await open();
      await waitFor(() => expect(screen.getByTestId('video-estimate')).toBeInTheDocument());
      expect(shortcut()).toBeNull();
    });

    it('is not there for a WebM, whose sound is Opus by nature, nor without sound', async () => {
      hoisted.aac = false;
      withSound();
      hoisted.companion = online({ videoAudio: ['mp4'] });
      const user = await open();
      expect(await screen.findByTestId('video-audio-use-ffmpeg')).toBeInTheDocument();
      await user.selectOptions(screen.getByTestId('video-format'), 'vp9-webm');
      expect(shortcut()).toBeNull();
      await user.selectOptions(screen.getByTestId('video-format'), 'avc-mp4');
      expect(shortcut()).not.toBeNull();
      await user.click(screen.getByTestId('video-include-audio'));
      expect(shortcut()).toBeNull();
    });
  });
});

describe('the sound of a video the companion makes', () => {
  /** Two seconds of a recording the project has. */
  const withSound = () =>
    useProjectStore.getState().update((draft) => {
      const track = createAudioTrack('Voice');
      const asset = createAudioAsset({
        name: 'Narration',
        originalName: 'narration.mp3',
        mimeType: 'audio/mpeg',
        byteLength: 128000,
        contentHash: 'a'.repeat(64),
        duration: 100,
        sampleRate: 48000,
        channels: 2,
      });
      draft.tracks.unshift(track);
      draft.audioAssets.push(asset);
      draft.audioClips.push(createAudioClip(asset.id, track.id, 0, 2));
    });
  const everyFormat = () => online({ videoAudio: ['mp4', 'mov', 'webm'] });
  const include = () => screen.getByTestId<HTMLInputElement>('video-include-audio');
  const note = () => screen.queryByTestId('video-audio-note');

  it('ffmpeg: Include audio is offered, and the dialog says which codec the sound gets', async () => {
    withSound();
    hoisted.companion = everyFormat();
    const user = await open();
    expect(note()).toBeNull(); // the browser encodes it itself: nothing to add
    await user.click(screen.getByTestId('video-encoder-ffmpeg'));
    expect(include()).toBeChecked();
    expect(include()).toBeEnabled();
    expect(note()).toHaveTextContent('ffmpeg encodes the sound as AAC.');
    await user.selectOptions(screen.getByTestId('video-format'), 'webm');
    expect(note()).toHaveTextContent('ffmpeg encodes the sound as Opus.');
    await user.selectOptions(screen.getByTestId('video-format'), 'mov');
    expect(note()).toHaveTextContent('ffmpeg encodes the sound as AAC.');
    await user.click(include());
    expect(include()).not.toBeChecked();
    expect(note()).toBeNull();
  });

  it('ffmpeg: a GIF has no sound; the choice comes back with a format that has', async () => {
    withSound();
    hoisted.companion = everyFormat();
    const user = await open();
    await user.click(screen.getByTestId('video-encoder-ffmpeg'));
    await user.selectOptions(screen.getByTestId('video-format'), 'gif');
    expect(include()).toBeDisabled();
    expect(include()).not.toBeChecked();
    expect(note()).toHaveTextContent('A GIF has no sound.');
    await user.selectOptions(screen.getByTestId('video-format'), 'mp4');
    expect(include()).toBeEnabled();
    expect(include()).toBeChecked();
  });

  it('ffmpeg: says why not when the companion is older or its ffmpeg lacks the encoder', async () => {
    withSound();
    hoisted.companion = online(); // before 1.5: no videoAudio
    const user = await open();
    await user.click(screen.getByTestId('video-encoder-ffmpeg'));
    expect(include()).toBeDisabled();
    expect(include()).not.toBeChecked();
    expect(note()).toHaveTextContent(
      'This companion is older than 1.5 and cannot add sound. Update companion/mfe_companion.py.',
    );
    act(() => {
      hoisted.companion = online({ videoAudio: ['webm'] });
    });
    await user.selectOptions(screen.getByTestId('video-quality'), 'high'); // any re-render
    expect(note()).toHaveTextContent(
      'The companion’s ffmpeg has no AAC encoder: it cannot add sound to this format.',
    );
    await user.selectOptions(screen.getByTestId('video-format'), 'webm');
    expect(include()).toBeEnabled();
    expect(include()).toBeChecked();
  });

  describe('longer than an hour', () => {
    const TOO_LONG =
      'An export takes at most 60 minutes of sound, and this one lasts 66.7 minutes.';
    const longScene = () => {
      withSound();
      useProjectStore.getState().update((draft) => {
        draft.meta.duration = 4000;
      });
    };

    it('browser: the video goes without the sound, and a range of an hour takes it again', async () => {
      longScene();
      hoisted.exportVideo.mockResolvedValue(new Blob(['mp4']));
      const user = await open();
      expect(include()).toBeDisabled();
      expect(include()).not.toBeChecked();
      expect(note()).toHaveTextContent(
        `${TOO_LONG} The video goes without it, unless you export a shorter range.`,
      );
      await user.click(screen.getByTestId('video-range-custom'));
      await user.clear(screen.getByTestId('video-range-end'));
      await user.type(screen.getByTestId('video-range-end'), '3600');
      expect(include()).toBeEnabled();
      expect(include()).toBeChecked();
      expect(note()).toBeNull();
      await user.click(screen.getByTestId('video-range-whole'));
      await user.click(screen.getByTestId('video-start'));
      await screen.findByTestId('video-done');
      expect(hoisted.exportVideo).toHaveBeenCalledOnce();
      expect(hoisted.holdRecordings).not.toHaveBeenCalled();
    });

    it('ffmpeg: the same, after what the companion itself cannot do', async () => {
      longScene();
      hoisted.companion = everyFormat();
      hoisted.exportVideoViaCompanion.mockResolvedValue(new Blob(['x']));
      const user = await open();
      await user.click(screen.getByTestId('video-encoder-ffmpeg'));
      expect(include()).toBeDisabled();
      expect(note()).toHaveTextContent(TOO_LONG);
      await user.selectOptions(screen.getByTestId('video-format'), 'gif');
      expect(note()).toHaveTextContent('A GIF has no sound.');
      await user.selectOptions(screen.getByTestId('video-format'), 'mp4');
      await user.click(screen.getByTestId('video-start'));
      await screen.findByTestId('video-done');
      expect(hoisted.exportVideoViaCompanion.mock.calls[0]![2]).not.toHaveProperty('soundtrack');
    });

    it('Render with Manim: there is no range to shorten', async () => {
      withSound();
      useProjectStore.getState().update((draft) => {
        draft.clips[0]!.end = 4000; // Manim renders the visual scene
      });
      hoisted.companion = online({ manimRender: true, videoAudio: ['mp4'] });
      const user = await open();
      await user.click(screen.getByTestId('video-encoder-manim'));
      expect(include()).toBeDisabled();
      expect(note()).toHaveTextContent(`${TOO_LONG} The video goes without it.`);
      expect(note()).not.toHaveTextContent('unless');
    });
  });

  it('ffmpeg: the export sends the mix of the video’s frames with it', async () => {
    withSound();
    hoisted.companion = everyFormat();
    const lease = { ownerId: 'export', release: vi.fn(async () => undefined) };
    hoisted.holdRecordings.mockResolvedValue(lease);
    hoisted.exportVideoViaCompanion.mockResolvedValue(new Blob(['mp4']));
    const user = await open();
    await user.click(screen.getByTestId('video-encoder-ffmpeg'));
    await user.click(screen.getByTestId('video-start'));
    await screen.findByTestId('video-done');
    const options = hoisted.exportVideoViaCompanion.mock.calls[0]![2];
    expect(options).toMatchObject({ format: 'mp4', range: null });
    expect(options.soundtrack.plan).toMatchObject({ start: 0, duration: 2, frameCount: 96000 });
    expect(lease.release).toHaveBeenCalledOnce();
  });

  it('ffmpeg: nothing is mixed when Include audio is off, or the format has no sound', async () => {
    withSound();
    hoisted.companion = everyFormat();
    hoisted.exportVideoViaCompanion.mockResolvedValue(new Blob(['x']));
    const user = await open();
    await user.click(screen.getByTestId('video-encoder-ffmpeg'));
    await user.selectOptions(screen.getByTestId('video-format'), 'gif');
    await user.click(screen.getByTestId('video-start'));
    await screen.findByTestId('video-done');
    expect(hoisted.exportVideoViaCompanion.mock.calls[0]![2]).not.toHaveProperty('soundtrack');
    expect(hoisted.holdRecordings).not.toHaveBeenCalled();
  });

  const cut = () => screen.queryByTestId('video-audio-cut');

  it('Render with Manim: Include audio is offered, the companion’s ffmpeg adds the sound', async () => {
    withSound();
    hoisted.companion = online({ manimRender: true, videoAudio: ['mp4'] });
    const user = await open();
    await user.click(screen.getByTestId('video-encoder-manim'));
    expect(include()).toBeChecked();
    expect(note()).toHaveTextContent(
      'The companion’s ffmpeg adds the sound to the video Manim renders, as AAC.',
    );
    expect(cut()).toBeNull(); // the sound ends with the pictures
    await user.click(include());
    expect(note()).toBeNull();
  });

  it('Render with Manim: sound that goes on after the last animation is cut, and the dialog says so', async () => {
    withSound();
    useProjectStore.getState().update((draft) => {
      draft.audioClips[0]!.end = 5.25; // the formula ends at 2
    });
    hoisted.companion = online({ manimRender: true, videoAudio: ['mp4'] });
    const user = await open();
    expect(cut()).toBeNull(); // the other encoders export the whole scene
    await user.click(screen.getByTestId('video-encoder-manim'));
    expect(cut()).toHaveTextContent(
      'The sound goes on for 3.25 s after the last animation: Render with Manim ends there, and the sound is cut with it.',
    );
    await user.click(include());
    expect(cut()).toBeNull(); // nothing to cut without sound
  });

  it('Render with Manim: says why not when the companion cannot add sound', async () => {
    withSound();
    hoisted.companion = online({ manimRender: true }); // before 1.5
    const user = await open();
    await user.click(screen.getByTestId('video-encoder-manim'));
    expect(include()).toBeDisabled();
    expect(include()).not.toBeChecked();
    expect(note()).toHaveTextContent('This companion is older than 1.5 and cannot add sound.');
    expect(screen.getByTestId('video-start')).toBeEnabled(); // the silent render still works
  });

  it('Render with Manim: the export sends the sound of the visual scene with the Python', async () => {
    withSound();
    useProjectStore.getState().update((draft) => {
      draft.audioClips[0]!.end = 5.25;
    });
    hoisted.companion = online({ manimRender: true, videoAudio: ['mp4'] });
    const lease = { ownerId: 'export', release: vi.fn(async () => undefined) };
    hoisted.holdRecordings.mockResolvedValue(lease);
    hoisted.generatePython.mockReturnValue({
      code: 'x',
      sceneName: 'X',
      issues: [],
      usedPositionalHelper: false,
    });
    hoisted.renderWithManim.mockResolvedValue(new Blob(['mp4']));
    const user = await open();
    await user.click(screen.getByTestId('video-encoder-manim'));
    await user.click(screen.getByTestId('video-start'));
    await screen.findByTestId('video-done');
    const [, request, , , options] = hoisted.renderWithManim.mock.calls[0]!;
    expect(request).toMatchObject({ fps: 30, frames: 60 });
    expect(options.soundtrack.plan).toMatchObject({ start: 0, duration: 2, frameCount: 96000 });
    expect(hoisted.generatePython.mock.calls[0]![0].audioClips).toEqual([]);
    expect(lease.release).toHaveBeenCalledOnce();
  });
});

describe('options', () => {
  it('defaults to the project size and frame rate and summarises the export', async () => {
    await open();
    expect(screen.getByTestId('video-size-preset')).toHaveValue('project');
    expect(screen.getByTestId('video-fps')).toHaveValue('project');
    expect(screen.getByTestId('video-summary')).toHaveTextContent(
      '60 frames · 2 s · 1280 × 720 at 30 fps',
    );
    expect(screen.queryByTestId('video-aspect-warning')).not.toBeInTheDocument();
  });

  it('warns about a different aspect ratio and rejects odd sizes', async () => {
    const user = await open();
    await user.selectOptions(screen.getByTestId('video-size-preset'), 'custom');
    await user.clear(screen.getByTestId('video-width'));
    await user.type(screen.getByTestId('video-width'), '1000');
    await user.clear(screen.getByTestId('video-height'));
    await user.type(screen.getByTestId('video-height'), '1000');
    expect(screen.getByTestId('video-aspect-warning')).toHaveTextContent(
      /differs from the project/,
    );
    await user.clear(screen.getByTestId('video-width'));
    await user.type(screen.getByTestId('video-width'), '1001');
    expect(screen.getByTestId('video-size-error')).toHaveTextContent(/even/);
    expect(screen.getByTestId('video-start')).toBeDisabled();
  });

  it('validates a custom range', async () => {
    const user = await open();
    await user.click(screen.getByTestId('video-range-custom'));
    await user.clear(screen.getByTestId('video-range-start'));
    await user.type(screen.getByTestId('video-range-start'), '1');
    await user.clear(screen.getByTestId('video-range-end'));
    await user.type(screen.getByTestId('video-range-end'), '5');
    expect(screen.getByTestId('video-range-error')).toHaveTextContent(/lasts 2 s/);
    await user.clear(screen.getByTestId('video-range-end'));
    await user.type(screen.getByTestId('video-range-end'), '1.5');
    expect(screen.queryByTestId('video-range-error')).not.toBeInTheDocument();
    expect(screen.getByTestId('video-summary')).toHaveTextContent('15 frames');
  });

  it('GIF caps the frame rate', async () => {
    hoisted.companion = online();
    const user = await open();
    await user.click(screen.getByTestId('video-encoder-ffmpeg'));
    await user.selectOptions(screen.getByTestId('video-format'), 'gif');
    await user.selectOptions(screen.getByTestId('video-fps'), '60');
    expect(screen.getByTestId('video-fps-error')).toHaveTextContent(/at most 50/);
    expect(screen.getByTestId('video-start')).toBeDisabled();
  });

  it('waits for the formula renders: Export is off until every formula has one', async () => {
    useRenderStore.setState({ entries: {}, resolved: new Map() });
    await open();
    expect(screen.getByTestId('video-waiting-formulas')).toHaveTextContent(
      'Waiting for a formula to render (f1)…',
    );
    expect(screen.getByTestId('video-start')).toBeDisabled();
    expect(screen.queryByTestId('video-empty-formulas')).not.toBeInTheDocument();
    act(withRender);
    expect(screen.queryByTestId('video-waiting-formulas')).not.toBeInTheDocument();
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });

  it('waits while a formula re-renders, and while its render is of an earlier LaTeX', async () => {
    await open();
    expect(screen.getByTestId('video-start')).toBeEnabled();
    const entry = useRenderStore.getState().entries['f_1']!;
    act(() => useRenderStore.getState().setEntry('f_1', { ...entry, status: 'loading' }));
    expect(screen.getByTestId('video-waiting-formulas')).toHaveTextContent(
      'Waiting for a formula to render (f1)…',
    );
    expect(screen.getByTestId('video-start')).toBeDisabled();
    act(() => useRenderStore.getState().setEntry('f_1', entry));
    expect(screen.queryByTestId('video-waiting-formulas')).not.toBeInTheDocument();
    expect(screen.getByTestId('video-start')).toBeEnabled();
    // The LaTeX was edited: the render of the earlier version is not the one to export.
    act(() =>
      useProjectStore.getState().update((d) => {
        d.formulas[0]!.source = 'xy';
      }),
    );
    expect(screen.getByTestId('video-waiting-formulas')).toHaveTextContent('(f1)');
    expect(screen.getByTestId('video-start')).toBeDisabled();
  });

  it('warns that a formula whose LaTeX fails and never rendered is left out', async () => {
    failWithoutRender();
    await open();
    expect(screen.getByTestId('video-missing-formulas')).toHaveTextContent(
      'f1 does not render with its current LaTeX and never did: the video leaves it out.',
    );
    expect(screen.queryByTestId('video-waiting-formulas')).not.toBeInTheDocument();
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });

  it('warns that a formula whose LaTeX fails is drawn as its last good render', async () => {
    failWithOldRender();
    await open();
    expect(screen.getByTestId('video-stale-formulas')).toHaveTextContent(
      'f1 does not render with its current LaTeX: the video draws its last good render.',
    );
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });

  it('does not render with Manim while a formula fails (Manim gets the current LaTeX)', async () => {
    hoisted.companion = online({ manimRender: true });
    failWithOldRender();
    const user = await open();
    await user.click(screen.getByTestId('video-encoder-manim'));
    expect(screen.getByTestId('video-stale-formulas')).toHaveTextContent(
      'Render with Manim needs f1 to render: fix it in the Creator.',
    );
    expect(screen.getByTestId('video-start')).toBeDisabled();
    act(failWithoutRender); // the same without an earlier render
    expect(screen.getByTestId('video-stale-formulas')).toHaveTextContent(
      'Render with Manim needs f1 to render: fix it in the Creator.',
    );
    expect(screen.queryByTestId('video-missing-formulas')).not.toBeInTheDocument();
    expect(screen.getByTestId('video-start')).toBeDisabled();
  });

  it('says that an empty formula is missing from the video, not that it waits for a render', async () => {
    useProjectStore.getState().update((p) => {
      p.formulas[0]!.source = ' ';
    });
    await open();
    expect(screen.getByTestId('video-empty-formulas')).toHaveTextContent(
      'f1 is empty and will be missing from the video.',
    );
    expect(screen.queryByTestId('video-missing-formulas')).not.toBeInTheDocument();
  });
});

describe('the size estimate', () => {
  it('says about how large the browser file comes out, and warns when it would fill the memory', async () => {
    const user = await open();
    await user.selectOptions(screen.getByTestId('video-size-preset'), '720p');
    await user.selectOptions(screen.getByTestId('video-fps'), '24');
    // 1280 × 720 at 24 fps, H.264: 0.15 bit per pixel per frame → 3.3 Mbit/s; 2 s → 814 kB.
    expect(screen.getByTestId('video-estimate')).toHaveTextContent(
      'About 814 kB (H.264 at 3.3 Mbit/s, assembled in memory, then downloaded).',
    );
    expect(screen.queryByTestId('video-estimate-warning')).toBeNull();
    act(() => {
      useProjectStore.getState().update((d) => {
        d.meta.duration = 3600;
      });
    });
    expect(screen.getByTestId('video-estimate')).toHaveTextContent(/About 1\.40 GB/);
    expect(screen.getByTestId('video-estimate-warning')).toHaveTextContent(/exhaust the browser/);
  });

  it('counts the sound that goes with the video, and a large file is a warning, not a refusal', async () => {
    useProjectStore.getState().update((draft) => {
      const track = createAudioTrack('Voice');
      draft.tracks.unshift(track);
      draft.audioClips.push(createAudioClip('narration', track.id, 0, 2));
    });
    const user = await open();
    await user.selectOptions(screen.getByTestId('video-size-preset'), '720p');
    await user.selectOptions(screen.getByTestId('video-fps'), '24');
    // The 814 kB of the pictures, and 2 s of AAC at 192 kbit/s: 48 kB.
    expect(screen.getByTestId('video-estimate')).toHaveTextContent(
      'About 861 kB (H.264 at 3.3 Mbit/s plus the sound, assembled in memory, then downloaded).',
    );
    await user.click(screen.getByTestId('video-include-audio'));
    expect(screen.getByTestId('video-estimate')).toHaveTextContent(
      'About 814 kB (H.264 at 3.3 Mbit/s, assembled in memory, then downloaded).',
    );
    await user.click(screen.getByTestId('video-include-audio'));
    act(() => {
      useProjectStore.getState().update((d) => {
        d.meta.duration = 3600;
      });
    });
    // An hour: 1.40 GB of pictures and 86 MB of sound. The export is still offered.
    expect(screen.getByTestId('video-estimate')).toHaveTextContent(/About 1\.48 GB/);
    expect(screen.getByTestId('video-estimate-warning')).toHaveTextContent(/exhaust the browser/);
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });

  it('says the file is written as it is encoded when the browser can choose one', async () => {
    hoisted.fileSystemAccess = true;
    try {
      await open();
      expect(screen.getByTestId('video-estimate')).toHaveTextContent(
        /written to a file as it is encoded/,
      );
    } finally {
      hoisted.fileSystemAccess = false;
    }
  });
});

describe('writing the file as it is encoded (File System Access API)', () => {
  function fakeHandle(name: string) {
    const writes: { position: number; length: number }[] = [];
    const writable = {
      write: vi.fn(async (piece: { position: number; data: Uint8Array }) => {
        writes.push({ position: piece.position, length: piece.data.length });
      }),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    };
    return { handle: { name, createWritable: async () => writable }, writable, writes };
  }
  beforeEach(() => {
    hoisted.fileSystemAccess = true;
  });
  afterEach(() => {
    hoisted.fileSystemAccess = false;
  });

  it('asks where to save first, then the encoder writes there; nothing is downloaded', async () => {
    const { handle, writable, writes } = fakeHandle('chosen.mp4');
    hoisted.pickSaveHandleFor.mockResolvedValue(handle);
    hoisted.exportVideo.mockImplementation(
      async (
        _e: unknown,
        options: { sink: { write(d: Uint8Array, p: number): Promise<void> } },
      ) => {
        await options.sink.write(new Uint8Array(1500), 0);
        await options.sink.write(new Uint8Array(548), 1500);
        await options.sink.write(new Uint8Array(8), 20); // a header patched afterwards
        return null;
      },
    );
    const user = await open();
    await user.click(screen.getByTestId('video-start'));
    await screen.findByTestId('video-done');
    expect(hoisted.pickSaveHandleFor).toHaveBeenCalledWith('My scene.mp4', [
      { description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } },
    ]);
    expect(writes).toEqual([
      { position: 0, length: 1500 },
      { position: 1500, length: 548 },
      { position: 20, length: 8 },
    ]);
    expect(writable.close).toHaveBeenCalledTimes(1);
    expect(writable.abort).not.toHaveBeenCalled();
    expect(hoisted.downloadBlob).not.toHaveBeenCalled();
    expect(screen.getByTestId('video-done')).toHaveTextContent('Written to chosen.mp4 (2 kB).');
    expect(screen.queryByTestId('video-download')).toBeNull();
  });

  it('stops offering cancellation once the file close has begun', async () => {
    let finish!: () => void;
    const { handle, writable } = fakeHandle('committing.mp4');
    writable.close.mockImplementation(
      () =>
        new Promise<undefined>((resolve) => {
          finish = () => resolve(undefined);
        }),
    );
    hoisted.pickSaveHandleFor.mockResolvedValue(handle);
    hoisted.exportVideo.mockResolvedValue(null);
    const user = await open();
    await user.click(screen.getByTestId('video-start'));
    await screen.findByTestId('video-committing');
    expect(screen.getByTestId('video-cancel')).toBeDisabled();
    expect(screen.getByTestId('video-close')).toHaveTextContent('Close');
    expect(screen.getByTestId('video-size-preset')).toBeDisabled();
    await user.click(screen.getByTestId('video-cancel'));
    act(() => finish());
    await screen.findByTestId('video-done');
    expect(writable.abort).not.toHaveBeenCalled();
    expect(writable.close).toHaveBeenCalledOnce();
  });

  it('cancels document-owned output when the current document is replaced', async () => {
    let finish!: () => void;
    const { handle, writable } = fakeHandle('replaced.mp4');
    hoisted.pickSaveHandleFor.mockResolvedValue(handle);
    hoisted.exportVideo.mockImplementation(
      () =>
        new Promise<null>((resolve) => {
          finish = () => resolve(null);
        }),
    );
    const user = await open();
    await user.click(screen.getByTestId('video-start'));
    await screen.findByTestId('video-progress');
    act(() =>
      useDocumentStore
        .getState()
        .beginDocument(createEmptyProject('Replacement'), { fileName: null, handle: null }),
    );
    await waitFor(() => expect(writable.abort).toHaveBeenCalledOnce());
    act(() => finish());
    await screen.findByTestId('video-cancelled');
    expect(writable.close).not.toHaveBeenCalled();
    expect(hoisted.downloadBlob).not.toHaveBeenCalled();
  });

  it('a cancelled picker starts nothing', async () => {
    hoisted.pickSaveHandleFor.mockResolvedValue(null);
    const user = await open();
    await user.click(screen.getByTestId('video-start'));
    await waitFor(() => expect(hoisted.pickSaveHandleFor).toHaveBeenCalled());
    expect(hoisted.exportVideo).not.toHaveBeenCalled();
    expect(screen.queryByTestId('video-run')).toBeNull();
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });
});

// The real hook remains here for ownership, commitment, cancellation and UI handoffs.
// Repeated failure/notice orchestration lives in videoExportRun and videoExportAdapters tests.
describe('running an export', () => {
  it('browser: calls exportVideo with the options, downloads <name>.mp4 and offers it again', async () => {
    hoisted.exportVideo.mockResolvedValue(new Blob(['x'.repeat(2048)], { type: 'video/mp4' }));
    const user = await open();
    await user.selectOptions(screen.getByTestId('video-size-preset'), '720p');
    await user.selectOptions(screen.getByTestId('video-fps'), '24');
    await user.click(screen.getByTestId('video-start'));
    await screen.findByTestId('video-done');
    const [, options, , signal] = hoisted.exportVideo.mock.calls[0]!;
    expect(options).toEqual({
      background: '#000000',
      width: 1280,
      height: 720,
      fps: 24,
      codec: 'avc',
      container: 'mp4',
      bitrate: null,
      range: null,
      sink: null,
    });
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(hoisted.downloadBlob).toHaveBeenCalledWith('My scene.mp4', expect.any(Blob));
    expect(screen.getByTestId('video-done')).toHaveTextContent('Saved My scene.mp4 (2 kB).');
    await user.click(screen.getByTestId('video-download'));
    expect(hoisted.downloadBlob).toHaveBeenCalledTimes(2);
  });

  it('draws the clips of hidden tracks: hiding is a preview toggle, the video is an export', async () => {
    useProjectStore.getState().update((d) => {
      d.tracks[0]!.hidden = true;
    });
    hoisted.exportVideo.mockResolvedValue(new Blob(['x']));
    const user = await open();
    await user.click(screen.getByTestId('video-start'));
    await screen.findByTestId('video-done');
    const evaluator = hoisted.exportVideo.mock.calls[0]![0] as SceneEvaluator;
    expect(evaluator.duration).toBe(2);
    expect(new Set(evaluator.evaluate(1).map((d) => d.clipId))).toEqual(new Set(['c_1']));
  });

  it('browser WebM VP9 and a custom range', async () => {
    hoisted.exportVideo.mockResolvedValue(new Blob(['x']));
    const user = await open();
    await user.selectOptions(screen.getByTestId('video-format'), 'vp9-webm');
    await user.click(screen.getByTestId('video-range-custom'));
    await user.clear(screen.getByTestId('video-range-end'));
    await user.type(screen.getByTestId('video-range-end'), '1');
    await user.click(screen.getByTestId('video-start'));
    await screen.findByTestId('video-done');
    const options = hoisted.exportVideo.mock.calls[0]![1];
    expect(options).toMatchObject({ codec: 'vp9', container: 'webm', range: [0, 1] });
    expect(hoisted.downloadBlob).toHaveBeenCalledWith('My scene.webm', expect.any(Blob));
  });

  it('shows progress with the frame counter and can be cancelled', async () => {
    let report: (p: { frame: number; totalFrames: number }) => void = () => {};
    hoisted.exportVideo.mockImplementation(
      (_e: unknown, _o: unknown, onProgress: typeof report, signal: AbortSignal) =>
        new Promise((_, reject) => {
          report = onProgress;
          signal.addEventListener('abort', () => reject(signal.reason));
        }),
    );
    const user = await open();
    await user.click(screen.getByTestId('video-start'));
    await screen.findByTestId('video-progress');
    act(() => report({ frame: 12, totalFrames: 60 }));
    expect(screen.getByTestId('video-progress-text')).toHaveTextContent('frame 12 of 60');
    expect(screen.getByTestId('video-progress')).toHaveAttribute('value', '12');
    expect(screen.getByTestId('video-progress')).toHaveAttribute('max', '60');
    expect(screen.queryByTestId('video-start')).not.toBeInTheDocument();
  });

  it('cancelling aborts the export', async () => {
    let aborted = false;
    hoisted.exportVideo.mockImplementation(
      (_e: unknown, _o: unknown, _p: unknown, signal: AbortSignal) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => {
            aborted = true;
            reject(signal.reason);
          });
        }),
    );
    const user = await open();
    await user.click(screen.getByTestId('video-start'));
    await user.click(await screen.findByTestId('video-cancel'));
    await screen.findByTestId('video-cancelled');
    expect(aborted).toBe(true);
    expect(hoisted.downloadBlob).not.toHaveBeenCalled();
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });

  it('closing during an export aborts it', async () => {
    let signalSeen: AbortSignal | null = null;
    hoisted.exportVideo.mockImplementation(
      (_e: unknown, _o: unknown, _p: unknown, signal: AbortSignal) => {
        signalSeen = signal;
        return new Promise(() => {});
      },
    );
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<VideoExportDialog onClose={onClose} />);
    await user.click(screen.getByTestId('video-start'));
    await screen.findByTestId('video-progress');
    await user.click(screen.getByTestId('video-close'));
    expect(onClose).toHaveBeenCalled();
    expect((signalSeen as AbortSignal | null)?.aborted).toBe(true);
  });

  it('shows the error of a failed export', async () => {
    hoisted.exportVideo.mockRejectedValue(
      new Error('This browser cannot encode H.264 at 1280×720.'),
    );
    const user = await open();
    await user.click(screen.getByTestId('video-start'));
    expect(await screen.findByTestId('video-error')).toHaveTextContent(/cannot encode H\.264/);
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });

  it('companion · ffmpeg: passes the format and quality and downloads the file', async () => {
    hoisted.companion = online();
    hoisted.exportVideoViaCompanion.mockResolvedValue(new Blob(['mov']));
    const user = await open();
    await user.click(screen.getByTestId('video-encoder-ffmpeg'));
    await user.selectOptions(screen.getByTestId('video-format'), 'webm');
    await user.selectOptions(screen.getByTestId('video-quality'), 'high');
    await user.click(screen.getByTestId('video-start'));
    await screen.findByTestId('video-done');
    const [client, , options] = hoisted.exportVideoViaCompanion.mock.calls[0]!;
    expect(client).toBe(hoisted.client);
    expect(options).toEqual({
      sink: null,
      background: '#000000',
      width: 1280,
      height: 720,
      fps: 30,
      format: 'webm',
      quality: 'high',
      range: null,
    });
    expect(hoisted.exportVideo).not.toHaveBeenCalled();
    expect(hoisted.downloadBlob).toHaveBeenCalledWith('My scene.webm', expect.any(Blob));
  });

  it('companion · ffmpeg: shows ffmpeg’s message and the end of its log', async () => {
    hoisted.companion = online();
    const { CompanionJobError } = await import('../../../export/video');
    hoisted.exportVideoViaCompanion.mockRejectedValue(
      new CompanionJobError('Invalid data found', 'frame=1\nInvalid data found'),
    );
    const user = await open();
    await user.click(screen.getByTestId('video-encoder-ffmpeg'));
    await user.click(screen.getByTestId('video-start'));
    expect(await screen.findByTestId('video-error')).toHaveTextContent('Invalid data found');
    expect(screen.getByTestId('video-log')).toHaveTextContent('frame=1');
  });
});

describe('render with Manim', () => {
  const enableManim = async () => {
    hoisted.companion = online({ manimRender: true });
    const user = await open();
    await user.click(screen.getByTestId('video-encoder-manim'));
    return user;
  };

  it('switches from the audio duration to visual-only summary, Python and request totals', async () => {
    useProjectStore.getState().update((draft) => {
      const track = createAudioTrack('Voice');
      draft.tracks.unshift(track);
      draft.audioClips.push(createAudioClip('unavailable-source', track.id, 0, 90));
    });
    hoisted.companion = online({ manimRender: true });
    hoisted.generatePython.mockReturnValue({
      code: 'x',
      sceneName: 'X',
      issues: [],
      usedPositionalHelper: false,
    });
    hoisted.renderWithManim.mockResolvedValue(new Blob(['mp4']));
    const user = await open();
    expect(screen.getByTestId('video-summary')).toHaveTextContent('2700 frames · 90 s');
    await user.click(screen.getByTestId('video-encoder-manim'));
    expect(screen.getByTestId('video-summary')).toHaveTextContent('60 frames · 2 s');
    await user.click(screen.getByTestId('video-start'));
    await screen.findByTestId('video-done');
    expect(hoisted.generatePython.mock.calls[0]![0].audioClips).toEqual([]);
    expect(hoisted.renderWithManim.mock.calls[0]![1].frames).toBe(60);
    expect(useProjectStore.getState().project.audioClips).toHaveLength(1);
  });

  it('generates the Python scene and sends it to the companion', async () => {
    hoisted.generatePython.mockReturnValue({
      code: 'from manim import *',
      sceneName: 'MyScene',
      issues: [],
      usedPositionalHelper: false,
    });
    hoisted.renderWithManim.mockResolvedValue(new Blob(['mp4']));
    const user = await enableManim();
    await user.click(screen.getByTestId('video-start'));
    await screen.findByTestId('video-done');
    const [project, resolved, codegen] = hoisted.generatePython.mock.calls[0]!;
    expect(project).toEqual(useProjectStore.getState().project); // the dialog kept its values
    expect(resolved).toBe(useRenderStore.getState().resolved);
    expect(codegen).toEqual({
      target: 'ce',
      sceneName: 'MyScene',
      indexing: 'auto',
      comments: true,
    });
    const [client, request] = hoisted.renderWithManim.mock.calls[0]!;
    expect(client).toBe(hoisted.client);
    expect(request).toEqual({
      target: 'ce',
      code: 'from manim import *',
      scene: 'MyScene',
      quality: 'medium',
      width: 1280,
      height: 720,
      fps: 30,
      frames: 60,
    });
    expect(hoisted.downloadBlob).toHaveBeenCalledWith('My scene.mp4', expect.any(Blob));
  });

  it('generates the Python for the size and frame rate the dialog chose', async () => {
    hoisted.generatePython.mockReturnValue({
      code: 'x',
      sceneName: 'X',
      issues: [],
      usedPositionalHelper: false,
    });
    hoisted.renderWithManim.mockResolvedValue(new Blob(['mp4']));
    const user = await enableManim();
    await user.selectOptions(screen.getByTestId('video-fps'), '24');
    await user.selectOptions(screen.getByTestId('video-size-preset'), '1080p');
    await user.click(screen.getByTestId('video-start'));
    await screen.findByTestId('video-done');
    const [project] = hoisted.generatePython.mock.calls[0]!;
    // The frame-safe durations and the frame width come from these, like the request's values.
    expect(project.meta).toMatchObject({ width: 1920, height: 1080, fps: 24 });
    expect(hoisted.renderWithManim.mock.calls[0]![1]).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 24,
    });
    // The project itself keeps its own metadata.
    expect(useProjectStore.getState().project.meta).toMatchObject({
      width: 1280,
      height: 720,
      fps: 30,
    });
  });

  it('only renders the whole scene: the custom range is disabled with a hint', async () => {
    hoisted.generatePython.mockReturnValue({
      code: 'x',
      sceneName: 'X',
      issues: [],
      usedPositionalHelper: false,
    });
    hoisted.renderWithManim.mockResolvedValue(new Blob(['mp4']));
    hoisted.companion = online({ manimRender: true });
    const user = await open();
    await user.click(screen.getByTestId('video-range-custom'));
    await user.clear(screen.getByTestId('video-range-end'));
    await user.type(screen.getByTestId('video-range-end'), '1');
    expect(screen.getByTestId('video-summary')).toHaveTextContent('30 frames');
    await user.click(screen.getByTestId('video-encoder-manim'));
    expect(screen.getByTestId('video-range-custom')).toBeDisabled();
    expect(screen.getByTestId('video-range-whole')).toBeChecked();
    expect(screen.getByTestId('video-range-hint')).toHaveTextContent(/whole scene/);
    expect(screen.queryByTestId('video-range-end')).not.toBeInTheDocument();
    expect(screen.getByTestId('video-summary')).toHaveTextContent('60 frames · 2 s');
    await user.click(screen.getByTestId('video-start'));
    await screen.findByTestId('video-done');
    expect(hoisted.renderWithManim.mock.calls[0]![1]).toMatchObject({ frames: 60 });
  });

  it('shows Manim’s progress', async () => {
    hoisted.generatePython.mockReturnValue({
      code: 'x',
      sceneName: 'X',
      issues: [],
      usedPositionalHelper: false,
    });
    let report: (p: unknown) => void = () => {};
    hoisted.renderWithManim.mockImplementation(
      (_c: unknown, _r: unknown, onProgress: typeof report) =>
        new Promise(() => {
          report = onProgress;
        }),
    );
    const user = await enableManim();
    await user.click(screen.getByTestId('video-start'));
    await screen.findByTestId('video-progress');
    await waitFor(() => expect(hoisted.renderWithManim).toHaveBeenCalled());
    act(() => report({ phase: 'running', frame: 20, totalFrames: 60, animation: 1 }));
    expect(screen.getByTestId('video-progress-text')).toHaveTextContent(
      'Manim CE is rendering (animation 2) — frame 20 of 60',
    );
  });
});

describe('Render with Manim and font text', () => {
  /** A text on the timeline, shaped by ManimCE in the environment `test-environment`. `source`:
   * what the text says now, when that is no longer what was shaped; `failed`: the companion could
   * not shape it again, and the render store keeps the shape it has. */
  function withText(options: { source?: string; failed?: boolean } = {}) {
    const artifact = textGeometry('AB');
    const shape = textArtifactRender(artifact);
    const text = createTextFormula({
      name: 'title',
      source: options.source ?? 'AB',
      snapshot: toSnapshot(shape),
      geometry: {
        contentHash: 'a'.repeat(64),
        byteLength: 1,
        key: artifact.key,
        basisKey: artifact.basisKey,
      },
    });
    useProjectStore.getState().update((draft) => {
      draft.formulas.push(text);
      draft.clips.push(createClip(text.id, draft.tracks[0]!.id, 0, 2));
    });
    const loaded = useProjectStore.getState().project.formulas.find((f) => f.id === text.id)!;
    useRenderStore.getState().setEntry(text.id, {
      status: options.failed ? 'error' : 'ok',
      resolved: resolveFormula(loaded, shape),
      error: options.failed
        ? { message: 'Font text needs a companion with Pango enabled.', backend: 'pango' }
        : null,
    });
  }
  /** A companion that renders with ManimCE and shapes text for it in `environmentKey`, or shapes
   * none (`null`). */
  const companion = (environmentKey: string | null) =>
    online({
      manimRender: true,
      ...(environmentKey
        ? { pango: { ce: { state: 'ready', adapterVersion: 'test-adapter', environmentKey } } }
        : {}),
    });
  const notes = () => screen.queryByTestId('video-text-notes');

  it('renders a text whose fonts changed on this machine, and says so before', async () => {
    hoisted.companion = companion('fonts of another day');
    withText();
    const user = await open();
    expect(notes()).toBeNull(); // the browser draws the saved shape: nothing to say
    await user.click(screen.getByTestId('video-encoder-manim'));
    expect(notes()).toHaveTextContent(
      'Font text "title": shaped with other fonts, or other versions of Manim or Pango, than this machine has now',
    );
    // The scene's own warning stays on the companion's log: the note does not promise it.
    expect(notes()).not.toHaveTextContent('The scene');
    expect(screen.queryByTestId('video-text-problems')).toBeNull();
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });

  it('renders where the companion shapes no text for the library', async () => {
    hoisted.companion = companion(null);
    withText();
    const user = await open();
    await user.click(screen.getByTestId('video-encoder-manim'));
    expect(notes()).toHaveTextContent(
      'Font text "title": not compared with the fonts of this machine',
    );
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });

  it('has nothing to say in the environment the text was shaped in', async () => {
    hoisted.companion = companion('test-environment');
    withText();
    const user = await open();
    await user.click(screen.getByTestId('video-encoder-manim'));
    expect(notes()).toBeNull();
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });

  it('draws a text the project’s new library has not shaped yet, with every encoder', async () => {
    // Project settings were switched to ManimGL where nothing shapes text for it: the preview
    // still draws the ManimCE shape, and so does the video; Manim gets the text written from it.
    useProjectStore.getState().update((draft) => {
      draft.meta.target = 'gl';
    });
    withRender();
    hoisted.companion = companion(null);
    withText({ failed: true });
    const user = await open();
    expect(screen.queryByTestId('video-text-problems')).toBeNull();
    expect(screen.getByTestId('video-start')).toBeEnabled();
    await user.click(screen.getByTestId('video-encoder-manim'));
    await user.selectOptions(screen.getByTestId('video-manim-target'), 'ce');
    expect(screen.queryByTestId('video-text-problems')).toBeNull();
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });

  /** A text on the timeline that nothing has shaped: drawn as its boxes. */
  function withBoxedText() {
    const draft = createTextFormula({ name: 'title', source: 'AB' });
    const request = renderRequestFor(
      draft,
      useProjectStore.getState().project.meta,
      'auto',
    ) as TextRenderRequest;
    const boxes = producerOf('text').free(request, textBoxesKey(request));
    if (!boxes.ok) throw new Error(boxes.error.message);
    const text = { ...draft, snapshot: toSnapshot(boxes.render) };
    useProjectStore.getState().update((project) => {
      project.formulas.push(text);
      project.clips.push(createClip(text.id, project.tracks[0]!.id, 0, 2));
    });
    const loaded = useProjectStore.getState().project.formulas.find((f) => f.id === text.id)!;
    useRenderStore.getState().setEntry(text.id, {
      status: 'ok',
      resolved: resolveFormula(loaded, boxes.render),
      error: null,
    });
  }

  it('films a text drawn as boxes as the preview shows it, and says so', async () => {
    withBoxedText();
    await open();
    expect(screen.getByTestId('video-text-boxes')).toHaveTextContent(
      'title: font text nothing has shaped. The video shows it as the preview does, as ' +
        'placeholder boxes. The companion draws its real glyphs.',
    );
    expect(screen.queryByTestId('video-text-problems')).toBeNull();
    expect(screen.queryByTestId('video-waiting-formulas')).toBeNull();
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });

  it('renders it with Manim, which draws its real glyphs, and says how they are counted', async () => {
    // A companion that renders with Manim and shapes no text (outside Linux, say).
    hoisted.companion = companion(null);
    withBoxedText();
    const user = await open();
    await user.click(screen.getByTestId('video-encoder-manim'));
    expect(screen.getByTestId('video-text-boxes')).toHaveTextContent(
      'title: font text nothing has shaped. Manim draws its real glyphs; they are counted one ' +
        'per character here',
    );
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });

  it('films the boxes of a text the companion then refused to shape, instead of holding back', async () => {
    // Drawn as boxes; a companion came and has no such font: the boxes are still what there is.
    hoisted.companion = companion('test-environment');
    withBoxedText();
    const { formulas } = useProjectStore.getState().project;
    const text = formulas.find((formula) => formula.name === 'title')!;
    const entry = useRenderStore.getState().entries[text.id]!;
    useRenderStore.getState().setEntry(text.id, {
      status: 'error',
      resolved: entry.resolved,
      error: { message: 'The requested font family is not available.', backend: 'pango' },
    });
    await open();
    expect(screen.queryByTestId('video-text-problems')).toBeNull();
    expect(screen.getByTestId('video-text-boxes')).toHaveTextContent(
      'title: font text nothing has shaped.',
    );
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });

  it('does not hand Manim a boxed text whose glyphs nothing counts: its scene would leave it out', async () => {
    hoisted.companion = companion(null);
    withBoxedText();
    // Its references count by a geometry that is gone, and its source moved on since: the
    // sync draws the boxes of the text as it stands and says it is unsure of every reference.
    const text = useProjectStore.getState().project.formulas.find((f) => f.name === 'title')!;
    useProjectStore.getState().amend((draft) => {
      const target = draft.formulas.find((formula) => formula.id === text.id)!;
      target.snapshot = { ...target.snapshot!, key: 'pango-of-an-earlier-text' };
    });
    const moved = useProjectStore.getState().project.formulas.find((f) => f.id === text.id)!;
    const entry = useRenderStore.getState().entries[text.id]!;
    useRenderStore.getState().setEntry(text.id, {
      status: 'ok',
      resolved: { ...entry.resolved!, formula: moved, canonToRender: [null, null], confidence: 0 },
      error: null,
    });
    const user = await open();
    // Browser and ffmpeg film what the preview shows.
    expect(screen.getByTestId('video-text-boxes')).toHaveTextContent('placeholder boxes');
    expect(screen.queryByTestId('video-text-uncounted')).toBeNull();
    expect(screen.getByTestId('video-start')).toBeEnabled();
    // Manim gets the Python, which has no such text.
    await user.click(screen.getByTestId('video-encoder-manim'));
    expect(screen.getByTestId('video-text-uncounted')).toHaveTextContent(
      'title: font text whose glyphs nothing counts as it stands, so the scene for Manim would ' +
        'leave it out. Refresh appearance, in its editor, shapes it again, which needs the ' +
        'companion.',
    );
    expect(screen.queryByTestId('video-text-boxes')).toBeNull();
    expect(screen.getByTestId('video-start')).toBeDisabled();
  });

  it('tells Manim’s count of a text drawn where the glyphs of its saved shape were', async () => {
    hoisted.companion = companion(null);
    withText();
    // The geometry is not at hand: boxes where its glyphs were, counted as they were.
    const { project } = useProjectStore.getState();
    const text = project.formulas.find((formula) => formula.name === 'title')!;
    const request = renderRequestFor(text, project.meta, 'auto') as TextRenderRequest;
    const boxes = savedBoxesRender(
      text.snapshot!,
      request,
      textSavedBoxesKey(request, text.snapshot!.key),
    );
    useRenderStore.getState().setEntry(text.id, {
      status: 'ok',
      resolved: resolveFormula(text, boxes),
      error: null,
    });
    const user = await open();
    await user.click(screen.getByTestId('video-encoder-manim'));
    expect(screen.getByTestId('video-text-boxes')).toHaveTextContent(
      'title: font text whose saved appearance is not at hand. Manim draws its real glyphs, ' +
        'counted as that appearance had them.',
    );
    expect(screen.getByTestId('video-text-boxes')).not.toHaveTextContent('one per character');
    expect(screen.queryByTestId('video-text-uncounted')).toBeNull();
    expect(screen.getByTestId('video-start')).toBeEnabled();
  });

  it('holds every video back for a text with no shape of its current source', async () => {
    hoisted.companion = companion('test-environment');
    withText({ source: 'ABC', failed: true });
    const user = await open();
    expect(screen.getByTestId('video-text-problems')).toHaveTextContent(
      'title: font text with no shape of its current source and font. The companion shapes it.',
    );
    expect(screen.getByTestId('video-start')).toBeDisabled();
    await user.click(screen.getByTestId('video-encoder-manim'));
    expect(screen.getByTestId('video-start')).toBeDisabled();
  });
});
