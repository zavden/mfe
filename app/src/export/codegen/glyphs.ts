/* How generated code names a formula's glyphs (ARCHITECTURE §8, "Mobjects"). */
import type { GlyphMembers, Target } from '../../model';
import { sameColor } from '../../geom';
import { glyphColor } from '../../scene/placement';
import type { ClipCtx, Codegen } from './context';
import { DIALECTS } from './dialect';
import { num, quoted } from './python';

/** The statement that binds the glyph list of a list-indexed mobject (`Indexing`). */
function listLines(ctx: ClipCtx): string[] {
  const { formula: fc, naming } = ctx;
  if (fc.positional) {
    const tuples = fc.layout.map((l) => `(${l.map((v) => num(v, 4)).join(', ')})`);
    const rows: string[] = [];
    for (let i = 0; i < tuples.length; i += 4)
      rows.push(`    ${tuples.slice(i, i + 4).join(', ')},`);
    return [`${naming.name}_g = _glyphs(${naming.name}, [`, ...rows, '])'];
  }
  return fc.flat ? [`${naming.name}_g = ${naming.name}.family_members_with_points()`] : [];
}

/** Bind canonical glyphs and their initial colours after a constructor. `fitted`: of a brace or
 * a shape built on its target (attach.ts), where its clip starts or, an early target, in the setup
 * and again there. Such a mobject is mostly used whole, so its list is on demand: it stays only
 * where the scene reads it (`dropUnreadGlyphLists`). */
export function glyphSetupLines(gen: Codegen, ctx: ClipCtx, fitted = false): string[] {
  const { formula: fc, clip, naming } = ctx;
  if (fitted) gen.onDemandLists.add(ctx);
  else if (fc.positional) gen.helpers.add('glyphs');
  const base = clip.initial.color ?? fc.formula.color;
  const recolour: [number, string][] = [];
  for (let g = 0; g < fc.count; g++) {
    const c = glyphColor(g, clip.initial, fc.formula);
    if (!sameColor(c, base)) recolour.push([g, c]);
  }
  return [...listLines(ctx), ...colorLines(naming, recolour)];
}

/** Last pass over the scene's lines: take out the glyph lists bound on demand that nothing reads,
 * and ask for the positional helper of those that stay. The lines themselves are asked, not the
 * places that write them: a list kept for a name that only looks like a read costs nothing, and a
 * list dropped under a read would be a NameError in the user's scene. A list bound twice (an
 * early target) keeps both bindings or neither. */
export function dropUnreadGlyphLists(gen: Codegen): void {
  for (const ctx of gen.onDemandLists) {
    const binding = listLines(ctx);
    if (binding.length === 0) continue;
    const named = new RegExp(`(?:^|\\W)${ctx.naming.name}_g(?!\\w)`);
    // A comment reads nothing: a mark of the Slides mode may hold any words.
    const read = [gen.setup, gen.body].some((lines) =>
      lines.some((line) => line !== binding[0] && !/^#.*$/.test(line) && named.test(line)),
    );
    if (read) {
      if (ctx.formula.positional) gen.helpers.add('glyphs');
      continue;
    }
    for (const lines of [gen.setup, gen.body]) {
      for (let i = lines.indexOf(binding[0]!); i >= 0; i = lines.indexOf(binding[0]!, i)) {
        lines.splice(i, binding.length);
      }
    }
  }
}

export type Indexing =
  /** CE `f1[0][g]` / GL `f1[g]`: the snapshot's order is Manim's. */
  | 'literal'
  /** `f1_g[g]`, a list built at run time: by `_glyphs` (positional matching, D5) or, for a CE
   * formula split into several parts by `{{ … }}`, `f1.family_members_with_points()`. */
  | 'list';

export interface GlyphNaming {
  /** Python variable of the formula mobject. */
  name: string;
  target: Target;
  indexing: Indexing;
  /** Canonical glyph count. */
  count: number;
  /** How the mobject holds its glyphs (`glyphMembers`); absent: a TeX mobject. */
  members?: GlyphMembers;
}

/** Expression of glyph g. */
export function glyphRef(n: GlyphNaming, g: number): string {
  if (n.indexing === 'list') return `${n.name}_g[${g}]`;
  if (n.members === 'self') return n.name;
  if (n.members === 'submobjects') return `${n.name}[${g}]`;
  // An arrow: the line itself, then its tips (`name[g]` would not do: ManimCE counts a mobject
  // with points among its own items, ManimGL does not).
  if (n.members === 'family') return g === 0 ? n.name : `${n.name}.submobjects[${g - 1}]`;
  return `${n.name}${DIALECTS[n.target].glyphsPrefix}[${g}]`;
}

/** A mobject whose submobjects are every glyph, in order (what `_Tween` takes): the TeX mobject's
 * glyph holder, the group itself, or a one-glyph mobject wrapped. */
export function glyphsHolder(n: GlyphNaming, fresh = false): string {
  if (n.indexing === 'list') return `VGroup(*${n.name}_g)`;
  if (n.members === 'self') return `VGroup(${n.name})`;
  if (n.members === 'family') return `VGroup(${n.name}, *${n.name}.submobjects)`;
  const holder =
    n.members === 'submobjects' ? n.name : `${n.name}${DIALECTS[n.target].glyphsPrefix}`;
  return fresh ? `VGroup(*${holder})` : holder;
}

/** Maximal runs of consecutive ascending glyphs, in the given order. */
function runs(glyphs: readonly number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const g of glyphs) {
    const last = out[out.length - 1];
    if (last && g === last[1]) last[1] = g + 1;
    else out.push([g, g + 1]);
  }
  return out;
}

