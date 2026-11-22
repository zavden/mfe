/* Split at playhead (D169): the command on the stores — one undo step for the clips of the scene
 * and the sounds, the halves selected, the notices —, when S is the split's key, and what the
 * menus' entry says. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveFormula, toSnapshot, type FormulaRender } from '../../../engine';
import {
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  createTween,
  defaultIntro,
  defaultOutro,
  type Project,
} from '../../../model';
import { audioProject } from '../../../model/__tests__/audioFixtures';
import { smallProject } from '../../../model/__tests__/fixtures';
import { mockRender } from '../../../scene/__tests__/sceneKit';
import {
  history,
  loadProject,
  useProjectStore,
  useRenderStore,
  useUiStore,
  type Selection,
} from '../../../store';
import { startStartsEmptyNotice } from '../../animations/startsEmptyNotice';
import { usePreferences } from '../../preferences';
import { useNoticeStore } from '../../project/noticeStore';
import { withServices } from '../../../test/services';
import { splitAtPlayhead, splitEntry, splitKeyApplies } from '../splitActions';

/** `smallProject`: `a` over [0, 4] and `b` over [2, 6], one second of intro and of outro each, a
 * relation from `a` to `b` whose window is [2, 3] — every formula with its render, which a split
 * waits for. */
async function load(project: Project = smallProject()) {
  const renders = new Map<string, FormulaRender>();
  for (const formula of project.formulas) {
    const render = await mockRender(formula.source);
    formula.snapshot = toSnapshot(render);
    renders.set(formula.id, render);
  }
  loadProject(project);
  const loaded = useProjectStore.getState().project;
  for (const formula of loaded.formulas) {
    useRenderStore.getState().setEntry(formula.id, {
      status: 'ok',
      resolved: resolveFormula(formula, renders.get(formula.id)!),
      error: null,
    });
  }
  return loaded;
}
const select = (ids: string[], time: number) =>
  useUiStore.setState({ selection: { kind: 'clips', ids }, time });
const now = () => useProjectStore.getState().project;
const notices = () => useNoticeStore.getState().notices;

