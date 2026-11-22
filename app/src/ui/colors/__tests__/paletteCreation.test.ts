// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { renderRequestFor, resolveFormula, toSnapshot } from '../../../engine';
import { createMockEngine } from '../../../test/mockEngine';
import { generatePython } from '../../../export/codegen';
import {
  createClip,
  createEmptyProject,
  createFormula,
  defaultIntro,
  defaultOutro,
  SHAPE_STYLES,
  TAG_COLORS,
} from '../../../model';
import { loadProject, useProjectStore, useUiStore } from '../../../store';
import { addBrace, addBraceLabel } from '../../animations/braceActions';
import { addShape } from '../../animations/shapeActions';
import {
  createFormulaFromTemplate,
  createNewFormula,
  duplicateFormula,
} from '../../creator/formulaActions';
import { useFormulaEditor } from '../../creator/formulaEditorStore';
import { createEditorFormula } from '../../creator/newFormula';
import { defaultPreferences, usePreferences } from '../../preferences';
import { createNewEditorProject } from '../../project/newEditorProject';
import { usePaletteStore } from '../paletteStore';
import { installTestPalette, testPaletteSource } from './paletteFixtures';

const project = () => useProjectStore.getState().project;
const scale = { math: '3/2', tex: '3/4' };

beforeEach(() => {
  usePaletteStore.setState(usePaletteStore.getInitialState(), true);
  usePreferences.setState({ ...defaultPreferences(), standardScale: scale });
  loadProject(createEmptyProject());
  useUiStore.setState({ selection: { kind: 'none' }, time: 2, playing: false });
});

afterEach(() => {
  loadProject(createEmptyProject());
  usePreferences.setState(defaultPreferences());
  usePaletteStore.setState(usePaletteStore.getInitialState(), true);
  useFormulaEditor.getState().close();
});

function targetClip() {
  const p = createEmptyProject();
  const formula = createFormula({ source: 'a+b', color: '#135790' });
  const clip = createClip(formula.id, p.tracks[0]!.id, 0, 8, {
    intro: defaultIntro('write'),
    outro: defaultOutro('none'),
  });
  p.formulas.push(formula);
  p.clips.push(clip);
  loadProject(p);
  return clip;
}

function formulaForClip(id: string | null) {
  const clip = project().clips.find((item) => item.id === id);
  const formula = project().formulas.find((item) => item.id === clip?.formulaId);
  if (!formula) throw new Error('Expected the newly created object and clip.');
  return formula;
}

