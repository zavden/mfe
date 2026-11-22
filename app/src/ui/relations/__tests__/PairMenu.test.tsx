import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { arcSpline } from '../../../geom';
import type { GlyphPair } from '../../../model';
import { PairMenu } from '../PairMenu';

const pairs: GlyphPair[] = [{ from: [0], to: [1], style: null }];
const menu = { indices: [0], x: 10, y: 10, align: 'start' as const };

describe('PairMenu test ids', () => {
  it('keeps `rel` without a prefix and takes another one', async () => {
    const props = {
      menu,
      pairs,
      defaultStyle: 'copy' as const,
      pathArc: 0,
      fromSnap: null,
      toSnap: null,
      onDelete: () => {},
      onClose: () => {},
    };
    const { unmount } = render(<PairMenu {...props} onStyle={() => {}} />);
    expect(screen.getByTestId('rel-style-menu')).toBeInTheDocument();
    expect(screen.getByTestId('rel-style-menu-inherit')).toHaveTextContent('Inherit: Copy');
    unmount();
    const onStyle = vi.fn();
    render(<PairMenu {...props} onStyle={onStyle} testIdPrefix="morph" />);
    expect(screen.queryByTestId('rel-style-menu')).toBeNull();
    expect(screen.getByTestId('morph-style-menu-header')).toHaveTextContent('0 → 1');
    expect(screen.getByTestId('morph-style-menu-delete')).toBeInTheDocument();
    await userEvent.setup().click(screen.getByTestId('morph-style-menu-fade'));
    expect(onStyle).toHaveBeenCalledWith([0], 'fade');
  });
});

describe('PairMenu «Link as»', () => {
  const base = {
    pairs,
    defaultStyle: 'transform' as const,
    pathArc: 0,
    fromSnap: null,
    toSnap: null,
    onStyle: () => {},
    onDelete: () => {},
    onClose: () => {},
  };
  const offer = {
    label: 'a → b',
    from: [2],
    to: [3],
    joins: null,
    refused: null,
    choices: [
      {
        key: 'transform',
        style: 'transform' as const,
        separate: false,
        label: 'Link as Transform',
        blocked: 'It is consumed.',
        warning: null,
      },
      {
        key: 'copy',
        style: 'copy' as const,
        separate: false,
        label: 'Link as Copy',
        blocked: null,
        warning: 'It is hidden then.',
      },
      {
        key: 'fade',
        style: 'fade' as const,
        separate: false,
        label: 'Link as Fade transform',
        blocked: null,
        warning: null,
      },
    ],
  };

  it('is the link alone when no pair holds the glyphs: the styles, a blocked one over its reason', async () => {
    const onLinkAs = vi.fn();
    render(<PairMenu {...base} menu={{ ...menu, indices: [], link: offer }} onLinkAs={onLinkAs} />);
    expect(screen.getByTestId('rel-link-as-header')).toHaveTextContent('Link a → b');
    const transform = screen.getByTestId('rel-link-as-transform');
    expect(transform).toBeDisabled();
    expect(transform).toHaveAccessibleDescription('It is consumed.');
    expect(screen.getByTestId('rel-link-as-copy')).toBeEnabled();
    expect(screen.getByTestId('rel-link-as-copy-note')).toHaveTextContent(
      'Warning: It is hidden then.',
    );
    expect(screen.queryByTestId('rel-link-as-fade-note')).toBeNull();
    // Nothing about pairs: there are none to change.
    expect(screen.queryByTestId('rel-style-menu-header')).toBeNull();
    expect(screen.queryByTestId('rel-style-menu-inherit')).toBeNull();
    expect(screen.queryByTestId('rel-style-menu-delete')).toBeNull();
    await userEvent.setup().click(screen.getByTestId('rel-link-as-copy'));
    expect(onLinkAs).toHaveBeenCalledWith('copy', false);
  });

  it('comes before the pairs that hold the glyphs, and says a shared reason once', async () => {
    const onLinkAs = vi.fn();
    const refused = {
      ...offer,
      joins: 0,
      refused: 'Source glyph a (2) is in pair 1 already.',
      choices: [
        {
          key: 'join',
          style: null,
          separate: false,
          label: 'Join pair 1 (Transform)',
          blocked: 'Source glyph a (2) is in pair 1 already.',
          warning: null,
        },
      ],
    };
    const { unmount } = render(
      <PairMenu {...base} menu={{ ...menu, link: refused }} onLinkAs={onLinkAs} />,
    );
    expect(screen.getByTestId('rel-link-as-join')).toBeDisabled();
    expect(screen.getByTestId('rel-link-as-join')).toHaveAccessibleDescription(refused.refused);
    expect(screen.queryByTestId('rel-link-as-join-note')).toBeNull();
    // Under the link, the pair is told apart by its number.
    expect(screen.getByTestId('rel-style-menu-header')).toHaveTextContent('Pair 1: 0 → 1');
    expect(screen.getByTestId('rel-style-menu-delete')).toBeEnabled();
    unmount();
    const join = {
      ...refused,
      refused: null,
      choices: [{ ...refused.choices[0]!, blocked: null }],
    };
    render(<PairMenu {...base} menu={{ ...menu, link: join }} onLinkAs={onLinkAs} />);
    await userEvent.setup().click(screen.getByTestId('rel-link-as-join'));
    expect(onLinkAs).toHaveBeenCalledWith(null, false);
  });

  it('is not shown by an editor that does not link from the menu', () => {
    render(<PairMenu {...base} menu={{ ...menu, indices: [], link: offer }} />);
    expect(screen.queryByTestId('rel-link-as-header')).toBeNull();
    expect(screen.getByTestId('rel-style-menu-header')).toHaveTextContent(
      'The selected glyphs are not linked',
    );
  });
});

