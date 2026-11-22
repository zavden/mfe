/* The easing curve of a block (R2, D75): its rate function as a graph of progress over time,
 * with a point that follows the block's preview. */
import type { Easing, Target } from '../../model';
import { curvePath, curvePoint, curvePoints } from './easingCurve';

const WIDTH = 240;
const HEIGHT = 120;
const PAD = 8;

export function EasingCurve({
  easing,
  target,
  progress,
}: {
  easing: Easing;
  target: Target;
  /** How far through the block the preview is, 0 to 1. */
  progress: number;
}) {
  const path = curvePath(curvePoints(easing, target), WIDTH, HEIGHT, PAD);
  const at = curvePoint(easing, target, progress, WIDTH, HEIGHT, PAD);
  return (
    <figure className="easing-curve" data-testid="block-easing-curve" data-easing={easing}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={`Easing ${easing}: progress ${Math.round(at.value * 100)} % at ${Math.round(progress * 100)} % of the time`}
      >
        <rect
          className="easing-curve-box"
          x={PAD}
          y={PAD}
          width={WIDTH - 2 * PAD}
          height={HEIGHT - 2 * PAD}
        />
        <line
          className="easing-curve-diagonal"
          x1={PAD}
          y1={HEIGHT - PAD}
          x2={WIDTH - PAD}
          y2={PAD}
        />
        <path className="easing-curve-line" d={path} />
        <line className="easing-curve-cursor" x1={at.x} y1={PAD} x2={at.x} y2={HEIGHT - PAD} />
        <circle
          className="easing-curve-point"
          cx={at.x}
          cy={at.y}
          r="4"
          data-testid="block-easing-point"
          data-value={at.value.toFixed(3)}
        />
      </svg>
      <figcaption className="easing-curve-caption">
        <span>{easing}</span>
        <span data-testid="block-easing-readout">
          t {Math.round(progress * 100)} % → {Math.round(at.value * 100)} %
        </span>
      </figcaption>
    </figure>
  );
}
