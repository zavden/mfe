// @vitest-environment node
/* Deleting a clip that a brace or a shape spans along with others (D117): the object stays,
 * detached, in the same undo step, and a notice says so (freedObjects.ts, clipActions.ts). */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createBraceAttach,
  createBraceFormula,
  createClip,
  createEmptyProject,
  createFormula,
  createShapeAttach,
  createShapeFormula,
  createTrack,
  type Project,
} from '../../../model';
import { history, loadProject, useProjectStore, useUiStore } from '../../../store';
import { useNoticeStore } from '../../project/noticeStore';
import { deleteClipsAsking } from '../clipActions';
import { reportFreed } from '../freedObjects';

const project = () => useProjectStore.getState().project;
const notices = () => useNoticeStore.getState().notices;
const attachOf = (id: string) => project().clips.find((c) => c.id === id)?.attach;

/** Formulas f and g on two tracks, a brace `b1` and a shape `s1` over glyphs of both. */
function spanning(): Project {
  const p = createEmptyProject();
  const [t1, t2] = p.tracks;
  const t3 = createTrack('Track 3');
  const t4 = createTrack('Track 4');
  p.tracks.push(t3, t4);
  const f = { ...createFormula({ name: 'f' }), id: 'f' };
  const g = { ...createFormula({ name: 'g' }), id: 'g' };
  const b1 = { ...createBraceFormula({ name: 'b1' }), id: 'b1' };
  const s1 = { ...createShapeFormula({ name: 's1' }), id: 's1' };
  p.formulas.push(f, g, b1, s1);
  const clip = (
    id: string,
    formulaId: string,
    trackId: string,
    attach: Project['clips'][0]['attach'],
  ) => ({
    ...createClip(formulaId, trackId, 0, 6, { attach }),
    id,
  });
  p.clips.push(
    clip('cf', 'f', t1!.id, null),
    clip('cg', 'g', t2!.id, null),
    clip(
      'cb',
      'b1',
      t3.id,
      createBraceAttach('cf', [0], { also: [{ clipId: 'cg', glyphs: [1] }] }),
    ),
    clip('cs', 's1', t4.id, createShapeAttach('cg', 'all', 0.1, [{ clipId: 'cf', glyphs: 'all' }])),
  );
  return p;
}

beforeEach(() => {
  loadProject(spanning());
  useUiStore.setState({ selection: { kind: 'clips', ids: ['cf'] } });
  useNoticeStore.getState().clear();
});

describe('reportFreed', () => {
  it('says nothing when nothing was freed', () => {
    reportFreed(project(), []);
    expect(notices()).toEqual([]);
  });

  it('names the object that was detached, or counts and lists several', () => {
    const [, , brace, shape] = project().clips;
    reportFreed(project(), [brace!]);
    reportFreed(project(), [brace!, shape!]);
    expect(notices().map(({ kind, title, details }) => [kind, title, details])).toEqual([
      ['info', '“b1” detached', undefined],
      ['info', '2 objects detached', ['b1', 's1']],
    ]);
    expect(notices()[0]!.message).toContain('it stays where it is, a free object now');
    expect(notices()[1]!.message).toContain('they stay where they are, free objects now');
  });
});

describe('deleting a clip that a brace and a shape span with another', () => {
  it('deletes the clip alone, without asking, frees the two and says so; one undo step', async () => {
    expect(await deleteClipsAsking(new Set(['cf']))).toBe(true);
    expect(project().clips.map((c) => c.id)).toEqual(['cg', 'cb', 'cs']);
    expect(attachOf('cb')).toBeNull();
    expect(attachOf('cs')).toBeNull();
    expect(notices().map((notice) => notice.title)).toEqual(['2 objects detached']);
    expect(useProjectStore.temporal.getState().pastStates).toHaveLength(1);
    history.undo();
    expect(project().clips.map((c) => c.id)).toEqual(['cf', 'cg', 'cb', 'cs']);
    expect(attachOf('cb')).toMatchObject({ clipId: 'cf', also: [{ clipId: 'cg', glyphs: [1] }] });
    expect(attachOf('cs')).toMatchObject({ clipId: 'cg', also: [{ clipId: 'cf', glyphs: 'all' }] });
  });

  it('says nothing when the brace is deleted itself', async () => {
    expect(await deleteClipsAsking(new Set(['cb']))).toBe(true);
    expect(project().clips.map((c) => c.id)).toEqual(['cf', 'cg', 'cs']);
    expect(attachOf('cs')).not.toBeNull();
    expect(notices()).toEqual([]);
  });
});
