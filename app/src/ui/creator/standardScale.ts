/* The standard scale of new objects (R4, D75): a factor per kind of text — formulas (`math`) and
 * texts (`tex`; a font text when it comes) — that multiplies Manim's default font size when the
 * Creator makes one. An editor preference kept as typed, like the scale step, so that the dialog
 * shows it back; changing it never touches the objects that exist. The dialog's «Apply to all
 * formulas / texts» does, on the user's word: every object of the kind takes the scale typed
 * (`planStandardScale`). The Creator's editor shows a formula's size as that scale too:
 * `fontSize = 48 × scale`, and «Edit together» one scale for all the objects it has open
 * (`sharedScale`). Pure. */
import {
  DEFAULT_FONT_SIZE,
  kindOf,
  type Formula,
  type FormulaId,
  type FormulaKind,
} from '../../model';
import { parseNumberOrFraction } from '../preview/scaleStep';

/** The kinds that have a scale of their own: a brace or a shape follows its target. */
export type ScaleKind = 'math' | 'tex';

export interface StandardScale {
  math: string;
  tex: string;
}

export const DEFAULT_STANDARD_SCALE: StandardScale = { math: '1', tex: '1' };

/** What a font size may be (Manim's `font_size`, 48 by default). */
export const MIN_FONT_SIZE = 4;
export const MAX_FONT_SIZE = 512;

/** What a scale may be: 48 × it stays a usable font size. */
export const STANDARD_SCALE_RANGE = { min: 0.1, max: 10 };

/** The value of a scale as typed — a number or a fraction — or null when the text is not one or
 * the value is outside `STANDARD_SCALE_RANGE`. */
export function parseStandardScale(text: string): number | null {
  const value = parseNumberOrFraction(text);
  if (value === null) return null;
  if (value < STANDARD_SCALE_RANGE.min - 1e-12 || value > STANDARD_SCALE_RANGE.max + 1e-12) {
    return null;
  }
  return value;
}

/** What a field of an object's scale (the formula editor's, «Edit together»'s) says of a text it
 * cannot take, or null when it is a scale. */
export function scaleFieldError(text: string): string | null {
  return parseStandardScale(text) === null
    ? `A number or a fraction from ${STANDARD_SCALE_RANGE.min} to ${STANDARD_SCALE_RANGE.max}.`
    : null;
}

export function isStandardScale(x: unknown): x is StandardScale {
  if (typeof x !== 'object' || x === null) return false;
  const v = x as Record<string, unknown>;
  return (
    typeof v.math === 'string' &&
    parseStandardScale(v.math) !== null &&
    typeof v.tex === 'string' &&
    parseStandardScale(v.tex) !== null
  );
}

/** Which scale a kind of object takes; null for the kinds without one. */
export function scaleKindOf(kind: FormulaKind): ScaleKind | null {
  return kind === 'math' || kind === 'tex' ? kind : null;
}

/** The font size of a new object of `kind`: 48 × the standard scale of its kind (48 itself for a
 * brace or a shape, which have no size of their own), to four decimals. */
export function newFontSize(kind: FormulaKind, scale: StandardScale): number {
  const scaleKind = scaleKindOf(kind);
  if (scaleKind === null) return DEFAULT_FONT_SIZE;
  const factor = parseStandardScale(scale[scaleKind]) ?? 1;
  return fontSizeOfScale(factor);
}

/** The scale a font size means: 48 is 1. */
export function scaleOfFontSize(fontSize: number): number {
  return +(fontSize / DEFAULT_FONT_SIZE).toFixed(4);
}

/** The font size a scale means: 1 is 48. */
export function fontSizeOfScale(scale: number): number {
  return +(scale * DEFAULT_FONT_SIZE).toFixed(4);
}

/** An object whose size «Apply to all» changes: its font size now, and the one it takes. */
export interface StandardScaleChange {
  id: FormulaId;
  name: string;
  from: number;
  to: number;
}

/** What «Apply to all formulas» (or «… texts») would do with a scale. */
export interface StandardScalePlan {
  kind: ScaleKind;
  /** The scale, and the font size every object of the kind takes: a new one's (48 × the scale,
   * `fontSizeOfScale`). */
  scale: number;
  fontSize: number;
  /** How many objects of the kind the project has. */
  total: number;
  /** Those whose font size is not that one yet, in the project's order: the ones that change. */
  changes: StandardScaleChange[];
}

/** «Apply to all» of a kind (Preferences → Standard scale…): every object of the kind — every
 * formula, or every LaTeX text — takes `scale`, whatever its own: its font size becomes the one a
 * new object of the kind is born with at that standard scale, which is all a new one's size is
 * (its clips start at scale 1). Their clips keep their own scale and their animations. The objects
 * of other kinds, a font text among them, have no standard scale and are left out. */
export function planStandardScale(
  formulas: readonly Formula[],
  kind: ScaleKind,
  scale: number,
): StandardScalePlan {
  const ofKind = formulas.filter((f) => scaleKindOf(f.kind) === kind);
  return {
    kind,
    scale,
    fontSize: fontSizeOfScale(scale),
    total: ofKind.length,
    changes: scaleChanges(ofKind, scale),
  };
}

