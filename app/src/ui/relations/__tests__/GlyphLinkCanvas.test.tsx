import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { resolveFormula, toSnapshot, type ResolvedFormula } from '../../../engine';
import { createMockEngine } from '../../../test/mockEngine';
import { createFormula, type Formula, type Severity } from '../../../model';
import { GlyphLinkCanvas, type GlyphLinkCanvasProps } from '../GlyphLinkCanvas';
import { PairList } from '../RelationSidebar';

async function side(latex: string): Promise<{ formula: Formula; resolved: ResolvedFormula }> {
  const result = await createMockEngine().render({
    kind: 'math',
    latex,
    packages: [],
    preamble: '',
    target: 'ce',
    fontSize: 48,
    prefer: 'auto',
  });
  if (!result.ok) throw new Error(result.error.message);
  const formula = createFormula({ name: 'f', source: latex, snapshot: toSnapshot(result.render) });
  return { formula, resolved: resolveFormula(formula, result.render) };
}

const none = new Set<number>();
const noIssues = new Map<number, Severity>();

function canvas(
  one: Awaited<ReturnType<typeof side>>,
  extra: Partial<GlyphLinkCanvasProps> = {},
): GlyphLinkCanvasProps {
  return {
    from: one,
    to: one,
    background: '#000000',
    pairs: [{ from: [0], to: [2], style: null }],
    showLinks: true,
    defaultStyle: 'copy',
    focusPairs: none,
    onHoverGlyph: () => {},
    editablePairs: none,
    onBadgeClick: () => {},
    selectedFrom: none,
    selectedTo: none,
    suggestion: null,
    pairIssues: noIssues,
    onGlyph: () => {},
    onBackground: () => {},
    onMarqueeStart: () => {},
    onMarquee: () => {},
    onContextMenu: () => {},
    ...extra,
  };
}

