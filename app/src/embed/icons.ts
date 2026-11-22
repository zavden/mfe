/* The player's icons: the app's transport icons (`ui/timeline/icons.tsx`: 16×16, currentColor,
 * the house stroke), as SVG markup for the DOM. */

const STROKE =
  'fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"';

const PATHS = {
  play: '<path d="M5 3l8 5-8 5z" fill="currentColor"/>',
  pause:
    '<rect x="4" y="3" width="3" height="10" fill="currentColor"/>' +
    '<rect x="9" y="3" width="3" height="10" fill="currentColor"/>',
  'to-start':
    '<rect x="3" y="3" width="1.8" height="10" fill="currentColor"/>' +
    '<path d="M13 3L6 8l7 5z" fill="currentColor"/>',
  loop:
    `<path ${STROKE} d="M3 7.5V7a2.5 2.5 0 0 1 2.5-2.5H12M13 8.5V9a2.5 2.5 0 0 1-2.5 2.5H4"/>` +
    `<path ${STROKE} d="M10.2 2.5l2.3 2-2.3 2M5.8 9.5l-2.3 2 2.3 2"/>`,
} as const;

export type IconName = keyof typeof PATHS;

export function iconSvg(name: IconName): string {
  return `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}
