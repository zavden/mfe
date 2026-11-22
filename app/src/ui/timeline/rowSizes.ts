/* How tall the tracks are drawn: a vertical zoom for all of them, and for a track resized by hand
 * a factor of its own on top of it. A view state (the timeline store keeps it, no file does),
 * like the horizontal zoom. The scale of a track is what its lanes are multiplied by: every
 * rectangle of the track (its clips, their blocks and relation windows, an audio clip's graph)
 * follows from the height of a lane, which `trackLayout.ts` gives per row. The standard height
 * is the smallest: a track's header needs its two lines. A track gets a height of its own from
 * the two keys beside its name, or from a drag of an edge of its header. Pure. */
import type { TrackId } from '../../model';
import { CLIP_INSET, LANE_HEIGHT } from './layout';

/** The standard height of an audio track (its caption, and the graph of its volume). */
export const AUDIO_ROW_HEIGHT = 112;
/** What of an audio track's height is not its graph: the space over and under the clip, its
 * caption and the room under the graph. The graph has the rest (68 px at the standard height,
 * `VOLUME_GRAPH_HEIGHT`). */
export const AUDIO_ROW_CHROME = 44;

export interface RowSizes {
  /** The vertical zoom of every track: 1 is the standard height. */
  zoom: number;
  /** What a track resized by hand multiplies the zoom by (a track not in it: 1). */
  tracks: ReadonlyMap<TrackId, number>;
}

export const STANDARD_SIZES: RowSizes = { zoom: 1, tracks: new Map() };
/** The sizes the vertical timeline starts with (Zen mode, D182): tracks three quarters wider, so
 * that a name cut to its column still says something. */
export const VERTICAL_SIZES: RowSizes = { zoom: 1.75, tracks: new Map() };
export const MIN_ROW_ZOOM = 1;
export const MAX_ROW_ZOOM = 3;
export const ROW_ZOOM_STEP = 0.25;
/** The tallest a track resized by hand gets, whatever the zoom. */
export const MAX_ROW_SCALE = 4;

const clamp = (value: number, lo: number, hi: number) => Math.min(Math.max(value, lo), hi);

/** The zoom `steps` steps away (negative: smaller), on the grid of the steps and within the
 * zoom's range. */
export function steppedZoom(zoom: number, steps: number): number {
  const on = Math.round(zoom / ROW_ZOOM_STEP) + steps;
  return clamp(on * ROW_ZOOM_STEP, MIN_ROW_ZOOM, MAX_ROW_ZOOM);
}

/** The scale of one track `steps` steps away from `scale` (negative: lower), for the keys of
 * its header: the next marks of the zoom's grid beyond it — a track dragged to a height between
 * two marks goes to the nearest one on that side — within what a track can be. */
export function steppedScale(scale: number, steps: number): number {
  if (steps === 0) return clamp(scale, MIN_ROW_ZOOM, MAX_ROW_SCALE);
  const at = scale / ROW_ZOOM_STEP;
  const from = steps > 0 ? Math.floor(at + 1e-9) : Math.ceil(at - 1e-9);
  return clamp((from + steps) * ROW_ZOOM_STEP, MIN_ROW_ZOOM, MAX_ROW_SCALE);
}

/** The scale the lanes of a track are drawn at. */
export function rowScale(sizes: RowSizes, trackId: TrackId): number {
  return clamp(sizes.zoom * (sizes.tracks.get(trackId) ?? 1), MIN_ROW_ZOOM, MAX_ROW_SCALE);
}

/** Height of a lane of blocks at a scale, on whole pixels. */
export const laneHeight = (scale: number) => Math.round(LANE_HEIGHT * scale);

/** Height of a visual track whose clips need up to `lanes` lanes of blocks: those lanes and one
 * more, the lower part of a clip, between the space over and under the clips. */
export function visualRowHeight(lanes: number, scale = 1): number {
  return 2 * CLIP_INSET + (Math.max(1, lanes) + 1) * laneHeight(scale);
}

export const audioRowHeight = (scale = 1) => Math.round(AUDIO_ROW_HEIGHT * scale);

/** The scale at which a track is `height` tall (within what a track can be): the inverse of the
 * two functions above, for a drag of a track's edge. */
export function scaleForHeight(height: number, kind: 'visual' | 'audio', lanes: number): number {
  const scale =
    kind === 'audio'
      ? height / AUDIO_ROW_HEIGHT
      : (height - 2 * CLIP_INSET) / ((Math.max(1, lanes) + 1) * LANE_HEIGHT);
  return clamp(scale, MIN_ROW_ZOOM, MAX_ROW_SCALE);
}

/** The sizes with another zoom; the tracks resized by hand keep their factors. */
export function withZoom(sizes: RowSizes, zoom: number): RowSizes {
  const next = clamp(zoom, MIN_ROW_ZOOM, MAX_ROW_ZOOM);
  return next === sizes.zoom ? sizes : { zoom: next, tracks: sizes.tracks };
}

/** The sizes with track `trackId` drawn at `scale` (null: at the zoom's, as the others). */
export function withTrackScale(sizes: RowSizes, trackId: TrackId, scale: number | null): RowSizes {
  const factor = scale === null ? 1 : clamp(scale, MIN_ROW_ZOOM, MAX_ROW_SCALE) / sizes.zoom;
  const own = Math.abs(factor - 1) > 1e-6;
  if (!own && !sizes.tracks.has(trackId)) return sizes;
  if (own && sizes.tracks.get(trackId) === factor) return sizes;
  const tracks = new Map(sizes.tracks);
  if (own) tracks.set(trackId, factor);
  else tracks.delete(trackId);
  return { zoom: sizes.zoom, tracks };
}

/** Whether every track has the standard height. */
export const isStandard = (sizes: RowSizes) => sizes.zoom === 1 && sizes.tracks.size === 0;
