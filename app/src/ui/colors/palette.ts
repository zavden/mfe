/* The portable Chroma Lab boundary. Project objects continue to store literal hex colors. */
import type { FormulaKind, ShapeKind } from '../../model/types';

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

/** A role the user added to a palette (D154): a name and its color. Nothing takes it by itself,
 * as new objects and Apply palette take the eleven roles above: it is offered wherever a color is
 * chosen by role. Chroma Lab knows the eleven only, and leaves these out of what it reads. */
export interface PaletteCustomRole {
  readonly name: string;
  readonly color: string;
}

/** How many roles of the user's a palette holds at most, and how long the name of one is. */
export const PALETTE_CUSTOM_ROLE_LIMIT = 24;
export const PALETTE_CUSTOM_ROLE_NAME_LIMIT = 32;
export type PaletteForegroundRole = Exclude<PaletteRole, 'background'>;
export type PaletteColors = Readonly<Record<PaletteRole, string>>;

/** Source metadata is retained for portable export; only colors drive editor behavior. */
export interface NormalizedManimPaletteV1 {
  readonly format: 'manim-palette';
  readonly version: 1;
  readonly name: string;
  readonly colors: PaletteColors;
  readonly style: {
    readonly fillOpacity: number;
    readonly strokeWidth: number;
    readonly fontScale: number;
  };
  readonly seeds: {
    readonly master: string;
    readonly background: string;
    readonly symbols: string;
    readonly emphasis: string;
  };
  readonly mode: 'dark' | 'light';
  readonly backgroundMode: 'manual' | 'auto';
  readonly groups: readonly (readonly PaletteForegroundRole[])[];
  readonly locks: Readonly<Record<PaletteRole, boolean>>;
  readonly generation?: {
    readonly method: 'seeded' | 'palette' | 'preset';
    readonly chroma: number;
    readonly diversity: number;
    readonly base?: string;
  };
  /** The roles the user added, in the order they were added; absent when there is none, so that
   * a palette without them is written as it always was. */
  readonly customRoles?: readonly PaletteCustomRole[];
}

export interface PaletteImportWarning {
  readonly code: 'clamped' | 'discarded-metadata';
  readonly path: string;
  readonly message: string;
}

export interface PaletteImportResult {
  readonly palette: NormalizedManimPaletteV1;
  readonly warnings: readonly PaletteImportWarning[];
}

export const MAX_PALETTE_BYTES = 1024 * 1024;

const FOREGROUND_ROLES = PALETTE_ROLES.filter(
  (role): role is PaletteForegroundRole => role !== 'background',
);
const ROOT_FIELDS = [
  'format',
  'version',
  'name',
  'colors',
  'style',
  'seeds',
  'mode',
  'backgroundMode',
  'groups',
  'locks',
  'generation',
  'customRoles',
];
const EXPORT_GUIDANCE =
  'Export the Chroma Lab Manim theme JSON from "Use in your animation" or "Seeds & themes".';

function object(value: unknown, path: string, guidance = ''): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${path} must be an object.${guidance ? ` ${guidance}` : ''}`);
  }
  return value as Record<string, unknown>;
}

function field(input: Record<string, unknown>, key: string): unknown {
  return Object.hasOwn(input, key) ? input[key] : undefined;
}

function optionalObject(value: unknown, path: string): Record<string, unknown> {
  return value === undefined ? {} : object(value, path);
}

function boundedString(value: unknown, fallback: string, path: string, limit: number): string {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || value.length > limit) {
    throw new TypeError(`${path} must be a string of up to ${limit} characters.`);
  }
  return value;
}

function normalizedHex(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new TypeError(`${path} must be an opaque 3- or 6-digit HEX colour string.`);
  }
  let hex = value.trim().replace(/^#/, '');
  if (/^[\da-f]{3}$/i.test(hex)) hex = [...hex].map((digit) => digit + digit).join('');
  if (!/^[\da-f]{6}$/i.test(hex)) {
    throw new TypeError(`${path} must be an opaque 3- or 6-digit HEX colour, such as #4F7CFF.`);
  }
  return `#${hex.toUpperCase()}`;
}

