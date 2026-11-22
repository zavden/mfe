/* The files of Export ▸ HTML: a scene as a folder a browser opens from disk — `index.html`, the
 * scene (`scene.js`), the outlines of its formulas (`glyphs.js`), a file for what its owner adds
 * (`custom.js`), the stylesheet (`player.css`) and the engine (`mfe-runtime.js`). The page is the
 * live animation, drawn by the app's own evaluator, not a video of it: its files are meant to be
 * read and changed, by a person or by an agent. So the folder also tells what it is: a guide for a
 * coding agent (`AGENTS.md`, `agentGuide.ts`, which `CLAUDE.md` imports), a page for a person
 * (`README.md`), the types of its API and of its scene (`types/`), a script that checks the scene
 * without a browser (`check.mjs`) and an example of a page that embeds it
 * (`embed-example.html`).
 *
 * Opened from disk a browser loads no JSON and no module (`fetch`, `import` and workers are
 * blocked on `file://`), so the data are scripts that register themselves, loaded by plain
 * `<script src>` in order. Pure: the engine, its licences, the stylesheet and the type files come
 * as text (`runtimeAssets.ts` gets them for the app). */
import type { ResolvedFormula } from '../../engine';
import { sceneDuration, type FormulaId, type Project } from '../../model';
import { packGlyphs, type GlyphFile } from '../../deck/glyphFile';
import { agentsFile, claudeFile, readmeFile, type GuideInput } from './agentGuide';
import { checkFile } from './checkScript';
import { embedExampleFile } from './embedExample';
import { compactJson, readableJson } from './readableJson';
import { clipLines, glyphLines, timelineWords } from './timelineWords';

/** A file of the exported folder: its path inside it (ASCII, `/` between folders) and its text. */
export interface DeckFile {
  path: string;
  text: string;
}

/** What every exported folder carries besides the scene: the same for all of them. */
export interface RuntimeAssets {
  /** `mfe-runtime.js`. */
  runtime: string;
  /** `LICENSES.txt`. */
  licenses: string;
  /** `player.css`. */
  css: string;
  /** `types/mfe.d.ts`: the API of `window.MFE`. */
  mfeTypes: string;
  /** `types/scene.d.ts`: the project `scene.js` holds. */
  sceneTypes: string;
}

/** The name a scene registers itself by: the project's name as a word of lowercase letters,
 * digits and hyphens ("Hello: one-to-one" → `hello-one-to-one`), `scene` when nothing is left. */
export function sceneName(project: Pick<Project, 'meta'>): string {
  const word = project.meta.name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return word || 'scene';
}

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Text that cannot end a block comment of a script. */
const inComment = (text: string): string => text.replace(/\*\//g, '* /');

/** `glyphs.js`: the outlines, one glyph per line. */
export function glyphsFile(name: string, glyphs: GlyphFile): string {
  const formulas = Object.entries(glyphs.formulas).map(([id, formula]) => {
    const { glyphs: outlines, ...head } = formula;
    const lines = outlines.map((glyph) => `      ${compactJson(glyph)}`);
    return (
      `    ${JSON.stringify(id)}: {\n` +
      Object.entries(head)
        .map(([key, value]) => `      ${JSON.stringify(key)}: ${compactJson(value)},\n`)
        .join('') +
      `      "glyphs": [\n${lines.map((line) => `  ${line}`).join(',\n')}\n      ]\n    }`
    );
  });
  return (
    `/* The outlines of the formulas of "${inComment(name)}", as Manim Formula Editor drew them: one glyph\n` +
    ' * per line, as SVG path data (M, C, Z) in scene units about the formula’s centre, y down.\n' +
    ' * Generated: the page does not typeset LaTeX, so a formula is these outlines. To change what a\n' +
    ' * formula says, export the scene again from the editor; everything else is in scene.js. */\n' +
    `MFE.glyphs(${JSON.stringify(name)}, {\n` +
    `  "version": ${glyphs.version},\n` +
    `  "formulas": {\n${formulas.join(',\n')}\n  }\n});\n`
  );
}

/** Lines of a block comment, each after ` *   `. */
const commentBlock = (lines: readonly string[]): string =>
  lines.map((line) => ` *   ${inComment(line)}\n`).join('');

/** The scene's sound in a folder: its file beside `scene.js`, and the SHA-256 of its bytes (64
 * hex digits). */
export interface SceneSound {
  file: string;
  sha256: string;
}

/** `scene.js`: the project, as readable JSON, after a comment that says what it holds — its clips
 * by the names the page gives them, the glyphs of its formulas and its timeline in words
 * (`timelineWords.ts`). With a sound, the call's last argument names its file, which the page
 * plays, and records its SHA-256, which the page does not read: an export over the folder knows
 * by it the file the app wrote (`recordedSound`). */
export function sceneFile(name: string, project: Project, sound: SceneSound | null = null): string {
  const title = inComment(project.meta.name);
  const clips = clipLines(project);
  const glyphs = glyphLines(project);
  const timeline = timelineWords(project);
  return (
    `/* ${title} — a scene made with Manim Formula Editor, ${sceneDuration(project).toFixed(2)} s long.\n` +
    ' *\n' +
    ' * This file is the animation: the project as the editor keeps it. Edit it, reload the page,\n' +
    ' * and the page says what it could not read; `node check.mjs` says it without a browser. What\n' +
    ' * follows in this comment was written at the export, to find your way in the data below: it\n' +
    ' * does not follow your edits. Positions are Manim’s: y up, the frame 8 units tall about the\n' +
    ' * origin. Its times are the scene’s; in the data, a block’s `start` counts from its clip’s\n' +
    ' * `start`, and a relation’s `offset` from its target clip’s.\n' +
    (clips.length > 0
      ? ' *\n * The clips, by the names the page gives them (data-clip="…", deck.clip(\'…\')):\n' +
        commentBlock(clips)
      : '') +
    (glyphs.length > 0
      ? ' *\n * The glyphs of each formula, by the index that "glyphs": [3, 4] names:\n' +
        commentBlock(glyphs)
      : '') +
    (timeline.length > 0
      ? ' *\n * What happens, in order (seconds of the scene; each line ends with where it is here):\n' +
        commentBlock(timeline)
      : '') +
    ' *\n * AGENTS.md tells what each part means. */\n' +
    `MFE.scene(${JSON.stringify(name)}, ${readableJson(project)}` +
    (sound === null ? '' : `, ${compactJson({ audio: sound.file, sha256: sound.sha256 })}`) +
    ');\n'
  );
}

/** More than the record takes: the characters of a `scene.js` that are read for it. */
export const RECORD_TAIL = 1024;

/** The sound a `scene.js` says was written beside it — the last argument of its call, as
 * `sceneFile` writes it — or null: a scene without sound, a file of before the record, or one
 * whose end was edited. Only the end of the text is looked at. */
export function recordedSound(scene: string): SceneSound | null {
  const last = /,\s*(\{[^{}]*\})\s*\)\s*;?\s*$/.exec(scene.slice(-RECORD_TAIL));
  if (!last) return null;
  try {
    const { audio, sha256 } = JSON.parse(last[1]!) as Record<string, unknown>;
    return typeof audio === 'string' && typeof sha256 === 'string' && /^[0-9a-f]{64}$/.test(sha256)
      ? { file: audio, sha256 }
      : null;
  } catch {
    return null;
  }
}

