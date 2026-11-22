/* Glyph matching between two decompositions of the same (or an edited) formula.
 *
 * 'position' (same formula, different renderer): Hungarian assignment. Each side's glyph
 * centres are expressed relative to its union-box centre and divided by its union height, so
 * renders of different size and calibration compare directly. Cost = distance between
 * normalised centres + small penalties for size difference and known-label disagreement. Every
 * row may also stay unmatched at a fixed cost (one formula height), so rectangular inputs and
 * outliers map to null instead of forcing a bad pair.
 *
 * 'edit' (the LaTeX changed; both sides from the same backend, so orders are comparable):
 *   1. global sequence alignment (Needleman–Wunsch) that only aligns equal labels, with a
 *      position-aware match cost (x from the left edge, y from the centre, in formula heights);
 *   2. leftover glyphs with equal labels are paired by position (moved glyphs: a+b → b+a);
 *   3. leftovers between the same aligned anchors are paired in order when they are close
 *      (substitutions: \frac{a}{b} → \frac{a}{c}).
 *
 * Labels are compared after normalizeLabel; "?" (unknown) never agrees or disagrees. */
import { normalizeLabel } from './glyphs';
import { hungarian } from './hungarian';
import type { GlyphLike, GlyphMatch, MatchMode } from './types';

/** Weight of the normalised size difference (|Δw| + |Δh|) in the position cost. */
const SIZE_WEIGHT = 0.25;
/** Added to the position cost when both labels are known and differ. */
const LABEL_PENALTY = 0.15;
/** Cost of leaving a glyph unmatched (in formula heights). */
const UNMATCHED_COST = 1;

/** Edit mode: cost of a gap, weight of the positional term, max distance for a substitution. */
const GAP_COST = 0.6;
const EDIT_POSITION_WEIGHT = 0.25;
const SUBSTITUTION_MAX_DISTANCE = 0.5;

interface Normalised {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
}

type Anchor = 'center' | 'left';

function normalise(glyphs: readonly GlyphLike[], anchor: Anchor): Normalised[] {
  if (glyphs.length === 0) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const g of glyphs) {
    minX = Math.min(minX, g.center[0] - g.size[0] / 2);
    maxX = Math.max(maxX, g.center[0] + g.size[0] / 2);
    minY = Math.min(minY, g.center[1] - g.size[1] / 2);
    maxY = Math.max(maxY, g.center[1] + g.size[1] / 2);
  }
  const unit = maxY - minY || maxX - minX || 1;
  const ox = anchor === 'center' ? (minX + maxX) / 2 : minX;
  const oy = (minY + maxY) / 2;
  return glyphs.map((g) => ({
    x: (g.center[0] - ox) / unit,
    y: (g.center[1] - oy) / unit,
    w: g.size[0] / unit,
    h: g.size[1] / unit,
    label: normalizeLabel(g.label),
  }));
}

const dist = (a: Normalised, b: Normalised) => Math.hypot(a.x - b.x, a.y - b.y);
const known = (label: string) => label !== '?' && label !== '';

/** 1 = labels agree, 0 = both known and differ, null = at least one unknown. */
function labelAgreement(a: Normalised, b: Normalised): number | null {
  if (!known(a.label) || !known(b.label)) return null;
  return a.label === b.label ? 1 : 0;
}

function matchByPosition(from: readonly GlyphLike[], to: readonly GlyphLike[]): GlyphMatch {
  const a = normalise(from, 'center');
  const b = normalise(to, 'center');
  if (a.length === 0) return { map: [], confidence: b.length === 0 ? 1 : 0 };
  if (b.length === 0) return { map: a.map(() => null), confidence: 0 };

  // Columns 0…m-1 are real glyphs; column m+i means "row i unmatched".
  const m = b.length;
  const cost = a.map((p, i) => {
    const row = b.map(
      (q) =>
        dist(p, q) +
        SIZE_WEIGHT * (Math.abs(p.w - q.w) + Math.abs(p.h - q.h)) +
        (labelAgreement(p, q) === 0 ? LABEL_PENALTY : 0),
    );
    for (let k = 0; k < a.length; k++) row.push(k === i ? UNMATCHED_COST : 1e6);
    return row;
  });
  const { assignment } = hungarian(cost);
  const map = assignment.map((j) => (j >= 0 && j < m ? j : null));

  // Confidence: per matched pair, a residual score (1 up to 0.1 formula heights, then a
  // Gaussian falloff) times a label factor; blended mean/min, times coverage.
  const scores: number[] = [];
  map.forEach((j, i) => {
    if (j === null) return;
    const r = dist(a[i]!, b[j]!);
    const agreement = labelAgreement(a[i]!, b[j]!);
    const labelFactor = agreement === 1 ? 1 : agreement === 0 ? 0.6 : 0.9;
    scores.push(labelFactor * Math.exp(-((Math.max(0, r - 0.1) / 0.3) ** 2)));
  });
  if (scores.length === 0) return { map, confidence: 0 };
  const mean = scores.reduce((s, v) => s + v, 0) / scores.length;
  const min = Math.min(...scores);
  const coverage = scores.length / Math.max(a.length, b.length);
  return { map, confidence: coverage * (0.7 * mean + 0.3 * min) };
}

