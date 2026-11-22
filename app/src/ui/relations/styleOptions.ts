import type { PairExtras, RelationStyle } from '../../model';

export const STYLE_OPTIONS: readonly { value: RelationStyle; label: string }[] = [
  { value: 'transform', label: 'Transform' },
  { value: 'copy', label: 'Copy (source stays)' },
  { value: 'fade', label: 'Fade transform' },
  { value: 'fade_copy', label: 'Fade copy (source stays)' },
];

/** A style's label without its parenthesis, for "Inherit: Transform". */
export const styleLabel = (style: RelationStyle): string =>
  (STYLE_OPTIONS.find((o) => o.value === style)?.label ?? style).split(' (')[0]!;

/** How the sources of a pair of several onto one target reach it (`GlyphPair.extras`, D54). */
export const EXTRAS_OPTIONS: readonly { value: PairExtras; label: string; title: string }[] = [
  {
    value: 'separate',
    label: 'Separate',
    title: 'Each source makes its own transform onto the target: all of them arrive.',
  },
  {
    value: 'merge',
    label: 'Merge (Manim)',
    title:
      "Manim's alignment of the two groups: the sources beyond the first fade into the target.",
  },
  {
    value: 'copies',
    label: 'Copies',
    title:
      'The authored principal transforms; the others send a copy and stay. Initially the lowest source index, preserved when glyph order changes.',
  },
];

/** The style choices of one pair: the relation's default, or one of its own. */
export const PAIR_STYLE_OPTIONS: readonly { value: string; label: string }[] = [
  { value: 'inherit', label: 'Inherit' },
  ...STYLE_OPTIONS.map((o) => ({ value: o.value as string, label: o.label })),
];
