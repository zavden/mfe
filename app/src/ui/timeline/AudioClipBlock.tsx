import { useRef, type PointerEvent as ReactPointerEvent } from 'react';
import {
  audioGainAt,
  audioSourceTime,
  deleteAudioVolumePoint,
  insertAudioVolumePoint,
  setAudioClipGain,
  shiftAudioVolumeSegment,
  updateAudioVolumePoint,
  type AudioAsset,
  type AudioClip,
  type Track,
} from '../../model';
import { useProjectStore, useUiStore } from '../../store';
import { trackProjectPointer } from '../project/trackProjectPointer';
import { audioEditable, editAudioClip } from './audioCommands';
import type { Stretch } from './ruler';
import './audioTimeline.css';
import { AudioWaveform } from '../audio/AudioWaveform';
import { Icon } from './icons';
import { useOriginalAvailable } from '../audio/missingMedia';
import { VOLUME_GRAPH_HEIGHT as GRAPH_HEIGHT, volumeAt, volumeLine, volumeY } from './volumeScale';
import { across, along, arrowOf, boxOf } from './axis';
import { isMainClick } from '../pointer';

export interface AudioClipBlockProps {
  clip: AudioClip;
  asset: AudioAsset | undefined;
  track: Track;
  px: number;
  band: Stretch;
  selected: boolean;
  tabIndex: number;
  /** The volume line is edited on the clip: its segments and points are drag handles and a
   * double-click adds a point, so only the caption moves the clip. Otherwise the line is a
   * drawing and the whole clip moves it. */
  lineEditable: boolean;
  onToggleLine(clip: AudioClip): void;
  /** Height of the graph, px: what the track's height leaves under the caption (the standard
   * one when not given). The volume scale stretches over it. */
  graphHeight?: number;
  onMove(event: ReactPointerEvent, clip: AudioClip): void;
  /** Press on an edge: trim the clip, or the selected clips with it (`startTrim`). */
  onTrim(
    event: ReactPointerEvent,
    clip: AudioClip,
    edge: 'start' | 'end',
    threshold?: number,
  ): void;
  onEdit(clip: AudioClip): void;
  onMenu(clip: AudioClip, x: number, y: number): void;
}

/** A viewport-sized graph inside a potentially hour-long clip. Source points remain in the
 * model when outside this viewport or hidden by a trim. */
