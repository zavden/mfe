import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EasingCurve } from '../EasingCurve.tsx';

describe('EasingCurve', () => {
  it('draws the curve from its corner and puts the point where the progress is', () => {
    render(<EasingCurve easing="linear" target="ce" progress={0.25} />);
    const figure = screen.getByTestId('block-easing-curve');
    expect(figure).toHaveAttribute('data-easing', 'linear');
    // From (0, 0) at the bottom left of the box: 8 px in from the left, 8 px up from 120.
    expect(figure.querySelector('path.easing-curve-line')?.getAttribute('d')).toMatch(
      /^M8\.00 112\.00 L/,
    );
    expect(screen.getByTestId('block-easing-point')).toHaveAttribute('data-value', '0.250');
    expect(screen.getByTestId('block-easing-readout')).toHaveTextContent('t 25 % → 25 %');
    expect(screen.getByRole('img')).toHaveAccessibleName(
      'Easing linear: progress 25 % at 25 % of the time',
    );
  });

  it('follows the rate function: there and back is back at 0 at the end', () => {
    render(<EasingCurve easing="there_and_back" target="gl" progress={1} />);
    expect(screen.getByTestId('block-easing-point')).toHaveAttribute('data-value', '0.000');
    expect(screen.getByTestId('block-easing-readout')).toHaveTextContent('t 100 % → 0 %');
  });
});
