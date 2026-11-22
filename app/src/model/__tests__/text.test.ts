// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createEmptyProject,
  createTextFormula,
  FORMAT_VERSION,
  parseProject,
  serializeProject,
  sameTextBasis,
  TextSourceSchema,
  validateTextGeometryArtifact,
} from '../index';
import { textGeometryFixture } from './textFixtures';

describe('literal text format', () => {
  it('round-trips literal source and whole-object attributes without normalization', () => {
    const project = createEmptyProject();
    const source = '<&{{\n e\u0301 \t😀 \n';
    project.formulas.push(
      createTextFormula({
        source,
        font: { family: 'Fixture Sans', weight: 'bold', slant: 'italic' },
      }),
    );
    const parsed = parseProject(serializeProject(project));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.project).toEqual(project);
    expect(parsed.project.formulas[0]!.source).toBe(source);
    expect(parsed.project.version).toBe(FORMAT_VERSION);
  });

  it('migrates manifest 16 without changing existing snapshots, audio or visual state', () => {
    const old = { ...createEmptyProject(), version: 16 };
    const parsed = parseProject(JSON.stringify(old));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.migratedFrom).toBe(16);
    expect(parsed.project).toEqual({ ...old, version: FORMAT_VERSION });
  });

  it('opens a manifest 17 file as it is: it only lacked the geometry section', () => {
    const project = createEmptyProject();
    project.formulas.push(createTextFormula({ source: 'A', geometry: reference('a') }));
    const current = serializeProject(project);
    const old = current.replace(`"version": ${FORMAT_VERSION}`, '"version": 17');
    expect(old).not.toBe(current);
    const parsed = parseProject(old);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.migratedFrom).toBe(17);
    expect(parsed.textGeometry).toEqual({});
    expect(serializeProject(parsed.project)).toBe(current);
  });

  it('rejects malformed Unicode, NUL, excess UTF-8 bytes and excessive lines', () => {
    for (const source of ['\ud800', '\udc00', 'a\0b', '😀'.repeat(8193), '\n'.repeat(512)]) {
      expect(TextSourceSchema.safeParse(source).success).toBe(false);
    }
    expect(TextSourceSchema.parse('e\u0301\n😀')).toBe('e\u0301\n😀');
  });
});

/** A geometry reference by a one-letter hash; the model does not look inside the payload. */
function reference(letter: string) {
  return {
    contentHash: letter.repeat(64),
    byteLength: 1,
    key: `key-${letter}`,
    basisKey: `basis-${letter}`,
  };
}

