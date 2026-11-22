/* What Zen mode's drawer keeps in the browser (`ZenStage.tsx`, D182, D188): which of its two
 * halves are open — the Creator on the left, the Animations panel on the right —, how tall it is
 * and where the two meet. */
import { safeStorage } from './storage';

export const ZEN_DRAWER_STORAGE_KEY = 'mfe.zen.drawer';

/** The drawer's height, a fraction of the room under (or over) the strip: its default, the bounds
 * a drag or a stored value is kept in, and the step of an arrow key on its edge. */
export const DRAWER_HEIGHT = { default: 0.6, min: 0.2, max: 1, step: 0.05 };

/** Where the two halves meet, a fraction of the Preview's width from its left edge: the Creator
 * is that wide, the Animations panel the rest. */
export const DRAWER_SPLIT = { default: 0.45, min: 0.25, max: 0.75, step: 0.05 };

export interface DrawerState {
  creator: boolean;
  animations: boolean;
  height: number;
  split: number;
}

const clamp = (value: number, bounds: { min: number; max: number }) =>
  Math.min(bounds.max, Math.max(bounds.min, value));

export const clampHeight = (height: number): number => clamp(height, DRAWER_HEIGHT);
export const clampSplit = (split: number): number => clamp(split, DRAWER_SPLIT);

const numberIn = (value: unknown, bounds: { default: number; min: number; max: number }) =>
  typeof value === 'number' && Number.isFinite(value) ? clamp(value, bounds) : bounds.default;

/** The drawer as it was left; both halves closed, at its default height and split, when nothing
 * (or nothing readable) was kept. What an earlier version kept — one panel at a time, `open` and
 * `shown` — is read as that panel's half. */
export function readDrawer(): DrawerState {
  const fallback: DrawerState = {
    creator: false,
    animations: false,
    height: DRAWER_HEIGHT.default,
    split: DRAWER_SPLIT.default,
  };
  try {
    const raw = safeStorage.getItem(ZEN_DRAWER_STORAGE_KEY);
    if (!raw) return fallback;
    const stored = JSON.parse(raw) as Record<string, unknown>;
    const half = (id: 'creator' | 'animations') =>
      typeof stored[id] === 'boolean'
        ? (stored[id] as boolean)
        : stored.open === true && stored.shown === id;
    return {
      creator: half('creator'),
      animations: half('animations'),
      height: numberIn(stored.height, DRAWER_HEIGHT),
      split: numberIn(stored.split, DRAWER_SPLIT),
    };
  } catch {
    return fallback;
  }
}

/** Keep the drawer as it is now. */
export function writeDrawer(state: DrawerState): void {
  safeStorage.setItem(ZEN_DRAWER_STORAGE_KEY, JSON.stringify(state));
}
