// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  MAX_PALETTE_BYTES,
  PALETTE_CUSTOM_ROLE_LIMIT,
  PALETTE_ROLES,
  normalizePalette,
  paletteRoleForKind,
  parsePalette,
} from '../palette';

interface InputPalette extends Record<string, unknown> {
  colors: Record<string, unknown>;
  groups: string[][];
  style: Record<string, unknown>;
  seeds: Record<string, unknown>;
  locks: Record<string, unknown>;
  generation: Record<string, unknown>;
}

// Verbatim portable exports from Chroma Lab fd8c0e4, examples/manim/theme{,-light}.json.
function fixtureText(mode = 'dark'): string {
  return readFileSync(new URL(`./fixtures/chromalab-${mode}.json`, import.meta.url), 'utf8');
}

function fixture(): InputPalette {
  return JSON.parse(fixtureText()) as InputPalette;
}

function minimalPalette(): Record<string, unknown> {
  return { format: 'manim-palette', version: 1, colors: fixture().colors };
}

describe('portable Chroma Lab palette import', () => {
  it.each(['dark', 'light'])(
    'preserves an actual %s export and round-trips its source metadata',
    (mode) => {
      const text = fixtureText(mode);
      const { palette, warnings } = parsePalette(text);
      expect(palette).toEqual(JSON.parse(text));
      expect(warnings).toEqual([]);
      expect(Object.keys(palette.colors)).toEqual(PALETTE_ROLES);
      expect(PALETTE_ROLES).toHaveLength(11);
      expect(parsePalette(JSON.stringify(palette))).toEqual({ palette, warnings: [] });
    },
  );

  it('supplies the canonical legacy defaults without linking independent equal colors', () => {
    const { palette, warnings } = normalizePalette(minimalPalette());
    expect(palette).toEqual({
      format: 'manim-palette',
      version: 1,
      name: 'Scene theme',
      colors: fixture().colors,
      style: { fillOpacity: 0.12, strokeWidth: 3, fontScale: 1 },
      seeds: { master: 'manim-colors', background: '', symbols: '', emphasis: '' },
      mode: 'dark',
      backgroundMode: 'manual',
      groups: PALETTE_ROLES.slice(1).map((role) => [role]),
      locks: Object.fromEntries(PALETTE_ROLES.map((role) => [role, false])),
    });
    expect(palette.colors.formula).toBe(palette.colors.text);
    expect(palette.groups).toContainEqual(['formula']);
    expect(palette.groups).toContainEqual(['text']);
    expect(warnings).toEqual([]);
  });

  it('normalizes linked group order, shorthand colors and partial optional metadata', () => {
    const input = fixture();
    input.colors.formula = ' #abc ';
    input.colors.text = 'aAbBcC';
    input.groups = [
      ['arrow', 'result'],
      ['circle'],
      ['rectangle'],
      ['muted'],
      ['text', 'formula'],
      ['operator'],
      ['constant'],
      ['variable'],
    ];
    input.locks = { formula: true, text: true };
    input.style = { strokeWidth: 5 };
    input.seeds = { symbols: ' Symbols 🌙 ', master: 'palette seed' };
    input.backgroundMode = 'auto';
    input.generation = { method: 'palette', chroma: 0.4, diversity: 0.65, base: ' 1aF ' };
    const { palette, warnings } = normalizePalette(input);
    expect(palette.colors.formula).toBe('#AABBCC');
    expect(palette.colors.text).toBe('#AABBCC');
    expect(palette.groups).toEqual([
      ['formula', 'text'],
      ['variable'],
      ['constant'],
      ['operator'],
      ['result', 'arrow'],
      ['muted'],
      ['rectangle'],
      ['circle'],
    ]);
    expect(palette.locks.formula).toBe(true);
    expect(palette.locks.background).toBe(false);
    expect(palette.style).toEqual({ fillOpacity: 0.12, strokeWidth: 5, fontScale: 1 });
    expect(palette.seeds).toEqual({
      master: 'palette seed',
      background: '',
      symbols: ' Symbols 🌙 ',
      emphasis: '',
    });
    expect(palette.backgroundMode).toBe('auto');
    expect(palette.generation).toEqual({
      method: 'palette',
      chroma: 0.4,
      diversity: 0.65,
      base: '#11AAFF',
    });
    expect(warnings).toEqual([]);
    expect(parsePalette(JSON.stringify(palette))).toEqual({ palette, warnings: [] });
  });

  it('warns about importer clamps, including values accepted by the wider exporter ranges', () => {
    const input = fixture();
    input.style = { fillOpacity: -1, strokeWidth: 20, fontScale: 0.25 };
    input.generation = { method: 'seeded', chroma: 9, diversity: -1 };
    const { palette, warnings } = normalizePalette(input);
    expect(palette.style).toEqual({ fillOpacity: 0, strokeWidth: 12, fontScale: 0.5 });
    expect(palette.generation).toEqual({ method: 'seeded', chroma: 1, diversity: 0 });
    expect(warnings).toHaveLength(5);
    expect(warnings.every((warning) => warning.code === 'clamped')).toBe(true);
    expect(warnings).toContainEqual({
      code: 'clamped',
      path: 'style.strokeWidth',
      message: 'style.strokeWidth was clamped from 20 to 12 (allowed range 0.5–12).',
    });
    expect(warnings.map((warning) => warning.path).sort()).toEqual([
      'generation.chroma',
      'generation.diversity',
      'style.fillOpacity',
      'style.fontScale',
      'style.strokeWidth',
    ]);
    expect(parsePalette(JSON.stringify(palette)).warnings).toEqual([]);
  });

  it('also clamps the opposite bounds and preserves finite boundary values', () => {
    const input = fixture();
    input.style = { fillOpacity: 2, strokeWidth: 0.25, fontScale: 3 };
    input.generation = { method: 'preset', chroma: -1, diversity: 2 };
    const { palette, warnings } = normalizePalette(input);
    expect(palette.style).toEqual({ fillOpacity: 1, strokeWidth: 0.5, fontScale: 2 });
    expect(palette.generation).toEqual({ method: 'preset', chroma: 0, diversity: 1 });
    expect(warnings).toHaveLength(5);
    expect(normalizePalette(palette).warnings).toEqual([]);
  });

  it('discards derived reports and unsupported metadata with explicit field warnings', () => {
    const input = fixture();
    input.report = { passes: true, forged: 'This scene is certified.' };
    input.author = 'Ignored author';
    input.style.fontFamily = 'Ignored font';
    input.seeds.unused = 'Ignored seed';
    input.generation.version = 999;
    const original = structuredClone(input);
    const { palette, warnings } = normalizePalette(input);
    expect(palette).toEqual(JSON.parse(fixtureText()));
    expect(warnings.map((warning) => warning.path).sort()).toEqual([
      'author',
      'generation.version',
      'report',
      'seeds.unused',
      'style.fontFamily',
    ]);
    expect(warnings.every((warning) => warning.code === 'discarded-metadata')).toBe(true);
    expect(warnings.find((warning) => warning.path === 'report')?.message).toMatch(
      /does not certify/,
    );
    expect(input).toEqual(original);
  });

  it('preserves authored names verbatim, including blank names for a separate display fallback', () => {
    for (const name of ['', '  ', ' Name 🌙 ', '<b>palette</b>', 'x'.repeat(120)]) {
      expect(normalizePalette({ ...fixture(), name }).palette.name).toBe(name);
    }
  });

  it('returns detached immutable data without modifying its input', () => {
    const input = fixture();
    const original = structuredClone(input);
    const { palette } = normalizePalette(input);
    expect(input).toEqual(original);
    input.colors.formula = '#000000';
    input.groups[0]!.push('text');
    input.style.fontScale = 2;
    input.seeds.master = 'changed';
    input.locks.formula = true;
    input.generation.chroma = 1;
    expect(palette).toEqual(original);
    expect(Object.isFrozen(palette)).toBe(true);
    for (const nested of [
      palette.colors,
      palette.style,
      palette.seeds,
      palette.locks,
      palette.groups,
      palette.groups[0],
      palette.generation,
    ]) {
      expect(Object.isFrozen(nested)).toBe(true);
    }
  });

  it.each([null, [], 7, true, 'palette'])('rejects a non-object root: %j', (value) => {
    expect(() => normalizePalette(value)).toThrow(/root.*Manim theme JSON/);
  });

  it('rejects generic palettes, nested themes, variants, storage and sceneLink containers', () => {
    const input = fixture();
    for (const payload of [
      { name: 'Generic palette', colors: [{ hex: '#AABBCC', rgb: [170, 187, 204] }] },
      { theme: input },
      { variants: { dark: input, light: input } },
      { sceneLink: { version: 2, theme: input } },
      { version: 1, palettes: [{ id: 'local', source: input }] },
      { ...input, format: 'palette' },
      { ...input, format: undefined },
    ]) {
      expect(() => normalizePalette(payload)).toThrow(/format.*manim-palette.*Manim theme JSON/);
    }
  });

  it.each([undefined, null, '1', 0, 2, 1.1, NaN, Infinity])('rejects version %j', (version) => {
    expect(() => normalizePalette({ ...fixture(), version })).toThrow(/version.*number 1/);
  });

  it('rejects invalid JSON and provides the semantic export guidance', () => {
    expect(() => parsePalette('{')).toThrow(/not valid JSON.*Manim theme JSON/);
    // Chroma Lab's page is "Seeds & themes" (its navigation, app/src/data/chroma-lab).
    expect(() => parsePalette('{')).toThrow(
      'Export the Chroma Lab Manim theme JSON from "Use in your animation" or "Seeds & themes".',
    );
  });

  it('enforces the 1 MiB limit before parsing and accepts an input exactly at the byte boundary', () => {
    const text = fixtureText();
    const atLimit = text + ' '.repeat(MAX_PALETTE_BYTES - Buffer.byteLength(text));
    expect(parsePalette(atLimit).palette.name).toBe('Midnight chalkboard');
    expect(() => parsePalette(atLimit + ' ')).toThrow(/1 MiB/);
    expect(() => parsePalette('!'.repeat(MAX_PALETTE_BYTES + 1))).toThrow(/1 MiB/);
  });

  it('counts UTF-8 bytes rather than UTF-16 string length', () => {
    const text = JSON.stringify({ ...fixture(), padding: '🌙'.repeat(MAX_PALETTE_BYTES / 4) });
    expect(text.length).toBeLessThan(MAX_PALETTE_BYTES);
    expect(() => parsePalette(text)).toThrow(/1 MiB/);
  });

  it('reports every missing role together and rejects an inherited required role', () => {
    const input = fixture();
    delete input.colors.variable;
    delete input.colors.arrow;
    expect(() => normalizePalette(input)).toThrow(/missing required roles: variable, arrow/);
    input.colors = Object.create(fixture().colors) as Record<string, unknown>;
    expect(() => normalizePalette(input)).toThrow(/missing required roles: background, formula/);
  });

  it.each([undefined, null, [], 'colors'])('rejects an invalid colors map: %j', (colors) => {
    expect(() => normalizePalette({ ...fixture(), colors })).toThrow(/colors must be an object/);
  });

  it('rejects unknown role keys in both colors and locks instead of dropping them', () => {
    for (const field of ['colors', 'locks'] as const) {
      const input = fixture();
      input[field].custom = field === 'colors' ? '#FFFFFF' : false;
      expect(() => normalizePalette(input)).toThrow(
        new RegExp(`${field} contains unknown roles: custom`),
      );
    }
    const input = fixture();
    input.colors = JSON.parse(
      JSON.stringify(input.colors).replace('{', '{"__proto__":"#fff",'),
    ) as Record<string, unknown>;
    expect(() => normalizePalette(input)).toThrow(/unknown roles: __proto__/);
  });

  it.each([
    'red',
    'rgb(0 0 0)',
    'hsl(0 0% 0%)',
    '#abcd',
    '#12345678',
    '#12',
    '#gggggg',
    '',
    0,
    null,
    {},
    undefined,
  ])('rejects invalid present color %j without mutating source data', (color) => {
    const input = fixture();
    input.colors.variable = color;
    const original = structuredClone(input);
    expect(() => normalizePalette(input)).toThrow(/colors.variable.*opaque 3- or 6-digit HEX/);
    expect(input).toEqual(original);
  });

  it('rejects wrong types for optional metadata objects instead of silently defaulting them', () => {
    for (const field of ['style', 'seeds', 'locks', 'generation']) {
      for (const value of [null, [], 1, 'data']) {
        expect(() => normalizePalette({ ...fixture(), [field]: value })).toThrow(
          new RegExp(`${field} must be an object`),
        );
      }
    }
  });

  it('rejects invalid names and seed strings while accepting the exact length limits', () => {
    for (const name of [null, 1, {}, 'x'.repeat(121)]) {
      expect(() => normalizePalette({ ...fixture(), name })).toThrow(/name.*120/);
    }
    for (const field of ['master', 'background', 'symbols', 'emphasis']) {
      for (const value of [null, 1, {}, 'x'.repeat(257)]) {
        expect(() => normalizePalette({ ...fixture(), seeds: { [field]: value } })).toThrow(
          new RegExp(`seeds.${field}.*256`),
        );
      }
      expect(
        normalizePalette({ ...fixture(), seeds: { [field]: 'x'.repeat(256) } }).palette.seeds,
      ).toHaveProperty(field, 'x'.repeat(256));
    }
  });

  it('rejects malformed style and generation numbers without exporter coercion', () => {
    for (const value of [NaN, Infinity, -Infinity, '1', null, true]) {
      for (const field of ['fillOpacity', 'strokeWidth', 'fontScale']) {
        expect(() => normalizePalette({ ...fixture(), style: { [field]: value } })).toThrow(
          new RegExp(`style.${field} must be a finite number`),
        );
      }
      for (const field of ['chroma', 'diversity']) {
        const input = fixture();
        input.generation[field] = value;
        expect(() => normalizePalette(input)).toThrow(
          new RegExp(`generation.${field} must be a finite number`),
        );
      }
    }
  });

  it('requires generation method and both numeric fields, and rejects an invalid base', () => {
    for (const field of ['method', 'chroma', 'diversity']) {
      const input = fixture();
      delete input.generation[field];
      expect(() => normalizePalette(input)).toThrow(new RegExp(`generation.${field}`));
    }
    for (const method of ['random', 1, null]) {
      const input = fixture();
      input.generation.method = method;
      expect(() => normalizePalette(input)).toThrow(/generation.method/);
    }
    const input = fixture();
    input.generation.base = '#1234';
    expect(() => normalizePalette(input)).toThrow(/generation.base.*opaque/);
  });

  it('rejects invalid theme/background modes and non-boolean locks', () => {
    for (const value of [null, 'system', 1]) {
      expect(() => normalizePalette({ ...fixture(), mode: value })).toThrow(/mode must be/);
      expect(() => normalizePalette({ ...fixture(), backgroundMode: value })).toThrow(
        /backgroundMode must be/,
      );
    }
    for (const value of [null, 1, 'true', undefined]) {
      expect(() => normalizePalette({ ...fixture(), locks: { formula: value } })).toThrow(
        /locks.formula must be a boolean/,
      );
    }
  });

  it('rejects malformed, empty, unknown, background, duplicate or incomplete group membership', () => {
    for (const groups of [null, [], {}, 'groups', [[]], [null], ['formula']]) {
      expect(() => normalizePalette({ ...fixture(), groups })).toThrow(
        /groups\[?\d?\]?.*(nonempty|foreground)/,
      );
    }
    for (const role of ['background', 'custom', null, 1]) {
      expect(() => normalizePalette({ ...fixture(), groups: [[role]] })).toThrow(
        /known foreground role/,
      );
    }
    const groups = fixture().groups;
    groups.push(['formula']);
    expect(() => normalizePalette({ ...fixture(), groups })).toThrow(/duplicate role: formula/);
    expect(() => normalizePalette({ ...fixture(), groups: [['formula']] })).toThrow(
      /missing foreground roles: variable, constant/,
    );
  });

  it('rejects unequal linked colors or locks without repairing authored values', () => {
    const input = fixture();
    input.groups = input.groups.filter((group) => group[0] !== 'text');
    input.groups[0]!.push('text');
    input.colors.text = '#000000';
    expect(() => normalizePalette(input)).toThrow(/groups contains unequal colours: formula, text/);
    input.colors.text = input.colors.formula;
    input.locks.text = true;
    expect(() => normalizePalette(input)).toThrow(/groups contains unequal locks: formula, text/);
    input.locks.formula = true;
    expect(normalizePalette(input).palette.groups[0]).toEqual(['formula', 'text']);
  });
});