/** Python slice of glyphs [a, b): a VGroup for literal indexing, a list for 'list'. */
function sliceExpr(n: GlyphNaming, a: number, b: number): string {
  const range = `${a === 0 ? '' : a}:${b === n.count ? '' : b}`;
  if (n.indexing === 'list') return `${n.name}_g[${range}]`;
  if (n.members === 'self') return `VGroup(${n.name})`;
  if (n.members === 'submobjects') return `${n.name}[${range}]`;
  if (n.members === 'family') {
    const refs = Array.from({ length: b - a }, (_, i) => glyphRef(n, a + i));
    return `VGroup(${refs.join(', ')})`;
  }
  return `${n.name}${DIALECTS[n.target].glyphsPrefix}[${range}]`;
}

/** Arguments that unpack to the glyphs, in order (for VGroup(...), self.add(...)). */
export function glyphArgs(n: GlyphNaming, glyphs: readonly number[]): string[] {
  return runs(glyphs).map(([a, b]) =>
    b - a >= 3
      ? `*${sliceExpr(n, a, b)}`
      : Array.from({ length: b - a }, (_, i) => glyphRef(n, a + i)).join(', '),
  );
}

export interface GroupOptions {
  /** The glyphs are all of the formula and the mobject itself may be used. */
  whole: boolean;
  /** A single glyph may be used bare (not wrapped in a VGroup). */
  bare: boolean;
}

/** A mobject holding exactly `glyphs`, in that order. */
export function glyphGroup(n: GlyphNaming, glyphs: readonly number[], opts: GroupOptions): string {
  if (opts.whole) return n.name;
  if (glyphs.length === 1 && opts.bare) return glyphRef(n, glyphs[0]!);
  const r = runs(glyphs);
  if (r.length === 1 && n.indexing === 'literal' && r[0]![1] - r[0]![0] >= 2) {
    return sliceExpr(n, r[0]![0], r[0]![1]);
  }
  return `VGroup(${glyphArgs(n, glyphs).join(', ')})`;
}

/** True when `glyphs` (any order) are exactly 0 … count − 1. */
export function isAll(glyphs: readonly number[], count: number): boolean {
  if (glyphs.length !== count) return false;
  const seen = new Set(glyphs);
  return seen.size === count && glyphs.every((g) => g >= 0 && g < count);
}

/** `<glyphs>.set_color(c)` lines, one per colour in the order the colours first come, from the
 * new colour of each glyph to recolour. */
export function colorLines(naming: GlyphNaming, colors: Iterable<[number, string]>): string[] {
  const byColor = new Map<string, number[]>();
  for (const [glyph, color] of colors) byColor.set(color, [...(byColor.get(color) ?? []), glyph]);
  return [...byColor].map(
    ([color, glyphs]) =>
      `${glyphGroup(naming, glyphs, { whole: false, bare: true })}.set_color(${quoted(color)})`,
  );
}
