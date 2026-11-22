/* Fixed dimensions of the timeline grid (CSS px). */
/** The column of the track headers: wide enough for a track's name with the two keys of its
 * height beside it, and its five buttons under them. */
export const HEADER_WIDTH = 188;
/** The band of the track headers when the timeline is drawn vertical (`headerWidth.ts`): a name,
 * the two keys of the track's size and its five buttons, in rows as wide as a track. */
export const VERTICAL_HEADER_WIDTH = 124;
export const RULER_HEIGHT = 26;
/** Height of the Camera row (CameraRow.tsx): one line, the camera's moves as blocks. */
export const CAMERA_ROW_HEIGHT = 30;
/** How much of the view the rows that stay put take as the tracks scroll: the ruler and, while
 * the multicamera is on, the Camera row under it. */
export function fixedRowsHeight(multicamera: boolean): number {
  return RULER_HEIGHT + (multicamera ? CAMERA_ROW_HEIGHT : 0);
}
/** Height of a track whose clips have at most one lane of animation blocks; a track grows by one
 * LANE_HEIGHT for every further lane (trackLayout.ts). */
export const ROW_HEIGHT = 46;
/** Space above and below the clips of a track (`.tl-clip { top, bottom }`). */
export const CLIP_INSET = 4;
/** Radius of a clip's link port (`.tl-link-port`). */
export const LINK_PORT_RADIUS = 7;
/** Height of one lane of animation blocks: the upper half of a clip of a one-lane track. The lower
 * half of a clip is where relation windows are drawn. */
export const LANE_HEIGHT = (ROW_HEIGHT - 2 * CLIP_INSET) / 2;
/** How close (px) a dragged edge must come to a snap point to be pulled onto it. */
export const SNAP_DISTANCE = 8;
/** Width of the grab zones on a clip's edges. */
export const HANDLE_WIDTH = 7;
/** The room (px) the name of an animation needs to say something: all of it when it is short,
 * else four letters and the «…» it is cut with. A letter of these names is about 6.5 px wide. With
 * less room after the icon, a block, an intro or an outro shows its icon alone (D189). */
function nameRoom(name: string): number {
  return Math.min(name.length * 6.5, 4 * 6.5 + 8);
}

/** Whether a block `width` px long has room for `name`: after its edges and padding (12 px), its
 * icon and the gap that follows it (16 px) and, with `fold`, the arrow of its group (13 px). */
export function blockShowsName(width: number, name: string, fold = false): boolean {
  return width - 28 - (fold ? 13 : 0) >= nameRoom(name);
}

/** Whether an intro or an outro `width` px long has room for `name`: after its padding (up to
 * 10 px), its icon and the gap that follows it (15 px). */
export function phaseShowsName(width: number, name: string): boolean {
  return width - 25 >= nameRoom(name);
}

/** Length of a clip created by dropping a formula on the timeline (seconds). */
export const DROPPED_CLIP_LENGTH = 3;