function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  fallback: T,
  path: string,
): T {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !values.includes(value as T)) {
    throw new RangeError(`${path} must be ${values.map((item) => `"${item}"`).join(' or ')}.`);
  }
  return value as T;
}

function finiteNumber(
  value: unknown,
  path: string,
  min: number,
  max: number,
  warnings: PaletteImportWarning[],
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new TypeError(`${path} must be a finite number.`);
  }
  const normalized = Math.min(max, Math.max(min, value));
  if (normalized !== value) {
    warnings.push({
      code: 'clamped',
      path,
      message: `${path} was clamped from ${value} to ${normalized} (allowed range ${min}–${max}).`,
    });
  }
  return normalized;
}

function discardUnknownFields(
  input: Record<string, unknown>,
  knownFields: readonly string[],
  parentPath: string,
  warnings: PaletteImportWarning[],
): void {
  for (const key of Object.keys(input)) {
    if (knownFields.includes(key)) continue;
    const path = parentPath ? `${parentPath}.${key}` : key;
    warnings.push({
      code: 'discarded-metadata',
      path,
      message:
        path === 'report'
          ? 'report was discarded: imported contrast analysis does not certify an editor scene.'
          : `${path} is unsupported metadata and was discarded.`,
    });
  }
}

function rejectUnknownRoles(input: Record<string, unknown>, path: string): void {
  const unknown = Object.keys(input).filter((key) => !PALETTE_ROLES.includes(key as PaletteRole));
  if (unknown.length) {
    throw new RangeError(`${path} contains unknown roles: ${unknown.join(', ')}.`);
  }
}

function normalizeColors(value: unknown): PaletteColors {
  const input = object(value, 'colors');
  rejectUnknownRoles(input, 'colors');
  const missing = PALETTE_ROLES.filter((role) => !Object.hasOwn(input, role));
  if (missing.length) {
    throw new TypeError(`colors is missing required roles: ${missing.join(', ')}.`);
  }
  return Object.freeze(
    Object.fromEntries(
      PALETTE_ROLES.map((role) => [role, normalizedHex(input[role], `colors.${role}`)]),
    ) as Record<PaletteRole, string>,
  );
}

function normalizeLocks(value: unknown): NormalizedManimPaletteV1['locks'] {
  const input = optionalObject(value, 'locks');
  rejectUnknownRoles(input, 'locks');
  return Object.freeze(
    Object.fromEntries(
      PALETTE_ROLES.map((role) => {
        const locked = Object.hasOwn(input, role) ? input[role] : false;
        if (typeof locked !== 'boolean') {
          throw new TypeError(`locks.${role} must be a boolean.`);
        }
        return [role, locked];
      }),
    ) as Record<PaletteRole, boolean>,
  );
}

function normalizeGroups(value: unknown): NormalizedManimPaletteV1['groups'] {
  if (value === undefined) {
    return Object.freeze(FOREGROUND_ROLES.map((role) => Object.freeze([role])));
  }
  if (!Array.isArray(value) || !value.length) {
    throw new TypeError('groups must contain nonempty groups of foreground roles.');
  }
  const seen = new Set<PaletteForegroundRole>();
  const groups = value.map((group: unknown, groupIndex) => {
    if (!Array.isArray(group) || !group.length) {
      throw new TypeError(`groups[${groupIndex}] must be a nonempty list of foreground roles.`);
    }
    const roles = group.map((role: unknown, roleIndex) => {
      if (typeof role !== 'string' || !FOREGROUND_ROLES.includes(role as PaletteForegroundRole)) {
        throw new RangeError(
          `groups[${groupIndex}][${roleIndex}] must be a known foreground role; background cannot be grouped.`,
        );
      }
      const foreground = role as PaletteForegroundRole;
      if (seen.has(foreground)) {
        throw new RangeError(`groups contains duplicate role: ${foreground}.`);
      }
      seen.add(foreground);
      return foreground;
    });
    return Object.freeze(
      roles.sort((a, b) => FOREGROUND_ROLES.indexOf(a) - FOREGROUND_ROLES.indexOf(b)),
    );
  });
  const missing = FOREGROUND_ROLES.filter((role) => !seen.has(role));
  if (missing.length) {
    throw new RangeError(`groups is missing foreground roles: ${missing.join(', ')}.`);
  }
  return Object.freeze(
    groups.sort((a, b) => FOREGROUND_ROLES.indexOf(a[0]!) - FOREGROUND_ROLES.indexOf(b[0]!)),
  );
}