describe('PairMenu split and join', () => {
  const base = {
    defaultStyle: 'transform' as const,
    pathArc: 0,
    fromSnap: null,
    toSnap: null,
    onStyle: () => {},
    onDelete: () => {},
    onClose: () => {},
  };
  const at = (index: number) => ({ indices: [index], x: 10, y: 10, align: 'start' as const });

  it('offers Split for one pair of several sources onto one target', async () => {
    const onSplit = vi.fn();
    const pairs: GlyphPair[] = [
      { from: [0, 1], to: [5], style: null },
      { from: [2], to: [6], style: null },
      { from: [3, 4], to: [7, 8], style: null },
    ];
    const { unmount } = render(
      <PairMenu {...base} pairs={pairs} menu={at(0)} onSplit={onSplit} onJoin={() => {}} />,
    );
    expect(screen.queryByTestId('rel-style-menu-join')).toBeNull();
    await userEvent.setup().click(screen.getByTestId('rel-style-menu-split'));
    expect(onSplit).toHaveBeenCalledWith(0);
    unmount();
    // One source, or several targets: nothing to take apart.
    for (const index of [1, 2]) {
      const view = render(
        <PairMenu {...base} pairs={pairs} menu={at(index)} onSplit={onSplit} onJoin={() => {}} />,
      );
      expect(screen.queryByTestId('rel-style-menu-split')).toBeNull();
      view.unmount();
    }
    // Several pairs selected: the entry is for one pair.
    render(
      <PairMenu
        {...base}
        pairs={pairs}
        menu={{ ...at(0), indices: [0, 1] }}
        onSplit={onSplit}
        onJoin={() => {}}
      />,
    );
    expect(screen.queryByTestId('rel-style-menu-split')).toBeNull();
  });

  it('offers Join for a pair whose target other pairs bring too', async () => {
    const onJoin = vi.fn();
    const pairs: GlyphPair[] = [
      { from: [0], to: [5], style: null },
      { from: [2], to: [6], style: null },
      { from: [1], to: [5], style: 'copy' },
    ];
    const { unmount } = render(
      <PairMenu {...base} pairs={pairs} menu={at(2)} onSplit={() => {}} onJoin={onJoin} />,
    );
    expect(screen.queryByTestId('rel-style-menu-split')).toBeNull();
    await userEvent.setup().click(screen.getByTestId('rel-style-menu-join'));
    expect(onJoin).toHaveBeenCalledWith(2);
    unmount();
    render(<PairMenu {...base} pairs={pairs} menu={at(1)} onSplit={() => {}} onJoin={onJoin} />);
    expect(screen.queryByTestId('rel-style-menu-join')).toBeNull();
  });

  it('greys Join out over its reason when one pair could not play what the pairs play', () => {
    const onJoin = vi.fn();
    const pairs: GlyphPair[] = [
      { from: [0], to: [5], style: 'fade' },
      { from: [1], to: [5], style: null },
    ];
    render(<PairMenu {...base} pairs={pairs} menu={at(0)} onSplit={() => {}} onJoin={onJoin} />);
    const join = screen.getByTestId('rel-style-menu-join');
    expect(join).toBeDisabled();
    expect(join).toHaveAccessibleDescription(
      'The pairs have styles that one pair cannot hold: give them one style, or one style and copies.',
    );
    expect(screen.getByTestId('rel-style-menu-join-note')).toBeInTheDocument();
  });

  it('is not shown by an editor that does neither', () => {
    const pairs: GlyphPair[] = [{ from: [0, 1], to: [5], style: null }];
    render(<PairMenu {...base} pairs={pairs} menu={at(0)} />);
    expect(screen.queryByTestId('rel-style-menu-split')).toBeNull();
  });
});

