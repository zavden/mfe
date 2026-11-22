/* The height of the tracks, in the corner over their headers: lower, taller, and between the two
 * the zoom as a percentage, a key that puts every track back to the standard height (the tracks
 * resized by hand too). `rowSizes.ts` has the range and the steps. */
import { keepFocus } from '../focus';
import { Icon } from './icons';
import {
  isStandard,
  MAX_ROW_ZOOM,
  MIN_ROW_ZOOM,
  STANDARD_SIZES,
  steppedZoom,
  withZoom,
  type RowSizes,
} from './rowSizes';

interface RowZoomControlsProps {
  sizes: RowSizes;
  onChange(sizes: RowSizes): void;
}

export function RowZoomControls({ sizes, onChange }: RowZoomControlsProps) {
  const percent = Math.round(sizes.zoom * 100);
  const step = (steps: number) => onChange(withZoom(sizes, steppedZoom(sizes.zoom, steps)));
  return (
    <div className="tl-row-zoom" role="group" aria-label="Track height">
      <button
        type="button"
        className="tl-icon-button"
        data-testid="timeline-row-zoom-out"
        aria-label="Lower tracks"
        title="Lower tracks"
        disabled={sizes.zoom <= MIN_ROW_ZOOM}
        onMouseDown={keepFocus}
        onClick={() => step(-1)}
      >
        <Icon name="minus" />
      </button>
      <button
        type="button"
        className="tl-row-zoom-value"
        data-testid="timeline-row-zoom-reset"
        aria-label={`Track height ${percent} %: back to the standard height`}
        title={
          isStandard(sizes)
            ? 'Track height (the standard one)'
            : 'Back to the standard height, for every track'
        }
        disabled={isStandard(sizes)}
        onMouseDown={keepFocus}
        onClick={() => onChange(STANDARD_SIZES)}
      >
        {percent} %
      </button>
      <button
        type="button"
        className="tl-icon-button"
        data-testid="timeline-row-zoom-in"
        aria-label="Taller tracks"
        title="Taller tracks"
        disabled={sizes.zoom >= MAX_ROW_ZOOM}
        onMouseDown={keepFocus}
        onClick={() => step(1)}
      >
        <Icon name="plus" />
      </button>
    </div>
  );
}
