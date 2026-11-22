import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createFormulaOfKind,
  createRelation,
  createTextFormula,
  createTween,
  type TexFormula,
  defaultIntro,
  defaultOutro,
} from '../../../model';
import {
  history,
  loadProject,
  useProjectStore,
  useRenderStore,
  useSyncWarnings,
  useUiStore,
} from '../../../store';
import {
  BACKEND_VERSIONS,
  renderKey,
  renderRequestFor,
  toSnapshot,
  type FormulaRender,
} from '../../../engine';
import type { RenderBasis } from '../../../engine/correspondence';
import { rectContour } from '../../../geom';
import { colorGlyphs, hideGlyphs, seedPaint } from '../glyphPaint';
import { useTransformEdit } from '../../animations/transformEdit';
import { useDocumentStore } from '../../project/documentStore';
import { safeSession } from '../../storage';
import { setGlyphColors } from '../../creator/formulaActions';
import { withServices } from '../../../test/services';
import {
  blockTextCompositionCommand,
  cancelTextCompositionForHistory,
  compositionConflict,
  startTextCompositionTracking,
  useTextComposition,
} from '../textCompositionStore';
import {
  centeredPosition,
  sameTextDraft,
  selectableTextBox,
  textDraftOf,
  textSourceLock,
  validateTextDraft,
} from '../textCompositionModel';

vi.mock('../../transport/mainPlayback', () => ({ mainPlayback: { pause: vi.fn() } }));

withServices(startTextCompositionTracking);

const current = () => useProjectStore.getState().project;
const editor = () => useTextComposition.getState();

function fixture() {
  const project = createEmptyProject();
  const formula = createTextFormula({ name: 'title', source: 'Before' });
  const first = createClip(formula.id, project.tracks[0]!.id, 0, 8, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
  });
  const other = createClip(formula.id, project.tracks[1]!.id, 0, 8, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
  });
  project.formulas = [formula];
  project.clips = [first, other];
  loadProject(project);
  useDocumentStore.getState().beginDocument(project, { fileName: null, handle: null });
  return { project, formula, first, other };
}

const latexText = (fields: Partial<TexFormula>) => createFormulaOfKind('tex', fields) as TexFormula;

/** The fixture's project with a LaTeX text in place of the font text. */
function latexFixture() {
  const project = createEmptyProject();
  const formula = latexText({ name: 'caption', source: 'Before' });
  const first = createClip(formula.id, project.tracks[0]!.id, 0, 8, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
  });
  const other = createClip(formula.id, project.tracks[1]!.id, 0, 8, {
    intro: defaultIntro('none'),
    outro: defaultOutro('none'),
  });
  project.formulas = [formula];
  project.clips = [first, other];
  loadProject(project);
  useDocumentStore.getState().beginDocument(project, { fileName: null, handle: null });
  return { project, formula, first, other };
}

beforeEach(() => {
  editor().cancel();
  safeSession.setItem('mfe.text-composition.v2', 'null');
  useTransformEdit.setState({ editing: null, unlocked: [] });
  useUiStore.setState({ time: 0, playing: false, selection: { kind: 'none' } });
});

