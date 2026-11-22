import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createColorMatch } from '../../../model';
import { ColorMatchLabel } from '../ColorMatchLabel';
import { MATCH_SWATCH_LIMIT, matchColors } from '../matchSwatches';

const entries = (...colors: string[]) => colors.map((color, i) => ({ pattern: `x_${i}`, color }));

describe('matchColors', () => {
  it('lists the colours of a list once each, in the order of its entries', () => {
    const match = createColorMatch('Vars', entries('#FF0000', '#00FF00', '#ff0000', '#0000FF'));
    expect(matchColors(match)).toEqual(['#FF0000', '#00FF00', '#0000FF']);
    expect(matchColors(createColorMatch('Empty'))).toEqual([]);
  });
});

describe('ColorMatchLabel', () => {
  it('shows the name and the colours of the list as swatches, without its patterns', () => {
    const match = createColorMatch('Vars', entries('#FF0000', '#00FF00', '#FF0000'));
    render(<ColorMatchLabel match={match} />);
    expect(screen.getByText('Vars')).toBeInTheDocument();
    const swatches = screen.getByTestId('match-swatches');
    expect(swatches).toHaveAttribute('aria-hidden', 'true');
    expect([...swatches.children].map((swatch) => swatch.getAttribute('data-color'))).toEqual([
      '#FF0000',
      '#00FF00',
    ]);
    expect(swatches).toHaveTextContent('');
  });

  it('shows no swatches for a list without entries', () => {
    render(<ColorMatchLabel match={createColorMatch('Empty')} />);
    expect(screen.getByText('Empty')).toBeInTheDocument();
    expect(screen.queryByTestId('match-swatches')).toBeNull();
  });

  it('shows the first colours of a long list and how many more it has', () => {
    const many = Array.from({ length: MATCH_SWATCH_LIMIT + 3 }, (_, i) => `#0000${10 + i}`);
    render(<ColorMatchLabel match={createColorMatch('Many', entries(...many))} />);
    const swatches = screen.getByTestId('match-swatches');
    expect(swatches.querySelectorAll('.match-swatch')).toHaveLength(MATCH_SWATCH_LIMIT);
    expect(swatches).toHaveTextContent('+3');
  });
});
