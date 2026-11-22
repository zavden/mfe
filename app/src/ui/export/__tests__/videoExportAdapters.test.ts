// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CompanionClient } from '../../../engine';
import type { VideoSink } from '../../../export';
import { createEmptyProject } from '../../../model';
import { useNoticeStore } from '../../project/noticeStore';
import { runVideoExport, type VideoJob, type VideoRun } from '../videoExportRun';

const hoisted = vi.hoisted(() => ({
  client: {} as CompanionClient,
  exportVideo: vi.fn(),
  generatePython: vi.fn(),
  renderWithManim: vi.fn(),
  downloadBlob: vi.fn(),
  hasFileSystemAccess: vi.fn(),
  pickSaveHandleFor: vi.fn(),
}));

vi.mock('../../../engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../engine')>()),
  companionClient: () => hoisted.client,
}));
vi.mock('../../../export', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../export')>()),
  exportVideo: hoisted.exportVideo,
  generatePython: hoisted.generatePython,
  renderWithManim: hoisted.renderWithManim,
}));
vi.mock('../../project/files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../project/files')>()),
  downloadBlob: hoisted.downloadBlob,
  hasFileSystemAccess: hoisted.hasFileSystemAccess,
  pickSaveHandleFor: hoisted.pickSaveHandleFor,
}));

beforeEach(() => {
  vi.resetAllMocks();
  hoisted.hasFileSystemAccess.mockReturnValue(false);
  useNoticeStore.getState().clear();
});

// Use production liveDeps, including the real destination and notice adapters. The runner's
// injected-dependency matrix and the dialog's lifecycle/controls each keep their own tests.
async function run(job: VideoJob) {
  const states: VideoRun[] = [];
  const project = createEmptyProject('My scene');
  project.meta.duration = 2;
  await runVideoExport(
    {
      job,
      project,
      resolved: new Map(),
      values: { width: 1280, height: 720, fps: 30, range: null, frames: 60, seconds: 2 },
    },
    (state) => states.push(state),
    new AbortController().signal,
  );
  return states;
}

describe('video export live adapters', () => {
  it('discards a partially written file through the real destination adapter on failure', async () => {
    const writable = {
      write: vi.fn(async () => undefined),
      close: vi.fn(async () => undefined),
      abort: vi.fn(async () => undefined),
    };
    hoisted.hasFileSystemAccess.mockReturnValue(true);
    hoisted.pickSaveHandleFor.mockResolvedValue({
      name: 'chosen.mp4',
      createWritable: async () => writable,
    });
    const data = new Uint8Array([1, 2, 3]);
    hoisted.exportVideo.mockImplementation(async (_e: unknown, options: { sink: VideoSink }) => {
      await options.sink.write(data, 20);
      throw new Error('The encoder died.');
    });

    const states = await run({ encoder: 'browser', codec: 'avc', container: 'mp4' });

    expect(hoisted.pickSaveHandleFor).toHaveBeenCalledWith('My scene.mp4', [
      { description: 'MP4 video', accept: { 'video/mp4': ['.mp4'] } },
    ]);
    expect(writable.write).toHaveBeenCalledWith({ type: 'write', position: 20, data });
    expect(writable.abort).toHaveBeenCalledOnce();
    expect(writable.close).not.toHaveBeenCalled();
    expect(hoisted.downloadBlob).not.toHaveBeenCalled();
    expect(states.at(-1)).toEqual({ status: 'error', message: 'The encoder died.', log: '' });
  });

  it('delivers code generation issues through liveDeps to the real notice store', async () => {
    hoisted.generatePython.mockReturnValue({
      code: 'x',
      sceneName: 'X',
      issues: [{ severity: 'warning', code: 'x', message: 'f1 uses MathJax order', path: [] }],
      usedPositionalHelper: true,
    });
    hoisted.renderWithManim.mockResolvedValue(new Blob(['mp4']));

    const states = await run({ encoder: 'manim', target: 'ce', quality: 'medium' });

    expect(hoisted.renderWithManim).toHaveBeenCalledWith(
      hoisted.client,
      expect.objectContaining({ target: 'ce', code: 'x' }),
      expect.any(Function),
      expect.any(AbortSignal),
      { sink: null },
    );
    expect(useNoticeStore.getState().notices).toEqual([
      expect.objectContaining({
        kind: 'warning',
        title: 'Notes about the exported scene',
        details: ['f1 uses MathJax order'],
      }),
    ]);
    expect(states.at(-1)).toMatchObject({ status: 'done', fileName: 'My scene.mp4' });
  });
});