describe('text composition ownership', () => {
  it('never offers a source recovery from another occurrence with the same null placement binding', () => {
    const { project, formula, first, other } = fixture();
    project.tracks[0]!.locked = true;
    project.tracks[1]!.locked = true;
    loadProject(project);
    editor().open(formula.id, first.id);
    expect(editor().session!.placement).toBeNull();
    editor().patch({ source: 'Occurrence A draft' });
    useTextComposition.setState({ session: null });
    editor().open(formula.id, other.id);
    expect(editor().session!.placement).toBeNull();
    expect(editor().session!.recovery).toBeNull();
    useTextComposition.setState({ session: null });
    editor().open(formula.id);
    expect(editor().session!.recovery).toBeNull();
    useTextComposition.setState({ session: null });
    editor().open(formula.id, first.id);
    expect(editor().session!.recovery?.draft.source).toBe('Occurrence A draft');
  });
  it('keeps new creation library-only until Apply and cancels without publishing', () => {
    fixture();
    const before = current();
    editor().open();
    editor().patch({ source: 'Título\n\n  café e\u0301  ' });
    editor().setPosition([4, 2]);
    expect(current()).toBe(before);
    editor().cancel();
    expect(current()).toBe(before);
    expect(history.canUndo()).toBe(false);
    editor().open();
    editor().patch({ source: 'New' });
    expect(editor().apply()).toBe(true);
    expect(current().formulas).toHaveLength(2);
    expect(current().clips).toHaveLength(2);
    expect(current().tracks).toHaveLength(before.tracks.length);
    // Left at the centre of the stage, it keeps no start position.
    expect(current().formulas.at(-1)).not.toHaveProperty('startPosition');
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    history.undo();
    expect(current()).toBe(before);
  });

  it('keeps where a new text was put on the stage as the place its new clips start, unless told not to', () => {
    fixture();
    const before = current();
    editor().open();
    // «New clips start here» is on when the session opens.
    expect(editor().session!.keepPosition).toBe(true);
    editor().patch({ source: 'New' });
    editor().setPosition([4, 2]);
    expect(editor().apply()).toBe(true);
    expect(current().formulas.at(-1)!.startPosition).toEqual([4, 2]);
    // The object alone: no clip is made, and those that exist stay as they were.
    expect(current().clips).toBe(before.clips);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    history.undo();
    expect(current()).toBe(before);
    // Turned off, the place on the stage is not saved.
    editor().open();
    editor().patch({ source: 'New' });
    editor().setPosition([4, 2]);
    editor().setKeepPosition(false);
    expect(editor().session!.keepPosition).toBe(false);
    expect(editor().apply()).toBe(true);
    expect(current().formulas.at(-1)).toMatchObject({ source: 'New' });
    expect(current().formulas.at(-1)).not.toHaveProperty('startPosition');
  });

  it('commits shared source and only one occurrence placement in one Undo; Cancel and no-op add none', () => {
    const { formula, first } = fixture();
    const before = current();
    editor().open(formula.id, first.id);
    editor().patch({ source: 'After', font: { ...formula.font, weight: 'bold' } });
    editor().setPosition([2, -1]);
    expect(current()).toBe(before);
    expect(history.isGesturing()).toBe(false);
    expect(editor().apply()).toBe(true);
    expect(current().formulas[0]!.source).toBe('After');
    expect(current().clips[0]!.initial.position).toEqual([2, -1]);
    expect(current().clips[1]!.initial.position).toEqual([0, 0]);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    history.undo();
    expect(current()).toBe(before);
    history.redo();
    editor().open(formula.id, first.id);
    const count = useProjectStore.temporal.getState().pastStates.length;
    editor().apply();
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(count);
  });

  it('rejects shared source mutations on any locked use but allows selected occurrence placement', () => {
    const { project, formula, first } = fixture();
    project.tracks[1]!.locked = true;
    loadProject(project);
    expect(textSourceLock(project, formula.id)).toContain('1 clip');
    editor().open(formula.id, first.id);
    editor().setPosition([3, 0]);
    expect(editor().apply()).toBe(true);
    editor().open(formula.id, first.id);
    editor().patch({ source: 'Blocked' });
    expect(editor().apply()).toBe(false);
    expect(current().formulas[0]!.source).toBe('Before');
    setGlyphColors(formula.id, [0], '#FF0000');
    expect(current().formulas[0]!.glyphColors).toEqual({});
    editor().makeIndependent();
    expect(editor().apply()).toBe(true);
    expect(current().formulas).toHaveLength(2);
    expect(current().clips[0]!.id).toBe(first.id);
    expect(current().clips[1]!.formulaId).toBe(formula.id);
    expect(current().clips[0]!.formulaId).not.toBe(formula.id);
  });

  it('rechecks locks and owned revisions while preserving unrelated project changes', () => {
    const { formula, first } = fixture();
    editor().open(formula.id, first.id);
    editor().patch({ source: 'After' });
    useProjectStore.getState().update((draft) => {
      draft.meta.name = 'New project name';
    });
    expect(editor().apply()).toBe(true);
    expect(current().meta.name).toBe('New project name');
    editor().open(formula.id, first.id);
    editor().setPosition([4, 1]);
    useProjectStore.getState().update((draft) => {
      draft.clips[0]!.initial.position = [1, 2];
    });
    expect(editor().apply()).toBe(false);
    expect(compositionConflict(editor().session!)).toContain('placement changed');
    expect(current().clips[0]!.initial.position).toEqual([1, 2]);
    editor().cancel();
    editor().open(formula.id, first.id);
    editor().patch({ source: 'stale' });
    useProjectStore.getState().update((draft) => {
      draft.formulas[0]!.source = 'external';
    });
    expect(editor().apply()).toBe(false);
    expect(current().formulas[0]!.source).toBe('external');
  });

  it('never writes an interpolated pose and respects explicit transformation and attachment contexts', () => {
    const { project, formula, first } = fixture();
    const tween = createTween(1, 2, { position: [4, 0] });
    first.actions = [tween];
    loadProject(project);
    useUiStore.getState().setTime(2);
    editor().open(formula.id, first.id);
    expect(editor().session!.placement).toBeNull();
    editor().cancel();
    useTransformEdit.getState().startEditing({ clipId: first.id, actionId: tween.id, time: 3 });
    editor().open(formula.id, first.id);
    expect(editor().session!.pose.position).toEqual([4, 0]);
    editor().setPosition([7, 1]);
    editor().apply();
    expect(current().clips[0]!.initial.position).toEqual([0, 0]);
    expect(current().clips[0]!.actions[0]).toMatchObject({ to: { position: [7, 1] } });
  });

  it('blocks composition and document commands, cancels for application history, and invalidates reused ids', () => {
    const { formula, first } = fixture();
    editor().open(formula.id, first.id);
    editor().patch({ source: 'に' });
    editor().setComposing(true);
    expect(editor().apply()).toBe(false);
    expect(blockTextCompositionCommand()).toBe(true);
    editor().setComposing(false);
    expect(cancelTextCompositionForHistory()).toBe(true);
    expect(history.canUndo()).toBe(false);
    editor().open(formula.id, first.id);
    editor().patch({ source: 'old session' });
    loadProject(structuredClone(current()));
    expect(editor().session).toBeNull();
  });

  it('keeps position undo local and recovery tied to the original source/placement', () => {
    const { formula, first } = fixture();
    editor().open(formula.id, first.id);
    editor().patch({ source: 'Recover me' });
    editor().setPosition([1, 2]);
    editor().setPosition([3, 4]);
    editor().undoPosition();
    expect(editor().session!.position).toEqual([1, 2]);
    editor().undoPosition(true);
    expect(editor().session!.position).toEqual([3, 4]);
    expect(history.canUndo()).toBe(false);
    useTextComposition.setState({ session: null }); // Simulate a lost component; leave recovery intact.
    editor().open(formula.id, first.id);
    expect(editor().session!.recovery?.draft.source).toBe('Recover me');
    editor().recover();
    expect(editor().session!.position).toEqual([3, 4]);
  });

  it('maintains logical selection for zero-ink text and centers actual transformed bounds', () => {
    expect(selectableTextBox({ minX: 0, minY: 0, maxX: 0, maxY: 0 })).toEqual({
      minX: -0.1,
      maxX: 0.1,
      minY: -0.175,
      maxY: 0.175,
    });
    expect(centeredPosition([3, 2], { minX: 1, maxX: 5, minY: 1, maxY: 3 }, 'x')).toEqual([0, 2]);
  });
});

