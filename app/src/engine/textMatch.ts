/* Conservative correspondence of font text: source clusters, never visual order or codepoint
 * counts. A changed cluster cannot donate a replacement principal to a retained many-to-one pair.
 *
 * Both sides are layouts: the glyphs of a render with the pieces of the source they stand for.
 * Exact geometry has one glyph per shaping cluster (a ligature spans several characters, an
 * accent may add a second outline to its letter) and their outlines; placeholder boxes have one
 * glyph per grapheme and no outline (`textBoxes.ts`). Between two exact layouts a glyph goes to
 * the glyph of the same cluster. Where boxes are on either side the units differ, so a glyph goes
 * to the first free one whose piece of source holds its own, or lies inside it: the box of the f
 * to the ligature fi, the ligature to the box of its f. No glyph is given twice. Where a cluster
 * has several outlines (a letter and a mark drawn apart), the largest stands for it: it is the
 * letter, whichever comes first in the order they are drawn. */
import {
  isTextBoundary,
  type TextGeometryArtifact,
  type TextGeometryGlyph,
  type TextSourceRange,
} from '../model';
import { textBoxRanges } from './textBoxes';
import type { FormulaRender, GlyphMatch } from './types';

/** A glyph as the correspondence reads it; the outline and box only where there are exact ones. */
type LayoutGlyph = Pick<TextGeometryGlyph, 'index' | 'sourceRanges'> &
  Partial<Pick<TextGeometryGlyph, 'contours' | 'bbox'>>;

export interface TextLayout {
  source: string;
  glyphs: readonly LayoutGlyph[];
  /** Placeholder boxes: one glyph per grapheme. */
  boxes: boolean;
}

/** The layout of the boxes of `source` (`ranges`: the ones a render carries, else the source's
 * own, which are the same). */
export function textBoxesLayout(
  source: string,
  ranges: readonly TextSourceRange[] = textBoxRanges(source),
): TextLayout {
  return {
    source,
    glyphs: ranges.map((range, index) => ({ index, sourceRanges: [range] })),
    boxes: true,
  };
}

export const textGeometryLayout = (text: TextGeometryArtifact): TextLayout => ({
  source: text.basis.source,
  glyphs: text.glyphs,
  boxes: false,
});

/** The layout a render of a font text carries: its geometry's, or its boxes'; null when it has
 * neither (boxes drawn where saved glyphs were know no source range). */
export function textLayoutOf(render: FormulaRender): TextLayout | null {
  if (render.text) return textGeometryLayout(render.text);
  if (render.boxes) return textBoxesLayout(render.boxes.source, render.boxes.ranges);
  return null;
}

function unchangedEdges(a: string, b: string): { prefix: number; suffix: number } {
  let prefix = 0;
  let suffix = 0;
  const min = Math.min(a.length, b.length);
  while (prefix < min && a[prefix] === b[prefix]) prefix++;
  while (suffix < min && a[a.length - 1 - suffix] === b[b.length - 1 - suffix]) suffix++;
  // Overlapping equal occurrences cannot identify which repeated source occurrence survived.
  const safePrefix = Math.min(prefix, a.length - suffix, b.length - suffix);
  suffix = Math.min(suffix, a.length - prefix, b.length - prefix);
  prefix = safePrefix;
  while (prefix > 0 && (!isTextBoundary(a, prefix) || !isTextBoundary(b, prefix))) prefix--;
  while (
    suffix > 0 &&
    (!isTextBoundary(a, a.length - suffix) || !isTextBoundary(b, b.length - suffix))
  )
    suffix--;
  return { prefix, suffix };
}

