import { useState } from 'react';
import {
  audioGainAt,
  audioSourceEnd,
  defaultAudioFadeDuration,
  deleteAudioVolumePoint,
  insertAudioVolumePoint,
  setAudioClipGain,
  trimAudioClip,
  updateAudioVolumePoint,
} from '../../model';
import { useProjectStore } from '../../store';
import { Modal } from '../project/Modal';
import { audioEditable, editAudioClip, fadeAudioClip } from './audioCommands';
import { trackGaps } from './clipOps';

/** Numeric counterpart of the timeline curve, also reachable with Enter from its grid cell. */
export function AudioClipEditor({ clipId, onClose }: { clipId: string; onClose(): void }) {
  const project = useProjectStore((state) => state.project);
  const clip = project.audioClips.find((candidate) => candidate.id === clipId);
  const asset = project.audioAssets.find((candidate) => candidate.id === clip?.assetId);
  // An untouched default follows trims; a duration the user types remains their explicit edit.
  const [fadeDuration, setFadeDuration] = useState<number | null>(null);
  const [newPointTime, setNewPointTime] = useState<number | null>(null);
  if (!clip || !asset) return null;
  const disabled = !audioEditable(project, clip);
  const fade = fadeDuration ?? defaultAudioFadeDuration(clip);
  const pointTime = newPointTime ?? clip.sourceStart;
  const pointTimeValid =
    Number.isFinite(pointTime) && pointTime >= 0 && pointTime <= asset.duration;
  const addPoint = () => {
    if (disabled || !pointTimeValid) return;
    editAudioClip(clipId, (target) => {
      target.volume = insertAudioVolumePoint(target.volume, pointTime);
    });
  };
  const trim = (edge: 'start' | 'end', sourceTime: number) =>
    editAudioClip(clipId, (target, draft) => {
      const gap = trackGaps(draft, target.trackId, new Set([target.id])).find(
        (item) => item.start <= target.start + 1e-6 && item.end >= target.end - 1e-6,
      );
      Object.assign(
        target,
        trimAudioClip(
          target,
          edge,
          target.start + sourceTime - target.sourceStart,
          asset.duration,
          {
            minStart: gap?.start ?? 0,
            maxEnd: Math.min(3600, gap?.end ?? Infinity),
            sampleRate: asset.sampleRate,
          },
        ),
      );
    });
  return (
    <Modal
      title={`Audio · ${asset.name}`}
      testId="audio-editor"
      onClose={onClose}
      width="560px"
      allowHistory
      footer={
        <button type="button" className="btn" data-testid="audio-editor-done" onClick={onClose}>
          Done
        </button>
      }
    >
      <p className="audio-help">
        Changes are applied live and can be undone. Trim preserves the original recording and hidden
        volume points.
      </p>
      {disabled && <p role="status">This track is locked. Unlock it to edit audio.</p>}
      <fieldset disabled={disabled} className="audio-fields">
        <label>
          Source start (s)
          <input
            type="number"
            data-testid="audio-source-start"
            min={0}
            max={audioSourceEnd(clip)}
            step={0.01}
            value={+clip.sourceStart.toFixed(6)}
            onChange={(event) => trim('start', event.currentTarget.valueAsNumber)}
          />
        </label>
        <label>
          Source end (s)
          <input
            type="number"
            data-testid="audio-source-end"
            min={clip.sourceStart}
            max={asset.duration}
            step={0.01}
            value={+audioSourceEnd(clip).toFixed(6)}
            onChange={(event) => trim('end', event.currentTarget.valueAsNumber)}
          />
        </label>
        <label>
          Constant volume (%)
          <input
            type="number"
            data-testid="audio-constant-gain"
            min={0}
            max={400}
            step={1}
            placeholder="Automated"
            value={
              clip.volume.length > 1
                ? ''
                : Math.round(audioGainAt(clip.volume, clip.sourceStart) * 100)
            }
            onChange={(event) =>
              editAudioClip(clipId, (target) =>
                Object.assign(
                  target,
                  setAudioClipGain(target, event.currentTarget.valueAsNumber / 100),
                ),
              )
            }
          />
        </label>
        <label>
          Fade duration (s)
          <input
            type="number"
            data-testid="audio-fade-duration"
            min={0}
            max={clip.end - clip.start}
            step="any"
            value={Number.isFinite(fade) ? +fade.toFixed(6) : ''}
            onChange={(event) => setFadeDuration(event.currentTarget.valueAsNumber)}
          />
        </label>
      </fieldset>
      <div className="audio-editor-actions">
        <button
          type="button"
          className="btn"
          data-testid="audio-fade-in"
          disabled={disabled || !Number.isFinite(fade) || fade <= 0}
          onClick={() => fadeAudioClip(clipId, 'in', fade)}
        >
          Fade In
        </button>
        <button
          type="button"
          className="btn"
          data-testid="audio-fade-out"
          disabled={disabled || !Number.isFinite(fade) || fade <= 0}
          onClick={() => fadeAudioClip(clipId, 'out', fade)}
        >
          Fade Out
        </button>
        <button
          type="button"
          className="btn"
          data-testid="audio-reset-volume"
          disabled={disabled}
          onClick={() =>
            editAudioClip(clipId, (target) => {
              target.volume = [];
            })
          }
        >
          Reset volume
        </button>
      </div>
      <p className="audio-help">
        Constant volume replaces the curve. Fade commands edit its points at the current trimmed
        edges. 100% is the original amplitude; amplification may clip when mixed.
      </p>
      <fieldset disabled={disabled} className="audio-fields">
        <label>
          New point source time (s)
          <input
            type="number"
            data-testid="audio-add-point-time"
            min={0}
            max={asset.duration}
            step="any"
            value={Number.isFinite(pointTime) ? pointTime : ''}
            onChange={(event) => setNewPointTime(event.currentTarget.valueAsNumber)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              event.stopPropagation();
              addPoint();
            }}
          />
        </label>
        <div className="audio-editor-actions">
          <button
            type="button"
            className="btn"
            data-testid="audio-add-point"
            disabled={!pointTimeValid}
            onClick={addPoint}
          >
            Add point
          </button>
        </div>
      </fieldset>
      <p className="audio-help">
        New points use the current curve level and leave the sound unchanged.
      </p>
      <table className="audio-points">
        <thead>
          <tr>
            <th>Source time (s)</th>
            <th>Volume (%)</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {clip.volume.map((point) => (
            <tr key={point.id}>
              <td>
                <input
                  type="number"
                  disabled={disabled}
                  min={0}
                  max={asset.duration}
                  step={0.01}
                  aria-label="Point source time"
                  data-testid={`audio-point-time-${point.id}`}
                  value={+point.time.toFixed(6)}
                  onChange={(event) =>
                    editAudioClip(clipId, (target) => {
                      target.volume = updateAudioVolumePoint(
                        target.volume,
                        point.id,
                        { time: event.currentTarget.valueAsNumber },
                        asset.duration,
                      );
                    })
                  }
                />
              </td>
              <td>
                <input
                  type="number"
                  disabled={disabled}
                  min={0}
                  max={400}
                  step={1}
                  aria-label="Point volume"
                  data-testid={`audio-point-gain-${point.id}`}
                  value={Math.round(point.gain * 100)}
                  onChange={(event) =>
                    editAudioClip(clipId, (target) => {
                      target.volume = updateAudioVolumePoint(
                        target.volume,
                        point.id,
                        { gain: event.currentTarget.valueAsNumber / 100 },
                        asset.duration,
                      );
                    })
                  }
                />
              </td>
              <td>
                <button
                  type="button"
                  className="btn"
                  disabled={disabled}
                  aria-label="Delete volume point"
                  data-testid={`audio-point-delete-${point.id}`}
                  onClick={() =>
                    editAudioClip(clipId, (target) => {
                      target.volume = deleteAudioVolumePoint(target.volume, point.id);
                    })
                  }
                >
                  ×
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {clip.volume.length === 0 && (
        <p className="audio-help">
          Volume is constant at 100%. Add a point above or double-click the timeline curve.
        </p>
      )}
    </Modal>
  );
}
