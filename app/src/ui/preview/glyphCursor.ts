/* The keyboard's way through the glyphs on screen, for align by symbol: the formulas on screen
 * are rows (top to bottom), each the drawn glyphs of a clip in canonical order; ←/→ walk a row,
 * ↑/↓ change row keeping the column (clamped), and the panel picks the glyph under the cursor
 * on Enter. Pure. */
import { contoursBox, type Box, type Vec2 } from '../../geom';
import type { ClipId } from '../../model';
import type { Drawable } from '../../scene';

export interface GlyphRef {
  clipId: ClipId;
  glyph: number;
  /** The drawable's key, to outline it. */
  key: string;
}

export type CursorKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown';

export const CURSOR_KEYS: readonly CursorKey[] = [
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
];

export function isCursorKey(key: string): key is CursorKey {
  return (CURSOR_KEYS as readonly string[]).includes(key);
}

/** The rows the cursor walks: one per clip with drawn glyphs, the clips ordered from the top of
 * the screen down (by the top of their box in `boxes`; a clip without a box comes last, in the
 * order given) and `except` left out; in a row, each canonical glyph once, ascending, keyed by
 * its own drawable (`<clip>:<glyph>`) when one is drawn, else by the first piece drawn for it. */
export function cursorRows(
  drawables: readonly Drawable[],
  boxes: ReadonlyMap<ClipId, Box>,
  except: ClipId | null = null,
): GlyphRef[][] {
  const byClip = new Map<ClipId, Map<number, string>>();
  for (const d of drawables) {
    if (d.clipId === except) continue;
    const glyphs = byClip.get(d.clipId) ?? new Map<number, string>();
    const own = d.key === `${d.clipId}:${d.glyph}`;
    if (own || !glyphs.has(d.glyph)) glyphs.set(d.glyph, d.key);
    byClip.set(d.clipId, glyphs);
  }
  const clips = [...byClip.keys()];
  const top = (id: ClipId) => boxes.get(id)?.maxY ?? -Infinity;
  const order = new Map(clips.map((id, i) => [id, i]));
  clips.sort((a, b) => top(b) - top(a) || order.get(a)! - order.get(b)!);
  return clips.map((clipId) =>
    [...byClip.get(clipId)!]
      .sort(([a], [b]) => a - b)
      .map(([glyph, key]) => ({ clipId, glyph, key })),
  );
}

/** Where the cursor goes from `current` on `key`: along the row for ←/→, to the row above or
 * below for ↑/↓ (the same column, clamped), stopping at the ends; the first glyph of the first
 * row when there is no cursor yet or its glyph is no longer on screen. Null without rows. */
export function stepCursor(
  rows: readonly (readonly GlyphRef[])[],
  current: GlyphRef | null,
  key: CursorKey,
): GlyphRef | null {
  const first = rows[0]?.[0] ?? null;
  if (!current) return first;
  const r = rows.findIndex((row) => row.some((g) => g.key === current.key));
  if (r < 0) return first;
  const row = rows[r]!;
  const c = row.findIndex((g) => g.key === current.key);
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const next = Math.max(0, Math.min(row.length - 1, c + (key === 'ArrowRight' ? 1 : -1)));
    return row[next]!;
  }
  const target = rows[Math.max(0, Math.min(rows.length - 1, r + (key === 'ArrowDown' ? 1 : -1)))]!;
  return target[Math.min(c, target.length - 1)]!;
}

/** The centre of a drawn glyph's box (scene units): where its halo sits, where a compass opens. */
export function glyphCentre(glyph: Drawable): Vec2 {
  const b = contoursBox(glyph.path.contours);
  return [(b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2];
}
