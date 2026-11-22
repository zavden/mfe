import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveFormula, toSnapshot } from '../../../engine';
import { createMockEngine } from '../../../test/mockEngine';
import {
  createAppear,
  createClip,
  createDisappear,
  createEmptyProject,
  createFormula,
  createMorph,
  defaultIntro,
  defaultOutro,
  remapGlyphRefs,
  type GlyphPair,
  type MorphAction,
  type Project,
} from '../../../model';
import { history, loadProject, useProjectStore, useRenderStore } from '../../../store';
import { useDialogStore } from '../../project/dialogStore';
import { useDocumentStore } from '../../project/documentStore';
import { usePreferences } from '../../preferences';
import { MorphEditor } from '../MorphEditor';
import { MorphEditorHost } from '../MorphEditorHost';
import { useMorphEditorStore } from '../morphEditorStore';

/* One clip of A = x_1 = x_2 (the mock engine draws it on one line: A = x 1 = x 2, glyphs 0–6)
 * over [0, 6] with Write and FadeOut, nothing hidden (the owner's flow: a target skips the intro
 * by arriving) unless `hidden` says so, and a Morph block at 2 s. */
async function setup(pairs: GlyphPair[] = [], hidden: number[] = []) {
  const project: Project = createEmptyProject();
  const latex = 'A=x_1=x_2';
  const result = await createMockEngine().render({
    kind: 'math',
    latex,
    packages: [],
    preamble: '',
    target: 'ce',
    fontSize: 48,
    prefer: 'auto',
  });
  if (!result.ok) throw new Error(result.error.message);
  const formula = createFormula({
    name: 'steps',
    source: latex,
    snapshot: toSnapshot(result.render),
    hiddenGlyphs: hidden,
  });
  project.formulas.push(formula);
  const clip = createClip(formula.id, project.tracks[0]!.id, 0, 6, {
    intro: defaultIntro('write'),
    outro: defaultOutro('fade_out'),
  });
  const morph = createMorph(2, { pairs });
  clip.actions.push(morph);
  project.clips.push(clip);
  loadProject(project);
  act(() => {
    useRenderStore.getState().setEntry(formula.id, {
      status: 'ok',
      resolved: resolveFormula(formula, result.render),
      error: null,
    });
  });
  return { project, formula, clip, morph, request: { clipId: clip.id, actionId: morph.id } };
}

afterEach(() => {
  act(() => useMorphEditorStore.getState().close());
  usePreferences.setState({ glyphList: false, relationGlyphList: false });
  loadProject(createEmptyProject());
  useRenderStore.getState().retain([]);
});

const block = () => useProjectStore.getState().project.clips[0]!.actions[0] as MorphAction;
const pair = (from: number[], to: number[]): GlyphPair => ({ from, to, style: null });

