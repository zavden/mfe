import { useEffect, useMemo, useState } from 'react';
import { waveformBand, type AudioWaveform as Summary } from '../../audio';
import type { AudioAsset } from '../../model';
import { acquireWaveform, useAudioMediaRevision } from './audioRuntime';

export function AudioWaveform({
  asset,
  start,
  end,
  width,
  height,
  missing = false,
}: {
  asset: AudioAsset | undefined;
  start: number;
  end: number;
  width: number;
  height: number;
  /** The recording has no original: there is nothing to draw, and nothing to wait for. */
  missing?: boolean;
}) {
  const revision = useAudioMediaRevision((state) => state.revision);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!asset || missing) return;
    let live = true;
    const request = acquireWaveform(asset);
    void request.result.then(
      (value) => {
        if (live) setSummary(value);
      },
      () => {
        if (live) setError(true);
      },
    );
    return () => {
      live = false;
      request.release();
    };
  }, [asset, revision, missing]);
  const path = useMemo(() => {
    if (missing || !summary || !asset || summary.contentHash !== asset.contentHash) return '';
    const bins = waveformBand(summary, start, end, Math.min(4096, width));
    const scale = width / Math.max(1, bins.min.length);
    const middle = height / 2;
    let path = '';
    for (let i = 0; i < bins.min.length; i++) {
      const x = (i * scale).toFixed(1);
      path += `M${x},${(middle - bins.max[i]! * middle * 0.8).toFixed(1)}V${(middle - bins.min[i]! * middle * 0.8).toFixed(1)}`;
    }
    return path;
  }, [summary, asset, start, end, width, height, missing]);
  // The clip itself says that its media is missing.
  if (missing) return null;
  return (
    <g className="tl-audio-waveform" aria-hidden="true">
      {path ? (
        <path d={path} />
      ) : (
        <text x={10} y={height / 2}>
          {error ? 'Waveform unavailable' : 'Preparing waveform…'}
        </text>
      )}
    </g>
  );
}