describe('palette creation defaults', () => {
  it('keeps original object colors when a saved palette has not been activated', () => {
    installTestPalette(false);
    for (const kind of ['math', 'tex', 'brace', 'shape'] as const) createNewFormula(kind);
    expect(project().formulas.map((formula) => formula.color)).toEqual([
      '#FFFFFF',
      '#FFFFFF',
      '#FFFFFF',
      '#FFFF00',
    ]);
    expect(project().formulas.map((formula) => formula.fontSize)).toEqual([72, 36, 48, 48]);
    const circle = createEditorFormula('shape', [], scale, { shape: 'circle' });
    const underline = createEditorFormula('shape', [], scale, { shape: 'underline' });
    expect(circle.color).toBe('#FC6255');
    expect(underline.color).toBe('#FFFFFF');
  });

  it('colors ordinary math/text and fresh source templates without changing scale or tags', () => {
    const { colors } = installTestPalette().source;
    createNewFormula('math');
    createNewFormula('tex');
    const latex = '\\textcolor{red}{x}+y';
    createFormulaFromTemplate({ name: 'Authored LaTeX', latex, packages: ['xcolor'] });
    expect(project().formulas.map((formula) => formula.color)).toEqual([
      colors.formula,
      colors.text,
      colors.formula,
    ]);
    expect(project().formulas.map((formula) => formula.fontSize)).toEqual([72, 36, 72]);
    expect(project().formulas.map((formula) => formula.tag.color)).toEqual(TAG_COLORS.slice(0, 3));
    expect(project().formulas[2]).toMatchObject({
      source: latex,
      packages: ['xcolor'],
      glyphColors: {},
    });
    expect(createFormula().color).toBe('#FFFFFF');
  });

  it('honors explicit authored fields before palette defaults, including shape style and glyph colors', () => {
    const { colors } = installTestPalette().source;
    const fields = {
      shape: 'circle' as const,
      color: '#123456',
      fontSize: 60,
      glyphColors: { '0': '#654321' },
      tag: { color: '#778899', icon: 'x' },
      style: { fillOpacity: 0.22, strokeWidth: 8, strokeOpacity: 0.4 },
    };
    const shape = createEditorFormula('shape', [], scale, fields, colors);
    expect(shape).toMatchObject(fields);
    expect(createEditorFormula('shape', [], scale, { shape: 'circle' }, colors).color).toBe(
      colors.circle,
    );
  });

  it('copies existing authored objects without recoloring or rescaling them', () => {
    const source = createFormula({
      name: 'authored',
      source: 'a+b',
      color: '#135790',
      fontSize: 57,
      glyphColors: { '1': '#246800' },
      tag: { color: '#ABCDEF', icon: 'A' },
    });
    const p = createEmptyProject();
    p.formulas.push(source);
    loadProject(p);
    installTestPalette();
    const id = duplicateFormula(source.id);
    expect(project().formulas[0]).toEqual(source);
    expect(project().formulas[1]).toEqual({ ...source, id, name: 'authored2' });
  });

  it('passes the same role defaults to braces and independent math/text labels', () => {
    const { colors } = installTestPalette().source;
    const target = targetClip();
    const braceId = addBrace(target.id, 'all', 0);
    const mathId = addBraceLabel(braceId!, 'math');
    const textId = addBraceLabel(braceId!, 'tex');
    expect(formulaForClip(braceId)).toMatchObject({
      kind: 'brace',
      color: colors.muted,
      fontSize: 48,
    });
    expect(formulaForClip(mathId)).toMatchObject({
      kind: 'math',
      color: colors.formula,
      fontSize: 72,
    });
    expect(formulaForClip(textId)).toMatchObject({ kind: 'tex', color: colors.text, fontSize: 36 });
    expect(project().formulas[0]!.color).toBe('#135790');
    expect(project().clips.every((clip) => clip.initial.color === null)).toBe(true);
  });

  it('colors all shape presets while preserving their geometry and highlight style', () => {
    const { colors } = installTestPalette().source;
    const target = targetClip();
    for (const [choice, color] of [
      ['box', colors.rectangle],
      ['circle', colors.circle],
      ['underline', colors.rectangle],
      ['cross', colors.arrow],
      ['highlight', colors.rectangle],
    ] as const) {
      const id = addShape(target.id, 'all', choice);
      const shape = formulaForClip(id);
      expect(shape).toMatchObject({
        kind: 'shape',
        shape: choice === 'highlight' ? 'box' : choice,
        color,
        fontSize: 48,
        style:
          choice === 'highlight'
            ? { fillOpacity: 0.3, strokeWidth: 0, strokeOpacity: 0 }
            : SHAPE_STYLES[choice],
      });
      expect(project().clips.find((clip) => clip.id === id)?.initial.color).toBeNull();
    }
  });

  it('snapshots the active color once per creation and never recolors earlier content', () => {
    const { colors } = installTestPalette().source;
    createNewFormula();
    const old = project().formulas[0];
    installTestPalette(true, testPaletteSource({ formula: '#112233' }));
    expect(project().formulas[0]).toBe(old);
    createNewFormula();
    expect(project().formulas.map((formula) => formula.color)).toEqual([colors.formula, '#112233']);
  });

  it('exports selected colors as literal hex for both Manim targets without palette metadata', async () => {
    const { colors } = installTestPalette().source;
    const p = createNewEditorProject();
    const formula = createEditorFormula(
      'math',
      [],
      scale,
      { name: 'expression', source: 'x' },
      colors,
    );
    p.formulas.push(formula);
    p.clips.push(createClip(formula.id, p.tracks[0]!.id, 0, 4));
    for (const target of ['ce', 'gl'] as const) {
      p.meta.target = target;
      const rendered = await createMockEngine().render(renderRequestFor(formula, p.meta, 'auto'));
      if (!rendered.ok) throw new Error(rendered.error.message);
      formula.snapshot = toSnapshot(rendered.render);
      const renders = new Map([[formula.id, resolveFormula(formula, rendered.render)]]);
      const { code } = generatePython(p, renders, {
        target,
        sceneName: 'ThemedScene',
        indexing: 'auto',
        comments: false,
      });
      expect(code).toContain(colors.background);
      expect(code).toContain(colors.formula);
      expect(code).not.toMatch(/manim-palette|PALETTE|preference_palette|fillOpacity|fontScale/);
    }
  });
});