describe('MorphEditor', () => {
  it('links by clicks, takes a suggestion and saves the session as one undo step', async () => {
    const { request } = await setup();
    const user = userEvent.setup();
    let closed = false;
    render(<MorphEditor request={request} onClose={() => (closed = true)} />);
    expect(screen.getByTestId('morph-editor')).toHaveTextContent('Morph pairs');
    expect(screen.getByTestId('morph-from-glyph-1')).toHaveAttribute('data-label', '=');
    expect(screen.getByTestId('morph-save')).toBeDisabled(); // nothing changed yet
    // Everything the intro brought can take part; as a target, with a hint.
    expect(screen.getByTestId('morph-from-glyph-4')).toHaveAttribute('data-eligible', 'true');
    expect(screen.getByTestId('morph-to-glyph-4')).toHaveAttribute('data-eligible', 'true');
    expect(screen.getByTestId('morph-to-glyph-1')).toHaveAccessibleName(
      'Glyph 1: = (brought by the intro: linked, it arrives through the block instead)',
    );

    // = → = by two clicks.
    await user.click(screen.getByTestId('morph-from-glyph-1'));
    expect(screen.getByTestId('morph-selection')).toHaveTextContent('Now select');
    await user.click(screen.getByTestId('morph-to-glyph-4'));
    expect(screen.getByTestId('morph-pair-0-text')).toHaveTextContent('= → =');
    // Suggest offers the rest (x → x), dashed, until accepted.
    await user.click(screen.getByTestId('morph-suggest'));
    expect(screen.getByTestId('morph-suggestion')).toHaveTextContent('1 suggested pair: x → x');
    expect(screen.getByTestId('morph-suggestion-link-0')).toBeInTheDocument();
    await user.click(screen.getByTestId('morph-suggest-accept'));
    expect(screen.queryByTestId('morph-suggestion')).toBeNull();
    expect(screen.getByTestId('morph-pair-1-text')).toHaveTextContent('x → x');
    expect(screen.getByTestId('morph-summary')).toHaveTextContent('2 pairs');
    expect(screen.queryByTestId('morph-problems')).toBeNull();

    expect(block().pairs).toEqual([]); // the draft is not in the project yet
    await user.click(screen.getByTestId('morph-save'));
    expect(closed).toBe(true);
    expect(block().pairs).toEqual([pair([1], [4]), pair([2], [5])]);
    expect(block().style).toBe('copy'); // the rest of the block is the panel's
    act(() => history.undo());
    expect(block().pairs).toEqual([]);
  });

  it('refuses a glyph on both sides and says so', async () => {
    const { request } = await setup([pair([1], [4])]);
    const user = userEvent.setup();
    render(<MorphEditor request={request} onClose={() => {}} />);
    await user.click(screen.getByTestId('morph-from-glyph-2'));
    await user.click(screen.getByTestId('morph-to-glyph-2'));
    expect(screen.getByTestId('morph-message')).toHaveTextContent(
      'Glyph x (2) cannot turn into itself',
    );
    await user.click(screen.getByTestId('morph-from-glyph-4'));
    await user.click(screen.getByTestId('morph-to-glyph-5'));
    expect(screen.getByTestId('morph-message')).toHaveTextContent(
      'Glyph = (4) is a target of pair 1: it cannot also be a source of this block.',
    );
    expect(screen.queryByTestId('morph-pair-1')).toBeNull();
  });

  it('dims what cannot take part and shows the problems of the draft', async () => {
    const { request } = await setup([], [4, 5, 6]);
    const user = userEvent.setup();
    render(<MorphEditor request={request} onClose={() => {}} />);
    expect(screen.getByTestId('morph-from-glyph-5')).toHaveAttribute('data-eligible', 'false');
    expect(screen.getByTestId('morph-from-glyph-5')).toHaveAccessibleName(
      'Glyph 5: x (not on screen yet)',
    );
    // A source that is not on screen yet (dimmed, but clickable): a warning.
    await user.click(screen.getByTestId('morph-from-glyph-5'));
    await user.click(screen.getByTestId('morph-to-glyph-6'));
    expect(screen.getByTestId('morph-problems')).toHaveTextContent(
      'Source glyph 5 of "steps" is not on screen when the Morph block starts',
    );
    // The pair and its glyphs are marked in the warning colour, not in the red of an error (D177).
    expect(screen.getByTestId('morph-pair-0')).toHaveClass('is-warned');
    expect(screen.getByTestId('morph-pair-0')).not.toHaveClass('is-bad');
    expect(screen.getByTestId('morph-from-glyph-5')).toHaveClass('is-warned');
    expect(screen.getByTestId('morph-to-glyph-6')).toHaveClass('is-warned');
    expect(screen.getByTestId('morph-save')).toBeEnabled(); // a warning does not block Save
  });

  it('holds Save back for an error the draft causes on another block', async () => {
    const { request } = await setup();
    // "=" leaves at 3.2 s and comes back at 4 s: fine until the block consumes it at 2 s.
    act(() =>
      useProjectStore.getState().update((d) => {
        d.clips[0]!.actions.push(
          createDisappear(3.2, 'fade_out', [1], { duration: 0.5 }),
          createAppear(4, 'fade_in', [1], { duration: 0.5 }),
        );
      }),
    );
    const user = userEvent.setup();
    render(<MorphEditor request={request} onClose={() => {}} />);
    await user.click(screen.getByTestId('morph-from-glyph-1'));
    await user.click(screen.getByTestId('morph-to-glyph-4'));
    expect(screen.getByTestId('morph-save')).toBeEnabled(); // a copy: "=" stays
    await user.selectOptions(screen.getByTestId('morph-pair-0-style'), 'transform');
    expect(screen.getByTestId('morph-problems')).toHaveTextContent(
      'The FadeIn block cannot bring back glyph 1 of "steps"',
    );
    expect(screen.getByTestId('morph-save')).toBeDisabled();
    expect(screen.getByTestId('morph-save')).toHaveAttribute(
      'title',
      'Fix the problems listed first',
    );
  });

  it('asks before discarding changes, and Escape takes a selection back first', async () => {
    const { request } = await setup();
    const user = userEvent.setup();
    let closed = false;
    render(<MorphEditor request={request} onClose={() => (closed = true)} />);
    await user.click(screen.getByTestId('morph-from-glyph-1'));
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('morph-selection')).toHaveTextContent('Nothing selected');
    expect(closed).toBe(false);
    await user.click(screen.getByTestId('morph-from-glyph-1'));
    await user.click(screen.getByTestId('morph-to-glyph-4'));
    await user.click(screen.getByTestId('morph-cancel'));
    expect(screen.getByTestId('morph-confirm')).toHaveTextContent(
      'Discard the changes to these pairs?',
    );
    await user.click(screen.getByTestId('morph-confirm-keep'));
    expect(screen.queryByTestId('morph-confirm')).toBeNull();
    await user.keyboard('{Escape}');
    expect(screen.getByTestId('morph-confirm')).toBeInTheDocument();
    await user.click(screen.getByTestId('morph-confirm-yes'));
    expect(closed).toBe(true);
    expect(block().pairs).toEqual([]);
  });

  it('restyles pairs from the menu of a right-click, where Inherit is the block’s style', async () => {
    const { request } = await setup([pair([1], [4])]);
    const user = userEvent.setup();
    render(<MorphEditor request={request} onClose={() => {}} />);
    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('morph-to-glyph-4') });
    expect(screen.getByTestId('morph-style-menu-header')).toHaveTextContent('= → =');
    expect(screen.getByTestId('morph-style-menu-inherit')).toHaveTextContent('Inherit: Copy');
    await user.click(screen.getByTestId('morph-style-menu-transform'));
    expect(screen.queryByTestId('morph-style-menu')).toBeNull();
    expect(screen.getByTestId('morph-pair-0-style')).toHaveValue('transform');
    await user.click(screen.getByTestId('morph-save'));
    expect(block().pairs).toEqual([{ from: [1], to: [4], style: 'transform' }]);
  });

  it('closes without asking when nothing changed', async () => {
    const { request } = await setup([pair([1], [4])]);
    const user = userEvent.setup();
    let closed = false;
    render(<MorphEditor request={request} onClose={() => (closed = true)} />);
    expect(screen.getByTestId('morph-cancel')).toHaveTextContent('Close');
    await user.click(screen.getByTestId('morph-cancel'));
    expect(closed).toBe(true);
  });

  it('lists the glyphs of the two sides only when its key asks for it, the relation editor’s choice', async () => {
    const { request } = await setup();
    const user = userEvent.setup();
    render(<MorphEditor request={request} onClose={() => {}} />);
    const key = screen.getByTestId('morph-toggle-list');
    expect(key).toHaveAttribute('aria-pressed', 'false');
    expect(key).toHaveAccessibleName('Glyph list');
    expect(screen.queryByTestId('morph-chips')).toBeNull();
    // In the toolbar, just before the key of the links, as in the relation editor.
    expect(key.nextElementSibling).toBe(screen.getByTestId('morph-toggle-links'));

    await user.click(key);
    expect(key).toHaveAttribute('aria-pressed', 'true');
    // One preference for the two pair editors; the glyph view's own list is another.
    expect(usePreferences.getState()).toMatchObject({ relationGlyphList: true, glyphList: false });
    const side = (name: string) =>
      within(screen.getByRole('group', { name })).getAllByRole('button');
    expect(side('Glyphs of steps (sources)')).toHaveLength(7);
    expect(side('Glyphs of steps (targets)')).toHaveLength(7);
    await user.click(screen.getByTestId('morph-from-chip-1'));
    await user.click(screen.getByTestId('morph-to-chip-4'));
    expect(screen.getByTestId('morph-pair-0-text')).toHaveTextContent('= → =');

    // What is selected belongs to the drawing: it stays when the lists go.
    await user.click(screen.getByTestId('morph-from-chip-2'));
    await user.click(key);
    expect(screen.queryByTestId('morph-chips')).toBeNull();
    expect(screen.getByTestId('morph-from-glyph-2')).toHaveAttribute('data-selected', 'true');
  });

  it('opens with the lists when the relation editor left them on', async () => {
    usePreferences.setState({ relationGlyphList: true });
    const { request } = await setup();
    render(<MorphEditor request={request} onClose={() => {}} />);
    expect(screen.getByTestId('morph-toggle-list')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('morph-chips')).toBeInTheDocument();
  });
});