function normalizeStyle(
  value: unknown,
  warnings: PaletteImportWarning[],
): NormalizedManimPaletteV1['style'] {
  const input = optionalObject(value, 'style');
  discardUnknownFields(input, ['fillOpacity', 'strokeWidth', 'fontScale'], 'style', warnings);
  const number = (key: string, fallback: number, min: number, max: number) => {
    const raw = field(input, key);
    return raw === undefined ? fallback : finiteNumber(raw, `style.${key}`, min, max, warnings);
  };
  return Object.freeze({
    fillOpacity: number('fillOpacity', 0.12, 0, 1),
    strokeWidth: number('strokeWidth', 3, 0.5, 12),
    fontScale: number('fontScale', 1, 0.5, 2),
  });
}

function normalizeSeeds(
  value: unknown,
  warnings: PaletteImportWarning[],
): NormalizedManimPaletteV1['seeds'] {
  const input = optionalObject(value, 'seeds');
  discardUnknownFields(input, ['master', 'background', 'symbols', 'emphasis'], 'seeds', warnings);
  return Object.freeze({
    master: boundedString(field(input, 'master'), 'manim-colors', 'seeds.master', 256),
    background: boundedString(field(input, 'background'), '', 'seeds.background', 256),
    symbols: boundedString(field(input, 'symbols'), '', 'seeds.symbols', 256),
    emphasis: boundedString(field(input, 'emphasis'), '', 'seeds.emphasis', 256),
  });
}

function normalizeGeneration(
  value: unknown,
  warnings: PaletteImportWarning[],
): NormalizedManimPaletteV1['generation'] {
  if (value === undefined) return undefined;
  const input = object(value, 'generation');
  discardUnknownFields(input, ['method', 'chroma', 'diversity', 'base'], 'generation', warnings);
  const method = field(input, 'method');
  if (method !== 'seeded' && method !== 'palette' && method !== 'preset') {
    throw new RangeError('generation.method must be "seeded", "palette", or "preset".');
  }
  const base = field(input, 'base');
  return Object.freeze({
    method,
    chroma: finiteNumber(field(input, 'chroma'), 'generation.chroma', 0, 1, warnings),
    diversity: finiteNumber(field(input, 'diversity'), 'generation.diversity', 0, 1, warnings),
    ...(base === undefined ? {} : { base: normalizedHex(base, 'generation.base') }),
  });
}

/** The name of a role of the user's as a palette keeps it: trimmed, of 1 to 32 characters on one
 * line, not the name of one of the eleven roles, and not `taken` (the names the palette already
 * has, in lower case: two names that differ by their case alone are one). It throws what the
 * user is told. */
export function customRoleName(value: unknown, taken: ReadonlySet<string>): string {
  const name = typeof value === 'string' ? value.trim() : '';
  // eslint-disable-next-line no-control-regex
  if (!name || name.length > PALETTE_CUSTOM_ROLE_NAME_LIMIT || /[\u0000-\u001f\u007f]/.test(name)) {
    throw new RangeError(
      `A role needs a name of 1 to ${PALETTE_CUSTOM_ROLE_NAME_LIMIT} characters, on one line.`,
    );
  }
  const key = name.toLowerCase();
  if (PALETTE_ROLES.includes(key as PaletteRole)) {
    throw new RangeError(`“${name}” is one of the roles every palette has: use another name.`);
  }
  if (taken.has(key)) throw new RangeError(`This palette already has a role named “${name}”.`);
  return name;
}

