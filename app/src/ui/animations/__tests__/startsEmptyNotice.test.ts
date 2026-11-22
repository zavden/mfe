// @vitest-environment node
/* The notice a clip that starts empty gets when an edit takes away what filled it. */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAppear, defaultIntro, type Project } from '../../../model';
import { smallProject } from '../../../model/__tests__/fixtures';
import { history, loadProject, useProjectStore } from '../../../store';
import { useNoticeStore } from '../../project/noticeStore';
import { clipsLeftEmpty, leftEmptyNotice, startStartsEmptyNotice } from '../startsEmptyNotice';

/** `smallProject` — a on [0, 4], b on [2, 6], a:0 → b:3 — with b starting empty. */
function scene(): Project {
  const project = smallProject();
  project.clips[1]!.startsEmpty = true;
  return project;
}

const without = (project: Project, change: (draft: Project) => void): Project => {
  const copy = structuredClone(project);
  change(copy);
  return copy;
};

describe('clipsLeftEmpty', () => {
  it('names the clip that started empty, showed something and no longer does', () => {
    const before = scene();
    const b = before.clips[1]!.id;
    const unrelated = without(before, (p) => void (p.relations = []));
    expect(clipsLeftEmpty(before, unrelated)).toEqual([b]);
    // The source clip deleted with its relation: the same.
    const alone = without(before, (p) => {
      p.relations = [];
      p.clips = [p.clips[1]!];
    });
    expect(clipsLeftEmpty(before, alone)).toEqual([b]);
  });

  it('says nothing while something still fills the clip', () => {
    const before = scene();
    before.clips[1]!.actions.push(createAppear(1.5, 'write', [0], { duration: 0.5 }));
    // The relation goes, the Appear block stays.
    expect(
      clipsLeftEmpty(
        before,
        without(before, (p) => void (p.relations = [])),
      ),
    ).toEqual([]);
    // Both go: now it is left empty.
    const bare = without(before, (p) => {
      p.relations = [];
      p.clips[1]!.actions = [];
    });
    expect(clipsLeftEmpty(before, bare)).toEqual([before.clips[1]!.id]);
  });

  it('is not about a clip that was empty already, just marked, deleted or not rendered', () => {
    const filled = scene();
    const bare = without(filled, (p) => void (p.relations = []));
    // Empty before and after.
    expect(clipsLeftEmpty(bare, bare)).toEqual([]);
    // "Starts empty" ticked on a clip nothing fills: its Problems section says it there.
    const unmarked = without(bare, (p) => void delete p.clips[1]!.startsEmpty);
    expect(clipsLeftEmpty(unmarked, bare)).toEqual([]);
    // The clip itself deleted.
    const gone = without(filled, (p) => {
      p.relations = [];
      p.clips = [p.clips[0]!];
    });
    expect(clipsLeftEmpty(filled, gone)).toEqual([]);
    // Its formula gets its glyphs (a render): it had none to show before.
    const unrendered = without(bare, (p) => void (p.formulas[1]!.snapshot = null));
    expect(clipsLeftEmpty(unrendered, bare)).toEqual([]);
    // Filled again: nothing to say.
    expect(clipsLeftEmpty(bare, filled)).toEqual([]);
  });

  it('is not about a clip cut short before what filled it came: the first half of a split (A2-01)', () => {
    const before = scene();
    const b = before.clips[1]!;
    b.intro = defaultIntro('none');
    // The relation fills b from 2.5 s on.
    before.relations[0]!.offset = 0.5;
    // Split at 2.25 s: the first half — b, which keeps its id — ends before the relation comes,
    // and the second half takes the relation. The video is the same: nothing was lost.
    const split = without(before, (p) => {
      const first = p.clips[1]!;
      p.clips.push({ ...structuredClone(first), id: 'b-second', start: 2.25 });
      first.end = 2.25;
      p.relations[0]!.toClipId = 'b-second';
      p.relations[0]!.offset = 0.25;
    });
    expect(clipsLeftEmpty(before, split)).toEqual([]);
    // What filled it taken away is still said.
    const bare = without(before, (p) => void (p.relations = []));
    expect(clipsLeftEmpty(before, bare)).toEqual([b.id]);
  });
});

describe('leftEmptyNotice', () => {
  it('names the clips by their formulas, one or several', () => {
    const project = scene();
    const [a, b] = project.clips;
    expect(leftEmptyNotice(project, [b!.id])).toEqual({
      title: '“b” starts empty and nothing fills it now',
      message:
        'It will not show. Relate it again, add an Appear block, or untick “Starts empty” in its Intro (Animations ▸ Timing).',
    });
    expect(leftEmptyNotice(project, [a!.id, b!.id]).title).toBe(
      '“a” and “b” start empty and nothing fills them now',
    );
  });
});

describe('the service', () => {
  let stop: () => void;
  beforeEach(() => {
    useNoticeStore.getState().clear();
    loadProject(scene());
    stop = startStartsEmptyNotice();
  });
  afterEach(() => {
    stop();
    useNoticeStore.getState().clear();
  });
  const notices = () => useNoticeStore.getState().notices.map((n) => [n.kind, n.title]);

  it('says so once when an edit leaves the clip empty, and again after an undo and a redo', () => {
    expect(notices()).toEqual([]);
    useProjectStore.getState().update((draft) => {
      draft.relations = [];
    });
    expect(notices()).toEqual([['warning', '“b” starts empty and nothing fills it now']]);
    // An edit of something else adds nothing.
    useProjectStore.getState().update((draft) => {
      draft.clips[0]!.end = 4.5;
    });
    expect(notices()).toHaveLength(1);
    // Undone (twice), the clip is filled again: silence. Redone, it is left empty again.
    history.undo();
    history.undo();
    expect(notices()).toHaveLength(1);
    history.redo();
    expect(notices()).toHaveLength(2);
  });

  it('takes another document for what it is: not an edit of the one before', () => {
    const empty = scene();
    empty.relations = [];
    loadProject(empty);
    expect(notices()).toEqual([]);
    // And goes on watching the new one.
    loadProject(scene());
    useProjectStore.getState().update((draft) => {
      draft.relations = [];
    });
    expect(notices()).toHaveLength(1);
  });

  it('throws nothing into the store when the project cannot be read', () => {
    const broken = { ...useProjectStore.getState().project, clips: null };
    expect(() => useProjectStore.setState({ project: broken as unknown as Project })).not.toThrow();
    expect(notices()).toEqual([]);
  });

  it('stops', () => {
    stop();
    useProjectStore.getState().update((draft) => {
      draft.relations = [];
    });
    expect(notices()).toEqual([]);
  });
});