describe('where the new clips of a text start, from its library session', () => {
  /** The fixture's text keeping `at` as its start position. */
  function placedFixture(at: [number, number] = [-5, 3]) {
    const made = fixture();
    made.formula.startPosition = at;
    loadProject(made.project);
    return made;
  }

  it('opens the stage where the object keeps its new clips, and writes nothing when nothing moved', () => {
    const { formula } = placedFixture();
    const before = current();
    editor().open(formula.id);
    expect(editor().session).toMatchObject({
      clipId: null,
      position: [-5, 3],
      pose: { position: [-5, 3], scale: 1, rotation: 0 },
      keepPosition: true,
    });
    expect(editor().apply()).toBe(true);
    expect(current()).toBe(before);
    expect(history.canUndo()).toBe(false);
  });

  it('changes it alone in one undo step, leaving every clip where it is', () => {
    const { formula } = fixture();
    const before = current();
    editor().open(formula.id);
    editor().setPosition([2.5, -1.25]);
    expect(current()).toBe(before);
    expect(editor().apply()).toBe(true);
    expect(current().formulas[0]!.startPosition).toEqual([2.5, -1.25]);
    expect(current().formulas[0]!.source).toBe('Before');
    expect(current().clips).toBe(before.clips);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    expect(useUiStore.getState().selection).toEqual({ kind: 'formula', id: formula.id });
    history.undo();
    expect(current()).toBe(before);
  });

  it('keeps the position the object had when the box is unticked, whatever the stage shows', () => {
    const { formula } = placedFixture();
    const before = current();
    editor().open(formula.id);
    editor().setPosition([1, 1]);
    editor().setKeepPosition(false);
    expect(editor().apply()).toBe(true);
    expect(current()).toBe(before);
    // With the source changed too, the source is applied and the position stays.
    editor().open(formula.id);
    editor().patch({ source: 'After' });
    editor().setPosition([1, 1]);
    editor().setKeepPosition(false);
    expect(editor().apply()).toBe(true);
    expect(current().formulas[0]).toMatchObject({ source: 'After', startPosition: [-5, 3] });
  });

  it('drops the field when the text is put back at the centre of the frame', () => {
    const { formula } = placedFixture();
    editor().open(formula.id);
    editor().setPosition([0, 0]);
    expect(editor().apply()).toBe(true);
    expect(current().formulas[0]).not.toHaveProperty('startPosition');
  });

  it('is never written by the session of a clip, which moves that clip', () => {
    const { formula, first } = placedFixture();
    editor().open(formula.id, first.id);
    // The stage of a clip shows the clip, not where the next ones start.
    expect(editor().session).toMatchObject({ position: [0, 0], keepPosition: false });
    editor().setKeepPosition(true);
    expect(editor().session!.keepPosition).toBe(false);
    editor().setPosition([2, -1]);
    expect(editor().apply()).toBe(true);
    expect(current().clips[0]!.initial.position).toEqual([2, -1]);
    expect(current().formulas[0]!.startPosition).toEqual([-5, 3]);
  });

  it('can be changed on a font text whose uses are on locked tracks: no clip is touched', () => {
    const { project, formula } = fixture();
    project.tracks[0]!.locked = true;
    project.tracks[1]!.locked = true;
    loadProject(project);
    editor().open(formula.id);
    editor().setPosition([3, 0]);
    expect(compositionConflict(editor().session!)).toBeNull();
    expect(editor().apply()).toBe(true);
    expect(current().formulas[0]!.startPosition).toEqual([3, 0]);
    // Its source is still locked by them.
    editor().open(formula.id);
    editor().patch({ source: 'Blocked' });
    expect(editor().apply()).toBe(false);
  });

  it('is refused when the object’s position changed outside the session', () => {
    const { formula } = placedFixture();
    editor().open(formula.id);
    editor().setPosition([1, 1]);
    useProjectStore.getState().update((draft) => {
      draft.formulas[0]!.startPosition = [6, 0];
    });
    expect(compositionConflict(editor().session!)).toContain('start position changed');
    expect(editor().apply()).toBe(false);
    expect(current().formulas[0]!.startPosition).toEqual([6, 0]);
    // Nothing to write, nothing to refuse.
    editor().setKeepPosition(false);
    expect(compositionConflict(editor().session!)).toBeNull();
  });

  it('gives the copy of an occurrence made independent the position its original keeps', () => {
    const { formula, first } = placedFixture();
    editor().open(formula.id, first.id);
    editor().makeIndependent();
    editor().patch({ source: 'Only here' });
    expect(editor().apply()).toBe(true);
    const [shared, copy] = current().formulas;
    expect(shared!.startPosition).toEqual([-5, 3]);
    expect(copy).toMatchObject({ source: 'Only here', startPosition: [-5, 3] });
  });

  it('recovers the box with an unapplied draft', () => {
    const { formula } = fixture();
    editor().open(formula.id);
    editor().patch({ source: 'Recover me' });
    editor().setPosition([3, 4]);
    editor().setKeepPosition(false);
    useTextComposition.setState({ session: null }); // A lost component; the recovery stays.
    editor().open(formula.id);
    expect(editor().session!.keepPosition).toBe(true);
    expect(editor().session!.recovery).toMatchObject({ position: [3, 4], keepPosition: false });
    editor().recover();
    expect(editor().session).toMatchObject({ position: [3, 4], keepPosition: false });
    // A draft left with the box ticked comes back ticked.
    editor().setKeepPosition(true);
    useTextComposition.setState({ session: null });
    editor().open(formula.id);
    editor().recover();
    expect(editor().session!.keepPosition).toBe(true);
  });

  it('is kept by a LaTeX text as by a font text', () => {
    latexFixture();
    editor().open(undefined, undefined, 'tex');
    editor().patch({ source: 'A caption' });
    editor().setPosition([-5, 3]);
    expect(editor().apply()).toBe(true);
    const added = current().formulas.at(-1)!;
    expect(added).toMatchObject({ kind: 'tex', source: 'A caption', startPosition: [-5, 3] });
    // Reopened from the library, it is shown there; moved, the next clips start elsewhere.
    editor().open(added.id);
    expect(editor().session!.position).toEqual([-5, 3]);
    editor().setPosition([0, 2]);
    expect(editor().apply()).toBe(true);
    expect(current().formulas.at(-1)!.startPosition).toEqual([0, 2]);
  });
});

