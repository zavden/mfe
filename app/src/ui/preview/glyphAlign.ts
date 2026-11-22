/* Align by symbol: the shift that puts one glyph's edge, corner or centre on another glyph's.
 * The nine directions are Manim's (UL, UP, UR, LEFT, ORIGIN, RIGHT, DL, DOWN, DR), laid out as
 * the compass the preview shows: a side moves one axis, a corner or the centre both. Pure. */
import type { Box } from '../../geom';
import { round6 } from '../time';

export type Direction = 'UL' | 'UP' | 'UR' | 'LEFT' | 'CENTER' | 'RIGHT' | 'DL' | 'DOWN' | 'DR';

/** Row by row, as the compass draws them. */
export const DIRECTIONS: readonly Direction[] = [
  'UL',
  'UP',
  'UR',
  'LEFT',
  'CENTER',
  'RIGHT',
  'DL',
  'DOWN',
  'DR',
];

export const DIRECTION_LABELS: Record<Direction, string> = {
  UL: 'Upper left corner',
  UP: 'Top edge',
  UR: 'Upper right corner',
  LEFT: 'Left edge',
  CENTER: 'Centre',
  RIGHT: 'Right edge',
  DL: 'Lower left corner',
  DOWN: 'Bottom edge',
  DR: 'Lower right corner',
};

/** The arrow the compass shows for a direction. */
export const DIRECTION_ARROWS: Record<Direction, string> = {
  UL: '↖',
  UP: '↑',
  UR: '↗',
  LEFT: '←',
  CENTER: '•',
  RIGHT: '→',
  DL: '↙',
  DOWN: '↓',
  DR: '↘',
};

/** The x (-1 left, 0 centre, 1 right) and y (-1 bottom, 0 centre, 1 top) a direction names;
 * null on an axis the direction leaves alone. */
function axes(direction: Direction): [x: -1 | 0 | 1 | null, y: -1 | 0 | 1 | null] {
  switch (direction) {
    case 'UL':
      return [-1, 1];
    case 'UP':
      return [null, 1];
    case 'UR':
      return [1, 1];
    case 'LEFT':
      return [-1, null];
    case 'CENTER':
      return [0, 0];
    case 'RIGHT':
      return [1, null];
    case 'DL':
      return [-1, -1];
    case 'DOWN':
      return [null, -1];
    case 'DR':
      return [1, -1];
  }
}

const edgeX = (box: Box, side: -1 | 0 | 1) =>
  side < 0 ? box.minX : side > 0 ? box.maxX : (box.minX + box.maxX) / 2;
const edgeY = (box: Box, side: -1 | 0 | 1) =>
  side < 0 ? box.minY : side > 0 ? box.maxY : (box.minY + box.maxY) / 2;

/** How far `target` (a glyph's box) must move for its `direction` point to land on
 * `reference`'s: x only for LEFT and RIGHT, y only for UP and DOWN, both otherwise. */
export function glyphAlignDelta(
  reference: Box,
  target: Box,
  direction: Direction,
): [number, number] {
  const [x, y] = axes(direction);
  return [
    x === null ? 0 : round6(edgeX(reference, x) - edgeX(target, x)),
    y === null ? 0 : round6(edgeY(reference, y) - edgeY(target, y)),
  ];
}
