// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  CE_GL_SIZE_RATIO,
  expectedRenderKey,
  refreshLocalRenders,
  toSnapshot,
  type ResolvedFormulas,
} from '../../../engine';
import { createMockEngine } from '../../../test/mockEngine';
import {
  createBraceAttach,
  type BraceAttach,
  createBraceFormula,
  createTexFormula,
  packagesOf,
  type MathFormula,
  createAppear,
  createAttach,
  createDisappear,
  createEmphasis,
  createPartTransform,
  createClip,
  createTipAttach,
  createEmptyProject,
  createFormula,
  createMorph,
  createRelation,
  createShapeAttach,
  createShapeFormula,
  createTrack,
  createTween,
  defaultIntro,
  defaultOutro,
  hasErrors,
  parseProject,
  sceneDuration,
  validateProject,
  type Clip,
  type Formula,
  type Relation,
  type IntroKind,
  type Issue,
  type OutroKind,
  type Project,
  type ShapeFormula,
  type Target,
} from '../../../model';
import { syntheticCases } from '../../../../../tests/export/projects';
import { generatePython } from '..';
import type { CodegenOptions } from '../../types';
import { TWEEN_HELPER } from '../helpers';
import { frameRounding, framesOf } from '../python';

const NO_RENDERS: ResolvedFormulas = new Map();

function options(target: Target, extra: Partial<CodegenOptions> = {}): CodegenOptions {
  return { target, sceneName: 'Demo', indexing: 'auto', comments: false, ...extra };
}

function example(name: string): Project {
  const parsed = parseProject(
    readFileSync(new URL(`../../../../../examples/${name}`, import.meta.url), 'utf8'),
  );
  if (!parsed.ok) throw new Error(parsed.error);
  return parsed.project;
}

/** A latex snapshot of `count` glyphs laid out in a row (enough for indexing and the helper). */
function snapshot(count: number, backend: 'latex' | 'mathjax' = 'latex'): Formula['snapshot'] {
  return {
    backend,
    key: `${backend}-test`,
    glyphs: Array.from({ length: count }, (_, i) => ({
      label: String(i),
      center: [i * 0.3 - (count - 1) * 0.15, 0] as [number, number],
      size: [0.2, 0.3] as [number, number],
    })),
  };
}

function project(target: Target = 'ce'): Project {
  const p = createEmptyProject('Demo');
  p.meta.target = target;
  p.meta.fps = 30;
  return p;
}

function formula(
  p: Project,
  name: string,
  count: number,
  fields: Partial<MathFormula> = {},
): Formula {
  const f = createFormula({ name, source: `x_${count}`, snapshot: snapshot(count), ...fields });
  // A snapshot of `snapshot()` is one a render would give now, for the project as it stands.
  if (f.snapshot?.key.endsWith('-test')) {
    f.snapshot = { ...f.snapshot, key: expectedRenderKey(f, p.meta, f.snapshot.backend) };
  }
  p.formulas.push(f);
  return f;
}

function clip(
  p: Project,
  f: Formula,
  track: number,
  start: number,
  end: number,
  fields: Partial<Clip> = {},
): Clip {
  const c = createClip(f.id, p.tracks[track]!.id, start, end, {
    intro: { ...defaultIntro('none'), duration: 0 },
    outro: { ...defaultOutro('none'), duration: 0 },
    ...fields,
  });
  p.clips.push(c);
  return c;
}

