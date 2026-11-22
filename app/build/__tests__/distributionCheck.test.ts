// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { distributionCheck, undistributable } from '../distributionCheck';

it('recognises FFmpeg compiled into a script or a WebAssembly module', () => {
  // Strings of the data section of a libavcodec build, as an embedding script carries them.
  expect(
    undistributable('\\0libavutil/mem.c\\0libavcodec/aacenc.c\\0libavcodec/avcodec.c'),
  ).toEqual(['FFmpeg (libavcodec and its sister libraries)']);
  expect(undistributable('nv21\\0d3d11\\0uyyvyy411\\0m101\\0Lavc63.25.101\\x007.1')).toHaveLength(
    1,
  );
  expect(undistributable('libswresample/resample.c')).toHaveLength(1);
});

it('does not take the words of the app or of its libraries for it', () => {
  // Mediabunny reads the encoder tag of an MP3; the app names the companion's ffmpeg.
  expect(undistributable('(n===`LAME`||n===`Lavf`||n===`Lavc`)&&(this.primingDelay=0)')).toEqual(
    [],
  );
  expect(undistributable('choose "Companion · ffmpeg". FFmpeg must be installed.')).toEqual([]);
});

type Output = Record<
  string,
  { type: 'chunk'; code: string } | { type: 'asset'; source: string | Uint8Array }
>;

/** Run the plugin's hooks over a made-up build output, as Vite and Rolldown would. */
function check(bundle: Output, publicDir = '') {
  const plugin = distributionCheck();
  (plugin.configResolved as unknown as (config: { publicDir: string }) => void)({ publicDir });
  const hook = plugin.generateBundle as unknown as (
    this: { error(message: string): never },
    options: unknown,
    bundle: unknown,
  ) => void;
  hook.call(
    {
      error(message) {
        throw new Error(message);
      },
    },
    {},
    bundle,
  );
}

it('fails the build that would emit it, in the bundle or in a file emitted beside it', () => {
  const ffmpeg = 'x\\0libavcodec/aacenc.c\\0y';
  expect(() =>
    check({ 'assets/index-abc.js': { type: 'chunk', code: `var a=\`${ffmpeg}\`` } }),
  ).toThrow(
    'assets/index-abc.js contains FFmpeg (libavcodec and its sister libraries), which this project does not distribute.',
  );
  expect(() => check({ 'chroma-lab/app.bundle.js': { type: 'asset', source: ffmpeg } })).toThrow(
    'chroma-lab/app.bundle.js contains FFmpeg',
  );
  expect(() =>
    check({ 'assets/aac.wasm': { type: 'asset', source: new TextEncoder().encode(ffmpeg) } }),
  ).toThrow('assets/aac.wasm contains FFmpeg');
});

it('lets a clean build through, and media that names the encoder that wrote it', () => {
  expect(() =>
    check({
      'assets/index-abc.js': { type: 'chunk', code: 'n===`Lavf`||n===`Lavc`' },
      'chroma-lab/examples/previews/aurora.mp4': { type: 'asset', source: 'Lavf62.3.100' },
      'index.html': { type: 'asset', source: '<html></html>' },
    }),
  ).not.toThrow();
});

it('reads the public folder too: Vite copies it into the build without bundling it', () => {
  const publicDir = mkdtempSync(join(tmpdir(), 'mfe-public-'));
  try {
    mkdirSync(join(publicDir, 'codecs'));
    writeFileSync(join(publicDir, 'codecs', 'notes.txt'), 'libavcodec/aacenc.c');
    expect(() => check({}, publicDir)).not.toThrow();
    writeFileSync(join(publicDir, 'codecs', 'aac.wasm'), '\0libavcodec/aacenc.c\0');
    expect(() => check({}, publicDir)).toThrow('public/codecs/aac.wasm contains FFmpeg');
    // A project without a public folder (this one) has nothing there to read.
    expect(() => check({}, join(publicDir, 'missing'))).not.toThrow();
  } finally {
    rmSync(publicDir, { recursive: true });
  }
});

it('names a file of the public folder as the build serves it, on Windows too', () => {
  const publicDir = mkdtempSync(join(tmpdir(), 'mfe-public-'));
  try {
    // A recursive listing gives `codecs\aac.wasm` on Windows. On Linux this writes a file whose
    // own name has the backslash in it, and the listing reads the same.
    mkdirSync(join(publicDir, 'codecs'));
    writeFileSync(join(publicDir, 'codecs\\aac.wasm'), '\0libavcodec/aacenc.c\0');
    expect(() => check({}, publicDir)).toThrow('public/codecs/aac.wasm contains FFmpeg');
  } finally {
    rmSync(publicDir, { recursive: true });
  }
});
