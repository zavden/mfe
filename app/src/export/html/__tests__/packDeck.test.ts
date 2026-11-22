// @vitest-environment node
/* The files of Export ▸ HTML: what the folder holds, that its scripts say what the editor had,
 * and that the engine reads them — run as the page would run them, without a page. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { beforeAll, describe, expect, it } from 'vitest';
import { packGlyphs } from '../../../deck/glyphFile';
import { renderedExample, type Rendered } from '../../../embed/__tests__/fixtures';
import { EXAMPLES } from '../../../test/examples';
import {
  customFile,
  indexFile,
  packDeck,
  recordedSound,
  sceneFile,
  sceneName,
  type SceneSound,
} from '../packDeck';
import { RUNTIME_ASSETS } from '../runtimeAssets';

const SOUND: SceneSound = { file: 'audio.m4a', sha256: '0123456789abcdef'.repeat(4) };

const rendered = new Map<string, Rendered>();
beforeAll(async () => {
  for (const name of EXAMPLES) rendered.set(name, await renderedExample(name));
}, 120_000);

const packed = (name: string) => {
  const { project, resolved } = rendered.get(name)!;
  return packDeck(project, resolved, RUNTIME_ASSETS);
};
const textOf = (files: ReturnType<typeof packed>, path: string) =>
  files.find((file) => file.path === path)!.text;

/** What the scripts of a folder register, run in order as the page runs them. */
function run(files: ReturnType<typeof packed>, scripts: string[]) {
  // Without a page, with what Node gives every script (`check.mjs` runs them in Node itself).
  const context: Record<string, unknown> = { console, TextEncoder, URL, URLSearchParams };
  context.globalThis = context;
  for (const script of scripts) runInNewContext(textOf(files, script), context);
  return context.MFE as {
    scenes: string[];
    check(): { scene: string; problems: { severity: string; where: string; message: string }[] }[];
  };
}

