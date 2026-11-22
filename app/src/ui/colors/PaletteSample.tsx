import type { ReactNode } from 'react';
import type { PaletteColors, PaletteRole } from './palette';
import './palettes.css';

/** The eleven colors of a palette at work: a line of formula, two of text and the shapes, on the
 * palette's own background. It is a picture of the colors, not a render of a scene: what a
 * palette looks like in a project is seen by applying it. */
export function PaletteSample({ colors }: { colors: PaletteColors }) {
  const ink = (role: PaletteRole, text: ReactNode) => (
    <span data-role={role} style={{ color: colors[role] }}>
      {text}
    </span>
  );
  const outline = (role: PaletteRole, className: string) => (
    <span data-role={role} className={className} style={{ borderColor: colors[role] }} />
  );
  return (
    <div
      className="palette-sample"
      role="img"
      aria-label="Sample of the palette on its background"
      data-testid="palette-sample"
      data-role="background"
      style={{ background: colors.background }}
    >
      <p className="palette-sample-math">
        {ink(
          'formula',
          <>
            <i>f</i>(
          </>,
        )}
        {ink('variable', <i>x</i>)}
        {ink('formula', ')')}
        {ink('operator', ' = ')}
        {ink('constant', '2')}
        {ink('variable', <i>x</i>)}
        {ink('operator', ' + ')}
        {ink('constant', '1')}
        {ink('operator', ' = ')}
        {ink('result', '7')}
      </p>
      <p className="palette-sample-text">
        {ink('text', 'Text')}
        {ink('muted', 'Secondary text')}
      </p>
      <p className="palette-sample-shapes">
        {outline('rectangle', 'palette-sample-box')}
        {outline('circle', 'palette-sample-circle')}
        {ink('arrow', '→')}
      </p>
    </div>
  );
}

/** The colours of a palette in a line of small samples (decoration: the names are elsewhere). */
export function PaletteStrip({ colors }: { colors: readonly string[] }) {
  return (
    <span className="palette-strip" aria-hidden="true">
      {colors.map((color, index) => (
        <span key={index} style={{ background: color }} />
      ))}
    </span>
  );
}
