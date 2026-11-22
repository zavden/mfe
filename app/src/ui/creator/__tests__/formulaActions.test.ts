import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  packagesOf,
  createAttach,
  createClip,
  createEmptyProject,
  createFormula,
  createLineFormula,
  createRelation,
  createShapeFormula,
  createTexFormula,
  createTextFormula,
  createTween,
  defaultIntro,
  defaultOutro,
  takesIntro,
  validateProject,
  type Formula,
  type FormulaId,
  type IntroSpec,
  type LineKind,
} from '../../../model';
import { usePreferences } from '../../preferences';
import type { ResolvedFormula } from '../../../engine';
import { loadProject, history, useProjectStore, useRenderStore, useUiStore } from '../../../store';
import { DELETE_HOLD_MS, useDialogStore } from '../../project/dialogStore';
import { useNoticeStore } from '../../project/noticeStore';
import {
  addToTimeline,
  applyFormulaSource,
  applyStandardScale,
  assignGlyphColors,
  clearAllGlyphColors,
  createFormulaFromTemplate,
  defaultIntroLabel,
  effectiveIntro,
  setFormulaIntro,
  setFormulaIntroDuration,
  createNewFormula,
  deleteFormula,
  deleteFormulas,
  describeUsage,
  duplicateFormula,
  duplicateName,
  formulaCopies,
  formulaNameFrom,
  insertFormulaCopies,
  formulaUsage,
  patchFormula,
  renameFormula,
  setGlyphColors,
  setGlyphColorsOf,
  setGlyphsHidden,
  setGlyphsHiddenOf,
  setScaleOf,
  validateFormulaName,
} from '../formulaActions';

const project = () => useProjectStore.getState().project;
const f = (name: string) => createFormula({ name });

beforeEach(() => {
  loadProject(createEmptyProject());
  useUiStore.getState().select({ kind: 'none' });
  useDialogStore.setState({ queue: [] });
});

describe('formula names', () => {
  const formulas: Formula[] = [f('f1'), f('energy')];

  it('accepts identifiers and rejects everything that is not a Python variable', () => {
    expect(validateFormulaName('f2', formulas, null)).toBeNull();
    expect(validateFormulaName('_x', formulas, null)).toBeNull();
    expect(validateFormulaName('énergie', formulas, null)).toBeNull();
    expect(validateFormulaName('', formulas, null)).toMatch(/empty/);
    expect(validateFormulaName('  ', formulas, null)).toMatch(/empty/);
    // "_" may come first too: the message names the one rule, a digit first.
    expect(validateFormulaName('1abc', formulas, null)).toBe(
      'Use letters, digits and "_", not starting with a digit: the name becomes a Python variable.',
    );
    expect(validateFormulaName('a b', formulas, null)).toMatch(/Python variable/);
    expect(validateFormulaName('a+b', formulas, null)).toMatch(/Python variable/);
    expect(validateFormulaName('lambda', formulas, null)).toMatch(/keyword/);
    expect(validateFormulaName(' f3', formulas, null)).toMatch(/spaces/);
  });

  it('rejects duplicates, but not the formula itself', () => {
    expect(validateFormulaName('f1', formulas, null)).toMatch(/already/);
    expect(validateFormulaName('f1', formulas, formulas[0]!.id)).toBeNull();
    expect(validateFormulaName('f1', formulas, formulas[1]!.id)).toMatch(/already/);
  });

  it('generates names that validateProject accepts as unique', () => {
    expect(duplicateName('f1', [f('f1')])).toBe('f2');
    expect(duplicateName('f1', [f('f1'), f('f2')])).toBe('f3');
    expect(duplicateName('energy', [f('energy')])).toBe('energy2');
    expect(duplicateName('a9', [f('a9')])).toBe('a10');
    expect(duplicateName('f007', [f('f007')])).toBe('f008'); // the width is kept
    expect(duplicateName('f99', [f('f99'), f('f100')])).toBe('f101');
  });

  it('numbers a duplicate beyond 2^53, where a JavaScript number stops counting', () => {
    const big = 'f9007199254740992';
    expect(duplicateName(big, [f(big)])).toBe('f9007199254740993');
    expect(duplicateName(big, [f(big), f('f9007199254740993')])).toBe('f9007199254740994');
  });
});