describe('packDeck', () => {
  it('writes the folder: the page, the scene, yours, the look, its guides, the engine', () => {
    const files = packed('hello.mfe.json');
    expect(files.map((file) => file.path)).toEqual([
      'index.html',
      'scene.js',
      'glyphs.js',
      'custom.js',
      'player.css',
      'embed-example.html',
      'AGENTS.md',
      'CLAUDE.md',
      'README.md',
      'check.mjs',
      'types/mfe.d.ts',
      'types/scene.d.ts',
      'mfe-runtime.js',
      'LICENSES.txt',
    ]);
    for (const file of files) {
      expect(file.path).toMatch(/^[A-Za-z0-9._/-]+$/);
      expect(file.text.endsWith('\n')).toBe(true);
    }
    expect(textOf(files, 'mfe-runtime.js')).toBe(RUNTIME_ASSETS.runtime);
    expect(textOf(files, 'player.css')).toContain('.mfe-deck');
    expect(textOf(files, 'LICENSES.txt')).toContain('MANIM FORMULA EDITOR RUNTIME');
    expect(textOf(files, 'types/mfe.d.ts')).toBe(RUNTIME_ASSETS.mfeTypes);
    expect(textOf(files, 'types/scene.d.ts')).toBe(RUNTIME_ASSETS.sceneTypes);
  });

  it.each(EXAMPLES)(
    'writes %s in files an agent can read, but the engine and the outlines',
    (name) => {
      // Claude Code reads no whole file over 256 KB: the two that are bigger are not to be read.
      for (const file of packed(name)) {
        if (file.path === 'mfe-runtime.js' || file.path === 'glyphs.js') continue;
        expect(new TextEncoder().encode(file.text).length, file.path).toBeLessThan(256 * 1024);
      }
    },
  );

  it('names the sound in the guide, when the scene has one', () => {
    const { project, resolved } = rendered.get('hello.mfe.json')!;
    const files = packDeck(project, resolved, RUNTIME_ASSETS, SOUND);
    expect(textOf(files, 'scene.js')).toContain(
      `{ "audio": "audio.m4a", "sha256": "${SOUND.sha256}" }`,
    );
    expect(textOf(files, 'AGENTS.md')).toContain('| `audio.m4a` | the scene’s sound | no |');
    expect(textOf(packed('hello.mfe.json'), 'AGENTS.md')).not.toContain('audio.');
  });

  it.each(EXAMPLES)('writes %s so that the engine reads it without a problem', (name) => {
    const files = packed(name);
    const mfe = run(files, ['mfe-runtime.js', 'glyphs.js', 'scene.js', 'custom.js']);
    expect(mfe.scenes).toEqual([sceneName(rendered.get(name)!.project)]);
    const [report] = mfe.check();
    expect(report!.problems.filter((problem) => problem.severity === 'error')).toEqual([]);
  });

  it('registers the project and the outlines the editor had', () => {
    const { project, resolved } = rendered.get('completing-the-square.mfe.json')!;
    const files = packed('completing-the-square.mfe.json');
    const seen: Record<string, unknown[]> = { scene: [], glyphs: [] };
    const context = {
      MFE: {
        scene: (...args: unknown[]) => seen.scene!.push(args),
        glyphs: (...args: unknown[]) => seen.glyphs!.push(args),
      },
    };
    runInNewContext(textOf(files, 'glyphs.js'), context);
    runInNewContext(textOf(files, 'scene.js'), context);
    const name = sceneName(project);
    expect(JSON.parse(JSON.stringify(seen.scene))).toEqual([
      [name, JSON.parse(JSON.stringify(project))],
    ]);
    expect(JSON.parse(JSON.stringify(seen.glyphs))).toEqual([
      [name, JSON.parse(JSON.stringify(packGlyphs(project, resolved)))],
    ]);
  });

  it('keeps the scene file to lines a reader can page through, and a glyph to a line', () => {
    const files = packed('completing-the-square.mfe.json');
    const scene = textOf(files, 'scene.js').split('\n');
    expect(scene.filter((line) => line.length > 100 && !/^\s*("[^"]*": )?"/.test(line))).toEqual(
      [],
    );
    const glyphs = textOf(files, 'glyphs.js').split('\n');
    const outlines = glyphs.filter((line) => line.includes('"d": "'));
    expect(outlines.length).toBeGreaterThan(20);
    for (const line of outlines) expect(line.match(/"d": "/g)).toHaveLength(1);
  });

  it('names the sound beside the scene file, when the scene has one', () => {
    const { project } = rendered.get('hello.mfe.json')!;
    expect(sceneFile('hello', project)).toMatch(/\n\}\);\n$/);
    const withSound = sceneFile('hello', project, SOUND);
    expect(
      withSound.endsWith(`\n}, { "audio": "audio.m4a", "sha256": "${SOUND.sha256}" });\n`),
    ).toBe(true);
    // The page reads the name alone; an export over the folder reads the record back.
    expect(recordedSound(withSound)).toEqual(SOUND);
  });

  it('reads no record of a sound where a scene file has none, or not a whole one', () => {
    const { project } = rendered.get('hello.mfe.json')!;
    expect(recordedSound(sceneFile('hello', project))).toBeNull();
    const call = (last: string) => `MFE.scene("hello", {\n  "version": 36\n}${last});\n`;
    expect(recordedSound(call(`, { "audio": "audio.wav", "sha256": "${SOUND.sha256}" }`))).toEqual({
      file: 'audio.wav',
      sha256: SOUND.sha256,
    });
    // An export of before the record, a hash that is not one, an end that is not JSON.
    expect(recordedSound(call(', { "audio": "audio.wav" }'))).toBeNull();
    expect(recordedSound(call(', { "audio": "audio.wav", "sha256": "ABCD" }'))).toBeNull();
    expect(recordedSound(call(`, { audio: 'audio.wav' }`))).toBeNull();
    // A project on one line is not a record of its sound.
    expect(recordedSound('MFE.scene("hello", { "version": 36 });\n')).toBeNull();
    expect(recordedSound('')).toBeNull();
  });

  it('writes a page with no script of its own, that loads the files in order', () => {
    const { project } = rendered.get('hello.mfe.json')!;
    const html = indexFile('hello-one-to-one', project);
    expect(html).toContain('<div class="mfe-deck" data-scene="hello-one-to-one" data-page></div>');
    expect(
      [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((match) => match[1]),
    ).toEqual(['mfe-runtime.js', 'glyphs.js', 'scene.js', 'custom.js']);
    expect(html).not.toMatch(/<script(?![^>]*\ssrc=)/);
    expect(html).not.toMatch(/\son[a-z]+=/);
    expect(html).toContain('<link rel="stylesheet" href="player.css" />');
    // A name of a project is text, whatever it holds.
    const odd = indexFile('x', { meta: { ...project.meta, name: 'a <b> & "c"' } });
    expect(odd).toContain('<title>a &lt;b&gt; &amp; &quot;c&quot;</title>');
  });

  it('cannot be broken out of by a name', () => {
    const { project } = rendered.get('hello.mfe.json')!;
    const hostile = { ...project, meta: { ...project.meta, name: 'x */ alert(1) /*' } };
    const text = sceneFile('x', hostile);
    // The first end of a comment is the header's own: its last line is before it.
    expect(text.slice(0, text.indexOf('*/'))).toContain('AGENTS.md tells what each part means.');
    const seen: unknown[][] = [];
    runInNewContext(text, { MFE: { scene: (...args: unknown[]) => seen.push(args) } });
    expect((seen[0]![1] as typeof hostile).meta.name).toBe('x */ alert(1) /*');
    // Its own file is all a comment: a name cannot end it.
    expect(customFile('x */ alert(1) /*').split('*/')).toHaveLength(2);
  });

  it('names a scene by its project, as a word', () => {
    const { project } = rendered.get('hello.mfe.json')!;
    const named = (name: string) => sceneName({ meta: { ...project.meta, name } });
    expect(named('Hello: one-to-one')).toBe('hello-one-to-one');
    expect(named('  Fórmula cuadrática (v2)  ')).toBe('formula-cuadratica-v2');
    expect(named('∑')).toBe('scene');
    expect(named('')).toBe('scene');
  });

  // `MFE_DECK_SAMPLE=<folder> npx vitest run src/export/html` writes every example there, a folder
  // each, to open in a browser.
  it.runIf(process.env.MFE_DECK_SAMPLE)('writes the examples to a folder when asked', () => {
    for (const name of EXAMPLES) {
      for (const file of packed(name)) {
        const target = join(process.env.MFE_DECK_SAMPLE!, name.replace('.mfe.json', ''), file.path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, file.text);
      }
    }
  });
});
