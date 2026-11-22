/* Shared by the capture files of the relation pages: how a relation editor is opened, and a check
 * of the layout the drawing of a pair editor opens with.
 *
 *   import { openEditor, createEditor, newRelation } from '../_shared/relation-editor.mjs';
 *   setup: openEditor('r_distribute'),
 *
 * Each helper is a step, `(page, kit) => …`, and leaves the editor open and settled. They call the
 * store function the app's own buttons call (the editor's `openRelationEditor`), so that a figure
 * of the editor does not depend on where the clips lie on the timeline. The gestures that open it
 * from the timeline (the link ports) and from the Animations panel (the Relations tab) have their
 * own figures in transforms/relation-editor. */

export const EDITOR_STORE = '/src/ui/relations/relationEditorStore.ts';

/** Opens the relation editor on the relation `id`, as «Edit pairs…» does. */
export const openEditor = (id) => async (page, kit) => {
  await kit.app(
    EDITOR_STORE,
    (module, relationId) => module.openRelationEditor({ kind: 'edit', relationId }),
    id,
  );
  await page.getByTestId('relation-editor').waitFor();
  await kit.settle();
};

/** Opens the editor on a new relation from clip `from` to clip `to` (ids), as «Create
 * relation…» does: an editor with no pair, over a project that keeps the relations it has. */
export const createEditor = (from, to) => async (page, kit) => {
  await kit.app(
    EDITOR_STORE,
    (module, ids) =>
      module.openRelationEditor({ kind: 'create', fromClipId: ids.from, toClipId: ids.to }),
    { from, to },
  );
  await page.getByTestId('relation-editor').waitFor();
  await kit.settle();
};

/** The same over a project without its relations: the example's own are taken away first, so
 * that the new one has nothing in its way. */
export const newRelation = (from, to) => async (page, kit) => {
  await kit.mfe((mfe) =>
    mfe.useProjectStore.getState().update((draft) => {
      draft.relations = [];
    }),
  );
  await createEditor(from, to)(page, kit);
};

/** Warns when the drawing of the open pair editor — `prefix` 'rel' for the relation editor,
 * 'morph' for a Morph block's — is not laid out as `layout` says ('stacked' or 'side'): the words
 * of the page say where the two formulas are. The drawing chooses as it opens, the layout that
 * draws what takes part larger. */
export const expectLayout = (prefix, layout) => async (page, kit) => {
  const drawn = await page.getByTestId(`${prefix}-canvas`).getAttribute('data-layout');
  if (drawn !== layout) kit.warn(`the drawing opened ${drawn}, and the page says ${layout}`);
};

/** «Fit» over the corner of the drawing of the open pair editor, when the drawing opened nearer
 * than its whole (framed on what takes part), for a figure of the whole drawing; then the
 * pointer goes back to the corner of the window, off the drawing. */
export const showWholeDrawing = (prefix) => async (page, kit) => {
  if (await page.getByTestId(`${prefix}-view-fit`).isEnabled()) {
    await kit.click(`${prefix}-view-fit`);
    await kit.settle({ renders: false });
  }
  await kit.move({ x: 6, y: 6 });
};
