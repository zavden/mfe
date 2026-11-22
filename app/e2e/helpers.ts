/* Shared e2e helpers. The dev server exposes `window.__mfe` (src/devtools.ts); e2e code is
 * compiled apart from the app, so the handle is typed structurally here, loosely. */
import { expect, type Frame, type JSHandle, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { FORMAT_VERSION } from '../src/model';

/** Whether the suite runs on macOS. The specs press `ControlOrMeta`, which Playwright turns into
 * ⌘ there and into Ctrl elsewhere, as the app takes them (and a Ctrl+click on a Mac is the
 * secondary click: it opens a menu, it adds nothing to a selection). This is for the few things
 * that differ beyond the key. */
export const MAC = process.platform === 'darwin';

/** The Control key itself, for the few keys that are Control on every system — Distribute is
 * Ctrl+Alt+H, and ⌃⌥H on a Mac. Not the command key, which is `ControlOrMeta`: this is the one
 * place of the suite that names it (`e2eConventions.test.ts` reads the specs for any other). */
export const CONTROL_ITSELF = 'Control';

/** The keys of Save As and of Sync folder on the system the suite runs on. A Mac has them the
 * other way round: ⇧⌘S is Save As in every app there, and Sync folder takes ⌥⌘S. */
export const SAVE_AS_KEYS = MAC ? 'ControlOrMeta+Shift+S' : 'ControlOrMeta+Alt+s';
export const SYNC_FOLDER_KEYS = MAC ? 'ControlOrMeta+Alt+s' : 'ControlOrMeta+Shift+S';

/** The key that adds the focused row of the formula list to the selection, or takes it out, on
 * the system the suite runs on: Ctrl+Space, and ⌘+Return on a Mac, where ⌘+Space is Spotlight's. */
export const LIST_TOGGLE_KEYS = MAC ? 'ControlOrMeta+Enter' : 'ControlOrMeta+Space';

/** A text of the interface that names keys, as the system the suite runs on shows it: the app
 * writes a Mac's keys the Mac's way (`keysText`, ui/platform.ts). Both are written out in the
 * spec, which reads what a user reads there and not what the code under test makes of a text. */
export const onSystem = (elsewhere: string, onMac: string): string => (MAC ? onMac : elsewhere);

export interface E2eProject {
  meta: Record<string, unknown>;
  formulas: {
    id: string;
    name: string;
    source: string;
    glyphColors: Record<string, string>;
    hiddenGlyphs: number[];
    intro: { kind: string } | null;
    /** The glyphs the project counts by; null until the formula was first drawn. */
    snapshot: object | null;
  }[];
  tracks: {
    id: string;
    kind: 'visual' | 'audio';
    name: string;
    hidden: boolean;
    muted: boolean;
    locked: boolean;
  }[];
  clips: {
    id: string;
    formulaId: string;
    trackId: string;
    start: number;
    end: number;
    intro: { kind: string; duration: number };
    outro: { kind: string; duration: number };
    actions: Record<string, unknown>[];
    attach: Record<string, unknown> | null;
  }[];
  relations: { id: string; fromClipId: string; toClipId: string }[];
  audioAssets: {
    id: string;
    name: string;
    originalName: string;
    mimeType: string;
    byteLength: number;
    contentHash: string;
    duration: number;
    sampleRate: number;
    channels: number;
  }[];
  audioClips: {
    id: string;
    assetId: string;
    trackId: string;
    start: number;
    end: number;
    sourceStart: number;
    volume: { id: string; time: number; gain: number }[];
  }[];
  colorMatches: { id: string; name: string; entries: { pattern: string; color: string }[] }[];
}

export interface MfeHandle {
  parseProject(text: string): { ok: true; project: unknown } | { ok: false; error: string };
  loadProject(project: unknown): void;
  history: {
    undo(): void;
    redo(): void;
    clear(): void;
    canUndo(): boolean;
    canRedo(): boolean;
    isGesturing(): boolean;
  };
  useProjectStore: {
    getState(): { project: E2eProject; update(recipe: (draft: E2eProject) => void): void };
  };
  useUiStore: {
    getState(): {
      time: number;
      playing: boolean;
      selection: { kind: string; id?: string; ids?: string[] };
      setTime(t: number): void;
      setPlaying(playing: boolean): void;
      select(selection: { kind: string; id?: string; ids?: string[] }): void;
    };
    /** Every change of the playhead's store, as it is made (the rehearsal's specs record the
     * times it is given). */
    subscribe(listener: (state: { time: number }) => void): () => void;
  };
  useRenderStore: {
    getState(): {
      resolved: ReadonlyMap<string, unknown>;
      entries: Readonly<Record<string, { status: string } | undefined>>;
      setEntry(id: string, entry: { status: string }): void;
    };
  };
  usePreferences: {
    getState(): {
      autoIntro: boolean;
      autoOutro: boolean;
      snapObjects: boolean;
      guideColor: string;
      guideWidth: string;
      pickColor: string;
      grid: boolean;
      gridStep: number;
      gridAnchor: string;
      standardScale: { math: string; tex: string };
      symbolRadius: number;
      scaleStep: string;
      splitSuffix: string;
      autoSuggestMorphPairs: boolean;
      zenMode: boolean;
      set(patch: {
        zenMode?: boolean;
        autoIntro?: boolean;
        autoOutro?: boolean;
        snapObjects?: boolean;
        guideColor?: string;
        pickColor?: string;
        guideWidth?: string;
        grid?: boolean;
        gridStep?: number;
        gridAnchor?: string;
        standardScale?: { math: string; tex: string };
        symbolRadius?: number;
        scaleStep?: string;
        splitSuffix?: string;
        autoSuggestMorphPairs?: boolean;
        keepHandles?: boolean;
      }): void;
    };
  };
  useDocumentStore: {
    getState(): {
      fileName: string | null;
      handle: unknown;
      markClean(project: unknown, info: { fileName: string | null; handle: null }): void;
    };
  };
  /** The pair editor of a morph block (`ui/morph/morphEditorStore.ts`). */
  useMorphEditorStore: {
    getState(): {
      request: { clipId: string; actionId: string } | null;
      open(request: { clipId: string; actionId: string }): void;
      close(): void;
    };
  };
  /** The Edit-path mode of the preview (`ui/preview/pathEdit.ts`). */
  usePathEdit: {
    getState(): {
      target: PairRefJson | null;
      selected: { node: number; part: 'at' | 'in' | 'out' } | null;
      open(target: PairRefJson): void;
      close(): void;
      select(selected: { node: number; part: 'at' | 'in' | 'out' } | null): void;
    };
  };
  /** One pass of the collection of abandoned originals (`ui/project/mediaCollection.ts`), judged
   * by the clock given. */
  collectMedia(now?: number): Promise<{ released: string[]; removed: number; bytes: number }>;
}

/** One pair of a relation or of a morph block, as the Edit-path mode names it. */
export type PairRefJson = {
  origin:
    { kind: 'relation'; relationId: string } | { kind: 'morph'; clipId: string; actionId: string };
  index: number;
};

/** Use inside `page.evaluate`: `(window as MfeWindow).__mfe!`. */
export type MfeWindow = Window & { __mfe?: MfeHandle };

export function readExample(name: string): string {
  return readFileSync(new URL(`../../examples/${name}`, import.meta.url), 'utf8');
}

/** The four areas of the layout, by test id. */
const APP_AREAS = ['panel-creator', 'panel-preview', 'panel-animations', 'panel-timeline'] as const;

/** The app has started: its menu bar, its four areas and the preview frame are on screen, and
 * the status bar names a renderer. `window.__mfe` does not tell: the dev handle is installed
 * before the first render (`src/main.tsx`). */
export async function expectAppShown(page: Page): Promise<void> {
  await expect(page.getByTestId('menu-bar')).toBeVisible();
  for (const id of APP_AREAS) await expect(page.getByTestId(id)).toBeVisible();
  await expect(page.getByTestId('preview-frame')).toBeVisible();
  await expect(page.getByTestId('engine-status')).toHaveText(/^Renderer: (MathJax|LaTeX|mixed)$/);
}

/** Open the app and load a project JSON through the dev handle. */
export async function openWithProject(page: Page, json: string): Promise<void> {
  await page.goto('/');
  await page.waitForFunction(() => (window as MfeWindow).__mfe !== undefined);
  await page.evaluate((text) => {
    const mfe = (window as MfeWindow).__mfe!;
    const parsed = mfe.parseProject(text);
    if (!parsed.ok) throw new Error(parsed.error);
    mfe.loadProject(parsed.project);
  }, json);
}

export async function getProject(page: Page): Promise<E2eProject> {
  return page.evaluate(() => (window as MfeWindow).__mfe!.useProjectStore.getState().project);
}

/** Show a tab of the clip view in the Animations panel ('relations' is the default). */
export async function openAnimationsTab(page: Page, tab: 'relations' | 'timing'): Promise<void> {
  await page.getByTestId(`animations-tab-${tab}`).click();
}

/** Open the submenu behind the entry `testId` of an open context menu, as the pointer does
 * (hover), and wait for its panel. */
export async function openSubmenu(page: Page, testId: string): Promise<void> {
  await page.getByTestId(testId).hover();
  await page.getByTestId(`${testId}-submenu`).waitFor({ state: 'visible' });
}

/** Confirm the open dialog by holding its confirm button down (destructive actions, 0.7 s). */
export async function holdToConfirm(page: Page): Promise<void> {
  await page.getByTestId('dialog-confirm').hover();
  await page.mouse.down();
  await page.waitForTimeout(850);
  await page.mouse.up();
  await page.getByTestId('dialog').waitFor({ state: 'detached' });
}

/** What a drag of one file from the desktop carries, made in the page (or the frame) whose
 * events will hold it: the events themselves are dispatched by the spec, a real drag from another
 * program being out of Playwright's reach. */
export function fileTransfer(
  scope: Page | Frame,
  file: { name: string; type: string; text: string },
): Promise<JSHandle<DataTransfer>> {
  return scope.evaluateHandle(({ name, type, text }) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([text], name, { type }));
    return transfer;
  }, file);
}