describe('creating, renaming, duplicating', () => {
  it('creates an empty formula with a unique name and round-robin tag colour, and selects it', () => {
    const a = createNewFormula();
    const b = createNewFormula();
    const formulas = project().formulas;
    expect(formulas.map((x) => x.name)).toEqual(['f1', 'f2']);
    expect(formulas[0]!.tag.color).not.toBe(formulas[1]!.tag.color);
    expect(formulas[0]!.source).toBe('');
    expect(useUiStore.getState().selection).toEqual({ kind: 'formula', id: b });
    expect(a).not.toBe(b);
    history.undo();
    expect(project().formulas).toHaveLength(1);
  });

  it('names a formula after a title, as a free Python identifier', () => {
    const taken = [f('square_of_a_sum'), f('square_of_a_sum_2')];
    expect(formulaNameFrom("Euler's formula", [])).toBe('eulers_formula');
    expect(formulaNameFrom('Cauchy-Schwarz inequality', [])).toBe('cauchy_schwarz_inequality');
    expect(formulaNameFrom('Maxwell, Gauss’s law', [])).toBe('maxwell_gausss_law');
    expect(formulaNameFrom('Théorème de Pythagore', [])).toBe('theoreme_de_pythagore');
    expect(formulaNameFrom('2x2 determinant', [])).toBe('f_2x2_determinant');
    expect(formulaNameFrom('Lambda', [])).toBe('lambda_');
    expect(formulaNameFrom('Square of a sum', taken)).toBe('square_of_a_sum_3');
    expect(formulaNameFrom('∑ ∫', [f('f1')])).toBe('f2');
    for (const title of ["Euler's formula", '2x2 determinant', 'Lambda', 'Square of a sum']) {
      expect(validateFormulaName(formulaNameFrom(title, taken), taken, null)).toBeNull();
    }
  });

  it('creates a formula from a template, selects it, and undoes it in one step', () => {
    createNewFormula();
    const template = {
      name: 'Chain rule',
      latex: "(f\\circ g)'=(f'\\circ g)\\,g'",
      packages: ['bm'],
    };
    const id = createFormulaFromTemplate(template);
    const made = project().formulas[1]!;
    expect(made).toMatchObject({
      id,
      name: 'chain_rule',
      source: template.latex,
      packages: ['bm'],
    });
    expect(packagesOf(made)).not.toBe(template.packages);
    expect(made.tag.color).not.toBe(project().formulas[0]!.tag.color);
    expect(useUiStore.getState().selection).toEqual({ kind: 'formula', id });
    createFormulaFromTemplate(template); // the same template again
    expect(project().formulas.map((x) => x.name)).toEqual(['f1', 'chain_rule', 'chain_rule_2']);
    history.undo();
    history.undo();
    expect(project().formulas.map((x) => x.name)).toEqual(['f1']);
    // Under the name given with it, when there is one.
    createFormulaFromTemplate(template, 'chain');
    expect(project().formulas.map((x) => x.name)).toEqual(['f1', 'chain']);
  });

  it('renames within the naming rules, one undo step each', () => {
    const id = createNewFormula();
    createNewFormula();
    expect(renameFormula(id, 'f2')).toMatch(/already/);
    expect(renameFormula(id, 'my formula')).toMatch(/Python/);
    expect(renameFormula(id, 'energy')).toBeNull();
    expect(project().formulas[0]!.name).toBe('energy');
    history.undo();
    expect(project().formulas[0]!.name).toBe('f1');
  });

  it('duplicates with a new id and name, copying snapshot and glyph colours', () => {
    const id = createNewFormula();
    useProjectStore.getState().update((d) => {
      const x = d.formulas[0]!;
      x.source = 'a+b';
      x.glyphColors = { '1': '#FF0000' };
      x.snapshot = {
        backend: 'latex',
        key: 'k',
        glyphs: [{ label: 'a', center: [0, 0], size: [1, 1] }],
      };
    });
    const copyId = duplicateFormula(id)!;
    const [original, copy] = project().formulas;
    expect(copy!.id).toBe(copyId);
    expect(copy!.id).not.toBe(original!.id);
    expect(copy!.name).toBe('f2');
    expect(copy).toEqual({ ...original, id: copyId, name: 'f2' });
    // A deep copy: editing one does not touch the other.
    setGlyphColors(copyId, [1], '#00FF00');
    expect(project().formulas[0]!.glyphColors).toEqual({ '1': '#FF0000' });
    expect(project().formulas[1]!.snapshot).not.toBe(project().formulas[0]!.snapshot);
    expect(validateProject(project()).filter((i) => i.code === 'duplicate-name')).toEqual([]);
    expect(useUiStore.getState().selection).toEqual({ kind: 'formula', id: copyId });
    expect(duplicateFormula('missing')).toBeNull();
  });

  it('starts a copy with the render of its original, before the copy reaches the project', () => {
    const id = createNewFormula();
    const original = project().formulas[0]!;
    const resolved = {
      formula: original,
      render: { key: 'k', glyphs: [] },
      canonToRender: [],
      confidence: 1,
    } as unknown as ResolvedFormula;
    useRenderStore.getState().setEntry(id, { status: 'ok', resolved, error: null });
    // What a drawing hears when the copy comes is the copy with its render.
    let heard: unknown = 'nothing';
    const stop = useProjectStore.subscribe((state) => {
      const copy = state.project.formulas[1];
      heard = copy && useRenderStore.getState().resolved.get(copy.id)?.formula;
    });
    const copyId = duplicateFormula(id)!;
    stop();
    expect(heard).toBe(project().formulas[1]);
    expect(useRenderStore.getState().entries[copyId]).toEqual({
      status: 'ok',
      resolved: { ...resolved, formula: project().formulas[1] },
      error: null,
    });
    useRenderStore.getState().retain([]);
  });

  it('copies formulas as Duplicate does, into the list and the groups after their originals', () => {
    const [a, b, c] = ['f1', 'f2', 'x7'].map((name) => ({ ...f(name), id: name }));
    const copies = formulaCopies([a!, b!, c!], ['f2', 'f1', 'nope']);
    expect([...copies.keys()]).toEqual(['f1', 'f2']);
    // Named one after the other: the copy of f2 does not take the name of the copy of f1.
    expect([...copies.values()].map((copy) => copy.name)).toEqual(['f3', 'f4']);
    expect(copies.get('f1')).toEqual({ ...a, id: copies.get('f1')!.id, name: 'f3' });
    const draft = createEmptyProject();
    draft.formulas = [a!, b!, c!];
    draft.formulaGroups = [{ id: 'g', name: 'grp1', formulaIds: ['x7', 'f2'] }];
    insertFormulaCopies(draft, copies);
    const [copyA, copyB] = [copies.get('f1')!.id, copies.get('f2')!.id];
    expect(draft.formulas.map((formula) => formula.id)).toEqual(['f1', copyA, 'f2', copyB, 'x7']);
    expect(draft.formulaGroups[0]!.formulaIds).toEqual(['x7', 'f2', copyB]);
  });
});

