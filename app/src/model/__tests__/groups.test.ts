// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  clipGroups,
  createAppear,
  createClip,
  createDisappear,
  createEmphasis,
  createMorph,
  createPartTransform,
  createTween,
  groupMembers,
  groupOf,
  FORMAT_VERSION,
  hasBrokenGroup,
  isGroupable,
  parseProject,
  repairClipGroups,
  repairGroups,
  sameSpan,
  serializeProject,
  type Clip,
  type ClipAction,
  type Project,
} from '../index';
import { loadProject, useProjectStore } from '../../store';
import { smallProject } from './fixtures';

/** A clip with these blocks, in this order. */
function clipWith(...actions: ClipAction[]): Clip {
  return createClip('f', 't', 0, 10, { actions });
}

const write = (id: string, start: number, glyphs: number[], group?: string, duration = 1) => ({
  ...createAppear(start, 'write', glyphs, { duration }),
  id,
  ...(group === undefined ? {} : { group }),
});

const groupsOf = (clip: Clip) => clip.actions.map((a) => groupOf(a) ?? null);

describe('what can be in a group', () => {
  it('is a block that names glyphs', () => {
    expect(isGroupable(createAppear(0, 'write', 'all'))).toBe(true);
    expect(isGroupable(createDisappear(0, 'fade_out', [1]))).toBe(true);
    expect(isGroupable(createPartTransform(0, [1]))).toBe(true);
    expect(isGroupable(createEmphasis(0, 'indicate', 'all'))).toBe(true);
    // A keyframe and a morph take the whole formula: nothing runs with them.
    expect(isGroupable(createTween(0, 1, {}))).toBe(false);
    expect(isGroupable(createMorph(0))).toBe(false);
  });

  it('reads the group of a block, which a keyframe or a morph never has', () => {
    expect(groupOf(write('a', 0, [0], 'g'))).toBe('g');
    expect(groupOf(write('a', 0, [0]))).toBeUndefined();
    expect(groupOf({ ...createTween(0, 1, {}), group: 'g' } as ClipAction)).toBeUndefined();
  });

  it('takes blocks that start together and last the same, float noise aside', () => {
    expect(sameSpan({ start: 1, duration: 2 }, { start: 1, duration: 2 })).toBe(true);
    expect(sameSpan({ start: 1, duration: 2 }, { start: 1 + 1e-9, duration: 2 - 1e-9 })).toBe(true);
    expect(sameSpan({ start: 1, duration: 2 }, { start: 1.01, duration: 2 })).toBe(false);
    expect(sameSpan({ start: 1, duration: 2 }, { start: 1, duration: 1.5 })).toBe(false);
  });
});

describe('the members of a group', () => {
  const clip = clipWith(
    write('a', 1, [0], 'g'),
    write('lone', 1, [1]),
    write('b', 1, [2], 'g'),
    write('c', 4, [3], 'h'),
    write('d', 4, [4], 'h'),
  );

  it('are the blocks of the clip that carry its name, in the order of the clip', () => {
    expect(groupMembers(clip, 'b').map((a) => a.id)).toEqual(['a', 'b']);
    expect(groupMembers(clip, 'a').map((a) => a.id)).toEqual(['a', 'b']);
    expect(groupMembers(clip, 'd').map((a) => a.id)).toEqual(['c', 'd']);
    expect([...clipGroups(clip)].map(([id, members]) => [id, members.map((m) => m.id)])).toEqual([
      ['g', ['a', 'b']],
      ['h', ['c', 'd']],
    ]);
  });

  it('are the block alone when it is in none, and nothing for a block the clip has not', () => {
    expect(groupMembers(clip, 'lone').map((a) => a.id)).toEqual(['lone']);
    expect(groupMembers(clip, 'gone')).toEqual([]);
  });
});

