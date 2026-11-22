import { describe, expect, it, vi } from 'vitest';
import {
  isDirectoryHandle,
  isProjectFileName,
  listProjectFiles,
  writeToHandle,
  type DirectoryEntry,
  type DirectoryHandleLike,
} from '../files';

function fileEntry(name: string, text: string, lastModified = 7): DirectoryEntry {
  return {
    kind: 'file',
    name,
    getFile: async () => new File([text], name, { lastModified }),
    createWritable: () => Promise.reject(new Error('not written here')),
  };
}

function directory(name: string, entries: DirectoryEntry[]): DirectoryHandleLike {
  return {
    kind: 'directory',
    name,
    async *values() {
      yield* entries;
    },
  };
}

describe('isProjectFileName', () => {
  it('accepts .json files (any case) that are not hidden', () => {
    expect(isProjectFileName('a.mfe.json')).toBe(true);
    expect(isProjectFileName('A.JSON')).toBe(true);
    expect(isProjectFileName('.a.json')).toBe(false);
    expect(isProjectFileName('a.json.bak')).toBe(false);
    expect(isProjectFileName('a.txt')).toBe(false);
  });
});

describe('writeToHandle', () => {
  it.each(['write', 'close'] as const)(
    'aborts after a failed %s and preserves the I/O error',
    async (stage) => {
      const error = new Error('disk full');
      const stream = {
        write: vi.fn(async () => undefined),
        close: vi.fn(async () => undefined),
        abort: vi.fn(async () => {
          throw new Error('already closed');
        }),
      };
      stream[stage].mockRejectedValue(error);
      const handle = { name: 'project.json', getFile: vi.fn(), createWritable: async () => stream };
      await expect(writeToHandle(handle, 'project bytes')).rejects.toBe(error);
      expect(stream.abort).toHaveBeenCalledOnce();
      if (stage === 'write') expect(stream.close).not.toHaveBeenCalled();
    },
  );
});

describe('listProjectFiles', () => {
  it('reads the json files of the folder, with their handles, and skips sub-folders', async () => {
    const a = fileEntry('a.mfe.json', '{"a":1}', 11);
    const dir = directory('Projects', [
      a,
      { kind: 'directory', name: 'sub' },
      fileEntry('notes.txt', 'hi'),
      fileEntry('b.json', '{"b":2}', 22),
    ]);
    const files = await listProjectFiles(dir);
    expect(files).toEqual([
      { fileName: 'a.mfe.json', lastModified: 11, text: '{"a":1}', handle: a },
      { fileName: 'b.json', lastModified: 22, text: '{"b":2}', handle: expect.anything() },
    ]);
  });
});

describe('a package of the folder that cannot be read', () => {
  it('is listed with why, and with no text', async () => {
    const cut = fileEntry('cut.mfe', 'MFE', 5);
    const other = fileEntry('other.mfe', 'x'.repeat(64), 6);
    expect(await listProjectFiles(directory('Projects', [cut, other]))).toEqual([
      {
        fileName: 'cut.mfe',
        lastModified: 5,
        text: '',
        unreadable: 'The .mfe project is damaged or unsupported: the header is incomplete.',
        handle: cut,
      },
      {
        fileName: 'other.mfe',
        lastModified: 6,
        text: '',
        unreadable: 'The .mfe project is damaged or unsupported: its signature is not recognized.',
        handle: other,
      },
    ]);
  });
});

describe('isDirectoryHandle', () => {
  it('tells a directory handle from a file handle and from a snapshot', () => {
    expect(isDirectoryHandle(directory('x', []))).toBe(true);
    expect(isDirectoryHandle(fileEntry('a.json', '{}'))).toBe(false);
    expect(isDirectoryHandle({ v: 1, folderName: 'x', takenAt: 1, files: [] })).toBe(false);
    expect(isDirectoryHandle(null)).toBe(false);
  });
});
