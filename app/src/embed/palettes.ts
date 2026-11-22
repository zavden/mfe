/* Palettes by role, for the widgets of the web documentation (`MFEPlayer.engine.palettes`): the
 * eleven roles of a palette, what the editor does with each, the role a new object of each kind
 * takes, and the palettes the app comes with — the colours the editor uses when no palette is
 * active, and the themes Chroma Lab offers under "Apply a theme…" (the pinned copy of Chroma Lab
 * in `app/src/data/chroma-lab/`).
 *
 * The player cannot import `ui/` nor Chroma Lab's bundle, so these are copies:
 * `ui/colors/palette.ts` (`PALETTE_ROLES`, `paletteRoleForKind`), `ui/colors/paletteEdit.ts`
 * (`DEFAULT_PALETTE_COLORS`, written here from the same model constants),
 * `ui/colors/PaletteLibraryDialog.tsx` (what each role is for) and Chroma Lab's own presets.
 * `__tests__/palettes.test.ts` holds each to its original, the presets to the bundle's text. Pure. */
import {
  DEFAULT_COLOR,
  defaultMeta,
  SHAPE_COLORS,
  type FormulaKind,
  type ShapeKind,
} from '../model';

/** The roles of a palette, in the order the editor lists them. */
export const PALETTE_ROLES = Object.freeze([
  'background',
  'formula',
  'variable',
  'constant',
  'operator',
  'result',
  'text',
  'muted',
  'rectangle',
  'circle',
  'arrow',
] as const);

export type PaletteRole = (typeof PALETTE_ROLES)[number];

export type PaletteColors = Readonly<Record<PaletteRole, string>>;

/** The role whose colour a new object of `kind` is born with (a shape's by its shape). */
export function paletteRoleForKind(kind: FormulaKind, shape: ShapeKind = 'box'): PaletteRole {
  if (kind === 'shape') {
    const roles: Record<ShapeKind, PaletteRole> = {
      box: 'rectangle',
      underline: 'rectangle',
      circle: 'circle',
      cross: 'arrow',
      cross_line: 'arrow',
    };
    return roles[shape];
  }
  const roles: Record<Exclude<FormulaKind, 'shape'>, PaletteRole> = {
    math: 'formula',
    tex: 'text',
    text: 'text',
    brace: 'muted',
    line: 'arrow',
  };
  return roles[kind];
}

/** What the editor does with each role, as its palette library says: the colour a new object is
 * born with, or the Match colors list made from the active palette. Every role is also offered
 * wherever a colour is chosen. */
export const ROLE_USES: Readonly<Record<PaletteRole, string>> = {
  background: 'New projects',
  formula: 'New formulas',
  variable: 'Match colors lists',
  constant: 'Match colors lists',
  operator: 'Match colors lists',
  result: 'Match colors lists',
  text: 'New texts',
  muted: 'New braces',
  rectangle: 'New boxes and underlines',
  circle: 'New circles',
  arrow: 'New lines, arrows, crosses and cross lines',
};

/** The colours the editor works with when no palette is active (and what New palette starts
 * from): what a new project and each new object get. The four roles no object is born with take
 * Manim's BLUE, GOLD, WHITE and GREEN. */
export const EDITOR_COLORS: PaletteColors = Object.freeze({
  background: defaultMeta().background.toUpperCase(),
  formula: DEFAULT_COLOR,
  variable: '#58C4DD',
  constant: '#F0AC5F',
  operator: '#FFFFFF',
  result: '#83C167',
  text: DEFAULT_COLOR,
  muted: DEFAULT_COLOR,
  rectangle: SHAPE_COLORS.box,
  circle: SHAPE_COLORS.circle,
  arrow: SHAPE_COLORS.cross,
});

/** A palette the app comes with. */
export interface BuiltInPalette {
  /** A slug of its name. */
  id: string;
  name: string;
  /** Whether it is made for a dark or a light background. */
  mode: 'dark' | 'light';
  colors: PaletteColors;
  /** Where the app has it: the editor's own colours, or a theme of Chroma Lab. */
  origin: 'editor' | 'chroma-lab';
}

/** Chroma Lab's themes ("Apply a theme…" in its scenes), in its order. */
export const CHROMA_LAB_THEMES: readonly Omit<BuiltInPalette, 'id' | 'origin'>[] = [
  {
    name: 'Midnight chalkboard',
    mode: 'dark',
    colors: {
      background: '#101827',
      formula: '#F1F5F9',
      variable: '#67D9FF',
      constant: '#F9CF72',
      operator: '#E3EAF5',
      result: '#8BE6BA',
      text: '#F1F5F9',
      muted: '#9EADC2',
      rectangle: '#A9B5FF',
      circle: '#FF9AC6',
      arrow: '#8BE6BA',
    },
  },
  {
    name: 'Ink & paper',
    mode: 'light',
    colors: {
      background: '#FCFAF5',
      formula: '#243047',
      variable: '#1A5DA6',
      constant: '#925114',
      operator: '#42445A',
      result: '#18704F',
      text: '#243047',
      muted: '#677080',
      rectangle: '#6550A4',
      circle: '#A83E65',
      arrow: '#18704F',
    },
  },
  {
    name: 'Orbital violet',
    mode: 'dark',
    colors: {
      background: '#1B1228',
      formula: '#F5EDFF',
      variable: '#D6ADFF',
      constant: '#FFD29D',
      operator: '#DDD3EE',
      result: '#8DEBDA',
      text: '#F5EDFF',
      muted: '#B4A1C8',
      rectangle: '#B8BEFF',
      circle: '#FFA5C3',
      arrow: '#8DEBDA',
    },
  },
  {
    name: 'Light laboratory',
    mode: 'light',
    colors: {
      background: '#F3FAFB',
      formula: '#153641',
      variable: '#006B80',
      constant: '#92591B',
      operator: '#35465B',
      result: '#52652B',
      text: '#153641',
      muted: '#657C84',
      rectangle: '#536DA5',
      circle: '#9B4873',
      arrow: '#52652B',
    },
  },
];

const slug = (name: string) =>
  name
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

/** Every palette the app comes with: the editor's own colours first, then Chroma Lab's themes. */
export const BUILT_IN_PALETTES: readonly BuiltInPalette[] = [
  { id: 'editor', name: 'No palette', mode: 'dark', colors: EDITOR_COLORS, origin: 'editor' },
  ...CHROMA_LAB_THEMES.map((theme): BuiltInPalette => ({
    ...theme,
    id: slug(theme.name),
    origin: 'chroma-lab',
  })),
];