/** Frames of every play and wait in the generated code. */
function totalFrames(code: string, target: Target, fps: number): number {
  let total = 0;
  for (const m of code.matchAll(/self\.play\([\s\S]*?run_time=([0-9.e]+)/g)) {
    total += framesOf(m[1]!.trim(), fps, frameRounding(target, 'play'));
  }
  for (const m of code.matchAll(/self\.wait\(([0-9.]+)\)/g)) {
    total += framesOf(m[1]!, fps, frameRounding(target, 'wait'));
  }
  return total;
}

describe('generated file', () => {
  it('reads like a hand-written CE scene for hello.mfe.json', () => {
    const { code, issues, usedPositionalHelper } = generatePython(
      example('hello.mfe.json'),
      NO_RENDERS,
      {
        ...options('ce'),
        sceneName: 'HelloOneToOne',
      },
    );
    expect(issues).toEqual([]);
    expect(usedPositionalHelper).toBe(false);
    expect(code).toContain('#     manim -r 1920,1080 --fps 60 HelloOneToOne.py HelloOneToOne');
    expect(code).toContain('from manim import *');
    expect(code).toContain('class HelloOneToOne(Scene):');
    expect(code).toContain('self.camera.background_color = "#000000"');
    expect(code).toContain('a1 = MathTex(r"mx+y=0")');
    expect(code).toContain('a1[0][2].set_color("#FFFF00")');
    expect(code).toContain('a1.set_z_index(1)');
    expect(code).toContain('self.play(Write(a1), run_time=1)');
    expect(code).toContain('self.wait(1)');
    expect(code).toContain('ReplacementTransform(a1[0][:2], f2[0][:2])');
    expect(code).toContain('ReplacementTransform(a1[0][4], f2[0][2])');
    expect(code).toContain('FadeOut(a1[0][5])');
    expect(code).toContain('self.play(f2.animate.move_to([0, 1.5, 0]), run_time=0.6)');
    expect(code).toContain('self.play(FadeOut(f2), run_time=1)');
    // No helpers when nothing needs them.
    expect(code).not.toMatch(/_Part|_Tween|_glyphs/);
    expect(totalFrames(code, 'ce', 60)).toBe(300);
  });

  it('keeps the project and formula names inside their comment lines', () => {
    const sentinel = 'MFE_AUDIT_SENTINEL = 1';
    for (const target of ['ce', 'gl'] as const) {
      for (const comments of [false, true]) {
        const p = project(target);
        p.meta.name = `Audit\n${sentinel}\n#`;
        p.meta.preamble = '\\usepackage{amsmath}\0';
        const f = formula(p, `Hi\r\n${sentinel}\r#`, 2, { source: 'a\0+b' });
        clip(p, f, 0, 0, 1);
        const { code } = generatePython(p, NO_RENDERS, options(target, { comments }));
        const lines = code.split('\n').map((line) => line.trim()); // the setup is indented
        expect(lines).not.toContain(sentinel);
        expect(code.includes('\r') || code.includes('\0')).toBe(false);
        const lib = target === 'ce' ? 'ManimCE' : 'ManimGL';
        expect(lines[0]).toContain(
          `# Audit ${sentinel} # — exported by Manim Formula Editor for ${lib}`,
        );
        if (comments) expect(lines).toContain(`# Hi ${sentinel} #: a+b`);
        expect(code).toMatch(/Tex\(r"a\+b"/);
        expect(code).toContain('r"\\usepackage{amsmath}"');
      }
    }
  });

  // Python reads the first two lines of a file for the declaration of its encoding (PEP 263): the
  // first has the project's name.
  it('declares no encoding with the name of the project', () => {
    const declaresEncoding = /^[ \t\f]*#.*?coding[:=][ \t]*([-\w.]+)/;
    for (const target of ['ce', 'gl'] as const) {
      for (const comments of [false, true]) {
        const p = project(target);
        p.meta.name = 'Huffman coding: an example';
        clip(p, formula(p, 'Decoding=ascii', 2), 0, 0, 1);
        const { code } = generatePython(p, NO_RENDERS, options(target, { comments }));
        const [first = '', second = ''] = code.split('\n');
        expect(first).toContain('# Huffman coding : an example — exported by Manim Formula Editor');
        expect(first).not.toMatch(declaresEncoding);
        expect(second).not.toMatch(declaresEncoding);
        // A formula's name is far from those two lines, and is written as it is.
        if (comments) expect(code).toContain('# Decoding=ascii: x_2');
      }
    }
  });

  it('writes the ManimGL dialect', () => {
    const p = example('hello.mfe.json');
    p.meta.target = 'gl';
    // As if the companion had rendered the formulas for GL: exact snapshots for this target.
    for (const f of p.formulas) {
      f.snapshot = { ...f.snapshot!, key: expectedRenderKey(f, p.meta, 'latex') };
    }
    const { code } = generatePython(p, NO_RENDERS, { ...options('gl'), sceneName: 'Hello' });
    expect(code).toContain('#     manimgl Hello.py Hello -w -r 1920x1080 --fps 60');
    expect(code).toContain('from manimlib import *');
    expect(code).toContain('default_camera_config = dict(background_color="#000000")');
    expect(code).toContain('a1 = Tex(r"mx+y=0")');
    expect(code).toContain('a1[2].set_color("#FFFF00")');
    expect(code).toContain('Write(a1, stroke_color="#FFFFFF")');
    expect(code).toContain('ReplacementTransform(a1[:2], f2[:2])');
    expect(code).toContain('FadeOut(VGroup(a1[5]))');
    expect(totalFrames(code, 'gl', 60)).toBe(300);
  });

  it('sets the frame width for a frame that is not 16:9 (CE) and the background', () => {
    const p = project();
    p.meta.width = 400;
    p.meta.height = 300;
    p.meta.background = '#1E1E2E';
    const f = formula(p, 'f', 2);
    clip(p, f, 0, 0, 1, { intro: defaultIntro('write') });
    const ce = generatePython(p, NO_RENDERS, options('ce')).code;
    expect(ce).toContain(
      'config.frame_width = config.frame_height * config.pixel_width / config.pixel_height',
    );
    expect(ce).toContain('self.camera.background_color = "#1E1E2E"');
    p.meta.target = 'gl';
    expect(generatePython(p, NO_RENDERS, options('gl')).code).not.toContain('config.frame_width');
  });

  it('declares packages and the preamble as the companion compiles them', () => {
    const p = project();
    p.meta.preamble = '\\newcommand{\\R}{\\mathbb{R}}';
    const f = formula(p, 'f', 2, { packages: ['cancel', 'bm'], source: '\\cancel{x}' });
    clip(p, f, 0, 0, 1);
    const ce = generatePython(p, NO_RENDERS, options('ce')).code;
    expect(ce).toContain('template = TexTemplate()');
    expect(ce).toContain('template.add_to_preamble(r"\\usepackage{cancel}")');
    expect(ce).toContain('template.add_to_preamble(r"\\usepackage{bm}")');
    expect(ce).toContain('template.add_to_preamble(r"\\newcommand{\\R}{\\mathbb{R}}")');
    expect(ce).toContain('f = MathTex(r"\\cancel{x}", tex_template=template)');
    p.meta.target = 'gl';
    const gl = generatePython(p, NO_RENDERS, options('gl')).code;
    expect(gl).toContain(
      'preamble = "\\n".join([r"\\usepackage{cancel}", r"\\usepackage{bm}", r"\\newcommand{\\R}{\\mathbb{R}}"])',
    );
    expect(gl).toContain('f = Tex(r"\\cancel{x}", additional_preamble=preamble)');
  });

  it('writes a formula and a preamble of several lines as they were typed', () => {
    const p = project();
    p.meta.preamble = '\\newcommand{\\R}{\\mathbb{R}}\n\\newcommand{\\N}{\\mathbb{N}}';
    const f = formula(p, 'f', 4, { source: 'a &= b \\\\\n  &= c' });
    clip(p, f, 0, 0, 1, { intro: defaultIntro('write') });
    const ce = generatePython(p, NO_RENDERS, options('ce')).code;
    // The lines after the first belong to the string: they are not indented.
    expect(ce).toContain(
      '\n        f = MathTex(r"""a &= b \\\\\n  &= c""", tex_template=template)\n        f.set_z_index',
    );
    expect(ce).toContain(
      '\n        template.add_to_preamble(r"""\\newcommand{\\R}{\\mathbb{R}}\n\\newcommand{\\N}{\\mathbb{N}}""")\n',
    );
    p.meta.target = 'gl';
    const gl = generatePython(p, NO_RENDERS, options('gl')).code;
    expect(gl).toContain(
      '\n        f = Tex(r"""a &= b \\\\\n  &= c""", additional_preamble=preamble)\n',
    );
    expect(gl).toContain(
      '\n        preamble = r"""\\newcommand{\\R}{\\mathbb{R}}\n\\newcommand{\\N}{\\mathbb{N}}"""\n',
    );
  });

  it('places, colours and layers formulas like placementMatrix and glyphColor', () => {
    const p = project();
    const f = formula(p, 'f', 4, {
      color: '#58C4DD',
      glyphColors: { '1': '#FFFF00' },
      fontSize: 60,
    });
    clip(p, f, 0, 0, 1, {
      initial: {
        position: [2, -1],
        scale: 1.5,
        rotation: 30,
        flipX: true,
        flipY: false,
        opacity: 0.5,
        color: null,
        glyphColors: { '3': '#FC6255', '2': '#FC6255' },
      },
    });
    const { code } = generatePython(p, NO_RENDERS, options('ce'));
    expect(code).toContain('f = MathTex(r"x_4", font_size=60, color="#58C4DD")');
    expect(code).toContain('f[0][1].set_color("#FFFF00")');
    expect(code).toContain('f[0][2:].set_color("#FC6255")');
    expect(code).toContain('f.set_opacity(0.5)');
    expect(code).toContain('f.scale(1.5).stretch(-1, 0).move_to([2, -1, 0]).rotate(30 * DEGREES)');
    // The first track is in front.
    expect(code).toContain('f.set_z_index(1)');
  });

  it('converts font sizes and uses the helper for the other library', () => {
    const p = project('ce');
    const f = formula(p, 'f', 3);
    clip(p, f, 0, 0, 1, { intro: defaultIntro('fade_in') });
    const { code, issues, usedPositionalHelper } = generatePython(p, NO_RENDERS, options('gl'));
    expect(code).toContain(`font_size=${(48 * CE_GL_SIZE_RATIO).toFixed(4)}`);
    expect(usedPositionalHelper).toBe(true);
    expect(code).toContain('def _glyphs(tex, layout):');
    expect(code).toContain('f_g = _glyphs(f, [');
    expect(issues.map((i) => i.code)).toEqual(['export-other-target', 'export-positional']);
  });
});

describe('indexing', () => {
  it('exports a formula without glyphs through the helper, which copes with an empty layout', () => {
    const p = project();
    const spacer = formula(p, 'spacer', 0, { source: '\\quad', snapshot: snapshot(0, 'mathjax') });
    clip(p, spacer, 0, 0, 1);
    const { code } = generatePython(p, NO_RENDERS, options('ce'));
    expect(code).toMatch(/spacer_g = _glyphs\(spacer, \[\s*\]\)/);
    // Nothing to match: every entry stays an empty VMobject, without indexing an empty array.
    expect(code).toContain('if not real or not layout:');
  });

  it('trusts literal indices only for a snapshot the LaTeX backend made for this export', () => {
    // The project was made for GL with the companion, then switched to CE while offline: the
    // sync keeps the GL snapshot (higher fidelity than MathJax), whose glyph numbers are GL's.
    const p = project('ce');
    const kept = formula(p, 'kept', 6);
    kept.snapshot = {
      ...kept.snapshot!,
      key: expectedRenderKey(kept, { ...p.meta, target: 'gl' }, 'latex'),
    };
    const fresh = formula(p, 'fresh', 3);
    clip(p, kept, 0, 0, 1, {
      initial: { ...createClip('', '', 0, 1).initial, glyphColors: { '5': '#FFFF00' } },
    });
    clip(p, fresh, 1, 0, 1);
    const { code, issues, usedPositionalHelper } = generatePython(p, NO_RENDERS, options('ce'));
    expect(usedPositionalHelper).toBe(true);
    expect(code).toContain('kept_g = _glyphs(kept, [');
    expect(code).toContain('kept_g[5].set_color("#FFFF00")');
    expect(code).not.toContain('kept[0][5]');
    expect(code).not.toContain('fresh_g = _glyphs');
    expect(issues.map((i) => i.code)).toEqual(['export-positional']);
    expect(issues[0]!.message).toContain('earlier render');
    // A snapshot made by MathJax never counts as exact, whatever its key says.
    kept.snapshot = {
      ...kept.snapshot,
      backend: 'mathjax',
      key: expectedRenderKey(kept, p.meta, 'latex'),
    };
    expect(generatePython(p, NO_RENDERS, options('ce')).code).toContain('kept_g = _glyphs(kept, [');
  });

  it('matches MathJax glyphs by position, or every formula when asked to', () => {
    const p = project();
    const exact = formula(p, 'exact', 3);
    const free = formula(p, 'free', 3, { snapshot: snapshot(3, 'mathjax') });
    clip(p, exact, 0, 0, 2, { outro: { ...defaultOutro('fade_out'), duration: 1 } });
    clip(p, free, 1, 0, 2, {
      initial: { ...createClip('', '', 0, 1).initial, glyphColors: { '1': '#FFFF00' } },
    });
    const auto = generatePython(p, NO_RENDERS, options('ce'));
    expect(auto.usedPositionalHelper).toBe(true);
    expect(auto.code).not.toContain('exact_g = _glyphs');
    expect(auto.code).toContain('free_g = _glyphs(free, [');
    expect(auto.code).toContain('(-1, 0, 0.6667, 1), (0, 0, 0.6667, 1), (1, 0, 0.6667, 1)');
    expect(auto.code).toContain('free_g[1].set_color("#FFFF00")');
    expect(auto.issues.filter((i) => i.code === 'export-positional')).toHaveLength(1);
    const forced = generatePython(p, NO_RENDERS, options('ce', { indexing: 'positional' }));
    expect(forced.code).toContain('exact_g = _glyphs(exact, [');
    expect(forced.code).toContain('FadeOut(exact)');
    expect(forced.issues.filter((i) => i.code === 'export-positional')).toHaveLength(0);
  });

  it('says that LaTeX breaks the lines of a wrapped text itself when its snapshot is MathJax', () => {
    const p = project();
    const text = createTexFormula({
      name: 'title',
      source: 'one two three',
      layout: { width: 2, align: 'center', lineSpacing: 1 },
      snapshot: snapshot(3, 'mathjax'),
    });
    p.formulas.push(text);
    clip(p, text, 0, 0, 1);
    const { issues } = generatePython(p, NO_RENDERS, options('ce'));
    const positional = issues.filter((i) => i.code === 'export-positional');
    expect(positional).toHaveLength(1);
    expect(positional[0]!.message).toContain('LaTeX breaks the lines of a text with a width');
    // Without a width, or with an exact snapshot, the sentence has no place.
    text.layout = { ...text.layout, width: null };
    const plain = generatePython(p, NO_RENDERS, options('ce'));
    expect(plain.issues[0]!.message).not.toContain('breaks the lines');
  });

  it('addresses a CE formula split by {{ }} through a flat list', () => {
    const p = project();
    const f = formula(p, 'f', 3, { source: '{{a}}+{{b}}' });
    clip(p, f, 0, 0, 1, {
      initial: { ...createClip('', '', 0, 1).initial, glyphColors: { '2': '#FFFF00' } },
    });
    const { code } = generatePython(p, NO_RENDERS, options('ce'));
    expect(code).toContain('f_g = f.family_members_with_points()');
    expect(code).toContain('f_g[2].set_color("#FFFF00")');
  });

  it('plays a staggered animation of a whole positional formula in the editor order', () => {
    // MathJax and Manim can order the glyphs of a formula differently (a fraction: MathJax puts
    // the bar last). Write, Create and their reverses run glyph after glyph, so on the whole
    // formula they would follow Manim's order instead of the one the preview plays.
    for (const target of ['ce', 'gl'] as const) {
      const p = project(target);
      const free = formula(p, 'free', 3, { snapshot: snapshot(3, 'mathjax') });
      const exact = formula(p, 'exact', 3);
      clip(p, free, 0, 0, 3, {
        intro: defaultIntro('write'),
        outro: { ...defaultOutro('uncreate'), duration: 1 },
      });
      clip(p, exact, 1, 0, 3, {
        intro: { ...defaultIntro('fade_in'), lagRatio: 0.2 },
        outro: defaultOutro('fade_out'),
      });
      const { code } = generatePython(p, NO_RENDERS, options(target, { indexing: 'auto' }));
      expect(code).toMatch(/Write\(VGroup\(\*free_g\[:\]\)/);
      expect(code).toMatch(/Uncreate\(VGroup\(\*free_g\[:\]\)/);
      // Manim's own order is the editor's for an exact formula; a FadeIn without lag has none.
      expect(code).toContain('FadeIn(exact, lag_ratio=0.2)');
      expect(code).toContain('FadeOut(exact)');
      const forced = generatePython(p, NO_RENDERS, options(target, { indexing: 'positional' }));
      expect(forced.code).toMatch(/FadeIn\(VGroup\(\*exact_g\[:\]\), lag_ratio=0\.2/);
      expect(forced.code).toContain('FadeOut(exact)');
    }
  });
});

/** One clip with the given intro and outro; returns the generated code. */
function introOutro(
  target: Target,
  intro: IntroKind,
  outro: OutroKind,
  tweak: (c: Clip) => void = () => {},
): string {
  const p = project(target);
  const f = formula(p, 'f', 3, { color: '#83C167' });
  const c = clip(p, f, 0, 0, 3, { intro: defaultIntro(intro), outro: defaultOutro(outro) });
  tweak(c);
  return generatePython(p, NO_RENDERS, options(target)).code;
}

describe('clip animations', () => {
  it('maps every intro kind', () => {
    expect(introOutro('ce', 'write', 'none')).toContain('self.play(Write(f), run_time=1)');
    expect(introOutro('gl', 'write', 'none')).toContain('Write(f, stroke_color="#83C167")');
    expect(introOutro('ce', 'create', 'none')).toContain('Create(f)');
    expect(introOutro('gl', 'create', 'none')).toContain('ShowCreation(f)');
    expect(introOutro('ce', 'draw_border_then_fill', 'none')).toContain(
      'DrawBorderThenFill(f), run_time=2',
    );
    expect(introOutro('ce', 'grow_from_center', 'none')).toContain('GrowFromCenter(f)');
    expect(
      introOutro('ce', 'fade_in', 'none', (c) => {
        c.intro.shift = [0.5, -1];
        c.intro.scale = 1.5;
        c.intro.easing = 'rush_into';
        c.intro.lagRatio = 0.2;
      }),
    ).toContain(
      'FadeIn(f, shift=np.array([0.5, -1, 0]), scale=1.5, rate_func=rush_into, lag_ratio=0.2)',
    );
    const none = introOutro('ce', 'none', 'none');
    expect(none).toContain('self.add(f)');
    expect(none).not.toContain('self.remove');
  });

  it('maps every outro kind, with the unwrite variants of each library', () => {
    expect(introOutro('ce', 'none', 'unwrite')).toContain('Unwrite(f)');
    expect(
      introOutro('ce', 'none', 'unwrite', (c) => {
        c.outro.easing = 'smooth';
        c.outro.lagRatio = 0.3;
      }),
    ).toContain(
      'Write(f, reverse=True, reverse_rate_function=True, rate_func=smooth, lag_ratio=0.3, remover=True)',
    );
    expect(introOutro('gl', 'none', 'unwrite')).toContain('_Unwrite(f, stroke_color="#83C167")');
    expect(introOutro('gl', 'none', 'unwrite', (c) => (c.outro.easing = 'smooth'))).toContain(
      '_Unwrite(f, stroke_color="#83C167", rate_func=smooth)',
    );
    expect(introOutro('ce', 'none', 'fade_out', (c) => (c.outro.shift = [0, 1]))).toContain(
      'FadeOut(f, shift=UP)',
    );
    expect(introOutro('ce', 'none', 'shrink_to_center')).toContain(
      'ShrinkToCenter(f, remover=True)',
    );
    expect(introOutro('ce', 'none', 'uncreate')).toContain('Uncreate(f)');
    expect(introOutro('ce', 'none', 'uncreate', (c) => (c.outro.easing = 'rush_into'))).toContain(
      'Uncreate(f, rate_func=rush_into)',
    );
    expect(introOutro('gl', 'none', 'uncreate', (c) => (c.outro.easing = 'rush_into'))).toContain(
      'Uncreate(f, rate_func=lambda t: rush_into(1 - t))',
    );
  });
});

describe('relations', () => {
  function related(target: Target, style: 'transform' | 'copy' | 'fade', arc = 0, front = false) {
    const p = project(target);
    const a = formula(p, 'a', 3);
    const b = formula(p, 'b', 3);
    const ca = clip(p, a, front ? 1 : 0, 0, 3, { intro: defaultIntro('write') });
    const cb = clip(p, b, front ? 0 : 1, 1, 3);
    p.relations.push(
      createRelation(ca.id, cb.id, {
        style,
        pathArc: arc,
        easing: 'linear',
        pairs: [
          { from: [0], to: [1], style: null },
          { from: [1], to: [0, 2], style: null },
        ],
      }),
    );
    return generatePython(p, NO_RENDERS, options(target)).code;
  }

  it('maps the styles, wrapping both sides of a split in VGroups', () => {
    const ce = related('ce', 'transform', 45);
    expect(ce).toContain(
      'ReplacementTransform(a[0][0], b[0][1], path_arc=45 * DEGREES, rate_func=linear)',
    );
    expect(ce).toContain(
      'ReplacementTransform(VGroup(a[0][1]), VGroup(b[0][0], b[0][2]), path_arc=45 * DEGREES',
    );
    expect(related('ce', 'copy')).toContain(
      'ReplacementTransform(a[0][0].copy(), b[0][1], rate_func=linear)',
    );
    expect(related('gl', 'copy')).toContain('TransformFromCopy(a[0], b[1], rate_func=linear)');
    expect(related('ce', 'fade')).toContain('FadeTransform(a[0][0], b[0][1], rate_func=linear)');
    // The intro of b brings in nothing: every glyph arrives through the relation.
    expect(ce).not.toContain('self.add(b');
  });

  it('follows a custom path through the _spline_path helper, the arc ignored', () => {
    const bump = {
      nodes: [
        {
          at: [0, 0] as [number, number],
          in: null,
          out: [0.3, 0.4] as [number, number],
          smooth: false,
        },
        {
          at: [1, 0] as [number, number],
          in: [0.7, 0.4] as [number, number],
          out: null,
          smooth: true,
        },
      ],
    };
    const chord = {
      nodes: [
        { at: [0, 0] as [number, number], in: null, out: null, smooth: false },
        { at: [1, 0] as [number, number], in: null, out: null, smooth: false },
      ],
    };
    const paths = (target: Target) => {
      const p = project(target);
      const a = formula(p, 'a', 3);
      const b = formula(p, 'b', 3);
      const ca = clip(p, a, 0, 0, 3, { intro: defaultIntro('write') });
      const cb = clip(p, b, 1, 1, 3);
      p.relations.push(
        createRelation(ca.id, cb.id, {
          pathArc: 45,
          easing: 'linear',
          pairs: [
            { from: [0], to: [0], style: null, path: bump },
            { from: [1], to: [1], style: 'copy', path: chord },
            { from: [2], to: [2], style: 'fade' },
          ],
        }),
      );
      return generatePython(p, NO_RENDERS, options(target)).code;
    };
    const ce = paths('ce');
    const literal = '_spline_path([((0, 0), None, (0.3, 0.4)), ((1, 0), (0.7, 0.4), None)])';
    expect(ce).toContain(
      `ReplacementTransform(a[0][0], b[0][0], path_func=${literal}, rate_func=linear)`,
    );
    // The chord itself is a straight path: no arc, no helper call.
    expect(ce).toContain('ReplacementTransform(a[0][1].copy(), b[0][1], rate_func=linear)');
    // A pair without a path keeps the relation's arc.
    expect(ce).toContain(
      'FadeTransform(a[0][2], b[0][2], path_arc=45 * DEGREES, rate_func=linear)',
    );
    expect(ce.split('def _spline_path(nodes):')).toHaveLength(2);
    expect(ce.indexOf('def _spline_path')).toBeLessThan(ce.indexOf('class '));
    expect(paths('gl')).toContain(
      `ReplacementTransform(a[0], b[0], path_func=${literal}, rate_func=linear)`,
    );
    // Without a curved path the helper is not written.
    expect(related('ce', 'transform', 45)).not.toContain('_spline_path');
  });

  // Routes with paths of their own (D167) in one call: Manim hands a path function nothing but
  // points, which two glyphs drawn on one spot share, so the call is wrapped and the helper told
  // the path of each piece, in the order Manim animates them (D212; B-80 of the final audit).
  it('wraps a call whose glyphs follow different paths, with the path of each piece in order', () => {
    const curve = (height: number) => ({
      nodes: [
        {
          at: [0, 0] as [number, number],
          in: null,
          out: [0.25, height] as [number, number],
          smooth: false,
        },
        {
          at: [1, 0] as [number, number],
          in: [0.75, height] as [number, number],
          out: null,
          smooth: false,
        },
      ],
    });
    const OVER = '_spline_path([((0, 0), None, (0.25, 0.5)), ((1, 0), (0.75, 0.5), None)])';
    const UNDER = '_spline_path([((0, 0), None, (0.25, -0.5)), ((1, 0), (0.75, -0.5), None)])';
    const routed = (target: Target, pair: Relation['pairs'][number], arc = 0) => {
      const p = project(target);
      const a = formula(p, 'a', 3);
      const b = formula(p, 'b', 3);
      const ca = clip(p, a, 0, 0, 3, { intro: defaultIntro('write') });
      const cb = clip(p, b, 1, 1, 3);
      p.relations.push(
        createRelation(ca.id, cb.id, { pathArc: arc, easing: 'linear', pairs: [pair] }),
      );
      return generatePython(p, NO_RENDERS, options(target)).code;
    };
    /** The call that plays the pair: the line of the scene that holds `_route_paths(`. */
    const call = (code: string) =>
      code
        .split('\n')
        .filter((line) => line.includes('_route_paths(') && !line.startsWith('def '))
        .map((line) => line.trim().replace(/,$/, ''));

    // Two sources merged into one target: a piece for each source, in the order of the group.
    const merge = routed('ce', {
      from: [0, 1],
      to: [2],
      style: null,
      extras: 'merge',
      routes: [
        { from: 0, to: 2, path: curve(0.5) },
        { from: 1, to: 2, path: curve(-0.5) },
      ],
    });
    expect(call(merge)).toEqual([
      `_route_paths(ReplacementTransform(a[0][:2], VGroup(b[0][2]), rate_func=linear), [(a[0][0], b[0][2], ${OVER}), (a[0][1], b[0][2], ${UNDER})])`,
    ]);
    expect(merge.split('def _route_paths(animation, pieces):')).toHaveLength(2);
    expect(merge).not.toContain('path_func=_route_paths');

    // One source split in two: a piece for each target; a route without a path keeps the arc.
    const split = routed(
      'gl',
      {
        from: [1],
        to: [0, 2],
        style: null,
        routes: [{ from: 1, to: 2, path: curve(-0.5) }],
      },
      60,
    );
    expect(call(split)).toEqual([
      `_route_paths(ReplacementTransform(VGroup(a[1]), VGroup(b[0], b[2]), rate_func=linear), [(a[1], b[0], path_along_arc(60 * DEGREES)), (a[1], b[2], ${UNDER})])`,
    ]);

    // Two onto three, as Manim aligns them: the first source covers two targets. A straight
    // piece is None.
    const twoOntoThree = routed('gl', {
      from: [0, 1],
      to: [0, 1, 2],
      style: 'copy',
      routes: [{ from: 0, to: 1, path: curve(0.5) }],
    });
    expect(call(twoOntoThree)).toEqual([
      `_route_paths(TransformFromCopy(a[:2], b[:], rate_func=linear), [(a[0], b[0], None), (a[0], b[1], ${OVER}), (a[1], b[2], None)])`,
    ]);
    // Three onto two: the first target takes two sources.
    const threeOntoTwo = routed('ce', {
      from: [0, 1, 2],
      to: [0, 1],
      style: null,
      extras: 'merge',
      routes: [{ from: 1, to: 0, path: curve(-0.5) }],
    });
    expect(call(threeOntoTwo)).toEqual([
      `_route_paths(ReplacementTransform(a[0][:], b[0][:2], rate_func=linear), [(a[0][0], b[0][0], None), (a[0][1], b[0][0], ${UNDER}), (a[0][2], b[0][1], None)])`,
    ]);

    // A call whose pieces all follow the pair's path needs no telling apart: the animation takes
    // the path itself.
    const shared = routed('ce', {
      from: [0, 1],
      to: [2],
      style: null,
      extras: 'merge',
      path: curve(0.5),
    });
    expect(call(shared)).toEqual([]);
    expect(shared).toContain(
      `ReplacementTransform(a[0][:2], VGroup(b[0][2]), path_func=${OVER}, rate_func=linear)`,
    );
    expect(shared).not.toContain('def _route_paths');
  });

  it('plays several sources onto one target separately, merged, or as copies', () => {
    const many = (
      target: Target,
      extras?: 'separate' | 'merge' | 'copies',
      style: 'transform' | 'copy' = 'transform',
    ) => {
      const p = project(target);
      const a = formula(p, 'a', 3);
      const b = formula(p, 'b', 2);
      const ca = clip(p, a, 0, 0, 3, { intro: defaultIntro('write') });
      const cb = clip(p, b, 1, 1, 3);
      p.relations.push(
        createRelation(ca.id, cb.id, {
          style,
          easing: 'linear',
          pairs: [{ from: [2, 0], to: [1], style: null, extras }],
        }),
      );
      return generatePython(p, NO_RENDERS, options(target)).code;
    };
    // Separate (the default): one animation per source onto the same glyph, lowest index first.
    // In CE the first replaces (the target arrives through it) and the others remove themselves
    // at the end: a second Scene.replace onto one target would shift the glyph indices of `a`.
    const separate = many('ce');
    expect(separate).toContain('ReplacementTransform(a[0][0], b[0][1], rate_func=linear)');
    expect(separate).toContain('Transform(a[0][2], b[0][1], rate_func=linear, remover=True)');
    expect(separate.indexOf('a[0][0], b[0][1]')).toBeLessThan(separate.indexOf('a[0][2], b[0][1]'));
    expect(separate).not.toContain('VGroup(a[0][0], a[0][2])');
    // Merge: Manim's own alignment of the two groups, in the pair's stored order.
    expect(many('ce', 'merge')).toContain(
      'ReplacementTransform(VGroup(a[0][2], a[0][0]), VGroup(b[0][1]), rate_func=linear)',
    );
    // Copies: the first source transforms, the other sends a copy (self-removing in CE) and stays.
    const copies = many('ce', 'copies');
    expect(copies).toContain('ReplacementTransform(a[0][0], b[0][1], rate_func=linear)');
    expect(copies).toContain('Transform(a[0][2].copy(), b[0][1], rate_func=linear, remover=True)');
    expect(many('gl', 'copies')).toContain('TransformFromCopy(a[2], b[1], rate_func=linear)');
    // A copy pair copies every source, each on its own.
    expect(many('gl', undefined, 'copy')).toContain(
      'TransformFromCopy(a[0], b[1], rate_func=linear)',
    );
    expect(many('gl', undefined, 'copy')).toContain(
      'TransformFromCopy(a[2], b[1], rate_func=linear)',
    );
  });

  it('in GL every source replaces; a copy pair copies each source on its own', () => {
    const many = (target: Target, style: 'transform' | 'copy') => {
      const p = project(target);
      const a = formula(p, 'a', 3);
      const b = formula(p, 'b', 2);
      const ca = clip(p, a, 0, 0, 3, { intro: defaultIntro('write') });
      const cb = clip(p, b, 1, 1, 3);
      p.relations.push(
        createRelation(ca.id, cb.id, {
          style,
          easing: 'linear',
          pairs: [{ from: [0, 2], to: [1], style: null }],
        }),
      );
      return generatePython(p, NO_RENDERS, options(target)).code;
    };
    expect(many('gl', 'transform')).toContain('ReplacementTransform(a[0], b[1], rate_func=linear)');
    expect(many('gl', 'transform')).toContain('ReplacementTransform(a[2], b[1], rate_func=linear)');
    expect(many('gl', 'copy')).toContain('TransformFromCopy(a[0], b[1], rate_func=linear)');
    expect(many('gl', 'copy')).toContain('TransformFromCopy(a[2], b[1], rate_func=linear)');
    const ce = many('ce', 'copy');
    expect(ce).toContain('ReplacementTransform(a[0][0].copy(), b[0][1], rate_func=linear)');
    expect(ce).toContain('Transform(a[0][2].copy(), b[0][1], rate_func=linear, remover=True)');
  });

  it('draws the morph on the front track', () => {
    const transform = related('ce', 'transform', 0, true);
    expect(transform).toContain('a[0][0].set_z_index(1)');
    expect(related('gl', 'copy', 0, true)).toContain(
      'ReplacementTransform(a[0].copy().set_z_index(1), b[1], rate_func=linear)',
    );
  });
});

describe('scene membership', () => {
  it('never re-adds consumed glyphs and follows glyphs that arrive later', () => {
    const p = project();
    const a = formula(p, 'a', 3);
    const b = formula(p, 'b', 3);
    const c = formula(p, 'c', 1);
    const ca = clip(p, a, 0, 0, 4, {
      intro: defaultIntro('write'),
      outro: { ...defaultOutro('fade_out'), duration: 0.5 },
      actions: [createTween(2.2, 0.6, { position: [0, 2] })],
    });
    const cb = clip(p, b, 1, 1, 4, {
      actions: [createTween(1.2, 0.6, { position: [1, -2], scale: 2 })],
    });
    p.tracks.push(createTrack('Third'));
    const cc = clip(p, c, 2, 0, 3.5);
    p.relations.push(
      createRelation(ca.id, cb.id, { pairs: [{ from: [0], to: [0], style: null }] }),
    );
    p.relations.push(
      createRelation(cc.id, cb.id, {
        offset: 2,
        duration: 0.5,
        pairs: [{ from: [0], to: [2], style: null }],
      }),
    );
    expect(validateProject(p).filter((i) => i.severity === 'error')).toEqual([]);
    const { code } = generatePython(p, NO_RENDERS, options('ce'));
    // a lost glyph 0 before its tween: the tween moves the rest only, about the formula centre.
    expect(code).toContain('a[0][1:].animate.shift(2 * UP)');
    expect(code).not.toContain('a.animate');
    // b's glyph 2 arrives after b moved, so it is moved with b while off screen.
    expect(code).toContain('b[0][2].scale(2, about_point=[0, 0, 0]).shift(np.array([1, -2, 0]))');
    expect(code).toContain(
      'b[0][:2].animate.scale(2, about_point=[0, 0, 0]).shift(np.array([1, -2, 0]))',
    );
    expect(code).toContain('self.add(b[0][1])');
    expect(code).toContain('FadeOut(a[0][1:])');
  });

  it('leaves hidden glyphs out of the intro; only a relation brings one in', () => {
    const p = project();
    const a = formula(p, 'a', 4, { hiddenGlyphs: [2, 3] });
    const b = formula(p, 'b', 3, { hiddenGlyphs: [1, 2] });
    const ca = clip(p, a, 0, 0, 4, {
      intro: defaultIntro('write'),
      outro: { ...defaultOutro('fade_out'), duration: 0.5 },
      actions: [createTween(1.5, 0.5, { position: [0, 2] })],
    });
    const cb = clip(p, b, 1, 1, 4);
    // b's hidden glyph 1 arrives from a; its hidden glyph 2 never does.
    p.relations.push(
      createRelation(ca.id, cb.id, {
        offset: 1,
        pairs: [{ from: [0], to: [1], style: 'copy' }],
      }),
    );
    expect(validateProject(p).filter((i) => i.severity === 'error')).toEqual([]);
    const ce = generatePython(p, NO_RENDERS, options('ce')).code;
    expect(ce).toContain('Write(a[0][:2])');
    expect(ce).toContain('a[0][2:].shift(2 * UP)'); // kept in step while off screen
    expect(ce).toContain('a[0][:2].animate.shift(2 * UP)');
    expect(ce).toContain('self.add(b[0][0])');
    expect(ce).toContain('ReplacementTransform(a[0][0].copy(), b[0][1])');
    expect(ce).toContain('FadeOut(a[0][:2])');
    expect(ce).not.toMatch(/b\[0\]\[2\]|b\[0\]\[1:\]/);
    // GL (through the glyph helper here): the same membership.
    const gl = generatePython(p, NO_RENDERS, options('gl')).code;
    expect(gl).toContain('Write(VGroup(a_g[0], a_g[1])');
    expect(gl).toContain('self.add(b_g[0])');
    expect(gl).toContain('FadeOut(VGroup(a_g[0], a_g[1]))');
    expect(gl).not.toContain('b_g[2]');
  });

  it('removes what an instantaneous outro takes out', () => {
    const p = project();
    const f = formula(p, 'f', 2);
    clip(p, f, 0, 0, 1);
    p.meta.duration = 2;
    const { code } = generatePython(p, NO_RENDERS, options('ce'));
    expect(code).toMatch(
      /self\.add\(f\)\n\s+self\.wait\(1\)\n\s+self\.remove\(f\)\n\s+self\.wait\(1\)/,
    );
  });
});

describe('tweens', () => {
  function tweened(
    to: Parameters<typeof createTween>[2],
    target: Target = 'ce',
    easing = 'smooth' as const,
    indexing: CodegenOptions['indexing'] = 'auto',
  ) {
    const p = project(target);
    const f = formula(p, 'f', 3, { glyphColors: { '0': '#FFFF00' } });
    clip(p, f, 0, 0, 2, { actions: [createTween(0.5, 1, to, easing)] });
    return generatePython(p, NO_RENDERS, options(target, { indexing }));
  }

  it('uses .animate when it is exact', () => {
    expect(tweened({ position: [1, 1], scale: 2 }).code).toContain(
      'f.animate.scale(2).move_to([1, 1, 0])',
    );
    expect(tweened({ color: '#FC6255', opacity: 0.4 }).code).toContain(
      'f.animate.set_color("#FC6255").set_opacity(0.4)',
    );
  });

  it('uses MoveToTarget for per-glyph colours', () => {
    const { code } = tweened({ glyphColors: { '1': '#FC6255' } });
    expect(code).toContain('f.generate_target()');
    expect(code).toContain('f.target[0][1].set_color("#FC6255")');
    expect(code).toContain('self.play(MoveToTarget(f), run_time=1)');
  });

  it('turns rotations and flips with the tween helper', () => {
    const { code } = tweened({ rotation: 90, flipY: true }, 'gl');
    expect(code).toContain('class _Tween(Animation):');
    expect(code).toContain('_Tween(f, (0, 0, 1, 0, 1, 1), (0, 0, 1, 90, 1, -1))');
    const positional = tweened({ rotation: 90 }, 'ce', 'smooth', 'positional').code;
    expect(positional).toContain('_Tween(VGroup(*f_g[:]), (0, 0, 1, 0, 1, 1)');
  });

  it('plays an easing that comes back (there_and_back) as is: both end at the start state', () => {
    const { code } = tweened({ position: [2, 0] }, 'ce', 'there_and_back' as 'smooth');
    expect(code).toContain('f.animate(rate_func=there_and_back).move_to([2, 0, 0])');
    expect(code).not.toContain('f.shift(');
  });

  it('gives the tween helper the glyphs in order, placeholders included', () => {
    const ce = tweened({ rotation: 90, glyphColors: { '2': '#FC6255' } }, 'ce').code;
    expect(ce).toContain(
      '_Tween(f[0], (0, 0, 1, 0, 1, 1), (0, 0, 1, 90, 1, 1), colors=[None, None, ("#FFFFFF", "#FC6255")])',
    );
    expect(TWEEN_HELPER).toContain('self.glyphs = list(self.mobject.submobjects)');
  });
});

describe('timing', () => {
  it('plays overlapping animations in parts, with _Part only where needed', () => {
    const p = project();
    const a = formula(p, 'a', 2);
    const b = formula(p, 'b', 2);
    clip(p, a, 0, 0, 3, { intro: defaultIntro('write') });
    clip(p, b, 1, 0.5, 3, { intro: defaultIntro('fade_in') });
    const { code } = generatePython(p, NO_RENDERS, options('ce'));
    expect(code).toContain('class _Part(Animation):');
    expect(code).toContain('a_in = Write(a)');
    expect(code).toContain('self.play(_Part(a_in, 0, 0.5), run_time=0.5)');
    expect(code).toContain('b_in = FadeIn(b)');
    expect(code).toContain('self.play(_Part(a_in, 0.5, 1), _Part(b_in, 0, 0.5), run_time=0.5)');
    expect(code).toContain('self.play(_Part(b_in, 0.5, 1), run_time=0.5)');
    expect(totalFrames(code, 'ce', 30)).toBe(90);
  });

  it('snaps to the frame grid and reports noticeable shifts', () => {
    const p = project();
    p.meta.fps = 24;
    const f = formula(p, 'f', 2);
    clip(p, f, 0, 0.1, 1.3, { intro: { ...defaultIntro('write'), duration: 0.47 } });
    const { code, issues } = generatePython(p, NO_RENDERS, options('ce'));
    expect(issues.map((i) => i.code)).toContain('export-snapping');
    expect(totalFrames(code, 'ce', 24)).toBe(Math.round(1.3 * 24));
  });

  it('gives every synthetic validation project exactly round(duration · fps) frames', () => {
    for (const { name, project: p } of syntheticCases()) {
      expect(hasErrors(validateProject(p)), name).toBe(false);
      for (const target of ['ce', 'gl'] as const) {
        const { code } = generatePython(
          { ...p, meta: { ...p.meta, target } },
          NO_RENDERS,
          options(target),
        );
        expect(totalFrames(code, target, p.meta.fps), `${name} ${target}`).toBe(
          Math.round(sceneDuration(p) * p.meta.fps),
        );
      }
    }
  });
});

describe('animation blocks', () => {
  /** Clip 0–6 s of a five-glyph formula whose glyphs 3 and 4 are hidden: the intro writes 0–2. */
  function blocks(target: Target, actions: Clip['actions']): string {
    const p = project(target);
    const f = formula(p, 'f', 5, { hiddenGlyphs: [3, 4] });
    clip(p, f, 0, 0, 6, {
      intro: defaultIntro('write'),
      outro: { ...defaultOutro('fade_out'), duration: 0.5 },
      actions,
    });
    expect(validateProject(p).filter((i) => i.severity === 'error')).toEqual([]);
    return generatePython(p, NO_RENDERS, options(target)).code;
  }

  it('animates appear and disappear blocks like intros and outros of their glyphs', () => {
    const actions = [
      createAppear(1.5, 'write', [3, 4], { duration: 0.8 }),
      createDisappear(2.5, 'fade_out', [1], { duration: 0.5, shift: [0, 1] }),
      createAppear(3.2, 'fade_in', [1, 3], { duration: 0.5, lagRatio: 0.3 }),
    ];
    const ce = blocks('ce', actions);
    expect(ce).toContain('self.play(Write(f[0][:3]), run_time=1)');
    expect(ce).toContain('self.play(Write(f[0][3:]), run_time=0.8)');
    expect(ce).toContain('self.play(FadeOut(f[0][1], shift=UP), run_time=0.5)');
    // The FadeIn brings back only what is off screen: 3 is there since the Write.
    expect(ce).toContain('self.play(FadeIn(f[0][1], lag_ratio=0.3), run_time=0.5)');
    // Every glyph is on screen again: the outro takes the formula.
    expect(ce).toContain('FadeOut(f)');
    const gl = blocks('gl', actions);
    expect(gl).toContain('Write(f[3:], stroke_color="#FFFFFF")');
    expect(gl).toContain('FadeOut(VGroup(f[1]), shift=UP)');
  });

  it('plays blocks on different glyphs at the same time in parts', () => {
    const ce = blocks('ce', [
      createAppear(1.5, 'grow_from_center', [3], { duration: 1 }),
      createDisappear(2, 'shrink_to_center', [0], { duration: 1 }),
    ]);
    expect(ce).toContain('f_appear = GrowFromCenter(f[0][3])');
    expect(ce).toContain('f_disappear = ShrinkToCenter(f[0][0], remover=True)');
    expect(ce).toContain(
      'self.play(_Part(f_appear, 0.5, 1), _Part(f_disappear, 0, 0.5), run_time=0.5)',
    );
  });

  it('moves glyphs that come back along with tweens while they are away', () => {
    const ce = blocks('ce', [
      createDisappear(1.5, 'uncreate', [0], { duration: 0.5 }),
      createDisappear(1.5, 'fade_out', [1], { duration: 0.5 }),
      createTween(2.5, 0.5, { position: [1, 0] }),
      createAppear(3.5, 'create', [0], { duration: 0.5 }),
    ]);
    // Glyph 0 comes back, glyph 1 does not; the hidden glyphs may still appear.
    expect(ce).toContain('VGroup(f[0][0], f[0][3], f[0][4]).shift(RIGHT)');
    expect(ce).toContain('self.play(f[0][2].animate.shift(RIGHT), run_time=0.5)');
    expect(ce).toContain('self.play(Create(f[0][0]), run_time=0.5)');
    expect(ce).toContain('FadeOut(VGroup(f[0][0], f[0][2]))');
  });

  it('gives glyphs that come back their shape again, only where needed', () => {
    const actions = [
      createDisappear(1.2, 'uncreate', [0], { duration: 0.5 }),
      createDisappear(1.2, 'shrink_to_center', [1], { duration: 0.5 }),
      createAppear(2, 'fade_in', [0], { duration: 0.5 }),
      createDisappear(3, 'unwrite', [0, 2], { duration: 0.5, easing: 'smooth' }),
      createAppear(4, 'write', [2], { duration: 0.5 }),
    ];
    const ce = blocks('ce', actions);
    // Glyph 0 comes back after Uncreate, glyph 2 after the unwrite; glyph 1 never does.
    expect(ce).toContain('_Uncreate(f[0][0])');
    expect(ce).toContain('class _Uncreate(Uncreate):');
    expect(ce).toContain('ShrinkToCenter(f[0][1], remover=True)');
    expect(ce).not.toContain('_ShrinkToCenter');
    expect(ce).toContain('_Unwrite(VGroup(f[0][0], f[0][2]), rate_func=smooth)');
    expect(ce).toContain('class _Unwrite(Write):');
    const gl = blocks('gl', actions);
    expect(gl).toContain('_Uncreate(VGroup(f[0]))');
    expect(gl).toMatch(/class _Unwrite\(Write\):[\s\S]+self\.interpolate\(0\)/);
    // FadeOut restores by itself; a glyph that does not come back needs nothing.
    const plain = blocks('ce', [
      createDisappear(1.2, 'fade_out', [0], { duration: 0.5 }),
      createAppear(2, 'write', [0], { duration: 0.5 }),
      createDisappear(3, 'uncreate', [1], { duration: 0.5 }),
    ]);
    expect(plain).not.toMatch(/^class _/m);
    expect(blocks('gl', [createDisappear(1.2, 'unwrite', [0], { duration: 0.5 })])).not.toContain(
      'interpolate(0)',
    );
  });

  it('takes out at the clip end the glyphs that came on screen during the outro', () => {
    const p = project();
    p.meta.duration = 5;
    const f = formula(p, 'f', 3, { hiddenGlyphs: [2] });
    clip(p, f, 0, 0, 4, {
      outro: { ...defaultOutro('fade_out'), duration: 1 },
      actions: [createAppear(3.2, 'fade_in', [2], { duration: 0.5 })],
    });
    expect(validateProject(p).filter((i) => i.severity === 'error')).toEqual([]);
    const { code } = generatePython(p, NO_RENDERS, options('ce'));
    expect(code).toContain('FadeOut(f[0][:2])');
    expect(code).toMatch(
      /self\.play\(_Part\(f_out, 0\.7, 1\), run_time=0\.3\)\n\s+self\.remove\(f\[0\]\[2\]\)/,
    );
    expect(totalFrames(code, 'ce', 30)).toBe(150);
  });
});

describe('morph blocks', () => {
  /** Glyphs 0–3 written by the intro over [0, 1); a Morph block makes the rest out of them. */
  function morphed(
    target: Target,
    actions: Clip['actions'],
    extra: Partial<CodegenOptions> = {},
  ): { code: string; issues: Issue[] } {
    const p = project(target);
    const f = formula(p, 'f', 8, { hiddenGlyphs: [7] });
    clip(p, f, 0, 0, 6, {
      intro: defaultIntro('write'),
      outro: { ...defaultOutro('fade_out'), duration: 0.5 },
      actions,
    });
    expect(validateProject(p).filter((i) => i.severity === 'error')).toEqual([]);
    return generatePython(p, NO_RENDERS, options(target, extra));
  }

  const styles = createMorph(2, {
    pathArc: 30,
    pairs: [
      { from: [0], to: [4], style: null }, // the block's style: copy
      { from: [1], to: [5], style: 'transform' },
      { from: [2, 3], to: [6], style: 'fade', extras: 'merge' }, // fused, as Manim aligns them
    ],
  });

  it('plays each pair like a relation pair whose two clips are one', () => {
    const ce = morphed('ce', [styles], { comments: true }).code;
    // The targets arrive through the block: the intro leaves them out (and the hidden glyph).
    expect(ce).toContain('self.play(Write(f[0][:4]), run_time=1)');
    expect(ce).toContain('# 2 s – 3 s: f morph');
    expect(ce).toContain('ReplacementTransform(f[0][0].copy(), f[0][4], path_arc=30 * DEGREES)');
    expect(ce).toContain('ReplacementTransform(f[0][1], f[0][5], path_arc=30 * DEGREES)');
    // A side of several glyphs is a group (a slice for a run), and then so is the other one.
    expect(ce).toContain('FadeTransform(f[0][2:4], VGroup(f[0][6]), path_arc=30 * DEGREES)');
    // Same clip, same depth: the formula keeps its layer and nothing is raised.
    expect(ce.match(/.*set_z_index.*/g)).toEqual(['        f.set_z_index(1)']);
    const gl = morphed('gl', [styles]).code;
    expect(gl).toContain('TransformFromCopy(f[0], f[4], path_arc=30 * DEGREES)');
    expect(gl).toContain('ReplacementTransform(f[1], f[5], path_arc=30 * DEGREES)');
    expect(gl).toContain('FadeTransform(f[2:4], VGroup(f[6]), path_arc=30 * DEGREES)');
  });

  it('writes a group pair as one transform of the two slices, with the block easing', () => {
    const block = createMorph(2, {
      easing: 'linear',
      pairs: [{ from: [1, 2], to: [4, 5], style: null }],
    });
    expect(morphed('ce', [block]).code).toContain(
      'self.play(ReplacementTransform(f[0][1:3].copy(), f[0][4:6], rate_func=linear), run_time=1)',
    );
    expect(morphed('gl', [block]).code).toContain(
      'self.play(TransformFromCopy(f[1:3], f[4:6], rate_func=linear), run_time=1)',
    );
  });

  it('never uses the formula whole again once a pair consumed one of its glyphs', () => {
    // The hidden glyph appears after the block, then the formula moves and fades out.
    const after = [
      createAppear(3, 'fade_in', [7], { duration: 0.5 }),
      createTween(3.5, 0.5, { position: [1, 0] }),
    ];
    for (const target of ['ce', 'gl'] as const) {
      const glyphs = target === 'ce' ? 'f[0]' : 'f';
      // Only copies: every glyph is on screen afterwards, so the formula is used whole.
      const copied = morphed(target, [
        createMorph(2, { pairs: [{ from: [0, 1, 2], to: [4, 5, 6], style: null }] }),
        ...after,
      ]).code;
      expect(copied).toContain('f.animate.move_to([1, 0, 0])');
      expect(copied).toContain('FadeOut(f)');
      // A consumed glyph stays in the mobject, morphed into its target's shape: any use of the
      // whole formula (`f.animate`, `FadeOut(f)`, `self.add(f)`) would draw it again.
      const consumed = morphed(target, [
        createMorph(2, {
          pairs: [
            { from: [0], to: [4], style: 'transform' },
            { from: [1, 2], to: [5, 6], style: null },
          ],
        }),
        ...after,
      ]).code;
      expect(consumed).not.toMatch(/\bf\.animate|FadeOut\(f\)|self\.add\(f\)/);
      expect(consumed).toContain(`${glyphs}[1:].animate.shift(RIGHT)`);
      expect(consumed).toContain(`FadeOut(${glyphs}[1:])`);
    }
  });

  it('names its variables after the formula and plays in parts beside other blocks', () => {
    const ce = morphed('ce', [
      createMorph(1.5, { pairs: [{ from: [0], to: [4], style: null }] }), // [1.5, 2.5)
      createAppear(2, 'write', [7], { duration: 1 }), // [2, 3), other glyphs
      createMorph(3, { pairs: [{ from: [1], to: [5], style: null }] }), // [3, 4)
      createMorph(3.5, { pairs: [{ from: [2], to: [6], style: null }] }), // [3.5, 4.5)
    ]).code;
    expect(ce).toContain('f_morph = ReplacementTransform(f[0][0].copy(), f[0][4])');
    expect(ce).toContain('f_appear = Write(f[0][7])');
    expect(ce).toContain(
      'self.play(_Part(f_morph, 0.5, 1), _Part(f_appear, 0, 0.5), run_time=0.5)',
    );
    expect(ce).toContain('f_morph_2 = ReplacementTransform(f[0][1].copy(), f[0][5])');
    expect(ce).toContain('f_morph_3 = ReplacementTransform(f[0][2].copy(), f[0][6])');
    expect(ce).toContain(
      'self.play(_Part(f_morph_2, 0.5, 1), _Part(f_morph_3, 0, 0.5), run_time=0.5)',
    );
  });

  it('leaves the multi-line case of the export check free of problems, with its glyphs', async () => {
    const p = structuredClone(syntheticCases().find((c) => c.name === 'multiline')!.project);
    for (const f of p.formulas) {
      const result = await createMockEngine().render({
        kind: 'math',
        latex: f.source,
        packages: packagesOf(f),
        preamble: p.meta.preamble,
        target: p.meta.target,
        fontSize: f.fontSize,
        prefer: 'auto',
      });
      if (!result.ok) throw new Error(result.error.message);
      f.snapshot = toSnapshot(result.render);
    }
    // The glyph counts LaTeX and MathJax give these formulas (the export check renders them).
    expect(p.formulas.map((f) => f.snapshot!.glyphs.length)).toEqual([10, 3, 7]);
    expect(validateProject(p)).toEqual([]);
  });

  it("names the block whose glyphs Manim's LaTeX lacks", () => {
    const p = project();
    const f = formula(p, 'f', 3, { snapshot: snapshot(3, 'mathjax') });
    clip(p, f, 0, 0, 3, {
      intro: defaultIntro('write'),
      actions: [createMorph(1.5, { pairs: [{ from: [0], to: [2], style: null }] })],
    });
    const latex = {
      backend: 'latex',
      target: 'ce',
      key: 'latex-x',
      glyphs: [{}, {}],
      warnings: [],
    };
    const formulas = new Map([
      [f.id, { formula: f, render: latex, canonToRender: [0, 1, null], confidence: 0.6 }],
    ]) as unknown as ResolvedFormulas;
    const { issues } = generatePython(p, formulas, options('ce'));
    const issue = issues.find((i) => i.code === 'export-glyph-count' && i.path[0] === 'clips');
    expect(issue?.path).toEqual(['clips', 0, 'actions', 0]);
    expect(issue?.message).toMatch(/^The Morph block of f moves glyphs/);
    expect(issue?.message).toContain('(f glyph 2)');
  });
});

describe('part transforms', () => {
  it('moves a part with .animate about its centre, turns it with the tween helper', () => {
    const p = project();
    const f = formula(p, 'f', 5, { hiddenGlyphs: [4] });
    clip(p, f, 0, 0, 8, {
      intro: defaultIntro('write'),
      outro: { ...defaultOutro('fade_out'), duration: 0.5 },
      actions: [
        // Ids order the two blocks that start together: the turn gets the first pivot name.
        { ...createPartTransform(1.2, [1], { duration: 0.6, shift: [1, 0.5], scale: 2 }), id: 'b' },
        {
          ...createPartTransform(1.2, [3, 4], { duration: 0.6, rotation: 90, color: '#FF0000' }),
          id: 'a',
        },
        createTween(2.2, 0.6, { position: [-1, 1.5], scale: 0.8 }),
        createPartTransform(3.2, [2], {
          duration: 0.6,
          shift: [0, -0.5],
          opacity: 0.5,
          easing: 'rush_into',
        }),
        createAppear(4, 'fade_in', [4], { duration: 0.5 }),
        createPartTransform(5, [1], { duration: 0.6, shift: [0, -0.6], easing: 'there_and_back' }),
        createTween(6, 0.5, { glyphColors: { '3': '#00FF00' } }),
      ],
    });
    expect(validateProject(p).filter((i) => i.severity === 'error')).toEqual([]);
    const { code, issues } = generatePython(p, NO_RENDERS, options('ce'));
    expect(issues.map((i) => i.code)).not.toContain('export-unsupported');
    // The pivot is the centre of the whole part, the hidden glyph included; that glyph takes the
    // end state at once while the one on screen turns with the helper.
    expect(code).toContain('f_pivot = f[0][3:].get_center()');
    expect(code).toContain(
      'f[0][4].rotate(90 * DEGREES, about_point=f_pivot).set_color("#FF0000")',
    );
    expect(code).toContain(
      '_Tween(VGroup(f[0][3]), (f_pivot[0], f_pivot[1], 1, 0, 1, 1), ' +
        '(f_pivot[0], f_pivot[1], 1, 90, 1, 1), colors=[("#FFFFFF", "#FF0000")])',
    );
    expect(code).toContain('f_pivot_2 = f[0][1].get_center()');
    expect(code).toContain(
      'f[0][1].animate.scale(2, about_point=f_pivot_2).shift(np.array([1, 0.5, 0]))',
    );
    expect(code).toContain(
      'f[0][2].animate(rate_func=rush_into).shift(0.5 * DOWN).set_opacity(0.5)',
    );
    expect(code).toContain('f[0][1].animate(rate_func=there_and_back).shift(0.6 * DOWN)');
    // The tween that recolours glyph 3 takes over from the part's red: the glyph first takes the
    // clip's colour, as in the preview.
    expect(code).toMatch(/f\[0\]\[3\]\.set_color\("#FFFFFF"\)\n\s+f\.generate_target\(\)/);
    expect(totalFrames(code, 'ce', 30)).toBe(240);
  });

  it('fades each glyph of a turning part from its own opacity', () => {
    const p = project();
    const f = formula(p, 'f', 3);
    clip(p, f, 0, 0, 4, {
      actions: [
        createPartTransform(1, [1], { duration: 0.5, opacity: 0.3 }),
        createPartTransform(2, [0, 1], { duration: 0.5, rotation: 30, opacity: 0.8 }),
      ],
    });
    const { code } = generatePython(p, NO_RENDERS, options('ce'));
    expect(code).toContain('opacity=[(1, 0.8), (0.3, 0.8)]');
    expect(code).toContain('fade = self.opacity[i] if isinstance(self.opacity, list)');
  });

  it('pivots a whole-formula tween on explicit points once a part moved', () => {
    const p = project();
    const f = formula(p, 'f', 3);
    clip(p, f, 0, 0, 4, {
      actions: [
        createPartTransform(1, [0], { duration: 0.5, shift: [0, 1] }),
        createTween(2, 0.5, { position: [2, 0], scale: 2 }),
      ],
    });
    const { code } = generatePython(p, NO_RENDERS, options('ce'));
    expect(code).toContain('self.play(f[0][0].animate.shift(UP), run_time=0.5)');
    expect(code).toContain('f.animate.scale(2, about_point=[0, 0, 0]).shift(2 * RIGHT)');
    expect(code).not.toContain('move_to');
  });

  it('keeps a part colour that a tween leaves alone, colouring glyph by glyph', () => {
    const p = project();
    const f = formula(p, 'f', 3, { glyphColors: { '0': '#00FF00' } });
    clip(p, f, 0, 0, 4, {
      actions: [
        createPartTransform(1, [0], { duration: 0.5, color: '#FF0000' }),
        // Every glyph ends green; glyph 0 was green in the clip's own colours all along, so its
        // red stays, and `.set_color` on the formula would be wrong.
        createTween(2, 0.5, { color: '#00FF00' }),
      ],
    });
    const { code } = generatePython(p, NO_RENDERS, options('ce'));
    expect(code).toContain('self.play(f[0][0].animate.set_color("#FF0000"), run_time=0.5)');
    expect(code).toContain('f.target[0][1:].set_color("#00FF00")');
    expect(code).not.toContain('f.animate');
    // Glyph 0 is coloured once, in the set-up; the tween does not touch it.
    expect(code.match(/f\[0\]\[0\]\.set_color\(/g)).toHaveLength(1);
  });
});

describe('review fixes', () => {
  it('keeps a formula list name (`x_g`) apart from a formula named x_g', () => {
    const p = project();
    const a = formula(p, 'x_g', 2, { snapshot: snapshot(2, 'mathjax') });
    const b = formula(p, 'x', 2, { snapshot: snapshot(2, 'mathjax') });
    clip(p, a, 0, 0, 1);
    clip(p, b, 1, 0, 1);
    const { code } = generatePython(p, NO_RENDERS, options('ce'));
    expect(code).toContain('x_g = MathTex(');
    expect(code).toContain('x_g_g = _glyphs(x_g, [');
    expect(code).toContain('x_2 = MathTex(');
    expect(code).toContain('x_2_g = _glyphs(x_2, [');
    expect(code).not.toMatch(/^\s+x_g = _glyphs/m);
  });

  it('fades out only the glyphs that are on screen', () => {
    const p = project();
    const a = formula(p, 'a', 2);
    const b = formula(p, 'b', 3);
    const ca = clip(p, a, 0, 0, 3, { intro: defaultIntro('write') });
    const cb = clip(p, b, 1, 1, 3, { outro: { ...defaultOutro('fade_out'), duration: 1 } });
    // Glyph 2 of b is the target of a pair whose source does not exist: it never arrives.
    p.relations.push(
      createRelation(ca.id, cb.id, {
        pairs: [
          { from: [0], to: [0], style: null },
          { from: [7], to: [2], style: null },
        ],
      }),
    );
    const { code } = generatePython(p, NO_RENDERS, options('ce'));
    expect(code).toContain('self.add(b[0][1])');
    expect(code).toContain('FadeOut(b[0][:2])');
  });

  it('counts the scene frames on the same grid as the boundaries', () => {
    const p = project();
    p.meta.fps = 15;
    const f = formula(p, 'f', 2);
    // 0.7 · 15 is 10.499999… in floating point: the end snaps to frame 11 and so does the total.
    clip(p, f, 0, 0, 0.7, { intro: { ...defaultIntro('fade_in'), duration: 0.7 } });
    const { code } = generatePython(p, NO_RENDERS, options('ce'));
    expect(totalFrames(code, 'ce', 15)).toBe(11);
  });

  it('never lets a stretched animation overlap the next one on the same clip', () => {
    const p = project();
    const f = formula(p, 'f', 2);
    clip(p, f, 0, 0, 2, {
      intro: { ...defaultIntro('fade_in'), duration: 0.01 },
      actions: [createTween(0.01, 0.5, { position: [1, 0] })],
    });
    const { code, issues } = generatePython(p, NO_RENDERS, options('ce'));
    expect(code).not.toContain('_Part');
    expect(code).toMatch(/self\.play\(FadeIn\(f\), run_time=0\.0333+\)\n\s+self\.play\(f\.animate/);
    expect(issues.find((i) => i.code === 'export-snapping')?.message).toContain('f tween');
    expect(totalFrames(code, 'ce', 30)).toBe(60);
  });

  it("names relations that move glyphs Manim's LaTeX lacks", () => {
    const p = project();
    const a = formula(p, 'a', 3, { snapshot: snapshot(3, 'mathjax') });
    const b = formula(p, 'b', 2);
    const ca = clip(p, a, 0, 0, 3, { intro: defaultIntro('write') });
    const cb = clip(p, b, 1, 1, 3);
    p.relations.push(
      createRelation(ca.id, cb.id, { pairs: [{ from: [2], to: [0, 1], style: null }] }),
    );
    // The LaTeX render has two glyphs; canonical glyph 2 (MathJax's) has no counterpart.
    const latex = {
      backend: 'latex',
      target: 'ce',
      key: 'latex-x',
      glyphs: [{}, {}],
      warnings: [],
    };
    const formulas = new Map([
      [a.id, { formula: a, render: latex, canonToRender: [0, 1, null], confidence: 0.6 }],
    ]) as unknown as ResolvedFormulas;
    const { issues } = generatePython(p, formulas, options('ce'));
    const issue = issues.find((i) => i.code === 'export-glyph-count' && i.path[0] === 'relations');
    expect(issue?.message).toContain('Relation a → b');
    expect(issue?.message).toContain('a glyph 2');
  });
});

describe('issues', () => {
  it('reports hidden tracks, missing renders and project errors', () => {
    const p = project();
    p.tracks[1]!.hidden = true;
    const f = formula(p, 'f', 2);
    const g = createFormula({ name: 'g', source: 'y' });
    p.formulas.push(g);
    clip(p, f, 1, 0, 1);
    clip(p, g, 0, 0, 1);
    const { issues, code } = generatePython(p, NO_RENDERS, options('ce'));
    const codes = issues.map((i) => i.code);
    expect(codes).toContain('export-hidden-track');
    expect(codes).toContain('export-missing-render');
    expect(code).not.toContain('g = MathTex');
    expect(code).toContain('f = MathTex');
  });

  it('leaves out the clips of an empty formula, even when it keeps an old snapshot', () => {
    const p = project();
    const f = formula(p, 'f', 2);
    clip(p, f, 0, 0, 1);
    f.source = ''; // cleared in the editor: the snapshot of the last LaTeX stays
    const { issues, code } = generatePython(p, NO_RENDERS, options('ce'));
    expect(issues.find((i) => i.code === 'export-missing-render')?.message).toBe(
      'Formula "f" is empty; its clips are left out.',
    );
    expect(code).not.toContain('MathTex(r"")');
  });

  it('exports every kind of animation block', () => {
    const p = project();
    const f = formula(p, 'f', 3);
    clip(p, f, 0, 0, 3, {
      actions: [
        createAppear(0.5, 'write', 'all', { duration: 0.5 }),
        createPartTransform(1.2, [0], { duration: 0.5, shift: [0, 1] }),
        createDisappear(2, 'fade_out', [1], { duration: 0.5 }),
        createTween(2, 0.5, { scale: 2 }),
      ],
    });
    const { issues } = generatePython(p, NO_RENDERS, options('ce'));
    expect(issues.map((i) => i.code)).not.toContain('export-unsupported');
  });

  it('writes a valid scene for an empty project', () => {
    const { code, issues } = generatePython(project(), NO_RENDERS, options('ce'));
    expect(code).toContain('class Demo(Scene):');
    expect(issues.map((i) => i.code)).toContain('export-empty');
  });
});

describe('attached objects (R4)', () => {
  /** f1 (7 glyphs) on track 1; f2 hangs below its glyphs 2–4 and f3 to the right of f2, both
   * from 1 s; every clip without intro unless `intro` says otherwise. */
  function attached(target: Target, intro?: Clip['intro']) {
    const p = project(target);
    p.tracks.push(createTrack('Track 3'));
    const f1 = formula(p, 'f1', 7);
    const f2 = formula(p, 'f2', 2);
    const f3 = formula(p, 'f3', 1);
    const c1 = clip(p, f1, 0, 0, 4);
    c1.initial.position = [1, 2];
    c1.initial.scale = 1.5;
    const c2 = clip(p, f2, 1, 1, 4, {
      attach: createAttach(c1.id, [2, 3, 4]),
      ...(intro ? { intro } : {}),
    });
    c2.initial.position = [-3, -3];
    c2.initial.rotation = 30;
    const c3 = clip(p, f3, 2, 1, 4, {
      attach: createAttach(c2.id, 'all', { side: 'right', buff: 0.1 }),
    });
    return { p, c1, c2, c3 };
  }
  const lines = (code: string) => code.split('\n').map((l) => l.trim());

  it('places the object beside the target glyphs when its clip starts, targets first', () => {
    const { p } = attached('ce');
    const { code, issues } = generatePython(p, NO_RENDERS, options('ce'));
    expect(hasErrors(issues)).toBe(false);
    // The setup keeps the scale and the rotation, not the position: Manim finds it.
    expect(code).toContain('f1.scale(1.5).move_to([1, 2, 0])');
    expect(code).toContain('f2.rotate(30 * DEGREES)');
    expect(code).not.toMatch(/f2\..*move_to/);
    const l = lines(code);
    const place2 = l.indexOf('f2.next_to(f1[0][2:5], DOWN, buff=0.25)');
    const place3 = l.indexOf('f3.next_to(f2, RIGHT, buff=0.1)');
    expect(place2).toBeGreaterThan(-1);
    expect(place3).toBeGreaterThan(place2); // the chain goes link by link
    expect(l.indexOf('self.add(f2)')).toBeGreaterThan(place3); // placed before being added
    expect(l.indexOf('self.add(f3)')).toBeGreaterThan(place3);
    // ManimGL indexes the glyphs directly.
    const gl = generatePython(attached('gl').p, NO_RENDERS, options('gl')).code;
    expect(gl).toContain('f2.next_to(f1[2:5], DOWN, buff=0.25)');
  });

  it('places it before the play that writes it', () => {
    const { p } = attached('ce', defaultIntro('write'));
    const l = lines(generatePython(p, NO_RENDERS, options('ce')).code);
    const place = l.indexOf('f2.next_to(f1[0][2:5], DOWN, buff=0.25)');
    const write = l.findIndex((line) => line.includes('Write(f2'));
    expect(place).toBeGreaterThan(-1);
    expect(write).toBeGreaterThan(place);
  });

  it('falls back to the position the project holds when it cannot place the object', () => {
    for (const spoil of [
      (c: { c1: Clip; c2: Clip; c3: Clip }) => (c.c2.attach = createAttach('nope', [1])),
      (c: { c1: Clip; c2: Clip; c3: Clip }) => (c.c2.attach = createAttach(c.c1.id, [9])),
      (c: { c1: Clip; c2: Clip; c3: Clip }) => (c.c1.attach = createAttach(c.c3.id, 'all')),
    ]) {
      const scene = attached('ce');
      spoil(scene);
      const code = generatePython(scene.p, NO_RENDERS, options('ce')).code;
      expect(code).not.toContain('f2.next_to(');
      expect(code).toContain('.move_to([-3, -3, 0])');
    }
  });
});

describe('braces (D66)', () => {
  /** f1 (7 glyphs) on track 1 from 0 s; a brace b1 on its glyphs 2–4 from 1 s, `fields` of its
   * attachment, and a label f2 hanging below the brace from 2 s. The braces are rendered, so
   * that their snapshots are exact. */
  function braced(
    target: Target,
    fields: Partial<{ direction: number; buff: number }> = {},
    brace: Partial<{ sharpness: number; color: string }> = {},
  ) {
    const p = project(target);
    p.tracks.push(createTrack('Track 3'));
    const f1 = formula(p, 'f1', 7);
    const b1 = createBraceFormula({ name: 'b1', ...brace });
    p.formulas.push(b1);
    const f2 = formula(p, 'f2', 2);
    const c1 = clip(p, f1, 0, 0, 4);
    c1.initial.position = [1, 2];
    const cb = clip(p, b1, 1, 1, 4, { attach: createBraceAttach(c1.id, [2, 3, 4], fields) });
    cb.initial.opacity = 0.5;
    const c2 = clip(p, f2, 2, 2, 4, {
      attach: createAttach(cb.id, 'all', { side: 'down', buff: 0.1 }),
    });
    const settled = refreshLocalRenders(p, NO_RENDERS);
    return { p: settled.project, renders: settled.formulas, c1, cb, c2 };
  }
  const lines = (code: string) => code.split('\n').map((l) => l.trim());

  it('builds the brace on its target where its clip starts, nothing in the setup', () => {
    const { p, renders } = braced('ce', { direction: 0, buff: 0.2 });
    const { code, issues } = generatePython(p, renders, options('ce'));
    expect(hasErrors(issues)).toBe(false);
    const l = lines(code);
    const built = l.indexOf('b1 = Brace(f1[0][2:5], DOWN, buff=0.2)');
    expect(built).toBeGreaterThan(-1);
    expect(l[built + 1]).toBe('b1.set_opacity(0.5)');
    expect(l[built + 2]).toBe('b1.set_z_index(1)');
    expect(code).not.toContain('Brace(Line');
    expect(l.indexOf('self.add(b1)')).toBeGreaterThan(built);
    // The label hangs on the brace once it is built.
    expect(l.indexOf('f2.next_to(b1, DOWN, buff=0.1)')).toBeGreaterThan(built);
    // ManimGL indexes the glyphs directly and has no z_index concern of its own here.
    const gl = generatePython(braced('gl').p, braced('gl').renders, options('gl')).code;
    expect(gl).toContain('b1 = Brace(f1[2:5], DOWN, buff=0.2)');
  });

  it('names the sides, turns any other direction, keeps the sharpness for ManimCE only', () => {
    const direction = (degrees: number, target: Target = 'ce') => {
      const { p, renders } = braced(target, { direction: degrees });
      const line = lines(generatePython(p, renders, options(target)).code).find((l) =>
        l.startsWith('b1 = Brace('),
      )!;
      return line.slice(line.indexOf(',') + 2, line.indexOf(', buff'));
    };
    expect(direction(180)).toBe('UP');
    expect(direction(90)).toBe('RIGHT');
    expect(direction(-90)).toBe('LEFT');
    expect(direction(450)).toBe('RIGHT');
    expect(direction(30)).toBe('rotate_vector(DOWN, 30 * DEGREES)');
    const sharp = braced('ce', {}, { sharpness: 1.5, color: '#FC6255' });
    const ce = generatePython(sharp.p, sharp.renders, options('ce'));
    expect(ce.code).toContain(
      'b1 = Brace(f1[0][2:5], DOWN, buff=0.2, sharpness=1.5, color="#FC6255")',
    );
    expect(ce.issues.map((i) => i.code)).not.toContain('export-brace-sharpness');
    const sharpGl = braced('gl', {}, { sharpness: 1.5, color: '#FC6255' });
    const gl = generatePython(sharpGl.p, sharpGl.renders, options('gl'));
    const l = lines(gl.code);
    const built = l.indexOf('b1 = Brace(f1[2:5], DOWN, buff=0.2)');
    expect(built).toBeGreaterThan(-1);
    expect(l[built + 1]).toBe('b1.set_color("#FC6255")');
    expect(gl.issues.find((i) => i.code === 'export-brace-sharpness')).toMatchObject({
      severity: 'warning',
      path: ['formulas', 1, 'sharpness'],
    });
  });

  it('binds the glyph list of a brace built in the timeline only when the scene reads it', () => {
    const positional = options('ce', { indexing: 'positional' });
    const { p, renders, cb } = braced('ce');
    // Added whole, a label hung on it whole: nothing names its glyph.
    const whole = generatePython(p, renders, positional).code;
    expect(whole).toContain('b1 = Brace(VGroup(*f1_g[2:5]), DOWN, buff=0.2)');
    expect(whole).toContain('f2.next_to(b1, DOWN, buff=0.1)');
    expect(whole).not.toContain('b1_g');
    // A part transform does.
    const moved = {
      ...p,
      clips: p.clips.map((c) =>
        c.id === cb.id
          ? { ...c, actions: [createPartTransform(1, [0], { duration: 0.5, opacity: 0.2 })] }
          : c,
      ),
    };
    const l = lines(generatePython(moved, renders, positional).code);
    const built = l.indexOf('b1 = Brace(VGroup(*f1_g[2:5]), DOWN, buff=0.2)');
    expect(l[built + 1]).toBe('b1_g = _glyphs(b1, [');
    expect(l[built + 3]).toBe('])');
    expect(l.some((line) => line.includes('b1_g[0].animate'))).toBe(true);
  });

  it('reads no glyph list in the words of a mark of the Slides mode', () => {
    const { p, renders } = braced('ce');
    const text = 'Then b1_g[0] goes red, as f1_g did';
    const marked = {
      ...p,
      slides: { marks: [{ id: 'p_1', time: 2, kind: 'comment' as const, text }] },
    };
    const code = generatePython(marked, renders, options('ce', { indexing: 'positional' })).code;
    expect(code).toContain(`# NOTE (2.00 s): ${text}`);
    expect(code).not.toContain('b1_g = _glyphs');
  });

  it('leaves the positional helper out when the only list that needs it is never read', () => {
    // The brace keeps the snapshot of an earlier render: its glyph would be matched by position.
    const { p, renders, cb } = braced('ce');
    const stale = {
      ...p,
      formulas: p.formulas.map((f) =>
        f.kind === 'brace' ? { ...f, snapshot: { ...f.snapshot!, key: 'latex-earlier' } } : f,
      ),
    };
    const out = generatePython(stale, renders, options('ce'));
    expect(out.code).toContain('b1 = Brace(f1[0][2:5], DOWN, buff=0.2)');
    expect(out.usedPositionalHelper).toBe(false);
    expect(out.code).not.toContain('_glyphs');
    // Read by a part transform, the list stays and brings the helper with it.
    const read = {
      ...stale,
      clips: stale.clips.map((c) =>
        c.id === cb.id
          ? { ...c, actions: [createPartTransform(1, [0], { duration: 0.5, opacity: 0.2 })] }
          : c,
      ),
    };
    const kept = generatePython(read, renders, options('ce'));
    expect(kept.usedPositionalHelper).toBe(true);
    expect(kept.code).toContain('def _glyphs(tex, layout):');
    expect(kept.code).toContain('b1_g = _glyphs(b1, [');
  });

  it('writes a detached brace in the setup, as the brace of a line, moved and turned', () => {
    const { p, renders, cb } = braced('ce');
    const detached = {
      ...p,
      formulas: p.formulas.map((f) => (f.kind === 'brace' ? { ...f, width: 2.5 } : f)),
      clips: p.clips.map((c) =>
        c.id === cb.id
          ? {
              ...c,
              attach: null,
              initial: { ...c.initial, position: [3, -1] as [number, number], rotation: 45 },
            }
          : c,
      ),
    };
    const fresh = refreshLocalRenders(detached, renders);
    const code = generatePython(fresh.project, fresh.formulas, options('ce')).code;
    expect(code).toContain('b1 = Brace(Line(ORIGIN, 2.5 * RIGHT), DOWN, buff=0)');
    expect(code).toContain('b1.set_opacity(0.5)');
    expect(code).toContain('b1.move_to([3, -1, 0]).rotate(45 * DEGREES)');
    expect(code).not.toContain('b1 = Brace(f1');
  });

  it('puts a label at the tip where its clip starts, once the brace is built, at its gap', () => {
    /** The label f2 at the tip of b1 instead of below it, with `buff`; `early`: from 0.5 s, before
     * the brace's clip, at (0.5, −1); `detached`: the brace placed freely. */
    const tipped = (
      target: Target,
      buff: number | null = null,
      early = false,
      detached = false,
    ) => {
      const { p, renders, cb, c2 } = braced(target);
      const project = {
        ...p,
        clips: p.clips.map((c): Clip => {
          if (c.id === cb.id) return detached ? { ...c, attach: null } : c;
          if (c.id !== c2.id) return c;
          const label = { ...c, attach: createTipAttach(cb.id, buff) };
          if (!early) return label;
          return { ...label, start: 0.5, initial: { ...c.initial, position: [0.5, -1] } };
        }),
      };
      return lines(generatePython(project, renders, options(target)).code);
    };
    let l = tipped('ce');
    const built = l.indexOf('b1 = Brace(f1[0][2:5], DOWN, buff=0.2)');
    expect(built).toBeGreaterThan(-1);
    // Manim's gap for a brace label: get_tex's, written out (ManimGL's put_at_tip alone has 0.25).
    expect(l.indexOf('b1.put_at_tip(f2, buff=0.25)')).toBeGreaterThan(built);
    expect(l.some((x) => x.startsWith('f2.move_to'))).toBe(false);
    expect(tipped('gl')).toContain('b1.put_at_tip(f2, buff=0.1)');
    expect(tipped('gl', 0.4)).toContain('b1.put_at_tip(f2, buff=0.4)');
    // Before visibility starts the brace is constructed at its saved future initial placement.
    l = tipped('ce', null, true);
    expect(l).toContain('b1.put_at_tip(f2, buff=0.25)');
    expect(l.findIndex((x) => x.startsWith('b1 = Brace('))).toBeLessThan(
      l.indexOf('b1.put_at_tip(f2, buff=0.25)'),
    );
    // At the tip of a detached brace, built in the setup, it is put there any time.
    l = tipped('ce', null, true, true);
    expect(l).toContain('b1.put_at_tip(f2, buff=0.25)');
    expect(l.some((x) => x.startsWith('f2.move_to'))).toBe(false);
  });
});

describe('shapes (D71)', () => {
  /** f1 (7 glyphs) on track 1 from 0 s; a shape s1 of `fields` on `glyphs` of it from 1 s, `buff`
   * away. The shape is rendered, so that its snapshot is exact. */
  function shaped(
    target: Target,
    fields: Partial<ShapeFormula> = {},
    buff = 0.1,
    glyphs: number[] | 'all' = [2, 3, 4],
  ) {
    const p = project(target);
    p.tracks.push(createTrack('Track 3'));
    const f1 = formula(p, 'f1', 7);
    const s1 = createShapeFormula({ name: 's1', ...fields });
    p.formulas.push(s1);
    const c1 = clip(p, f1, 0, 0, 4);
    c1.initial.position = [1, 2];
    const cs = clip(p, s1, 1, 1, 4, { attach: createShapeAttach(c1.id, glyphs, buff) });
    const settled = refreshLocalRenders(p, NO_RENDERS);
    return { p: settled.project, renders: settled.formulas, c1, cs };
  }
  const lines = (code: string) => code.split('\n').map((l) => l.trim());
  const built = (
    target: Target,
    fields: Partial<ShapeFormula> = {},
    buff = 0.1,
    glyphs: number[] | 'all' = [2, 3, 4],
  ) => {
    const { p, renders } = shaped(target, fields, buff, glyphs);
    const { code, issues } = generatePython(p, renders, options(target));
    expect(hasErrors(issues)).toBe(false);
    return { code, line: lines(code).find((l) => l.startsWith('s1 = '))! };
  };

  it('builds each shape on its target where its clip starts, by its class in each library', () => {
    expect(built('ce').line).toBe(
      's1 = SurroundingRectangle(f1[0][2:5], buff=0.1, color="#FFFF00")',
    );
    expect(built('gl').line).toBe('s1 = SurroundingRectangle(f1[2:5], buff=0.1, color="#FFFF00")');
    expect(built('ce', {}, 0.1, 'all').line).toBe(
      's1 = SurroundingRectangle(f1, buff=0.1, color="#FFFF00")',
    );
    // Rounded corners: ManimCE's argument, ManimGL's method.
    expect(built('ce', { cornerRadius: 0.2 }, 0.3).line).toBe(
      's1 = SurroundingRectangle(f1[0][2:5], buff=0.3, color="#FFFF00", corner_radius=0.2)',
    );
    expect(built('gl', { cornerRadius: 0.2 }, 0.3).line).toBe(
      's1 = SurroundingRectangle(f1[2:5], buff=0.3, color="#FFFF00").round_corners(0.2)',
    );
    // The circle around: the helper, written when used.
    const circle = built('ce', { shape: 'circle' });
    expect(circle.line).toBe('s1 = _circle_around(f1[0][2:5], buff=0.1, color="#FC6255")');
    expect(circle.code).toContain('def _circle_around(mobject, buff=0.1, color=WHITE, **kwargs):');
    expect(built('ce').code).not.toContain('_circle_around');
    // An underline: ManimGL is told to keep a plain stroke and not to stretch.
    expect(built('ce', { shape: 'underline' }).line).toBe(
      's1 = Underline(f1[0][2:5], buff=0.1, color="#FFFFFF")',
    );
    expect(built('gl', { shape: 'underline' }).line).toBe(
      's1 = Underline(f1[2:5], buff=0.1, stroke_color="#FFFFFF", stroke_width=4, stretch_factor=1)',
    );
    // A cross: its stroke width always written in ManimGL (its default is tapered).
    expect(built('ce', { shape: 'cross' }, 0).line).toBe(
      's1 = Cross(f1[0][2:5], stroke_color="#FC6255")',
    );
    expect(built('gl', { shape: 'cross' }, 0).line).toBe(
      's1 = Cross(f1[2:5], stroke_color="#FC6255", stroke_width=6)',
    );
    // A cross line: one of the cross's lines, through the helper, written when used; a plain
    // line, whose width is always said (a cross line's own default is a cross's 6).
    const rising = built('ce', { shape: 'cross_line' }, 0);
    expect(rising.line).toBe('s1 = _cross_line(f1[0][2:5], color="#FC6255", stroke_width=6)');
    expect(rising.code).toContain('def _cross_line(mobject, rising=True, **kwargs):');
    expect(built('ce', { shape: 'cross' }, 0).code).not.toContain('_cross_line');
    expect(built('gl', { shape: 'cross_line', diagonal: 'ul_dr' }, 0).line).toBe(
      's1 = _cross_line(f1[2:5], rising=False, color="#FC6255", stroke_width=6)',
    );
    const thin = { fillOpacity: 0.5, strokeWidth: 2, strokeOpacity: 0.5 };
    expect(built('gl', { shape: 'cross_line', diagonal: 'dl_ur', style: thin }, 0).line).toBe(
      's1 = _cross_line(f1[2:5], color="#FC6255", stroke_width=2, stroke_opacity=0.5)',
    );
  });

  it('binds the glyph list of a shape built in the timeline only when the scene reads it', () => {
    const positional = options('ce', { indexing: 'positional' });
    const { p, renders, cs } = shaped('ce', { shape: 'cross' });
    const whole = generatePython(p, renders, positional).code;
    expect(whole).toContain('s1 = Cross(VGroup(*f1_g[2:5]), stroke_color="#FC6255")');
    expect(whole).not.toContain('s1_g');
    // A colour of its own on one of the two strokes names it, right after the constructor.
    const tinted = {
      ...p,
      clips: p.clips.map((c) =>
        c.id === cs.id ? { ...c, initial: { ...c.initial, glyphColors: { '1': '#58C4DD' } } } : c,
      ),
    };
    const l = lines(generatePython(tinted, renders, positional).code);
    const built = l.indexOf('s1 = Cross(VGroup(*f1_g[2:5]), stroke_color="#FC6255")');
    expect(l[built + 1]).toBe('s1_g = _glyphs(s1, [');
    expect(l).toContain('s1_g[1].set_color("#58C4DD")');
  });

  it('folds the style and the clip opacity into the constructor; nothing in the setup; the layer after', () => {
    const { p, renders, cs } = shaped('ce', {
      style: { fillOpacity: 0.5, strokeWidth: 2, strokeOpacity: 1 },
    });
    p.clips.find((c) => c.id === cs.id)!.initial.opacity = 0.5;
    const { code, issues } = generatePython(p, renders, options('ce'));
    expect(hasErrors(issues)).toBe(false);
    const l = lines(code);
    const built = l.indexOf(
      's1 = SurroundingRectangle(f1[0][2:5], buff=0.1, color="#FFFF00", stroke_width=2, fill_opacity=0.25, stroke_opacity=0.5)',
    );
    expect(built).toBeGreaterThan(-1);
    expect(l[built + 1]).toBe('s1.set_z_index(1)');
    expect(l.indexOf('self.add(s1)')).toBeGreaterThan(built);
    expect(code).not.toContain('set_opacity');
    expect(code).not.toContain('Rectangle(width');
    // A cross with an opacity: its lines take it after the constructor.
    const cross = shaped('gl', { shape: 'cross' }, 0);
    cross.p.clips.find((c) => c.id === cross.cs.id)!.initial.opacity = 0.8;
    expect(lines(generatePython(cross.p, cross.renders, options('gl')).code)).toContain(
      's1 = Cross(f1[2:5], stroke_color="#FC6255", stroke_width=6).set_stroke(opacity=0.8)',
    );
  });

  it('fades a shape by its fill and stroke, each from its own opacity, in tweens and part transforms', () => {
    // A rigid tween: the `.animate` chain sets the stroke's opacity (the box has no fill).
    const { p, renders, cs } = shaped('ce');
    const clip = p.clips.find((c) => c.id === cs.id)!;
    clip.actions = [createTween(1, 1, { position: [2, 2], opacity: 0.4 })];
    let code = generatePython(p, renders, options('ce')).code;
    expect(code).toContain('s1.animate.move_to([2, 2, 0]).set_stroke(opacity=0.4)');
    expect(code).not.toContain('set_opacity');
    // Turning and fading: `_Tween` over the shape wrapped as its one glyph, with the stroke pair.
    clip.actions = [createTween(1, 1, { rotation: 30, opacity: 0.4 })];
    code = generatePython(p, renders, options('ce')).code;
    expect(code).toContain('_Tween(VGroup(s1), (');
    expect(code).toContain(', stroke=(1, 0.4))');
    expect(code).not.toContain('opacity=(');
    expect(code).toContain(
      'def __init__(self, glyphs, start, end, colors=None, opacity=None, stroke=None, **kwargs):',
    );
    // A filled shape fades both; a cross's lines are the group's submobjects.
    const filled = shaped('gl', {
      shape: 'circle',
      style: { fillOpacity: 0.5, strokeWidth: 4, strokeOpacity: 1 },
    });
    filled.p.clips.find((c) => c.id === filled.cs.id)!.actions = [
      createTween(1, 1, { rotation: 30, opacity: 0.4 }),
    ];
    code = generatePython(filled.p, filled.renders, options('gl')).code;
    expect(code).toContain('_Tween(VGroup(s1), (');
    expect(code).toContain(', opacity=(0.5, 0.2), stroke=(1, 0.4))');
    const cross = shaped('ce', { shape: 'cross' }, 0);
    const cc = cross.p.clips.find((c) => c.id === cross.cs.id)!;
    cc.actions = [createTween(1, 1, { rotation: 30 })];
    code = generatePython(cross.p, cross.renders, options('ce')).code;
    expect(code).toContain('_Tween(s1, (');
    // A part transform on its first line: `s1[0]`, faded by its stroke.
    cc.actions = [createPartTransform(1, [0], { shift: [0, 1], opacity: 0.5 })];
    code = generatePython(cross.p, cross.renders, options('ce')).code;
    expect(code).toContain('s1[0].animate.shift(UP).set_stroke(opacity=0.5)');
  });
});

describe('a brace or a shape over glyphs of several clips (D117)', () => {
  /** f1 (7 glyphs) and f2 (3) on tracks 1 and 2 from 0 s; from 1 s, a brace b1 on glyphs 2–4 of
   * the first and glyph 0 of the second, and a shape s1 on the whole second and glyphs 0 and 6
   * of the first; a label f3 beside the brace from 2 s. Rendered, so the snapshots are exact. */
  function spanning(target: Target, shape: Partial<ShapeFormula> = {}) {
    const p = project(target);
    p.tracks.push(createTrack('Track 3'), createTrack('Track 4'), createTrack('Track 5'));
    const f1 = formula(p, 'f1', 7);
    const f2 = formula(p, 'f2', 3);
    const b1 = createBraceFormula({ name: 'b1' });
    const s1 = createShapeFormula({ name: 's1', ...shape });
    p.formulas.push(b1, s1);
    const f3 = formula(p, 'f3', 2);
    const c1 = clip(p, f1, 0, 0, 4);
    c1.initial.position = [-2, 1];
    const c2 = clip(p, f2, 1, 0, 4);
    c2.initial.position = [2, -1];
    const cb = clip(p, b1, 2, 1, 4, {
      attach: createBraceAttach(c1.id, [2, 3, 4], { also: [{ clipId: c2.id, glyphs: [0] }] }),
    });
    const cs = clip(p, s1, 3, 1, 4, {
      attach: createShapeAttach(c2.id, 'all', 0.1, [{ clipId: c1.id, glyphs: [0, 6] }]),
    });
    clip(p, f3, 4, 2, 4, { attach: createAttach(cb.id, 'all', { side: 'down', buff: 0.1 }) });
    const settled = refreshLocalRenders(p, NO_RENDERS);
    return { p: settled.project, renders: settled.formulas, c1, c2, cb, cs };
  }
  const lines = (code: string) => code.split('\n').map((l) => l.trim());
  const generated = (target: Target, extra: Partial<CodegenOptions> = {}) => {
    const { p, renders } = spanning(target);
    const out = generatePython(p, renders, options(target, extra));
    expect(hasErrors(out.issues)).toBe(false);
    return lines(out.code);
  };

  it('builds them on a group of the glyphs of each clip, in the order of the attachment', () => {
    const ce = generated('ce');
    const brace = ce.indexOf('b1 = Brace(VGroup(f1[0][2:5], f2[0][0]), DOWN, buff=0.2)');
    expect(brace).toBeGreaterThan(-1);
    expect(ce).toContain(
      's1 = SurroundingRectangle(VGroup(f2, VGroup(f1[0][0], f1[0][6])), buff=0.1, color="#FFFF00")',
    );
    // What hangs on the brace is placed once it is built.
    expect(ce.indexOf('f3.next_to(b1, DOWN, buff=0.1)')).toBeGreaterThan(brace);
    const gl = generated('gl');
    expect(gl).toContain('b1 = Brace(VGroup(f1[2:5], f2[0]), DOWN, buff=0.2)');
    expect(gl).toContain(
      's1 = SurroundingRectangle(VGroup(f2, VGroup(f1[0], f1[6])), buff=0.1, color="#FFFF00")',
    );
  });

  it('names every clip it is built on, in the comment of its setup', () => {
    const commented = generated('ce', { comments: true });
    expect(commented).toContain('# b1: brace, built on f1 and f2 where its clip starts');
    expect(commented).toContain('# s1: box, built on f2 and f1 where its clip starts');
  });

  it('groups the glyphs of lists built at run time, clip by clip', () => {
    const positional = generated('ce', { indexing: 'positional' });
    expect(positional).toContain('b1 = Brace(VGroup(VGroup(*f1_g[2:5]), f2_g[0]), DOWN, buff=0.2)');
  });

  it('prepares one of its clips that starts after it, as it does a lone target', () => {
    const { p, renders, c2 } = spanning('ce');
    const late = { ...p, clips: p.clips.map((c) => (c.id === c2.id ? { ...c, start: 2 } : c)) };
    const out = generatePython(late, renders, options('ce'));
    const l = lines(out.code);
    // The brace is built at 1 s on glyphs of f2, which comes on screen at 2 s: f2 is made and
    // placed before, as a target that starts after what hangs on it always is.
    const made = l.findIndex((line) => line.startsWith('f2 = '));
    const built = l.findIndex((line) => line.startsWith('b1 = '));
    expect(made).toBeGreaterThan(-1);
    expect(built).toBeGreaterThan(made);
    expect(l.slice(made, built).some((line) => line.startsWith('f2.move_to('))).toBe(true);
  });

  it('is placed by what the project holds when one of its clips cannot be named', () => {
    const { p, renders, cb } = spanning('ce');
    // A glyph the second formula does not have: nothing of it to group.
    const broken = {
      ...p,
      clips: p.clips.map((c) =>
        c.id === cb.id
          ? {
              ...c,
              attach: createBraceAttach((cb.attach as BraceAttach).clipId, [2, 3, 4], {
                also: [{ clipId: 'gone', glyphs: 'all' as const }],
              }),
            }
          : c,
      ),
    };
    const l = lines(generatePython(broken, renders, options('ce')).code);
    expect(l.some((line) => line.startsWith('b1 = Brace(VGroup('))).toBe(false);
    expect(l.some((line) => line.startsWith('b1 = Brace(Line('))).toBe(true);
  });
});

describe('emphasis blocks (D73)', () => {
  /** f1 (7 glyphs) at [1, 2] on the second track (layer 0) over [0, 6] s, with one Emphasis
   * block of `effect` on `glyphs` from 1 s for 1 s; `track` 0 puts it on the front track. */
  function emphasised(
    target: Target,
    effect: Parameters<typeof createEmphasis>[1],
    fields: Parameters<typeof createEmphasis>[3] = {},
    glyphs: number[] | 'all' = [2, 3, 4],
    track = 1,
  ) {
    const p = project(target);
    const f1 = formula(p, 'f1', 7);
    const c1 = clip(p, f1, track, 0, 6);
    c1.initial.position = [1, 2];
    c1.actions.push(createEmphasis(1, effect, glyphs, { duration: 1, ...fields }));
    const { code, issues } = generatePython(p, NO_RENDERS, options(target));
    expect(hasErrors(issues)).toBe(false);
    return { p, c1, code, lines: code.split('\n').map((l) => l.trim()) };
  }
  /** The first play, its arguments joined back when the generator wrapped them. */
  const play = (lines: string[]) => {
    const i = lines.findIndex((l) => l.startsWith('self.play('));
    if (lines[i] !== 'self.play(') return lines[i]!;
    const args: string[] = [];
    for (let k = i + 1; lines[k] !== ')'; k++) args.push(lines[k]!.replace(/,$/, ''));
    return `self.play(${args.join(', ')})`;
  };

  it("plays each effect on the group of its glyphs, with Manim's defaults left unwritten", () => {
    expect(play(emphasised('ce', 'indicate').lines)).toBe(
      'self.play(Indicate(f1[0][2:5]), run_time=1)',
    );
    expect(play(emphasised('gl', 'indicate').lines)).toBe(
      'self.play(Indicate(f1[2:5]), run_time=1)',
    );
    expect(play(emphasised('ce', 'indicate', {}, 'all').lines)).toBe(
      'self.play(Indicate(f1), run_time=1)',
    );
    expect(
      play(
        emphasised('ce', 'indicate', {
          scale: 1.5,
          color: '#FC6255',
          easing: 'there_and_back_with_pause',
        }).lines,
      ),
    ).toBe(
      'self.play(Indicate(f1[0][2:5], scale_factor=1.5, color="#FC6255", rate_func=there_and_back_with_pause), run_time=1)',
    );
    // The helpers, written when used.
    const wiggle = emphasised('ce', 'wiggle');
    expect(play(wiggle.lines)).toBe('self.play(_Wiggle(f1[0][2:5]), run_time=1)');
    expect(wiggle.code).toContain('class _Wiggle(Animation):');
    expect(wiggle.code).toContain('self.pivot = np.array(self.mobject.get_center())');
    expect(emphasised('ce', 'indicate').code).not.toContain('class _Wiggle');
    expect(
      play(
        emphasised('gl', 'wiggle', { scale: 1.3, angle: 10, wiggles: 3, easing: 'linear' }).lines,
      ),
    ).toBe(
      'self.play(_Wiggle(f1[2:5], scale_value=1.3, rotation_angle=10 * DEGREES, n_wiggles=3, rate_func=linear), run_time=1)',
    );
    const frame = emphasised('gl', 'circumscribe');
    expect(play(frame.lines)).toBe('self.play(_Circumscribe(f1[2:5]), run_time=1)');
    expect(frame.code).toContain('class _Circumscribe(ShowPassingFlash):');
    expect(
      play(
        emphasised('ce', 'circumscribe', {
          buff: 0.25,
          color: '#58C4DD',
          strokeWidth: 2,
          timeWidth: 1,
          easing: 'linear',
        }).lines,
      ),
    ).toBe(
      'self.play(_Circumscribe(f1[0][2:5], buff=0.25, color="#58C4DD", stroke_width=2, time_width=1, rate_func=linear), run_time=1)',
    );
    // Each library's own Flash and FocusOn, aimed at the centre of the group as a point.
    expect(play(emphasised('ce', 'flash').lines)).toBe(
      'self.play(Flash(f1[0][2:5].get_center()), run_time=1)',
    );
    expect(play(emphasised('gl', 'flash', { color: '#83C167' }, 'all').lines)).toBe(
      'self.play(Flash(f1.get_center(), color="#83C167"), run_time=1)',
    );
    const focus = emphasised('ce', 'focus_on', { opacity: 0.5, color: '#FC6255' });
    const made = focus.lines.indexOf(
      'f1_focus = FocusOn(f1[0][2:5].get_center(), color="#FC6255", opacity=0.5)',
    );
    expect(made).toBeGreaterThan(-1);
    expect(focus.lines[made + 1]).toBe('f1_focus.mobject.set_z_index(2)');
    expect(focus.lines[made + 2]).toBe('self.play(f1_focus, run_time=1)');
  });

  it('gives the frame and the lines of a block on a front track their layer', () => {
    expect(play(emphasised('ce', 'circumscribe', {}, [2, 3, 4], 0).lines)).toBe(
      'self.play(_Circumscribe(f1[0][2:5], z_index=1), run_time=1)',
    );
    const flash = emphasised('gl', 'flash', {}, [2, 3, 4], 0);
    const made = flash.lines.indexOf('f1_flash = Flash(f1[2:5].get_center())');
    expect(made).toBeGreaterThan(-1);
    expect(flash.lines[made + 1]).toBe('f1_flash.lines.set_z_index(1)');
    expect(flash.lines[made + 2]).toBe('self.play(f1_flash, run_time=1)');
  });

  it('plays in slices under one name and leaves the glyphs as they were', () => {
    const p = project('ce');
    const f1 = formula(p, 'f1', 7);
    const f2 = formula(p, 'f2', 3);
    const c1 = clip(p, f1, 1, 0, 6);
    c1.actions.push(createEmphasis(1, 'focus_on', [2, 3, 4], { duration: 1 }));
    c1.actions.push(createEmphasis(3, 'indicate', [0], { duration: 1 }));
    const c2 = clip(p, f2, 0, 0, 6);
    // A tween of the other clip cuts both blocks in two plays.
    c2.actions.push(
      createTween(1.5, 1, { position: [1, 0] }),
      createTween(3.5, 1, { rotation: 10 }),
    );
    const { code, issues } = generatePython(p, NO_RENDERS, options('ce'));
    expect(hasErrors(issues)).toBe(false);
    const l = code.split('\n').map((x) => x.trim());
    expect(l).toContain('f1_focus = FocusOn(f1[0][2:5].get_center())');
    expect(l.filter((x) => x.startsWith('f1_focus'))).toHaveLength(2); // made once, its layer
    expect(code).toMatch(/_Part\(f1_focus, 0, /);
    expect(code).toMatch(/_Part\(f1_focus, .*, 1\)/);
    expect(l).toContain('f1_indicate = Indicate(f1[0][0])');
    expect(code).toMatch(/_Part\(f1_indicate, 0, /);
    // Nothing of the glyphs changes afterwards.
    expect(code).not.toContain('set_color');
    expect(code).not.toContain('set_opacity');
    expect(code).not.toContain('_pivot');
  });

  it('plays nothing for glyphs that are not on screen', () => {
    const p = project('ce');
    const f1 = formula(p, 'f1', 7, { hiddenGlyphs: [5, 6] });
    const c1 = clip(p, f1, 1, 0, 6);
    c1.actions.push(createEmphasis(1, 'indicate', [5, 6], { duration: 1 }));
    const { code } = generatePython(p, NO_RENDERS, options('ce'));
    expect(code).not.toContain('Indicate');
    expect(code).toContain('self.wait(');
  });
});

describe('a relation window the timeline left starting before 0 s (audit A8-01)', () => {
  /** "a" over [10, 14) and "b" over [0, 4): the window of their relation is out of place — the
   * source is elsewhere — and its offset says it starts 0.067 s before its target, and the scene,
   * does. */
  function windowBeforeZero(target: Target): Project {
    const p = project(target);
    const a = formula(p, 'a', 3);
    const b = formula(p, 'b', 3);
    const ca = clip(p, a, 0, 10, 14);
    const cb = clip(p, b, 1, 0, 4);
    p.relations.push(
      createRelation(ca.id, cb.id, {
        offset: -0.066667,
        duration: 1,
        pairs: [{ from: [0], to: [1], style: null }],
      }),
    );
    return p;
  }

  it.each(['ce', 'gl'] as const)('is written, not thrown at: the scene is whole (%s)', (target) => {
    const p = windowBeforeZero(target);
    expect(validateProject(p).map((issue) => issue.code)).toContain('relation-window');
    const { code, issues } = generatePython(p, NO_RENDERS, options(target));
    expect(code).toContain('class Demo(Scene):');
    expect(totalFrames(code, target, 30)).toBe(14 * 30);
    expect(issues.map((issue) => issue.code)).toContain('export-snapping');
  });
});
