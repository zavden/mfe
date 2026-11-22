/* The contract of the exported page's look (`player.css`): the classes and the custom properties
 * a page that hosts a deck, or an agent that extends one, may rely on. Renaming one breaks their
 * pages, so it fails here: every class and every property of the lists below is in the stylesheet
 * and named in its head, and every class of the controls is in the DOM they build — and nothing
 * they build has a class the lists leave out. The stylesheet itself keeps to what makes it safe
 * to embed: every rule under `.mfe-deck` (or the scene's own `.mfe-page`), no more than two
 * classes deep, no id, no `!important`, nothing loaded from elsewhere. */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { SlideMark } from '../../model';
import { MFE } from '../index';
import { resetRegistry } from '../registry';
import { mockFiles, type MockFiles } from './mockDeck';

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../player.css'), 'utf8');
/** The comment at the head of the stylesheet, which lists the contract for its reader. */
const HEAD = CSS.slice(0, CSS.indexOf('*/'));

/** The classes of the deck's own making (`deck.ts`) and of the scene's own page. */
const DECK_CLASSES = [
  'mfe-deck',
  'mfe-screen',
  'mfe-stage',
  'mfe-layers',
  'mfe-problems',
  'mfe-sound',
  'mfe-page',
];

/** The classes the controls build (`controls.ts`, `timeline.ts`, `notes.ts`, `icons.ts`). */
const CONTROL_CLASSES = [
  'mfe-bar',
  'mfe-button',
  'mfe-previous',
  'mfe-play',
  'mfe-next',
  'mfe-through',
  'mfe-mute',
  'mfe-notes-button',
  'mfe-fullscreen',
  'mfe-icon',
  'mfe-timeline',
  'mfe-timeline-track',
  'mfe-timeline-played',
  'mfe-timeline-skip',
  'mfe-pause-mark',
  'mfe-timeline-thumb',
  'mfe-slide-count',
  'mfe-time',
  'mfe-notes',
  'mfe-notes-heading',
  'mfe-notes-list',
  'mfe-note',
  'mfe-note-label',
  'mfe-note-text',
  'mfe-notes-empty',
  'mfe-blackout',
  'mfe-live',
  'mfe-visually-hidden',
];

/** The custom properties a page gives other values to change the look: the colours have a
 * value in the light set too. */
const COLOURS = [
  '--mfe-accent',
  '--mfe-bar-background',
  '--mfe-bar-text',
  '--mfe-bar-text-muted',
  '--mfe-pause-mark',
  '--mfe-skip-wait',
  '--mfe-timeline-track',
  '--mfe-focus-ring',
  '--mfe-notes-background',
  '--mfe-notes-text',
  '--mfe-notes-text-muted',
];
const PROPERTIES = [
  ...COLOURS,
  '--mfe-bar-height',
  '--mfe-radius',
  '--mfe-font',
  '--mfe-notes-height',
  '--mfe-fullscreen-background',
  '--mfe-blackout-background',
  '--mfe-stage-background',
];
/** What the runtime writes for the stylesheet to read. */
const WRITTEN = [
  '--mfe-aspect',
  '--mfe-scene-background',
  '--mfe-progress',
  '--mfe-at',
  '--mfe-to',
];

/** The style rules of a stylesheet, with the at-rules (`@media`, `@container`…) they are in. */
function styleRules(css: string): { selector: string; body: string; within: string[] }[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const out: { selector: string; body: string; within: string[] }[] = [];
  const walk = (from: number, to: number, within: string[]) => {
    let at = from;
    while (at < to) {
      const open = text.indexOf('{', at);
      if (open < 0 || open >= to) return;
      const prelude = text.slice(at, open).trim();
      // The matching brace.
      let depth = 1;
      let close = open + 1;
      for (; close < to && depth > 0; close++) {
        if (text[close] === '{') depth++;
        else if (text[close] === '}') depth--;
      }
      if (prelude.startsWith('@')) walk(open + 1, close - 1, [...within, prelude]);
      else out.push({ selector: prelude, body: text.slice(open + 1, close - 1), within });
      at = close;
    }
  };
  walk(0, text.length, []);
  return out;
}

/** The selectors of a list, split at its top-level commas. */
function selectors(list: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] === '(') depth++;
    else if (list[i] === ')') depth--;
    else if (list[i] === ',' && depth === 0) {
      out.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(list.slice(start).trim());
  return out;
}

