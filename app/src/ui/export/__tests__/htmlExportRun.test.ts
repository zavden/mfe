// @vitest-environment node
/* What Export ▸ HTML does with a folder — written, and written again over the work of its owner
 * and over the sound of an earlier export — and with the scene's sound. */
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import type { ExportedFile } from '../../../export/html/exportHtml';
import { sceneFile } from '../../../export/html/packDeck';
import { smallProject } from '../../../model/__tests__/fixtures';
import {
  folderNotice,
  mixPageSound,
  pageSoundBytesPerSecond,
  pageSoundProblem,
  writeExportFolder,
  type FolderWritten,
  type WritableFolder,
} from '../htmlExportRun';

/** A folder kept in memory, as the browser's handles give one. */
class MemoryFolder implements WritableFolder {
  readonly folders = new Map<string, MemoryFolder>();
  readonly files = new Map<string, Uint8Array>();
  /** Names the folder does not let go of (a file another program holds). */
  readonly held = new Set<string>();
  /** How many times each file was read. */
  readonly reads = new Map<string, number>();
  constructor(readonly name: string) {}
  getDirectoryHandle(name: string, options: { create?: boolean } = {}) {
    let folder = this.folders.get(name);
    if (!folder) {
      if (!options.create) return Promise.reject(new DOMException('gone', 'NotFoundError'));
      this.folders.set(name, (folder = new MemoryFolder(name)));
    }
    return Promise.resolve(folder);
  }
  getFileHandle(name: string, options: { create?: boolean } = {}) {
    if (!this.files.has(name)) {
      if (!options.create) return Promise.reject(new DOMException('gone', 'NotFoundError'));
      this.files.set(name, new Uint8Array());
    }
    return Promise.resolve({
      createWritable: () => {
        let pending: Uint8Array = new Uint8Array();
        return Promise.resolve({
          write: (data: Uint8Array) => {
            pending = data;
            return Promise.resolve();
          },
          close: () => {
            this.files.set(name, pending);
            return Promise.resolve();
          },
        });
      },
      getFile: () => {
        const bytes = this.files.get(name);
        if (!bytes) return Promise.reject(new DOMException('gone', 'NotFoundError'));
        this.reads.set(name, (this.reads.get(name) ?? 0) + 1);
        return Promise.resolve(new Blob([new Uint8Array(bytes)]));
      },
    });
  }
  removeEntry(name: string) {
    if (this.held.has(name)) {
      return Promise.reject(new DOMException('held', 'NoModificationAllowedError'));
    }
    if (!this.files.delete(name)) return Promise.reject(new DOMException('gone', 'NotFoundError'));
    return Promise.resolve();
  }
  text(path: string): string | undefined {
    const parts = path.split('/');
    const leaf = parts.pop()!;
    const folder = parts.reduce<MemoryFolder | undefined>(
      (at, part) => at?.folders.get(part),
      this as MemoryFolder,
    );
    const bytes = folder?.files.get(leaf);
    return bytes && new TextDecoder().decode(bytes);
  }
}

const bytesOf = (text: string) => new TextEncoder().encode(text);
const file = (path: string, text: string): ExportedFile => ({ path, bytes: bytesOf(text) });
const first = [
  file('index.html', 'page 1'),
  file('scene.js', 'scene 1'),
  file('custom.js', 'custom 1'),
  file('player.css', 'look 1'),
  file('types/mfe.d.ts', 'types 1'),
];