describe('glyph colours and fields', () => {
  it('sets, clears and clears all, each as one undo step', () => {
    const id = createNewFormula();
    setGlyphColors(id, [0, 2], '#FF0000');
    expect(project().formulas[0]!.glyphColors).toEqual({ '0': '#FF0000', '2': '#FF0000' });
    setGlyphColors(id, [0], null);
    expect(project().formulas[0]!.glyphColors).toEqual({ '2': '#FF0000' });
    setGlyphColors(id, [], '#00FF00'); // nothing selected: no step
    clearAllGlyphColors(id);
    expect(project().formulas[0]!.glyphColors).toEqual({});
    history.undo();
    expect(project().formulas[0]!.glyphColors).toEqual({ '2': '#FF0000' });
  });

  it('gives glyphs each a colour of its own, or none, as one undo step', () => {
    const id = createNewFormula();
    const colors = () => project().formulas[0]!.glyphColors;
    const steps = () => useProjectStore.temporal.getState().pastStates.length;
    setGlyphColors(id, [1, 2], '#FF0000');
    const before = steps();
    expect(
      assignGlyphColors(
        id,
        new Map([
          [0, '#00FF00'],
          [1, null],
          [2, '#0000FF'],
          [3, null],
        ]),
      ),
    ).toBe(true);
    expect(colors()).toEqual({ '0': '#00FF00', '2': '#0000FF' });
    expect(steps()).toBe(before + 1);
    // What is already so is no change, and no step.
    expect(assignGlyphColors(id, new Map([[0, '#00FF00']]))).toBe(false);
    expect(assignGlyphColors(id, new Map([[5, null]]))).toBe(false);
    expect(assignGlyphColors('f_missing', new Map([[0, '#00FF00']]))).toBe(false);
    expect(steps()).toBe(before + 1);
    history.undo();
    expect(colors()).toEqual({ '1': '#FF0000', '2': '#FF0000' });
  });

  it('leaves the glyphs of a text used on a locked track as they are, and says so', () => {
    const p = createEmptyProject();
    const text = createTextFormula({ name: 'title', glyphColors: { '0': '#FF0000' } });
    p.formulas = [text];
    p.clips = [createClip(text.id, p.tracks[0]!.id, 0, 3)];
    p.tracks[0]!.locked = true;
    loadProject(p);
    const steps = () => useProjectStore.temporal.getState().pastStates.length;
    const before = steps();
    useNoticeStore.getState().clear();
    const colors = new Map([
      [0, null],
      [1, '#00FF00'],
    ]);
    expect(assignGlyphColors(text.id, colors)).toBe(false);
    expect(project().formulas[0]!.glyphColors).toEqual({ '0': '#FF0000' });
    expect(steps()).toBe(before);
    expect(useNoticeStore.getState().notices.map((notice) => notice.title)).toEqual([
      'Text is used on a locked track',
    ]);
    // What would change nothing is not asked of the lock: no second notice.
    expect(assignGlyphColors(text.id, new Map([[0, '#FF0000']]))).toBe(false);
    expect(useNoticeStore.getState().notices).toHaveLength(1);
    // Unlocked, the same colours go on.
    useProjectStore.getState().update((draft) => {
      draft.tracks[0]!.locked = false;
    });
    expect(assignGlyphColors(text.id, colors)).toBe(true);
    expect(project().formulas[0]!.glyphColors).toEqual({ '1': '#00FF00' });
  });

  it('hides and shows glyphs at the start (ascending, no repeats), each as one undo step', () => {
    const id = createNewFormula();
    const hidden = () => project().formulas[0]!.hiddenGlyphs;
    setGlyphsHidden(id, [4, 1], true);
    setGlyphsHidden(id, [2, 4], true);
    expect(hidden()).toEqual([1, 2, 4]);
    setGlyphsHidden(id, [1, 7], false);
    expect(hidden()).toEqual([2, 4]);
    setGlyphsHidden(id, [], true); // nothing selected: no step
    history.undo();
    expect(hidden()).toEqual([1, 2, 4]);
  });

  it('colours and hides glyphs of several formulas as one undo step', () => {
    const a = createNewFormula();
    const b = createNewFormula();
    const formula = (id: string) => project().formulas.find((f) => f.id === id)!;
    setGlyphColorsOf(
      [
        { id: a, glyphs: [0, 1] },
        { id: b, glyphs: [2] },
      ],
      '#FF0000',
    );
    expect(formula(a).glyphColors).toEqual({ '0': '#FF0000', '1': '#FF0000' });
    expect(formula(b).glyphColors).toEqual({ '2': '#FF0000' });
    setGlyphsHiddenOf(
      [
        { id: a, glyphs: [1] },
        { id: b, glyphs: [2, 0] },
      ],
      true,
    );
    expect([formula(a).hiddenGlyphs, formula(b).hiddenGlyphs]).toEqual([[1], [0, 2]]);
    history.undo();
    expect([formula(a).hiddenGlyphs, formula(b).hiddenGlyphs]).toEqual([[], []]);
    history.undo();
    expect([formula(a).glyphColors, formula(b).glyphColors]).toEqual([{}, {}]);
  });

  it('patches tag, size and colour', () => {
    const id = createNewFormula();
    patchFormula(id, { fontSize: 72, color: '#58C4DD', tag: { color: '#FF0000', icon: '∑' } });
    expect(project().formulas[0]).toMatchObject({
      fontSize: 72,
      color: '#58C4DD',
      tag: { color: '#FF0000', icon: '∑' },
    });
  });
});