/** The objects of `formulas` whose font size giving them `scale` changes, each with its font size
 * now and the one it takes (`fontSizeOfScale`), in their order. */
export function scaleChanges(formulas: readonly Formula[], scale: number): StandardScaleChange[] {
  const fontSize = fontSizeOfScale(scale);
  return formulas
    .filter((f) => f.fontSize !== fontSize)
    .map((f) => ({ id: f.id, name: f.name, from: f.fontSize, to: fontSize }));
}

/** Whether an object has a scale of its own, the Size of the formula editor: what is typeset from
 * a source (a formula, a text) has one; a brace, a shape and a line are fitted to what they mark,
 * and have none. */
export function hasOwnScale(formula: Pick<Formula, 'kind'>): boolean {
  return kindOf(formula).source;
}

/** The Scale of «Edit together» (D155): one value for every object open that has a scale. */
export interface SharedScale {
  /** The scale they all have, as the formula editor writes it; '' while they differ (the field
   * then says "mixed") or none of them has one. */
  text: string;
  /** How many of them have a scale, and how many have none. */
  scaled: number;
  unscaled: number;
}

export function sharedScale(formulas: readonly Formula[]): SharedScale {
  const scaled = formulas.filter(hasOwnScale);
  const sizes = new Set(scaled.map((f) => f.fontSize));
  return {
    text: sizes.size === 1 ? String(scaleOfFontSize(scaled[0]!.fontSize)) : '',
    scaled: scaled.length,
    unscaled: formulas.length - scaled.length,
  };
}

/** What the Scale of «Edit together» says of the objects it leaves out, or null when it leaves
 * none out. */
export function unscaledNote(shared: SharedScale): string | null {
  const { scaled, unscaled } = shared;
  if (unscaled === 0) return null;
  const why = 'braces, shapes and lines take the size of what they mark';
  if (scaled === 0) return `None of them has a scale: ${why}.`;
  return `Not for ${unscaled} of them: ${why}.`;
}

/** How the dialog names the objects of a kind: one, several. */
export const SCALE_KIND_NOUNS: Record<ScaleKind, { one: string; many: string }> = {
  math: { one: 'formula', many: 'formulas' },
  tex: { one: 'LaTeX text', many: 'LaTeX texts' },
};

/** "1 formula", "3 LaTeX texts". */
export function countOfKind(kind: ScaleKind, count: number): string {
  const noun = SCALE_KIND_NOUNS[kind];
  return `${count} ${count === 1 ? noun.one : noun.many}`;
}

/** Why «Apply to all» of a kind cannot act, or null when it can: the field holds no scale (`plan`
 * null), the project has no object of the kind, or every one has that scale already. */
export function applyScaleBlocker(kind: ScaleKind, plan: StandardScalePlan | null): string | null {
  const { one, many } = SCALE_KIND_NOUNS[kind];
  if (plan === null) return 'Type a scale first: a number or a fraction, like 1.5 or 3/2.';
  if (plan.total === 0) return `The project has no ${many}.`;
  if (plan.changes.length === 0) {
    return plan.total === 1
      ? `The project's one ${one} has scale ${String(+plan.scale.toFixed(4))} already.`
      : `Every ${one} of the project has scale ${String(+plan.scale.toFixed(4))} already.`;
  }
  return null;
}

/** What «Apply to all» asks before it acts (`confirmDialog`): how many objects change and to what,
 * and each of them with its scale now. */
export function applyScaleQuestion(plan: StandardScalePlan): {
  title: string;
  message: string;
  details: string[];
  confirmLabel: string;
} {
  const scale = String(+plan.scale.toFixed(4));
  const count = plan.changes.length;
  const kept = plan.total - count;
  const changing = countOfKind(plan.kind, count);
  return {
    title: `Apply scale ${scale} to every ${SCALE_KIND_NOUNS[plan.kind].one}?`,
    message:
      `${changing} ${count === 1 ? 'changes' : 'change'} to scale ${scale} (font_size ` +
      `${plan.fontSize}), the size a new one is born with` +
      (kept > 0 ? `; ${kept} ${kept === 1 ? 'has' : 'have'} it already` : '') +
      `. ${count === 1 ? 'Its' : 'Their'} clips keep their own scale and their animations. ` +
      'One undo step takes it back.',
    details: plan.changes.map((c) => `${c.name}: ${String(scaleOfFontSize(c.from))} → ${scale}`),
    confirmLabel: `Apply to ${changing}`,
  };
}

/** The scale as the user typed it, with its value after it when the text does not say it
 * plainly ("3/2 = 1.5"); text that is not a scale comes back as it is. */
export function formatStandardScale(text: string): string {
  const value = parseStandardScale(text);
  if (value === null) return text;
  const plain = /^\s*(\d+(?:\.\d*)?|\.\d+)\s*$/.test(text);
  return plain ? text.trim() : `${text.trim()} = ${String(+value.toFixed(4))}`;
}
