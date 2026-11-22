// @vitest-environment node
/* `check.mjs` of an exported folder, run by Node as its reader runs it: it passes a folder as the
 * editor wrote it, and says what is wrong with one whose files were broken — where, with the
 * line of scene.js — with the exit code a script or an agent can act on. */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { renderedExample, type Rendered } from '../../../embed/__tests__/fixtures';
import { packDeck, sceneFile, sceneName, type DeckFile } from '../packDeck';
import { RUNTIME_ASSETS } from '../runtimeAssets';

let rendered: Rendered;
let files: DeckFile[];
const folders: string[] = [];
beforeAll(async () => {
  rendered = await renderedExample('completing-the-square.mfe.json');
  files = packDeck(rendered.project, rendered.resolved, RUNTIME_ASSETS);
}, 120_000);
afterAll(() => {
  for (const folder of folders) rmSync(folder, { recursive: true, force: true });
});

/** The folder written to a new temporary place, with `change` made to its files first. */
function folderWith(change: (files: Map<string, string>) => void = () => {}): string {
  const texts = new Map(files.map((file) => [file.path, file.text]));
  change(texts);
  const folder = mkdtempSync(join(tmpdir(), 'mfe-check-'));
  folders.push(folder);
  for (const [path, text] of texts) {
    mkdirSync(dirname(join(folder, path)), { recursive: true });
    writeFileSync(join(folder, path), text);
  }
  return folder;
}

/** `node check.mjs` run from another folder than its own (`cwd`), with `args`: its output and its
 * exit code, which is null when it had not ended after `timeout` milliseconds. */
function check(
  folder: string,
  args: string[] = [],
  cwd = tmpdir(),
  timeout = 60_000,
): { status: number | null; out: string } {
  const result = spawnSync(process.execPath, [join(folder, 'check.mjs'), ...args], {
    cwd,
    encoding: 'utf8',
    timeout,
  });
  return { status: result.status, out: `${result.stdout}${result.stderr}` };
}

/** `check`, of a folder it is to end on soon: one it never ends on fails in seconds. */
const checkSoon = (folder: string) => check(folder, [], tmpdir(), 10_000);

/** The line of `text` (from 1) on which `part` first appears after `after`. */
function lineOf(text: string, part: string, after = ''): number {
  const at = text.indexOf(part, text.indexOf(after));
  return text.slice(0, at).split('\n').length;
}

const edit =
  (path: string, from: string | RegExp, to: string, after = '') =>
  (texts: Map<string, string>) => {
    const text = texts.get(path)!;
    const start = after ? text.indexOf(after) : 0;
    texts.set(path, text.slice(0, start) + text.slice(start).replace(from, to));
  };