function matchByEdit(from: readonly GlyphLike[], to: readonly GlyphLike[]): GlyphMatch {
  const a = normalise(from, 'left');
  const b = normalise(to, 'left');
  const n = a.length;
  const m = b.length;
  if (n === 0) return { map: [], confidence: 1 };

  // 1. Needleman–Wunsch restricted to equal labels (cost minimisation).
  const D: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = 1; i <= n; i++) D[i]![0] = i * GAP_COST;
  for (let j = 1; j <= m; j++) D[0]![j] = j * GAP_COST;
  const matchCost = (i: number, j: number) =>
    known(a[i]!.label) && a[i]!.label === b[j]!.label
      ? EDIT_POSITION_WEIGHT * dist(a[i]!, b[j]!)
      : Infinity;
  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      D[i]![j] = Math.min(
        D[i - 1]![j - 1]! + matchCost(i - 1, j - 1),
        D[i - 1]![j]! + GAP_COST,
        D[i]![j - 1]! + GAP_COST,
      );
    }
  }
  const map: (number | null)[] = new Array<number | null>(n).fill(null);
  const kind: ('equal' | 'moved' | 'substituted' | null)[] = new Array(n).fill(null);
  for (let i = n, j = m; i > 0 && j > 0;) {
    const here = D[i]![j]!;
    if (Math.abs(here - (D[i - 1]![j - 1]! + matchCost(i - 1, j - 1))) < 1e-12) {
      map[i - 1] = j - 1;
      kind[i - 1] = 'equal';
      i--;
      j--;
    } else if (Math.abs(here - (D[i - 1]![j]! + GAP_COST)) < 1e-12) i--;
    else j--;
  }

  const usedTo = new Set(map.filter((j): j is number => j !== null));
  const freeFrom = () => a.map((_, i) => i).filter((i) => map[i] === null);
  const freeTo = () => b.map((_, j) => j).filter((j) => !usedTo.has(j));

  // 2. Moved glyphs: equal labels among the leftovers, paired by position.
  {
    const rows = freeFrom();
    const cols = freeTo();
    if (rows.length > 0 && cols.length > 0) {
      const cost = rows.map((i) =>
        cols.map((j) =>
          known(a[i]!.label) && a[i]!.label === b[j]!.label ? dist(a[i]!, b[j]!) : 1e6,
        ),
      );
      hungarian(cost).assignment.forEach((c, r) => {
        if (c < 0 || cost[r]![c]! >= 1e6) return;
        map[rows[r]!] = cols[c]!;
        kind[rows[r]!] = 'moved';
        usedTo.add(cols[c]!);
      });
    }
  }

  // 3. Substitutions: leftovers between the same anchors (nearest aligned glyphs before them),
  // paired in order when close.
  {
    const anchorOf = (i: number) => {
      for (let k = i - 1; k >= 0; k--) if (kind[k] === 'equal') return map[k]!;
      return -1;
    };
    const rows = freeFrom();
    const cols = freeTo();
    const takenCols = new Set<number>();
    for (const i of rows) {
      const anchor = anchorOf(i);
      let nextAnchor = m;
      for (let k = i + 1; k < n; k++)
        if (kind[k] === 'equal') {
          nextAnchor = map[k]!;
          break;
        }
      const j = cols.find(
        (c) =>
          !takenCols.has(c) &&
          c > anchor &&
          c < nextAnchor &&
          dist(a[i]!, b[c]!) <= SUBSTITUTION_MAX_DISTANCE,
      );
      if (j === undefined) continue;
      takenCols.add(j);
      map[i] = j;
      kind[i] = 'substituted';
    }
  }

  const weights = { equal: 1, moved: 0.8, substituted: 0.5 } as const;
  const total = kind.reduce((s, k) => s + (k ? weights[k] : 0.7), 0);
  return { map, confidence: total / n };
}

/** A layout change keeps the source's ordered occurrences even when they move between rows.
 * When wrapping changes the glyph sequence (hyphenation/ligatures), align only known equal
 * labels, without assigning a repeated letter to whichever row happens to be nearest. Such a
 * partial match is explicitly uncertain; no changed glyph is guessed to be a substitution. */
function matchBySequence(from: readonly GlyphLike[], to: readonly GlyphLike[]): GlyphMatch {
  const a = from.map((glyph) => normalizeLabel(glyph.label));
  const b = to.map((glyph) => normalizeLabel(glyph.label));
  if (a.length === b.length && a.every((label, index) => label === b[index])) {
    return { map: a.map((_, index) => index), confidence: 1 };
  }
  const lengths = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lengths[i]![j] =
        known(a[i]!) && a[i] === b[j]
          ? 1 + lengths[i + 1]![j + 1]!
          : Math.max(lengths[i + 1]![j]!, lengths[i]![j + 1]!);
    }
  }
  const map: (number | null)[] = a.map(() => null);
  let matched = 0;
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    if (known(a[i]!) && a[i] === b[j]) {
      map[i++] = j++;
      matched++;
    } else if (lengths[i + 1]![j]! > lengths[i]![j + 1]!) i++;
    else j++;
  }
  return { map, confidence: (0.75 * matched) / Math.max(a.length, b.length) };
}

export function matchGlyphs(
  from: readonly GlyphLike[],
  to: readonly GlyphLike[],
  mode: MatchMode,
): GlyphMatch {
  if (mode === 'sequence') return matchBySequence(from, to);
  return mode === 'position' ? matchByPosition(from, to) : matchByEdit(from, to);
}
