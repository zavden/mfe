import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyProject, createFormula } from '../../../model';
import { history, loadProject, startRenderSync, useProjectStore } from '../../../store';
import { createMockEngine } from '../../../test/mockEngine';
import {
  currentDocumentCheck,
  documentStatus,
  onDocumentReplaced,
  startDocumentTracking,
  useDocumentStore,
} from '../documentStore';

const dirty = () => useDocumentStore.getState().dirty;
const addFormula = (latex = '') =>
  useProjectStore.getState().update((d) => {
    d.formulas.push(createFormula({ name: `f${d.formulas.length + 1}`, source: latex }));
  });

let stop: () => void;
beforeEach(() => {
  loadProject(createEmptyProject());
  useDocumentStore.getState().markClean(useProjectStore.getState().project, {
    fileName: null,
    handle: null,
  });
  stop = startDocumentTracking();
});
afterEach(() => stop());

describe('document tracking', () => {
  it('is clean after loading and dirty after an edit', () => {
    expect(dirty()).toBe(false);
    addFormula();
    expect(dirty()).toBe(true);
  });

  it('is clean again after saving, and after undoing back to the saved state', () => {
    addFormula();
    useDocumentStore
      .getState()
      .markClean(useProjectStore.getState().project, { fileName: 'a.mfe.json' });
    expect(dirty()).toBe(false);
    expect(useDocumentStore.getState().fileName).toBe('a.mfe.json');
    addFormula();
    expect(dirty()).toBe(true);
    history.undo();
    expect(dirty()).toBe(false); // the very same project object comes back
    history.redo();
    expect(dirty()).toBe(true);
  });

  it('markDirty flags restored unsaved work that has no file state', () => {
    useDocumentStore.getState().markDirty({ fileName: 'draft.mfe.json' });
    expect(dirty()).toBe(true);
    expect(useDocumentStore.getState().baseline).toBeNull();
    expect(useDocumentStore.getState().fileName).toBe('draft.mfe.json');
  });

  it('gives every document an id, which a restore keeps and a save does not change', () => {
    const state = () => useDocumentStore.getState();
    const first = state().documentId;
    expect(first).toMatch(/^d_[0-9a-z]{8}$/);
    state().markClean(useProjectStore.getState().project, { fileName: 'a.mfe.json' });
    expect(state().documentId).toBe(first);
    state().beginDocument(useProjectStore.getState().project, { fileName: null, handle: null });
    expect(state().documentId).not.toBe(first);
    state().markDirty({ fileName: 'a.mfe.json', documentId: first });
    expect(state().documentId).toBe(first);
    state().beginDocument(useProjectStore.getState().project, {
      fileName: 'a.mfe.json',
      handle: null,
      documentId: first,
    });
    expect(state().documentId).toBe(first);
    state().markDirty({ fileName: 'b.mfe.json' });
    expect(state().documentId).not.toBe(first);
  });

  it('does not count the render sync’s amendments as unsaved changes', async () => {
    const stopSync = startRenderSync(createMockEngine());
    try {
      // A formula that was saved without a snapshot: opening and rendering it amends one in.
      addFormula('a+b');
      useDocumentStore.getState().markClean(useProjectStore.getState().project);
      expect(useProjectStore.getState().project.formulas[0]!.snapshot).toBeNull();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(useProjectStore.getState().project.formulas[0]!.snapshot).not.toBeNull();
      expect(dirty()).toBe(false);

      // Once the project has unsaved edits, amendments leave it dirty (and undo still works).
      useProjectStore.getState().update((d) => {
        d.formulas[0]!.source = 'a+b+c';
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(dirty()).toBe(true);
      history.undo();
      expect(dirty()).toBe(false);
    } finally {
      stopSync();
    }
  });
});

describe('documentStatus', () => {
  const project = createEmptyProject();

  it('says whether the work is saved, unsaved, or not in a file yet', () => {
    expect(documentStatus({ dirty: true, fileName: 'a.mfe.json', baseline: project })).toEqual({
      text: 'Unsaved changes',
      recovered: false,
    });
    expect(documentStatus({ dirty: false, fileName: 'a.mfe.json', baseline: project }).text).toBe(
      'Saved',
    );
    expect(documentStatus({ dirty: false, fileName: null, baseline: project }).text).toBe(
      'Not saved yet',
    );
  });

  it('marks work brought back by the autosave until it is saved', () => {
    useDocumentStore.getState().markDirty({ fileName: 'a.mfe.json' });
    expect(documentStatus(useDocumentStore.getState())).toEqual({
      text: 'Recovered, not saved',
      recovered: true,
    });
    // Further edits are still recovered work: there is no saved state to compare with.
    useProjectStore.getState().update((d) => {
      d.meta.name = 'Edited';
    });
    expect(documentStatus(useDocumentStore.getState()).text).toBe('Recovered, not saved');
    useDocumentStore.getState().markClean(useProjectStore.getState().project, {
      fileName: 'a.mfe.json',
    });
    expect(documentStatus(useDocumentStore.getState())).toEqual({
      text: 'Saved',
      recovered: false,
    });
  });
});

describe('an original that comes back', () => {
  const saveAs = (fileName: string | null, lacking?: string[]) =>
    useDocumentStore
      .getState()
      .markClean(useProjectStore.getState().project, { fileName, lacking });
  const status = () => documentStatus(useDocumentStore.getState()).text;
  const X = 'a'.repeat(64);
  const Z = 'b'.repeat(64);

  it('leaves a document with a file unsaved, although the project did not change', () => {
    saveAs('talk.mfe');
    expect(status()).toBe('Saved');
    useDocumentStore.getState().noteMediaReturned(X);
    expect(status()).toBe('Unsaved changes');
    // Neither an edit and its undo nor derived data make the file hold it.
    addFormula();
    history.undo();
    expect(dirty()).toBe(true);
    // A save does: it writes every original that is stored.
    saveAs('talk.mfe');
    expect(status()).toBe('Saved');
    addFormula();
    history.undo();
    expect(dirty()).toBe(false);
  });

  it('stays unsaved after a save that was written without it', () => {
    saveAs('talk.mfe');
    // The save's package was prepared without X and Z, and X came back while it was written.
    useDocumentStore.getState().noteMediaReturned(X);
    saveAs('talk.mfe', [X, Z]);
    expect(status()).toBe('Unsaved changes');
    // The next one carries X. Z is still missing, which is no reason to save again.
    saveAs('talk.mfe', [Z]);
    expect(status()).toBe('Saved');
  });

  it('means nothing for a document without a file, and is forgotten with the document', () => {
    saveAs(null);
    useDocumentStore.getState().noteMediaReturned(X);
    expect(status()).toBe('Not saved yet');

    saveAs('talk.mfe');
    useDocumentStore.getState().noteMediaReturned(X);
    useDocumentStore
      .getState()
      .beginDocument(useProjectStore.getState().project, { fileName: 'other.mfe', handle: null });
    expect(status()).toBe('Saved');
    addFormula();
    history.undo();
    expect(dirty()).toBe(false);
  });
});

describe('onDocumentReplaced', () => {
  it('tells of a loaded project and of a new document, not of an edit or a save, until stopped', () => {
    const replaced = vi.fn();
    const off = onDocumentReplaced(replaced);
    addFormula();
    history.undo();
    useDocumentStore.getState().markClean(useProjectStore.getState().project, { fileName: 'a' });
    expect(replaced).not.toHaveBeenCalled();
    loadProject(createEmptyProject());
    expect(replaced).toHaveBeenCalledTimes(1);
    useDocumentStore
      .getState()
      .beginDocument(useProjectStore.getState().project, { fileName: null, handle: null });
    expect(replaced).toHaveBeenCalledTimes(2);
    off();
    loadProject(createEmptyProject());
    useDocumentStore
      .getState()
      .beginDocument(useProjectStore.getState().project, { fileName: null, handle: null });
    expect(replaced).toHaveBeenCalledTimes(2);
  });
});

describe('currentDocumentCheck', () => {
  const begin = () =>
    useDocumentStore
      .getState()
      .beginDocument(useProjectStore.getState().project, { fileName: null, handle: null });

  it('holds while the document is edited, amended, undone or saved', () => {
    const same = currentDocumentCheck();
    expect(same()).toBe(true);
    addFormula();
    useProjectStore.getState().amend((draft) => {
      draft.meta.name = 'Amended';
    });
    history.undo();
    useDocumentStore.getState().markClean(useProjectStore.getState().project, { fileName: 'a' });
    expect(same()).toBe(true);
  });

  it('fails once a project is loaded, though it is the very one that was open', () => {
    const same = currentDocumentCheck();
    loadProject(useProjectStore.getState().project);
    expect(same()).toBe(false);
  });

  it('fails once the document is another: a new one, or work brought back', () => {
    const before = currentDocumentCheck();
    begin();
    expect(before()).toBe(false);
    const restored = currentDocumentCheck();
    useDocumentStore.getState().markDirty();
    expect(restored()).toBe(false);
  });

  it('is of the document it was asked in: one asked later holds', () => {
    const first = currentDocumentCheck();
    loadProject(createEmptyProject());
    begin();
    const second = currentDocumentCheck();
    expect([first(), second()]).toEqual([false, true]);
  });
});
