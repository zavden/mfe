import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createClip,
  createEmptyProject,
  createTextFormula,
  type TextGeometryArtifact,
  type TextGeometryRef,
} from '../../../model';
import { toSnapshot } from '../../../engine/key';
import { textArtifactRender } from '../../../engine/pango';
import { textGeometry } from '../../../test/textGeometry';
import { history, loadProject, useProjectStore, useRenderStore, useUiStore } from '../../../store';
import * as geometry from '../../../media/textGeometry';
import * as ownership from '../../../store/mediaOwnership';
import { useDocumentStore } from '../../project/documentStore';
import { useNoticeStore } from '../../project/noticeStore';
import { useTransformEdit } from '../../animations/transformEdit';
import { withServices } from '../../../test/services';
import { startTextCompositionTracking, useTextComposition } from '../textCompositionStore';

vi.mock('../../../media/textGeometry', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../media/textGeometry')>()),
  storeTextGeometry: vi.fn(),
  loadTextGeometry: vi.fn(),
  discardTextGeometry: vi.fn(),
}));
vi.mock('../../../store/mediaOwnership', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../store/mediaOwnership')>()),
  syncCurrentMediaOwnership: vi.fn(),
}));
vi.mock('../../transport/mainPlayback', () => ({ mainPlayback: { pause: vi.fn() } }));

withServices(startTextCompositionTracking);

const editor = () => useTextComposition.getState();
const project = () => useProjectStore.getState().project;
const reference = (artifact: TextGeometryArtifact, letter: string): TextGeometryRef => ({
  contentHash: letter.repeat(64),
  byteLength: 100,
  key: artifact.key,
  basisKey: artifact.basisKey,
});

function setup() {
  const previous = textGeometry('AB');
  const next = textGeometry('AB');
  next.key += '-refreshed';
  next.provenance.environmentKey += '-refreshed';
  const oldRender = textArtifactRender(previous);
  const oldReference = reference(previous, 'a');
  const p = createEmptyProject();
  const formula = createTextFormula({
    source: 'AB',
    name: 'title',
    geometry: oldReference,
    snapshot: toSnapshot(oldRender),
    glyphColors: { '0': '#FF0000' },
  });
  const clip = createClip(formula.id, p.tracks[0]!.id, 0, 8);
  p.formulas = [formula];
  p.clips = [clip];
  loadProject(p);
  useDocumentStore.getState().beginDocument(p, { fileName: null, handle: null });
  useRenderStore.setState({
    resolved: new Map([
      [
        formula.id,
        {
          formula,
          render: oldRender,
          canonToRender: [0, 1],
          confidence: 1,
        },
      ],
    ]),
    entries: {},
    transitions: {},
  });
  const release = vi.fn(async () => {});
  const stored: geometry.StoredTextGeometry = {
    artifact: next,
    reference: reference(next, 'b'),
    lease: { ownerId: 'prepared-test', release },
  };
  vi.mocked(geometry.storeTextGeometry).mockResolvedValue(stored);
  vi.mocked(geometry.loadTextGeometry).mockResolvedValue(previous);
  editor().open(formula.id, clip.id);
  editor().refresh();
  return { before: p, formula, stored, release, render: textArtifactRender(next), oldReference };
}

beforeEach(() => {
  editor().cancel();
  vi.clearAllMocks();
  useNoticeStore.getState().clear();
  useTransformEdit.setState({ editing: null, unlocked: [] });
  useUiStore.setState({ time: 0, playing: false, selection: { kind: 'none' } });
  vi.mocked(ownership.syncCurrentMediaOwnership).mockResolvedValue();
  vi.mocked(geometry.discardTextGeometry).mockResolvedValue();
});

describe('explicit text appearance transaction', () => {
  it('commits prepared geometry, canonical correspondence and placement in one Undo', async () => {
    const { before, formula, stored, release, render } = setup();
    editor().setPosition([2, -1]);
    expect(await editor().apply(render)).toBe(true);
    expect(project().formulas[0]).toMatchObject({
      geometry: stored.reference,
      snapshot: { key: render.key },
      glyphColors: { '0': '#FF0000' },
    });
    expect(project().clips[0]!.initial.position).toEqual([2, -1]);
    expect(useRenderStore.getState().transitions[formula.id]).toMatchObject({
      to: render.key,
      map: [0, 1],
    });
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    expect(ownership.syncCurrentMediaOwnership).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
    expect(geometry.discardTextGeometry).not.toHaveBeenCalled();
    history.undo();
    expect(project()).toBe(before);
  });

  it('retains old durable appearance on failed preparation and rejects duplicate Apply', async () => {
    const { before, render } = setup();
    let reject!: (error: Error) => void;
    vi.mocked(geometry.storeTextGeometry).mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const pending = editor().apply(render);
    expect(editor().session!.applying).toBe(true);
    expect(editor().apply(render)).toBe(false);
    reject(new Error('Storage quota exceeded'));
    expect(await pending).toBe(false);
    expect(project()).toBe(before);
    expect(editor().session).toMatchObject({ applying: false, error: 'Storage quota exceeded' });
    expect(history.canUndo()).toBe(false);
  });

  it('discards a superseded prepared lease without modifying a newer editor or document', async () => {
    const { before, formula, render, stored } = setup();
    let finish!: (stored: geometry.StoredTextGeometry) => void;
    vi.mocked(geometry.storeTextGeometry).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = editor().apply(render);
    editor().cancel();
    editor().open(formula.id);
    editor().patch({ source: 'New editor draft' });
    finish(stored);
    expect(await pending).toBe(false);
    expect(project()).toBe(before);
    expect(editor().session!.draft.source).toBe('New editor draft');
    expect(geometry.discardTextGeometry).toHaveBeenCalledWith(stored);
    expect(ownership.syncCurrentMediaOwnership).not.toHaveBeenCalled();
  });

  it('revalidates source and locks after storage completes, retaining the draft on conflict', async () => {
    const { render, stored, oldReference } = setup();
    let finish!: (stored: geometry.StoredTextGeometry) => void;
    vi.mocked(geometry.storeTextGeometry).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = editor().apply(render);
    useProjectStore.getState().update((draft) => {
      draft.tracks[0]!.locked = true;
    });
    finish(stored);
    expect(await pending).toBe(false);
    expect(project().formulas[0]).toMatchObject({ geometry: oldReference });
    expect(editor().session!.error).toContain('locked');
    expect(geometry.discardTextGeometry).toHaveBeenCalledWith(stored);
    expect(useRenderStore.getState().transitions).toEqual({});
  });

  it('keeps the prepared pin when ownership handoff fails after publication', async () => {
    const { render, stored, release } = setup();
    vi.mocked(ownership.syncCurrentMediaOwnership).mockRejectedValue(new Error('Pin failed'));
    expect(await editor().apply(render)).toBe(true);
    expect(project().formulas[0]).toMatchObject({ geometry: stored.reference });
    expect(release).not.toHaveBeenCalled();
    expect(geometry.discardTextGeometry).not.toHaveBeenCalled();
    expect(
      useNoticeStore
        .getState()
        .notices.some((notice) => notice.title.includes('storage needs attention')),
    ).toBe(true);
  });
});