describe('the rule of a group', () => {
  it('holds for two or more blocks that run together', () => {
    const clip = clipWith(write('a', 1, [0], 'g'), write('b', 1, [1], 'g'), write('c', 3, [2]));
    expect(hasBrokenGroup(clip)).toBe(false);
    expect(repairClipGroups(clip)).toEqual([]);
    expect(groupsOf(clip)).toEqual(['g', 'g', null]);
  });

  it('lets go of a block that no longer starts or ends with the others', () => {
    const moved = clipWith(
      write('a', 1, [0], 'g'),
      write('b', 1.5, [1], 'g'),
      write('c', 1, [2], 'g'),
    );
    expect(hasBrokenGroup(moved)).toBe(true);
    expect(repairClipGroups(moved)).toEqual(['b']);
    expect(groupsOf(moved)).toEqual(['g', null, 'g']);
    expect('group' in moved.actions[1]!).toBe(false); // the field goes, it is not left empty

    const stretched = clipWith(write('a', 1, [0], 'g'), write('b', 1, [1], 'g', 2));
    expect(repairClipGroups(stretched)).toEqual(['a', 'b']);
    expect(groupsOf(stretched)).toEqual([null, null]);
  });

  it('is no group with a single block', () => {
    const clip = clipWith(write('a', 1, [0], 'g'), write('b', 1, [1]));
    expect(hasBrokenGroup(clip)).toBe(true);
    expect(repairClipGroups(clip)).toEqual(['a']);
    expect(groupsOf(clip)).toEqual([null, null]);
  });

  it('keeps the most blocks that run together, the first of them when two sets tie', () => {
    const most = clipWith(
      write('a', 1, [0], 'g'),
      write('b', 2, [1], 'g'),
      write('c', 2, [2], 'g'),
      write('d', 2, [3], 'g'),
      write('e', 1, [4], 'g'),
    );
    expect(repairClipGroups(most)).toEqual(['a', 'e']);
    expect(groupsOf(most)).toEqual([null, 'g', 'g', 'g', null]);

    const tie = clipWith(
      write('a', 1, [0], 'g'),
      write('b', 2, [1], 'g'),
      write('c', 1, [2], 'g'),
      write('d', 2, [3], 'g'),
    );
    expect(repairClipGroups(tie)).toEqual(['b', 'd']);
    expect(groupsOf(tie)).toEqual(['g', null, 'g', null]);
  });

  it('is kept by each group of a clip on its own', () => {
    const clip = clipWith(
      write('a', 1, [0], 'g'),
      write('b', 1, [1], 'g'),
      write('c', 4, [2], 'h'),
      write('d', 5, [3], 'h'),
    );
    expect(repairClipGroups(clip)).toEqual(['c', 'd']);
    expect(groupsOf(clip)).toEqual(['g', 'g', null, null]);
  });

  it('is repaired in every clip of a project, which says where', () => {
    const project = smallProject();
    project.clips[0]!.actions = [write('a', 1, [0], 'g'), write('b', 1, [1], 'g')];
    project.clips[1]!.actions = [write('c', 1, [0], 'g'), write('d', 2, [1], 'g')];
    const repaired = repairGroups(project);
    expect(repaired.map(({ clip, left }) => [clip.id, left])).toEqual([
      [project.clips[1]!.id, ['c', 'd']],
    ]);
    expect(groupsOf(project.clips[0]!)).toEqual(['g', 'g']);
    expect(repairGroups(project)).toEqual([]);
  });
});

