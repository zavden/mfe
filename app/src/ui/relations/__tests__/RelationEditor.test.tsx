import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveFormula, toSnapshot } from '../../../engine';
import { createMockEngine } from '../../../test/mockEngine';
import {
  createBraceFormula,
  createClip,
  createEmptyProject,
  createFormula,
  createRelation,
  defaultIntro,
  defaultOutro,
  remapGlyphRefs,
  type Project,
} from '../../../model';
import { history, loadProject, useProjectStore, useRenderStore } from '../../../store';
import { useDialogStore } from '../../project/dialogStore';
import { useDocumentStore } from '../../project/documentStore';
import { usePreferences } from '../../preferences';
import { usePathEdit } from '../../preview/pathEdit';
import { RelationEditor } from '../RelationEditor';

/* The editor on a mock-rendered pair of formulas: a+b=c (clip A) and a=3+1 (clip B). */
async function setup(withRelation = false) {
  const project: Project = createEmptyProject();
  const engine = createMockEngine();
  const resolved = new Map();
  for (const [name, latex] of [
    ['f1', 'a+b=c'],
    ['f2', 'a=3+1'],
  ] as const) {
    const result = await engine.render({
      kind: 'math',
      latex,
      packages: [],
      preamble: '',
      target: 'ce',
      fontSize: 48,
      prefer: 'auto',
    });
    if (!result.ok) throw new Error(result.error.message);
    const formula = createFormula({ name, source: latex, snapshot: toSnapshot(result.render) });
    project.formulas.push(formula);
    resolved.set(formula.id, resolveFormula(formula, result.render));
  }
  const [f1, f2] = project.formulas;
  const none = { intro: defaultIntro('none'), outro: defaultOutro('none') };
  const a = createClip(f1!.id, project.tracks[0]!.id, 0, 6, none);
  const b = createClip(f2!.id, project.tracks[1]!.id, 2, 8, none);
  project.clips.push(a, b);
  if (withRelation) {
    project.relations.push(
      createRelation(a.id, b.id, { pairs: [{ from: [0], to: [0], style: null }] }),
    );
  }
  loadProject(project);
  act(() => {
    for (const [id, entry] of resolved) {
      useRenderStore.getState().setEntry(id, { status: 'ok', resolved: entry, error: null });
    }
  });
  return { project, a, b };
}

afterEach(() => {
  loadProject(createEmptyProject());
  useRenderStore.getState().retain([]);
  usePreferences.setState({ glyphList: false, relationGlyphList: false });
});

const relations = () => useProjectStore.getState().project.relations;
const glyph = (side: 'from' | 'to', label: string) =>
  document.querySelector(`[data-testid^="rel-${side}-glyph-"][data-label="${label}"]`)!;

