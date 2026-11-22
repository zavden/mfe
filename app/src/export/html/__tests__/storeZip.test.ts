// @vitest-environment node
/* The store-only zip: its bytes as the format says, and that the tools of a real system read it. */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { pythonCommand } from '../../../../build/python';
import { crc32, storeZip } from '../storeZip';

const text = (value: string) => new TextEncoder().encode(value);
const when = new Date(2026, 10, 18, 12, 30, 44);

describe('storeZip', () => {
  it('computes the CRC-32 of the format', () => {
    expect(crc32(text('123456789'))).toBe(0xcbf43926);
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it('writes each file stored, then the directory, then its end', () => {
    const zip = storeZip([{ path: 'a/b.txt', bytes: text('hello') }], when);
    const view = new DataView(zip.buffer);
    expect(view.getUint32(0, true)).toBe(0x04034b50);
    expect(view.getUint16(8, true)).toBe(0); // stored
    expect(view.getUint32(14, true)).toBe(crc32(text('hello')));
    expect(view.getUint32(18, true)).toBe(5);
    expect(new TextDecoder().decode(zip.subarray(30, 37))).toBe('a/b.txt');
    expect(new TextDecoder().decode(zip.subarray(37, 42))).toBe('hello');
    expect(view.getUint32(42, true)).toBe(0x02014b50);
    const end = zip.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    expect(view.getUint16(end + 10, true)).toBe(1);
    expect(view.getUint32(end + 16, true)).toBe(42); // where the directory starts
    // 12:30:44 on 2026-11-18, as a zip keeps a date.
    expect(view.getUint16(10, true)).toBe((12 << 11) | (30 << 5) | 22);
    expect(view.getUint16(12, true)).toBe(((2026 - 1980) << 9) | (11 << 5) | 18);
  });

  it('is the same bytes for the same files and date, and an empty archive is its end alone', () => {
    const files = [
      { path: 'index.html', bytes: text('<!doctype html>') },
      { path: 'types/mfe.d.ts', bytes: text('export {};') },
    ];
    expect(storeZip(files, when)).toEqual(storeZip(files, when));
    expect(storeZip([], when)).toHaveLength(22);
  });

  it('refuses a path a zip cannot hold', () => {
    for (const path of ['', '/abs.txt', 'a\\b.txt']) {
      expect(() => storeZip([{ path, bytes: text('x') }])).toThrow('is not a path a zip can hold');
    }
  });

  it('is read by Python’s zipfile: the names, the bytes, no error', () => {
    const files = [
      { path: 'scene/index.html', bytes: text('<!doctype html><title>ñ</title>\n') },
      { path: 'scene/scene.js', bytes: text('MFE.scene("x", {"fórmula": "x²"});\n') },
      { path: 'scene/types/mfe.d.ts', bytes: text('export {};\n') },
      { path: 'scene/empty.txt', bytes: new Uint8Array() },
    ];
    const folder = mkdtempSync(join(tmpdir(), 'mfe-zip-'));
    try {
      const archive = join(folder, 'scene.zip');
      writeFileSync(archive, storeZip(files, when));
      const script = [
        'import json, sys, zipfile',
        'z = zipfile.ZipFile(sys.argv[1])',
        'assert z.testzip() is None',
        'print(json.dumps({i.filename: z.read(i).decode("utf-8") for i in z.infolist()}))',
      ].join('\n');
      const out = execFileSync(pythonCommand(), ['-I', '-c', script, archive], {
        encoding: 'utf8',
      });
      expect(JSON.parse(out)).toEqual(
        Object.fromEntries(files.map((file) => [file.path, new TextDecoder().decode(file.bytes)])),
      );
      expect(readFileSync(archive).length).toBe(storeZip(files, when).length);
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  });
});
