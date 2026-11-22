/* Small inline icons (16×16, currentColor) for the panels, the timeline, the transport, the
 * preview and the menus. Line drawings with the house stroke; the objects of the align and
 * distribute icons are solid bars beside a stroked reference line (or between two stroked
 * walls), as in Figma and Keynote. */
import type { ReactNode } from 'react';

export type IconName =
  | 'eye'
  | 'eye-off'
  | 'volume'
  | 'volume-off'
  | 'volume-line'
  | 'lock'
  | 'unlock'
  | 'up'
  | 'down'
  | 'close'
  | 'plus'
  | 'minus'
  | 'fit'
  | 'magnet'
  | 'grid'
  | 'grid-center'
  | 'grid-edges'
  | 'align-symbol'
  | 'circle-select'
  | 'handles'
  | 'play'
  | 'pause'
  | 'stop'
  | 'to-start'
  | 'to-end'
  | 'step-back'
  | 'step-forward'
  | 'loop'
  | 'stop-at-pauses'
  | 'align-left'
  | 'align-center'
  | 'align-right'
  | 'align-top'
  | 'align-middle'
  | 'align-bottom'
  | 'distribute-h'
  | 'distribute-v'
  | 'copy-properties'
  | 'paste-properties'
  | 'view-list'
  | 'view-grid'
  | 'side-by-side'
  | 'chevron-down'
  | 'layers'
  | 'play-outline'
  | 'film'
  | 'tracks'
  | 'sigma'
  | 'waveform'
  | 'search'
  | 'folder'
  | 'pointer-off'
  | 'undo'
  | 'redo'
  | 'camera'
  | 'camera-view'
  | 'slides';

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

/** A solid bar with rounded corners: an object being aligned or distributed. */
const bar = (x: number, y: number, width: number, height: number) => (
  <rect x={x} y={y} width={width} height={height} rx="1" fill="currentColor" />
);

/** The small solid square carried by the copy and paste properties icons. */
const property = (x: number, y: number) => (
  <rect x={x} y={y} width="3" height="3" rx="0.5" fill="currentColor" />
);

const SPEAKER = 'M2.5 6.5h2.2L8 3.8v8.4L4.7 9.5H2.5z';
const WAVES = 'M10.4 6.1a2.7 2.7 0 0 1 0 3.8M12.2 4.3a5.2 5.2 0 0 1 0 7.4';

