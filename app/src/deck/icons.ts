/* The icons of a deck's controls: inline SVG built as elements (no markup is parsed, so a page
 * under a strict content security policy, Trusted Types included, shows them), drawn in
 * `currentColor` on a 24-unit grid. Each carries the class `mfe-icon`, which the stylesheet sizes:
 * a page's own rule for `svg` does not reach it. */

const SVG = 'http://www.w3.org/2000/svg';

/** A shape of an icon: filled, or a line of the icon's stroke. */
type Shape = ['fill' | 'line', 'path' | 'rect', Record<string, string>];

const SPEAKER: Shape = [
  'fill',
  'path',
  {
    d: 'M3.5 9.3v5.4c0 .4.3.8.8.8h3l4.4 3.6c.5.4 1.3 0 1.3-.6V5.5c0-.7-.8-1-1.3-.6L7.3 8.5h-3c-.5 0-.8.4-.8.8z',
  },
];

const ICONS = {
  play: [
    [
      'fill',
      'path',
      { d: 'M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5a.8.8 0 0 0-1.2.7z' },
    ],
  ],
  pause: [
    ['fill', 'rect', { x: '6.5', y: '5', width: '3.6', height: '14', rx: '1' }],
    ['fill', 'rect', { x: '13.9', y: '5', width: '3.6', height: '14', rx: '1' }],
  ],
  replay: [
    ['line', 'path', { d: 'M4.5 13.5a7.5 7.5 0 1 0 2.2-6.8L4 9.2' }],
    ['line', 'path', { d: 'M4 4.5v4.7h4.7' }],
  ],
  previous: [
    ['fill', 'rect', { x: '5', y: '5.5', width: '2.6', height: '13', rx: '1' }],
    [
      'fill',
      'path',
      { d: 'M18.5 6.2v11.6a.8.8 0 0 1-1.2.7L9.4 12.7a.8.8 0 0 1 0-1.4l7.9-5.8a.8.8 0 0 1 1.2.7z' },
    ],
  ],
  next: [
    [
      'fill',
      'path',
      { d: 'M5.5 6.2v11.6a.8.8 0 0 0 1.2.7l7.9-5.8a.8.8 0 0 0 0-1.4L6.7 5.5a.8.8 0 0 0-1.2.7z' },
    ],
    ['fill', 'rect', { x: '16.4', y: '5.5', width: '2.6', height: '13', rx: '1' }],
  ],
  // Through the pauses: an arrow that crosses two of the timeline's marks.
  through: [
    ['line', 'path', { d: 'M8.5 8.5v7M13.5 8.5v7' }],
    ['line', 'path', { d: 'M3 12h17M16.5 8.5 20 12l-3.5 3.5' }],
  ],
  sound: [SPEAKER, ['line', 'path', { d: 'M16 9a4.2 4.2 0 0 1 0 6M18.6 6.4a8 8 0 0 1 0 11.2' }]],
  muted: [SPEAKER, ['line', 'path', { d: 'M16 9.5l5 5M21 9.5l-5 5' }]],
  notes: [
    ['line', 'rect', { x: '5', y: '3.5', width: '14', height: '17', rx: '2' }],
    ['line', 'path', { d: 'M8.5 8.5h7M8.5 12h7M8.5 15.5h4' }],
  ],
  fullscreen: [['line', 'path', { d: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5' }]],
  'exit-fullscreen': [['line', 'path', { d: 'M9 4v5H4M15 4v5h5M4 15h5v5M20 15h-5v5' }]],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

/** The icon `name`, as an element of `doc`: hidden from assistive technology (the button that
 * holds it has the name). */
export function icon(doc: Document, name: IconName): SVGSVGElement {
  const svg = doc.createElementNS(SVG, 'svg');
  svg.setAttribute('class', 'mfe-icon');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '18');
  svg.setAttribute('height', '18');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('data-icon', name);
  for (const [paint, tag, attributes] of ICONS[name] as Shape[]) {
    const shape = doc.createElementNS(SVG, tag);
    for (const [key, value] of Object.entries(attributes)) shape.setAttribute(key, value);
    if (paint === 'fill') shape.setAttribute('fill', 'currentColor');
    else {
      shape.setAttribute('fill', 'none');
      shape.setAttribute('stroke', 'currentColor');
      shape.setAttribute('stroke-width', '2');
      shape.setAttribute('stroke-linecap', 'round');
      shape.setAttribute('stroke-linejoin', 'round');
    }
    svg.append(shape);
  }
  return svg;
}
