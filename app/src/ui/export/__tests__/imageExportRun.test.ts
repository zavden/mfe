// @vitest-environment node
/* One picture of Export ▸ Image… (`imageExportRun.ts`), with fakes for the world: where the file
 * goes, what is told, and what is not written once the picture is no longer wanted. */
import { describe, expect, it, vi } from 'vitest';
import { createEmptyProject } from '../../../model';
import type { FileHandleLike, WritableLike } from '../../project/files';
import {
  runImageExport,
  type ImageRun,
  type ImageRunDeps,
  type ImageRunInput,
} from '../imageExportRun';

const png = new Blob(['a picture'], { type: 'image/png' });

function input(scale: 1 | 2 = 1): ImageRunInput {
  const project = createEmptyProject();
  project.meta.name = 'Proof: part 1';
  return { project, resolved: new Map(), options: { time: 1.5, scale, transparent: false } };
}

/** A file the user chose, recording what is written to it. */
function chosenFile(name = 'chosen.png', failAt: 'write' | null = null) {
  const written: unknown[] = [];
  const events: string[] = [];
  const writable: WritableLike = {
    write: (data) => {
      events.push('write');
      if (failAt === 'write') return Promise.reject(new Error('The disk is full'));
      written.push(data);
      return Promise.resolve();
    },
    close: () => {
      events.push('close');
      return Promise.resolve();
    },
    abort: () => {
      events.push('abort');
      return Promise.resolve();
    },
  };
  const handle = { name, createWritable: () => Promise.resolve(writable) } as FileHandleLike;
  return { handle, written, events };
}

function world(over: Partial<ImageRunDeps> = {}) {
  const reports: ImageRun[] = [];
  const downloads: { fileName: string; blob: Blob }[] = [];
  const deps: ImageRunDeps = {
    frameImage: vi.fn((project, _resolved, options) =>
      Promise.resolve({
        blob: png,
        width: project.meta.width * options.scale,
        height: project.meta.height * options.scale,
      }),
    ),
    hasFileSystemAccess: () => false,
    pickDestination: () => Promise.reject(new Error('no picker here')),
    downloadBlob: (fileName, blob) => void downloads.push({ fileName, blob }),
    ...over,
  };
  return { deps, reports, downloads, report: (run: ImageRun) => void reports.push(run) };
}

describe('the picture of a browser without file pickers', () => {
  it('is downloaded, named after the project and the instant', async () => {
    const { deps, reports, downloads, report } = world();
    const given = input(2);
    await runImageExport(given, report, deps);
    expect(deps.frameImage).toHaveBeenCalledWith(given.project, given.resolved, given.options);
    expect(downloads).toEqual([{ fileName: 'Proof- part 1 1.50s.png', blob: png }]);
    expect(reports).toEqual([
      { status: 'running' },
      {
        status: 'done',
        fileName: 'Proof- part 1 1.50s.png',
        size: png.size,
        width: 3840,
        height: 2160,
        blob: png,
      },
    ]);
  });
});

describe('the picture of a browser with file pickers', () => {
  it('is asked a place for before anything is drawn, and written there', async () => {
    const file = chosenFile('frame.png');
    const order: string[] = [];
    const { deps, reports, downloads, report } = world({
      hasFileSystemAccess: () => true,
      pickDestination: (fileName) => {
        order.push(`pick ${fileName}`);
        return Promise.resolve(file.handle);
      },
      frameImage: () => {
        order.push('draw');
        return Promise.resolve({ blob: png, width: 1920, height: 1080 });
      },
    });
    await runImageExport(input(), report, deps);
    expect(order).toEqual(['pick Proof- part 1 1.50s.png', 'draw']);
    expect(file.written).toEqual([png]);
    expect(file.events).toEqual(['write', 'close']);
    expect(downloads).toEqual([]);
    // The name is the one of the file chosen, and there is nothing to download again.
    expect(reports.at(-1)).toEqual({
      status: 'done',
      fileName: 'frame.png',
      size: png.size,
      width: 1920,
      height: 1080,
      blob: null,
    });
  });

  it('does nothing when the picker is cancelled', async () => {
    const { deps, reports, report } = world({
      hasFileSystemAccess: () => true,
      pickDestination: () => Promise.resolve(null),
    });
    await runImageExport(input(), report, deps);
    expect(reports).toEqual([]);
    expect(deps.frameImage).not.toHaveBeenCalled();
  });

  it('says so when the picker fails', async () => {
    const { deps, reports, report } = world({
      hasFileSystemAccess: () => true,
      pickDestination: () => Promise.reject(new Error('Not allowed here')),
    });
    await runImageExport(input(), report, deps);
    expect(reports).toEqual([
      { status: 'error', message: 'Could not open the file: Not allowed here' },
    ]);
  });

  it('leaves no half-written file when the write fails', async () => {
    const file = chosenFile('frame.png', 'write');
    const { deps, reports, report } = world({
      hasFileSystemAccess: () => true,
      pickDestination: () => Promise.resolve(file.handle),
    });
    await runImageExport(input(), report, deps);
    expect(file.events).toEqual(['write', 'abort']);
    expect(reports.at(-1)).toEqual({
      status: 'error',
      message: 'Could not write the file: The disk is full',
    });
  });
});

describe('a picture the browser cannot make', () => {
  const failing = () => Promise.reject(new Error('Canvas area exceeds the maximum limit'));

  it('is told with its size and the browser’s words; at 2×, with the way out', async () => {
    const twice = world({ frameImage: failing });
    await runImageExport(input(2), twice.report, twice.deps);
    expect(twice.reports.at(-1)).toEqual({
      status: 'error',
      message:
        'The browser could not make a picture of 3840 × 2160 pixels (it said: “Canvas area exceeds the maximum limit”). Export it at 1×.',
    });
    expect(twice.downloads).toEqual([]);
    const once = world({ frameImage: failing });
    await runImageExport(input(1), once.report, once.deps);
    expect(once.reports.at(-1)).toEqual({
      status: 'error',
      message:
        'The browser could not make a picture of 1920 × 1080 pixels (it said: “Canvas area exceeds the maximum limit”).',
    });
  });
});

describe('a picture that is no longer wanted', () => {
  it('is not written once the dialog is gone or the document is another', async () => {
    // Lost while the picture was drawn.
    let owned = true;
    const drawn = world({
      frameImage: () => {
        owned = false;
        return Promise.resolve({ blob: png, width: 1920, height: 1080 });
      },
    });
    await runImageExport(input(), drawn.report, drawn.deps, () => owned);
    expect(drawn.downloads).toEqual([]);
    expect(drawn.reports).toEqual([{ status: 'running' }]);

    // Lost while the browser asked where the file goes: nothing is drawn either.
    const file = chosenFile();
    owned = true;
    const asked = world({
      hasFileSystemAccess: () => true,
      pickDestination: () => {
        owned = false;
        return Promise.resolve(file.handle);
      },
    });
    await runImageExport(input(), asked.report, asked.deps, () => owned);
    expect(asked.deps.frameImage).not.toHaveBeenCalled();
    expect(file.events).toEqual([]);
    expect(asked.reports).toEqual([]);
  });
});
