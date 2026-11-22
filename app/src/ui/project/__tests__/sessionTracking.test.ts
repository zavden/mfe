import { afterEach, describe, expect, it } from 'vitest';
import { createClip, createEmptyProject, createFormula, createShapeFormula } from '../../../model';
import { loadProject, useProjectStore } from '../../../store';
import { useFormulaEditor } from '../../creator/formulaEditorStore';
import { useMultiEdit } from '../../creator/multiEditStore';
import { openFormulaSearch, useFormulaSearch } from '../../creator/search/formulaSearchStore';
import { useGlyphPick } from '../../preview/glyphPickStore';
import { usePathEdit } from '../../preview/pathEdit';
import { startRetarget, useShapeRetarget } from '../../preview/shapeRetarget';
import { useSymbolAlign } from '../../preview/symbolAlign';
import { useTextComposition } from '../../text/textCompositionStore';
import { useDocumentStore } from '../documentStore';
import { startSessionTracking } from '../sessionTracking';

/** Every session open on something, put there as the stores hold it. */
function openSessions() {
  useFormulaEditor.getState().open('f1');
  useMultiEdit.getState().open(['f1', 'f2']);
  useGlyphPick.setState({
    pick: { parts: [{ clipId: 'c1', selection: { selected: new Set([0]), anchor: 0 } }] },
  });
  usePathEdit.setState({
    target: { origin: { kind: 'relation', relationId: 'r1' }, index: 0 },
  });
  useTextComposition.setState({ session: { isNew: true } as never });
  openFormulaSearch();
  useShapeRetarget.setState({ request: { clipId: 'c1' } });
  useSymbolAlign.setState({ phase: { step: 'target' } });
}
const sessions = () => ({
  formula: useFormulaEditor.getState().editing,
  formulas: useMultiEdit.getState().ids,
  pick: useGlyphPick.getState().pick,
  path: usePathEdit.getState().target,
  text: useTextComposition.getState().session,
  // The search of formulas over the Preview: open, or not there.
  search: useFormulaSearch.getState().open || null,
  retarget: useShapeRetarget.getState().request,
  symbol: useSymbolAlign.getState().phase,
});
const NONE = {
  formula: null,
  formulas: null,
  pick: null,
  path: null,
  text: null,
  search: null,
  retarget: null,
  symbol: null,
};
const newDocument = () =>
  useDocumentStore
    .getState()
    .beginDocument(useProjectStore.getState().project, { fileName: null, handle: null });

afterEach(() => {
  const stop = startSessionTracking();
  loadProject(createEmptyProject());
  stop();
});

describe('session tracking', () => {
  it('ends every editing session with its document, when a project loads or the document changes', () => {
    const stop = startSessionTracking();
    openSessions();
    loadProject(createEmptyProject());
    expect(sessions()).toEqual(NONE);
    openSessions();
    newDocument();
    expect(sessions()).toEqual(NONE);
    stop();
  });

  it('ends a session whose things the next document still has: a saved copy keeps the ids', () => {
    const project = createEmptyProject();
    const formula = createFormula({ name: 'f1', source: 'x' });
    const shape = createShapeFormula({ name: 's1', width: 2, height: 1 });
    project.formulas.push(formula, shape);
    const clip = createClip(shape.id, project.tracks[0]!.id, 0, 4);
    project.clips.push(createClip(formula.id, project.tracks[1]!.id, 0, 4), clip);
    loadProject(project);
    const stop = startSessionTracking();
    try {
      // Choosing what the shape goes to; then the same file is opened again.
      startRetarget(clip.id);
      expect(useShapeRetarget.getState().request).toEqual({ clipId: clip.id });
      loadProject(structuredClone(project));
      expect(useProjectStore.getState().project.clips.some((c) => c.id === clip.id)).toBe(true);
      expect(useShapeRetarget.getState().request).toBeNull();
    } finally {
      stop();
    }
  });

  it('listens to nothing before it starts or after it stops', () => {
    openSessions();
    loadProject(createEmptyProject());
    newDocument();
    const open = sessions();
    expect(Object.values(open).every((session) => session !== null)).toBe(true);
    const stop = startSessionTracking();
    stop();
    openSessions();
    loadProject(createEmptyProject());
    newDocument();
    expect(sessions()).toEqual(open);
  });

  it('can run twice at once, as React starts it in development', () => {
    const first = startSessionTracking();
    const second = startSessionTracking();
    first();
    openSessions();
    loadProject(createEmptyProject());
    expect(sessions()).toEqual(NONE);
    second();
  });
});
