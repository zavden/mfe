// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createTextFormula,
  type Issue,
  type Project,
  type Target,
} from '../../../model';
import {
  producerOf,
  renderRequestFor,
  resolveFormula,
  textArtifactRender,
  textBoxesKey,
  toSnapshot,
  type FormulaRender,
  type ResolvedFormulas,
  type TextRenderRequest,
} from '../../../engine';
import { textGeometry } from '../../../test/textGeometry';
import { generatePython } from '..';

describe('native font-text emission', () => {
  it.each(['ce', 'gl'] as const)(
    'keeps %s literal braces, size, flat membership and post-shaping paint',
    (target) => {
      const project = createEmptyProject();
      project.meta.preamble = '\\newcommand{\\example}{x}';
      const artifact = textGeometry('AV {{x}}', undefined, target);
      const render = textArtifactRender(artifact);
      const formula = createTextFormula({
        name: 'title',
        source: artifact.basis.source,
        font: artifact.basis.font,
        snapshot: toSnapshot(render),
        glyphColors: { '0': '#FF0000' },
      });
      project.formulas.push(formula);
      project.clips.push(createClip(formula.id, project.tracks[0]!.id, 0, 2));
      const result = generatePython(
        project,
        new Map([[formula.id, resolveFormula(formula, render)]]),
        {
          target,
          sceneName: 'FontText',
          indexing: 'auto',
          comments: false,
        },
      );
      expect(result.issues.filter((issue) => issue.severity === 'error')).toEqual([]);
      expect(result.code).toContain('font_size=48');
      expect(result.code).toContain('disable_ligatures=False');
      expect(result.code).toContain('AV {{x}}');
      expect(result.code).toContain('title[0].set_color(');
      expect(result.code).not.toContain('title[0][0]');
      expect(result.code).not.toContain('TexTemplate()');
      expect(result.code).not.toContain('t2c=');
      // The scene checks the text it built against the saved one, and names it if they differ.
      expect(result.code).toContain(
        `_mfe_verify_text(title, r"title", "${target}", 7, "${'0'.repeat(64)}")`,
      );
      if (target === 'ce') expect(result.code).toContain('with tempconfig(');
      else expect(result.code).toContain("alignment='LEFT'");
    },
  );

  /** A text with per-glyph paint on the timeline of a project for `projectTarget`, and the render
   * of its saved geometry, shaped by `shapedBy`. */
  function scene(shapedBy: Target, projectTarget: Target = shapedBy) {
    const project = createEmptyProject();
    project.meta.target = projectTarget;
    const artifact = textGeometry('AV office', undefined, shapedBy);
    const render = textArtifactRender(artifact);
    const formula = createTextFormula({
      name: 'title',
      source: artifact.basis.source,
      font: artifact.basis.font,
      snapshot: toSnapshot(render),
      geometry: {
        contentHash: 'a'.repeat(64),
        byteLength: 1,
        key: artifact.key,
        basisKey: artifact.basisKey,
      },
      glyphColors: { '3': '#FF0000' },
    });
    project.formulas.push(formula);
    project.clips.push(createClip(formula.id, project.tracks[0]!.id, 0, 2));
    return { project, formula, render, artifact };
  }

  const python = (project: Project, resolved: ResolvedFormulas, target: Target) =>
    generatePython(project, resolved, {
      target,
      sceneName: 'FontText',
      indexing: 'auto',
      comments: false,
    });

  const codes = (issues: readonly Issue[], severity: Issue['severity']) =>
    issues.filter((issue) => issue.severity === severity).map((issue) => issue.code);

  it.each([
    ['ce', 'gl', 'font_size=70.4544', 'ManimCE'],
    ['gl', 'ce', 'font_size=32.702003', 'ManimGL'],
  ] as const)(
    'writes a text %s shaped for %s at the size the preview shows, by the same indices',
    (shapedBy, target, size, shaper) => {
      const { project, formula, render } = scene(shapedBy);
      const result = python(
        project,
        new Map([[formula.id, resolveFormula(formula, render)]]),
        target,
      );
      expect(codes(result.issues, 'error')).toEqual([]);
      expect(result.code).toContain('title = Text(r"AV office"');
      expect(result.code).toContain(size);
      expect(result.code).toContain('title[3].set_color("#FF0000")');
      // The other library's fingerprint says nothing about this one's outlines: the scene
      // checks the number of glyphs alone.
      expect(result.code).toContain(`_mfe_verify_text(title, r"title", "${target}", 8)\n`);
      const issue = result.issues.find((item) => item.code === 'export-text-other-library');
      expect(issue?.severity).toBe('warning');
      expect(issue?.message).toContain(`Font text "title" was shaped by ${shaper}.`);
      expect(issue?.message).toContain('the same glyphs in the same order');
      expect(issue?.message).toContain(target === 'gl' ? '× 1.4678' : '× 0.6813');
    },
  );

  it('names every text of the other library in one issue', () => {
    const { project, formula, render } = scene('ce');
    const second = { ...formula, id: 'second', name: 'credits' };
    project.formulas.push(second);
    project.clips.push(createClip(second.id, project.tracks[0]!.id, 2, 2));
    const resolved = new Map([
      [formula.id, resolveFormula(formula, render)],
      [second.id, resolveFormula(second, render)],
    ]);
    const issues = python(project, resolved, 'gl').issues.filter(
      (issue) => issue.code === 'export-text-other-library',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toContain('Font texts "title", "credits" were shaped by ManimCE.');
    const unchecked = python(project, new Map(), 'ce').issues.filter(
      (issue) => issue.code === 'export-text-unchecked',
    );
    expect(unchecked).toHaveLength(1);
    expect(unchecked[0]!.message).toContain('Font texts "title", "credits": the scene checks only');
  });

  it('names a text once in an issue, whatever the texts that share its name', () => {
    const { project, formula, render } = scene('ce');
    const twin = { ...formula, id: 'twin' };
    project.formulas.push(twin);
    project.clips.push(createClip(twin.id, project.tracks[0]!.id, 2, 2));
    const resolved = new Map([
      [formula.id, resolveFormula(formula, render)],
      [twin.id, resolveFormula(twin, render)],
    ]);
    const [issue] = python(project, resolved, 'gl').issues.filter(
      (item) => item.code === 'export-text-other-library',
    );
    expect(issue!.message).toContain('Font text "title" was shaped by ManimCE.');
  });

  it('writes the name the warning gives a text on one line, whatever the name', () => {
    const { project, formula, render } = scene('ce');
    const named = { ...formula, name: 'Two\nlines "quoted" \\' };
    project.formulas[0] = named;
    const result = python(project, new Map([[named.id, resolveFormula(named, render)]]), 'ce');
    const calls = result.code
      .split('\n')
      .filter((line) => line.trim().startsWith('_mfe_verify_text('));
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain(String.raw`, "Two lines \"quoted\" \\", "ce", 8, "`);
    expect(calls[0]!.endsWith('")')).toBe(true);
  });

  it('follows the library that shaped the text, not the one the project names', () => {
    // The project was switched to ManimGL with the companion off: the text still is ManimCE's.
    const { project, formula, render } = scene('ce', 'gl');
    const resolved = new Map([[formula.id, resolveFormula(formula, render)]]);
    const own = python(project, resolved, 'ce');
    expect(own.code).toContain('font_size=48,');
    expect(own.code).toContain('_mfe_verify_text(title, r"title", "ce", 8, "');
    expect(codes(own.issues, 'warning')).not.toContain('export-text-other-library');
    const other = python(project, resolved, 'gl');
    expect(other.code).toContain('font_size=70.4544');
    expect(other.code).toContain('_mfe_verify_text(title, r"title", "gl", 8)\n');
    expect(codes(other.issues, 'warning')).toContain('export-text-other-library');
  });

  it('writes a text whose saved shape is not at hand, and says the scene cannot check it', () => {
    const { project } = scene('ce');
    const result = python(project, new Map(), 'ce');
    expect(codes(result.issues, 'error')).toEqual([]);
    expect(result.code).toContain('title = Text(r"AV office"');
    expect(result.code).toContain('title[3].set_color("#FF0000")');
    expect(result.code).toContain('_mfe_verify_text(title, r"title", "ce", 8)\n');
    const issue = result.issues.find((item) => item.code === 'export-text-unchecked');
    expect(issue?.severity).toBe('warning');
    expect(issue?.message).toContain(
      'Font text "title": the scene checks only how many glyphs Manim builds, not their outlines',
    );
  });

  it('says the same of a saved shape without a fingerprint', () => {
    const { project, formula, artifact } = scene('gl');
    const provenance = { ...artifact.provenance };
    delete provenance.geometrySignature;
    const render = textArtifactRender({ ...artifact, provenance });
    const result = python(project, new Map([[formula.id, resolveFormula(formula, render)]]), 'gl');
    expect(result.code).toContain('title = Text(');
    expect(result.code).toContain('_mfe_verify_text(title, r"title", "gl", 8)\n');
    expect(codes(result.issues, 'warning')).toEqual(['export-text-unchecked']);
  });

  it('checks a text only against the geometry its glyph references count by', () => {
    // A newer shaping is in the render store while the project still holds the earlier one.
    const { project, formula, artifact } = scene('ce');
    const newer = textArtifactRender({ ...artifact, key: `${artifact.key}-newer` });
    const result = python(project, new Map([[formula.id, resolveFormula(formula, newer)]]), 'ce');
    expect(result.code).toContain('title = Text(');
    expect(result.code).toContain('_mfe_verify_text(title, r"title", "ce", 8)\n');
    expect(codes(result.issues, 'warning')).toEqual(['export-text-unchecked']);
  });

  it('leaves out a text whose saved shape is of another source: its glyphs are unknown', () => {
    const project = createEmptyProject();
    const render = textArtifactRender(textGeometry('old'));
    const formula = createTextFormula({ source: 'new', snapshot: toSnapshot(render) });
    project.formulas.push(formula);
    project.clips.push(createClip(formula.id, project.tracks[0]!.id, 0, 1));
    for (const target of ['ce', 'gl'] as const) {
      const result = python(
        project,
        new Map([[formula.id, resolveFormula(formula, render)]]),
        target,
      );
      expect(result.issues).toContainEqual(
        expect.objectContaining({ severity: 'error', code: 'export-missing-render' }),
      );
      expect(result.code).not.toContain('= Text(');
    }
  });

  it('leaves out a text nothing ever drew, not even as boxes', () => {
    const project = createEmptyProject();
    const formula = createTextFormula({ source: 'never' });
    project.formulas.push(formula);
    project.clips.push(createClip(formula.id, project.tracks[0]!.id, 0, 1));
    const result = python(project, new Map(), 'ce');
    expect(codes(result.issues, 'error')).toContain('export-missing-render');
    expect(result.code).not.toContain('= Text(');
  });
});

describe('a font text nothing has shaped, in the generated scene', () => {
  const python = (project: Project, resolved: ResolvedFormulas, target: Target) =>
    generatePython(project, resolved, {
      target,
      sceneName: 'FontText',
      indexing: 'auto',
      comments: false,
    });
  const codes = (issues: readonly Issue[], severity: Issue['severity']) =>
    issues.filter((issue) => issue.severity === severity).map((issue) => issue.code);

  /** The boxes of `formula` for a project of `target`. */
  function boxesOf(formula: ReturnType<typeof createTextFormula>, target: Target): FormulaRender {
    const request = renderRequestFor(formula, { preamble: '', target }, 'auto');
    const result = producerOf('text').free(request, textBoxesKey(request as TextRenderRequest));
    if (!result.ok) throw new Error(result.error.message);
    return result.render;
  }

  /** A project for `target` with a text drawn as boxes, as the render sync leaves it. */
  function boxed(target: Target = 'ce', source = 'AV office') {
    const project = createEmptyProject();
    project.meta.target = target;
    const draft = createTextFormula({ name: 'title', source, glyphColors: { '3': '#FF0000' } });
    const render = boxesOf(draft, target);
    const formula = { ...draft, snapshot: toSnapshot(render) };
    project.formulas.push(formula);
    project.clips.push(createClip(formula.id, project.tracks[0]!.id, 0, 2));
    return { project, formula, render };
  }

  it.each(['ce', 'gl'] as const)(
    'is written for %s as it stands, its glyphs counted by its boxes, with a warning',
    (target) => {
      const { project, formula, render } = boxed(target);
      const result = python(
        project,
        new Map([[formula.id, resolveFormula(formula, render)]]),
        target,
      );
      expect(codes(result.issues, 'error')).toEqual([]);
      expect(result.code).toContain('title = Text(r"AV office"');
      expect(result.code).toContain('font_size=48');
      // Eight characters draw something: eight glyphs, by index; the o of "office".
      expect(result.code).toContain('title[3].set_color("#FF0000")');
      // No fingerprint to check: the scene counts the glyphs Manim builds.
      expect(result.code).toContain(`_mfe_verify_text(title, r"title", "${target}", 8)\n`);
      expect(codes(result.issues, 'warning')).toEqual(['export-text-unshaped']);
      const issue = result.issues.find((item) => item.code === 'export-text-unshaped')!;
      expect(issue.message).toBe(
        'Font text "title": nothing has shaped it as it stands (no companion drew it). It is ' +
          'written all the same, its glyphs counted one per character (or as an earlier shape ' +
          'of the same text counted them): where the font joins letters into one glyph, or the ' +
          'text runs right to left, colours and animations of single glyphs can land on other ' +
          'glyphs. The scene says so when it runs if Manim builds another number of glyphs.',
      );
    },
  );

  it('is sized for the other library from the one its boxes were laid out for', () => {
    const { project, formula, render } = boxed('ce');
    const result = python(project, new Map([[formula.id, resolveFormula(formula, render)]]), 'gl');
    expect(codes(result.issues, 'error')).toEqual([]);
    expect(result.code).toContain('font_size=70.4544');
    expect(result.code).toContain('_mfe_verify_text(title, r"title", "gl", 8)\n');
    expect(codes(result.issues, 'warning')).toContain('export-text-unshaped');
  });

  it('is written from its snapshot of boxes alone, the render not being at hand', () => {
    const { project } = boxed('ce');
    const result = python(project, new Map(), 'ce');
    expect(codes(result.issues, 'error')).toEqual([]);
    expect(result.code).toContain('title = Text(r"AV office"');
    expect(codes(result.issues, 'warning')).toEqual(['export-text-unshaped']);
  });

  it('keeps the count of an earlier shape of the same source (a new font, a new size)', () => {
    // Shaped as "office" with its ligature (o, ffi, c, e), then given another size where
    // nothing could shape it: the sync keeps the shaped snapshot and draws boxes through it.
    const project = createEmptyProject();
    const artifact = textGeometry('office', [
      { start: 0, end: 1 },
      { start: 1, end: 4 },
      { start: 4, end: 5 },
      { start: 5, end: 6 },
    ]);
    const formula = createTextFormula({
      name: 'title',
      source: 'office',
      fontSize: 60,
      snapshot: toSnapshot(textArtifactRender(artifact)),
      geometry: {
        contentHash: 'a'.repeat(64),
        byteLength: 1,
        key: artifact.key,
        basisKey: artifact.basisKey,
      },
      glyphColors: { '1': '#FF0000' },
    });
    project.formulas.push(formula);
    project.clips.push(createClip(formula.id, project.tracks[0]!.id, 0, 2));
    const boxes = boxesOf(formula, 'ce');
    const resolved = {
      formula,
      render: boxes,
      canonToRender: [0, 1, 4, 5],
      confidence: 1,
    };
    const result = python(project, new Map([[formula.id, resolved]]), 'ce');
    expect(codes(result.issues, 'error')).toEqual([]);
    expect(result.code).toContain('font_size=60');
    expect(result.code).toContain('title[1].set_color("#FF0000")');
    expect(result.code).toContain('_mfe_verify_text(title, r"title", "ce", 4)\n');
    expect(codes(result.issues, 'warning')).toEqual(['export-text-unshaped']);
  });

  it('names every such text in one issue', () => {
    const { project, formula, render } = boxed('ce');
    const second = { ...formula, id: 'f_second', name: 'credits' };
    project.formulas.push(second);
    project.clips.push(createClip(second.id, project.tracks[0]!.id, 3, 2));
    const result = python(
      project,
      new Map([
        [formula.id, resolveFormula(formula, render)],
        [second.id, resolveFormula(second, render)],
      ]),
      'ce',
    );
    const issues = result.issues.filter((item) => item.code === 'export-text-unshaped');
    expect(issues).toHaveLength(1);
    expect(issues[0]!.message).toMatch(
      /^Font texts "title", "credits": nothing has shaped them as they stand \(no companion drew them\)\. They are written all the same, their glyphs counted one per character/,
    );
  });

  it('is left out when its boxes are drawn over a snapshot nothing could carry over to them', () => {
    // Shaped as "office", its geometry lost from the browser, then edited to "coffee": the sync
    // draws the boxes of "coffee" and leaves the snapshot of "office" alone, saying it is unsure
    // (confidence 0). Its four glyphs say nothing of the six boxes.
    const project = createEmptyProject();
    const artifact = textGeometry('office', [
      { start: 0, end: 1 },
      { start: 1, end: 4 },
      { start: 4, end: 5 },
      { start: 5, end: 6 },
    ]);
    const formula = createTextFormula({
      name: 'title',
      source: 'coffee',
      snapshot: toSnapshot(textArtifactRender(artifact)),
      geometry: {
        contentHash: 'a'.repeat(64),
        byteLength: 1,
        key: artifact.key,
        basisKey: artifact.basisKey,
      },
      glyphColors: { '3': '#FF0000' },
    });
    project.formulas.push(formula);
    project.clips.push(createClip(formula.id, project.tracks[0]!.id, 0, 2));
    const boxes = boxesOf(formula, 'ce');
    const unsure = {
      formula,
      render: boxes,
      canonToRender: [null, null, null, null],
      confidence: 0,
    };
    const result = python(project, new Map([[formula.id, unsure]]), 'ce');
    expect(codes(result.issues, 'error')).toContain('export-missing-render');
    expect(result.code).not.toContain('= Text(');
    expect(result.code).not.toContain('set_color("#FF0000")');
  });

  it('is left out when the boxes on screen are those of an earlier source', () => {
    const { project, formula, render } = boxed('ce');
    const edited = { ...formula, source: 'AV offices' };
    project.formulas[0] = edited;
    const result = python(project, new Map([[edited.id, resolveFormula(edited, render)]]), 'ce');
    expect(codes(result.issues, 'error')).toContain('export-missing-render');
    expect(result.code).not.toContain('= Text(');
  });
});