/** A selector's specificity as (ids, classes): what is in `:where()` counts for nothing. */
function specificity(selector: string): [number, number] {
  let bare = selector;
  for (let i = bare.indexOf(':where('); i >= 0; i = bare.indexOf(':where(')) {
    let depth = 0;
    let end = i + ':where'.length;
    for (; end < bare.length; end++) {
      if (bare[end] === '(') depth++;
      else if (bare[end] === ')' && --depth === 0) break;
    }
    bare = bare.slice(0, i) + bare.slice(end + 1);
  }
  bare = bare.replace(/::[a-z-]+/g, '');
  const ids = (bare.match(/#[\w-]+/g) ?? []).length;
  const classes =
    (bare.match(/\.[\w-]+/g) ?? []).length +
    (bare.match(/\[[^\]]*\]/g) ?? []).length +
    (bare.match(/:[a-z-]+/g) ?? []).length;
  return [ids, classes];
}

describe('the stylesheet of the exported page', () => {
  it('has every class of the contract, and names it in its head', () => {
    for (const name of [...DECK_CLASSES, ...CONTROL_CLASSES]) {
      expect(CSS, name).toMatch(new RegExp(`\\.${name}(?![\\w-])`));
      expect(HEAD, name).toMatch(new RegExp(`\\.${name}(?![\\w-])`));
    }
  });

  it('gives every custom property of the contract a value, dark and light, and names it', () => {
    const rules = styleRules(CSS);
    const body = (selector: string, within?: string) =>
      rules.find(
        (rule) =>
          rule.selector === selector && (within === undefined || rule.within.includes(within)),
      )?.body ?? '';
    const dark = rules
      .filter((rule) => rule.selector === '.mfe-deck' && rule.within.length === 0)
      .map((rule) => rule.body)
      .join('');
    const light = body(".mfe-deck:where([data-theme='light'])");
    const system = body(
      '.mfe-deck:where(:not([data-theme], .mfe-page > *))',
      '@media (prefers-color-scheme: light)',
    );
    for (const name of PROPERTIES) {
      expect(dark, name).toMatch(new RegExp(`${name}:`));
      expect(HEAD, name).toContain(name);
      expect(CSS, name).toContain(`var(${name}`);
    }
    for (const name of COLOURS) {
      expect(light, name).toMatch(new RegExp(`${name}:`));
      expect(system, name).toMatch(new RegExp(`${name}:`));
    }
    // The light set is one set, whichever way it applies.
    expect(system.replace(/\s+/g, ' ').trim()).toBe(light.replace(/\s+/g, ' ').trim());
    for (const name of WRITTEN) expect(CSS, name).toContain(`var(${name}`);
    expect(body('.mfe-page')).toMatch(/--mfe-page-background:/);
  });

  it('keeps every rule under the deck, low, and loads nothing', () => {
    const rules = styleRules(CSS);
    expect(rules.length).toBeGreaterThan(50);
    for (const rule of rules) {
      for (const selector of selectors(rule.selector)) {
        expect(selector, selector).toMatch(/^\.mfe-(deck|page)(?![\w-])/);
        const [ids, classes] = specificity(selector);
        expect(ids, selector).toBe(0);
        expect(classes, selector).toBeLessThanOrEqual(2);
      }
    }
    const code = CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain('!important');
    expect(code).not.toMatch(/@import|url\(|@font-face/);
    // At-rules: queries only, of the deck's own container or of the reader's settings.
    const ats = new Set(rules.flatMap((rule) => rule.within));
    for (const at of ats) {
      expect(at, at).toMatch(
        /^@(container mfe-deck \(max-width: \d+px\)|media \((prefers-color-scheme: light|prefers-reduced-motion: reduce|forced-colors: active)\)|supports \(height: 100dvh\))$/,
      );
    }
  });
});

describe('the DOM of the controls', () => {
  const marks: SlideMark[] = [
    // A pause that skips its wait: the dashes of the wait on the track.
    { id: 'p1', time: 1.5, kind: 'pause', text: 'Ask the room', skipWait: true },
    { id: 'p2', time: 1.25, kind: 'comment', text: 'A flash' },
  ];
  let files: MockFiles;
  beforeAll(async () => {
    files = await mockFiles(marks);
  });
  afterEach(() => {
    resetRegistry();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete (HTMLElement.prototype as Partial<HTMLElement>).requestFullscreen;
    delete (document as { fullscreenEnabled?: boolean }).fullscreenEnabled;
  });

  it('has every class of the contract, and none it leaves out', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    // A browser with full screen, a scene with sound, its notes open.
    HTMLElement.prototype.requestFullscreen = () => Promise.resolve();
    Object.defineProperty(document, 'fullscreenEnabled', { configurable: true, value: true });
    MFE.glyphs('hello', files.glyphs);
    MFE.scene('hello', files.project, { audio: 'audio.m4a' });
    const element = document.createElement('div');
    element.className = 'mfe-deck';
    element.setAttribute('data-scene', 'hello');
    document.body.append(element);
    const deck = MFE.mount(element);
    deck.seek(1.5);
    element.dispatchEvent(new KeyboardEvent('keydown', { key: 's', bubbles: true }));
    for (const name of CONTROL_CLASSES) {
      expect(element.querySelector(`.${name}`), name).not.toBeNull();
    }
    for (const name of ['mfe-screen', 'mfe-stage', 'mfe-sound']) {
      expect(element.querySelector(`.${name}`), name).not.toBeNull();
    }
    // Outside the stage (whose groups are its own contract, `svgStage.ts`), no other class.
    const known = new Set([...DECK_CLASSES, ...CONTROL_CLASSES]);
    const seen = new Set<string>();
    for (const node of element.querySelectorAll('*')) {
      if (node.closest('.mfe-stage')) continue;
      for (const name of node.classList) seen.add(name);
    }
    expect([...seen].filter((name) => !known.has(name))).toEqual([]);
    expect(element.querySelectorAll('[id]')).toHaveLength(0);
  });
});