describe('MorphEditor and re-renders', () => {
  it('re-bases its draft when the formula is re-rendered underneath, like the project', async () => {
    const { formula, request } = await setup([pair([1], [4])]);
    const oldKey = formula.snapshot!.key;
    render(<MorphEditor request={request} onClose={() => {}} />);
    // The render sync swaps canonical glyphs 1 and 4 (another glyph order): it publishes the step,
    // then remaps the project in one amend. Both sides of the pairs follow, in the draft too.
    const map = [0, 4, 2, 3, 1, 5, 6];
    act(() => {
      useRenderStore.getState().setTransition(formula.id, { from: oldKey, to: 'swapped', map });
      useProjectStore.getState().amend((d) => {
        remapGlyphRefs(d, formula.id, map);
        const f = d.formulas.find((x) => x.id === formula.id)!;
        const g = f.snapshot!.glyphs;
        f.snapshot = { ...f.snapshot!, key: 'swapped', glyphs: map.map((_, i) => g[map[i]!]!) };
      });
    });
    expect(block().pairs).toEqual([pair([4], [1])]);
    expect(screen.getByTestId('morph-pair-0')).toHaveAttribute('data-from', '4');
    expect(screen.getByTestId('morph-pair-0')).toHaveAttribute('data-to', '1');
    expect(screen.getByTestId('morph-save')).toBeDisabled(); // nothing changed yet
    expect(screen.queryByTestId('morph-stale')).toBeNull();
  });

  it('drops a deletion confirmed after a re-render: its places in the draft are gone', async () => {
    const { formula, request } = await setup([pair([1], [4]), pair([2], [5])]);
    const oldKey = formula.snapshot!.key;
    const user = userEvent.setup();
    render(<MorphEditor request={request} onClose={() => {}} />);
    // Ask to delete the first pair (= → =) from the menu of its target: the confirmation waits.
    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('morph-to-glyph-4') });
    await user.click(screen.getByTestId('morph-style-menu-delete'));
    const pending = useDialogStore.getState().queue[0]!;
    expect(pending.title).toBe('Delete this link?');
    // Meanwhile the render sync swaps glyphs 1 and 4, and 2 and 5: both pairs follow.
    const map = [0, 4, 5, 3, 1, 2, 6];
    act(() => {
      useRenderStore.getState().setTransition(formula.id, { from: oldKey, to: 'swapped', map });
      useProjectStore.getState().amend((d) => {
        remapGlyphRefs(d, formula.id, map);
        const f = d.formulas.find((x) => x.id === formula.id)!;
        const g = f.snapshot!.glyphs;
        f.snapshot = { ...f.snapshot!, key: 'swapped', glyphs: map.map((_, i) => g[map[i]!]!) };
      });
    });
    expect(block().pairs).toEqual([pair([4], [1]), pair([5], [2])]);
    expect(screen.getByTestId('morph-pair-1')).toHaveAttribute('data-from', '5');
    // Confirmed now, the deletion is dropped: the first place would be the re-based pair, and the
    // draft is as the project has it.
    await act(async () => useDialogStore.getState().settle(pending.key, 'confirm'));
    expect(screen.getAllByTestId(/^morph-pair-\d+$/)).toHaveLength(2);
    expect(screen.getByTestId('morph-pair-0')).toHaveAttribute('data-from', '4');
    expect(screen.getByTestId('morph-pair-0-text')).toHaveTextContent('= → =');
    expect(screen.getByTestId('morph-pair-1')).toHaveAttribute('data-from', '5');
    expect(screen.getByTestId('morph-message')).toHaveTextContent(
      '“steps” was re-rendered while the dialog was open: nothing was deleted. Delete the links again.',
    );
    expect(screen.getByTestId('morph-save')).toBeDisabled();
    // Asked again, on the re-based draft, the same link goes, and Save writes what is left.
    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('morph-to-glyph-1') });
    await user.click(screen.getByTestId('morph-style-menu-delete'));
    const again = useDialogStore.getState().queue[0]!;
    await act(async () => useDialogStore.getState().settle(again.key, 'confirm'));
    expect(screen.getAllByTestId(/^morph-pair-\d+$/)).toHaveLength(1);
    expect(screen.getByTestId('morph-pair-0-text')).toHaveTextContent('x → x');
    await user.click(screen.getByTestId('morph-save'));
    expect(block().pairs).toEqual([pair([5], [2])]);
  });

  it('closes an open pair menu when the formula is re-rendered underneath', async () => {
    const { formula, request } = await setup([pair([1], [4])]);
    const oldKey = formula.snapshot!.key;
    const user = userEvent.setup();
    render(<MorphEditor request={request} onClose={() => {}} />);
    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('morph-to-glyph-4') });
    expect(screen.getByTestId('morph-style-menu')).toBeInTheDocument();
    const map = [0, 4, 2, 3, 1, 5, 6];
    act(() => {
      useRenderStore.getState().setTransition(formula.id, { from: oldKey, to: 'swapped', map });
      useProjectStore.getState().amend((d) => {
        remapGlyphRefs(d, formula.id, map);
        const f = d.formulas.find((x) => x.id === formula.id)!;
        const g = f.snapshot!.glyphs;
        f.snapshot = { ...f.snapshot!, key: 'swapped', glyphs: map.map((_, i) => g[map[i]!]!) };
      });
    });
    expect(screen.queryByTestId('morph-style-menu')).toBeNull();
    expect(screen.getByTestId('morph-pair-0')).toHaveAttribute('data-from', '4');
  });

  it('holds Save back when the formula was re-rendered and the step is not known', async () => {
    const { formula, request } = await setup();
    const user = userEvent.setup();
    render(<MorphEditor request={request} onClose={() => {}} />);
    await user.click(screen.getByTestId('morph-from-glyph-1'));
    await user.click(screen.getByTestId('morph-to-glyph-4'));
    expect(screen.getByTestId('morph-save')).toBeEnabled();
    act(() => {
      useProjectStore.getState().amend((d) => {
        const f = d.formulas.find((x) => x.id === formula.id)!;
        f.snapshot = { ...f.snapshot!, key: 'elsewhere' };
      });
    });
    expect(screen.getByTestId('morph-stale')).toHaveTextContent(
      '“steps” was re-rendered while you edited: close the editor and open it again.',
    );
    expect(screen.getByTestId('morph-save')).toBeDisabled();
    await user.click(screen.getByTestId('morph-save'));
    expect(block().pairs).toEqual([]);
    // Back on the snapshot the draft was made on (the companion went offline again): Save again.
    const opened = formula.snapshot!.key;
    act(() => {
      useProjectStore.getState().amend((d) => {
        const f = d.formulas.find((x) => x.id === formula.id)!;
        f.snapshot = { ...f.snapshot!, key: opened };
      });
    });
    expect(screen.queryByTestId('morph-stale')).toBeNull();
    expect(screen.getByTestId('morph-save')).toBeEnabled();
    await user.click(screen.getByTestId('morph-save'));
    expect(block().pairs).toEqual([pair([1], [4])]);
  });
});

