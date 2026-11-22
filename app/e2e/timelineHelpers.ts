/* Helpers for the Phase 3 specs: build small projects, read them back, and drive the timeline
 * with the mouse. Times map to x through the ruler (80 px per second at the default zoom). */
import { expect, type Locator, type Page } from '@playwright/test';
import { openWithProject, projectFile, type MfeWindow } from './helpers';

export { canUndo, setTime, undo } from './helpers';

export const PX_PER_SECOND = 80;
export const FORMULA_MIME = 'application/x-mfe-formula';

interface SpecBase {
  kind: string;
  duration: number;
  easing: string;
  lagRatio: number | null;
  shift: [number, number];
  scale: number;
}

export interface ClipJson {
  id: string;
  formulaId: string;
  trackId: string;
  start: number;
  end: number;
  initial: {
    position: [number, number];
    scale: number;
    rotation: number;
    flipX: boolean;
    flipY: boolean;
    opacity: number;
    color: string | null;
    glyphColors: Record<string, string>;
  };
  intro: SpecBase;
  outro: SpecBase;
  actions: ActionJson[];
  /** What the clip hangs on (`clip.attach` of the model); absent in a spec's hand, null as
   * stored. */
  attach?: unknown;
  /** The clip starts empty (`Clip.startsEmpty`); absent when it does not. */
  startsEmpty?: boolean;
  /** The glyphs the clip leaves out of its intro itself (`Clip.startHidden`); absent when none. */
  startHidden?: number[];
}

/** The tween of a whole formula, as stored. */
export interface TweenJson {
  id: string;
  kind: 'tween';
  start: number;
  duration: number;
  easing: string;
  to: Record<string, unknown>;
}

/** An appear / disappear block, as stored. */
export interface BlockJson {
  id: string;
  kind: 'appear' | 'disappear';
  start: number;
  duration: number;
  easing: string;
  anim: string;
  glyphs: 'all' | number[];
  lagRatio: number | null;
  shift: [number, number];
  scale: number;
}

/** A clip action as stored. */
export type ActionJson = TweenJson | BlockJson;

/** `action` as a tween (specs know which of a clip's actions are tweens). */
export function asTween(action: ActionJson | undefined): TweenJson {
  if (action?.kind !== 'tween') throw new Error('not a tween');
  return action;
}

export interface FullProject {
  meta: { fps: number; duration: number | null } & Record<string, unknown>;
  formulas: { id: string; name: string }[];
  tracks: { id: string; name: string; hidden: boolean; locked: boolean }[];
  clips: ClipJson[];
  relations: { id: string; fromClipId: string; toClipId: string }[];
}

export function clipJson(
  id: string,
  formulaId: string,
  trackId: string,
  start: number,
  end: number,
  fields: Partial<ClipJson> = {},
): ClipJson {
  return {
    id,
    formulaId,
    trackId,
    start,
    end,
    initial: {
      position: [0, 0],
      scale: 1,
      rotation: 0,
      flipX: false,
      flipY: false,
      opacity: 1,
      color: null,
      glyphColors: {},
    },
    intro: {
      kind: 'write',
      duration: 1,
      easing: 'linear',
      lagRatio: null,
      shift: [0, 0],
      scale: 1,
    },
    outro: {
      kind: 'fade_out',
      duration: 1,
      easing: 'smooth',
      lagRatio: null,
      shift: [0, 0],
      scale: 1,
    },
    actions: [],
    attach: null,
    ...fields,
  };
}

/** A valid project with formulas `fa` and `fb`, tracks `t1`…`t3` and the given clips. */
export function projectJson(clips: ClipJson[], extra: Record<string, unknown> = {}): string {
  const formulas = [
    { id: 'fa', name: 'alpha', source: 'alpha', color: '#58C4DD' },
    { id: 'fb', name: 'beta', source: 'beta', color: '#83C167' },
  ];
  return projectFile('e2e', formulas, clips, extra);
}

export async function openTimeline(page: Page, clips: ClipJson[], extra = {}): Promise<void> {
  await page.setViewportSize({ width: 1500, height: 900 });
  await openWithProject(page, projectJson(clips, extra));
  await expect(page.getByTestId('timeline-view')).toBeVisible();
}

export async function project(page: Page): Promise<FullProject> {
  return page.evaluate(
    () =>
      JSON.parse(
        JSON.stringify((window as MfeWindow).__mfe!.useProjectStore.getState().project),
      ) as unknown,
  ) as Promise<FullProject>;
}

export async function clipOf(page: Page, id: string): Promise<ClipJson> {
  const found = (await project(page)).clips.find((c) => c.id === id);
  if (!found) throw new Error(`no clip ${id}`);
  return found;
}

export async function uiState(page: Page) {
  return page.evaluate(() => {
    const s = (window as MfeWindow).__mfe!.useUiStore.getState();
    return { time: s.time, playing: s.playing, selection: s.selection };
  });
}

export async function box(locator: Locator) {
  const b = await locator.boundingBox();
  if (!b) throw new Error('element has no box');
  return b;
}

export async function timeToX(page: Page, t: number): Promise<number> {
  const ruler = await box(page.getByTestId('timeline-ruler'));
  return ruler.x + t * PX_PER_SECOND;
}

export async function laneY(page: Page, trackId: string): Promise<number> {
  const lane = await box(page.getByTestId(`track-lane-${trackId}`));
  return lane.y + lane.height / 2;
}

/** Press, move in steps and release. `shift` holds Shift during the move (not at the press). */
export async function dragTo(
  page: Page,
  from: { x: number; y: number },
  to: { x: number; y: number },
  options: { shift?: boolean; release?: boolean } = {},
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Shift pressed after the button: it suspends snapping instead of extending the selection.
  if (options.shift) await page.keyboard.down('Shift');
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  if (options.release !== false) await page.mouse.up();
  if (options.shift) await page.keyboard.up('Shift');
}

/** Drag a clip body horizontally by `seconds` and vertically onto `toTrack` (default: same). */
export async function moveClip(
  page: Page,
  clipId: string,
  seconds: number,
  options: { toTrack?: string; shift?: boolean; release?: boolean } = {},
): Promise<void> {
  const clip = await clipOf(page, clipId);
  const b = await box(page.getByTestId(`clip-${clipId}`));
  const from = { x: b.x + Math.min(b.width / 2, 60), y: b.y + b.height / 2 };
  const toY = options.toTrack ? await laneY(page, options.toTrack) : from.y;
  void clip;
  await dragTo(page, from, { x: from.x + seconds * PX_PER_SECOND, y: toY }, options);
}

/** Dispatch the drag events of a formula dragged from the Creator onto a track at time `t`. */
export async function dropFormula(
  page: Page,
  formulaId: string,
  trackId: string,
  t: number,
): Promise<boolean> {
  const x = await timeToX(page, t);
  const y = await laneY(page, trackId);
  return page.evaluate(
    ({ formulaId, trackId, x, y, mime }) => {
      const lane = document.querySelector(`[data-testid="track-lane-${trackId}"]`)!;
      const transfer = new DataTransfer();
      transfer.setData(mime, formulaId);
      const init = {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        dataTransfer: transfer,
      };
      lane.dispatchEvent(new DragEvent('dragenter', init));
      lane.dispatchEvent(new DragEvent('dragover', init));
      // dispatchEvent returns false when a listener called preventDefault (= drop accepted).
      return !lane.dispatchEvent(new DragEvent('drop', init));
    },
    { formulaId, trackId, x, y, mime: FORMULA_MIME },
  );
}
