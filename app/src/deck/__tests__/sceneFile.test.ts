// @vitest-environment node
/* The two files of an exported scene — the glyph file and the project —, read back: the page
 * draws what the editor drew, and says what a hand that edited them got wrong. */
import { beforeAll, describe, expect, it } from 'vitest';
import { generatePython } from '../../export/codegen';
import { makeScene } from '../../embed/engine';
import { renderedExample, type Rendered } from '../../embed/__tests__/fixtures';
import { createFormula, type Project } from '../../model';
import { EXAMPLES } from '../../test/examples';
import {
  changedSince,
  GLYPHS_VERSION,
  glyphFileProblem,
  packGlyphs,
  reviveGlyphs,
  type GlyphFile,
} from '../glyphFile';
import { clipNames } from '../names';
import { buildDeckScene, hasDeckErrors, wherePath } from '../sceneFile';

const rendered = new Map<string, Rendered>();
beforeAll(async () => {
  for (const name of EXAMPLES) rendered.set(name, await renderedExample(name));
}, 120_000);

/** The files of an example as the page's scripts give them: through JSON. */
function files(name: string): { project: Project; glyphs: GlyphFile } {
  const { project, resolved } = rendered.get(name)!;
  return {
    project: JSON.parse(JSON.stringify(project)) as Project,
    glyphs: JSON.parse(JSON.stringify(packGlyphs(project, resolved))) as GlyphFile,
  };
}

describe('the glyph file', () => {
  it.each(EXAMPLES)('draws %s as the editor draws it, to a ten-thousandth of a unit', (name) => {
    const { project, resolved } = rendered.get(name)!;
    const own = makeScene(project, resolved, { includeHidden: true });
    const { scene, problems } = buildDeckScene(files(name).project, files(name).glyphs);
    expect(problems.filter((problem) => problem.severity === 'error')).toEqual([]);
    expect(scene).not.toBeNull();
    const steps = Math.ceil(own.duration * 4);
    for (let k = 0; k <= steps; k++) {
      const t = (k / steps) * own.duration;
      const expected = own.evaluate(t);
      const drawn = scene!.evaluate(t);
      expect(drawn.map((d) => d.key)).toEqual(expected.map((d) => d.key));
      // One comparison per piece: a scene has thousands of numbers at an instant.
      let worst = 0;
      drawn.forEach((d, index) => {
        const want = expected[index]!;
        expect(d.fill).toEqual(want.fill);
        expect(d.stroke).toEqual(want.stroke);
        const got = d.path.contours.flat();
        const wanted = want.path.contours.flat();
        expect(got).toHaveLength(wanted.length);
        for (let i = 0; i < got.length; i++) {
          worst = Math.max(worst, Math.abs(got[i]! - wanted[i]!));
        }
      });
      // An outline is kept to 0.0001 of a unit; a clip may draw it several times larger.
      expect(worst).toBeLessThan(2e-3);
    }
  });

  it('keeps a glyph as a line of path data, and a line or an arrow not at all', () => {
    const { glyphs, project } = files('lines.mfe.json');
    const kinds = new Map(project.formulas.map((formula) => [formula.id, formula.kind]));
    expect(project.formulas.some((formula) => formula.kind === 'line')).toBe(true);
    for (const [id, entry] of Object.entries(glyphs.formulas)) {
      expect(kinds.get(id)).not.toBe('line');
      expect(entry.kind).toBe(kinds.get(id));
      for (const glyph of entry.glyphs) expect(glyph.d).toMatch(/^(M[-\d. ]+(C[-\d. ]+)+Z?)*$/);
    }
    expect(glyphs.version).toBe(GLYPHS_VERSION);
  });

  it('says what each formula’s outlines were made of, in words', () => {
    const { glyphs, project } = files('hello.mfe.json');
    const formula = project.formulas[0]!;
    expect(glyphs.formulas[formula.id]!.made).toEqual({
      'its source': formula.source,
      'its packages': [],
      'its font size': formula.fontSize,
      'the project’s preamble': project.meta.preamble,
      'the project’s target': project.meta.target,
    });
    expect(glyphs.formulas[formula.id]!.name).toBe(formula.name);
  });

  it('tells a formula that changed what it is made of, and still draws it', () => {
    const { glyphs, project } = files('hello.mfe.json');
    const formula = project.formulas[0]!;
    expect(changedSince(formula, project.meta, glyphs.formulas[formula.id]!)).toBeNull();
    formula.source = `${formula.source}+1`;
    expect(changedSince(formula, project.meta, glyphs.formulas[formula.id]!)).toBe('its source');
    const { resolved, problems } = reviveGlyphs(project, glyphs);
    expect(resolved.has(formula.id)).toBe(true);
    expect(problems).toEqual([
      {
        formulaId: formula.id,
        message: `"${formula.name}" changed its source since the scene was exported, and is drawn with the outlines it came with: the page does not typeset LaTeX. Put it back, or export the scene again from the editor.`,
      },
    ]);
    // Its colour, its name, its hidden glyphs are not what it is made of.
    const recoloured = files('hello.mfe.json').project;
    recoloured.formulas[0]!.color = '#FF0000';
    recoloured.formulas[0]!.name = 'renamed';
    expect(reviveGlyphs(recoloured, glyphs).problems).toEqual([]);
    expect(reviveGlyphs(recoloured, glyphs).resolved.get(formula.id)!.formula.color).toBe(
      '#FF0000',
    );
  });

  it('tells a formula the file has no outlines for, and does not draw it', () => {
    const { glyphs, project } = files('hello.mfe.json');
    const added = createFormula({ name: 'new', source: 'x^2' });
    project.formulas.push(added);
    const { resolved, problems } = reviveGlyphs(project, glyphs);
    expect(resolved.has(added.id)).toBe(false);
    expect(problems.map((problem) => problem.formulaId)).toEqual([added.id]);
    expect(problems[0]!.message).toContain('"new" has no outlines in the glyph file');
    // A formula with nothing to typeset is not missed.
    project.formulas.at(-1)!.source = '  ';
    expect(reviveGlyphs(project, glyphs).problems).toEqual([]);
  });

  it('refuses a file of another version, and what is not a glyph file', () => {
    expect(glyphFileProblem({ version: GLYPHS_VERSION, formulas: {} })).toBeNull();
    expect(glyphFileProblem({ version: 99, formulas: {} })).toContain('version 99');
    expect(glyphFileProblem(null)).toBe('it is not an object');
    expect(glyphFileProblem({ version: GLYPHS_VERSION })).toBe('it has no formulas');
  });
});