/** `custom.js`: where the scene's owner adds to it. */
export function customFile(name: string): string {
  return (
    '/* Yours: what you add to the scene goes here. This script runs after the scene is loaded and\n' +
    ' * before the page mounts it; AGENTS.md has the API and examples that work.\n' +
    ' *\n' +
    " *   document.addEventListener('DOMContentLoaded', () => {\n" +
    ` *     const deck = MFE.mount('.mfe-deck[data-scene=${inComment(JSON.stringify(name))}]');\n` +
    ' *     // deck.animate({ from: 1, to: 2, ease: "smooth", update(progress) { … } });\n' +
    ' *   });\n' +
    ' */\n'
  );
}

/** `index.html`: the page. No script is written into it, so it lives under a strict content
 * security policy too. */
export function indexFile(name: string, project: Pick<Project, 'meta'>): string {
  return (
    '<!doctype html>\n' +
    '<html lang="en">\n' +
    '  <head>\n' +
    '    <meta charset="utf-8" />\n' +
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
    `    <title>${escapeHtml(project.meta.name)}</title>\n` +
    '    <link rel="stylesheet" href="player.css" />\n' +
    '  </head>\n' +
    '  <body class="mfe-page">\n' +
    '    <!-- The scene. data-page makes this page the scene’s own: its keys are heard anywhere and\n' +
    '         the options of the address are read (index.html?controls=minimal&autoplay). -->\n' +
    `    <div class="mfe-deck" data-scene="${escapeHtml(name)}" data-page></div>\n` +
    '\n' +
    '    <!-- In this order: the engine, the outlines, the scene, and what you add. -->\n' +
    '    <script src="mfe-runtime.js"></script>\n' +
    '    <script src="glyphs.js"></script>\n' +
    '    <script src="scene.js"></script>\n' +
    '    <script src="custom.js"></script>\n' +
    '  </body>\n' +
    '</html>\n'
  );
}

/** The files of the exported folder, in the order they are listed. `sound` is the scene's sound,
 * a file the caller puts beside them, when the scene has one. */
export function packDeck(
  project: Project,
  resolved: ReadonlyMap<FormulaId, ResolvedFormula>,
  assets: RuntimeAssets,
  sound: SceneSound | null = null,
): DeckFile[] {
  const name = sceneName(project);
  const files: DeckFile[] = [
    { path: 'index.html', text: indexFile(name, project) },
    { path: 'scene.js', text: sceneFile(name, project, sound) },
    { path: 'glyphs.js', text: glyphsFile(name, packGlyphs(project, resolved)) },
    { path: 'custom.js', text: customFile(name) },
    { path: 'player.css', text: assets.css },
    { path: 'embed-example.html', text: embedExampleFile(name, project) },
  ];
  const tail: DeckFile[] = [
    { path: 'check.mjs', text: checkFile() },
    { path: 'types/mfe.d.ts', text: assets.mfeTypes },
    { path: 'types/scene.d.ts', text: assets.sceneTypes },
    { path: 'mfe-runtime.js', text: assets.runtime },
    { path: 'LICENSES.txt', text: assets.licenses },
  ];
  const guides = ['AGENTS.md', 'CLAUDE.md', 'README.md'];
  const guide: GuideInput = {
    name,
    project,
    files: [...files, ...tail].map((file) => file.path).concat(guides, sound ? [sound.file] : []),
    css: assets.css,
  };
  return [
    ...files,
    { path: 'AGENTS.md', text: agentsFile(guide) },
    { path: 'CLAUDE.md', text: claudeFile() },
    { path: 'README.md', text: readmeFile(guide) },
    ...tail,
  ];
}
