// @vitest-environment node
/* The forms of Export ▸ HTML: the folder as bytes with its sound, the zip of it, and the page as
 * one file — which is run here as a browser runs it. */
import { beforeAll, describe, expect, it } from 'vitest';
import { renderedExample, type Rendered } from '../../../embed/__tests__/fixtures';
import { smallProject } from '../../../model/__tests__/fixtures';
import { nodePage } from '../../../test/nodeDocument';
import {
  exportedFolder,
  exportedSingle,
  exportedZip,
  KEPT_FILES,
  marksSummary,
  sceneForPage,
  type ExportedSound,
  type HtmlExportInput,
} from '../exportHtml';
import { recordedSound, sceneName } from '../packDeck';
import { RUNTIME_ASSETS } from '../runtimeAssets';
import { base64, dataAddress, singleFilePage } from '../singleFile';
import { crc32 } from '../storeZip';

let hello: Rendered;
beforeAll(async () => {
  hello = await renderedExample('hello.mfe.json');
}, 60_000);

const sound: ExportedSound = {
  bytes: new Uint8Array([0, 1, 2, 250, 251, 252, 253]),
  extension: 'm4a',
  mime: 'audio/mp4',
  sha256: 'ab'.repeat(32),
};
const input = (extra: Partial<HtmlExportInput> = {}): HtmlExportInput => ({
  project: hello.project,
  resolved: hello.resolved,
  assets: RUNTIME_ASSETS,
  ...extra,
});
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);

interface DeckWindow {
  MFE: {
    decks: {
      duration: number;
      hasSound: boolean;
      problems: unknown[];
      stage: Element | null;
      seek(time: number): void;
    }[];
    scenes: string[];
  };
}

describe('the folder', () => {
  it('is the packed files as bytes, and without a sound the scene names none', () => {
    const files = exportedFolder(input());
    expect(files.map((file) => file.path)).toContain('index.html');
    expect(files.map((file) => file.path)).not.toContain('audio.m4a');
    const scene = text(files.find((file) => file.path === 'scene.js')!.bytes);
    expect(scene).toMatch(/\n\}\);\n$/);
    expect(recordedSound(scene)).toBeNull();
    for (const kept of KEPT_FILES) expect(files.map((file) => file.path)).toContain(kept);
  });

  it('carries the sound beside the scene, which names it', () => {
    const files = exportedFolder(input({ sound }));
    expect(files.at(-1)).toEqual({ path: 'audio.m4a', bytes: sound.bytes });
    const scene = text(files.find((file) => file.path === 'scene.js')!.bytes);
    // With the SHA-256 of the file: what a later export over the folder knows it by.
    expect(scene.endsWith(`\n}, { "audio": "audio.m4a", "sha256": "${sound.sha256}" });\n`)).toBe(
      true,
    );
    expect(recordedSound(scene)).toEqual({ file: 'audio.m4a', sha256: sound.sha256 });
    const wav = exportedFolder(input({ sound: { ...sound, extension: 'wav', mime: 'audio/wav' } }));
    expect(wav.at(-1)!.path).toBe('audio.wav');
    expect(recordedSound(text(wav.find((file) => file.path === 'scene.js')!.bytes))).toEqual({
      file: 'audio.wav',
      sha256: sound.sha256,
    });
  });
});

describe('the zip', () => {
  it('holds the folder under the scene’s name, every file stored whole', () => {
    const when = new Date(2026, 10, 18, 12, 0, 0);
    const zip = exportedZip(input({ sound }), when);
    const name = sceneName(hello.project);
    expect(zip.path).toBe(`${name}.zip`);
    const view = new DataView(zip.bytes.buffer);
    const end = zip.bytes.length - 22;
    expect(view.getUint32(end, true)).toBe(0x06054b50);
    const files = exportedFolder(input({ sound }));
    expect(view.getUint16(end + 10, true)).toBe(files.length);
    // The directory: each entry's name, size and CRC, in order.
    let at = view.getUint32(end + 16, true);
    for (const file of files) {
      expect(view.getUint32(at, true)).toBe(0x02014b50);
      const length = view.getUint16(at + 28, true);
      expect(text(zip.bytes.subarray(at + 46, at + 46 + length))).toBe(`${name}/${file.path}`);
      expect(view.getUint32(at + 24, true)).toBe(file.bytes.length);
      expect(view.getUint32(at + 16, true)).toBe(crc32(file.bytes));
      at += 46 + length;
    }
    expect(exportedZip(input({ sound }), when).bytes).toEqual(zip.bytes);
  });
});