describe('writeExportFolder', () => {
  it('makes the scene’s folder inside the one chosen, with its files and its sub-folders', async () => {
    const parent = new MemoryFolder('Talks');
    const result = await writeExportFolder(parent, 'my-scene', first);
    expect(result).toEqual({
      folder: 'my-scene',
      written: ['index.html', 'scene.js', 'custom.js', 'player.css', 'types/mfe.d.ts'],
      kept: [],
      removed: [],
      left: [],
    });
    expect(parent.text('my-scene/scene.js')).toBe('scene 1');
    expect(parent.text('my-scene/types/mfe.d.ts')).toBe('types 1');
    expect(parent.files.size).toBe(0); // nothing beside the folder
  });

  it('written again, keeps what its owner works in and writes the rest anew', async () => {
    const parent = new MemoryFolder('Talks');
    await writeExportFolder(parent, 'my-scene', first);
    // The owner's work, between the two exports.
    const scene = parent.folders.get('my-scene')!;
    scene.files.set('custom.js', new TextEncoder().encode('my animation'));
    scene.files.set('notes.txt', new TextEncoder().encode('mine'));
    const again = [
      file('index.html', 'page 2'),
      file('scene.js', 'scene 2'),
      file('custom.js', 'custom 2'),
      file('player.css', 'look 2'),
      file('types/mfe.d.ts', 'types 2'),
      file('audio.m4a', 'sound'),
    ];
    const result = await writeExportFolder(parent, 'my-scene', again);
    expect(result.kept).toEqual(['index.html', 'custom.js', 'player.css']);
    expect(result.written).toEqual(['scene.js', 'types/mfe.d.ts', 'audio.m4a']);
    expect(parent.text('my-scene/custom.js')).toBe('my animation');
    expect(parent.text('my-scene/index.html')).toBe('page 1');
    expect(parent.text('my-scene/scene.js')).toBe('scene 2');
    expect(parent.text('my-scene/types/mfe.d.ts')).toBe('types 2');
    expect(parent.text('my-scene/notes.txt')).toBe('mine');
  });

  it('writes anew a kept file that is not there', async () => {
    const parent = new MemoryFolder('Talks');
    await writeExportFolder(parent, 'my-scene', first);
    parent.folders.get('my-scene')!.files.delete('player.css');
    const result = await writeExportFolder(parent, 'my-scene', first);
    expect(result.kept).toEqual(['index.html', 'custom.js']);
    expect(result.written).toContain('player.css');
  });
});

/* A folder exported with its sound and then without it kept the sound: whoever handed the folder
 * over handed over a recording its page no longer played (B-04 of the final audit). The export
 * removes the file it wrote, which it knows by the SHA-256 its `scene.js` recorded, and no other. */