describe('a LaTeX text in the composition workspace', () => {
  it('has a draft of its kind: source, size, colour, layout, and its name, tag and intro', () => {
    const formula = latexText({ name: 'caption', source: 'Hello', fontSize: 36 });
    const draft = textDraftOf(formula);
    expect(draft).toEqual({
      kind: 'tex',
      source: 'Hello',
      layout: { width: null, align: 'center', lineSpacing: 1 },
      fontSize: 36,
      color: formula.color,
      name: 'caption',
      tag: formula.tag,
      intro: null,
    });
    expect(draft.layout).not.toBe(formula.layout);
    expect(draft.tag).not.toBe(formula.tag);
    for (const change of [
      { name: 'other' },
      { tag: { ...draft.tag, icon: '★' } },
      { tag: { ...draft.tag, color: '#123456' } },
      { intro: defaultIntro('write') },
    ])
      expect(sameTextDraft(draft, { ...draft, ...change })).toBe(false);
    expect(sameTextDraft(draft, textDraftOf(formula))).toBe(true);
    for (const layout of [{ width: 4 }, { align: 'left' as const }, { lineSpacing: 1.5 }])
      expect(sameTextDraft(draft, { ...draft, layout: { ...draft.layout, ...layout } })).toBe(
        false,
      );
    // Never the same as the draft of a font text, whatever the fields they share.
    const font = textDraftOf(createTextFormula({ source: 'Hello', fontSize: 36 }));
    expect(sameTextDraft(draft, { ...font, color: draft.color })).toBe(false);
  });

  it('validates the layout: a positive width or none, an alignment, a positive spacing', () => {
    const draft = textDraftOf(latexText({ source: 'Hello' }));
    const withLayout = (layout: object) =>
      validateTextDraft({ ...draft, layout: { ...draft.layout, ...layout } });
    expect(validateTextDraft(draft)).toBeNull();
    expect(validateTextDraft({ ...draft, source: '' })).toBeNull();
    expect(withLayout({ width: 6.5 })).toBeNull();
    expect(withLayout({ width: 0 })).toMatch(/width/);
    expect(withLayout({ width: Number.NaN })).toMatch(/width/);
    expect(withLayout({ align: 'justify' })).toMatch(/alignment/);
    expect(withLayout({ lineSpacing: 0 })).toMatch(/line spacing/);
    // A file may hold a spacing the form would not take: it stays valid until edited.
    expect(withLayout({ lineSpacing: 4 })).toBeNull();
    expect(validateTextDraft({ ...draft, fontSize: 0 })).toMatch(/Font size/);
    expect(validateTextDraft({ ...draft, color: 'red' })).toMatch(/colour/);
    expect(validateTextDraft({ ...draft, name: ' ' })).toMatch(/name/);
    expect(validateTextDraft({ ...draft, tag: { color: 'red', icon: null } })).toMatch(/tag/);
    expect(validateTextDraft({ ...draft, tag: { ...draft.tag, icon: '123456789' } })).toMatch(
      /tag/,
    );
    expect(validateTextDraft({ ...draft, intro: defaultIntro('fade_in') })).toBeNull();
  });

  it('keeps a new one out of the project until Apply, which adds it in one undo step', () => {
    latexFixture();
    const before = current();
    editor().open(undefined, undefined, 'tex');
    expect(editor().session!.original.kind).toBe('tex');
    expect(editor().session!.isNew).toBe(true);
    editor().patch({
      source: 'A $x^2$ caption',
      layout: { width: 5, align: 'left', lineSpacing: 1.2 },
    });
    expect(current()).toBe(before);
    editor().cancel();
    expect(current()).toBe(before);
    editor().open(undefined, undefined, 'tex');
    editor().patch({
      source: 'A $x^2$ caption',
      layout: { width: 5, align: 'left', lineSpacing: 1.2 },
    });
    expect(editor().apply()).toBe(true);
    const added = current().formulas.at(-1)!;
    expect(added).toMatchObject({
      kind: 'tex',
      source: 'A $x^2$ caption',
      layout: { width: 5, align: 'left', lineSpacing: 1.2 },
    });
    expect(current().clips).toHaveLength(2);
    expect(useUiStore.getState().selection).toEqual({ kind: 'formula', id: added.id });
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    history.undo();
    expect(current()).toBe(before);
  });

  it('commits source, layout, size, colour and one placement together; Cancel writes nothing', () => {
    const { formula, first } = latexFixture();
    const before = current();
    editor().open(formula.id, first.id);
    editor().patch({ source: 'After' });
    editor().patch({ layout: { width: 6, align: 'right', lineSpacing: 1.5 } });
    editor().patch({ fontSize: 60, color: '#ff8800' });
    editor().setPosition([1, 2]);
    expect(current()).toBe(before);
    expect(editor().apply()).toBe(true);
    expect(current().formulas[0]).toMatchObject({
      kind: 'tex',
      source: 'After',
      layout: { width: 6, align: 'right', lineSpacing: 1.5 },
      fontSize: 60,
      color: '#ff8800',
    });
    expect(current().clips[0]!.initial.position).toEqual([1, 2]);
    expect(current().clips[1]!.initial.position).toEqual([0, 0]);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    expect(editor().session).toBeNull();
    history.undo();
    expect(current()).toBe(before);
    editor().open(formula.id, first.id);
    editor().patch({ source: 'Dropped' });
    editor().cancel();
    expect(current()).toBe(before);
  });

  it('is not locked by its other uses: only a font text shares a saved appearance', () => {
    const { project, formula, first } = latexFixture();
    project.tracks[1]!.locked = true;
    loadProject(project);
    editor().open(formula.id, first.id);
    editor().patch({ source: 'Edited with a locked use' });
    expect(compositionConflict(editor().session!)).toBeNull();
    expect(editor().apply()).toBe(true);
    expect(current().formulas[0]!.source).toBe('Edited with a locked use');
  });

  it('gives one occurrence its own copy on Apply', () => {
    const { formula, first, other } = latexFixture();
    editor().open(formula.id, first.id);
    editor().makeIndependent();
    editor().patch({ source: 'Only here' });
    expect(editor().apply()).toBe(true);
    const [shared, copy] = current().formulas;
    expect(shared!.source).toBe('Before');
    expect(copy).toMatchObject({ kind: 'tex', source: 'Only here' });
    expect(copy!.name).not.toBe(shared!.name);
    expect(current().clips.find((clip) => clip.id === first.id)!.formulaId).toBe(copy!.id);
    expect(current().clips.find((clip) => clip.id === other.id)!.formulaId).toBe(shared!.id);
  });

  it('refuses a draft changed from outside, and has no appearance to refresh', () => {
    const { formula, first } = latexFixture();
    editor().open(formula.id, first.id);
    editor().refresh();
    expect(editor().session!.refresh).toBe(false);
    useProjectStore.getState().update((draft) => {
      draft.formulas[0]!.source = 'Changed elsewhere';
    });
    expect(compositionConflict(editor().session!)).toMatch(/changed outside/);
    expect(editor().apply()).toBe(false);
  });

  it('recovers an unapplied draft of the same text only', () => {
    const { formula, first } = latexFixture();
    editor().open(formula.id, first.id);
    editor().patch({ source: 'Unapplied', layout: { width: 3, align: 'left', lineSpacing: 1 } });
    useTextComposition.setState({ session: null });
    editor().open(formula.id, first.id);
    expect(editor().session!.recovery?.draft).toMatchObject({ kind: 'tex', source: 'Unapplied' });
    editor().recover();
    expect(editor().session!.draft).toMatchObject({
      source: 'Unapplied',
      layout: { width: 3, align: 'left', lineSpacing: 1 },
    });
    expect(editor().session!.recovery).toBeNull();
  });

  it('closes with its text, as a font text does', () => {
    const { formula, first } = latexFixture();
    editor().open(formula.id, first.id);
    useProjectStore.getState().update((draft) => {
      draft.clips = [];
      draft.formulas = [];
    });
    expect(editor().session).toBeNull();
  });

  it('renames and tags the text with the rest; a name in use is refused', () => {
    const { project, formula, first } = latexFixture();
    project.formulas.push(latexText({ name: 'taken', source: 'x' }));
    loadProject(project);
    editor().open(formula.id, first.id);
    editor().patch({ name: 'taken' });
    expect(compositionConflict(editor().session!)).toMatch(/already called "taken"/);
    expect(editor().apply()).toBe(false);
    editor().patch({ name: 'not a name' });
    expect(compositionConflict(editor().session!)).toMatch(/Python variable/);
    editor().patch({ name: 'heading', tag: { color: '#123456', icon: '★' } });
    expect(editor().apply()).toBe(true);
    expect(current().formulas[0]).toMatchObject({
      name: 'heading',
      tag: { color: '#123456', icon: '★' },
      source: 'Before',
    });
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
  });

  it('names a new text as its draft says, and a copy after its original unless renamed', () => {
    const { formula, first } = latexFixture();
    editor().open(undefined, undefined, 'tex');
    editor().patch({ name: 'caption' });
    expect(compositionConflict(editor().session!)).toMatch(/already called "caption"/);
    editor().patch({ name: 'footnote', source: 'A note' });
    expect(editor().apply()).toBe(true);
    expect(current().formulas.at(-1)).toMatchObject({ name: 'footnote', source: 'A note' });

    editor().open(formula.id, first.id);
    editor().makeIndependent();
    expect(compositionConflict(editor().session!)).toBeNull();
    expect(editor().apply()).toBe(true);
    expect(current().formulas.at(-1)!.name).toBe('caption2');
    expect(current().formulas[0]!.name).toBe('caption');

    const again = current().clips.find((clip) => clip.formulaId === formula.id)!;
    editor().open(formula.id, again.id);
    // One use is left: the copy is still its own object, under the name it is given.
    useTextComposition.setState({ session: { ...editor().session!, independent: true } });
    editor().patch({ name: 'footnote' });
    expect(compositionConflict(editor().session!)).toMatch(/already called "footnote"/);
    editor().patch({ name: 'aside' });
    expect(editor().apply()).toBe(true);
    expect(current().formulas.at(-1)!.name).toBe('aside');
  });

  it('brings along the clips still at the previous intro, as the formula editor did', () => {
    const { project, formula, first, other } = latexFixture();
    // `first` is retouched (its own intro); `other` still has what the text gave it (none).
    project.clips[0]!.intro = { ...defaultIntro('fade_in'), duration: 0.5 };
    loadProject(project);
    const before = current();
    editor().open(formula.id, first.id);
    editor().patch({ intro: defaultIntro('write') });
    expect(editor().apply()).toBe(true);
    expect(current().formulas[0]!.intro).toMatchObject({ kind: 'write' });
    expect(current().clips.find((clip) => clip.id === other.id)!.intro.kind).toBe('write');
    expect(current().clips.find((clip) => clip.id === first.id)!.intro).toMatchObject({
      kind: 'fade_in',
      duration: 0.5,
    });
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);

    // Only the duration: the clips at the previous duration follow, keeping their options.
    editor().open(formula.id, first.id);
    editor().patch({ intro: { ...defaultIntro('write'), duration: 2 } });
    expect(editor().apply()).toBe(true);
    expect(current().clips.find((clip) => clip.id === other.id)!.intro).toMatchObject({
      kind: 'write',
      duration: 2,
    });
    history.undo();
    history.undo();
    expect(current()).toBe(before);
  });
});