function shapeSignature(glyph: LayoutGlyph): string {
  const { minX, minY, maxX, maxY } = glyph.bbox ?? { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  const unit = Math.max(maxX - minX, maxY - minY, 1e-9);
  return JSON.stringify(
    (glyph.contours ?? []).map((contour) =>
      contour.map((value, i) => Math.round(((value - (i % 2 ? minY : minX)) / unit) * 1e6)),
    ),
  );
}

const within = (inner: TextSourceRange, outer: TextSourceRange) =>
  inner.start >= outer.start && inner.end <= outer.end && inner.end > inner.start;

/** Between layouts of different units: each glyph, in order, to the first free glyph one of
 * whose pieces of source holds one of its own or lies inside it. A glyph that finds its piece of
 * source taken (the second letter of a ligature) has no glyph, and is no doubt either: the
 * confidence counts it as told. */
function matchByContainment(
  from: TextLayout,
  to: TextLayout,
  mapped: (ranges: readonly TextSourceRange[]) => TextSourceRange[] | null,
): GlyphMatch {
  // The pieces of the other side by where they start: the ones that can hold a range, or lie
  // inside it, start within the longest piece of it.
  const pieces = to.glyphs
    .flatMap((glyph) =>
      glyph.sourceRanges.map((range) => ({ ...range, index: glyph.index, area: area(glyph) })),
    )
    .sort((a, b) => a.start - b.start || a.index - b.index);
  const longest = pieces.reduce((length, piece) => Math.max(length, piece.end - piece.start), 0);
  const firstFrom = (start: number): number => {
    let low = 0;
    let high = pieces.length;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (pieces[middle]!.start < start) low = middle + 1;
      else high = middle;
    }
    return low;
  };
  const taken = new Set<number>();
  let told = 0;
  const map: (number | null)[] = from.glyphs.map(() => null);
  // The larger outlines choose first: of the glyphs of one cluster, the letter before its mark.
  const order = [...from.glyphs].sort((a, b) => area(b) - area(a) || a.index - b.index);
  for (const glyph of order) {
    const ranges = mapped(glyph.sourceRanges);
    if (!ranges) continue;
    let target: (typeof pieces)[number] | null = null;
    let found = false;
    for (const ours of ranges) {
      for (let i = firstFrom(ours.start - longest); i < pieces.length; i++) {
        const theirs = pieces[i]!;
        if (theirs.start >= ours.end) break;
        if (!(within(ours, theirs) || within(theirs, ours))) continue;
        found = true;
        if (taken.has(theirs.index)) continue;
        // The first piece of source, and of the glyphs that stand for it the largest.
        if (
          target === null ||
          theirs.start < target.start ||
          (theirs.start === target.start &&
            (theirs.area > target.area ||
              (theirs.area === target.area && theirs.index < target.index)))
        )
          target = theirs;
      }
    }
    if (found) told++;
    if (target !== null) {
      taken.add(target.index);
      map[glyph.index] = target.index;
    }
  }
  return { map, confidence: map.length ? told / map.length : 1 };
}

/** The area of a glyph's box; none for a glyph without one (a placeholder box in a layout). */
function area(glyph: LayoutGlyph): number {
  const box = glyph.bbox;
  return box ? (box.maxX - box.minX) * (box.maxY - box.minY) : 0;
}

export function matchTextLayouts(from: TextLayout, to: TextLayout): GlyphMatch {
  const oldSource = from.source;
  const newSource = to.source;
  const unchanged = oldSource === newSource;
  const { prefix, suffix } = unchanged
    ? { prefix: oldSource.length, suffix: 0 }
    : unchangedEdges(oldSource, newSource);
  const shift = newSource.length - oldSource.length;
  /** The ranges of an old glyph in the new source; null when the edit touched one. */
  const mapped = (ranges: readonly TextSourceRange[]): TextSourceRange[] | null => {
    if (!ranges.length) return null;
    const out: TextSourceRange[] = [];
    for (const range of ranges) {
      if (range.end <= prefix) out.push(range);
      else if (range.start >= oldSource.length - suffix)
        out.push({ start: range.start + shift, end: range.end + shift });
      else return null;
    }
    return out;
  };
  const done = (map: (number | null)[]): GlyphMatch => ({
    map,
    confidence: map.length ? map.filter((index) => index !== null).length / map.length : 1,
  });
  if (from.boxes || to.boxes) return matchByContainment(from, to, mapped);

  const rangesAt = (ranges: readonly TextSourceRange[]): string | null => {
    const out = mapped(ranges);
    return out && JSON.stringify(out);
  };
  const targets = new Map<string, LayoutGlyph[]>();
  for (const glyph of to.glyphs) {
    const key = JSON.stringify(glyph.sourceRanges);
    const group = targets.get(key) ?? [];
    group.push(glyph);
    targets.set(key, group);
  }
  const origins = new Map<string, LayoutGlyph[]>();
  for (const glyph of from.glyphs) {
    const key = rangesAt(glyph.sourceRanges);
    if (key === null) continue;
    const group = origins.get(key) ?? [];
    group.push(glyph);
    origins.set(key, group);
  }
  const map: (number | null)[] = from.glyphs.map(() => null);
  for (const [key, oldGlyphs] of origins) {
    const next = targets.get(key) ?? [];
    if (oldGlyphs.length === 1 && next.length === 1) {
      map[oldGlyphs[0]!.index] = next[0]!.index;
    } else {
      // Several drawable children can belong to one cluster. Only unique identical outlines
      // establish membership; their relative render order is not a source identity.
      const oldSignatures = oldGlyphs.map(shapeSignature);
      const nextSignatures = next.map(shapeSignature);
      oldGlyphs.forEach((glyph, index) => {
        const signature = oldSignatures[index]!;
        const target = nextSignatures.indexOf(signature);
        if (
          oldSignatures.indexOf(signature) === index &&
          oldSignatures.lastIndexOf(signature) === index &&
          target >= 0 &&
          nextSignatures.lastIndexOf(signature) === target
        )
          map[glyph.index] = next[target]!.index;
      });
    }
  }
  return done(map);
}

/** Between two exact geometries. */
export function matchTextGeometry(
  from: TextGeometryArtifact,
  to: TextGeometryArtifact,
): GlyphMatch {
  return matchTextLayouts(textGeometryLayout(from), textGeometryLayout(to));
}