describe('«Apply to all» of the standard scale', () => {
  it('gives every formula the scale, as one undo step, leaving the texts and the clips alone', () => {
    const p = createEmptyProject();
    p.formulas = [
      { ...createFormula({ name: 'f1', fontSize: 48 }), id: 'a' },
      { ...createFormula({ name: 'f2', fontSize: 96 }), id: 'b' },
      { ...createTexFormula({ name: 't1', fontSize: 48 }), id: 'c' },
    ];
    const clip = createClip('a', p.tracks[0]!.id, 0, 4);
    clip.initial.scale = 2;
    clip.actions = [createTween(1, 1, { scale: 3 })];
    p.clips = [clip];
    loadProject(p);
    const before = project();

    expect(applyStandardScale('math', 1.5)).toBe(2);
    expect(project().formulas.map((x) => x.fontSize)).toEqual([72, 72, 48]);
    // The clip keeps its own scale and its Transform.
    expect(project().clips).toEqual(before.clips);
    // Nothing left to change: no step.
    expect(applyStandardScale('math', 1.5)).toBe(0);
    history.undo();
    expect(project()).toEqual(before);
    expect(history.canUndo()).toBe(false);

    expect(applyStandardScale('tex', 1 / 2)).toBe(1);
    expect(project().formulas.map((x) => x.fontSize)).toEqual([48, 96, 24]);
  });
});

describe('the Scale of «Edit together»', () => {
  it('gives the objects open one scale, as one undo step; what has no scale is left out', () => {
    const p = createEmptyProject();
    p.formulas = [
      { ...createFormula({ name: 'f1', fontSize: 48 }), id: 'a' },
      { ...createTexFormula({ name: 't1', fontSize: 96 }), id: 'b' },
      { ...createTextFormula({ name: 'p1', fontSize: 72 }), id: 'c' },
      { ...createShapeFormula({ name: 's1' }), id: 'd' },
      { ...createFormula({ name: 'f2', fontSize: 48 }), id: 'e' },
    ];
    const clip = createClip('a', p.tracks[0]!.id, 0, 4);
    clip.initial.scale = 2;
    p.clips = [clip];
    loadProject(p);
    const before = project();

    expect(setScaleOf(['a', 'b', 'c', 'd'], 0.5)).toBe(3);
    // The shape keeps what it had; f2 was not open; the clip keeps its own scale.
    expect(project().formulas.map((x) => x.fontSize)).toEqual([
      24,
      24,
      24,
      before.formulas[3]!.fontSize,
      48,
    ]);
    expect(project().clips).toEqual(before.clips);
    // The same scale again changes nothing, and adds no step.
    expect(setScaleOf(['a', 'b', 'c', 'd'], 0.5)).toBe(0);
    history.undo();
    expect(project()).toEqual(before);
    expect(history.canUndo()).toBe(false);
  });

  it('leaves a font text used on a locked track as it is, and says so', () => {
    const p = createEmptyProject();
    const text = createTextFormula({ name: 'title', fontSize: 48 });
    const formula = createFormula({ name: 'f1', fontSize: 48 });
    p.formulas = [text, formula];
    p.clips = [createClip(text.id, p.tracks[0]!.id, 0, 3)];
    p.tracks[0]!.locked = true;
    loadProject(p);
    useNoticeStore.getState().clear();
    expect(setScaleOf([text.id, formula.id], 2)).toBe(1);
    expect(project().formulas.map((x) => x.fontSize)).toEqual([48, 96]);
    expect(useNoticeStore.getState().notices.map((notice) => notice.title)).toEqual([
      'Text is used on a locked track',
    ]);
  });
});

