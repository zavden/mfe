import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ALIGN_ACTIONS, DISTRIBUTE_ACTIONS } from '../../preview/alignActions';
import { Icon, type IconName } from '../icons';

/** The markup an icon draws inside its svg. */
function drawing(name: IconName): string {
  const { container } = render(<Icon name={name} />);
  const svg = container.querySelector('svg')!;
  expect(svg).toHaveAttribute('viewBox', '0 0 16 16');
  expect(svg).toHaveAttribute('aria-hidden', 'true');
  return svg.innerHTML;
}

describe('Icon', () => {
  it('draws an icon for each align and distribute action, all different', () => {
    const actions = [...ALIGN_ACTIONS, ...DISTRIBUTE_ACTIONS];
    const drawings = actions.map((action) => drawing(action.icon));
    for (const markup of drawings) expect(markup).not.toBe('');
    expect(new Set(actions.map((action) => action.icon)).size).toBe(8);
    expect(new Set(drawings).size).toBe(8);
  });

  it('draws the copy and paste properties icons, unlike each other and the align set', () => {
    const names: IconName[] = ['copy-properties', 'paste-properties'];
    const drawings = names.map(drawing);
    for (const markup of drawings) expect(markup).not.toBe('');
    const align = [...ALIGN_ACTIONS, ...DISTRIBUTE_ACTIONS].map((action) => drawing(action.icon));
    expect(new Set([...drawings, ...align]).size).toBe(10);
  });

  it('draws the two grid anchors, a dot in a box and four corners, unlike each other', () => {
    const [center, edges] = (['grid-center', 'grid-edges'] as const).map(drawing);
    expect(center).toContain('<circle');
    expect(center).toContain('<rect');
    expect(edges).not.toContain('<circle');
    expect(edges).not.toBe(center);
    expect(edges).not.toBe(drawing('grid'));
  });

  it('draws a speaker for a track that sounds and strikes it out for a muted one, as the eye', () => {
    const [on, off] = (['volume', 'volume-off'] as const).map(drawing);
    expect(on).not.toBe('');
    expect(off).not.toBe(on);
    // The same stroke across the icon as the hidden eye has.
    const strike = /d="M2\.5 13\.5l11-11"/;
    expect(off).toMatch(strike);
    expect(drawing('eye-off')).toMatch(strike);
    expect(on).not.toMatch(strike);
    for (const markup of [on, off]) {
      expect(markup).not.toBe(drawing('eye'));
      expect(markup).not.toBe(drawing('eye-off'));
    }
  });

  it('draws in the text colour, so that menus can dim and highlight it', () => {
    const { container } = render(<Icon name="align-left" />);
    const parts = [...container.querySelectorAll('svg *')];
    expect(parts.length).toBeGreaterThan(0);
    for (const part of parts) {
      const colour = part.getAttribute('stroke') ?? part.getAttribute('fill');
      expect(colour).toBe('currentColor');
    }
  });
});
