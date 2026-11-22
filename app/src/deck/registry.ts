/* The scenes a page has loaded and the decks it has mounted. A scene's two files register
 * themselves by name — `MFE.glyphs('name', …)` in `glyphs.js`, `MFE.scene('name', …)` in
 * `scene.js` —, and every `<div class="mfe-deck" data-scene="name">` of the page is mounted once
 * the page's scripts have run. Several scenes share a page: nothing here hangs from the window
 * but `MFE` itself (`main.ts`), and no element gets an id. */
import { attachControls } from './controls';
import { createDeck, MOUNTED, type Deck, type DeckSource } from './deck';
import type { DeckOptions } from './options';
import { buildDeckScene, type DeckProblem } from './sceneFile';

/** What a scene file can bring besides the project. */
export interface SceneAssets {
  /** The scene's sound: an address, read from where the scene file is. */
  audio?: string;
  /** The SHA-256 of that file as the editor wrote it. The page does not read it: the editor
   * does, when the scene is exported again over the folder, to know the file as the one it wrote
   * before it removes it. */
  sha256?: string;
}

interface Registered {
  project: unknown;
  audio: string | null;
}

const scenes = new Map<string, Registered>();
const glyphFiles = new Map<string, unknown>();
const decks = new Map<Element, Deck>();

/** The address of the script that is running, which what it names is read from: a scene file
 * says `audio.m4a`, and means the one beside itself, wherever the page that loads it is. */
function scriptAddress(): string | null {
  if (typeof document === 'undefined') return null;
  const script = document.currentScript;
  return script instanceof HTMLScriptElement && script.src ? script.src : document.baseURI;
}

/** `MFE.scene(name, project, assets)`: what `scene.js` calls. */
export function registerScene(name: string, project: unknown, assets: SceneAssets = {}): void {
  let audio: string | null = null;
  if (typeof assets.audio === 'string' && assets.audio !== '') {
    const base = scriptAddress();
    try {
      audio = base ? new URL(assets.audio, base).href : assets.audio;
    } catch {
      audio = assets.audio;
    }
  }
  scenes.set(String(name), { project, audio });
}

/** `MFE.glyphs(name, data)`: what `glyphs.js` calls. */
export function registerGlyphs(name: string, data: unknown): void {
  glyphFiles.set(String(name), data);
}

/** The classes of the blocks of data a page carries inside itself (`registerInlineScenes`). */
export const INLINE_SCENE = 'mfe-scene-data';
export const INLINE_GLYPHS = 'mfe-glyph-data';

/** Registers the scenes a page carries inside itself: the single-file form of an export, which
 * has no file beside it. A `<script type="application/json" class="mfe-scene-data"
 * data-scene="name">` is a project — with its sound in `data-audio`, an address, when it has one —
 * and one of class `mfe-glyph-data` its outlines. A block that is not JSON is said in the console
 * and left out: its deck then says no scene of the name was loaded. A scene registered already
 * (by a call, or by an earlier pass) is not registered again. */
export function registerInlineScenes(doc: Document): void {
  const read = (
    className: string,
    register: (name: string, data: unknown, block: Element) => void,
  ) => {
    for (const block of doc.querySelectorAll(`script[type="application/json"].${className}`)) {
      const name = block.getAttribute('data-scene') ?? '';
      try {
        register(name, JSON.parse(block.textContent ?? ''), block);
      } catch (error) {
        console.error(`[MFE] ${name}: a block of data of the page cannot be read`, error);
      }
    }
  };
  read(INLINE_GLYPHS, (name, data) => {
    if (!glyphFiles.has(name)) glyphFiles.set(name, data);
  });
  read(INLINE_SCENE, (name, data, block) => {
    if (!scenes.has(name))
      scenes.set(name, { project: data, audio: block.getAttribute('data-audio') });
  });
}

/** The names of the scenes the page has loaded. */
export function sceneNames(): string[] {
  return [...scenes.keys()];
}

function sourceOf(name: string): DeckSource | null {
  const scene = scenes.get(name);
  if (!scene) return null;
  return { name, project: scene.project, glyphs: glyphFiles.get(name), audio: scene.audio };
}

/** What is wrong with a scene's files, without mounting it: what `check.mjs` prints. With no
 * name, of every scene loaded. */
export function checkScenes(name?: string): { scene: string; problems: DeckProblem[] }[] {
  const names = name === undefined ? sceneNames() : [name];
  return names.map((scene) => {
    const source = sourceOf(scene);
    return {
      scene,
      problems: source
        ? buildDeckScene(source.project, source.glyphs).problems
        : [
            {
              severity: 'error' as const,
              file: 'scene.js' as const,
              where: '',
              message: `No scene named "${scene}" was loaded.`,
            },
          ],
    };
  });
}

/** Mounts a scene in an element (or the first one a selector finds) and gives its deck. The
 * scene is the one its `data-scene` names — or the only one loaded, when it names none. An
 * element mounted already gives the deck it has. */
export function mount(target: Element | string, options: Partial<DeckOptions> = {}): Deck {
  const element = typeof target === 'string' ? document.querySelector(target) : target;
  if (!(element instanceof HTMLElement)) {
    throw new Error(
      typeof target === 'string'
        ? `MFE.mount: nothing in the page matches "${target}".`
        : 'MFE.mount: the target is not an element of a page.',
    );
  }
  const known = decks.get(element);
  if (known) return known;
  const named = element.getAttribute('data-scene');
  const name = named ?? (scenes.size === 1 ? sceneNames()[0]! : '');
  const deck = createDeck(element, name, sourceOf(name), options, attachControls);
  decks.set(element, deck);
  const destroy = deck.destroy;
  deck.destroy = () => {
    decks.delete(element);
    destroy();
  };
  return deck;
}

/** Mounts every deck of `root` that is not mounted yet: the elements of class `mfe-deck`. */
export function mountAll(root: ParentNode = document): Deck[] {
  const mounted: Deck[] = [];
  for (const element of root.querySelectorAll(`.mfe-deck:not([${MOUNTED}])`)) {
    mounted.push(mount(element));
  }
  return mounted;
}

/** The decks of the page, in the order they were mounted. */
export function mountedDecks(): Deck[] {
  return [...decks.values()];
}

/** Forgets every scene and takes every deck away: for the tests. */
export function resetRegistry(): void {
  for (const deck of mountedDecks()) deck.destroy();
  scenes.clear();
  glyphFiles.clear();
}