describe('deleting', () => {
  function withClips() {
    const a = createNewFormula();
    const b = createNewFormula();
    useProjectStore.getState().update((d) => {
      const [t1, t2] = d.tracks;
      const ca = createClip(a, t1!.id, 0, 4);
      const cb = createClip(b, t2!.id, 2, 6);
      d.clips.push(ca, cb);
      d.relations.push(createRelation(ca.id, cb.id));
    });
    return { a, b };
  }

  it('asks before deleting an unused formula too, with a held confirmation', async () => {
    const id = createNewFormula();
    const pending = deleteFormula(id);
    await Promise.resolve();
    const dialog = useDialogStore.getState().queue[0]!;
    expect(dialog.title).toMatch(/Delete "f1"/);
    expect(dialog.message).toMatch(/not on the timeline/);
    const confirm = dialog.buttons.find((b) => b.id === 'confirm')!;
    expect(confirm).toMatchObject({ label: 'Hold to delete formula', tone: 'danger' });
    expect(confirm.holdMs).toBe(DELETE_HOLD_MS);
    expect(project().formulas).toHaveLength(1);
    useDialogStore.getState().settle(dialog.key, 'confirm');
    expect(await pending).toBe(true);
    expect(project().formulas).toEqual([]);
    expect(useUiStore.getState().selection).toEqual({ kind: 'none' });
  });

  it('lists what a used formula takes with it, and waits for the answer', async () => {
    const { a } = withClips();
    const pending = deleteFormula(a);
    await Promise.resolve();
    const dialog = useDialogStore.getState().queue[0]!;
    expect(dialog.title).toMatch(/Delete "f1"/);
    expect(dialog.details).toHaveLength(2);
    expect(dialog.details![0]).toMatch(/^Clip f1 \(0 s–4 s\) on Track 2/);
    expect(dialog.details![1]).toMatch(/^Relation f1 .* → f2 .*0 glyph pairs/);
    // Nothing changes until it is confirmed.
    expect(project().formulas).toHaveLength(2);
    useDialogStore.getState().settle(dialog.key, 'confirm');
    expect(await pending).toBe(true);
    expect(project().formulas.map((x) => x.name)).toEqual(['f2']);
    expect(project().clips).toHaveLength(1);
    expect(project().relations).toHaveLength(0);
    expect(validateProject(project()).filter((i) => i.severity === 'error')).toEqual([]);
    // One undo brings back the formula, its clip and the relation.
    history.undo();
    expect(project().formulas).toHaveLength(2);
    expect(project().clips).toHaveLength(2);
    expect(project().relations).toHaveLength(1);
  });

  it('keeps everything when cancelled', async () => {
    const { b } = withClips();
    const pending = deleteFormula(b);
    await Promise.resolve();
    const dialog = useDialogStore.getState().queue[0]!;
    useDialogStore.getState().settle(dialog.key, 'cancel');
    expect(await pending).toBe(false);
    expect(project().formulas).toHaveLength(2);
    expect(project().clips).toHaveLength(2);
  });

  it('drops deleted clips from a clip selection', async () => {
    const { a } = withClips();
    const ids = project().clips.map((c) => c.id);
    useUiStore.getState().select({ kind: 'clips', ids });
    const pending = deleteFormula(a);
    await Promise.resolve();
    useDialogStore.getState().settle(useDialogStore.getState().queue[0]!.key, 'confirm');
    await pending;
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: [ids[1]] });
  });

  it('deletes several formulas at once, as one undo step, saying how many are used', async () => {
    const { a, b } = withClips();
    const c = createNewFormula();
    const pending = deleteFormulas([c, a, b]);
    await Promise.resolve();
    const dialog = useDialogStore.getState().queue[0]!;
    expect(dialog.title).toBe('Delete 3 formulas?');
    expect(dialog.message).toMatch(/^2 of them are used on the timeline/);
    expect(dialog.buttons.find((x) => x.id === 'confirm')!.label).toBe('Hold to delete 3 formulas');
    // Both clips, and the relation between them once.
    expect(dialog.details).toHaveLength(3);
    expect(dialog.details!.filter((line) => line.startsWith('Relation'))).toHaveLength(1);
    expect(project().formulas).toHaveLength(3);
    useDialogStore.getState().settle(dialog.key, 'confirm');
    expect(await pending).toBe(true);
    expect(project().formulas).toEqual([]);
    expect(project().clips).toEqual([]);
    expect(project().relations).toEqual([]);
    expect(useUiStore.getState().selection).toEqual({ kind: 'none' });
    history.undo();
    expect(project().formulas).toHaveLength(3);
    expect(project().clips).toHaveLength(2);
    expect(project().relations).toHaveLength(1);
  });

  it('words the question for several formulas by how many are on the timeline', async () => {
    const ask = async (ids: FormulaId[]) => {
      const pending = deleteFormulas(ids);
      await Promise.resolve();
      const dialog = useDialogStore.getState().queue[0]!;
      useDialogStore.getState().settle(dialog.key, 'cancel');
      expect(await pending).toBe(false);
      return dialog;
    };
    const { a, b } = withClips();
    const c = createNewFormula();
    const d = createNewFormula();
    const none = await ask([c, d]);
    expect(none.message).toBe('None of them is on the timeline: nothing else is removed.');
    expect(none.details).toBeUndefined();
    const one = await ask([a, c]);
    expect(one.message).toMatch(/^One of them is used on the timeline/);
    expect(one.details).toHaveLength(2); // its clip and the relation
    const all = await ask([a, b]);
    expect(all.message).toMatch(/^They are used on the timeline/);
    expect(project().formulas).toHaveLength(4);
  });

  it('ignores ids that are not formulas and asks nothing for none', async () => {
    const a = createNewFormula();
    expect(await deleteFormulas([])).toBe(false);
    expect(await deleteFormulas(['nope' as FormulaId])).toBe(false);
    expect(useDialogStore.getState().queue).toHaveLength(0);
    const pending = deleteFormulas([a, 'nope' as FormulaId]);
    await Promise.resolve();
    const dialog = useDialogStore.getState().queue[0]!;
    expect(dialog.title).toMatch(/Delete "f1"/);
    useDialogStore.getState().settle(dialog.key, 'confirm');
    expect(await pending).toBe(true);
    expect(project().formulas).toEqual([]);
  });

  it('formulaUsage / describeUsage', () => {
    const { a } = withClips();
    const usage = formulaUsage(project(), a);
    expect(usage.clips).toHaveLength(1);
    expect(usage.attached).toEqual([]);
    expect(usage.relations).toHaveLength(1);
    expect(describeUsage(project(), usage)).toHaveLength(2);
  });

  it("counts the objects attached to the formula's clips among what goes with it", () => {
    const { a, b } = withClips();
    useProjectStore.getState().update((d) => {
      const [ca] = d.clips;
      d.clips.push(createClip(b, d.tracks[1]!.id, 7, 8, { attach: createAttach(ca!.id, 'all') }));
    });
    const usage = formulaUsage(project(), a);
    expect(usage.clips).toHaveLength(1);
    expect(usage.attached).toHaveLength(1);
    const lines = describeUsage(project(), usage);
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/^Clip f2 \(7 s–8 s\) on Track 1, attached to f1 \(0 s–4 s\)$/);
  });
});