describe('MorphEditor when it cannot edit', () => {
  it('says so for a block that is gone and for a locked track', async () => {
    const { clip, request } = await setup();
    const { unmount } = render(
      <MorphEditor request={{ clipId: clip.id, actionId: 'gone' }} onClose={() => {}} />,
    );
    expect(screen.getByTestId('morph-error')).toHaveTextContent(
      'This Morph block no longer exists.',
    );
    unmount();
    act(() =>
      useProjectStore.getState().update((d) => {
        d.tracks[0]!.locked = true;
      }),
    );
    let closed = false;
    render(<MorphEditor request={request} onClose={() => (closed = true)} />);
    expect(screen.getByTestId('morph-error')).toHaveTextContent('is locked');
    expect(screen.queryByTestId('morph-canvas')).toBeNull();
    await userEvent.setup().click(screen.getByTestId('morph-error-ok'));
    expect(closed).toBe(true);
  });

  it('says why the formula has no glyphs, and opens the pairs once they come', async () => {
    const { formula, request } = await setup();
    const kept = useRenderStore.getState().entries[formula.id]!;
    act(() =>
      useRenderStore
        .getState()
        .setEntry(formula.id, { status: 'loading', resolved: null, error: null }),
    );
    render(<MorphEditor request={request} onClose={() => {}} />);
    expect(screen.getByTestId('morph-rendering')).toHaveTextContent('Rendering the glyphs…');
    expect(screen.getByTestId('morph-error-ok')).toBeInTheDocument();
    act(() => useRenderStore.getState().setEntry(formula.id, kept));
    expect(screen.getByTestId('morph-canvas')).toBeInTheDocument();
  });

  it('closes itself when another document takes the project’s place', async () => {
    const { request } = await setup();
    render(<MorphEditorHost />);
    act(() => useMorphEditorStore.getState().open(request));
    expect(screen.getByTestId('morph-editor')).toBeInTheDocument();
    act(() => {
      useDocumentStore.getState().beginDocument(useProjectStore.getState().project, {
        fileName: null,
        handle: null,
      });
    });
    expect(screen.queryByTestId('morph-editor')).toBeNull();
    expect(useMorphEditorStore.getState().request).toBeNull();
  });
});