/** The render of the LaTeX text `formula`, one box per letter, with the key the engine gives it:
 * what the paint of a session counts by. */
function basisOf(formula: TexFormula, source = formula.source): RenderBasis {
  const request = renderRequestFor({ ...formula, source }, current().meta, 'auto');
  const glyphs = [...source.replace(/\s/g, '')].map((label, index) => {
    const bbox = { minX: index, minY: 0, maxX: index + 0.8, maxY: 1 };
    return { index, label, kind: 'char' as const, contours: [rectContour(bbox)], bbox };
  });
  const render: FormulaRender = {
    key: renderKey(request, 'latex', BACKEND_VERSIONS.latex),
    backend: 'latex',
    exact: true,
    target: 'ce',
    fontSize: formula.fontSize,
    glyphs,
    bbox: { minX: 0, minY: 0, maxX: Math.max(1, glyphs.length), maxY: 1 },
    warnings: [],
  };
  return { request, render };
}

/** The LaTeX fixture rendered ("Before": six glyphs), coloured, with a relation between its two
 * clips that names glyphs of both sides. */
function paintedFixture() {
  const { project, formula, first, other } = latexFixture();
  const basis = basisOf(formula);
  Object.assign(project.formulas[0]!, {
    snapshot: toSnapshot(basis.render),
    glyphColors: { '1': '#ff0000' },
    hiddenGlyphs: [5],
  });
  project.clips[1]!.start = 8;
  project.clips[1]!.end = 16;
  project.clips[1]!.trackId = first.trackId;
  project.relations = [
    createRelation(first.id, other.id, { pairs: [{ from: [0, 1], to: [4, 5], style: null }] }),
  ];
  loadProject(project);
  const live = current().formulas[0] as TexFormula;
  return { formula: live, first: current().clips[0]!, basis };
}