describe('addToTimeline', () => {
  it('starts each new clip where its object keeps its new clips, in one undo step', () => {
    const title = createTexFormula({ name: 't1', source: 'Title', startPosition: [-5, 3] });
    const words = createTextFormula({ name: 'p1', source: 'Words', startPosition: [2.5, -1.25] });
    const plain = f('f1');
    useProjectStore.getState().update((d) => {
      d.formulas.push(title, words, plain);
    });
    addToTimeline([title.id, words.id, plain.id]);
    history.undo();
    expect(project().clips).toEqual([]);
    history.redo();
    const at = (id: FormulaId) =>
      project()
        .clips.filter((c) => c.formulaId === id)
        .map((c) => c.initial.position);
    expect(at(title.id)).toEqual([[-5, 3]]);
    expect(at(words.id)).toEqual([[2.5, -1.25]]);
    // An object that keeps no position: the centre of the frame, as before.
    expect(at(plain.id)).toEqual([[0, 0]]);
    // The second clip of the title starts there too, wherever the first one went since.
    useProjectStore.getState().update((d) => {
      d.clips.find((c) => c.formulaId === title.id)!.initial.position = [1, 1];
    });
    addToTimeline([title.id]);
    expect(at(title.id)).toEqual([
      [1, 1],
      [-5, 3],
    ]);
    expect(project().formulas.find((x) => x.id === title.id)!.startPosition).toEqual([-5, 3]);
  });
});