describe('the geometry section of a project file', () => {
  function withTexts(...letters: string[]) {
    const project = createEmptyProject();
    for (const letter of letters) {
      project.formulas.push(
        createTextFormula({ name: letter, source: letter, geometry: reference(letter) }),
      );
    }
    return project;
  }

  it('writes each geometry on one line, in the bytes its hash names, sorted by hash', () => {
    const project = withTexts('b', 'a');
    const a = { format: 'mfe-text-geometry', glyphs: [{ contours: [[0, 0.5, -1e-7, 1e21]] }] };
    const b = { label: 'é "quoted" \u2028', nested: { list: [1, 2, 3] } };
    const text = serializeProject(project, { ['b'.repeat(64)]: b, ['a'.repeat(64)]: a });
    const lines = text.split('\n');
    const start = lines.indexOf('  "textGeometry": {');
    expect(lines.slice(start)).toEqual([
      '  "textGeometry": {',
      `    "${'a'.repeat(64)}": ${JSON.stringify(a)},`,
      `    "${'b'.repeat(64)}": ${JSON.stringify(b)}`,
      '  }',
      '}',
      '',
    ]);
    // The section is the file's last one: the project reads as before, above it.
    expect(lines.slice(0, start).join('\n')).toBe(serializeProject(project).slice(0, -3) + ',');
    expect(JSON.parse(text)).toEqual({
      ...JSON.parse(serializeProject(project)),
      textGeometry: { ['a'.repeat(64)]: a, ['b'.repeat(64)]: b },
    });
  });

  it('reads the section beside the project, which only names its geometry', () => {
    const project = withTexts('a', 'b');
    const section = { ['a'.repeat(64)]: { any: 'value' }, ['b'.repeat(64)]: [1, 2] };
    const text = serializeProject(project, section);
    const parsed = parseProject(text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.project).toEqual(project);
    expect('textGeometry' in parsed.project).toBe(false);
    expect(parsed.textGeometry).toEqual(section);
    expect(parsed.migratedFrom).toBeNull();
    expect(serializeProject(parsed.project, parsed.textGeometry)).toBe(text);
  });

  it('writes no section for a project without geometry to carry', () => {
    const project = withTexts('a');
    expect(serializeProject(project, {})).toBe(serializeProject(project));
    expect(serializeProject(project)).not.toContain('textGeometry');
    const parsed = parseProject(serializeProject(project));
    expect(parsed.ok && parsed.textGeometry).toEqual({});
  });

  it('keeps only what texts of the project name, and tells a missing entry by its absence', () => {
    const project = withTexts('a', 'b');
    const stray = { ['c'.repeat(64)]: { nobody: 'names it' }, notAHash: 1 };
    const text = serializeProject(project, { ['a'.repeat(64)]: { kept: true }, ...stray });
    const parsed = parseProject(text);
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.textGeometry).toEqual({ ['a'.repeat(64)]: { kept: true } });
    expect(Object.keys(parsed.textGeometry)).toEqual(['a'.repeat(64)]);
  });

  it('opens a file whose section is not an object without it, and says so', () => {
    const project = withTexts('a');
    for (const section of ['[]', '"x"', '3', 'null']) {
      const text = serializeProject(project).replace(
        /\n}\n$/,
        `,\n  "textGeometry": ${section}\n}\n`,
      );
      expect(JSON.parse(text).textGeometry).toEqual(JSON.parse(section));
      const parsed = parseProject(text);
      if (!parsed.ok) throw new Error(parsed.error);
      // The project is whole; only what the section should have carried is not there.
      expect(parsed.project).toEqual(project);
      expect(parsed.textGeometry).toEqual({});
      expect(parsed.issues).toEqual([
        {
          severity: 'warning',
          code: 'text-geometry-section',
          message:
            'The file’s textGeometry section is not an object of geometry by content hash. It ' +
            'was ignored: the font texts open without the appearance it should carry.',
          path: ['textGeometry'],
        },
      ]);
    }
  });
});

describe('portable text geometry validation', () => {
  it('compares authored freshness independently of native environment', () => {
    const first = textGeometryFixture();
    const second = structuredClone(first);
    second.provenance.environmentKey = 'another-machine';
    expect(sameTextBasis(first.basis, second.basis)).toBe(true);
    second.basis.font.weight = 'bold';
    expect(sameTextBasis(first.basis, second.basis)).toBe(false);
  });

  it.each(['range', 'surrogate', 'contour', 'index', 'bounds', 'nonfinite'] as const)(
    'rejects invalid %s instead of publishing a native response',
    (kind) => {
      const artifact = textGeometryFixture('😀');
      if (kind === 'range') artifact.glyphs[0]!.sourceRanges[0]!.end = 3;
      if (kind === 'surrogate') artifact.glyphs[0]!.sourceRanges[0]!.end = 1;
      if (kind === 'contour') artifact.glyphs[0]!.contours[0]!.push(1);
      if (kind === 'index') artifact.glyphs[0]!.index = 1;
      if (kind === 'bounds') artifact.bbox.maxX = 0.5;
      if (kind === 'nonfinite') artifact.glyphs[0]!.contours[0]![0] = Infinity;
      expect(() => validateTextGeometryArtifact(artifact)).toThrow();
    },
  );

  it('reads a geometry that carries the nativeIndex nobody ever wrote, and drops the field', () => {
    // The field was reserved for a child index of its own; a glyph is the child of its index.
    const artifact = textGeometryFixture('AB');
    const second = structuredClone(artifact.glyphs[0]!);
    artifact.glyphs.push({ ...second, index: 1 });
    const stored = structuredClone(artifact) as unknown as { glyphs: Record<string, unknown>[] };
    for (const glyph of stored.glyphs) glyph.nativeIndex = 0;
    const read = validateTextGeometryArtifact(stored);
    expect(read).toEqual(artifact);
    for (const glyph of read.glyphs) expect(glyph).not.toHaveProperty('nativeIndex');
  });
});
