// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  createAttach,
  createBraceAttach,
  createBraceFormula,
  createTexFormula,
  createTipAttach,
  createAppear,
  createDisappear,
  createMorph,
  createPartTransform,
  createTween,
  defaultIntro,
  FORMAT_VERSION,
  parseProject,
  serializeProject,
} from '../index';
import { EXAMPLE_FILES, readExample } from '../../test/examples';
import { smallProject } from './fixtures';

describe('parseProject', () => {
  // The examples are files of the current format, as the app writes them: nothing to migrate,
  // and reading one and writing it again changes nothing. A format bump rewrites them.
  it.each(EXAMPLE_FILES)('loads %s with no issues, a file of the current format', (name) => {
    const text = readExample(name);
    const result = parseProject(text);
    if (!result.ok) throw new Error(`${result.error}\n${result.details.join('\n')}`);
    expect(result.issues).toEqual([]);
    expect(result.migratedFrom).toBeNull();
    expect(result.project.version).toBe(FORMAT_VERSION);
    expect(serializeProject(result.project, result.textGeometry)).toBe(text);
  });

  it('loads text-pango.mfe.json, which carries the geometry of its two texts, with no issues', () => {
    const result = parseProject(readExample('text-pango.mfe.json'));
    if (!result.ok) throw new Error(`${result.error}\n${result.details.join('\n')}`);
    expect(result.issues).toEqual([]);
    expect(result.migratedFrom).toBeNull();
    const texts = result.project.formulas.filter((formula) => formula.kind === 'text');
    expect(texts.map((text) => text.name)).toEqual(['title', 'note']);
    expect(Object.keys(result.textGeometry).sort()).toEqual(
      texts.map((text) => text.geometry!.contentHash).sort(),
    );
  });

  it('upgrades a format 1 file: formulas get no hidden glyphs', () => {
    const v1 = JSON.parse(serializeProject(smallProject())) as {
      version: number;
      formulas: Record<string, unknown>[];
    };
    v1.version = 1;
    for (const f of v1.formulas) delete f.hiddenGlyphs;
    const result = parseProject(JSON.stringify(v1));
    if (!result.ok) throw new Error(`${result.error}\n${result.details.join('\n')}`);
    expect(result.migratedFrom).toBe(1);
    expect(result.project.version).toBe(FORMAT_VERSION);
    expect(result.project.formulas.map((f) => f.hiddenGlyphs)).toEqual(v1.formulas.map(() => []));
    expect(result.project.formulas.map((f) => f.intro)).toEqual(v1.formulas.map(() => null));
  });

  it('upgrades a format 3 file: formulas follow the editor preference for their intro', () => {
    const v3 = JSON.parse(serializeProject(smallProject())) as {
      version: number;
      formulas: Record<string, unknown>[];
    };
    v3.version = 3;
    for (const f of v3.formulas) delete f.intro;
    const result = parseProject(JSON.stringify(v3));
    if (!result.ok) throw new Error(`${result.error}\n${result.details.join('\n')}`);
    expect(result.migratedFrom).toBe(3);
    expect(result.project.version).toBe(FORMAT_VERSION);
    expect(result.project.formulas.map((f) => f.intro)).toEqual(v3.formulas.map(() => null));
  });

  it('upgrades a format 4 file as it is: it only lacked the morph blocks', () => {
    const v4 = JSON.parse(serializeProject(smallProject())) as { version: number };
    v4.version = 4;
    const result = parseProject(JSON.stringify(v4));
    if (!result.ok) throw new Error(`${result.error}\n${result.details.join('\n')}`);
    expect(result.migratedFrom).toBe(4);
    expect(result.project).toEqual({ ...JSON.parse(JSON.stringify(v4)), version: FORMAT_VERSION });
  });

  it('upgrades a format 5 file as it is: its pairs only lacked `extras`', () => {
    const v5 = JSON.parse(serializeProject(smallProject())) as {
      version: number;
      relations: { pairs: Record<string, unknown>[] }[];
    };
    v5.version = 5;
    for (const r of v5.relations) for (const p of r.pairs) delete p.extras;
    const result = parseProject(JSON.stringify(v5));
    if (!result.ok) throw new Error(`${result.error}\n${result.details.join('\n')}`);
    expect(result.migratedFrom).toBe(5);
    expect(result.project).toEqual({ ...JSON.parse(JSON.stringify(v5)), version: FORMAT_VERSION });
    // A pair may store how its sources arrive; anything else is rejected.
    v5.version = 13;
    v5.relations[0]!.pairs[0]!.extras = 'copies';
    expect(parseProject(JSON.stringify(v5)).ok).toBe(true);
    v5.relations[0]!.pairs[0]!.extras = 'fuse';
    expect(parseProject(JSON.stringify(v5)).ok).toBe(false);
  });

  it('upgrades a format 6 file: it gets an empty list of match colours', () => {
    const v6 = JSON.parse(serializeProject(smallProject())) as Record<string, unknown>;
    v6.version = 6;
    delete v6.colorMatches;
    const result = parseProject(JSON.stringify(v6));
    if (!result.ok) throw new Error(`${result.error}\n${result.details.join('\n')}`);
    expect(result.migratedFrom).toBe(6);
    expect(result.project).toEqual({ ...v6, version: FORMAT_VERSION, colorMatches: [] });
    // A match colour list names its patterns and colours; a bad colour is rejected.
    const match = { id: 'cm1', name: 'Course', entries: [{ pattern: 'x', color: '#fc6255' }] };
    const v7 = { ...v6, version: 14, colorMatches: [match] };
    const parsed = parseProject(JSON.stringify(v7));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.project.colorMatches).toEqual([
      { ...match, entries: [{ pattern: 'x', color: '#FC6255' }] },
    ]);
    const bad = { ...v7, colorMatches: [{ ...match, entries: [{ pattern: 'x', color: 'RED' }] }] };
    expect(parseProject(JSON.stringify(bad)).ok).toBe(false);
  });

  it('upgrades a format 7 file as it is: its pairs only lacked `path`', () => {
    const v7 = JSON.parse(serializeProject(smallProject())) as {
      version: number;
      relations: { pairs: Record<string, unknown>[] }[];
    };
    v7.version = 7;
    const result = parseProject(JSON.stringify(v7));
    if (!result.ok) throw new Error(`${result.error}\n${result.details.join('\n')}`);
    expect(result.migratedFrom).toBe(7);
    expect(result.project).toEqual({ ...JSON.parse(JSON.stringify(v7)), version: FORMAT_VERSION });
    // A pair may store a custom path of at least two nodes, each an anchor with two optional
    // handles; anything else is rejected.
    v7.version = 13;
    const path = {
      nodes: [
        { at: [0, 0], in: null, out: [0.3, 0.2], smooth: false },
        { at: [1, 0], in: [0.7, 0.2], out: null, smooth: true },
      ],
    };
    v7.relations[0]!.pairs[0]!.path = path;
    const parsed = parseProject(JSON.stringify(v7));
    if (!parsed.ok) throw new Error(parsed.error);
    expect(parsed.project.relations[0]!.pairs[0]!.path).toEqual(path);
    v7.relations[0]!.pairs[0]!.path = { nodes: path.nodes.slice(0, 1) };
    expect(parseProject(JSON.stringify(v7)).ok).toBe(false);
    v7.relations[0]!.pairs[0]!.path = {
      nodes: [{ at: [0, 0], in: null, out: null }, path.nodes[1]],
    };
    expect(parseProject(JSON.stringify(v7)).ok).toBe(false);
  });

  it('upgrades a format 8 file: formulas become objects of kind math, with source and backend', () => {
    const v10 = serializeProject(smallProject());
    const v9 = v10.replace('"version": 10', '"version": 9');
    const v8 = JSON.parse(v9) as { version: number; formulas: Record<string, unknown>[] };
    v8.version = 8;
    // What the app wrote before: no `kind`, `latex` where `source` is, `source` in the snapshot.
    v8.formulas = v8.formulas.map((f) =>
      Object.fromEntries(
        Object.entries(f)
          .filter(([key]) => key !== 'kind')
          .map(([key, value]) => {
            if (key === 'source') return ['latex', value];
            if (key === 'snapshot' && value) {
              const { backend, ...snapshot } = value as { backend: string };
              return ['snapshot', { source: backend, ...snapshot }];
            }
            return [key, value];
          }),
      ),
    );
    expect(v8.formulas.some((f) => 'kind' in f || 'source' in f)).toBe(false);
    const result = parseProject(JSON.stringify(v8));
    if (!result.ok) throw new Error(`${result.error}\n${result.details.join('\n')}`);
    expect(result.migratedFrom).toBe(8);
    // The same file, field for field and in the same order: `kind` after `id`, `source` and
    // `backend` where `latex` and `source` were.
    expect(serializeProject(result.project)).toBe(v10);
  });

  it('upgrades a format 9 file: every clip gets attach: null, after its actions', () => {
    const v10 = serializeProject(smallProject());
    const v9 = JSON.parse(v10) as { version: number; clips: Record<string, unknown>[] };
    v9.version = 9;
    v9.clips = v9.clips.map(({ attach, ...clip }) => {
      expect(attach).toBeNull();
      return clip;
    });
    const result = parseProject(JSON.stringify(v9));
    if (!result.ok) throw new Error(`${result.error}\n${result.details.join('\n')}`);
    expect(result.migratedFrom).toBe(9);
    expect(serializeProject(result.project)).toBe(v10);
  });

  it.each([
    [10, 'the brace kind and rule'],
    [11, 'the tip rule'],
    [12, 'the shape kind and rule'],
    [13, 'the emphasis kind and the pulse easing'],
  ])('upgrades a format %i file as it is: it only lacked %s', (version) => {
    const current = serializeProject(smallProject());
    const old = current.replace(`"version": ${FORMAT_VERSION}`, `"version": ${version}`);
    const result = parseProject(old);
    if (!result.ok) throw new Error(`${result.error}\n${result.details.join('\n')}`);
    expect(result.migratedFrom).toBe(version);
    expect(serializeProject(result.project)).toBe(current);
  });

  it("round-trips a label at the tip of a brace, with its gap or Manim's, and rejects the rest", () => {
    const project = smallProject();
    const [ca, cb] = project.clips;
    cb!.attach = createTipAttach(ca!.id);
    const text = serializeProject(project);
    const parsed = parseProject(text);
    if (!parsed.ok) throw new Error(`${parsed.error}\n${parsed.details.join('\n')}`);
    expect(parsed.project.clips[1]!.attach).toEqual({
      clipId: ca!.id,
      glyphs: 'all',
      rule: 'tip',
      buff: null,
    });
    expect(serializeProject(parsed.project)).toBe(text);
    cb!.attach = createTipAttach(ca!.id, 0.4);
    const own = parseProject(serializeProject(project));
    if (!own.ok) throw new Error(own.error);
    expect(own.project.clips[1]!.attach).toMatchObject({ rule: 'tip', buff: 0.4 });
    const raw = JSON.parse(text) as { clips: { attach: Record<string, unknown> }[] };
    const broken = (change: (r: typeof raw) => void) => {
      const copy = structuredClone(raw);
      change(copy);
      return parseProject(JSON.stringify(copy)).ok;
    };
    expect(broken((r) => (r.clips[1]!.attach.glyphs = [0]))).toBe(false); // the whole brace
    expect(broken((r) => delete r.clips[1]!.attach.buff)).toBe(false);
    expect(broken((r) => (r.clips[1]!.attach.buff = 'auto'))).toBe(false);
  });

  it('round-trips a brace with its attachment, and rejects what it cannot read', () => {
    const project = smallProject();
    const [ca, cb] = project.clips;
    const brace = createBraceFormula({ name: 'b1', sharpness: 1.5, width: 2.25 });
    project.formulas.push(brace);
    cb!.formulaId = brace.id;
    cb!.attach = createBraceAttach(ca!.id, [0, 2], { direction: 90, buff: 0.1 });
    const text = serializeProject(project);
    const parsed = parseProject(text);
    if (!parsed.ok) throw new Error(`${parsed.error}\n${parsed.details.join('\n')}`);
    expect(parsed.project.formulas[2]).toMatchObject({
      kind: 'brace',
      source: '',
      sharpness: 1.5,
      width: 2.25,
    });
    expect(parsed.project.clips[1]!.attach).toEqual({
      clipId: ca!.id,
      glyphs: [0, 2],
      rule: 'brace',
      direction: 90,
      buff: 0.1,
    });
    expect(serializeProject(parsed.project)).toBe(text);
    // The brace fields are written after the source, where the kind's own fields go.
    const raw = JSON.parse(text) as {
      formulas: Record<string, unknown>[];
      clips: { attach: Record<string, unknown> }[];
    };
    expect(Object.keys(raw.formulas[2]!).slice(0, 6)).toEqual([
      'id',
      'kind',
      'name',
      'source',
      'sharpness',
      'width',
    ]);
    const broken = (change: (r: typeof raw) => void) => {
      const copy = structuredClone(raw);
      change(copy);
      return parseProject(JSON.stringify(copy)).ok;
    };
    expect(broken((r) => (r.formulas[2]!.sharpness = 0))).toBe(false);
    expect(broken((r) => (r.formulas[2]!.width = -1))).toBe(false);
    expect(broken((r) => delete r.clips[1]!.attach.direction)).toBe(false);
    expect(broken((r) => (r.clips[1]!.attach.side = 'down'))).toBe(true); // stripped as unknown
    expect(broken((r) => (r.clips[1]!.attach.rule = 'next_to'))).toBe(false); // needs a side
  });

  it('round-trips an attachment, and rejects one it cannot read', () => {
    const project = smallProject();
    const [ca, cb] = project.clips;
    cb!.attach = createAttach(ca!.id, [0, 2], { side: 'up', buff: 0.4 });
    const text = serializeProject(project);
    const parsed = parseProject(text);
    if (!parsed.ok) throw new Error(`${parsed.error}\n${parsed.details.join('\n')}`);
    expect(parsed.project.clips[1]!.attach).toEqual({
      clipId: ca!.id,
      glyphs: [0, 2],
      rule: 'next_to',
      side: 'up',
      buff: 0.4,
    });
    expect(serializeProject(parsed.project)).toBe(text);
    const raw = JSON.parse(text) as { clips: { attach: Record<string, unknown> }[] };
    raw.clips[1]!.attach.side = 'diagonal';
    expect(parseProject(JSON.stringify(raw)).ok).toBe(false);
    raw.clips[1]!.attach = { ...raw.clips[1]!.attach, side: 'left', glyphs: 'all' };
    expect(parseProject(JSON.stringify(raw)).ok).toBe(true);
  });

  it('round-trips a LaTeX text with its layout, and rejects a layout it cannot read', () => {
    const project = smallProject();
    project.formulas.push(
      createTexFormula({
        name: 't1',
        source: 'Hello \\emph{world}',
        layout: { width: 4, align: 'left', lineSpacing: 1.2 },
      }),
    );
    const text = serializeProject(project);
    const result = parseProject(text);
    if (!result.ok) throw new Error(`${result.error}\n${result.details.join('\n')}`);
    expect(result.project.formulas.at(-1)).toMatchObject({
      kind: 'tex',
      source: 'Hello \\emph{world}',
      layout: { width: 4, align: 'left', lineSpacing: 1.2 },
    });
    expect(serializeProject(result.project)).toBe(text);
    // The layout sits after the source, like a formula's packages.
    expect(Object.keys(JSON.parse(text).formulas.at(-1))).toEqual([
      'id',
      'kind',
      'name',
      'source',
      'layout',
      'tag',
      'fontSize',
      'color',
      'glyphColors',
      'hiddenGlyphs',
      'intro',
      'snapshot',
    ]);
    for (const layout of [
      { width: 0, align: 'center', lineSpacing: 1 },
      { width: null, align: 'justify', lineSpacing: 1 },
      { width: null, align: 'left', lineSpacing: 0 },
    ]) {
      const raw = JSON.parse(text) as { formulas: { layout?: unknown }[] };
      raw.formulas.at(-1)!.layout = layout;
      const bad = parseProject(JSON.stringify(raw));
      expect(bad.ok).toBe(false);
      if (!bad.ok) expect(bad.details.join('\n')).toMatch(/formulas\.\d+\.layout/);
    }
  });

  it('rejects a formula of a kind it does not know', () => {
    const raw = JSON.parse(serializeProject(smallProject())) as { formulas: { kind: string }[] };
    raw.formulas[0]!.kind = 'unknown-kind';
    const result = parseProject(JSON.stringify(raw));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.details.join('\n')).toMatch(/formulas\.0\.kind/);
  });

  it('keeps a morph block with its pairs, and rejects one without a style or with a bad pair', () => {
    const project = smallProject();
    project.clips[0]!.actions.push(
      createMorph(1.5, {
        duration: 0.5,
        style: 'copy', // glyph 0 is copied here, then consumed by the relation at 2 s: fine
        pathArc: -45,
        pairs: [
          { from: [0], to: [2], style: null },
          { from: [1, 3], to: [4], style: 'fade' },
        ],
      }),
    );
    const result = parseProject(serializeProject(project));
    if (!result.ok) throw new Error(`${result.error}\n${result.details.join('\n')}`);
    expect(result.project).toEqual(project);
    expect(result.issues).toEqual([]);
    const raw = JSON.parse(serializeProject(project)) as {
      clips: { actions: Record<string, unknown>[] }[];
    };
    const morph = raw.clips[0]!.actions[0]!;
    delete morph.style;
    const noStyle = parseProject(JSON.stringify(raw));
    expect(noStyle.ok).toBe(false);
    if (!noStyle.ok) expect(noStyle.details.join(' ')).toContain('clips.0.actions.0');
    morph.style = 'copy';
    morph.pairs = [{ from: [0], to: [-1], style: null }];
    expect(parseProject(JSON.stringify(raw)).ok).toBe(false);
  });

  it('keeps the intro a formula chose, and rejects one of an unknown kind', () => {
    const project = smallProject();
    project.formulas[0]!.intro = defaultIntro('fade_in');
    const result = parseProject(serializeProject(project));
    if (!result.ok) throw new Error(`${result.error}\n${result.details.join('\n')}`);
    expect(result.project).toEqual(project);
    const bad = JSON.parse(serializeProject(project)) as {
      formulas: { intro: { kind: string } }[];
    };
    bad.formulas[0]!.intro.kind = 'bogus';
    expect(parseProject(JSON.stringify(bad)).ok).toBe(false);
  });

  it('reads a format 2 file as it is (format 3 only adds action kinds)', () => {
    const project = smallProject();
    project.clips[0]!.actions.push(createTween(1.5, 0.5, { scale: 2 }));
    const v2 = JSON.parse(serializeProject(project)) as { version: number };
    v2.version = 2;
    const result = parseProject(JSON.stringify(v2));
    if (!result.ok) throw new Error(`${result.error}\n${result.details.join('\n')}`);
    expect(result.migratedFrom).toBe(2);
    expect(result.project).toEqual(project);
  });

  it('round-trips every action kind', () => {
    const project = smallProject();
    project.clips[0]!.actions.push(
      createAppear(1, 'write', [0, 2]),
      createDisappear(1.5, 'fade_out', 'all', { shift: [0, -1], scale: 0.5 }),
      createPartTransform(2, [1], { shift: [1, 0], scale: 1.5, rotation: 30, color: '#FF0000' }),
    );
    const result = parseProject(serializeProject(project));
    if (!result.ok) throw new Error(`${result.error}\n${result.details.join('\n')}`);
    expect(result.project).toEqual(project);
  });

  it('rejects malformed actions', () => {
    const bad = (patch: Record<string, unknown>) => {
      const project = smallProject();
      project.clips[0]!.actions.push({ ...createAppear(1, 'write', 'all'), ...patch } as never);
      return parseProject(serializeProject(project)).ok;
    };
    expect(bad({})).toBe(true);
    expect(bad({ anim: 'none' })).toBe(false); // not an animation of its own
    expect(bad({ glyphs: 'some' })).toBe(false);
    expect(bad({ glyphs: [-1] })).toBe(false);
    expect(bad({ kind: 'transform' })).toBe(false); // missing the transform fields
  });

  it('round-trips through serializeProject', () => {
    const project = smallProject();
    const result = parseProject(serializeProject(project));
    expect(result.ok && result.project).toEqual(project);
  });

  it('rejects invalid JSON, foreign files and newer versions', () => {
    expect(parseProject('{').ok).toBe(false);
    expect(parseProject('{"format":"other","version":1}').ok).toBe(false);
    const newer = parseProject('{"format":"manim-formula-editor","version":99}');
    expect(newer.ok).toBe(false);
    expect(!newer.ok && newer.error).toMatch(/newer version/);
  });

  // A list of a folder's projects names a project that does not open, with why, and leaves out
  // what is another kind of file.
  it('says of a file that does not open whether it is a project of this app', () => {
    const says = (text: string) => {
      const result = parseProject(text);
      return result.ok ? null : result.isProject;
    };
    expect(says('{')).toBe(false);
    expect(says('[]')).toBe(false);
    expect(says('{"format":"other","version":1}')).toBe(false);
    // Without a version, of a newer app, with a field out of place.
    expect(says('{"format":"manim-formula-editor"}')).toBe(true);
    expect(says('{"format":"manim-formula-editor","version":99}')).toBe(true);
    const project = smallProject() as unknown as { meta: { background: string } };
    project.meta.background = 'black';
    expect(says(JSON.stringify(project))).toBe(true);
    expect(says(serializeProject(smallProject()))).toBeNull();
  });

  it('reports schema errors with paths', () => {
    const project = smallProject() as unknown as { meta: { background: string } };
    project.meta.background = 'black';
    const result = parseProject(JSON.stringify(project));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.details.join()).toMatch(/meta\.background/);
  });

  it('normalises colours to upper case', () => {
    const project = smallProject();
    project.meta.background = '#ff00aa';
    const result = parseProject(JSON.stringify(project));
    expect(result.ok && result.project.meta.background).toBe('#FF00AA');
  });

  it('keeps semantic issues instead of rejecting the file', () => {
    const project = smallProject();
    project.clips[0]!.end = 0;
    const result = parseProject(serializeProject(project));
    expect(result.ok).toBe(true);
    expect(result.ok && result.issues.map((i) => i.code)).toContain('clip-length');
  });
});