beforeEach(() => {
  history.clear();
  useNoticeStore.setState({ notices: [] });
  usePreferences.getState().set({ splitSuffix: '_s' });
  useUiStore.setState({ selection: { kind: 'none' }, time: 0, playing: false });
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('splitAtPlayhead', () => {
  it('cuts the selected clip in two as one undo step and selects the halves', async () => {
    const project = await load();
    const [a] = project.clips;
    select([a!.id], 1.5);
    expect(splitAtPlayhead()).toBe(true);
    const after = now();
    expect(after.clips).toHaveLength(3);
    const [left, right] = after.clips;
    expect([left!.id, left!.start, left!.end]).toEqual([a!.id, 0, 1.5]);
    expect([right!.start, right!.end]).toEqual([1.5, 4]);
    expect(after.formulas.map((f) => f.name)).toEqual(['a', 'a_s', 'b']);
    expect(right!.formulaId).toBe(after.formulas[1]!.id);
    // The relation, whose window comes after the cut, leaves from the second half.
    expect(after.relations[0]!.fromClipId).toBe(right!.id);
    expect(useUiStore.getState().selection).toEqual({ kind: 'clips', ids: [a!.id, right!.id] });
    expect(notices()).toEqual([]);
    history.undo();
    expect(now()).toBe(project);
  });

  it('names the copy with the suffix of the preferences', async () => {
    const project = await load();
    usePreferences.getState().set({ splitSuffix: '_part' });
    select([project.clips[0]!.id], 1.5);
    splitAtPlayhead();
    expect(now().formulas.map((f) => f.name)).toEqual(['a', 'a_part', 'b']);
  });

  it('splits the clips it is given, selected or not', async () => {
    const project = await load();
    useUiStore.setState({ time: 4.5 });
    expect(splitAtPlayhead([project.clips[1]!.id])).toBe(true);
    expect(now().formulas.map((f) => f.name)).toEqual(['a', 'b', 'b_s']);
  });

  it('leaves a clip whole when something crosses the playhead, and says what', async () => {
    const project = await load();
    select([project.clips[0]!.id], 0.5);
    expect(splitAtPlayhead()).toBe(false);
    expect(now()).toBe(project);
    expect(notices()).toHaveLength(1);
    expect(notices()[0]).toMatchObject({ kind: 'warning', title: '“a” was not split' });
    expect(notices()[0]!.message).toMatch(/intro \(Write\) is still running/);
  });

  it('names every clip that stayed whole in one notice, with its reason (A2-02)', async () => {
    const project = await load();
    const [a, b] = project.clips;
    // At 2.5 s the relation's window crosses the playhead in a, and the intro of b is running.
    select([a!.id, b!.id], 2.5);
    expect(splitAtPlayhead()).toBe(false);
    expect(now()).toBe(project);
    expect(notices()).toHaveLength(1);
    expect(notices()[0]).toMatchObject({
      kind: 'warning',
      title: '2 clips were not split',
      message: 'They stay whole:',
    });
    expect(notices()[0]!.details).toEqual([
      '“a”: The relation from “a” to “b” (2.00–3.00 s) crosses the playhead.',
      '“b”: Its intro (FadeIn) is still running at the playhead: it ends at 3.00 s.',
    ]);
  });

  it('keeps selected a clip that stayed whole, with the halves of the others', async () => {
    const project = await load();
    const [a, b] = project.clips;
    // The playhead is inside b alone.
    select([a!.id, b!.id], 4.5);
    expect(splitAtPlayhead()).toBe(true);
    const right = now().clips.find((clip) => clip.start === 4.5)!;
    expect(useUiStore.getState().selection).toEqual({
      kind: 'clips',
      ids: [a!.id, b!.id, right.id],
    });
  });

  it('waits for the render of the formula', async () => {
    const project = await load();
    const [a] = project.clips;
    useRenderStore.getState().retain([]);
    select([a!.id], 1.5);
    expect(splitAtPlayhead()).toBe(false);
    expect(now()).toBe(project);
    expect(notices()[0]!.message).toBe(
      '“a” has no render yet: split the clip once the preview draws it.',
    );
  });

  it('says where the playhead goes when it is inside no selected clip', async () => {
    const project = await load();
    select([project.clips[0]!.id], 5);
    expect(splitAtPlayhead()).toBe(false);
    expect(notices()[0]).toMatchObject({
      kind: 'info',
      title: 'Place the playhead inside a selected, unlocked clip to split it.',
    });
  });

  it('splits a sound and a clip of the scene together, in one step', async () => {
    const { project: base, clip: sound } = audioProject();
    const scene = smallProject();
    const merged: Project = {
      ...base,
      tracks: [...scene.tracks, ...base.tracks.filter((t) => t.kind === 'audio')],
      formulas: scene.formulas,
      clips: scene.clips.map((clip) => ({ ...clip, start: clip.start + 10, end: clip.end + 10 })),
      relations: scene.relations,
    };
    const project = await load(merged);
    const a = project.clips[0]!;
    select([a.id, sound.id], 11.5);
    expect(splitAtPlayhead()).toBe(true);
    expect(now().clips).toHaveLength(3);
    expect(now().audioClips.map((c) => [c.start, c.end])).toEqual([
      [10, 11.5],
      [11.5, 20],
    ]);
    const selection = useUiStore.getState().selection;
    expect(selection.kind === 'clips' && selection.ids).toHaveLength(4);
    history.undo();
    expect(now()).toBe(project);
  });

  it('still says where the playhead goes for a sound alone', async () => {
    const { project, clip } = audioProject();
    await load(project);
    select([clip.id], 5);
    expect(splitAtPlayhead()).toBe(false);
    expect(notices()[0]!.title).toBe(
      'Place the playhead inside a selected, unlocked audio clip to split it.',
    );
  });
});

describe('splitKeyApplies', () => {
  const focusIn = (testId: string) => {
    const panel = document.createElement('div');
    panel.dataset.testid = testId;
    const inner = document.createElement('button');
    panel.append(inner);
    document.body.append(panel);
    inner.focus();
  };

  it('is the split key while a selected clip has the playhead inside', async () => {
    const project = await load();
    const ids = [project.clips[0]!.id];
    const selection: Selection = { kind: 'clips', ids };
    expect(splitKeyApplies(project, selection, 1.5)).toBe(true);
    expect(splitKeyApplies(project, selection, 5)).toBe(false);
    expect(splitKeyApplies(project, selection, 4)).toBe(false);
    expect(splitKeyApplies(project, { kind: 'none' }, 1.5)).toBe(false);
  });

  it('stays the circle selector while the keyboard is in the Preview', async () => {
    const project = await load();
    const selection: Selection = { kind: 'clips', ids: [project.clips[0]!.id] };
    focusIn('panel-preview');
    expect(splitKeyApplies(project, selection, 1.5)).toBe(false);
    focusIn('panel-timeline');
    expect(splitKeyApplies(project, selection, 1.5)).toBe(true);
  });

  it('answers as with no menu while one is open elsewhere: S in the menu never comes here', async () => {
    // The two listeners leave a key pressed in an open menu to it before they ask
    // (`inOpenMenu`); pressed on the clip that has the focus, S splits it whatever is open.
    const project = await load();
    const selection: Selection = { kind: 'clips', ids: [project.clips[0]!.id] };
    focusIn('panel-timeline');
    const menu = document.createElement('div');
    menu.setAttribute('role', 'menu');
    document.body.append(menu);
    expect(splitKeyApplies(project, selection, 1.5)).toBe(true);
    expect(splitKeyApplies(project, selection, 5)).toBe(false);
    menu.remove();
    expect(splitKeyApplies(project, selection, 1.5)).toBe(true);
  });

  it('is not for a clip on a locked track, and always for a selected sound', async () => {
    const scene = smallProject();
    scene.tracks[0]!.locked = true;
    const project = await load(scene);
    const selection: Selection = { kind: 'clips', ids: [project.clips[0]!.id] };
    expect(splitKeyApplies(project, selection, 1.5)).toBe(false);
    const { project: audio, clip } = audioProject();
    expect(splitKeyApplies(await load(audio), { kind: 'clips', ids: [clip.id] }, 0)).toBe(true);
  });
});

describe('splitEntry', () => {
  it('says what the split makes, or why it is off', async () => {
    const scene = smallProject();
    scene.clips[0]!.actions.push(createTween(1.2, 0.5, { scale: 2 }));
    const project = await load(scene);
    const [a, b] = project.clips;
    const on = splitEntry(project, [a!.id], 1.5, '_s')!;
    expect(on).toMatchObject({ label: 'Split at playhead (S)', disabled: false });
    expect(on.title).toContain('a copy of “a”, “a_s”');
    const off = splitEntry(project, [a!.id], 5, '_s')!;
    expect(off).toMatchObject({
      disabled: true,
      title: 'Place the playhead inside the clip to split it there.',
    });
    const both = splitEntry(project, [a!.id, b!.id], 2.5, '_s')!;
    expect(both.title).toMatch(/^Cuts the 2 clips under the playhead in two/);
    expect(splitEntry(project, [a!.id, b!.id], 7, '_s')!.title).toBe(
      'Place the playhead inside one of the clips to split it there.',
    );
    expect(splitEntry(project, ['nothing'], 1, '_s')).toBeNull();
  });

  it('is off for a clip on a locked track', async () => {
    const scene = smallProject();
    scene.tracks[0]!.locked = true;
    const project = await load(scene);
    expect(splitEntry(project, [project.clips[0]!.id], 1.5, '_s')).toMatchObject({
      disabled: true,
      title: 'The clip is on a locked track.',
    });
  });
});

describe('a split of a clip that starts empty, before anything fills it (A2-01)', () => {
  withServices(startStartsEmptyNotice);

  it('does not say the clip is left with nothing to show: the video is the same', async () => {
    // b (x+y) over [0, 9] on one track; a (x+y=z) over [0, 10] on the other, starting empty: a
    // relation brings its first three glyphs at 6 s.
    const project = createEmptyProject();
    const fa = createFormula({ name: 'a', source: 'x+y=z' });
    const fb = createFormula({ name: 'b', source: 'x+y' });
    project.formulas.push(fa, fb);
    const b = createClip(fb.id, project.tracks[1]!.id, 0, 9, {
      intro: defaultIntro('write'),
      outro: defaultOutro('none'),
    });
    const a = createClip(fa.id, project.tracks[0]!.id, 0, 10, {
      intro: defaultIntro('write'),
      outro: defaultOutro('fade_out'),
      startsEmpty: true,
    });
    project.clips.push(b, a);
    project.relations.push(
      createRelation(b.id, a.id, {
        offset: 6,
        duration: 1,
        pairs: [{ from: [0, 1, 2], to: [0, 1, 2], style: 'transform' }],
      }),
    );
    await load(project);
    select([a.id], 5);
    expect(splitAtPlayhead()).toBe(true);
    expect(now().clips).toHaveLength(3);
    expect(notices().map((n) => n.title)).toEqual([]);
  });
});
