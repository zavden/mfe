/* The locked region of the camera over the tracks (D190): under each move of the Camera row, a
 * hatched band across every track — while the camera moves, nothing else animates. A band an
 * animation runs into is in the danger colour: an error of the project (`camera-region`), which
 * the block, the relation or the clip it is of wears too. The region is not kept: it follows the
 * moves. The bands let every press through. */
import { useMemo } from 'react';
import { cameraRegionClashes, type Project } from '../../model';
import './cameraTimeline.css';

interface CameraRegionBandsProps {
  project: Project;
  pxPerSecond: number;
}

export function CameraRegionBands({ project, pxPerSecond: px }: CameraRegionBandsProps) {
  const clashing = useMemo(
    () => new Set(cameraRegionClashes(project).map((clash) => clash.move.id)),
    [project],
  );
  const moves = project.camera?.moves ?? [];
  if (moves.length === 0) return null;
  return (
    <div className="tl-camera-regions" aria-hidden="true">
      {moves.map((move) => (
        <div
          key={move.id}
          className={`tl-camera-region${clashing.has(move.id) ? ' is-clash' : ''}`}
          data-testid={`camera-region-${move.id}`}
          data-clash={clashing.has(move.id) || undefined}
          style={{ left: move.start * px, width: move.duration * px }}
        />
      ))}
    </div>
  );
}
