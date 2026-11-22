/* The vertical scale of a clip's volume curve. A gain goes from 0 to 400%, but what is edited
 * most lies between silence and the original level: fades, a voice over music. That part gets
 * the lower half of the graph, and the amplification above 100% the upper half. Each half is
 * linear, so a segment of the curve (linear in gain) is still drawn with straight lines, with a
 * corner where it crosses 100%. */
import { MAX_AUDIO_GAIN } from '../../model';

export const VOLUME_GRAPH_HEIGHT = 68;
/** Room above 400% and below 0%, for the handles of the points there. */
const PAD = 4;

const unityY = (height: number) => height / 2;

/** The height in the graph (px from its top) of a gain. */
export function volumeY(gain: number, height = VOLUME_GRAPH_HEIGHT): number {
  const middle = unityY(height);
  return gain <= 1
    ? middle + (1 - gain) * (height - PAD - middle)
    : middle - ((gain - 1) / (MAX_AUDIO_GAIN - 1)) * (middle - PAD);
}

/** The gain at a height of the graph: the inverse of `volumeY`, kept within 0 and 400%. */
export function volumeAt(y: number, height = VOLUME_GRAPH_HEIGHT): number {
  const middle = unityY(height);
  const gain =
    y >= middle
      ? 1 - (y - middle) / (height - PAD - middle)
      : 1 + ((middle - y) / (middle - PAD)) * (MAX_AUDIO_GAIN - 1);
  return Math.max(0, Math.min(MAX_AUDIO_GAIN, gain));
}

/** The vertices of the curve through `points` (x in px, in order). */
export function volumeLine(
  points: readonly { x: number; gain: number }[],
  height = VOLUME_GRAPH_HEIGHT,
): [number, number][] {
  const line: [number, number][] = [];
  points.forEach((point, index) => {
    const previous = points[index - 1];
    if (previous && (previous.gain - 1) * (point.gain - 1) < 0) {
      const t = (1 - previous.gain) / (point.gain - previous.gain);
      line.push([previous.x + t * (point.x - previous.x), volumeY(1, height)]);
    }
    line.push([point.x, volumeY(point.gain, height)]);
  });
  return line;
}
