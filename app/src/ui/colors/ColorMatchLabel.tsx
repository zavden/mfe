/* A list of match colours as a menu names it (Apply match colors): its name, then the colours it
 * gives as small swatches — the colours alone, without the patterns they are for. */
import type { ColorMatch } from '../../model';
import { MATCH_SWATCH_LIMIT, matchColors } from './matchSwatches';
import './colors.css';

export function ColorMatchLabel({ match }: { match: ColorMatch }) {
  const colors = matchColors(match);
  const shown = colors.slice(0, MATCH_SWATCH_LIMIT);
  return (
    <span className="match-label">
      <span className="match-label-name">{match.name}</span>
      {shown.length > 0 && (
        <span className="match-swatches" aria-hidden="true" data-testid="match-swatches">
          {shown.map((color) => (
            <span
              key={color.toUpperCase()}
              className="match-swatch"
              data-color={color}
              style={{ background: color }}
            />
          ))}
          {colors.length > shown.length && (
            <span className="match-swatches-more">+{colors.length - shown.length}</span>
          )}
        </span>
      )}
    </span>
  );
}
