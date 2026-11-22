import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { FormulaSnapshot, GlyphPair } from '../../../model';
import { INTRO_CHOICES, OUTRO_CHOICES } from '../../animations/catalogue';
import { PairList, UnpairedPhase } from '../RelationSidebar';
import { PAIR_STYLE_OPTIONS, styleLabel } from '../styleOptions';

/** Three labelled glyphs; where they sit does not matter here. */
const snap: FormulaSnapshot = {
  backend: 'latex',
  key: 'test',
  glyphs: ['a', '+', 'b'].map((label, i) => ({ label, center: [i * 0.3, 0], size: [0.2, 0.3] })),
};

describe('style options', () => {
  it('shortens a style label and offers Inherit before the styles', () => {
    expect(styleLabel('copy')).toBe('Copy');
    expect(styleLabel('transform')).toBe('Transform');
    expect(PAIR_STYLE_OPTIONS[0]).toEqual({ value: 'inherit', label: 'Inherit' });
    expect(PAIR_STYLE_OPTIONS.map((o) => o.value)).toEqual([
      'inherit',
      'transform',
      'copy',
      'fade',
      'fade_copy',
    ]);
    expect(styleLabel('fade_copy')).toBe('Fade copy');
  });
});

describe('UnpairedPhase', () => {
  it('describes the unpaired glyphs of the source and wires the outro fields', async () => {
    const onKind = vi.fn();
    const onMatch = vi.fn();
    render(
      <UnpairedPhase
        phase="outro"
        formulaName="f1"
        glyphs={[0, 2]}
        snap={snap}
        kind="fade_out"
        options={OUTRO_CHOICES}
        onKind={onKind}
        duration={0.5}
        maxDuration={2}
        onDuration={() => {}}
        match={false}
        onMatch={onMatch}
      />,
    );
    expect(screen.getByTestId('rel-unpaired-out')).toHaveTextContent(
      '2 glyphs of f1 are not taken away by a relation or a block (a b). They leave with the outro of that clip:',
    );
    expect(screen.getByTestId('rel-outro-duration')).toBeEnabled();
    await userEvent.selectOptions(screen.getByTestId('rel-outro-kind'), 'none');
    expect(onKind).toHaveBeenCalledWith('none');
    await userEvent.click(screen.getByTestId('rel-match-outro'));
    expect(onMatch).toHaveBeenCalledWith(true);
  });

  it('uses the singular for the target, and disables what a "none" intro leaves moot', () => {
    render(
      <UnpairedPhase
        phase="intro"
        formulaName="f2"
        glyphs={[1]}
        snap={snap}
        kind="none"
        options={INTRO_CHOICES}
        onKind={() => {}}
        duration={0}
        maxDuration={2}
        onDuration={() => {}}
        match={false}
        onMatch={() => {}}
      />,
    );
    expect(screen.getByTestId('rel-unpaired-in')).toHaveTextContent(
      '1 glyph of f2 is not brought in by a relation or a block (+). They enter with the intro of that clip:',
    );
    expect(screen.getByTestId('rel-intro-duration')).toBeDisabled();
    expect(screen.getByTestId('rel-match-intro')).toBeDisabled();
    // No box without something to tell: the source's side never has one.
    expect(screen.queryByTestId('rel-starts-empty')).toBeNull();
  });

  it('offers the target to start empty, and then says its unpaired glyphs stay out', async () => {
    const onStartsEmpty = vi.fn();
    const phase = (startsEmpty: boolean) => (
      <UnpairedPhase
        phase="intro"
        formulaName="f2"
        glyphs={[0, 1]}
        snap={snap}
        kind="fade_in"
        options={INTRO_CHOICES}
        onKind={() => {}}
        duration={0.5}
        maxDuration={2}
        onDuration={() => {}}
        match={false}
        onMatch={() => {}}
        startsEmpty={startsEmpty}
        onStartsEmpty={onStartsEmpty}
      />
    );
    const { rerender } = render(phase(false));
    expect(screen.getByTestId('rel-starts-empty')).not.toBeChecked();
    expect(screen.getByTestId('rel-starts-empty-hint')).toHaveTextContent(
      'Glyphs appear only when a relation, a Morph or an Appear brings them.',
    );
    expect(screen.getByTestId('rel-unpaired-in')).toHaveTextContent(
      'They enter with the intro of that clip:',
    );
    expect(screen.getByTestId('rel-intro-kind')).toBeEnabled();
    await userEvent.click(screen.getByTestId('rel-starts-empty'));
    expect(onStartsEmpty).toHaveBeenCalledWith(true);

    rerender(phase(true));
    expect(screen.getByTestId('rel-starts-empty')).toBeChecked();
    expect(screen.getByTestId('rel-unpaired-in')).toHaveTextContent(
      '2 glyphs of f2 are not brought in by a relation or a block (a +). The clip starts empty: they stay out, unless a Morph or an Appear block of the clip brings them.',
    );
    // The intro has no glyph left: its fields wait.
    expect(screen.getByTestId('rel-intro-kind')).toBeDisabled();
    expect(screen.getByTestId('rel-intro-duration')).toBeDisabled();
    expect(screen.getByTestId('rel-match-intro')).toBeDisabled();
  });
});

