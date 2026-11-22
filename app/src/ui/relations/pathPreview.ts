/* The curve a pair's glyphs follow, for a small preview: its custom path, else the holder's arc,
 * else the chord — as points of the chord's frame (u along the chord from 0 to 1, v across it,
 * positive to the left of the travel: up when the chord runs right), as the preview plays them
 * (Manim's positive arc turns counter-clockwise, so it swings under a chord that runs right).
 * Pure. */
import { arcLengths, interpolatePoints, isStraightSpline, pointAtFraction } from '../../geom';
import type { GlyphPair } from '../../model';

export function pathPreviewPoints(
  pair: Pick<GlyphPair, 'path'>,
  pathArc: number,
  steps = 32,
): [number, number][] {
  const chord: [number, number][] = [
    [0, 0],
    [1, 0],
  ];
  if (pair.path) {
    if (isStraightSpline(pair.path)) return chord;
    const table = arcLengths(pair.path);
    return Array.from({ length: steps + 1 }, (_, i) => {
      const [u, v] = pointAtFraction(pair.path!, table, i / steps);
      return [u, v];
    });
  }
  if (pathArc === 0) return chord;
  const start = Float64Array.of(0, 0);
  const end = Float64Array.of(1, 0);
  const radians = (pathArc * Math.PI) / 180;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const p = interpolatePoints(start, end, i / steps, radians);
    return [p[0]!, p[1]!];
  });
}