describe('writeExportFolder, over a folder that holds the sound of an earlier export', () => {
  const project = smallProject();
  const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  /** The files of an export: with `sound`, the file of that name and a scene that records it. */
  const exported = (take: string, sound?: { path: string; text: string }): ExportedFile[] => [
    file('index.html', `page ${take}`),
    file(
      'scene.js',
      sceneFile(
        'my-scene',
        project,
        sound ? { file: sound.path, sha256: sha256(bytesOf(sound.text)) } : null,
      ),
    ),
    file('custom.js', `custom ${take}`),
    file('player.css', `look ${take}`),
    ...(sound ? [file(sound.path, sound.text)] : []),
  ];
  const WAV = { path: 'audio.wav', text: 'the narration, as PCM' };
  const M4A = { path: 'audio.m4a', text: 'the narration, as AAC' };

  /** A folder exported once with `sound`, then worked on by its owner. */
  async function worked(sound = WAV) {
    const parent = new MemoryFolder('Talks');
    await writeExportFolder(parent, 'my-scene', exported('1', sound));
    const scene = parent.folders.get('my-scene')!;
    scene.files.set('custom.js', bytesOf('my animation'));
    scene.files.set('player.css', bytesOf('my look'));
    scene.files.set('index.html', bytesOf('my page'));
    scene.files.set('notes.txt', bytesOf('mine'));
    return { parent, scene };
  }

  it('removes the sound it wrote when the scene goes without one, and nothing of its owner’s', async () => {
    const { parent, scene } = await worked();
    const checking = vi.fn();
    const result = await writeExportFolder(parent, 'my-scene', exported('2'), {
      onChecking: checking,
    });
    expect(result.removed).toEqual(['audio.wav']);
    expect(result.left).toEqual([]);
    expect(scene.files.has('audio.wav')).toBe(false);
    expect(checking).toHaveBeenCalledTimes(1);
    // The new scene names no sound, and the owner's files are as they were.
    expect(parent.text('my-scene/scene.js')).toMatch(/\n\}\);\n$/);
    expect(parent.text('my-scene/custom.js')).toBe('my animation');
    expect(parent.text('my-scene/player.css')).toBe('my look');
    expect(parent.text('my-scene/index.html')).toBe('my page');
    expect(parent.text('my-scene/notes.txt')).toBe('mine');
    expect(result.kept).toEqual(['index.html', 'custom.js', 'player.css']);
  });

  it('removes the sound of the other kind, written from another browser', async () => {
    const { parent, scene } = await worked(M4A);
    const result = await writeExportFolder(parent, 'my-scene', exported('2', WAV));
    expect(result.removed).toEqual(['audio.m4a']);
    expect(result.left).toEqual([]);
    expect([...scene.files.keys()].filter((name) => name.startsWith('audio.'))).toEqual([
      'audio.wav',
    ]);
    expect(parent.text('my-scene/audio.wav')).toBe(WAV.text);
  });

  it('writes over the sound of the same kind, with nothing to remove or to read', async () => {
    const { parent, scene } = await worked();
    const checking = vi.fn();
    const result = await writeExportFolder(
      parent,
      'my-scene',
      exported('2', { path: 'audio.wav', text: 'said again' }),
      { onChecking: checking },
    );
    expect(result).toMatchObject({ removed: [], left: [] });
    expect(parent.text('my-scene/audio.wav')).toBe('said again');
    expect(checking).not.toHaveBeenCalled();
    expect(scene.reads.get('audio.wav')).toBeUndefined();
  });

  it('leaves a sound whose bytes are not the ones it wrote: its owner put it there', async () => {
    const { parent, scene } = await worked();
    scene.files.set('audio.wav', bytesOf('my own recording'));
    const result = await writeExportFolder(parent, 'my-scene', exported('2'));
    expect(result.removed).toEqual([]);
    expect(result.left).toEqual([{ path: 'audio.wav', reason: 'unknown' }]);
    expect(parent.text('my-scene/audio.wav')).toBe('my own recording');
  });

  it('leaves a sound the earlier scene file keeps no record of, without reading it', async () => {
    // Exported before the record was kept, or with the end of scene.js edited since.
    const { parent, scene } = await worked();
    scene.files.set('scene.js', bytesOf(sceneFile('my-scene', project)));
    scene.files.set('audio.m4a', bytesOf('from somewhere else'));
    const checking = vi.fn();
    const result = await writeExportFolder(parent, 'my-scene', exported('2'), {
      onChecking: checking,
    });
    expect(result.removed).toEqual([]);
    expect(result.left).toEqual([
      { path: 'audio.m4a', reason: 'unknown' },
      { path: 'audio.wav', reason: 'unknown' },
    ]);
    expect(parent.text('my-scene/audio.wav')).toBe(WAV.text);
    expect(parent.text('my-scene/audio.m4a')).toBe('from somewhere else');
    expect(checking).not.toHaveBeenCalled();
    expect(scene.reads.get('audio.wav')).toBeUndefined();
  });

  it('leaves a file of the other name than the one recorded, even with the recorded bytes', async () => {
    const { parent, scene } = await worked();
    scene.files.set('audio.m4a', bytesOf(WAV.text));
    const result = await writeExportFolder(parent, 'my-scene', exported('2'));
    expect(result.removed).toEqual(['audio.wav']);
    expect(result.left).toEqual([{ path: 'audio.m4a', reason: 'unknown' }]);
  });

  it('says so when the folder does not let its sound go', async () => {
    const { parent, scene } = await worked();
    scene.held.add('audio.wav');
    const result = await writeExportFolder(parent, 'my-scene', exported('2'));
    expect(result.removed).toEqual([]);
    expect(result.left).toEqual([{ path: 'audio.wav', reason: 'failed' }]);
    expect(parent.text('my-scene/audio.wav')).toBe(WAV.text);
    // The rest of the export is written all the same.
    expect(parent.text('my-scene/scene.js')).toMatch(/\n\}\);\n$/);
  });

  it('removes nothing from a folder that has no sound, and reads nothing for it', async () => {
    const parent = new MemoryFolder('Talks');
    await writeExportFolder(parent, 'my-scene', exported('1'));
    const result = await writeExportFolder(parent, 'my-scene', exported('2'));
    expect(result).toMatchObject({ removed: [], left: [] });
  });
});

