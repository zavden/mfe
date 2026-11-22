// @vitest-environment node
/* A command that asks before it writes asks about the document that is open then. The answer may
 * come when another document has taken its place — the file chosen in File → Open… arrived
 * while the question was on screen —, and that document may have the ids of the first one: a
 * copy of the same file, an earlier revision of it. Finding the thing asked about in it tells
 * nothing, so the answer writes nothing there (B-44 and B-70 of the final audit, and the
 * commands found beside them). An edit of the same document does not make it another. */
import { beforeEach, describe, expect, it } from 'vitest';
import { parseProject, serializeProject, type Project } from '../../../model';
import { history, loadProject, useProjectStore } from '../../../store';
import { readExample } from '../../../test/examples';
import { confirmDeleteBlock, confirmDeleteGroup } from '../../animations/blockActions';
import { deleteFormulas } from '../../creator/formulaActions';
import { deleteClipsAsking, deleteTrackAsking } from '../../timeline/clipActions';
import { useDialogStore } from '../dialogStore';
import { useDocumentStore } from '../documentStore';
import { useNoticeStore } from '../noticeStore';

function parsed(text: string): Project {
  const result = parseProject(text);
  if (!result.ok) throw new Error(result.error);
  return result.project;
}

/** Make `project` the open document, as File → Open… does. The project the store holds. */
function open(project: Project): Project {
  loadProject(project);
  const held = useProjectStore.getState().project;
  useDocumentStore.getState().beginDocument(held, { fileName: null, handle: null });
  return held;
}

/** A clip with grouped blocks, and one of them. */
function grouped(project: Project) {
  for (const clip of project.clips) {
    const action = clip.actions.find((a) => 'group' in a && a.group !== undefined);
    if (action) return { clipId: clip.id, actionId: action.id };
  }
  throw new Error('the example has no group');
}

/** A clip that other objects are attached to. */
function holder(project: Project) {
  const held = (clip: Project['clips'][number]) =>
    (clip.attach as { clipId?: string } | null)?.clipId;
  const clip = project.clips.find((c) => project.clips.some((other) => held(other) === c.id));
  if (!clip) throw new Error('the example has nothing attached');
  return clip;
}

interface Command {
  /** The versioned example it runs on. */
  example: string;
  /** The title of its question. */
  title: RegExp;
  run(project: Project): Promise<boolean>;
}

const COMMANDS: Record<string, Command> = {
  'Delete track': {
    example: 'braces.mfe.json',
    title: /^Delete track\?$/,
    run: (project) => deleteTrackAsking(holder(project).trackId),
  },
  'Delete the group': {
    example: 'animation-blocks.mfe.json',
    title: /^Delete the group\?$/,
    run: (project) => {
      const { clipId, actionId } = grouped(project);
      return confirmDeleteGroup(clipId, actionId);
    },
  },
  'Delete animation': {
    example: 'animation-blocks.mfe.json',
    title: /^Delete animation\?$/,
    run: (project) => {
      const { clipId, actionId } = grouped(project);
      return confirmDeleteBlock(clipId, actionId);
    },
  },
  'Delete a clip that objects are attached to': {
    example: 'braces.mfe.json',
    title: /^Delete clip\?$/,
    run: (project) => deleteClipsAsking(new Set([holder(project).id])),
  },
  'Delete a formula': {
    example: 'braces.mfe.json',
    title: /^Delete ".+"\?$/,
    run: (project) => deleteFormulas([holder(project).formulaId]),
  },
};

beforeEach(() => {
  useDialogStore.setState({ queue: [] });
  useNoticeStore.getState().clear();
});

describe.each(Object.entries(COMMANDS))('%s', (_name, { example, title, run }) => {
  /** Ask in the example's document; the question that is then on screen. */
  function ask() {
    const first = open(parsed(readExample(example)));
    const done = run(first);
    const question = useDialogStore.getState().queue.at(-1)!;
    expect(question?.title).toMatch(title);
    return { first, done, question };
  }
  const confirm = (key: number) => useDialogStore.getState().settle(key, 'confirm');

  it('answered in its document, it writes: one step', async () => {
    const { first, done, question } = ask();
    confirm(question.key);
    expect(await done).toBe(true);
    expect(useProjectStore.getState().project).not.toBe(first);
    expect(history.depth()).toBe(1);
  });

  it('answered after its document was edited, it writes all the same', async () => {
    const { done, question } = ask();
    useProjectStore.getState().update((draft) => {
      draft.meta.name = 'Renamed meanwhile';
    });
    const edited = useProjectStore.getState().project;
    confirm(question.key);
    expect(await done).toBe(true);
    expect(useProjectStore.getState().project).not.toBe(edited);
    expect(useProjectStore.getState().project.meta.name).toBe('Renamed meanwhile');
  });

  it('answered after another document opened, with the same ids, it writes nothing', async () => {
    const { first, done, question } = ask();
    const copy = parsed(serializeProject(first));
    copy.meta.name = 'Second document';
    const second = open(copy);
    const bytes = serializeProject(second);
    confirm(question.key);
    expect(await done).toBe(false);
    expect(useProjectStore.getState().project).toBe(second);
    expect(serializeProject(useProjectStore.getState().project)).toBe(bytes);
    expect(history.canUndo()).toBe(false);
    expect(useNoticeStore.getState().notices).toEqual([]);
  });
});
