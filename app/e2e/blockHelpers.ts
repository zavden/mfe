/* Helpers for the animation block specs: blocks as stored in a project file, and reading and
 * driving them on the timeline. Formulas are `fa` (a+b=c) and `fb` (a=3+1), five glyphs each. */
import type { Locator, Page } from '@playwright/test';
import {
  APPEAR_ANIMATIONS,
  DISAPPEAR_ANIMATIONS,
  EMPHASIS_EFFECTS,
} from '../src/ui/animations/catalogue';
import { openSubmenu, type MfeWindow } from './helpers';
import { openRelationScene, plain } from './relationsHelpers';
import {
  box,
  clipJson,
  clipOf,
  dragTo,
  PX_PER_SECOND,
  timeToX,
  type ActionJson,
} from './timelineHelpers';

export function appearJson(
  id: string,
  start: number,
  duration: number,
  anim = 'write',
  glyphs: 'all' | number[] = 'all',
  extra: Partial<ActionJson> = {},
): ActionJson {
  return {
    id,
    kind: 'appear',
    start,
    duration,
    easing: 'smooth',
    anim,
    glyphs,
    lagRatio: null,
    shift: [0, 0],
    scale: 1,
    ...extra,
  } as ActionJson;
}

export function disappearJson(
  id: string,
  start: number,
  duration: number,
  anim = 'fade_out',
  glyphs: 'all' | number[] = 'all',
  extra: Partial<ActionJson> = {},
): ActionJson {
  return {
    ...appearJson(id, start, duration, anim, glyphs, extra),
    kind: 'disappear',
  } as ActionJson;
}

export function tweenJson(
  id: string,
  start: number,
  duration: number,
  to: Record<string, unknown> = { rotation: 90 },
): ActionJson {
  return { id, kind: 'tween', start, duration, easing: 'smooth', to };
}

export function partJson(
  id: string,
  start: number,
  duration: number,
  glyphs: number[],
  extra: Partial<ActionJson> & {
    rotation?: number;
    color?: string | null;
    opacity?: number | null;
  } = {},
): ActionJson {
  return {
    id,
    kind: 'transform',
    start,
    duration,
    easing: 'smooth',
    glyphs,
    shift: [0, 0],
    scale: 1,
    rotation: 0,
    color: null,
    opacity: null,
    ...extra,
  } as unknown as ActionJson;
}

/** A pair of a morph block, as stored (`style` null: the block's own). */
export interface PairJson {
  from: number[];
  to: number[];
  style: 'transform' | 'copy' | 'fade' | null;
  extras?: 'separate' | 'merge' | 'copies';
}

/** A morph block within the formula: `copy` and a straight path unless `extra` says otherwise. */
export function morphJson(
  id: string,
  start: number,
  duration: number,
  pairs: PairJson[] = [],
  extra: { easing?: string; style?: PairJson['style']; pathArc?: number } = {},
): ActionJson {
  return {
    id,
    kind: 'morph',
    start,
    duration,
    easing: 'smooth',
    style: 'copy',
    pathArc: 0,
    pairs,
    ...extra,
  } as unknown as ActionJson;
}

/** An Emphasis block (D73) at Manim's defaults of its effect, as stored. */
export function emphasisJson(
  id: string,
  start: number,
  duration: number,
  effect = 'indicate',
  glyphs: 'all' | number[] = 'all',
  extra: Partial<ActionJson> = {},
): ActionJson {
  return {
    id,
    kind: 'emphasis',
    start,
    duration,
    easing: effect === 'indicate' ? 'there_and_back' : 'smooth',
    effect,
    glyphs,
    color: effect === 'focus_on' ? '#888888' : '#FFFF00',
    scale: effect === 'wiggle' ? 1.1 : 1.2,
    angle: 3.6,
    wiggles: 6,
    buff: 0.1,
    strokeWidth: 4,
    timeWidth: 0.3,
    opacity: 0.2,
    ...extra,
  } as unknown as ActionJson;
}

/** The block's element on the timeline. */
/** The entry of the "Add animation" menu whose submenu has an animation; null for the one that
 * is an entry of the menu itself (`morph`). */