describe('the roles the user added to a palette', () => {
  const withRoles = (customRoles: unknown) => ({ ...minimalPalette(), customRoles });

  it('reads them in their order, the names trimmed and the colors as upper-case hex', () => {
    const { palette, warnings } = normalizePalette(
      withRoles([
        { name: '  highlight ', color: '#ffd400' },
        { name: 'Accent 2', color: '0bf' },
      ]),
    );
    expect(palette.customRoles).toEqual([
      { name: 'highlight', color: '#FFD400' },
      { name: 'Accent 2', color: '#00BBFF' },
    ]);
    expect(warnings).toEqual([]);
    expect(Object.isFrozen(palette.customRoles)).toBe(true);
    expect(Object.isFrozen(palette.customRoles![0])).toBe(true);
    // Read back from what is written, they are the same.
    expect(parsePalette(JSON.stringify(palette)).palette).toEqual(palette);
  });

  it('writes a palette without them as it always was: no field', () => {
    expect(normalizePalette(minimalPalette()).palette).not.toHaveProperty('customRoles');
    expect(normalizePalette(withRoles([])).palette).not.toHaveProperty('customRoles');
    const verbatim = parsePalette(fixtureText()).palette;
    expect(Object.keys(verbatim)).not.toContain('customRoles');
  });

  it('refuses a name a palette cannot have', () => {
    const named = (...names: string[]) =>
      normalizePalette(withRoles(names.map((name) => ({ name, color: '#000000' }))));
    expect(() => named('')).toThrow('1 to 32 characters');
    expect(() => named('   ')).toThrow('1 to 32 characters');
    expect(() => named('x'.repeat(33))).toThrow('1 to 32 characters');
    expect(() => named('two\nlines')).toThrow('on one line');
    expect(() => named('formula')).toThrow('one of the roles every palette has');
    expect(() => named('Background')).toThrow('one of the roles every palette has');
    expect(() => named('glow', 'Glow')).toThrow('already has a role named “Glow”');
    expect(named('x'.repeat(32)).palette.customRoles).toHaveLength(1);
    expect(() => normalizePalette(withRoles([{ name: 7, color: '#000000' }]))).toThrow(
      '1 to 32 characters',
    );
  });

  it('refuses what is not a list of names and colors, and more than it holds', () => {
    expect(() => normalizePalette(withRoles({ glow: '#000000' }))).toThrow('must be an array');
    expect(() => normalizePalette(withRoles(['glow']))).toThrow('customRoles[0] must be an object');
    expect(() => normalizePalette(withRoles([{ name: 'glow' }]))).toThrow('customRoles[0].color');
    expect(() => normalizePalette(withRoles([{ name: 'glow', color: 'red' }]))).toThrow('HEX');
    const many = (count: number) =>
      withRoles(Array.from({ length: count }, (_, i) => ({ name: `role ${i}`, color: '#000000' })));
    expect(normalizePalette(many(PALETTE_CUSTOM_ROLE_LIMIT)).palette.customRoles).toHaveLength(
      PALETTE_CUSTOM_ROLE_LIMIT,
    );
    expect(() => normalizePalette(many(PALETTE_CUSTOM_ROLE_LIMIT + 1))).toThrow('up to 24 roles');
  });

  it('keeps refusing an unknown role among the eleven colors', () => {
    const input = minimalPalette();
    input.colors = { ...(input.colors as object), glow: '#000000' };
    expect(() => normalizePalette(input)).toThrow('unknown roles: glow');
  });
});

describe('palette object role mapping', () => {
  it('maps object kinds and shape presets while keeping math/text label roles independent', () => {
    expect(paletteRoleForKind('math')).toBe('formula');
    expect(paletteRoleForKind('tex')).toBe('text');
    expect(paletteRoleForKind('brace')).toBe('muted');
    expect(paletteRoleForKind('shape')).toBe('rectangle');
    expect(paletteRoleForKind('shape', 'box')).toBe('rectangle');
    expect(paletteRoleForKind('shape', 'underline')).toBe('rectangle');
    expect(paletteRoleForKind('shape', 'circle')).toBe('circle');
    expect(paletteRoleForKind('shape', 'cross')).toBe('arrow');
    // What the Editor palettes dialog says `arrow` colours: lines and arrows (one kind), crosses
    // and cross lines.
    expect(paletteRoleForKind('shape', 'cross_line')).toBe('arrow');
    expect(paletteRoleForKind('line')).toBe('arrow');
  });
});