describe('the intro of a formula', () => {
  it('follows the editor preference until a kind is chosen', () => {
    const id = createNewFormula();
    expect(project().formulas[0]!.intro).toBeNull();
    setFormulaIntro(id, 'create');
    expect(project().formulas[0]!.intro).toEqual(defaultIntro('create'));
    setFormulaIntro(id, 'bogus'); // not an intro kind: unchanged
    expect(project().formulas[0]!.intro).toEqual(defaultIntro('create'));
    setFormulaIntro(id, '');
    expect(project().formulas[0]!.intro).toBeNull();
    expect(defaultIntroLabel(false, defaultIntro('write'))).toBe('Default (none)');
    expect(defaultIntroLabel(true, defaultIntro('write'))).toBe('Default (Write)');
  });

  it('carries along the clips that still had the previous intro, not the retouched ones', () => {
    const a = createNewFormula();
    addToTimeline([a]);
    const clip = () => project().clips.find((c) => c.formulaId === a)!;
    expect(clip().intro.kind).toBe('none');
    setFormulaIntro(a, 'write'); // the clip still had the previous intro (none): it follows
    expect(clip().intro).toEqual(defaultIntro('write'));
    expect(effectiveIntro(project().formulas[0]!)).toEqual(defaultIntro('write'));
    history.undo(); // one step for the formula and its clip
    expect(project().formulas[0]!.intro).toBeNull();
    expect(clip().intro.kind).toBe('none');
    history.redo();
    // The duration follows too, keeping the clip's other options.
    useProjectStore.getState().update((d) => {
      d.clips[0]!.intro.easing = 'rush_into';
    });
    setFormulaIntroDuration(a, 2);
    expect(clip().intro).toMatchObject({ kind: 'write', duration: 2, easing: 'rush_into' });
    setFormulaIntroDuration(a, 0.001); // too short: nothing changes
    expect(clip().intro.duration).toBe(2);
    // A clip retouched in Timing (another duration) is left alone from then on.
    useProjectStore.getState().update((d) => {
      d.clips[0]!.intro.duration = 0.4;
    });
    setFormulaIntro(a, 'fade_in');
    expect(clip().intro).toMatchObject({ kind: 'write', duration: 0.4 });
    // Back to Default: the clips at the formula's intro go to the preference's (none here).
    useProjectStore.getState().update((d) => {
      d.clips[0]!.intro = defaultIntro('fade_in');
    });
    setFormulaIntro(a, '');
    expect(project().formulas[0]!.intro).toBeNull();
    expect(clip().intro.kind).toBe('none');
  });

  it('keeps what fits beside the outro of a short clip', () => {
    const a = createNewFormula();
    addToTimeline([a]); // 3 s long
    useProjectStore.getState().update((d) => {
      d.clips[0]!.outro = { ...defaultOutro('fade_out'), duration: 2.5 };
    });
    setFormulaIntro(a, 'write'); // 1 s does not fit: 0.5 s does
    expect(project().clips[0]!.intro).toMatchObject({ kind: 'write', duration: 0.5 });
    useProjectStore.getState().update((d) => {
      d.clips[0]!.outro.duration = 2.99;
      d.clips[0]!.intro = defaultIntro('none');
    });
    setFormulaIntro(a, 'none');
    setFormulaIntro(a, 'create'); // nothing fits: the clip stays as it is
    expect(project().clips[0]!.intro.kind).toBe('none');
    expect(project().formulas[0]!.intro!.kind).toBe('create');
  });

  it('stops at a clip’s first block or outgoing relation, and leaves locked tracks alone', () => {
    const a = createNewFormula();
    const b = createNewFormula();
    addToTimeline([a, b]); // 3 s long, from 0
    const clipOf = (id: FormulaId) => project().clips.find((c) => c.formulaId === id)!;
    setFormulaIntro(a, 'write'); // 1 s
    expect(clipOf(a).intro).toMatchObject({ kind: 'write', duration: 1 });
    // A tween at 1.2 s: the intro grows to 1.2 s, not to 2 s; the tween stays where it is.
    useProjectStore.getState().update((d) => {
      d.clips
        .find((c) => c.formulaId === a)!
        .actions.push(createTween(1.2, 0.5, { position: [1, 0] }));
    });
    setFormulaIntroDuration(a, 2);
    expect(clipOf(a).intro.duration).toBe(1.2);
    expect(clipOf(a).actions[0]).toMatchObject({ start: 1.2, duration: 0.5 });
    const codes = () => validateProject(project()).map((i) => i.code);
    expect(codes()).not.toContain('action-bounds');
    // An outgoing relation whose window starts at 1.1 s bounds it too; an incoming one does not.
    // (Back to a 1 s Write on both, as a clip that took less than the formula's intro counts as
    // retouched from then on.)
    useProjectStore.getState().update((d) => {
      d.formulas.find((f) => f.id === a)!.intro = defaultIntro('write');
      d.clips.find((c) => c.formulaId === a)!.actions = [];
      d.clips.find((c) => c.formulaId === a)!.intro.duration = 1;
      // b beside a (addToTimeline queued it after a on the same track).
      const other = d.clips.find((c) => c.formulaId === b)!;
      other.trackId = d.tracks[1]!.id;
      other.start = 0;
      other.end = 3;
      d.relations.push(
        createRelation(clipOf(a).id, clipOf(b).id, { offset: 1.1, duration: 0.5, pairs: [] }),
      );
    });
    setFormulaIntroDuration(a, 2);
    expect(clipOf(a).intro.duration).toBe(1.1);
    expect(codes()).not.toContain('relation-window');
    expect(clipOf(b).intro.kind).toBe('none'); // b's intro has nothing to do with a's
    // A clip on a locked track keeps its intro; a notice says so. (The formula first says 1.1 s
    // too: a clip that took less than the formula's intro counts as retouched.)
    setFormulaIntroDuration(a, 1.1);
    useProjectStore.getState().update((d) => {
      d.tracks.find((t) => t.id === clipOf(a).trackId)!.locked = true;
    });
    useNoticeStore.getState().clear();
    setFormulaIntro(a, 'fade_in');
    expect(project().formulas.find((f) => f.id === a)!.intro!.kind).toBe('fade_in');
    expect(clipOf(a).intro).toMatchObject({ kind: 'write', duration: 1.1 });
    expect(useNoticeStore.getState().notices[0]).toMatchObject({ title: '1 clip stayed' });
  });

  it('gives the new clips of the formula that intro', () => {
    const a = createNewFormula();
    const b = createNewFormula();
    setFormulaIntro(a, 'fade_in');
    addToTimeline([a, b]);
    const clips = project().clips;
    expect(clips.find((c) => c.formulaId === a)!.intro).toEqual(defaultIntro('fade_in'));
    expect(clips.find((c) => c.formulaId === b)!.intro.kind).toBe('none');
  });
});