describe('check.mjs', () => {
  it('passes the folder as the editor wrote it', () => {
    const { status, out } = check(folderWith());
    expect(out).toBe('OK: "completing-the-square" plays as written.\n');
    expect(status).toBe(0);
  });

  it('says where a scene file names a kind there is not, by its path and its line', () => {
    const folder = folderWith(
      edit('scene.js', '"kind": "write"', '"kind": "explode"', '"clips": ['),
    );
    const { status, out } = check(folder);
    const scene = readFileSync(join(folder, 'scene.js'), 'utf8');
    const line = lineOf(scene, '"kind": "explode"');
    expect(out).toMatch(
      new RegExp(`^Errors:\\n  scene\\.js:${line} · clips\\[0\\]\\.intro\\.kind: .*"write"`),
    );
    expect(out.trimEnd().split('\n').at(-1)).toBe(
      'FAILED: 1 error, 0 warnings in "completing-the-square".',
    );
    expect(status).toBe(1);
  });

  it('says that a formula changed what the page cannot typeset', () => {
    const folder = folderWith(
      edit('scene.js', '"source": "ax^2+bx+c=0"', '"source": "ax^2+bx+c=1"'),
    );
    const { status, out } = check(folder);
    const scene = readFileSync(join(folder, 'scene.js'), 'utf8');
    // The formula's object opens on the line before its id.
    const id = rendered.project.formulas[1]!.id;
    const line = lineOf(scene, `"id": ${JSON.stringify(id)},`) - 1;
    expect(out).toContain(
      `scene.js:${line} · formulas[1]: "equation" changed its source since the scene was exported`,
    );
    expect(status).toBe(1);
  });

  it('says on which line a scene file stops being JavaScript', () => {
    const folder = folderWith(edit('scene.js', '"end": 37.5,', '"end": 37.5,,'));
    const { status, out } = check(folder);
    const line = lineOf(readFileSync(join(folder, 'scene.js'), 'utf8'), '37.5,,');
    expect(out).toMatch(
      new RegExp(
        `^Errors:\\n  scene\\.js:${line}: .*\\(not JavaScript: the page cannot run it\\)\\.\\n`,
      ),
    );
    expect(status).toBe(1);
  });

  it('says that a file is missing', () => {
    const folder = folderWith();
    unlinkSync(join(folder, 'glyphs.js'));
    const { status, out } = check(folder);
    expect(out).toContain('  glyphs.js: missing. It holds the outlines of the formulas');
    expect(status).toBe(1);
  });

  it('says that the files do not agree on the scene’s name', () => {
    const name = sceneName(rendered.project);
    const { status, out } = check(
      folderWith(edit('scene.js', `MFE.scene(${JSON.stringify(name)},`, 'MFE.scene("other",')),
    );
    expect(out).toContain(
      `scene.js: it registers the scene "other", and glyphs.js the outlines of "${name}"`,
    );
    expect(out).toContain(`index.html: data-scene="${name}" names no scene the scripts load`);
    expect(status).toBe(1);
  });

  it('reads custom.js without running it, and says where it does not parse', () => {
    const { status, out } = check(
      folderWith((texts) => texts.set('custom.js', "MFE.mount('.mfe-deck');\nconst x = ;\n")),
    );
    expect(out).toContain('  custom.js:2: ');
    expect(status).toBe(1);
    const fine = check(
      folderWith((texts) => texts.set('custom.js', "document.querySelector('.mfe-deck');\n")),
    );
    expect(fine.status).toBe(0);
  });

  it('checks the folder it is given, from where it runs: a copy of the scene beside a page', () => {
    // A blog with the scene's files in a folder of its own: no check.mjs, no index.html there.
    const site = mkdtempSync(join(tmpdir(), 'mfe-site-'));
    folders.push(site);
    const copy = join(site, 'blog', 'animation');
    mkdirSync(copy, { recursive: true });
    const texts = new Map(files.map((file) => [file.path, file.text]));
    for (const path of ['mfe-runtime.js', 'glyphs.js', 'scene.js', 'custom.js', 'player.css']) {
      writeFileSync(join(copy, path), texts.get(path)!);
    }
    // The folder's own check.mjs, run from the site with the copy's path, relative and absolute.
    const own = folderWith();
    expect(check(own, ['blog/animation'], site)).toEqual({
      status: 0,
      out: 'OK: "completing-the-square" plays as written.\n',
    });
    expect(check(own, [copy]).status).toBe(0);
    // What is wrong in the copy is said of the copy, with its line.
    edit('scene.js', '"kind": "write"', '"kind": "explode"', '"clips": [')(texts);
    const broken = texts.get('scene.js')!;
    writeFileSync(join(copy, 'scene.js'), broken);
    const { status, out } = check(own, ['blog/animation'], site);
    expect(out).toContain(`scene.js:${lineOf(broken, '"kind": "explode"')} · clips[0].intro.kind:`);
    expect(status).toBe(1);
    // And the folder it was given must be one.
    const missing = check(own, ['blog/nothing'], site);
    expect(missing.out).toContain('  blog/nothing: no such folder.');
    expect(missing.status).toBe(1);
  });

  // A problem is placed on the line of the nearest part of its path that scene.js holds. A key
  // of the project itself has no part before it, and when the file has no such key the search
  // for a shorter path went on for ever: the command never ended (B-03 of the final audit).
  it('ends, and names the project’s line, when the scene lacks a field of its own', () => {
    const folder = folderWith(edit('scene.js', /^ *"audioClips": \[\],\n/m, ''));
    const scene = readFileSync(join(folder, 'scene.js'), 'utf8');
    expect(scene).not.toContain('"audioClips"');
    const { status, out } = checkSoon(folder);
    expect(status, 'check.mjs had not ended after 10 s').toBe(1);
    expect(out).toMatch(
      new RegExp(`^Errors:\\n  scene\\.js:${lineOf(scene, 'MFE.scene(')} · audioClips: `),
    );
    expect(out.trimEnd().split('\n').at(-1)).toBe(
      'FAILED: 1 error, 0 warnings in "completing-the-square".',
    );
  });

  it('ends when the project is not written in the call: every problem is on the call’s line', () => {
    // The page runs this as well as the editor's own text: the project in a variable.
    const name = sceneName(rendered.project);
    const call = `MFE.scene(${JSON.stringify(name)}, `;
    const folder = folderWith((texts) => {
      const text = texts.get('scene.js')!;
      const at = text.indexOf(call);
      const end = text.lastIndexOf(');');
      texts.set(
        'scene.js',
        `${text.slice(0, at)}const project = ${text
          .slice(at + call.length, end)
          .replace('"fps": 60', '"fps": 0')};\n${call}project);\n`,
      );
    });
    const scene = readFileSync(join(folder, 'scene.js'), 'utf8');
    expect(scene).toContain('"fps": 0');
    const { status, out } = checkSoon(folder);
    expect(status, 'check.mjs had not ended after 10 s').toBe(1);
    expect(out).toMatch(
      new RegExp(`^Errors:\\n  scene\\.js:${lineOf(scene, call)} · meta\\.fps: `),
    );
  });

  // The page mounts an element and reads its attribute; check.mjs looked for `data-scene="…"` in
  // the text of index.html, so it missed a name between single quotes and took one that a comment
  // mentions (B-05 of the final audit).
  describe('reads the data-scene of index.html as the page does', () => {
    const PASSES = { status: 0, out: 'OK: "completing-the-square" plays as written.\n' };
    const WRONG =
      '  index.html: data-scene="older-take" names no scene the scripts load (they load "completing-the-square").';
    const named = 'data-scene="completing-the-square"';
    const DECK = '<div class="mfe-deck"';

    it('between single quotes', () => {
      const { status, out } = check(
        folderWith(edit('index.html', named, "data-scene='older-take'")),
      );
      expect(out).toContain(WRONG);
      expect(status).toBe(1);
    });

    it('without quotes, in capitals, with spaces around the equals sign', () => {
      const { status, out } = check(
        folderWith(edit('index.html', named, 'DATA-SCENE = older-take')),
      );
      expect(out).toContain(WRONG);
      expect(status).toBe(1);
      // And the right name written so, with a character as a reference, is the scene's.
      expect(
        check(folderWith(edit('index.html', named, 'Data-Scene=completing&#45;the&#x2D;square'))),
      ).toEqual(PASSES);
    });

    it('not in a comment', () => {
      const comment = '<!-- The previous take used data-scene="older-take". -->';
      expect(check(folderWith(edit('index.html', DECK, `${comment}\n    ${DECK}`)))).toEqual(
        PASSES,
      );
    });

    it('not in the text of a script or a field, nor inside another attribute', () => {
      const others = [
        `<script>const before = '<div data-scene="older-take"></div>';</script>`,
        `<textarea><div data-scene="older-take"></div></textarea>`,
        `<p title='it was data-scene="older-take"'>A note.</p>`,
        // A block of data registers a scene of that name: it shows none.
        `<script type="application/json" class="mfe-scene-data" data-scene="older-take">{}</script>`,
      ].join('\n    ');
      expect(check(folderWith(edit('index.html', DECK, `${others}\n    ${DECK}`)))).toEqual(PASSES);
      // An element's first data-scene is the one the page reads.
      expect(
        check(folderWith(edit('index.html', named, `${named} data-scene="older-take"`))),
      ).toEqual(PASSES);
    });
  });

  it('passes a scene with warnings, and counts them', () => {
    const project = structuredClone(rendered.project);
    project.slides = { marks: [{ id: 'm1', time: 1, kind: 'pause' }] }; // under an intro
    const name = sceneName(project);
    const { status, out } = check(
      folderWith((texts) => texts.set('scene.js', sceneFile(name, project))),
    );
    expect(out).toMatch(
      /^Warnings:\n {2}scene\.js:\d+ · slides\.marks\[0\]\.time: The pause at 1 s /,
    );
    expect(out.trimEnd().split('\n').at(-1)).toBe(
      `OK: "${name}" plays as written, with 1 warning.`,
    );
    expect(status).toBe(0);
  });
});
