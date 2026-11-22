import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createEmptyProject,
  createFormula,
  FORMAT_VERSION,
  serializeProject,
} from '../../../model';
import { history, loadProject, useProjectStore, useUiStore } from '../../../store';
import { installTestPalette } from '../../colors/__tests__/paletteFixtures';
import { usePaletteStore } from '../../colors/paletteStore';
import { initializeNewEditorProject, newProject, openProjectText } from '../actions';
import { AUTOSAVE_PREFIX, restoreAutosave } from '../autosave';
import { useDialogStore } from '../dialogStore';
import { startDocumentTracking, useDocumentStore } from '../documentStore';
import { createNewEditorProject } from '../newEditorProject';
import { useNoticeStore } from '../noticeStore';

vi.mock('../files', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../files')>()),
  storeHandle: vi.fn(async () => undefined),
}));

const project = () => useProjectStore.getState().project;
const doc = () => useDocumentStore.getState();
let stopTracking: () => void;

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  usePaletteStore.setState(usePaletteStore.getInitialState(), true);
  loadProject(useProjectStore.getInitialState().project);
  useDocumentStore.setState({ ...useDocumentStore.getInitialState(), baseline: project() }, true);
  useUiStore.setState({ selection: { kind: 'none' }, time: 0, playing: false });
  useDialogStore.setState({ queue: [] });
  useNoticeStore.getState().clear();
  stopTracking = startDocumentTracking();
});

afterEach(() => {
  stopTracking();
  usePaletteStore.setState(usePaletteStore.getInitialState(), true);
  loadProject(createEmptyProject());
  useDocumentStore.getState().markClean(project(), { fileName: null, handle: null });
  window.sessionStorage.clear();
});

describe('palette backgrounds at document creation', () => {
  it('keeps Manim defaults without activation and does not change pure model factories', () => {
    installTestPalette(false);
    expect(createNewEditorProject().meta.background).toBe('#000000');
    const entry = installTestPalette();
    expect(createNewEditorProject().meta.background).toBe(entry.source.colors.background);
    expect(createEmptyProject().meta.background).toBe('#000000');
  });

  it('creates File New with the active background as its clean baseline and no undo step', async () => {
    const entry = installTestPalette();
    const previous = createEmptyProject('Previous');
    previous.meta.background = '#ABCDEF';
    previous.formulas.push(createFormula({ color: '#135790' }));
    loadProject(previous);
    doc().beginDocument(project(), { fileName: 'previous.mfe.json', handle: null });
    const beforeSession = doc().session;
    await newProject();
    expect(project().meta.background).toBe(entry.source.colors.background);
    expect(project().formulas).toEqual([]);
    expect(doc()).toMatchObject({
      baseline: project(),
      dirty: false,
      fileName: null,
      session: beforeSession + 1,
    });
    expect(doc().baseline).toBe(project());
    expect(history.canUndo()).toBe(false);
    expect(usePaletteStore.getState().library.activePaletteId).toBe(entry.id);
    const saved = serializeProject(project());
    expect(JSON.parse(saved).version).toBe(FORMAT_VERSION);
    expect(saved).not.toMatch(/manim-palette|preference_palette|fontScale/);
  });

  it('preserves saved background and authored object colors on Open', () => {
    const entry = installTestPalette();
    const saved = createEmptyProject('Authored project');
    saved.meta.background = '#112233';
    saved.formulas.push(createFormula({ name: 'authored', color: '#445566' }));
    expect(
      openProjectText(serializeProject(saved), { fileName: 'authored.mfe.json', handle: null }),
    ).toBe(true);
    const opened = project();
    initializeNewEditorProject();
    expect(project()).toBe(opened);
    expect(project().meta.background).toBe('#112233');
    expect(project().formulas[0]!.color).toBe('#445566');
    expect(doc()).toMatchObject({ baseline: opened, dirty: false, fileName: 'authored.mfe.json' });
    expect(history.canUndo()).toBe(false);
    expect(usePaletteStore.getState().library.palettes).toEqual([entry]);
  });

  it.each([false, true])('preserves recovered colors and document state when dirty=%s', (dirty) => {
    const entry = installTestPalette();
    const saved = createEmptyProject('Recovered project');
    saved.meta.background = '#223344';
    saved.formulas.push(createFormula({ color: '#556677' }));
    window.localStorage.setItem(
      `${AUTOSAVE_PREFIX}previous-page`,
      JSON.stringify({
        v: 3,
        name: saved.meta.name,
        text: serializeProject(saved),
        dirty,
        fileName: 'recovered.mfe.json',
        documentId: 'd_recovered',
        savedAt: Date.now(),
      }),
    );
    expect(restoreAutosave()).toBe(true);
    const restored = project();
    initializeNewEditorProject();
    expect(project()).toBe(restored);
    expect(project().meta.background).toBe('#223344');
    expect(project().formulas[0]!.color).toBe('#556677');
    expect(doc()).toMatchObject({
      dirty,
      documentId: 'd_recovered',
      fileName: 'recovered.mfe.json',
    });
    expect(doc().baseline).toBe(dirty ? null : restored);
    expect(history.canUndo()).toBe(false);
    expect(usePaletteStore.getState().library.activePaletteId).toBe(entry.id);
  });

  it('initializes the exact pristine first-start project once, including repeated React initialization', () => {
    const entry = installTestPalette();
    expect(doc().session).toBe(0);
    expect(project()).toBe(useProjectStore.getInitialState().project);
    initializeNewEditorProject();
    const initialized = project();
    const documentId = doc().documentId;
    initializeNewEditorProject();
    expect(project()).toBe(initialized);
    expect(project().meta.background).toBe(entry.source.colors.background);
    expect(doc()).toMatchObject({ baseline: initialized, dirty: false, session: 1, documentId });
    expect(history.canUndo()).toBe(false);
  });

  it('does not treat a session-zero replacement or edit as an untouched first-start project', () => {
    installTestPalette();
    const replacement = structuredClone(useProjectStore.getInitialState().project);
    loadProject(replacement);
    expect(doc().session).toBe(0);
    initializeNewEditorProject();
    expect(project()).toBe(replacement);
    expect(doc().session).toBe(0);
    loadProject(useProjectStore.getInitialState().project);
    useProjectStore.getState().update((draft) => {
      draft.meta.name = 'Already edited';
    });
    const edited = project();
    initializeNewEditorProject();
    expect(project()).toBe(edited);
    expect(doc().dirty).toBe(true);
    expect(history.canUndo()).toBe(true);
  });
});
