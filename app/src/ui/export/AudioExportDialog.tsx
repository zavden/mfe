import { useState } from 'react';
import { AUDIO_EXPORT_SECONDS } from '../../audio';
import type { AudioExportFormat } from '../../export/audio';
import { sceneDuration } from '../../model';
import { useProjectStore } from '../../store';
import { Modal } from '../project/Modal';
import { floorToMs } from '../time';
import { mainPlayback } from '../transport/mainPlayback';
import { useAacSupport } from './useAacSupport';
import { useVideoExport } from './useVideoExport';
import './video-export.css';

/** Audio-only export has no geometry readiness, canvas settings or frame-rate dependency. */
export function AudioExportDialog({ onClose }: { onClose(): void }) {
  const project = useProjectStore((state) => state.project);
  const duration = sceneDuration(project);
  const [format, setFormat] = useState<AudioExportFormat>('wav');
  const [start, setStart] = useState(0);
  // The whole scene, to the millisecond of the field: a project written by another tool may end
  // at 4.4 + 2.2 = 6.6000000000000005.
  const [end, setEnd] = useState(() => floorToMs(duration));
  const exporter = useVideoExport();
  // M4A is AAC, and the app encodes AAC only with the browser's own encoder.
  const aac = useAacSupport();
  const seconds = end - start;
  const valid =
    [start, end].every(Number.isFinite) &&
    start >= 0 &&
    end <= duration &&
    seconds > 0 &&
    seconds <= AUDIO_EXPORT_SECONDS;
  const run = exporter.run;
  const begin = () => {
    if (!valid || exporter.running) return;
    mainPlayback.pause();
    void exporter.start({
      job: { encoder: 'audio', format },
      project,
      resolved: new Map(),
      values: {
        width: 0,
        height: 0,
        fps: 0,
        range: [start, end],
        seconds: Math.round(seconds * 48000) / 48000,
        frames: Math.round(seconds * 48000),
      },
    });
  };
  return (
    <Modal
      title="Export audio"
      testId="audio-export"
      onClose={onClose}
      closeOnBackdrop={!exporter.running}
      width="500px"
      footer={
        <>
          <button
            type="button"
            className="btn"
            data-testid="audio-export-dismiss"
            onClick={onClose}
          >
            {exporter.running && run.status !== 'committing' ? 'Close and cancel' : 'Close'}
          </button>
          {exporter.running ? (
            <button
              type="button"
              className="btn"
              data-testid="audio-export-cancel"
              disabled={run.status === 'committing'}
              onClick={exporter.cancel}
            >
              Cancel
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-primary"
              data-testid="audio-export-start"
              disabled={!valid}
              onClick={begin}
            >
              Export audio
            </button>
          )}
        </>
      }
    >
      <div className="audio-export-body">
        <fieldset className="audio-fields" disabled={exporter.running}>
          <label>
            Format
            <select
              data-testid="audio-export-format"
              value={format}
              onChange={(event) => setFormat(event.currentTarget.value as AudioExportFormat)}
            >
              <option value="wav">WAV · PCM 16-bit</option>
              <option value="webm">WebM · Opus</option>
              {aac && <option value="m4a">M4A · AAC</option>}
            </select>
          </label>
          <span className="audio-help">
            48 kHz stereo. Track mute and clip volume curves are included.
            {aac === false && (
              <span data-testid="audio-export-no-aac">
                {' '}
                M4A is not offered: it needs an AAC encoder, and this browser has none.
              </span>
            )}
          </span>
          <label>
            Start (s)
            <input
              type="number"
              data-testid="audio-export-from"
              min={0}
              max={duration}
              step={0.001}
              value={start}
              onChange={(event) => setStart(event.currentTarget.valueAsNumber)}
            />
          </label>
          <label>
            End (s)
            <input
              type="number"
              data-testid="audio-export-to"
              min={start}
              max={duration}
              step={0.001}
              value={end}
              onChange={(event) => setEnd(event.currentTarget.valueAsNumber)}
            />
          </label>
        </fieldset>
        {!valid && (
          <p role="status" className="audio-note">
            Choose a nonempty range within the project, up to 60 minutes.
          </p>
        )}
        {format === 'wav' && valid && (
          <p className="audio-help">
            Estimated size: {((seconds * 48000 * 4) / 1024 / 1024).toFixed(1)} MiB.
          </p>
        )}
        {run.status === 'running' && (
          <div role="status" data-testid="audio-export-progress" className="audio-run">
            <p>{run.label}</p>
            <progress max={run.total ?? 1} value={run.total ? run.frame : undefined} />
          </div>
        )}
        {run.status === 'committing' && (
          <p role="status" className="audio-note">
            Saving the completed audio file…
          </p>
        )}
        {run.status === 'done' && (
          <p role="status" data-testid="audio-export-done" className="audio-note audio-done">
            Saved {run.fileName} · {(run.size / 1024 / 1024).toFixed(2)} MiB
          </p>
        )}
        {run.status === 'cancelled' && (
          <p role="status" className="audio-note">
            Export cancelled.
          </p>
        )}
        {run.status === 'error' && (
          <p role="alert" data-testid="audio-export-error" className="audio-note audio-error">
            {run.message}
          </p>
        )}
      </div>
    </Modal>
  );
}