describe('the page as one file', () => {
  it('is one page that runs by itself: it mounts its scene and says nothing', async () => {
    const file = exportedSingle(input());
    expect(file.path).toBe(`${sceneName(hello.project)}.html`);
    const html = text(file.bytes);
    expect(html.startsWith('<!doctype html>\n<!--\n')).toBe(true);
    // Nothing beside it: no file is asked for (what the guide shows is in a comment).
    const markup = html.replace(/<!--[\s\S]*?-->/g, '');
    expect(markup).not.toMatch(/<script[^>]*\ssrc=/);
    expect(markup).not.toMatch(/<link\b/);
    const { window, said } = await nodePage(html);
    const { MFE } = window as unknown as DeckWindow;
    expect(MFE.scenes).toEqual([sceneName(hello.project)]);
    expect(MFE.decks).toHaveLength(1);
    const [deck] = MFE.decks;
    expect(deck!.problems).toEqual([]);
    expect(deck!.duration).toBeGreaterThan(0);
    expect(deck!.hasSound).toBe(false);
    deck!.seek(deck!.duration / 2);
    expect(deck!.stage!.querySelectorAll('path').length).toBeGreaterThan(0);
    expect(said).toEqual([]);
    expect(window.document.querySelector('style')!.textContent).toContain('.mfe-deck');
    window.close();
  });

  it('carries its sound inside itself', async () => {
    const html = text(exportedSingle(input({ sound })).bytes);
    expect(html).toContain(`data-audio="${dataAddress(sound.bytes, 'audio/mp4')}"`);
    const { window } = await nodePage(html);
    const { MFE } = window as unknown as DeckWindow;
    expect(MFE.decks[0]!.hasSound).toBe(true);
    expect(window.document.querySelector('audio')!.getAttribute('src')).toBe(
      dataAddress(sound.bytes, 'audio/mp4'),
    );
    window.close();
  });

  it('carries the folder’s guide as it is written, where the browser does nothing with it', async () => {
    // What a guide holds: a CSS property, the tags that embed the scene, markup.
    const guide =
      '# Guide\n\n`.mfe-deck { --mfe-accent: #f60 }`\n\n' +
      '<script src="mfe-runtime.js"></script>\n<script>window.ran = 1</script><b>not markup</b>';
    const html = singleFilePage(hello.project, hello.resolved, RUNTIME_ASSETS, { guide });
    expect(html).toContain(guide);
    const { window, said } = await nodePage(html);
    const comments = [...window.document.body.childNodes].filter((node) => node.nodeType === 8);
    expect(comments.filter((node) => node.textContent!.includes(guide))).toHaveLength(1);
    expect(window.document.querySelectorAll('b')).toHaveLength(0);
    expect((window as unknown as { ran?: number }).ran).toBeUndefined();
    expect((window as unknown as DeckWindow).MFE.decks).toHaveLength(1);
    expect(said).toEqual([]);
    window.close();
    expect(singleFilePage(hello.project, hello.resolved, RUNTIME_ASSETS)).not.toContain(
      'THE GUIDE',
    );
  });

  it('keeps a guide that would end its comment inside it', async () => {
    const guide = 'a --> <script>window.ran = 1</script> b --!> <b>c</b> <!-- d --mfe-x';
    const html = singleFilePage(hello.project, hello.resolved, RUNTIME_ASSETS, { guide });
    expect(html).toContain(
      'a --&gt; <script>window.ran = 1</script> b --!&gt; <b>c</b> &lt;!-- d --mfe-x',
    );
    const { window, said } = await nodePage(html);
    expect((window as unknown as { ran?: number }).ran).toBeUndefined();
    expect(window.document.querySelectorAll('b')).toHaveLength(0);
    expect((window as unknown as DeckWindow).MFE.decks).toHaveLength(1);
    expect(said).toEqual([]);
    window.close();
  });

  it('cannot be broken out of by what the scene holds', async () => {
    const hostile = structuredClone(hello.project);
    hostile.meta.name = 'x --> </script><script>window.pwned = 1</script> <!--';
    hostile.formulas[0]!.name = '</script><img src=x onerror="window.pwned = 2">';
    const html = text(exportedSingle(input({ project: hostile })).bytes);
    const { window } = await nodePage(html);
    expect((window as unknown as { pwned?: number }).pwned).toBeUndefined();
    const { MFE } = window as unknown as DeckWindow;
    expect(MFE.decks).toHaveLength(1);
    expect(window.document.title).toBe(hostile.meta.name);
    expect(window.document.querySelectorAll('img')).toHaveLength(0);
    window.close();
  });
});