describe('PairMenu paths', () => {
  const bump = {
    nodes: [
      {
        at: [0, 0] as [number, number],
        in: null,
        out: [0.3, 0.4] as [number, number],
        smooth: false,
      },
      {
        at: [1, 0] as [number, number],
        in: [0.7, 0.4] as [number, number],
        out: null,
        smooth: false,
      },
    ],
  };
  const props = {
    pairs: [
      { from: [0], to: [1], style: null, path: bump },
      { from: [2], to: [3], style: null },
    ] as GlyphPair[],
    defaultStyle: 'copy' as const,
    pathArc: 0,
    fromSnap: null,
    toSnap: null,
    onStyle: () => {},
    onDelete: () => {},
    onClose: () => {},
  };

  it('offers Edit path… for one pair, and Straight path for pairs with a custom one', async () => {
    const onEditPath = vi.fn();
    const onClearPath = vi.fn();
    const user = userEvent.setup();
    const { unmount } = render(
      <PairMenu {...props} menu={menu} onEditPath={onEditPath} onClearPath={onClearPath} />,
    );
    // The pair's path was edited: its header wears the mark, which says so.
    expect(screen.getByTestId('rel-style-menu-path-dot')).toHaveAccessibleName('Edited path');
    expect(screen.getByTestId('rel-style-menu-path-dot')).toHaveAttribute('title', 'Edited path');
    await user.click(screen.getByTestId('rel-style-menu-edit-path'));
    expect(onEditPath).toHaveBeenCalledWith(0);
    await user.click(screen.getByTestId('rel-style-menu-clear-path'));
    expect(onClearPath).toHaveBeenCalledWith([0]);
    unmount();
    // Several pairs: no Edit path…; Straight path names those with a custom path only.
    render(
      <PairMenu
        {...props}
        menu={{ ...menu, indices: [0, 1] }}
        onEditPath={onEditPath}
        onClearPath={onClearPath}
      />,
    );
    expect(screen.queryByTestId('rel-style-menu-edit-path')).toBeNull();
    expect(screen.queryByTestId('rel-style-menu-path-dot')).toBeNull();
    await user.click(screen.getByTestId('rel-style-menu-clear-path'));
    expect(onClearPath).toHaveBeenLastCalledWith([0]);
  });

  it('shows neither without the handlers, nor Straight path for a plain pair', () => {
    render(
      <PairMenu
        {...props}
        menu={{ ...menu, indices: [1] }}
        onEditPath={() => {}}
        onClearPath={() => {}}
      />,
    );
    expect(screen.getByTestId('rel-style-menu-edit-path')).toBeInTheDocument();
    expect(screen.queryByTestId('rel-style-menu-clear-path')).toBeNull();
    expect(screen.queryByTestId('rel-style-menu-path-dot')).toBeNull();
  });

  it("marks no pair whose stored path is the holder's own arc", () => {
    const arc = arcSpline(40);
    render(
      <PairMenu
        {...props}
        pairs={[{ from: [0], to: [1], style: null, path: arc }]}
        pathArc={40}
        menu={menu}
        onEditPath={() => {}}
      />,
    );
    expect(screen.getByTestId('rel-style-menu-header')).toHaveTextContent('0 → 1');
    expect(screen.queryByTestId('rel-style-menu-path-dot')).toBeNull();
  });
});