describe('the intro of a line object (audit A1-01)', () => {
  const before = usePreferences.getState();
  afterEach(() => {
    usePreferences.getState().set({ autoIntro: before.autoIntro, intro: before.intro });
  });
  const errors = () =>
    validateProject(project())
      .filter((issue) => issue.severity === 'error')
      .map((issue) => `${issue.code} ${issue.path.join('.')}`);
  /** A line object of `kind` with a clip and no intro, and a formula with a clip. */
  function lineAndFormula(kind: LineKind = 'arrow') {
    const p = createEmptyProject();
    const line = createLineFormula({ name: 'l1', line: kind });
    const formula = createFormula({ name: 'f1' });
    p.formulas.push(line, formula);
    const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
    p.clips.push(createClip(line.id, p.tracks[0]!.id, 0, 3, none));
    p.clips.push(createClip(formula.id, p.tracks[1]!.id, 0, 3, none));
    loadProject(p);
    return { line: line.id, formula: formula.id };
  }
  const intro = (id: FormulaId) => project().clips.find((c) => c.formulaId === id)!.intro;
  const object = (id: FormulaId) => project().formulas.find((f) => f.id === id)!;

  it('keeps its clips valid when the preference is an intro a line cannot take', () => {
    const { line, formula } = lineAndFormula();
    expect(errors()).toEqual([]);
    // The editor's preference (Edit → Always add intro) is GrowFromCenter.
    usePreferences.getState().set({ autoIntro: true, intro: defaultIntro('grow_from_center') });
    // «Appears with» set to «Default» on the line, and on the formula.
    setFormulaIntro(line, '');
    setFormulaIntro(formula, '');
    // A line is not grown: «Default» is none for it, the preference for the formula.
    expect(effectiveIntro(object(line))).toEqual(defaultIntro('none'));
    expect(intro(line).kind).toBe('none');
    expect(effectiveIntro(object(formula)).kind).toBe('grow_from_center');
    expect(errors()).toEqual([]);
    // A fade is a line's when it has no scale.
    usePreferences.getState().set({ intro: { ...defaultIntro('fade_in'), scale: 2 } });
    expect(effectiveIntro(object(line)).kind).toBe('none');
    usePreferences.getState().set({ intro: defaultIntro('fade_in') });
    expect(effectiveIntro(object(line)).kind).toBe('fade_in');
    // The label of the choice says what it gives the object.
    const takes = (spec: IntroSpec) => takesIntro(object(line), spec);
    expect(defaultIntroLabel(true, defaultIntro('grow_from_center'), takes)).toBe('Default (none)');
    expect(defaultIntroLabel(true, defaultIntro('create'), takes)).toBe('Default (Create)');
  });

  it('takes GrowArrow on an arrow, and nothing a line does not take', () => {
    const { line } = lineAndFormula();
    setFormulaIntro(line, 'grow_arrow');
    expect(object(line).intro).toMatchObject({ kind: 'grow_arrow' });
    expect(intro(line).kind).toBe('grow_arrow');
    setFormulaIntro(line, 'grow_from_center'); // not a line's: unchanged
    expect(object(line).intro).toMatchObject({ kind: 'grow_arrow' });
    expect(errors()).toEqual([]);
    // A line without a tip has no GrowArrow.
    const plain = lineAndFormula('line').line;
    setFormulaIntro(plain, 'grow_arrow');
    expect(object(plain).intro).toMatchObject({ kind: 'none' });
  });
});

describe('applyFormulaSource', () => {
  it('commits a shape’s draft as one undo step; a fill colour it leaves unset is not kept', () => {
    const box = createShapeFormula({ name: 's1', fillColor: '#FF8800' });
    useProjectStore.getState().update((draft) => void draft.formulas.push(box));
    history.clear();
    const draft = {
      source: '',
      shape: 'circle' as const,
      style: { ...box.style, strokeWidth: 8 },
      fillColor: undefined,
      cornerRadius: 0,
      width: 2,
      height: 2,
    };
    applyFormulaSource(box.id, draft);
    const applied = project().formulas.find((formula) => formula.id === box.id)!;
    expect(applied).toMatchObject({ shape: 'circle', style: { strokeWidth: 8 }, width: 2 });
    // Absent, not a key without a value: the file has no field for it.
    expect('fillColor' in applied).toBe(false);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    applyFormulaSource(box.id, { ...draft, fillColor: '#00FF00' });
    expect(project().formulas.find((formula) => formula.id === box.id)).toMatchObject({
      fillColor: '#00FF00',
    });
  });
});
