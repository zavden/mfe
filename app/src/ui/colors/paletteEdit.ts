/* Palettes made or changed in the editor. Whatever comes out of here is a complete
 * `manim-palette` v1 source, as valid as an imported one: it can be exported and read back, by
 * the editor and by Chroma Lab. */
import { DEFAULT_COLOR, SHAPE_COLORS, defaultMeta } from '../../model';
import { normalizeColor } from '../project/colors';
import {
  customRoleName,
  normalizePalette,
  type NormalizedManimPaletteV1,
  type PaletteColors,
  type PaletteCustomRole,
  type PaletteRole,
} from './palette';

/** The colors the editor works with when no palette is active: what a new project and each new
 * object get (`paletteRoleForKind`). The four roles no object is born with take Manim's named
 * colors: BLUE, GOLD, WHITE and GREEN. Activating a palette that starts from these changes
 * nothing until one of them is edited, with one exception: boxes and underlines share the
 * `rectangle` role, so a new underline takes the yellow of a box instead of Manim's white. */
export const DEFAULT_PALETTE_COLORS: PaletteColors = Object.freeze({
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

/** A palette to start from: the editor's own colors, every role on its own, nothing locked. */
export function newPaletteSource(name: string): NormalizedManimPaletteV1 {
  return normalizePalette({
    format: 'manim-palette',
    version: 1,
    name,
    colors: DEFAULT_PALETTE_COLORS,
  }).palette;
}

/** `source` with one role in another color.
 *
 * - A role that shared its color with others (a linked group) leaves the group: the roles of a
 *   group must have one color, and the others keep theirs.
 * - The recipe (`generation`) goes: the colors are no longer what it produces. Chroma Lab drops
 *   it the same way from a palette edited by hand.
 * - The background becomes a manual one, whichever role changed. In Chroma Lab an automatic
 *   background is calculated from the foreground colors; the editor has no such calculation, so
 *   a theme it changed must not go on saying its background is the calculated one.
 *
 * Seeds, style, mode and locks stay as they were. The same color returns `source` itself. */
export function recolorSource(
  source: NormalizedManimPaletteV1,
  role: PaletteRole,
  color: string,
): NormalizedManimPaletteV1 {
  const hex = normalizeColor(color);
  if (!hex) throw new TypeError('Use an opaque HEX colour, such as #4F7CFF.');
  if (source.colors[role] === hex) return source;
  const kept: Record<string, unknown> = { ...source };
  delete kept.generation;
  return normalizePalette({
    ...kept,
    colors: { ...source.colors, [role]: hex },
    groups: source.groups.flatMap((group) => {
      const others = group.filter((member) => member !== role);
      const alone = group.filter((member) => member === role);
      return others.length > 0 && alone.length > 0 ? [others, alone] : [group];
    }),
    backgroundMode: 'manual',
  }).palette;
}

/** A change to the roles the user added to a palette (D154); `role` is the name of the one it is
 * made to. */
export type CustomRoleChange =
  | { do: 'add'; name: string; color: string }
  | { do: 'rename'; role: string; name: string }
  | { do: 'recolor'; role: string; color: string }
  | { do: 'delete'; role: string };

/** `source` with `change` made to the roles of the user's. The eleven roles, and what the
 * palette says of how they were made (its recipe, its background), are not touched: these roles
 * are no part of what Chroma Lab generates. It throws what the user is told when the change
 * cannot be made — a name the palette cannot have, no color, a role that is no longer there —
 * and returns `source` itself when it changes nothing (a role deleted twice). */
export function changeCustomRoles(
  source: NormalizedManimPaletteV1,
  change: CustomRoleChange,
): NormalizedManimPaletteV1 {
  const roles = source.customRoles ?? [];
  const colorOf = (color: string) => {
    const hex = normalizeColor(color);
    if (!hex) throw new TypeError('Use an opaque HEX colour, such as #4F7CFF.');
    return hex;
  };
  const others = (role?: string) =>
    new Set(roles.filter((item) => item.name !== role).map((item) => item.name.toLowerCase()));
  const found = (role: string) => {
    if (!roles.some((item) => item.name === role)) {
      throw new Error(`The role “${role}” is no longer in this palette.`);
    }
  };
  let next: readonly PaletteCustomRole[];
  if (change.do === 'add') {
    next = [
      ...roles,
      { name: customRoleName(change.name, others()), color: colorOf(change.color) },
    ];
  } else if (change.do === 'delete') {
    next = roles.filter((item) => item.name !== change.role);
    if (next.length === roles.length) return source;
  } else if (change.do === 'rename') {
    found(change.role);
    const name = customRoleName(change.name, others(change.role));
    if (name === change.role) return source;
    next = roles.map((item) => (item.name === change.role ? { ...item, name } : item));
  } else {
    found(change.role);
    const color = colorOf(change.color);
    if (roles.some((item) => item.name === change.role && item.color === color)) return source;
    next = roles.map((item) => (item.name === change.role ? { ...item, color } : item));
  }
  const kept: Record<string, unknown> = { ...source };
  delete kept.customRoles;
  return normalizePalette({ ...kept, ...(next.length > 0 ? { customRoles: next } : {}) }).palette;
}

/** What Export writes for a palette made or changed in the editor: its source under the name it
 * has in the editor. */
export function namedSource(
  source: NormalizedManimPaletteV1,
  name: string,
): NormalizedManimPaletteV1 {
  return normalizePalette({ ...source, name }).palette;
}
