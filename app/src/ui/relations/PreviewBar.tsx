/* The bar of a preview of the relation editor (D156, D157): play and pause, a bar to choose the
 * instant with the window of the transformation marked under it, the time and how far through
 * the transformation it is; then what the preview adds (its children: the key that ends it). */
import type { CSSProperties, ReactNode } from 'react';
import type { TimeSpan } from '../animations/blockPreview';
import '../animations/animations.css';
import { Icon } from '../timeline/icons';
import { windowBand, windowProgress } from './relationPreview';
import type { LoopClock } from './useLoopClock';
import './relations.css';

interface PreviewBarProps {
  clock: LoopClock;
  span: TimeSpan;
  window: TimeSpan;
  /** Prefix of its test ids: `<testId>-play`, `-scrub`, `-time`, `-progress`. */
  testId: string;
  children?: ReactNode;
}

export function PreviewBar({ clock, span, window, testId, children }: PreviewBarProps) {
  const { playing, setPlaying, shown, moveTo } = clock;
  const progress = windowProgress(shown, window);
  const band = windowBand(span, window);
  return (
    <div className="block-preview-bar rel-preview-bar">
      <button
        type="button"
        className="an-small-button block-preview-play"
        data-testid={`${testId}-play`}
        aria-label="Play the transformation"
        aria-pressed={playing}
        title={playing ? 'Pause' : 'Play the transformation in a loop'}
        onClick={() => setPlaying(!playing)}
      >
        <Icon name={playing ? 'pause' : 'play'} />
      </button>
      {/* The bar of the loop; the band under it is the window of the transformation. */}
      <span
        className="rel-preview-track"
        style={
          {
            '--window-from': `${(band.from * 100).toFixed(3)}%`,
            '--window-to': `${(band.to * 100).toFixed(3)}%`,
          } as CSSProperties
        }
      >
        <input
          type="range"
          className="block-preview-scrub"
          data-testid={`${testId}-scrub`}
          aria-label="Time in the transformation"
          aria-valuetext={`${shown.toFixed(2)} seconds, ${Math.round(progress * 100)}% transformed`}
          title="Choose the instant; the band marks the transformation"
          min={span.start}
          max={span.end}
          step={0.01}
          value={shown}
          onPointerDown={() => setPlaying(false)}
          onChange={(e) => {
            setPlaying(false);
            moveTo(Number(e.target.value));
          }}
        />
      </span>
      <span className="block-preview-time" data-testid={`${testId}-time`}>
        {shown.toFixed(2)} s
      </span>
      <span className="rel-preview-progress" data-testid={`${testId}-progress`}>
        {Math.round(progress * 100)}%
      </span>
      {children}
    </div>
  );
}