const PATHS: Record<IconName, ReactNode> = {
  eye: (
    <>
      <path {...stroke} d="M1.5 8s2.3-4.5 6.5-4.5S14.5 8 14.5 8 12.2 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle {...stroke} cx="8" cy="8" r="2" />
    </>
  ),
  'eye-off': (
    <>
      <path
        {...stroke}
        d="M1.5 8s2.3-4.5 6.5-4.5S14.5 8 14.5 8 12.2 12.5 8 12.5 1.5 8 1.5 8z"
        opacity="0.45"
      />
      <path {...stroke} d="M2.5 13.5l11-11" />
    </>
  ),
  // An audio track's eye: a speaker with its two waves, and the same speaker dimmed and struck
  // out when the track is muted.
  volume: (
    <>
      <path {...stroke} d={SPEAKER} />
      <path {...stroke} d={WAVES} />
    </>
  ),
  'volume-off': (
    <>
      <path {...stroke} d={SPEAKER} opacity="0.45" />
      <path {...stroke} d={WAVES} opacity="0.45" />
      <path {...stroke} d="M2.5 13.5l11-11" />
    </>
  ),
  // The volume line of an audio clip: a line through two of its points.
  'volume-line': (
    <>
      <path {...stroke} d="M1.5 11.5l4-6 5 4 4-5.5" />
      <circle cx="5.5" cy="5.5" r="1.8" fill="currentColor" />
      <circle cx="10.5" cy="9.5" r="1.8" fill="currentColor" />
    </>
  ),
  lock: (
    <>
      <rect {...stroke} x="3.5" y="7" width="9" height="6.5" rx="1.2" />
      <path {...stroke} d="M5.5 7V5.2a2.5 2.5 0 0 1 5 0V7" />
    </>
  ),
  unlock: (
    <>
      <rect {...stroke} x="3.5" y="7" width="9" height="6.5" rx="1.2" opacity="0.6" />
      <path {...stroke} d="M5.5 7V5.2a2.5 2.5 0 0 1 4.8-1" opacity="0.6" />
    </>
  ),
  up: <path {...stroke} d="M4 10l4-4 4 4" />,
  down: <path {...stroke} d="M4 6l4 4 4-4" />,
  close: <path {...stroke} d="M4 4l8 8M12 4l-8 8" />,
  plus: <path {...stroke} d="M8 3v10M3 8h10" />,
  minus: <path {...stroke} d="M3 8h10" />,
  fit: <path {...stroke} d="M2.5 8h11M2.5 5v6M13.5 5v6M5.5 6l-3 2 3 2M10.5 6l3 2-3 2" />,
  magnet: <path {...stroke} d="M3.5 13V7a4.5 4.5 0 0 1 9 0v6M3.5 10.5h3M9.5 10.5h3" />,
  grid: <path {...stroke} d="M2.5 6h11M2.5 10h11M6 2.5v11M10 2.5v11" />,
  // What the grid holds: a box with a dot at its centre, or the four corners of a box (its
  // edges, drawn as a viewfinder's brackets).
  'grid-center': (
    <>
      <rect {...stroke} x="2.5" y="2.5" width="11" height="11" rx="1" />
      <circle cx="8" cy="8" r="1.7" fill="currentColor" />
    </>
  ),
  'grid-edges': <path {...stroke} d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10" />,
  'align-symbol': <path {...stroke} d="M4 2.5v11M7 6h6.5M7 10h6.5" />,
  /** The circle selector: its dashed circle around the point it takes from. */
  'circle-select': (
    <>
      <circle {...stroke} cx="8" cy="8" r="5.5" strokeDasharray="2.6 2.2" />
      <circle cx="8" cy="8" r="1.4" fill="currentColor" />
    </>
  ),
  /** A box with its four corner handles. */
  handles: (
    <>
      <path {...stroke} d="M5 5h6v6H5z" />
      <path
        fill="currentColor"
        d="M2 2h3.5v3.5H2zM10.5 2H14v3.5h-3.5zM2 10.5h3.5V14H2zM10.5 10.5H14V14h-3.5z"
      />
    </>
  ),
  play: <path d="M5 3l8 5-8 5z" fill="currentColor" />,
  pause: (
    <>
      <rect x="4" y="3" width="3" height="10" fill="currentColor" />
      <rect x="9" y="3" width="3" height="10" fill="currentColor" />
    </>
  ),
  stop: <rect x="4" y="4" width="8" height="8" fill="currentColor" />,
  'to-start': (
    <>
      <rect x="3" y="3" width="1.8" height="10" fill="currentColor" />
      <path d="M13 3L6 8l7 5z" fill="currentColor" />
    </>
  ),
  'to-end': (
    <>
      <rect x="11.2" y="3" width="1.8" height="10" fill="currentColor" />
      <path d="M3 3l7 5-7 5z" fill="currentColor" />
    </>
  ),
  'step-back': <path d="M11 3L5 8l6 5z" fill="currentColor" />,
  'step-forward': <path d="M5 3l6 5-6 5z" fill="currentColor" />,
  loop: (
    <>
      <path {...stroke} d="M3 7.5V7a2.5 2.5 0 0 1 2.5-2.5H12M13 8.5V9a2.5 2.5 0 0 1-2.5 2.5H4" />
      <path {...stroke} d="M10.2 2.5l2.3 2-2.3 2M5.8 9.5l-2.3 2 2.3 2" />
    </>
  ),
  // A play head that runs into the two bars of a pause: playback that stops at the pauses.
  'stop-at-pauses': (
    <>
      <path d="M2.5 4.5v7l5-3.5z" fill="currentColor" />
      <rect x="9.5" y="3" width="2" height="10" fill="currentColor" />
      <rect x="12.5" y="3" width="2" height="10" fill="currentColor" />
    </>
  ),
  // Align: the reference line (an edge, or the centre line through the bars), longer than the
  // two bars flush with it. Lines on half pixels and bars on whole ones stay sharp at 1×.
  'align-left': (
    <>
      <path {...stroke} d="M2.5 2.5v11" />
      {bar(5, 4, 9, 3)}
      {bar(5, 9, 5, 3)}
    </>
  ),
  'align-center': (
    <>
      <path {...stroke} d="M8 2.5v11" />
      {bar(3, 4, 10, 3)}
      {bar(5, 9, 6, 3)}
    </>
  ),
  'align-right': (
    <>
      <path {...stroke} d="M13.5 2.5v11" />
      {bar(2, 4, 9, 3)}
      {bar(6, 9, 5, 3)}
    </>
  ),
  'align-top': (
    <>
      <path {...stroke} d="M2.5 2.5h11" />
      {bar(4, 5, 3, 9)}
      {bar(9, 5, 3, 5)}
    </>
  ),
  'align-middle': (
    <>
      <path {...stroke} d="M2.5 8h11" />
      {bar(4, 3, 3, 10)}
      {bar(9, 5, 3, 6)}
    </>
  ),
  'align-bottom': (
    <>
      <path {...stroke} d="M2.5 13.5h11" />
      {bar(4, 2, 3, 9)}
      {bar(9, 6, 3, 5)}
    </>
  ),
  // Distribute: a bar centred between two walls, the same space on either side.
  'distribute-h': (
    <>
      <path {...stroke} d="M2.5 2.5v11M13.5 2.5v11" />
      {bar(6, 4, 4, 8)}
    </>
  ),
  'distribute-v': (
    <>
      <path {...stroke} d="M2.5 2.5h11M2.5 13.5h11" />
      {bar(4, 6, 8, 4)}
    </>
  ),
  // Copy: two overlapping squares, the front one holding the properties; paste: a clipboard
  // holding the same square.
  'copy-properties': (
    <>
      <path {...stroke} d="M3.8 10.5h-.3a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v.3" />
      <rect {...stroke} x="5.5" y="5.5" width="8" height="8" rx="1" />
      {property(8, 8)}
    </>
  ),
  'paste-properties': (
    <>
      <path
        {...stroke}
        d="M11 3.5h1.5a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-8a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1H6"
      />
      <rect x="6" y="1.5" width="5" height="3.5" rx="1" fill="currentColor" />
      {property(7, 8)}
    </>
  ),
  // The two views of the Creator's formula list: rows (a dot and a line each), or a grid of
  // blocks.
  'view-list': <path {...stroke} d="M3 4h.5M6.5 4H13M3 8h.5M6.5 8H13M3 12h.5M6.5 12H13" />,
  'view-grid': (
    <path
      {...stroke}
      d="M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z"
    />
  ),
  // Two things side by side: the layout of a pair editor's drawing.
  'side-by-side': <path {...stroke} d="M2.5 3.5h4.3v9H2.5zM9.2 3.5h4.3v9H9.2z" />,
  // The arrow of a split button: what it opens hangs under it.
  'chevron-down': <path {...stroke} strokeWidth="2" d="M3.5 6l4.5 4.5L12.5 6" />,
  // The four panels: a stack of sheets (Creator), a play triangle (Preview), a strip of film
  // (Animations) and clips on their tracks (Timeline).
  layers: (
    <path {...stroke} d="M8 2.2L2.2 5.2 8 8.2l5.8-3zM2.6 8.2L8 11l5.4-2.8M2.6 11L8 13.8l5.4-2.8" />
  ),
  'play-outline': <path {...stroke} d="M4.5 2.8v10.4l8.3-5.2z" />,
  // An arrow that turns back, and its mirror image.
  undo: <path {...stroke} d="M5.5 3.5L2.5 6.5l3 3M2.8 6.5h6.4a4 4 0 0 1 0 8H6.5" />,
  redo: <path {...stroke} d="M10.5 3.5l3 3-3 3M13.2 6.5H6.8a4 4 0 0 0 0 8h2.7" />,
  film: (
    <>
      <rect {...stroke} x="2" y="3" width="12" height="10" rx="1.5" />
      <path {...stroke} d="M5 3v10M11 3v10M2 6.3h3M2 9.7h3M11 6.3h3M11 9.7h3" />
    </>
  ),
  tracks: <path {...stroke} strokeWidth="2" d="M2.5 4h6M6.5 8h7M3.5 12h5" />,
  // The Creator's tabs: formulas, templates (the grid of 'view-grid') and audio.
  sigma: <path {...stroke} d="M11.5 4.4V3h-7l4 5-4 5h7v-1.4" />,
  waveform: <path {...stroke} d="M2.5 7v2M5.2 5v6M8 2.8v10.4M10.8 5v6M13.5 7v2" />,
  search: (
    <>
      <circle {...stroke} cx="7" cy="7" r="4.2" />
      <path {...stroke} d="M10.2 10.2l3.3 3.3" />
    </>
  ),
  folder: (
    <path
      {...stroke}
      d="M2 4.5a1 1 0 0 1 1-1h3L7.5 5H13a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1z"
    />
  ),
  // The scene's camera (D190): a film camera, its lens to the right.
  camera: (
    <>
      <rect {...stroke} x="1.8" y="4.5" width="8.4" height="7" rx="1.4" />
      <path {...stroke} d="M10.2 7.4l4-2.2v5.6l-4-2.2" />
    </>
  ),
  // The camera view (D190): the corners of a viewfinder around an eye — what the camera sees.
  'camera-view': (
    <>
      <path {...stroke} d="M1.8 5.4V3.4h2.4M11.8 3.4h2.4v2M14.2 10.6v2h-2.4M4.2 12.6H1.8v-2" />
      <path {...stroke} d="M4.4 8s1.4-2.4 3.6-2.4S11.6 8 11.6 8s-1.4 2.4-3.6 2.4S4.4 8 4.4 8z" />
      <circle cx="8" cy="8" r="1" fill="currentColor" />
    </>
  ),
  // The Slides mode (D200): a screen on its stand, a pause («‖») on it.
  slides: (
    <>
      <rect {...stroke} x="2" y="2.5" width="12" height="8.5" rx="1.2" />
      <path {...stroke} d="M8 11v2.5M5.5 13.8h5M6.6 5v3.5M9.4 5v3.5" />
    </>
  ),
  // A pointer struck out: what it marks does not answer the pointer (a clip locked in the
  // preview).
  'pointer-off': (
    <>
      <path {...stroke} d="M5 2.5v9l2.3-2 1.5 3.6 1.5-.6-1.5-3.6 3-.3z" />
      <path {...stroke} d="M2.2 13.8 13.8 2.2" />
    </>
  ),
};

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className="icon"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