describe('the glyph colours of a LaTeX text, from the session to the project', () => {
  beforeEach(() => {
    useSyncWarnings.getState().clear();
    useRenderStore.setState({ transitions: {} });
  });

  it('carries the references of the project with the snapshot, in the one undo step', () => {
    const { formula, first, basis } = paintedFixture();
    const before = current();
    editor().open(formula.id, first.id);
    editor().startPaint(seedPaint(formula, basis, [0, 1, 2, 3, 4, 5]));
    editor().patch({ source: 'XBefor' });
    // "Before" → "XBefor": a glyph in front, the last one gone.
    const next = basisOf(formula, 'XBefor');
    editor().followPaint(next, { map: [1, 2, 3, 4, 5, null], confidence: 0.9 });
    editor().editPaint((paint) => colorGlyphs(paint, [0], '#00ff00'));
    expect(current()).toBe(before);
    expect(editor().apply()).toBe(true);
    const after = current().formulas[0]!;
    expect(after.snapshot).toEqual(toSnapshot(next.render));
    expect(after.glyphColors).toEqual({ '0': '#00ff00', '2': '#ff0000' });
    expect(after.hiddenGlyphs).toEqual([]);
    // Both clips are of this text: both sides of the pair follow; glyph 5 is gone.
    expect(current().relations[0]!.pairs).toMatchObject([{ from: [1, 2], to: [5] }]);
    expect(useRenderStore.getState().transitions[formula.id]).toMatchObject({
      from: formula.snapshot!.key,
      to: next.render.key,
      map: [1, 2, 3, 4, 5, null],
    });
    // What was dropped is said, as the render sync says it.
    expect(useSyncWarnings.getState().warnings[formula.id]).toMatchObject({
      cause: 'edit',
      confidence: 0.9,
      droppedPairGlyphs: 1,
    });
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    history.undo();
    expect(current()).toBe(before);
  });

  it('paints an independent copy without touching the text the other clips share', () => {
    const { formula, first, basis } = paintedFixture();
    editor().open(formula.id, first.id);
    editor().makeIndependent();
    editor().startPaint(seedPaint(formula, basis, [0, 1, 2, 3, 4, 5]));
    editor().editPaint((paint) => hideGlyphs(colorGlyphs(paint, [1], null), [0], true));
    expect(editor().apply()).toBe(true);
    const [shared, copy] = current().formulas;
    expect(shared).toMatchObject({ glyphColors: { '1': '#ff0000' }, hiddenGlyphs: [5] });
    expect(copy).toMatchObject({ glyphColors: {}, hiddenGlyphs: [0, 5] });
    expect(copy!.snapshot).toEqual(shared!.snapshot);
  });

  it('refuses colours that count by another render than the one of the text as written', () => {
    const { formula, first, basis } = paintedFixture();
    editor().open(formula.id, first.id);
    editor().startPaint(seedPaint(formula, basis, [0, 1, 2, 3, 4, 5]));
    editor().editPaint((paint) => colorGlyphs(paint, [0], '#00ff00'));
    const before = current();
    editor().patch({ source: 'Something else' });
    expect(editor().apply()).toBe(false);
    expect(editor().session!.error).toMatch(/earlier render/);
    expect(current()).toBe(before);
    // The colour of the text is no part of its render: the paint is still on it.
    editor().patch({ source: 'Before', color: '#123456' });
    expect(editor().apply()).toBe(true);
    expect(current().formulas[0]).toMatchObject({
      color: '#123456',
      glyphColors: { '0': '#00ff00', '1': '#ff0000' },
    });
  });

  it('lets the paint go when a change cannot be followed: Apply writes the text only', () => {
    const { formula, first, basis } = paintedFixture();
    editor().open(formula.id, first.id);
    editor().startPaint(seedPaint(formula, basis, [0, 1, 2, 3, 4, 5]));
    editor().editPaint((paint) => colorGlyphs(paint, [0], '#00ff00'));
    editor().patch({ source: 'Rewritten' });
    editor().followPaint(basisOf(formula, 'Rewritten'), null);
    expect(editor().session).toMatchObject({ paint: null, paintLost: true });
    // Nothing edits a paint that is not there.
    editor().editPaint((paint) => colorGlyphs(paint, [0], '#0000ff'));
    expect(editor().session!.paint).toBeNull();
    expect(editor().apply()).toBe(true);
    expect(current().formulas[0]).toMatchObject({
      source: 'Rewritten',
      glyphColors: { '1': '#ff0000' },
      hiddenGlyphs: [5],
    });
    expect(current().formulas[0]!.snapshot).toEqual(formula.snapshot);
  });

  it('never replaces a paint the author edited, and replaces one that was not', () => {
    const { formula, first, basis } = paintedFixture();
    editor().open(formula.id, first.id);
    editor().startPaint(seedPaint(formula, basis, [0, 1, 2, 3, 4, 5]));
    editor().startPaint(seedPaint({ ...formula, glyphColors: {} }, basis, [0, 1, 2, 3, 4, 5]));
    expect(editor().session!.paint!.paint.colors).toEqual({});
    editor().editPaint((paint) => colorGlyphs(paint, [3], '#00ff00'));
    editor().startPaint(seedPaint(formula, basis, [0, 1, 2, 3, 4, 5]));
    expect(editor().session!.paint).toMatchObject({
      paint: { colors: { '3': '#00ff00' } },
      edited: true,
    });
    // A font text has no paint of its own here.
    editor().cancel();
    const { formula: font, first: clip } = fixture();
    editor().open(font.id, clip.id);
    editor().startPaint(seedPaint(formula, basis, []));
    expect(editor().session!.paint).toBeNull();
  });

  it('recovers the colours of an unapplied draft with its text, on the render they count by', () => {
    const { formula, first, basis } = paintedFixture();
    editor().open(formula.id, first.id);
    editor().startPaint(seedPaint(formula, basis, [0, 1, 2, 3, 4, 5]));
    editor().patch({ source: 'Before!' });
    const next = basisOf(formula, 'Before!');
    editor().followPaint(next, { map: [0, 1, 2, 3, 4, 5], confidence: 1 });
    editor().editPaint((paint) => colorGlyphs(paint, [6], '#00ff00'));
    useTextComposition.setState({ session: null });

    editor().open(formula.id, first.id);
    expect(editor().session!.recovery?.paint).toEqual({
      key: next.render.key,
      paint: { colors: { '1': '#ff0000', '6': '#00ff00' }, hidden: [5] },
    });
    editor().startPaint(seedPaint(formula, basis, [0, 1, 2, 3, 4, 5]));
    editor().recover();
    expect(editor().session!.paint!.edited).toBe(false);
    // The recovered draft is rendered: its colours are back on that render.
    editor().followPaint(next, { map: [0, 1, 2, 3, 4, 5], confidence: 1 });
    expect(editor().session).toMatchObject({
      recoveredPaint: null,
      paint: { paint: { colors: { '1': '#ff0000', '6': '#00ff00' }, hidden: [5] }, edited: true },
    });
    expect(editor().apply()).toBe(true);
    expect(current().formulas[0]).toMatchObject({
      source: 'Before!',
      glyphColors: { '1': '#ff0000', '6': '#00ff00' },
    });
  });

  it('drops recovered colours that count by another render than the recovered draft got', () => {
    const { formula, first, basis } = paintedFixture();
    editor().open(formula.id, first.id);
    editor().startPaint(seedPaint(formula, basis, [0, 1, 2, 3, 4, 5]));
    editor().editPaint((paint) => colorGlyphs(paint, [0], '#00ff00'));
    editor().patch({ source: 'Before!' });
    useTextComposition.setState({ session: null });
    editor().open(formula.id, first.id);
    editor().startPaint(seedPaint(formula, basis, [0, 1, 2, 3, 4, 5]));
    editor().recover();
    // The colours were set on "Before"; the recovered draft ("Before!") renders otherwise.
    editor().followPaint(basisOf(formula, 'Before!'), { map: [0, 1, 2, 3, 4, 5], confidence: 1 });
    expect(editor().session).toMatchObject({
      recoveredPaint: null,
      paint: { paint: { colors: { '1': '#ff0000' } }, edited: false },
    });
  });
});