describe('buildDeckScene', () => {
  it('makes the scene of the two files, with the names of its clips', () => {
    const { project, glyphs } = files('hello.mfe.json');
    const built = buildDeckScene(project, glyphs);
    expect(built.problems).toEqual([]);
    expect(built.scene!.duration).toBeGreaterThan(0);
    expect([...built.names.values()]).toEqual([...clipNames(project).values()]);
  });

  it('says where the scene file is not a project, in the editor’s words, and makes no scene', () => {
    const { project, glyphs } = files('hello.mfe.json');
    const raw = project as unknown as { clips: { intro: { kind: string } }[]; tracks: unknown };
    raw.clips[0]!.intro.kind = 'explode';
    const built = buildDeckScene(raw, glyphs);
    expect(built.scene).toBeNull();
    expect(built.problems).toHaveLength(1);
    expect(built.problems[0]).toMatchObject({
      severity: 'error',
      file: 'scene.js',
      where: 'clips[0].intro.kind',
    });
    expect(hasDeckErrors(built.problems)).toBe(true);
    expect(buildDeckScene(undefined, glyphs).scene).toBeNull();
    expect(buildDeckScene('a scene', glyphs).problems[0]!.file).toBe('scene.js');
  });

  it('gives the editor’s own rules of a project that breaks them, and still draws it', () => {
    const { project, glyphs } = files('hello.mfe.json');
    project.clips[0]!.end = project.clips[0]!.start; // a clip of no length
    const built = buildDeckScene(project, glyphs);
    expect(
      built.problems.some((p) => p.severity === 'error' && p.where.startsWith('clips[0]')),
    ).toBe(true);
    expect(built.scene).not.toBeNull();
  });

  it('says so when the glyph file is missing or of another version', () => {
    const { project } = files('hello.mfe.json');
    const built = buildDeckScene(project, undefined);
    expect(built.scene).toBeNull();
    expect(built.problems).toEqual([
      {
        severity: 'error',
        file: 'glyphs.js',
        where: '',
        message: 'The glyph file cannot be used: it is not an object.',
      },
    ]);
  });

  it('carries the warnings of the project: a mark of the Slides mode out of place', () => {
    const { project, glyphs } = files('hello.mfe.json');
    project.slides = { marks: [{ id: 'p1', time: 999, kind: 'pause' }] };
    const built = buildDeckScene(project, glyphs);
    expect(built.scene).not.toBeNull();
    expect(hasDeckErrors(built.problems)).toBe(false);
    expect(built.problems).toMatchObject([{ severity: 'warning', where: 'slides.marks[0].time' }]);
  });

  it('writes a path as a reader of the file would', () => {
    expect(wherePath(['clips', 2, 'intro', 'kind'])).toBe('clips[2].intro.kind');
    expect(wherePath(['meta'])).toBe('meta');
    expect(wherePath([])).toBe('');
  });
});

describe('clipNames', () => {
  it.each(EXAMPLES)('names the clips of %s as the exported Python names them', (name) => {
    const { project, resolved } = rendered.get(name)!;
    const names = [...clipNames(project).values()];
    expect(new Set(names).size).toBe(names.length);
    const python = generatePython(project, resolved, {
      target: project.meta.target,
      sceneName: 'Scene1',
      indexing: 'auto',
      comments: false,
    }).code;
    for (const clipName of names) expect(python).toMatch(new RegExp(`\\b${clipName}\\b`));
  });

  it('numbers the later clips of a formula, in the order the clips start', () => {
    const { project } = files('hello.mfe.json');
    const [first] = project.clips;
    project.clips.push({ ...first!, id: 'c_later', start: 90, end: 95 });
    project.clips.unshift({ ...first!, id: 'c_earlier', start: -1, end: -0.5 });
    const names = clipNames(project);
    const base = project.formulas.find((formula) => formula.id === first!.formulaId)!.name;
    expect(names.get('c_earlier')).toBe(base);
    expect(names.get(first!.id)).toBe(`${base}_2`);
    expect(names.get('c_later')).toBe(`${base}_3`);
  });
});