describe('GlyphLinkCanvas', () => {
  it('keeps the relation editor’s test ids and draws every glyph plainly by default', async () => {
    const one = await side('a+b');
    render(<GlyphLinkCanvas {...canvas(one)} />);
    expect(screen.getByTestId('rel-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('rel-link-0')).toBeInTheDocument();
    const glyph = screen.getByTestId('rel-from-glyph-1');
    expect(glyph).not.toHaveAttribute('data-eligible');
    expect(glyph.querySelector('path')).not.toHaveAttribute('opacity');
    expect(glyph.querySelector('title')).toHaveTextContent(/^1: \+$/);
    expect(screen.getByTestId('rel-junction-0').querySelector('title')).toHaveTextContent(
      'Copy (inherited from the relation)',
    );
  });

  it('takes its own test ids and dims the glyphs that cannot take part, with the reason', async () => {
    const one = await side('a+b');
    const onGlyph = vi.fn();
    render(
      <GlyphLinkCanvas
        {...canvas(one, {
          testIdPrefix: 'morph',
          ownerName: 'block',
          ineligible: {
            from: new Map([
              [0, 'not on screen yet'],
              [1, 'not on screen yet'],
            ]),
            to: new Map([[2, 'on screen already']]),
          },
          selectedFrom: new Set([1]),
          onGlyph,
        })}
      />,
    );
    expect(screen.queryByTestId('rel-canvas')).toBeNull();
    expect(screen.getByTestId('morph-canvas')).toBeInTheDocument();
    const dimmed = screen.getByTestId('morph-to-glyph-1');
    expect(dimmed).toHaveAttribute('data-eligible', 'true');
    const off = screen.getByTestId('morph-from-glyph-2');
    expect(off).toHaveAttribute('data-eligible', 'true');
    // Glyph 0 of the sources cannot take part, but it is linked: not dimmed. Glyph 1 is selected.
    for (const [testId, dim] of [
      ['morph-from-glyph-0', false],
      ['morph-from-glyph-1', false],
      ['morph-to-glyph-2', false], // linked as the target of pair 1
    ] as const) {
      const g = screen.getByTestId(testId);
      expect(g).toHaveAttribute('data-eligible', 'false');
      expect(g.classList.contains('is-ineligible')).toBe(dim);
    }
    expect(screen.getByTestId('morph-from-glyph-1').querySelector('title')).toHaveTextContent(
      '1: + — not on screen yet',
    );
    expect(screen.getByTestId('morph-junction-0').querySelector('title')).toHaveTextContent(
      'Copy (inherited from the block)',
    );
    // Still clickable: what it means is the editor's (and validation's) business.
    await userEvent.setup().click(screen.getByTestId('morph-from-glyph-0'));
    expect(onGlyph).toHaveBeenCalledWith('from', 0, expect.anything());
  });

  it('dims an ineligible glyph that is neither selected nor linked', async () => {
    const one = await side('a+b');
    render(
      <GlyphLinkCanvas
        {...canvas(one, {
          testIdPrefix: 'morph',
          pairs: [],
          ineligible: { to: new Map([[1, 'on screen already']]) },
        })}
      />,
    );
    const g = screen.getByTestId('morph-to-glyph-1');
    expect(g.classList.contains('is-ineligible')).toBe(true);
    expect(g.querySelector('path')).toHaveAttribute('opacity', '0.3');
    expect(g).toHaveAccessibleName('Glyph 1: + (on screen already)');
  });

  it('outlines the glyphs of a pair with an error as bad, of one with only warnings as warned', async () => {
    const one = await side('a+b');
    render(
      <GlyphLinkCanvas
        {...canvas(one, {
          // Pair 0 (a → b) has only a warning, pair 1 (+ → b, the same target) an error; the
          // target they share takes the graver.
          pairs: [
            { from: [0], to: [2], style: null },
            { from: [1], to: [2], style: null },
          ],
          pairIssues: new Map([
            [0, 'warning'],
            [1, 'error'],
          ]),
        })}
      />,
    );
    const classes = (testId: string) => screen.getByTestId(testId).classList;
    expect(classes('rel-from-glyph-0').contains('is-warned')).toBe(true);
    expect(classes('rel-from-glyph-0').contains('is-bad')).toBe(false);
    expect(classes('rel-from-glyph-1').contains('is-bad')).toBe(true);
    expect(classes('rel-to-glyph-2').contains('is-bad')).toBe(true);
    expect(classes('rel-to-glyph-2').contains('is-warned')).toBe(false);
    // A glyph of no pair is not marked.
    expect(classes('rel-to-glyph-0').contains('is-bad')).toBe(false);
    expect(classes('rel-to-glyph-0').contains('is-warned')).toBe(false);
  });
});

describe('GlyphLinkCanvas pointer', () => {
  // Without a layout (jsdom) an event has no place on the drawing: it means the glyph it was
  // sent to. Where the pointer has a place, the circle selector decides (`pairPick.test.ts`,
  // `e2e/pairCanvas.spec.ts`).
  it('says which glyph the pointer aims at, once per glyph, and marks it as hovered', async () => {
    const one = await side('a+b');
    const onHoverGlyph = vi.fn();
    render(<GlyphLinkCanvas {...canvas(one, { onHoverGlyph })} />);
    const glyph = screen.getByTestId('rel-to-glyph-1');
    fireEvent.pointerMove(glyph);
    expect(onHoverGlyph).toHaveBeenLastCalledWith({ side: 'to', index: 1 });
    expect(glyph).toHaveClass('is-hover');
    expect(screen.getByTestId('rel-canvas')).toHaveClass('is-aiming');
    expect(screen.getByTestId('rel-glyph-index')).toHaveAttribute('data-index', '1');
    // The pointer moving on the same glyph says nothing new.
    fireEvent.pointerMove(glyph.querySelector('path')!);
    expect(onHoverGlyph).toHaveBeenCalledTimes(1);
    // Off every glyph, then off the drawing.
    fireEvent.pointerMove(screen.getByTestId('rel-canvas'));
    expect(onHoverGlyph).toHaveBeenLastCalledWith(null);
    expect(glyph).not.toHaveClass('is-hover');
    expect(screen.getByTestId('rel-canvas')).not.toHaveClass('is-aiming');
    fireEvent.pointerMove(glyph);
    fireEvent.pointerLeave(screen.getByTestId('rel-canvas'));
    expect(onHoverGlyph).toHaveBeenLastCalledWith(null);
    expect(onHoverGlyph).toHaveBeenCalledTimes(4);
    expect(screen.queryByTestId('rel-glyph-index')).toBeNull();
  });

  it('takes a click and a right-click on a glyph as the glyph’s, elsewhere as the background’s', async () => {
    const one = await side('a+b');
    const onGlyph = vi.fn();
    const onBackground = vi.fn();
    const onContextMenu = vi.fn();
    render(<GlyphLinkCanvas {...canvas(one, { onGlyph, onBackground, onContextMenu })} />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('rel-from-glyph-2'));
    expect(onGlyph).toHaveBeenCalledWith('from', 2, expect.anything());
    expect(onBackground).not.toHaveBeenCalled();
    await user.click(screen.getByTestId('rel-canvas'));
    expect(onBackground).toHaveBeenCalledTimes(1);
    expect(onGlyph).toHaveBeenCalledTimes(1);
    fireEvent.contextMenu(screen.getByTestId('rel-to-glyph-0'));
    expect(onContextMenu).toHaveBeenLastCalledWith({ side: 'to', index: 0 }, expect.anything());
    fireEvent.contextMenu(screen.getByTestId('rel-canvas'));
    expect(onContextMenu).toHaveBeenLastCalledWith(null, expect.anything());
  });
});

describe('GlyphLinkCanvas view', () => {
  it('opens on the whole drawing; its keys zoom in steps and «Fit» goes back', async () => {
    const one = await side('a+b');
    render(<GlyphLinkCanvas {...canvas(one)} />);
    const user = userEvent.setup();
    const drawing = screen.getByTestId('rel-canvas');
    const whole = drawing.getAttribute('viewBox')!;
    expect(screen.getByTestId('rel-zoom-label')).toHaveTextContent('100%');
    expect(screen.getByTestId('rel-view-fit')).toBeDisabled();
    expect(screen.getByRole('group', { name: 'View of the drawing' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByTestId('rel-zoom-label')).toHaveTextContent('125%');
    expect(drawing).toHaveAttribute('data-zoom', '1.25');
    // The element shows less of the drawing, about the same centre.
    const [x, y, width, height] = drawing.getAttribute('viewBox')!.split(' ').map(Number);
    const [x0, y0, width0, height0] = whole.split(' ').map(Number);
    expect(width! * 1.25).toBeCloseTo(width0!, 3);
    expect(x! + width! / 2).toBeCloseTo(x0! + width0! / 2, 3);
    expect(y! + height! / 2).toBeCloseTo(y0! + height0! / 2, 3);
    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(screen.getByTestId('rel-zoom-label')).toHaveTextContent('80%');

    await user.click(screen.getByTestId('rel-view-fit'));
    expect(drawing).toHaveAttribute('viewBox', whole);
    expect(screen.getByTestId('rel-view-fit')).toBeDisabled();
  });

  it('keeps what is the screen’s at its size when the view zooms: marks and badges shrink in units', async () => {
    const one = await side('a+b');
    render(<GlyphLinkCanvas {...canvas(one)} />);
    const height = () =>
      Number(screen.getByTestId('rel-junction-0').querySelector('rect')!.getAttribute('height'));
    const before = height();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(height() * 1.25).toBeCloseTo(before, 3);
  });

  it('shows the view its editor holds, and tells it of every change', async () => {
    const one = await side('a+b');
    const setView = vi.fn();
    const view = { center: [0.5, 0.25] as [number, number], zoom: 2 };
    const stage = { layout: 'stacked' as const, setLayout: vi.fn(), view, setView };
    render(<GlyphLinkCanvas {...canvas(one, { stage })} />);
    expect(screen.getByTestId('rel-zoom-label')).toHaveTextContent('200%');
    expect(screen.getByTestId('rel-view-fit')).toBeEnabled();
    const [x, y, width, height] = screen
      .getByTestId('rel-canvas')
      .getAttribute('viewBox')!
      .split(' ')
      .map(Number);
    // Centred on the view's centre (the viewBox is y down).
    expect(x! + width! / 2).toBeCloseTo(0.5, 3);
    expect(y! + height! / 2).toBeCloseTo(-0.25, 3);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(setView).toHaveBeenLastCalledWith({ center: [0.5, 0.25], zoom: 2.5 });
    await userEvent.setup().click(screen.getByTestId('rel-view-fit'));
    expect(setView).toHaveBeenLastCalledWith(expect.objectContaining({ zoom: 1 }));
  });
});

describe('GlyphLinkCanvas layout', () => {
  it('is stacked until told otherwise; its key lays the two side by side and back', async () => {
    const one = await side('a+b');
    render(<GlyphLinkCanvas {...canvas(one)} />);
    const user = userEvent.setup();
    const drawing = screen.getByTestId('rel-canvas');
    const key = screen.getByTestId('rel-toggle-layout');
    expect(drawing).toHaveAttribute('data-layout', 'stacked');
    expect(drawing).toHaveAccessibleName(
      'Glyphs of the two formulas: the source on top, the target below',
    );
    expect(key).toHaveAccessibleName('Side by side');
    expect(key).toHaveAttribute('aria-pressed', 'false');
    const offset = (which: string) =>
      screen.getByTestId(`rel-formula-${which}`).getAttribute('transform')!;
    // Stacked, the two copies of the formula are one over the other: the same x.
    const x = (which: string) => Number(/translate\(([-\d.]+) /.exec(offset(which))![1]);
    expect(x('from')).toBe(x('to'));

    await user.click(key);
    expect(drawing).toHaveAttribute('data-layout', 'side');
    expect(key).toHaveAttribute('aria-pressed', 'true');
    expect(drawing).toHaveAccessibleName(
      'Glyphs of the two formulas: the source at the left, the target at the right',
    );
    expect(x('from')).toBeLessThan(x('to'));
    // The link is still drawn, as an arc now, with its badge.
    expect(screen.getByTestId('rel-link-0')).toBeInTheDocument();
    expect(screen.getByTestId('rel-junction-0')).toBeInTheDocument();
    await user.click(key);
    expect(drawing).toHaveAttribute('data-layout', 'stacked');
  });

  it('names its sides as its editor calls them, and asks its editor for another layout', async () => {
    const one = await side('a+b');
    const setLayout = vi.fn();
    const stage = { layout: 'side' as const, setLayout, view: null, setView: vi.fn() };
    const label = { drawing: 'The formula twice', from: 'sources', to: 'targets' };
    render(<GlyphLinkCanvas {...canvas(one, { stage, label, testIdPrefix: 'morph' })} />);
    expect(screen.getByTestId('morph-canvas')).toHaveAccessibleName(
      'The formula twice: the sources at the left, the targets at the right',
    );
    expect(screen.getByTestId('morph-toggle-layout')).toHaveAttribute('aria-pressed', 'true');
    await userEvent.setup().click(screen.getByTestId('morph-toggle-layout'));
    expect(setLayout).toHaveBeenCalledWith('stacked');
  });
});

describe('GlyphLinkCanvas notes', () => {
  it('adds a hint to the tooltip of a glyph that can take part, without dimming it', async () => {
    const one = await side('a+b');
    render(
      <GlyphLinkCanvas
        {...canvas(one, {
          pairs: [],
          ineligible: { to: new Map([[2, 'on screen earlier']]) },
          notes: {
            to: new Map([
              [0, 'brought by the intro'],
              [2, 'never shown'],
            ]),
          },
        })}
      />,
    );
    const noted = screen.getByTestId('rel-to-glyph-0');
    expect(noted.classList.contains('is-ineligible')).toBe(false);
    expect(noted).toHaveAttribute('data-eligible', 'true');
    expect(noted.querySelector('title')).toHaveTextContent('0: a — brought by the intro');
    expect(noted).toHaveAccessibleName('Glyph 0: a (brought by the intro)');
    // A reason wins over a note; the other side has none.
    expect(screen.getByTestId('rel-to-glyph-2').querySelector('title')).toHaveTextContent(
      '2: b — on screen earlier',
    );
    expect(screen.getByTestId('rel-from-glyph-0').querySelector('title')).toHaveTextContent(
      /^0: a$/,
    );
  });
});

describe('GlyphLinkCanvas spacing', () => {
  /** The height of the drawing's viewBox with these props. */
  function drawnHeight(props: GlyphLinkCanvasProps): number {
    const { unmount } = render(<GlyphLinkCanvas {...props} />);
    const value = Number(screen.getByTestId('rel-canvas').getAttribute('viewBox')!.split(' ')[3]);
    unmount();
    return value;
  }

  it('spaces the copies of a tall formula as those of a short one: by the size of its text', async () => {
    const one = await side('a+b');
    const box = one.resolved.render.bbox;
    // The same glyphs in a box two units taller, as the lines of a derivation would make it.
    const tall = {
      ...one,
      resolved: {
        ...one.resolved,
        render: {
          ...one.resolved.render,
          bbox: { ...box, minY: box.minY - 1, maxY: box.maxY + 1 },
        },
      },
    };
    // Two copies, each two units taller: the gap and the margins are the same.
    expect(drawnHeight(canvas(tall)) - drawnHeight(canvas(one))).toBeCloseTo(4, 3);
  });
});

describe('PairList test ids', () => {
  it('takes a prefix, and keeps `rel` without one', () => {
    const props = {
      pairs: [{ from: [0], to: [1], style: null }],
      pairIssues: noIssues,
      focusPairs: none,
      fromSnap: null,
      toSnap: null,
      defaultStyle: 'copy' as const,
      onStyle: () => {},
      onExtras: () => {},
      onEdit: () => {},
      onDelete: () => {},
      onHover: () => {},
    };
    const { unmount } = render(<PairList {...props} />);
    expect(screen.getByTestId('rel-pair-0-style')).toBeInTheDocument();
    unmount();
    render(<PairList {...props} testIdPrefix="morph" />);
    expect(screen.getByTestId('morph-pairs')).toBeInTheDocument();
    expect(screen.getByTestId('morph-pair-0-text')).toHaveTextContent('0 → 1');
    expect(screen.getByTestId('morph-pair-0-delete')).toBeInTheDocument();
  });

  it('outlines in red dashes the sources its pairs consume, and says which pair does', async () => {
    const one = await side('a+b');
    // Pair 1 transforms glyph 0; pair 2 copies glyph 1.
    const pairs = [
      { from: [0], to: [2], style: null },
      { from: [1], to: [1], style: 'copy' as const },
    ];
    render(<GlyphLinkCanvas {...canvas(one, { pairs, defaultStyle: 'transform' })} />);
    const taken = screen.getByTestId('rel-from-glyph-0');
    expect(taken).toHaveAttribute('data-consumed', 'true');
    expect(taken).toHaveClass('is-consumed');
    expect(taken.querySelector('.rg-consumed')).not.toBeNull();
    expect(taken.querySelector('title')).toHaveTextContent(
      '0: a — pair 1 consumes it (Transform): another pair can only copy it',
    );
    expect(taken).toHaveAccessibleName(
      'Glyph 0: a (pair 1 consumes it (Transform): another pair can only copy it)',
    );
    // A copied source stays, and so does every target: no outline.
    const copied = screen.getByTestId('rel-from-glyph-1');
    expect(copied).toHaveAttribute('data-consumed', 'false');
    expect(copied.querySelector('.rg-consumed')).toBeNull();
    expect(screen.getByTestId('rel-to-glyph-2')).toHaveAttribute('data-consumed', 'false');
    expect(screen.getByTestId('rel-to-glyph-0')).toHaveAttribute('data-consumed', 'false');
  });

  it('follows the style a pair inherits: copied by default, nothing is consumed', async () => {
    const one = await side('a+b');
    const { rerender } = render(<GlyphLinkCanvas {...canvas(one)} />); // inherits Copy
    expect(screen.getByTestId('rel-from-glyph-0')).toHaveAttribute('data-consumed', 'false');
    rerender(<GlyphLinkCanvas {...canvas(one, { defaultStyle: 'fade' })} />);
    expect(screen.getByTestId('rel-from-glyph-0')).toHaveAttribute('data-consumed', 'true');
    expect(screen.getByTestId('rel-from-glyph-0').querySelector('title')).toHaveTextContent(
      'pair 1 consumes it (Fade transform)',
    );
  });

  it('outlines the sources something else consumes, with what it is told of them', async () => {
    const one = await side('a+b');
    const consumed = {
      from: new Map([[1, 'a Morph block consumes it: here it can only be copied']]),
    };
    render(<GlyphLinkCanvas {...canvas(one, { consumed })} />);
    const glyph = screen.getByTestId('rel-from-glyph-1');
    expect(glyph).toHaveAttribute('data-consumed', 'true');
    expect(glyph.querySelector('title')).toHaveTextContent(
      '1: + — a Morph block consumes it: here it can only be copied',
    );
    // The same index on the target side is another glyph's.
    expect(screen.getByTestId('rel-to-glyph-1')).toHaveAttribute('data-consumed', 'false');
  });

  it('says why a glyph is dimmed rather than who consumes it, when both hold', async () => {
    const one = await side('a+b');
    const pairs = [{ from: [0], to: [2], style: 'transform' as const }];
    const ineligible = { from: new Map([[0, 'consumed earlier by the relation a → b']]) };
    render(<GlyphLinkCanvas {...canvas(one, { pairs, ineligible })} />);
    const glyph = screen.getByTestId('rel-from-glyph-0');
    expect(glyph).toHaveAttribute('data-consumed', 'true');
    expect(glyph.querySelector('title')).toHaveTextContent(
      '0: a — consumed earlier by the relation a → b',
    );
  });
});