describe('folderNotice', () => {
  const done = (part: Partial<FolderWritten>): FolderWritten => ({
    folder: 's',
    written: [],
    kept: [],
    removed: [],
    left: [],
    ...part,
  });

  it('says where the scene went and what to do with it', () => {
    const notice = folderNotice(done({ folder: 'my-scene', written: ['scene.js'] }), 'Talks');
    expect(notice.title).toBe('Exported to “my-scene” in “Talks”');
    expect(notice.message).toBe(
      'Open its index.html in a browser. To work on the scene with an agent, give it the folder: AGENTS.md is its guide.',
    );
  });

  it('says which files were left as they were', () => {
    const kept = (names: string[]) => folderNotice(done({ kept: names }), 'T').message;
    expect(kept(['custom.js'])).toContain(
      ' custom.js was there already and was left as it was: your work on the scene is in it.',
    );
    expect(kept(['index.html', 'custom.js', 'player.css'])).toContain(
      ' index.html, custom.js and player.css were there already and were left as they were: your work on the scene is in them.',
    );
  });

  it('says which sound of an earlier export it removed, and which file it left and why', () => {
    expect(folderNotice(done({ removed: ['audio.wav'] }), 'T').message).toMatch(
      / audio\.wav, the sound an earlier export wrote there, was removed: this page does not play it\.$/,
    );
    expect(
      folderNotice(done({ left: [{ path: 'audio.m4a', reason: 'unknown' }] }), 'T').message,
    ).toMatch(
      / audio\.m4a is still in the folder, though this page does not play it: it is not known as a sound the app wrote there, so it was left\. Delete it if it should not go with the folder\.$/,
    );
    expect(
      folderNotice(done({ left: [{ path: 'audio.wav', reason: 'failed' }] }), 'T').message,
    ).toMatch(
      / audio\.wav, the sound an earlier export wrote there, could not be removed\. This page does not play it: delete it if it should not go with the folder\.$/,
    );
    // After what was kept, each file with its own sentence.
    const all = folderNotice(
      done({
        kept: ['custom.js'],
        removed: ['audio.wav'],
        left: [{ path: 'audio.m4a', reason: 'unknown' }],
      }),
      'T',
    ).message;
    expect(all.indexOf('custom.js was there')).toBeLessThan(all.indexOf('audio.wav, the sound'));
    expect(all.indexOf('audio.wav, the sound')).toBeLessThan(all.indexOf('audio.m4a is still'));
  });
});

describe('the sound of the page', () => {
  it('is the whole scene mixed, as AAC where the browser encodes it and as PCM where it does not', async () => {
    const project = smallProject();
    const exportAudio = vi.fn(
      async (_plan: unknown, _reader: unknown, options: { format: string }) =>
        Promise.resolve(new Blob([new Uint8Array([1, 2, 3])], { type: `audio/${options.format}` })),
    );
    const aac = await mixPageSound(project, true, undefined, {
      exportAudio: exportAudio as never,
    });
    // With the SHA-256 of the file, which the folder's scene.js records.
    expect(aac).toEqual({
      bytes: new Uint8Array([1, 2, 3]),
      extension: 'm4a',
      mime: 'audio/mp4',
      sha256: createHash('sha256')
        .update(new Uint8Array([1, 2, 3]))
        .digest('hex'),
    });
    expect(exportAudio.mock.calls[0]![2].format).toBe('m4a');
    // The whole scene: 6 s at the mixer's rate.
    expect((exportAudio.mock.calls[0]![0] as { frameCount: number }).frameCount).toBe(6 * 48_000);
    const wav = await mixPageSound(project, false, undefined, {
      exportAudio: exportAudio as never,
    });
    expect(wav).toMatchObject({ extension: 'wav', mime: 'audio/wav' });
    expect(exportAudio.mock.calls[1]![2].format).toBe('wav');
  });

  it('refuses a scene of more than an hour, and says how much a second weighs', async () => {
    const long = smallProject();
    long.meta.duration = 2 * 60 * 60;
    expect(pageSoundProblem(long)).toContain('at most 60 minutes of sound');
    expect(pageSoundProblem(smallProject())).toBeNull();
    await expect(mixPageSound(long, true)).rejects.toThrow('Export the page without its sound.');
    expect(pageSoundBytesPerSecond(false)).toBe(192_000);
    expect(pageSoundBytesPerSecond(true)).toBe(24_000);
  });
});