export function AudioClipBlock({
  clip,
  asset,
  track,
  px,
  band,
  selected,
  tabIndex,
  lineEditable,
  onToggleLine,
  graphHeight = GRAPH_HEIGHT,
  onMove,
  onTrim,
  onEdit,
  onMenu,
}: AudioClipBlockProps) {
  const graph = useRef<SVGSVGElement>(null);
  // The clip keeps its place and its edits; it is silent until its original is back.
  const missing = useOriginalAvailable(asset) === false;
  const start = Math.min(clip.end, Math.max(clip.start, band.from));
  const end = Math.max(start, Math.min(clip.end, band.to, start + 8192 / px));
  const width = Math.max(1, (end - start) * px);
  const sourceStart = audioSourceTime(clip, start);
  const sourceEnd = audioSourceTime(clip, end);
  const points = clip.volume.filter(
    (point) => point.time >= sourceStart && point.time <= sourceEnd,
  );
  // 100% sits at mid-height (`volumeScale.ts`): the line gets a corner where it crosses it.
  const line = volumeLine(
    [
      { time: sourceStart, gain: audioGainAt(clip.volume, sourceStart) },
      ...points,
      { time: sourceEnd, gain: audioGainAt(clip.volume, sourceEnd) },
    ].map((point) => ({ x: (point.time - sourceStart) * px, gain: point.gain })),
    graphHeight,
  )
    .map(([x, y]) => `${x},${y}`)
    .join(' ');

  // A trim is the timeline's (`startTrim`): with several clips selected it moves them all.
  const trim = (event: ReactPointerEvent, edge: 'start' | 'end') => {
    if (!isMainClick(event)) return;
    // A sound without its recording, or one the project has replaced since this was drawn.
    if (
      !asset ||
      useProjectStore.getState().project.audioClips.find((item) => item.id === clip.id) !== clip
    ) {
      event.stopPropagation();
      event.preventDefault();
      return;
    }
    onTrim(event, clip, edge, 2);
  };

  const movePoint = (event: ReactPointerEvent, id: string) => {
    if (!isMainClick(event)) return;
    event.stopPropagation();
    event.preventDefault();
    (event.currentTarget as SVGElement).focus();
    const point = clip.volume.find((item) => item.id === id);
    if (!point || !asset || track.locked) return;
    const x = along(event);
    const y = across(event);
    let started = false;
    useUiStore.getState().select({ kind: 'clips', ids: [clip.id] });
    trackProjectPointer(
      event,
      {
        move: (next, begin) => {
          if (
            !started &&
            useProjectStore.getState().project.audioClips.find((item) => item.id === clip.id) !==
              clip
          )
            return;
          if (!started && Math.hypot(along(next) - x, across(next) - y) < 2) return;
          started = true;
          const time = Math.max(
            clip.sourceStart,
            Math.min(audioSourceTime(clip, clip.end), point.time + (along(next) - x) / px),
          );
          // The point follows the pointer on the scale of the graph.
          const gain = volumeAt(volumeY(point.gain, graphHeight) + across(next) - y, graphHeight);
          begin().update((draft) => {
            const target = draft.audioClips.find((item) => item.id === clip.id);
            if (target && audioEditable(draft, target))
              target.volume = updateAudioVolumePoint(
                clip.volume,
                id,
                { time, gain },
                asset.duration,
              );
          });
        },
      },
      graph.current,
    );
  };

  const moveLine = (event: ReactPointerEvent) => {
    if (!isMainClick(event) || track.locked) return;
    event.stopPropagation();
    event.preventDefault();
    const baseline = clip.volume.length ? clip : setAudioClipGain(clip, 1);
    const at = Math.max(
      clip.sourceStart,
      Math.min(
        audioSourceTime(clip, clip.end),
        sourceStart +
          (along(event) - (graph.current ? boxOf(graph.current).left : along(event))) / px,
      ),
    );
    const y = across(event);
    // The segment moves by what the place that was grabbed moves on the scale of the graph.
    const grabbed = audioGainAt(baseline.volume, at);
    useUiStore.getState().select({ kind: 'clips', ids: [clip.id] });
    let started = false;
    trackProjectPointer(
      event,
      {
        move: (next, begin) => {
          if (
            !started &&
            useProjectStore.getState().project.audioClips.find((item) => item.id === clip.id) !==
              clip
          )
            return;
          if (!started && Math.abs(across(next) - y) < 2) return;
          started = true;
          const delta =
            volumeAt(volumeY(grabbed, graphHeight) + across(next) - y, graphHeight) - grabbed;
          begin().update((draft) => {
            const target = draft.audioClips.find((item) => item.id === clip.id);
            if (target && audioEditable(draft, target))
              target.volume = shiftAudioVolumeSegment(baseline, at, delta).volume;
          });
        },
      },
      graph.current,
    );
  };

  return (
    <div
      className={`tl-clip tl-audio-clip${selected ? ' is-selected' : ''}${track.muted ? ' is-muted' : ''}${missing ? ' is-missing' : ''}`}
      role="gridcell"
      tabIndex={tabIndex}
      data-clip-id={clip.id}
      data-testid={`audio-clip-${clip.id}`}
      aria-label={`${asset?.name ?? 'Missing audio'}, ${clip.start.toFixed(2)} to ${clip.end.toFixed(2)} seconds${track.locked ? ', locked' : ''}${track.muted ? ', muted' : ''}${missing ? ', missing media' : ''}`}
      aria-selected={selected}
      style={{ left: clip.start * px, width: Math.max(2, (clip.end - clip.start) * px) }}
      onPointerDown={(event) => onMove(event, clip)}
      onDoubleClick={() => onEdit(clip)}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onMenu(clip, event.clientX, event.clientY);
      }}
    >
      <div
        className="tl-audio-caption"
        style={{ left: (start - clip.start) * px, maxWidth: width }}
      >
        <span>♪ {asset?.name ?? 'Missing audio'}</span>
        {missing && (
          <em
            className="tl-audio-missing"
            data-testid={`audio-missing-${clip.id}`}
            title={`The browser does not hold the original audio. Import “${asset?.originalName ?? asset?.name}” again in the Audio tab to restore it.`}
          >
            missing media
          </em>
        )}
        <button
          type="button"
          className="btn btn-small"
          data-testid={`audio-edit-${clip.id}`}
          // Named by its text, as a voice command would say it; what it opens is its tooltip.
          title="Edit the audio clip: its trim, its volume and its fades"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onEdit(clip);
          }}
        >
          Volume…
        </button>
        <button
          type="button"
          className={`btn btn-small tl-audio-line-toggle${lineEditable ? ' is-on' : ''}`}
          data-testid={`audio-line-${clip.id}`}
          aria-label="Edit the volume line on the clip"
          aria-pressed={lineEditable}
          title={
            lineEditable
              ? 'Editing the volume line: drag it or its points, double-click to add a point. Click to stop: the whole clip moves it again'
              : 'Edit the volume line on the clip (meanwhile the clip moves by its name)'
          }
          disabled={track.locked}
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            onToggleLine(clip);
          }}
        >
          <Icon name="volume-line" />
        </button>
      </div>
      <svg
        ref={graph}
        className={`tl-audio-graph${lineEditable ? ' is-editable' : ''}`}
        width={width}
        height={graphHeight}
        style={{ left: (start - clip.start) * px }}
        data-testid={`audio-curve-${clip.id}`}
        aria-label={
          lineEditable
            ? 'Volume curve, 0 to 400 percent. Double-click to add a point; drag a segment vertically to change its volume.'
            : 'Volume curve, 0 to 400 percent. The button beside “Volume…” makes it editable here.'
        }
        // While the line is edited the graph is the line's: a press that misses it moves nothing.
        onPointerDown={lineEditable ? (event) => event.stopPropagation() : undefined}
        onDoubleClick={(event) => {
          // A drawing only: the double-click is the clip's, which opens its editor.
          if (!lineEditable) return;
          event.stopPropagation();
          const time = Math.max(
            clip.sourceStart,
            Math.min(
              audioSourceTime(clip, clip.end),
              sourceStart + (along(event) - boxOf(event.currentTarget).left) / px,
            ),
          );
          editAudioClip(clip.id, (target) => {
            target.volume = insertAudioVolumePoint(target.volume, time);
          });
          useUiStore.getState().select({ kind: 'clips', ids: [clip.id] });
        }}
      >
        <AudioWaveform
          asset={asset}
          start={sourceStart}
          end={sourceEnd}
          width={width}
          height={graphHeight}
          missing={missing}
        />
        {lineEditable && width >= 85 && (
          <g
            className="tl-audio-scale"
            aria-hidden="true"
            data-testid={`audio-volume-scale-${clip.id}`}
          >
            <text x={8} y={11}>
              400%
            </text>
            <text x={8} y={volumeY(1, graphHeight) - 4}>
              100%
            </text>
            <text x={8} y={graphHeight - 2}>
              0%
            </text>
          </g>
        )}
        {lineEditable && (
          <>
            <line
              x1={0}
              x2={width}
              y1={volumeY(1, graphHeight)}
              y2={volumeY(1, graphHeight)}
              className="tl-audio-unity"
            />
            <polyline
              points={line}
              className="tl-audio-envelope-hit"
              data-testid={`audio-volume-line-${clip.id}`}
              onPointerDown={moveLine}
            />
          </>
        )}
        <polyline points={line} className="tl-audio-envelope" style={{ pointerEvents: 'none' }} />
        {!lineEditable &&
          points.map((point) => (
            <circle
              key={point.id}
              className="tl-audio-dot"
              cx={(point.time - sourceStart) * px}
              cy={volumeY(point.gain, graphHeight)}
              r={2.5}
            />
          ))}
        {lineEditable &&
          points.map((point) => (
            <circle
              key={point.id}
              cx={(point.time - sourceStart) * px}
              cy={volumeY(point.gain, graphHeight)}
              r={5}
              tabIndex={selected && !track.locked ? 0 : -1}
              role="slider"
              aria-orientation="vertical"
              aria-label={`Volume point at ${(point.time - clip.sourceStart).toFixed(2)} seconds`}
              aria-valuemin={0}
              aria-valuemax={400}
              aria-valuenow={Math.round(point.gain * 100)}
              aria-valuetext={`${Math.round(point.gain * 100)} percent`}
              data-testid={`audio-point-${point.id}`}
              onPointerDown={(event) => movePoint(event, point.id)}
              onDoubleClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (track.locked) return;
                if (event.key === 'Delete' || event.key === 'Backspace') {
                  event.preventDefault();
                  event.stopPropagation();
                  editAudioClip(clip.id, (target) => {
                    target.volume = deleteAudioVolumePoint(target.volume, point.id);
                  });
                } else if (event.key.startsWith('Arrow')) {
                  event.preventDefault();
                  event.stopPropagation();
                  const step = event.shiftKey ? 0.1 : 0.01;
                  const key = arrowOf(event.key);
                  // A step from where the point is when the edit is applied: the point keeps the
                  // focus while it is dragged, so the key can come during that drag, which the edit
                  // gives up, and what is drawn here is then what the drag shows.
                  editAudioClip(clip.id, (target) => {
                    const now = target.volume.find((item) => item.id === point.id);
                    if (!now) return;
                    target.volume = updateAudioVolumePoint(
                      target.volume,
                      point.id,
                      key === 'ArrowUp' || key === 'ArrowDown'
                        ? { gain: now.gain + (key === 'ArrowUp' ? step : -step) }
                        : {
                            time: Math.max(
                              target.sourceStart,
                              Math.min(
                                audioSourceTime(target, target.end),
                                now.time + (key === 'ArrowRight' ? step : -step),
                              ),
                            ),
                          },
                      asset?.duration,
                    );
                  });
                } else if (event.key === 'Enter') {
                  event.preventDefault();
                  event.stopPropagation();
                  onEdit(clip);
                }
              }}
            >
              <title>
                {(point.time - clip.sourceStart).toFixed(3)} s · {Math.round(point.gain * 100)}%
              </title>
            </circle>
          ))}
      </svg>
      <div
        className="tl-audio-trim start"
        data-testid={`audio-trim-start-${clip.id}`}
        onPointerDown={(event) => trim(event, 'start')}
      />
      <div
        className="tl-audio-trim end"
        data-testid={`audio-trim-end-${clip.id}`}
        onPointerDown={(event) => trim(event, 'end')}
      />
    </div>
  );
}