describe('base64', () => {
  it('writes bytes as base64, with its padding', () => {
    const bytes = (value: string) => new TextEncoder().encode(value);
    expect(base64(bytes(''))).toBe('');
    expect(base64(bytes('f'))).toBe('Zg==');
    expect(base64(bytes('fo'))).toBe('Zm8=');
    expect(base64(bytes('foo'))).toBe('Zm9v');
    expect(base64(bytes('foobar'))).toBe('Zm9vYmFy');
    expect(base64(new Uint8Array([255, 254, 253, 0]))).toBe('//79AA==');
    expect(dataAddress(bytes('hi'), 'text/plain')).toBe('data:text/plain;base64,aGk=');
  });
});

describe('sceneForPage', () => {
  it('leaves out the marks an export does not carry, and nothing else', () => {
    const project = structuredClone(hello.project);
    expect(sceneForPage(project)).toBe(project);
    project.slides = {
      marks: [
        { id: 'p1', time: 999, kind: 'pause' },
        { id: 'p2', time: 0, kind: 'pause' },
        { id: 'p3', time: 0, kind: 'pause' },
        { id: 'p4', time: 0, kind: 'comment', text: 'Start here' },
      ],
    };
    const scene = sceneForPage(project);
    expect(scene.slides!.marks.map((mark) => mark.id)).toEqual(['p4', 'p2']);
    expect(project.slides.marks).toHaveLength(4);
    expect({ ...scene, slides: undefined }).toEqual({ ...project, slides: undefined });
    // And the page reads it without a word.
    const scene_js = new TextDecoder().decode(
      exportedFolder(input({ project })).find((file) => file.path === 'scene.js')!.bytes,
    );
    expect(scene_js).not.toContain('"p1"');
    expect(scene_js).toContain('"p4"');
    // Every mark standing: the very project.
    const clean = { ...project, slides: { marks: scene.slides!.marks } };
    expect(sceneForPage(clean)).toBe(clean);
  });
});

describe('marksSummary', () => {
  it('counts the pauses that skip the wait after them, where they have one to skip', () => {
    const project = smallProject();
    project.slides = {
      marks: [
        { id: 'p1', time: 1.5, kind: 'pause', skipWait: true },
        { id: 'p2', time: 3, kind: 'pause', skipWait: true }, // between two animations: none
        { id: 'p3', time: 4.5, kind: 'pause' },
        { id: 'p4', time: 2.5, kind: 'pause', skipWait: true }, // under an animation: left out
      ],
    };
    expect(marksSummary(project)).toMatchObject({ pauses: 3, skipping: 1, comments: 0 });
  });

  it('counts the pauses and the comments an export carries, and lists what it leaves out', () => {
    const project = structuredClone(hello.project);
    expect(marksSummary(project)).toEqual({ pauses: 0, skipping: 0, comments: 0, leftOut: [] });
    project.slides = {
      marks: [
        { id: 'p1', time: 999, kind: 'pause' },
        { id: 'p2', time: 0, kind: 'pause' },
        { id: 'p3', time: 0, kind: 'comment', text: 'Start here' },
      ],
    };
    const summary = marksSummary(project);
    expect([summary.pauses, summary.skipping, summary.comments]).toEqual([1, 0, 1]);
    expect(summary.leftOut.map(({ mark, standing }) => [mark.id, standing])).toEqual([
      ['p1', 'outside'],
    ]);
  });
});
