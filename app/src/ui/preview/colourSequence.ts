/* A colour sequence (D92): the own colours of some glyphs of an object, taken from a glyph pick
 * of the preview (`glyphPick.ts`) to be put on another pick — of the same object or of another:
 * the «abc» of a formula onto the «$abc$» of a LaTeX text.
 *
 * A glyph takes the colour of the copied glyph that is the same symbol; of several glyphs that
 * are the same symbol, the first takes the first's, the second the second's… in glyph order,
 * which is Manim's. So the same expression in two objects is coloured alike even where their
 * glyph orders differ: a formula is set in display style and the «$…$» of a text in inline
 * style, and TeX writes a sum's upper limit before the ∑ in the first and after it in the second
 * («n ∑ i = 1» against «∑ n i = 1»). Where the two orders agree, this is the copied order itself.
 *
 * Why not by where the glyphs are: measured on 38 expressions set both ways (the fixture of the
 * tests), the nearest glyph of the same symbol is the wrong one in long expressions — a text
 * wraps, a formula does not — while the order among equal symbols is right in all but one made
 * for the purpose, a sum inside its own upper limit.
 *
 * Both picks must hold the same symbols, each as many times: otherwise nothing is paired, and the
 * reason says what differs.
 *
 * Two things the symbols do not tell are told to whoever pastes (`pasteNote`). Glyphs nobody
 * could name («?»: a font the companion has no table for) count as one symbol, so they are
 * paired with one another in glyph order, whatever each of them is. And two picks rendered by
 * different backends — a formula still on MathJax, a text already on LaTeX — have their glyphs
 * in different orders, so equal symbols may be paired in another order than they read.
 *
 * Pure: no DOM, no stores. */
import { displayLabel, normalizeLabel } from '../../engine';
import type { Formula, RenderBackend } from '../../model';

/** One copied glyph. */
export interface ColourSequenceEntry {
  /** Its symbol, as the snapshot labels it ("x", "∑", "—" for a rule). */
  label: string;
  /** Its own colour (`Formula.glyphColors`); null when it has none and follows its object's. */
  color: string | null;
}

/** What Copy colour sequence takes. */
export interface ColourSequence {
  /** One entry per copied glyph, in glyph order. */
  entries: readonly ColourSequenceEntry[];
  /** The name of the object they were copied from, for the menus. */
  from: string;
  /** What rendered them (`Formula.snapshot.backend`): their order is that backend's. */
  backend: RenderBackend;
}

/** How a sequence goes onto a pick: the colour each picked glyph takes, in glyph order (null: it
 * loses its own), or why it does not go. */
export type SequencePairing =
  | {
      ok: true;
      colors: (string | null)[];
      /** For each picked glyph, the copied entry it takes its colour from. */
      from: number[];
      /** Whether some glyph takes the colour of an entry at another place of the sequence: the
       * two picks are the same symbols in another order. */
      reordered: boolean;
      /** How many of the glyphs have no known symbol («?»). They count as one symbol: from two
       * on, they are paired with one another in glyph order, whatever each of them is. */
      unlabelled: number;
      /** The backends of the copied glyphs and of the picked ones, when they differ and some
       * symbol comes more than once — equal symbols may then be paired in another order than
       * they read; null otherwise. */
      mixed: { from: RenderBackend; to: RenderBackend } | null;
    }
  | { ok: false; reason: string };

/** How many symbols a reason lists before it cuts the list short. */
const LISTED = 6;
/** The label of a glyph nobody could name (`engine/glyphs.ts`). */
const UNKNOWN = '?';
/** The backends, as the status bar names them (`engineStatus.ts`). */
const RENDERER: Record<RenderBackend, string> = {
  mathjax: 'MathJax',
  latex: 'LaTeX',
  pango: 'Pango',
};

/** The labels of `glyphs` of `formula` (canonical indices), or null when its snapshot lacks one
 * of them. */
export function glyphLabels(formula: Formula, glyphs: readonly number[]): string[] | null {
  const known = formula.snapshot?.glyphs;
  if (!known) return null;
  const labels: string[] = [];
  for (const glyph of glyphs) {
    const label = known[glyph]?.label;
    if (label === undefined) return null;
    labels.push(label);
  }
  return labels;
}

