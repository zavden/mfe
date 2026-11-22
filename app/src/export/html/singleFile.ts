/* Export ▸ HTML as one file: the page with its look, its scene, its outlines and its engine inside
 * it, to send to someone or to present from. It is the folder's page with nothing beside it — the
 * folder is the form to work on (its engine is a file nobody needs to open; here it is one long
 * line at the end of the page).
 *
 * The scene and the outlines are blocks of JSON the engine reads when it runs (`registerInlineScenes`,
 * `deck/registry.ts`), so they come before it and the engine comes last. Pure. */
import type { ResolvedFormula } from '../../engine';
import type { FormulaId, Project } from '../../model';
import { packGlyphs } from '../../deck/glyphFile';
import { INLINE_GLYPHS, INLINE_SCENE } from '../../deck/registry';
import { customFile, sceneName, type RuntimeAssets } from './packDeck';
import { readableJson } from './readableJson';

const escapeHtml = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** JSON as the text of a `<script>` block: no `<` in it, so nothing in it ends the block or
 * starts a comment of the page. */
const blockJson = (value: unknown): string => readableJson(value).replace(/</g, '\\u003c');

/** A script as the text of a `<script>` element: nothing in it ends the element. */
const inScript = (code: string): string => code.replace(/<\/(script)/gi, '<\\/$1');

/** A stylesheet as the text of a `<style>` element. */
const inStyle = (css: string): string => css.replace(/<\/(style)/gi, '<\\/$1');

/** Text inside a comment of the page, as it is written but for what would end the comment or
 * start another inside it (`-->`, `--!>`, `<!--`): there the `>` or the `<` is written as its
 * entity. A `--` alone is nothing to a page (the HTML syntax, unlike XML, lets a comment hold
 * it), so a CSS property keeps its name, and a `<script>` tag is text like any other. */
const inComment = (text: string): string =>
  text.replace(/--(!?)>/g, '--$1&gt;').replace(/<!--/g, '&lt;!--');

/** The page as one file. `audio` is the scene's sound as an address the page can play by itself
 * (a `data:` one), when it has one; `guide` what the folder's guide says (its `AGENTS.md`), which
 * the file carries in a comment at the head of its body, as it is written: a block of `<script>`
 * could not hold it so, since the guide shows `<script>` tags of its own and a block ends at the
 * first that closes. */
export function singleFilePage(
  project: Project,
  resolved: ReadonlyMap<FormulaId, ResolvedFormula>,
  assets: RuntimeAssets,
  options: { audio?: string | null; guide?: string | null } = {},
): string {
  const name = sceneName(project);
  const title = project.meta.name;
  const audio = options.audio ? ` data-audio="${escapeHtml(options.audio)}"` : '';
  const head =
    `${title} — a scene made with Manim Formula Editor, as one file.\n\n` +
    'This page is the live animation: open it in a browser, no server needed. It holds, in this\n' +
    'order: its look (the <style>), the scene (a block of JSON: the project as the editor keeps\n' +
    'it), the outlines of its formulas (a block of JSON) and the engine (one long line at the\n' +
    'end: nothing in it needs reading). To work on the scene, by hand or with an agent, export\n' +
    'it from the editor as a folder instead: the same page, with each part in a file of its own\n' +
    'and a guide.';
  const guide = options.guide
    ? '    <!--\n' +
      'THE GUIDE OF THE SCENE, for whoever works on it, as the folder has it (AGENTS.md, in\n' +
      'Markdown). It speaks of the files of the folder; in this page scene.js is the block of JSON\n' +
      `of class ${INLINE_SCENE}, glyphs.js the one of class ${INLINE_GLYPHS}, player.css the\n` +
      '<style> of the head, custom.js the last <script> of the page, and the other files are not\n' +
      'here: export the folder to have them.\n\n' +
      `${inComment(options.guide.trim())}\n` +
      '    -->\n\n'
    : '';
  return (
    '<!doctype html>\n' +
    `<!--\n${inComment(head)}\n-->\n` +
    '<html lang="en">\n' +
    '  <head>\n' +
    '    <meta charset="utf-8" />\n' +
    '    <meta name="viewport" content="width=device-width, initial-scale=1" />\n' +
    `    <title>${escapeHtml(title)}</title>\n` +
    `    <style>\n${inStyle(assets.css)}    </style>\n` +
    '  </head>\n' +
    '  <body class="mfe-page">\n' +
    guide +
    `    <div class="mfe-deck" data-scene="${escapeHtml(name)}" data-page></div>\n` +
    '\n' +
    '    <!-- The scene: the project, as the editor keeps it. -->\n' +
    `    <script type="application/json" class="${INLINE_SCENE}" data-scene="${escapeHtml(name)}"${audio}>\n` +
    `${blockJson(project)}\n` +
    '    </script>\n' +
    '\n' +
    '    <!-- The outlines of its formulas (SVG path data, y down). -->\n' +
    `    <script type="application/json" class="${INLINE_GLYPHS}" data-scene="${escapeHtml(name)}">\n` +
    `${blockJson(packGlyphs(project, resolved))}\n` +
    '    </script>\n' +
    '\n' +
    '    <!-- From here down: the engine, one long line (generated; nothing to read), and after\n' +
    '         it the place for what you add. -->\n' +
    `    <script>\n${inScript(assets.runtime)}    </script>\n` +
    `    <script>\n${inScript(customFile(name))}    </script>\n` +
    '  </body>\n' +
    '</html>\n'
  );
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Bytes as base64 text. */
export function base64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += BASE64[a >> 2]! + BASE64[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    out += b === undefined ? '=' : BASE64[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    out += c === undefined ? '=' : BASE64[c & 63]!;
  }
  return out;
}

/** Bytes as an address a page can play or show by itself. */
export function dataAddress(bytes: Uint8Array, mime: string): string {
  return `data:${mime};base64,${base64(bytes)}`;
}
