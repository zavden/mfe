// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Box } from '../../../geom';
import type { Drawable } from '../../../scene';
import { cursorRows, isCursorKey, stepCursor, type GlyphRef } from '../glyphCursor';

const drawable = (clipId: string, glyph: number, key = `${clipId}:${glyph}`): Drawable =>
  ({
    key,
    clipId,
    glyph,
    path: { contours: [] },
    fill: null,
    stroke: null,
    z: 0,
    role: 'object',
    partial: false,
  }) as Drawable;

const box = (top: number): Box => ({ minX: 0, minY: top - 1, maxX: 1, maxY: top });

const drawn = [
  drawable('b', 1),
  drawable('b', 0),
  drawable('a', 2),
  drawable('a', 0),
  drawable('a', 1),
  drawable('c', 0),
];
const boxes = new Map([
  ['a', box(2)],
  ['b', box(-1)],
  ['c', box(0)],
]);

describe('cursorRows', () => {
  it('one row per clip from the top of the screen down, the glyphs in canonical order', () => {
    const rows = cursorRows(drawn, boxes);
    expect(rows.map((row) => row.map((g) => g.key))).toEqual([
      ['a:0', 'a:1', 'a:2'],
      ['c:0'],
      ['b:0', 'b:1'],
    ]);
  });

  it('leaves out the excepted clip (the reference formula)', () => {
    expect(cursorRows(drawn, boxes, 'a').map((row) => row[0]!.clipId)).toEqual(['c', 'b']);
  });

  it('keys a glyph by its own drawable, else by its first piece; a clip without a box comes last', () => {
    const pieces = [drawable('m', 1, 'm:1~1'), drawable('m', 1, 'm:1~2'), drawable('m', 0, 'm:0')];
    const rows = cursorRows([...pieces, drawable('a', 0)], new Map([['a', box(0)]]));
    expect(rows.map((row) => row.map((g) => g.key))).toEqual([['a:0'], ['m:0', 'm:1~1']]);
    const own = cursorRows([drawable('m', 1, 'm:1~1'), drawable('m', 1)], new Map());
    expect(own[0]!.map((g) => g.key)).toEqual(['m:1']);
  });
});

describe('stepCursor', () => {
  const rows = cursorRows(drawn, boxes);
  const at = (key: string): GlyphRef => rows.flat().find((g) => g.key === key)!;

  it('starts at the first glyph of the first row, whatever the key', () => {
    expect(stepCursor(rows, null, 'ArrowDown')?.key).toBe('a:0');
    expect(stepCursor(rows, null, 'ArrowLeft')?.key).toBe('a:0');
    expect(stepCursor([], null, 'ArrowRight')).toBeNull();
  });

  it('walks a row with ←/→ and stops at its ends', () => {
    expect(stepCursor(rows, at('a:0'), 'ArrowRight')?.key).toBe('a:1');
    expect(stepCursor(rows, at('a:2'), 'ArrowRight')?.key).toBe('a:2');
    expect(stepCursor(rows, at('a:1'), 'ArrowLeft')?.key).toBe('a:0');
    expect(stepCursor(rows, at('a:0'), 'ArrowLeft')?.key).toBe('a:0');
  });

  it('changes row with ↑/↓, keeping the column within the new row', () => {
    expect(stepCursor(rows, at('a:2'), 'ArrowDown')?.key).toBe('c:0');
    expect(stepCursor(rows, at('c:0'), 'ArrowDown')?.key).toBe('b:0');
    expect(stepCursor(rows, at('b:1'), 'ArrowUp')?.key).toBe('c:0');
    expect(stepCursor(rows, at('b:1'), 'ArrowDown')?.key).toBe('b:1');
    expect(stepCursor(rows, at('a:1'), 'ArrowUp')?.key).toBe('a:1');
  });

  it('goes back to the first glyph when the cursor glyph left the screen', () => {
    const gone: GlyphRef = { clipId: 'z', glyph: 0, key: 'z:0' };
    expect(stepCursor(rows, gone, 'ArrowRight')?.key).toBe('a:0');
  });

  it('knows its keys', () => {
    expect(isCursorKey('ArrowUp')).toBe(true);
    expect(isCursorKey('Enter')).toBe(false);
  });
});
