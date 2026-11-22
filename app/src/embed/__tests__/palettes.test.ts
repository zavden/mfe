// @vitest-environment node
/* Palettes in the player (`palettes.ts`) are the app's: the roles and the role of each kind of
 * object (`ui/colors/palette.ts`), the editor's own colours (`ui/colors/paletteEdit.ts`), what each
 * role is for (the palette library's list, read from its source, where it is not exported), and
 * the themes of the pinned Chroma Lab (read from its bundle's text). A change of any of them fails
 * here until the copy follows. */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FormulaKind, ShapeKind } from '../../model';
import {
  normalizePalette,
  PALETTE_ROLES as APP_ROLES,
  paletteRoleForKind as appRoleForKind,
} from '../../ui/colors/palette';
import { DEFAULT_PALETTE_COLORS } from '../../ui/colors/paletteEdit';
import {
  BUILT_IN_PALETTES,
  CHROMA_LAB_THEMES,
  EDITOR_COLORS,
  PALETTE_ROLES,
  paletteRoleForKind,
  ROLE_USES,
} from '../palettes';

const source = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');

describe('palettes in the player', () => {
  it('have the app’s roles, and give each kind of object the app’s role', () => {
    expect([...PALETTE_ROLES]).toEqual([...APP_ROLES]);
    const kinds: FormulaKind[] = ['math', 'tex', 'text', 'brace', 'line'];
    for (const kind of kinds) expect(paletteRoleForKind(kind)).toBe(appRoleForKind(kind));
    const shapes: ShapeKind[] = ['box', 'underline', 'circle', 'cross', 'cross_line'];
    for (const shape of shapes) {
      expect(paletteRoleForKind('shape', shape)).toBe(appRoleForKind('shape', shape));
    }
  });

  it('start from the editor’s own colours', () => {
    expect(EDITOR_COLORS).toEqual(DEFAULT_PALETTE_COLORS);
    expect(BUILT_IN_PALETTES[0]!.colors).toBe(EDITOR_COLORS);
  });

  it('say what each role is for as the palette library does', () => {
    const text = source('ui/colors/PaletteLibraryDialog.tsx');
    const body = /const ROLE_USES[^=]*=\s*\{([^}]*)\}/.exec(text)?.[1];
    expect(body, 'ROLE_USES in PaletteLibraryDialog.tsx').toBeDefined();
    const uses = Object.fromEntries(
      [...body!.matchAll(/(\w+):\s*'([^']*)'/g)].map((m) => [m[1]!, m[2]!]),
    );
    expect(ROLE_USES).toEqual(uses);
  });

  it('offer the themes of the pinned Chroma Lab, as its bundle has them', () => {
    const bundle = source('data/chroma-lab/app.bundle.js');
    const found = [
      ...bundle.matchAll(
        /[A-Za-z_$][\w$]*\("([^"]+)","(dark|light)",\{(background:"#[0-9A-Fa-f]{6}"[^}]*)\}\)/g,
      ),
    ].map((m) => ({
      name: m[1]!,
      mode: m[2]!,
      colors: Object.fromEntries(
        [...m[3]!.matchAll(/(\w+):"(#[0-9A-Fa-f]{6})"/g)].map((c) => [c[1]!, c[2]!.toUpperCase()]),
      ),
    }));
    expect(found.length).toBeGreaterThan(0);
    expect(CHROMA_LAB_THEMES).toEqual(found);
  });

  it('are valid palettes for the editor', () => {
    expect(new Set(BUILT_IN_PALETTES.map((p) => p.id)).size).toBe(BUILT_IN_PALETTES.length);
    for (const palette of BUILT_IN_PALETTES) {
      const { palette: normalized } = normalizePalette({
        format: 'manim-palette',
        version: 1,
        name: palette.name,
        colors: palette.colors,
      });
      expect(normalized.colors).toEqual(palette.colors);
    }
  });
});