describe('RelationEditor', () => {
  it('links glyphs with clicks and Shift, and saves the whole session as one undo step', async () => {
    const { a, b } = await setup();
    const user = userEvent.setup();
    let closed = false;
    render(
      <RelationEditor
        request={{ kind: 'create', fromClipId: a.id, toClipId: b.id }}
        onClose={() => (closed = true)}
      />,
    );
    expect(await screen.findByTestId('rel-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('rel-save')).toBeDisabled(); // nothing linked yet

    await user.click(glyph('from', 'a'));
    await user.click(glyph('to', 'a'));
    // Several glyphs: Shift adds to the selection of a side; Link makes one pair.
    await user.click(glyph('from', 'b'));
    await user.keyboard('{Shift>}');
    await user.click(glyph('from', 'c'));
    await user.click(glyph('to', '3'));
    await user.click(glyph('to', '1'));
    await user.keyboard('{/Shift}');
    expect(screen.getByTestId('rel-selection')).toHaveTextContent('b c → 3 1');
    await user.click(screen.getByTestId('rel-link'));
    expect(screen.getByTestId('rel-pair-0-text')).toHaveTextContent('a → a');
    expect(screen.getByTestId('rel-pair-1-text')).toHaveTextContent('b c → 3 1');

    expect(relations()).toHaveLength(0); // the draft is not in the project yet
    await user.click(screen.getByTestId('rel-save'));
    expect(closed).toBe(true);
    expect(relations()).toHaveLength(1);
    expect(relations()[0]!.pairs).toEqual([
      { from: [0], to: [0], style: null },
      { from: [2, 4], to: [2, 4], style: null },
    ]);
    act(() => history.undo());
    expect(relations()).toHaveLength(0);
  });

  it('joins the pair of a target glyph linked already, and says so', async () => {
    const { a, b } = await setup(true);
    const user = userEvent.setup();
    render(
      <RelationEditor
        request={{ kind: 'create', fromClipId: a.id, toClipId: b.id }}
        onClose={() => {}}
      />,
    ).unmount();
    // Editing the stored relation: glyph 0 of the target is taken, so the new source joins its
    // pair (two glyphs that become one) instead of making a second one.
    render(
      <RelationEditor
        request={{ kind: 'edit', relationId: relations()[0]!.id }}
        onClose={() => {}}
      />,
    );
    await user.click(await screen.findByTestId('rel-from-glyph-2'));
    await user.click(screen.getByTestId('rel-to-glyph-0'));
    expect(screen.getByTestId('rel-message')).toHaveTextContent('joined pair 1');
    expect(within(screen.getByTestId('rel-pairs')).getAllByRole('listitem')).toHaveLength(1);
    expect(screen.getByTestId('rel-pair-0')).toHaveAttribute('data-from', '0,2');
  });

  it('asks before discarding changes and leaves the project alone', async () => {
    const { a, b } = await setup();
    const user = userEvent.setup();
    let closed = false;
    render(
      <RelationEditor
        request={{ kind: 'create', fromClipId: a.id, toClipId: b.id }}
        onClose={() => (closed = true)}
      />,
    );
    await user.click(await screen.findByTestId('rel-from-glyph-0'));
    await user.click(screen.getByTestId('rel-to-glyph-0'));
    await user.click(screen.getByTestId('rel-cancel'));
    expect(screen.getByTestId('rel-confirm')).toBeInTheDocument();
    expect(closed).toBe(false);
    await user.click(screen.getByTestId('rel-confirm-yes'));
    expect(closed).toBe(true);
    expect(relations()).toHaveLength(0);
  });

  it('lists the glyphs of the two sides only when its key asks for it, and links by them', async () => {
    const { a, b } = await setup();
    const user = userEvent.setup();
    render(
      <RelationEditor
        request={{ kind: 'create', fromClipId: a.id, toClipId: b.id }}
        onClose={() => {}}
      />,
    );
    await screen.findByTestId('rel-canvas');
    const key = screen.getByTestId('rel-toggle-list');
    expect(key).toHaveAttribute('aria-pressed', 'false');
    expect(key).toHaveAccessibleName('Glyph list');
    expect(screen.queryByTestId('rel-chips')).toBeNull();
    // In the toolbar, just before the key of the links.
    expect(key.nextElementSibling).toBe(screen.getByTestId('rel-toggle-links'));

    await user.click(key);
    expect(key).toHaveAttribute('aria-pressed', 'true');
    // A preference of the relation editor: the glyph view's own list is another.
    expect(usePreferences.getState()).toMatchObject({ relationGlyphList: true, glyphList: false });
    const side = (name: string) =>
      within(screen.getByRole('group', { name })).getAllByRole('button');
    expect(side('Glyphs of f1 (from)')).toHaveLength(5);
    expect(side('Glyphs of f2 (to)')).toHaveLength(5);
    await user.click(screen.getByTestId('rel-from-chip-0'));
    await user.click(screen.getByTestId('rel-to-chip-0'));
    expect(screen.getByTestId('rel-pair-0-text')).toHaveTextContent('a → a');

    // What is selected belongs to the drawing: it stays when the lists go.
    await user.click(screen.getByTestId('rel-from-chip-1'));
    await user.click(key);
    expect(screen.queryByTestId('rel-chips')).toBeNull();
    expect(screen.getByTestId('rel-from-glyph-1')).toHaveAttribute('data-selected', 'true');
    expect(screen.getByTestId('rel-clear-selection')).toBeEnabled();
  });

  it('has the pairs in one tab and the animation in the other; a press on the drawing brings the pairs back', async () => {
    await setup(true);
    const user = userEvent.setup();
    render(
      <RelationEditor
        request={{ kind: 'edit', relationId: relations()[0]!.id }}
        onClose={() => {}}
      />,
    );
    await screen.findByTestId('rel-canvas');
    const [pairsTab, animationTab] = within(
      screen.getByRole('tablist', { name: 'Relation' }),
    ).getAllByRole('tab');
    // It opens on the pairs, which the tab counts: the list has no title of its own.
    expect(pairsTab).toHaveTextContent('Pairs (1)');
    expect(animationTab).toHaveTextContent('Animation');
    expect(pairsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('rel-side-panel-animation')).toHaveAttribute('hidden');
    expect(within(screen.getByTestId('rel-pairs')).queryByRole('heading')).toBeNull();

    await user.click(animationTab!);
    expect(animationTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('rel-side-panel-pairs')).toHaveAttribute('hidden');
    const animation = within(screen.getByTestId('rel-side-panel-animation'));
    expect(animation.getAllByRole('heading').map((h) => h.textContent)).toEqual([
      'Timing and style',
      'Unpaired glyphs',
    ]);
    expect(animation.getByTestId('rel-offset')).toBeInTheDocument();
    expect(animation.getByTestId('rel-unpaired-in')).toBeInTheDocument();

    // A press on a glyph is work on the pairs: their tab comes back, and counts the new one.
    await user.click(glyph('from', 'b'));
    expect(pairsTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByTestId('rel-side-panel-animation')).toHaveAttribute('hidden');
    await user.click(glyph('to', '3'));
    expect(pairsTab).toHaveTextContent('Pairs (2)');
    // A pick in the lists of glyphs does the same; a button of the toolbar does not.
    await user.click(screen.getByTestId('rel-toggle-list'));
    await user.click(animationTab!);
    await user.click(screen.getByTestId('rel-toggle-links'));
    expect(animationTab).toHaveAttribute('aria-selected', 'true');
    await user.click(screen.getByTestId('rel-from-chip-4'));
    expect(pairsTab).toHaveAttribute('aria-selected', 'true');
  });

  it('says which formula has no glyphs and why', async () => {
    const { project, a, b } = await setup();
    const f2 = project.formulas[1]!;
    act(() => {
      useProjectStore.getState().update((d) => {
        d.formulas[1]!.snapshot = null;
      });
      useRenderStore.getState().setEntry(f2.id, {
        status: 'error',
        resolved: null,
        error: { message: 'Missing close brace', backend: 'mathjax' },
      });
    });
    render(
      <RelationEditor
        request={{ kind: 'create', fromClipId: a.id, toClipId: b.id }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('rel-rendering')).toHaveTextContent(
      'f2 does not render: Missing close brace',
    );
    // Nothing to list: the key of the lists waits.
    expect(screen.getByTestId('rel-toggle-list')).toBeDisabled();
  });

  it('explains why clips that do not overlap cannot be related', async () => {
    const { a, b } = await setup();
    act(() => useProjectStore.getState().update((d) => void (d.clips[1]!.start = 7)));
    render(
      <RelationEditor
        request={{ kind: 'create', fromClipId: a.id, toClipId: b.id }}
        onClose={() => {}}
      />,
    );
    expect(await screen.findByTestId('rel-error')).toHaveTextContent(/overlap/);
  });

  it('opened on a relation with a brace on a side, says why it does not edit it (audit A1-02)', async () => {
    // A double-click on its band opens it as any other: a saved project may hold one.
    const { project, a } = await setup(true);
    const brace = createBraceFormula({ name: 'b1' });
    act(() =>
      useProjectStore.getState().update((d) => {
        d.formulas.push(brace);
        d.clips.find((c) => c.id === a.id)!.formulaId = brace.id;
      }),
    );
    render(
      <RelationEditor
        request={{ kind: 'edit', relationId: project.relations[0]!.id }}
        onClose={() => {}}
      />,
    );
    expect(await screen.findByTestId('rel-error')).toHaveTextContent(
      '"b1" is a brace, one piece: a relation is between formulas and texts, so this one cannot be edited, only deleted.',
    );
  });
});

describe('RelationEditor preview (D156)', () => {
  it('puts the transformation of the draft in the place of the drawing, and back', async () => {
    const user = userEvent.setup();
    await setup(true);
    render(
      <RelationEditor
        request={{ kind: 'edit', relationId: relations()[0]!.id }}
        onClose={() => {}}
      />,
    );
    // It opens on the drawing, with its tools.
    expect(screen.getByTestId('rel-view-link')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('rel-link')).toBeInTheDocument();
    expect(screen.queryByTestId('rel-preview')).not.toBeInTheDocument();

    await user.click(screen.getByTestId('rel-view-preview'));
    expect(screen.getByTestId('rel-preview')).toBeInTheDocument();
    expect(screen.queryByTestId('rel-link')).not.toBeInTheDocument();
    expect(glyph('from', 'a')).toBeNull();
    // The loop runs from a little before the window to a little after it, within the clips:
    // clip B starts at 2 s and the window is its first second.
    const scrub = screen.getByTestId('rel-preview-scrub');
    expect(scrub).toHaveAttribute('min', '1.5');
    expect(scrub).toHaveAttribute('max', '3.5');
    // The side column is there: its pairs, and the tab of the animation.
    expect(screen.getByTestId('rel-pair-0')).toBeInTheDocument();

    await user.click(screen.getByTestId('rel-view-link'));
    expect(screen.queryByTestId('rel-preview')).not.toBeInTheDocument();
    expect(glyph('from', 'a')).not.toBeNull();
  });

  it('asks for the problems of the draft to be fixed first, instead of drawing it', async () => {
    const user = userEvent.setup();
    const { a, b } = await setup();
    // A pair of a glyph the source does not have.
    act(() => {
      useProjectStore.getState().update((draft) => {
        draft.relations.push(
          createRelation(a.id, b.id, { pairs: [{ from: [99], to: [0], style: null }] }),
        );
      });
    });
    render(
      <RelationEditor
        request={{ kind: 'edit', relationId: relations()[0]!.id }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('rel-problems')).toBeInTheDocument();
    await user.click(screen.getByTestId('rel-view-preview'));
    expect(screen.getByTestId('rel-preview-blocked')).toHaveTextContent(
      'Fix the problems listed to see the transformation.',
    );
    expect(screen.queryByTestId('rel-preview')).not.toBeInTheDocument();
  });
});

describe('RelationEditor raw preview (D157)', () => {
  it('animates the drawing in its place, and Escape or its key ends it without closing', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    await setup(true);
    render(
      <RelationEditor
        request={{ kind: 'edit', relationId: relations()[0]!.id }}
        onClose={onClose}
      />,
    );
    await screen.findByTestId('rel-canvas');
    // Its key is the last of the drawing's toolbar.
    const toolbar = screen.getByTestId('rel-link').parentElement!;
    expect(toolbar.lastElementChild).toBe(screen.getByTestId('rel-raw-open'));

    await user.click(screen.getByTestId('rel-raw-open'));
    // The canvas takes the drawing's place and the bar of the loop the toolbar's; the view is
    // still the one that links glyphs.
    expect(screen.getByTestId('rel-raw-canvas')).toBeInTheDocument();
    expect(screen.queryByTestId('rel-canvas')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rel-link')).not.toBeInTheDocument();
    expect(screen.getByTestId('rel-raw-bar')).toContainElement(screen.getByTestId('rel-raw-scrub'));
    expect(screen.getByTestId('rel-raw-end')).toHaveFocus();
    expect(screen.getByTestId('rel-view-link')).toHaveAttribute('aria-checked', 'true');
    // The loop is the window's (clip B starts at 2 s, the window is its first second).
    expect(screen.getByTestId('rel-raw-scrub')).toHaveAttribute('min', '1.5');
    expect(screen.getByTestId('rel-raw-scrub')).toHaveAttribute('max', '3.5');

    // Escape ends the preview alone: the editor stays, the drawing is back, its key has the focus.
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('rel-raw-canvas')).not.toBeInTheDocument();
    expect(screen.getByTestId('rel-canvas')).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByTestId('rel-raw-open')).toHaveFocus();

    // Its own key ends it too; and the switch to Preview ends it.
    await user.click(screen.getByTestId('rel-raw-open'));
    await user.click(screen.getByTestId('rel-raw-end'));
    expect(screen.queryByTestId('rel-raw-canvas')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('rel-raw-open'));
    await user.click(screen.getByTestId('rel-view-preview'));
    expect(screen.queryByTestId('rel-raw-canvas')).not.toBeInTheDocument();
    await user.click(screen.getByTestId('rel-view-link'));
    expect(screen.getByTestId('rel-canvas')).toBeInTheDocument();

    // With no preview on, Escape is the editor's again.
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe('RelationEditor animations', () => {
  it('lists the outro and intro animations in the order of the clip panel', async () => {
    const { a, b } = await setup();
    render(
      <RelationEditor
        request={{ kind: 'create', fromClipId: a.id, toClipId: b.id }}
        onClose={() => {}}
      />,
    );
    const values = async (testId: string) =>
      [...(await screen.findByTestId(testId)).querySelectorAll('option')].map((o) => o.value);
    expect(await values('rel-outro-kind')).toEqual([
      'none',
      'unwrite',
      'fade_out',
      'shrink_to_center',
      'uncreate',
    ]);
    expect(await values('rel-intro-kind')).toEqual([
      'none',
      'write',
      'fade_in',
      'grow_from_center',
      'draw_border_then_fill',
      'create',
    ]);
  });
});

describe('RelationEditor robustness', () => {
  it('closes itself when its clips disappear', async () => {
    const { a, b } = await setup();
    let closed = 0;
    render(
      <RelationEditor
        request={{ kind: 'create', fromClipId: a.id, toClipId: b.id }}
        onClose={() => closed++}
      />,
    );
    await screen.findByTestId('rel-canvas');
    act(() => loadProject(createEmptyProject()));
    expect(closed).toBeGreaterThan(0);
    expect(screen.queryByTestId('rel-canvas')).toBeNull();
  });

  it('closes itself when the formula of one of its clips disappears', async () => {
    const { a, b } = await setup();
    let closed = 0;
    render(
      <RelationEditor
        request={{ kind: 'create', fromClipId: a.id, toClipId: b.id }}
        onClose={() => closed++}
      />,
    );
    await screen.findByTestId('rel-canvas');
    act(() =>
      useProjectStore.getState().update((d) => {
        d.formulas.splice(0, 1);
      }),
    );
    expect(closed).toBeGreaterThan(0);
    expect(screen.queryByTestId('rel-canvas')).toBeNull();
  });

  it('re-bases its draft when a formula is re-rendered underneath, like the project', async () => {
    const { project } = await setup(true);
    const f1 = project.formulas[0]!;
    const oldKey = f1.snapshot!.key;
    render(
      <RelationEditor
        request={{ kind: 'edit', relationId: project.relations[0]!.id }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('rel-pair-0-text')).toHaveTextContent('a → a');
    // The render sync swaps canonical glyphs 0 and 1 of f1 (another glyph order): it publishes
    // the step, then remaps the project in one amend. The persisted pair becomes [1], and so does
    // the draft's.
    const map = [1, 0, 2, 3, 4];
    act(() => {
      useRenderStore.getState().setTransition(f1.id, { from: oldKey, to: 'reordered', map });
      useProjectStore.getState().amend((d) => {
        remapGlyphRefs(d, f1.id, map);
        const f = d.formulas.find((x) => x.id === f1.id)!;
        const g = f.snapshot!.glyphs;
        f.snapshot = { ...f.snapshot!, key: 'reordered', glyphs: [g[1]!, g[0]!, ...g.slice(2)] };
      });
    });
    expect(relations()[0]!.pairs[0]!.from).toEqual([1]);
    expect(screen.getByTestId('rel-pair-0-text')).toHaveTextContent('a → a'); // the same glyph
    expect(screen.getByTestId('rel-save')).toBeDisabled(); // nothing changed yet
    // An ordinary edit, then Save: the saved pairs are the re-based ones plus the new one.
    const user = userEvent.setup();
    await user.click(screen.getByTestId('rel-from-glyph-2'));
    await user.click(screen.getByTestId('rel-to-glyph-2'));
    await user.click(screen.getByTestId('rel-save'));
    expect(relations()[0]!.pairs).toEqual([
      { from: [1], to: [0], style: null },
      { from: [2], to: [2], style: null },
    ]);
  });

  it('drops a deletion confirmed after a re-render, and closes the pair menu on one', async () => {
    const { project } = await setup(true);
    const f1 = project.formulas[0]!;
    const oldKey = f1.snapshot!.key;
    // Two pairs: a → a and + → =.
    act(() => {
      useProjectStore.getState().update((d) => {
        d.relations[0]!.pairs.push({ from: [1], to: [1], style: null });
      });
    });
    const user = userEvent.setup();
    render(
      <RelationEditor
        request={{ kind: 'edit', relationId: project.relations[0]!.id }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('rel-pair-1-text')).toHaveTextContent('+ → =');
    // The pair menu of target `a`, open while the first formula is re-rendered: it closes.
    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('rel-to-glyph-0') });
    expect(screen.getByTestId('rel-style-menu')).toBeInTheDocument();
    const swap = (map: number[], key: string) =>
      act(() => {
        useRenderStore.getState().setTransition(f1.id, { from: oldKey, to: key, map });
        useProjectStore.getState().amend((d) => {
          remapGlyphRefs(d, f1.id, map);
          const f = d.formulas.find((x) => x.id === f1.id)!;
          const g = f.snapshot!.glyphs;
          f.snapshot = { ...f.snapshot!, key, glyphs: [g[1]!, g[0]!, ...g.slice(2)] };
        });
      });
    swap([1, 0, 2, 3, 4], 'reordered');
    expect(screen.queryByTestId('rel-style-menu')).toBeNull();
    expect(screen.getByTestId('rel-pair-0')).toHaveAttribute('data-from', '1'); // a, still
    // Ask to delete the first pair; while the confirmation waits, the formula is re-rendered
    // back. Confirmed then, the deletion is dropped: the draft is as the project has it.
    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('rel-to-glyph-0') });
    await user.click(screen.getByTestId('rel-style-menu-delete'));
    const pending = useDialogStore.getState().queue[0]!;
    expect(pending.title).toBe('Delete this link?');
    act(() => {
      useRenderStore
        .getState()
        .setTransition(f1.id, { from: 'reordered', to: oldKey, map: [1, 0, 2, 3, 4] });
      useProjectStore.getState().amend((d) => {
        remapGlyphRefs(d, f1.id, [1, 0, 2, 3, 4]);
        const f = d.formulas.find((x) => x.id === f1.id)!;
        const g = f.snapshot!.glyphs;
        f.snapshot = { ...f.snapshot!, key: oldKey, glyphs: [g[1]!, g[0]!, ...g.slice(2)] };
      });
    });
    await act(async () => useDialogStore.getState().settle(pending.key, 'confirm'));
    expect(screen.getAllByTestId(/^rel-pair-\d+$/)).toHaveLength(2);
    expect(screen.getByTestId('rel-pair-0-text')).toHaveTextContent('a → a');
    expect(screen.getByTestId('rel-pair-1-text')).toHaveTextContent('+ → =');
    expect(screen.getByTestId('rel-message')).toHaveTextContent(
      'A formula was re-rendered while the dialog was open: nothing was deleted. Delete the links again.',
    );
    expect(screen.getByTestId('rel-save')).toBeDisabled();
    // Asked again, the link goes, and Save writes what is left.
    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('rel-to-glyph-0') });
    await user.click(screen.getByTestId('rel-style-menu-delete'));
    const again = useDialogStore.getState().queue[0]!;
    await act(async () => useDialogStore.getState().settle(again.key, 'confirm'));
    expect(screen.getAllByTestId(/^rel-pair-\d+$/)).toHaveLength(1);
    await user.click(screen.getByTestId('rel-save'));
    expect(relations()[0]!.pairs).toEqual([{ from: [1], to: [1], style: null }]);
  });

  it('holds Save back when a formula was re-rendered and the step is not known', async () => {
    const { project } = await setup(true);
    const f2 = project.formulas[1]!;
    render(
      <RelationEditor
        request={{ kind: 'edit', relationId: project.relations[0]!.id }}
        onClose={() => {}}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByTestId('rel-from-glyph-2'));
    await user.click(screen.getByTestId('rel-to-glyph-2'));
    expect(screen.getByTestId('rel-save')).toBeEnabled();
    act(() => {
      useProjectStore.getState().amend((d) => {
        const f = d.formulas.find((x) => x.id === f2.id)!;
        f.snapshot = { ...f.snapshot!, key: 'elsewhere' };
      });
    });
    expect(screen.getByTestId('rel-message')).toHaveTextContent(
      '“f2” was re-rendered while you edited: close the editor and open it again.',
    );
    expect(screen.getByTestId('rel-save')).toBeDisabled();
    await user.click(screen.getByTestId('rel-save'));
    expect(relations()[0]!.pairs).toEqual([{ from: [0], to: [0], style: null }]);
  });

  it('closes itself when another document takes the project’s place', async () => {
    const { project } = await setup(true);
    render(
      <RelationEditor
        request={{ kind: 'edit', relationId: project.relations[0]!.id }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('relation-editor')).toBeInTheDocument();
    act(() => {
      useDocumentStore.getState().beginDocument(useProjectStore.getState().project, {
        fileName: null,
        handle: null,
      });
    });
    expect(screen.queryByTestId('relation-editor')).not.toBeInTheDocument();
  });

  it('does not open a relation of a locked track: it says so', async () => {
    const { project } = await setup(true);
    act(() =>
      useProjectStore.getState().update((d) => {
        d.tracks[1]!.locked = true;
      }),
    );
    render(
      <RelationEditor
        request={{ kind: 'edit', relationId: project.relations[0]!.id }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('rel-error')).toHaveTextContent('is locked');
    expect(screen.queryByTestId('rel-canvas')).toBeNull();
  });

  it('says so, instead of failing, when a formula of the relation is gone (dangling-ref)', async () => {
    const { project } = await setup(true);
    act(() =>
      useProjectStore.getState().update((d) => {
        d.formulas.splice(0, 1); // the file referred to a formula that is not in it
      }),
    );
    render(
      <RelationEditor
        request={{ kind: 'edit', relationId: project.relations[0]!.id }}
        onClose={() => {}}
      />,
    );
    expect(screen.getByTestId('rel-error')).toHaveTextContent('no longer exists');
    expect(screen.queryByTestId('rel-canvas')).toBeNull();
  });
});

describe('Edit path… from the pair menu', () => {
  it('saves the relation, closes the editor and opens the preview mode on that pair', async () => {
    const { project } = await setup(true);
    const relationId = project.relations[0]!.id;
    const onClose = vi.fn();
    const user = userEvent.setup();
    render(<RelationEditor request={{ kind: 'edit', relationId }} onClose={onClose} />);
    // Give the pair a style first, so that the save is visible in the project.
    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('rel-to-glyph-0') });
    await user.click(screen.getByTestId('rel-style-menu-fade'));
    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('rel-to-glyph-0') });
    await user.click(screen.getByTestId('rel-style-menu-edit-path'));
    expect(onClose).toHaveBeenCalled();
    expect(useProjectStore.getState().project.relations[0]!.pairs[0]!.style).toBe('fade');
    expect(usePathEdit.getState().target).toEqual({
      origin: { kind: 'relation', relationId },
      index: 0,
    });
    act(() => usePathEdit.getState().close());
  });
});