/** A drag of files from the desktop that the browser itself delivers (the drag events of the
 * DevTools protocol), as it does a real one. An event a script dispatches is not that: after each
 * listener of an event of its own the browser runs what is pending, React's renders among it, so
 * what one listener unmounts is gone for the listeners after it. `paths` are files on disk; the
 * browser tells a file's type by its extension. Each step is aimed at the middle of a target. */
export async function desktopDrag(page: Page, paths: string[]) {
  const session = await page.context().newCDPSession(page);
  const data = { items: [], files: paths, dragOperationsMask: 1 }; // 1: the source allows a copy
  const send = async (type: 'dragEnter' | 'dragOver' | 'drop', target: Locator) => {
    const box = await target.boundingBox();
    if (!box) throw new Error('the target of the drag has no box');
    await session.send('Input.dispatchDragEvent', {
      type,
      x: Math.round(box.x + box.width / 2),
      y: Math.round(box.y + box.height / 2),
      data,
    });
  };
  return {
    /** The drag comes into the page over `target`. */
    enter: (target: Locator) => send('dragEnter', target),
    /** It moves, or rests, over `target`: the browser looks again at what is under it. */
    move: (target: Locator) => send('dragOver', target),
    /** The files are released over `target`. */
    drop: (target: Locator) => send('drop', target),
  };
}