function animationGroup(item: string): string | null {
  if (APPEAR_ANIMATIONS.some((k) => k.value === item)) return 'appear';
  if (DISAPPEAR_ANIMATIONS.some((k) => k.value === item)) return 'disappear';
  if (item === 'tween' || item === 'transform') return 'transform';
  if (EMPHASIS_EFFECTS.some((k) => k.value === item)) return 'emphasis';
  return null;
}

/** The item `add-animation-<item>` of the open "Add animation" menu, with the submenu that has
 * it open (as the pointer opens it, resting on its entry). */
export async function animationItem(page: Page, item: string): Promise<Locator> {
  const group = animationGroup(item);
  if (group) await openSubmenu(page, `add-animation-group-${group}`);
  return page.getByTestId(`add-animation-${item}`);
}

/** Chooses an animation of the open "Add animation" menu. */
export async function pickAnimation(page: Page, item: string): Promise<void> {
  await (await animationItem(page, item)).click();
}

export const blockLocator = (page: Page, id: string): Locator =>
  page.getByTestId(`action-block-${id}`);

/** A block as a member of the group `group` of its clip (the blocks of a group start together
 * and last the same). */
export const grouped = (action: ActionJson, group: string): ActionJson =>
  ({ ...action, group }) as unknown as ActionJson;

/** The one block the timeline draws for a folded group. */
export const groupLocator = (page: Page, group: string): Locator =>
  page.getByTestId(`group-block-${group}`);

/** The group of each block of clip `clipId`, by block id (null: a block on its own). */
export async function groupsOf(page: Page, clipId: string): Promise<Record<string, string | null>> {
  const { actions } = await clipOf(page, clipId);
  return Object.fromEntries(
    actions.map((a) => [a.id, (a as unknown as { group?: string }).group ?? null]),
  );
}

/** A block as stored in the project. */
export async function blockOf(page: Page, clipId: string, actionId: string): Promise<ActionJson> {
  const found = (await clipOf(page, clipId)).actions.find((a) => a.id === actionId);
  if (!found) throw new Error(`no block ${actionId} on clip ${clipId}`);
  return found;
}

/** Open the relation scene (so that glyphs exist) with a plain 0–10 s clip `a` on track 1 and
 * the given blocks, plus an unrelated plain clip `b` on track 2. */
export async function openBlockScene(
  page: Page,
  actions: ActionJson[],
  options: {
    clip?: Partial<ReturnType<typeof clipJson>>;
    hidden?: number[];
    /** Extra project fields, e.g. `relations`. */
    extra?: Record<string, unknown>;
  } = {},
): Promise<void> {
  const a = plain('a', 'fa', 't1', 0, 10, { actions, ...options.clip });
  const b = plain('b', 'fb', 't2', 2, 8);
  await openRelationScene(page, [a, b], options.extra);
  if (options.hidden) {
    await page.evaluate((hidden) => {
      (window as MfeWindow).__mfe!.useProjectStore.getState().update((d) => {
        d.formulas.find((f) => f.id === 'fa')!.hiddenGlyphs = hidden;
      });
    }, options.hidden);
  }
}

/** The screen position of time `t` (seconds) and the vertical middle of a block. */
export async function blockPoint(page: Page, id: string, t: number) {
  const b = await box(blockLocator(page, id));
  return { x: await timeToX(page, t), y: b.y + b.height / 2 };
}

/** Drag a block by `seconds`: by its body (`move`) or by one edge (`start`, `end`). */
export async function dragBlock(
  page: Page,
  id: string,
  seconds: number,
  options: { edge?: 'move' | 'start' | 'end'; shift?: boolean; release?: boolean } = {},
): Promise<void> {
  const b = await box(blockLocator(page, id));
  const y = b.y + b.height / 2;
  const edge = options.edge ?? 'move';
  const x = edge === 'start' ? b.x + 2 : edge === 'end' ? b.x + b.width - 2 : b.x + b.width / 2;
  await dragTo(
    page,
    { x, y },
    { x: x + seconds * PX_PER_SECOND, y },
    { shift: options.shift, release: options.release },
  );
}

export { PX_PER_SECOND };