/** The colour sequence of `glyphs` of `formula` (canonical indices, ascending): their symbols
 * and their own colours. Null when there is nothing to copy: no glyph, or one the snapshot does
 * not have. */
export function colourSequenceOf(
  formula: Formula,
  glyphs: readonly number[],
): ColourSequence | null {
  const labels = glyphLabels(formula, glyphs);
  if (!labels || labels.length === 0 || !formula.snapshot) return null;
  return {
    entries: glyphs.map((glyph, index) => ({
      label: labels[index]!,
      color: formula.glyphColors[String(glyph)] ?? null,
    })),
    from: formula.name,
    backend: formula.snapshot.backend,
  };
}

const plural = (count: number) => `${count} glyph${count === 1 ? '' : 's'}`;

function listed(labels: readonly string[]): string {
  const shown = labels.slice(0, LISTED).map(displayLabel).join(' ');
  return labels.length > LISTED ? `${shown} …` : shown;
}

/** Pair the copied `sequence` with the glyphs of a pick, whose labels come in glyph order;
 * `backend` is what rendered the pick (the sequence's own, when it is not said). */
export function pairColourSequence(
  sequence: ColourSequence,
  labels: readonly string[],
  backend: RenderBackend = sequence.backend,
): SequencePairing {
  const { entries } = sequence;
  if (entries.length !== labels.length) {
    return {
      ok: false,
      reason: `The copied sequence has ${plural(entries.length)}; this selection has ${labels.length}.`,
    };
  }
  // The copied entries of each symbol, in order: a picked glyph takes the next of its symbol.
  const waiting = new Map<string, number[]>();
  entries.forEach((entry, index) => {
    const symbol = normalizeLabel(entry.label);
    const queue = waiting.get(symbol);
    if (queue) queue.push(index);
    else waiting.set(symbol, [index]);
  });
  const from: number[] = [];
  const unpaired: string[] = [];
  for (const label of labels) {
    const next = waiting.get(normalizeLabel(label))?.shift();
    if (next === undefined) unpaired.push(label);
    else from.push(next);
  }
  if (unpaired.length > 0) {
    const left = [...waiting.values()].flat().sort((a, b) => a - b);
    return {
      ok: false,
      reason:
        `The symbols differ: the copied sequence has ${listed(left.map((i) => entries[i]!.label))} ` +
        `where this selection has ${listed(unpaired)}.`,
    };
  }
  const repeats = new Set(labels.map(normalizeLabel)).size < labels.length;
  return {
    ok: true,
    colors: from.map((index) => entries[index]!.color),
    from,
    reordered: from.some((index, at) => index !== at),
    unlabelled: labels.filter((label) => label === UNKNOWN).length,
    mixed: backend !== sequence.backend && repeats ? { from: sequence.backend, to: backend } : null,
  };
}

/** "5 glyphs of f1, 3 coloured", for the menus. */
export function describeColourSequence(sequence: ColourSequence): string {
  const coloured = sequence.entries.filter((entry) => entry.color !== null).length;
  return `${plural(sequence.entries.length)} of ${sequence.from}, ${coloured} coloured`;
}

/** The line under «Paste colour sequence»: what would be pasted and what to know of how it is
 * paired, or why nothing would be — `pairing` is how the copied `sequence` goes onto the pick
 * (null: nothing is copied). */
export function pasteNote(
  sequence: ColourSequence | null,
  pairing: SequencePairing | null,
): string {
  if (!sequence || !pairing) return 'Nothing copied yet.';
  if (!pairing.ok) return pairing.reason;
  const parts = [`${describeColourSequence(sequence)}.`];
  if (pairing.reordered) parts.push('Paired by symbol: the glyph orders differ.');
  // One glyph without a symbol has only its like to go with; from two on, their order decides.
  if (pairing.unlabelled > 1) {
    parts.push(
      `${pairing.unlabelled} glyphs have no known symbol: they are paired in glyph order.`,
    );
  }
  if (pairing.mixed) {
    parts.push(
      `Copied from a ${RENDERER[pairing.mixed.from]} render, pasted on a ` +
        `${RENDERER[pairing.mixed.to]} one: equal symbols may be paired in another order.`,
    );
  }
  return parts.join(' ');
}
