/* The thumbnail of a template in a list (TemplateThumb.tsx): of its LaTeX and of its packages. */
import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { TemplateSource } from '../library';
import { TemplateThumb } from '../TemplateThumb';
import { renderThumb } from '../thumbs';

// An engine whose companion is never reachable: MathJax draws, as in the app without one.
vi.mock('../../../../engine/instance', async () => {
  const { createEngine } = await import('../../../../engine/engine');
  const engine = createEngine({
    companion: {
      fetch: (() => Promise.reject(new TypeError('offline'))) as typeof fetch,
      watchFocus: false,
    },
  });
  return { getEngine: () => engine };
});

const thumb = () => screen.getByTestId('template-thumb');
const drawn = () => Array.from(thumb().querySelectorAll('path'), (path) => path.getAttribute('d'));

/** The paths MathJax makes of a template, as its thumbnail draws them. */
async function pathsOf(template: TemplateSource): Promise<readonly string[]> {
  const art = await renderThumb({ latex: template.latex, packages: template.packages });
  if (!art.ok) throw new Error(art.message);
  return art.paths;
}

/* Both packages define `\braket`: with two arguments in physics, with one in braket (the second
 * group is then a symbol after it). The same LaTeX, two drawings. */
const physics: TemplateSource = {
  latex: '\\braket{x}{y}',
  placeholders: [],
  packages: ['physics'],
};
const braket: TemplateSource = { ...physics, packages: ['braket'] };

describe('TemplateThumb', () => {
  it('draws the template with its packages', async () => {
    const expected = await pathsOf(physics);
    expect(expected).not.toEqual(await pathsOf(braket));
    render(<TemplateThumb template={physics} background="#000000" />);
    await waitFor(() => expect(thumb()).toHaveAttribute('data-state', 'ready'));
    expect(drawn()).toEqual(expected);
  });

  it('draws it again when only its packages change: nothing of what it was stays', async () => {
    const before = await pathsOf(physics);
    const after = await pathsOf(braket);
    const { rerender } = render(<TemplateThumb template={physics} background="#000000" />);
    await waitFor(() => expect(drawn()).toEqual(before));
    // The same card, as after Edit: its template is another object with the same LaTeX.
    rerender(<TemplateThumb template={braket} background="#000000" />);
    await waitFor(() => expect(drawn()).toEqual(after));
    expect(thumb()).toHaveAttribute('data-state', 'ready');
    // And back: what was drawn before is at hand, and it is the one shown.
    rerender(<TemplateThumb template={{ ...physics }} background="#000000" />);
    await waitFor(() => expect(drawn()).toEqual(before));
  });

  it('draws it again when its LaTeX changes', async () => {
    const other: TemplateSource = { ...physics, latex: 'a+b' };
    const { rerender } = render(<TemplateThumb template={physics} background="#000000" />);
    await waitFor(() => expect(thumb()).toHaveAttribute('data-state', 'ready'));
    rerender(<TemplateThumb template={other} background="#000000" />);
    const expected = await pathsOf(other);
    await waitFor(() => expect(drawn()).toEqual(expected));
  });
});