describe('a group in a project file', () => {
  /** A project whose first clip (5 glyphs, 4 s) has two blocks grouped and one on its own. */
  function grouped() {
    const project = smallProject();
    project.clips[0]!.actions = [
      write('a', 1.5, [0, 1], 'g', 0.5),
      { ...createEmphasis(1.5, 'indicate', [3], { duration: 0.5 }), id: 'b', group: 'g' },
      write('c', 2.5, [2], undefined, 0.5),
    ];
    return project;
  }

  /** The file of a project as the app writes it: read once, so that every key is in its place. */
  function fileOf(project: Project): string {
    const result = parseProject(serializeProject(project));
    if (!result.ok) throw new Error(result.error);
    return serializeProject(result.project);
  }

  it('is written with its blocks and read back as it was', () => {
    const text = fileOf(grouped());
    expect(text.match(/"group": "g"/g)).toHaveLength(2);
    const result = parseProject(text);
    if (!result.ok) throw new Error(result.error);
    expect(result.issues.filter((i) => i.code === 'animation-group-repaired')).toEqual([]);
    expect(result.migratedFrom).toBeNull();
    expect(groupsOf(result.project.clips[0]!)).toEqual(['g', 'g', null]);
    expect('group' in result.project.clips[0]!.actions[2]!).toBe(false);
    expect(serializeProject(result.project)).toBe(text);
  });

  it('is not in a file of format 18, which opens as it is', () => {
    const project = grouped();
    for (const action of project.clips[0]!.actions) delete (action as { group?: string }).group;
    const text = fileOf(project);
    const old = text.replace(`"version": ${FORMAT_VERSION}`, '"version": 18');
    expect(old).not.toBe(text);
    expect(old).not.toContain('"group"');
    const result = parseProject(old);
    if (!result.ok) throw new Error(result.error);
    expect(result.migratedFrom).toBe(18);
    expect(result.project.version).toBe(FORMAT_VERSION);
    expect(groupsOf(result.project.clips[0]!)).toEqual([null, null, null]);
    expect(serializeProject(result.project)).toBe(text);
  });

  it('that breaks the rule is undone when the file is read, and an issue says so', () => {
    const project = grouped();
    project.clips[0]!.actions[1]!.start = 2;
    const result = parseProject(serializeProject(project));
    if (!result.ok) throw new Error(result.error);
    expect(groupsOf(result.project.clips[0]!)).toEqual([null, null, null]);
    const repairs = result.issues.filter((i) => i.code === 'animation-group-repaired');
    expect(repairs).toEqual([
      {
        severity: 'warning',
        code: 'animation-group-repaired',
        message:
          '2 animation blocks were taken out of a group: the blocks of a group start together and last the same, and a group has at least two. Nothing else of them changed.',
        path: ['clips', 0, 'actions'],
      },
    ]);
  });

  it('is left out of a keyframe or a morph that a file gives one', () => {
    const project = grouped();
    const raw = JSON.parse(serializeProject(project)) as {
      clips: { actions: Record<string, unknown>[] }[];
    };
    raw.clips[0]!.actions.push({ ...createMorph(3, { duration: 0.5 }), group: 'g' });
    const result = parseProject(JSON.stringify(raw));
    if (!result.ok) throw new Error(result.error);
    expect(groupsOf(result.project.clips[0]!)).toEqual(['g', 'g', null, null]);
    expect('group' in result.project.clips[0]!.actions[3]!).toBe(false);
  });

  it('must be named, when it is', () => {
    const raw = JSON.parse(serializeProject(grouped())) as {
      clips: { actions: Record<string, unknown>[] }[];
    };
    raw.clips[0]!.actions[0]!.group = '';
    expect(parseProject(JSON.stringify(raw)).ok).toBe(false);
  });
});

describe('the project store', () => {
  const actions = () => useProjectStore.getState().project.clips[0]!.actions;

  function load() {
    const project = smallProject();
    project.clips[0]!.actions = [
      write('a', 1.5, [0], 'g', 0.5),
      write('b', 1.5, [1], 'g', 0.5),
      write('c', 1.5, [2], 'g', 0.5),
    ];
    loadProject(project);
  }

  it('lets a block that an edit moved away leave its group, in the same step', () => {
    load();
    useProjectStore.getState().update((draft) => {
      draft.clips[0]!.actions[1]!.start = 2;
    });
    expect(actions().map((a) => groupOf(a) ?? null)).toEqual(['g', null, 'g']);
    useProjectStore.temporal.getState().undo();
    expect(actions().map((a) => groupOf(a) ?? null)).toEqual(['g', 'g', 'g']);
    expect(actions()[1]!.start).toBe(1.5);
  });

  it('undoes a group that an edit leaves with one block', () => {
    load();
    useProjectStore.getState().update((draft) => {
      draft.clips[0]!.actions.splice(0, 2);
    });
    expect(actions().map((a) => [a.id, groupOf(a) ?? null])).toEqual([['c', null]]);
  });

  it('keeps a group that moves as one, and the very project when nothing changed', () => {
    load();
    useProjectStore.getState().update((draft) => {
      for (const action of draft.clips[0]!.actions) action.start = 2;
    });
    expect(actions().map((a) => groupOf(a) ?? null)).toEqual(['g', 'g', 'g']);
    const before = useProjectStore.getState().project;
    useProjectStore.getState().update(() => {});
    expect(useProjectStore.getState().project).toBe(before);
  });

  it('keeps the rule for what the app amends by itself too', () => {
    load();
    useProjectStore.getState().amend((draft) => {
      draft.clips[0]!.actions[2]!.duration = 0.25;
    });
    expect(actions().map((a) => groupOf(a) ?? null)).toEqual(['g', 'g', null]);
  });
});
