/* `check.mjs` of an exported folder: `node check.mjs` checks the scene without a browser, so that
 * whoever edits `scene.js` — a person, or an agent that cannot look at a page — has something to
 * run that says pass or fail, and where. It runs `mfe-runtime.js`, `glyphs.js` and `scene.js` as
 * the page runs them (the runtime sets `MFE` and needs no document), asks the runtime what is
 * wrong (`MFE.check()`: the editor's own schema and rules, `deck/sceneFile.ts`), and prints each
 * problem as `scene.js:57 · clips[2].intro.kind: message` — the line of the file where that part
 * of the data starts, when it can be found —, errors and warnings apart, with a line that sums
 * them up. It exits with 1 when there is an error. It checks its own folder, or the one named as its
 * argument (a copy of the scene's files beside a page that embeds it). Besides: a file missing or that does not run, a
 * name that `glyphs.js`, `scene.js` and the `data-scene` of `index.html` do not agree on (the
 * attribute of an element, read as a browser reads the page, not the text of the file), and
 * `custom.js` that does not parse (it is not run: it needs a page).
 *
 * Node 18 or later, nothing to install. The text below is the script as it is written out: it
 * holds no backtick and no `${`, so that it is plain text here. Pure. */

const SCRIPT = String.raw`#!/usr/bin/env node
// check.mjs: checks this folder's scene without a browser. Run it from anywhere:
//
//   node check.mjs                      this folder
//   node check.mjs ../blog/animation    the scene's files in another folder (a page's copy)
//
// Node 18 or later; nothing to install. It runs mfe-runtime.js, glyphs.js and scene.js as the
// page runs them, asks the runtime what is wrong with the scene (the editor's own rules: the
// page says the same over the scene) and prints each problem as
//
//   scene.js:57 · clips[2].intro.kind: message
//
// the line being where that part of the data starts in scene.js. Exit code 0: the scene plays
// as written (warnings may remain); 1: it does not. Generated with the folder; not to be edited.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script, createContext } from 'node:vm';

// The folder named as the argument (from where the command runs), or this script's own.
const argument = process.argv[2];
const folder = argument ? resolve(argument) : dirname(fileURLToPath(import.meta.url));
const errors = [];
const warnings = [];

const read = (file) => {
  const path = join(folder, file);
  return existsSync(path) ? readFileSync(path, 'utf8') : null;
};

/** Where an exception points in a script of the folder: "scene.js:12", or the file alone. */
function placeOf(error, file) {
  const stack = String((error && error.stack) || '');
  const first = stack.split('\n')[0];
  const head = /^(.*\.(?:m?js)):(\d+)$/.exec(first);
  if (head) return file + ':' + head[2];
  const frame = new RegExp(file.replace('.', '\\.') + ':(\\d+):\\d+').exec(stack);
  return frame ? file + ':' + frame[1] : file;
}

const context = createContext({
  console,
  TextEncoder,
  TextDecoder,
  URL,
  URLSearchParams,
  structuredClone,
  setTimeout,
  clearTimeout,
  queueMicrotask,
});

/** Runs a script of the folder as the page would; false when it is missing or fails. */
function run(file, why) {
  const text = read(file);
  if (text === null) {
    errors.push(file + ': missing. ' + why);
    return false;
  }
  let script;
  try {
    script = new Script(text, { filename: file });
  } catch (error) {
    errors.push(placeOf(error, file) + ': ' + String(error && error.message) + ' (not JavaScript: the page cannot run it).');
    return false;
  }
  try {
    script.runInContext(context);
  } catch (error) {
    errors.push(placeOf(error, file) + ': ' + String(error && error.message) + ' (thrown while it ran).');
    return false;
  }
  return true;
}

/** The line of scene.js at which each part of the project starts, by its path ("clips[2].intro"):
 * read off the text after "MFE.scene(name,", which is JSON as the editor writes it (comments,
 * single quotes, bare keys and trailing commas are taken too). Empty when it cannot be read. */
function linesOf(text) {
  const lines = new Map();
  const call = text.indexOf('MFE.scene(');
  if (call < 0) return lines;
  const tokens = [];
  let line = 1;
  for (let k = 0; k < call; k++) if (text[k] === '\n') line++;
  let i = call + 'MFE.scene('.length;
  while (i < text.length) {
    const c = text[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r') { i++; continue; }
    if (c === '/' && text[i + 1] === '/') { while (i < text.length && text[i] !== '\n') i++; continue; }
    if (c === '/' && text[i + 1] === '*') {
      const end = text.indexOf('*/', i + 2);
      const stop = end < 0 ? text.length : end + 2;
      for (let k = i; k < stop; k++) if (text[k] === '\n') line++;
      i = stop;
      continue;
    }
    if ('{}[]:,()'.includes(c)) { tokens.push({ kind: c, line }); i++; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let value = '';
      while (j < text.length && text[j] !== c) {
        if (text[j] === '\\') { value += text[j + 1]; j += 2; continue; }
        value += text[j++];
      }
      tokens.push({ kind: 'string', value, line });
      i = j + 1;
      continue;
    }
    let j = i;
    while (j < text.length && !' \t\r\n{}[]:,()'.includes(text[j])) j++;
    tokens.push({ kind: 'atom', value: text.slice(i, j), line });
    i = j;
  }
  // The arguments: the name, a comma, then the project.
  let at = 0;
  const peek = () => tokens[at] || { kind: 'end', line };
  const value = (path) => {
    const token = peek();
    lines.set(path, token.line);
    if (token.kind === '{') {
      at++;
      while (peek().kind !== '}' && peek().kind !== 'end') {
        const key = tokens[at++];
        if (peek().kind !== ':') return;
        at++;
        value(path ? path + '.' + key.value : String(key.value));
        if (peek().kind === ',') at++;
      }
      at++;
    } else if (token.kind === '[') {
      at++;
      let index = 0;
      while (peek().kind !== ']' && peek().kind !== 'end') {
        value(path + '[' + index++ + ']');
        if (peek().kind === ',') at++;
      }
      at++;
    } else if (token.kind === 'string' || token.kind === 'atom') {
      at++;
    } else {
      throw new Error('unexpected ' + token.kind);
    }
  };
  try {
    at++; // the name
    if (peek().kind !== ',') return lines;
    at++;
    value('');
  } catch {
    // What could be read is kept: the rest has no line.
  }
  return lines;
}

/** "scene.js:57 · clips[2].intro.kind": the line of the nearest part of the path that has one.
 * A key of the project itself ("audioClips") has no part before it: when the file does not hold
 * it — it was deleted, or the project is not written in the call — the line is the project's. */
function whereOf(problem, lines) {
  if (!problem.where) return problem.file;
  let path = problem.where;
  while (path && !lines.has(path)) {
    const shorter = path.replace(/(\.[^.[\]]+|\[\d+\])$/, '');
    path = shorter === path ? '' : shorter;
  }
  const line = lines.get(path || '');
  return (line ? problem.file + ':' + line : problem.file) + ' · ' + problem.where;
}

const registered = { scene: [], glyphs: [] };
if (!existsSync(folder) || !statSync(folder).isDirectory()) {
  errors.push(argument + ': no such folder. Name the folder that holds the scene\'s files (mfe-runtime.js, glyphs.js, scene.js).');
} else if (run('mfe-runtime.js', 'It is the engine: export the scene again from the editor.')) {
  const mfe = context.MFE;
  if (!mfe || typeof mfe.check !== 'function') {
    errors.push('mfe-runtime.js: it ran but did not set MFE: is it the engine of an exported scene?');
  } else {
    for (const kind of ['scene', 'glyphs']) {
      const register = mfe[kind];
      mfe[kind] = (name, ...rest) => {
        registered[kind].push(String(name));
        return register(name, ...rest);
      };
    }
    run('glyphs.js', 'It holds the outlines of the formulas: export the scene again from the editor.');
    const sceneRan = run('scene.js', 'It is the scene: export it again from the editor.');
    if (sceneRan && registered.scene.length === 0) {
      errors.push("scene.js: it registers no scene: it must call MFE.scene('name', { … }).");
    }
    for (const name of registered.scene) {
      if (registered.glyphs.length > 0 && !registered.glyphs.includes(name)) {
        errors.push('scene.js: it registers the scene "' + name + '", and glyphs.js the outlines of "' + registered.glyphs.join('", "') + '": the two names must be the same.');
      }
    }
    if (registered.scene.length > 0) {
      const lines = linesOf(read('scene.js') || '');
      const reports = mfe.check();
      for (const report of reports) {
        for (const problem of report.problems) {
          const where = (reports.length > 1 ? '[' + report.scene + '] ' : '') + whereOf(problem, lines);
          (problem.severity === 'error' ? errors : warnings).push(where + ': ' + problem.message);
        }
      }
    }
  }
}

/** The data-scene of each element of a page, as a browser reads the page: the attribute of a start
 * tag, its name in any case, its value between double quotes, single quotes or none, the first one
 * of the tag. Not what a comment says, nor the text of a script, a style or a field; nor a
 * script's own: a block of data registers a scene of that name, it shows none. */
function sceneNamesOf(page) {
  const names = [];
  // Only A to Z, as a browser lowers a name: every index stays where it is.
  const lower = page.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
  const text = ['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'noscript'];
  const isSpace = (c) => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';
  // The references a name may be written with: a number, and the five of HTML's own characters
  // (four of them also in capitals and, before what is neither a letter, a digit nor "=", without
  // their semicolon). The other names of the standard are left as they are written.
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  const decode = (value) =>
    value.replace(
      /&(?:#[xX]([0-9a-fA-F]+);?|#([0-9]+);?|(amp|lt|gt|quot|AMP|LT|GT|QUOT)(?:;|(?![=a-zA-Z0-9]))|(apos);)/g,
      (whole, hex, decimal, old, strict) => {
        if (old || strict) return named[(old || strict).toLowerCase()];
        const code = hex ? parseInt(hex, 16) : parseInt(decimal, 10);
        const none = !(code > 0 && code <= 0x10ffff) || (code >= 0xd800 && code <= 0xdfff);
        return none ? '�' : String.fromCodePoint(code);
      },
    );
  let i = 0;
  while (i < page.length) {
    const open = page.indexOf('<', i);
    if (open < 0) break;
    const next = page[open + 1] || '';
    if (page.startsWith('<!--', open)) {
      // To its "-->" (which "<!-->" already holds), or to a "--!>": a browser ends it there too.
      const end = page.indexOf('-->', open + 2);
      const bang = page.indexOf('--!>', open + 4);
      if (end < 0 && bang < 0) break;
      i = bang >= 0 && (end < 0 || bang < end) ? bang + 4 : end + 3;
      continue;
    }
    // A declaration, a processing instruction or an end tag: nothing of theirs is an element's.
    if (next === '!' || next === '?' || next === '/') {
      const end = page.indexOf('>', open + 1);
      i = end < 0 ? page.length : end + 1;
      continue;
    }
    if (!/[a-zA-Z]/.test(next)) {
      i = open + 1;
      continue;
    }
    let j = open + 1;
    while (j < page.length && !isSpace(page[j]) && page[j] !== '/' && page[j] !== '>') j++;
    const tag = lower.slice(open + 1, j);
    let scene = null;
    while (j < page.length && page[j] !== '>') {
      if (isSpace(page[j]) || page[j] === '/') {
        j++;
        continue;
      }
      const start = j++;
      while (j < page.length && !isSpace(page[j]) && !'/>='.includes(page[j])) j++;
      const name = lower.slice(start, j);
      while (j < page.length && isSpace(page[j])) j++;
      let value = '';
      if (page[j] === '=') {
        j++;
        while (j < page.length && isSpace(page[j])) j++;
        const quote = page[j];
        if (quote === '"' || quote === "'") {
          const end = page.indexOf(quote, j + 1);
          const stop = end < 0 ? page.length : end;
          value = page.slice(j + 1, stop);
          j = stop + 1;
        } else {
          const from = j;
          while (j < page.length && !isSpace(page[j]) && page[j] !== '>') j++;
          value = page.slice(from, j);
        }
      }
      if (name === 'data-scene' && scene === null) scene = decode(value);
    }
    // A tag the page ends inside of is no element.
    if (j >= page.length) break;
    i = j + 1;
    if (scene !== null && tag !== 'script') names.push(scene);
    if (tag === 'plaintext') break;
    if (text.includes(tag)) {
      // Its text runs to its own end tag: nothing in it is a tag.
      let close = lower.indexOf('</' + tag, i);
      while (close >= 0 && !/[\s/>]/.test(lower[close + tag.length + 2] || '>')) {
        close = lower.indexOf('</' + tag, close + 1);
      }
      i = close < 0 ? page.length : close;
    }
  }
  return names;
}

// The page names its scene in data-scene: the name the scripts register.
const page = read('index.html');
if (page !== null && registered.scene.length > 0) {
  for (const name of sceneNamesOf(page)) {
    if (!registered.scene.includes(name)) {
      errors.push('index.html: data-scene="' + name + '" names no scene the scripts load (they load "' + registered.scene.join('", "') + '").');
    }
  }
}

// custom.js needs a page to run; here it is only read.
const custom = read('custom.js');
if (custom !== null) {
  try {
    new Script(custom, { filename: 'custom.js' });
  } catch (error) {
    errors.push(placeOf(error, 'custom.js') + ': ' + String(error && error.message) + ' (not JavaScript: the page stops there).');
  }
}

const count = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');
if (errors.length > 0) {
  console.log('Errors:');
  for (const line of errors) console.log('  ' + line);
}
if (warnings.length > 0) {
  console.log('Warnings:');
  for (const line of warnings) console.log('  ' + line);
}
const scenes = registered.scene.map((name) => '"' + name + '"').join(', ') || 'the scene';
if (errors.length > 0) {
  console.log('FAILED: ' + count(errors.length, 'error') + ', ' + count(warnings.length, 'warning') + ' in ' + scenes + '.');
  process.exitCode = 1;
} else {
  console.log('OK: ' + scenes + ' plays as written' + (warnings.length > 0 ? ', with ' + count(warnings.length, 'warning') : '') + '.');
  process.exitCode = 0;
}
`;

/** `check.mjs`. */
export function checkFile(): string {
  return SCRIPT;
}