function normalizeCustomRoles(value: unknown): readonly PaletteCustomRole[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new TypeError('customRoles must be an array.');
  if (value.length > PALETTE_CUSTOM_ROLE_LIMIT) {
    throw new RangeError(`A palette holds up to ${PALETTE_CUSTOM_ROLE_LIMIT} roles of your own.`);
  }
  const taken = new Set<string>();
  return Object.freeze(
    value.map((raw: unknown, index) => {
      const input = object(raw, `customRoles[${index}]`);
      const name = customRoleName(field(input, 'name'), taken);
      taken.add(name.toLowerCase());
      return Object.freeze({
        name,
        color: normalizedHex(field(input, 'color'), `customRoles[${index}].color`),
      });
    }),
  );
}

/** Validate a portable envelope and return a detached, immutable canonical source snapshot. */
export function normalizePalette(value: unknown): PaletteImportResult {
  const input = object(value, 'Palette JSON root', EXPORT_GUIDANCE);
  if (field(input, 'format') !== 'manim-palette') {
    throw new TypeError(`format must be "manim-palette". ${EXPORT_GUIDANCE}`);
  }
  if (field(input, 'version') !== 1) {
    throw new RangeError(
      `Unsupported palette version: version must be the number 1. ${EXPORT_GUIDANCE}`,
    );
  }

  const warnings: PaletteImportWarning[] = [];
  const colors = normalizeColors(field(input, 'colors'));
  const groups = normalizeGroups(field(input, 'groups'));
  const locks = normalizeLocks(field(input, 'locks'));
  for (const group of groups) {
    if (group.some((role) => colors[role] !== colors[group[0]!])) {
      throw new RangeError(`groups contains unequal colours: ${group.join(', ')}.`);
    }
    if (group.some((role) => locks[role] !== locks[group[0]!])) {
      throw new RangeError(`groups contains unequal locks: ${group.join(', ')}.`);
    }
  }
  discardUnknownFields(input, ROOT_FIELDS, '', warnings);
  const generation = normalizeGeneration(field(input, 'generation'), warnings);
  const customRoles = normalizeCustomRoles(field(input, 'customRoles'));
  const palette: NormalizedManimPaletteV1 = Object.freeze({
    format: 'manim-palette',
    version: 1,
    name: boundedString(field(input, 'name'), 'Scene theme', 'name', 120),
    colors,
    style: normalizeStyle(field(input, 'style'), warnings),
    seeds: normalizeSeeds(field(input, 'seeds'), warnings),
    mode: enumValue(field(input, 'mode'), ['dark', 'light'], 'dark', 'mode'),
    backgroundMode: enumValue(
      field(input, 'backgroundMode'),
      ['manual', 'auto'],
      'manual',
      'backgroundMode',
    ),
    groups,
    locks,
    ...(generation === undefined ? {} : { generation }),
    ...(customRoles.length === 0 ? {} : { customRoles }),
  });
  return { palette, warnings: Object.freeze(warnings.map((warning) => Object.freeze(warning))) };
}

/** JSON file import is bounded by UTF-8 bytes before parsing, including discarded metadata. */
export function parsePalette(text: string): PaletteImportResult {
  if (
    text.length > MAX_PALETTE_BYTES ||
    new TextEncoder().encode(text).byteLength > MAX_PALETTE_BYTES
  ) {
    throw new RangeError('Palette JSON exceeds the 1 MiB input limit.');
  }
  let input: unknown;
  try {
    input = JSON.parse(text);
  } catch {
    throw new SyntaxError(`Palette JSON is not valid JSON. ${EXPORT_GUIDANCE}`);
  }
  return normalizePalette(input);
}

/** Shape creation defaults to a box; authored shape fields select the final role. */
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