/** Whether a file dragged over `selector` and taken by nothing there is refused (the guard of
 * `ui/fileDrop.ts`) instead of being left to the browser, which would open it. The refusal is
 * read off the cancelled event: Chrome keeps the drop effect of a DataTransfer made by a script
 * at `none` whatever is written to it, so that half is the unit test's. */
export function refusesStrayFile(scope: Page | Frame, selector: string): Promise<boolean> {
  return scope.evaluate((selector) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['x'], 'photo.png', { type: 'image/png' }));
    const event = new DragEvent('dragover', {
      dataTransfer: transfer,
      bubbles: true,
      cancelable: true,
    });
    document.querySelector(selector)!.dispatchEvent(event);
    return event.defaultPrevented;
  }, selector);
}

/** A text field of the app that is there whatever the project — the search of the Creator's
 * Audio tab —, for what a key typed into a field must not do. The Creator is left on that tab. */
export async function someTextField(page: Page): Promise<Locator> {
  await page.getByTestId('creator-tab-audio').click();
  return page.getByTestId('audio-search');
}

export async function setTime(page: Page, t: number): Promise<void> {
  await page.evaluate(
    (time) => (window as MfeWindow).__mfe!.useUiStore.getState().setTime(time),
    t,
  );
}

export async function undo(page: Page): Promise<void> {
  await page.evaluate(() => (window as MfeWindow).__mfe!.history.undo());
}

export async function canUndo(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as MfeWindow).__mfe!.history.canUndo());
}

export async function selectionOf(page: Page) {
  return page.evaluate(() => (window as MfeWindow).__mfe!.useUiStore.getState().selection);
}

/** A formula of a project file (no snapshot: the app renders it). */
export interface FormulaFile {
  id: string;
  name: string;
  source: string;
  color: string;
}

/** A project file of the current format named `name`, with these formulas and clips, tracks
 * t1…t3, and no relations unless `extra` brings them (or replaces any other top-level field). It
 * is read as it is written: no migration runs over it, so what a spec puts in a clip or in
 * `extra` — an attachment, a list of match colours, audio — reaches the app. What a spec leaves
 * out of a clip (what it hangs on) or of a track of its own (its kind, whether it is muted) gets
 * the value of a new one, and nothing a spec wrote is replaced. */
export function projectFile(
  name: string,
  formulas: FormulaFile[],
  clips: unknown[],
  extra: Record<string, unknown> = {},
): string {
  const { tracks: ownTracks, ...rest } = extra;
  const tracks = (
    (ownTracks as Record<string, unknown>[] | undefined) ??
    ['t1', 't2', 't3'].map((id, i) => ({
      id,
      name: `Track ${i + 1}`,
      hidden: false,
      locked: false,
    }))
  ).map((track) => ({ kind: 'visual', muted: false, ...track }));
  return JSON.stringify({
    format: 'manim-formula-editor',
    version: FORMAT_VERSION,
    meta: {
      name,
      target: 'ce',
      width: 1920,
      height: 1080,
      fps: 60,
      background: '#000000',
      preamble: '',
      duration: null,
    },
    formulas: formulas.map((f) => ({
      id: f.id,
      kind: 'math',
      intro: null,
      name: f.name,
      source: f.source,
      packages: [],
      tag: { color: f.color, icon: null },
      fontSize: 48,
      color: '#FFFFFF',
      glyphColors: {},
      hiddenGlyphs: [],
      snapshot: null,
    })),
    tracks,
    clips: clips.map((clip) => ({ attach: null, ...(clip as Record<string, unknown>) })),
    relations: [],
    colorMatches: [],
    audioAssets: [],
    audioClips: [],
    ...rest,
  });
}