describe('PairList', () => {
  it('shows the authored principal and leaves a lost one visible for manual repair', () => {
    render(
      <PairList
        pairs={[
          { from: [0, 2], to: [1], style: null, extras: 'copies', principal: 2 },
          { from: [], to: [0], style: 'copy', extras: 'copies', principal: null },
        ]}
        pairIssues={new Map([[1, 'error']])}
        focusPairs={new Set()}
        fromSnap={snap}
        toSnap={snap}
        defaultStyle="transform"
        onStyle={() => {}}
        onExtras={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onHover={() => {}}
      />,
    );
    expect(screen.getByTestId('rel-pair-0-principal')).toHaveTextContent('Principal: b (2)');
    expect(screen.getByTestId('rel-pair-1-principal')).toHaveTextContent('Principal missing');
    expect(screen.getByTestId('rel-pair-1-extras')).toBeEnabled();
    expect(screen.getByTestId('rel-pair-1-edit')).toBeEnabled();
  });

  it('marks a pair with an error in red and one with only warnings in the warning colour', () => {
    render(
      <PairList
        pairs={[
          { from: [0], to: [2], style: null },
          { from: [1], to: [0], style: null },
          { from: [2], to: [1], style: null },
        ]}
        pairIssues={
          new Map([
            [0, 'warning'],
            [1, 'error'],
          ])
        }
        focusPairs={new Set()}
        fromSnap={snap}
        toSnap={snap}
        defaultStyle="transform"
        onStyle={() => {}}
        onExtras={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onHover={() => {}}
      />,
    );
    expect(screen.getByTestId('rel-pair-0')).toHaveClass('is-warned');
    expect(screen.getByTestId('rel-pair-0')).not.toHaveClass('is-bad');
    expect(screen.getByTestId('rel-pair-1')).toHaveClass('is-bad');
    expect(screen.getByTestId('rel-pair-1')).not.toHaveClass('is-warned');
    expect(screen.getByTestId('rel-pair-2')).not.toHaveClass('is-bad');
    expect(screen.getByTestId('rel-pair-2')).not.toHaveClass('is-warned');
  });

  it('lists the pairs with their style and reports the edits', async () => {
    const onStyle = vi.fn();
    const onExtras = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onHover = vi.fn();
    const pairs: GlyphPair[] = [
      { from: [0], to: [2], style: null },
      { from: [1, 2], to: [0], style: 'fade' },
    ];
    render(
      <PairList
        pairs={pairs}
        pairIssues={new Map([[1, 'error']])}
        focusPairs={new Set([0])}
        fromSnap={snap}
        toSnap={snap}
        defaultStyle="transform"
        onStyle={onStyle}
        onExtras={onExtras}
        onEdit={onEdit}
        onDelete={onDelete}
        onHover={onHover}
      />,
    );
    expect(screen.getByRole('heading', { name: 'Pairs (2)' })).toBeInTheDocument();
    // Only a pair of several sources and one target says how the others arrive.
    expect(screen.queryByTestId('rel-pair-0-extras')).not.toBeInTheDocument();
    expect(screen.getByTestId('rel-pair-1-extras')).toHaveValue('separate');
    await userEvent.selectOptions(screen.getByTestId('rel-pair-1-extras'), 'copies');
    expect(onExtras).toHaveBeenCalledWith(1, 'copies');
    expect(screen.getByTestId('rel-pair-0-text')).toHaveTextContent('a → b');
    expect(screen.getByTestId('rel-pair-0')).toHaveClass('is-focus');
    expect(screen.getByTestId('rel-pair-1')).toHaveClass('is-bad');
    expect(screen.getByTestId('rel-pair-0-style')).toHaveValue('inherit');
    expect(screen.getByTestId('rel-pair-1-style')).toHaveValue('fade');
    expect(screen.getAllByRole('option', { name: 'Inherit: Transform' })).toHaveLength(2);

    await userEvent.selectOptions(screen.getByTestId('rel-pair-0-style'), 'copy');
    expect(onStyle).toHaveBeenCalledWith(0, 'copy');
    await userEvent.selectOptions(screen.getByTestId('rel-pair-1-style'), 'inherit');
    expect(onStyle).toHaveBeenCalledWith(1, null);
    await userEvent.click(screen.getByTestId('rel-pair-0-edit'));
    expect(onEdit).toHaveBeenCalledWith(0);
    await userEvent.click(screen.getByTestId('rel-pair-1-delete'));
    expect(onDelete).toHaveBeenCalledWith(1);
    await userEvent.hover(screen.getByTestId('rel-pair-1'));
    expect(onHover).toHaveBeenCalledWith(1);
  });

  it('gives each pair its Edit path… and marks the pairs whose path was edited', async () => {
    const onEditPath = vi.fn();
    /** A path of a pair's own: neither the chord nor the holder's arc. */
    const bump = {
      nodes: [
        { at: [0, 0], in: null, out: [0.3, 0.4], smooth: false },
        { at: [1, 0], in: [0.7, 0.4], out: null, smooth: false },
      ],
    } as NonNullable<GlyphPair['path']>;
    const pairs: GlyphPair[] = [
      { from: [0], to: [0], style: null },
      { from: [1], to: [1], style: null, path: bump },
    ];
    const list = (blocked: string | null) => (
      <PairList
        pairs={pairs}
        pairIssues={new Map()}
        focusPairs={new Set()}
        fromSnap={snap}
        toSnap={snap}
        defaultStyle="transform"
        pathArc={30}
        onEditPath={onEditPath}
        editPathBlocked={blocked}
        onStyle={() => {}}
        onExtras={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onHover={() => {}}
      />
    );
    const { rerender } = render(list(null));
    expect(screen.getByTestId('rel-pair-0-edit-path')).toHaveTextContent('Edit path…');
    expect(screen.queryByTestId('rel-pair-0-path-dot')).not.toBeInTheDocument();
    expect(screen.getByTestId('rel-pair-1-path-dot')).toHaveAccessibleName('Edited path');
    await userEvent.click(screen.getByTestId('rel-pair-1-edit-path'));
    expect(onEditPath).toHaveBeenCalledExactlyOnceWith(1);

    // While the draft cannot be saved the button is off and says why.
    rerender(list('Fix the problems listed first'));
    expect(screen.getByTestId('rel-pair-1-edit-path')).toBeDisabled();
    expect(screen.getByTestId('rel-pair-1-edit-path')).toHaveAttribute(
      'title',
      'Fix the problems listed first',
    );
  });

  it('has no Edit path… where the editor gives none', () => {
    render(
      <PairList
        pairs={[{ from: [0], to: [0], style: null }]}
        pairIssues={new Map()}
        focusPairs={new Set()}
        fromSnap={snap}
        toSnap={snap}
        defaultStyle="transform"
        onStyle={() => {}}
        onExtras={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onHover={() => {}}
      />,
    );
    expect(screen.queryByTestId('rel-pair-0-edit-path')).not.toBeInTheDocument();
  });

  it('says so when there are no pairs', () => {
    render(
      <PairList
        pairs={[]}
        pairIssues={new Map()}
        focusPairs={new Set()}
        fromSnap={snap}
        toSnap={snap}
        defaultStyle="transform"
        onStyle={() => {}}
        onExtras={() => {}}
        onEdit={() => {}}
        onDelete={() => {}}
        onHover={() => {}}
      />,
    );
    expect(screen.getByText('No pairs yet.')).toBeInTheDocument();
  });
});
