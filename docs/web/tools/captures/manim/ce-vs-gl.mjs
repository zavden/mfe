/* Captures of manim/ce-vs-gl: the same project, `ce-gl-shapes` (a sum, a rounded box and a brace;
 * its formula carries the exact glyphs of a LaTeX render, made for ManimCE), exported for each
 * library. The dialogs differ in their notes: for the other library, the glyphs are found by
 * position and the sizes are converted. */

const openPythonDialog = (library) => async (page, kit) => {
  await kit.choose(`Export ▸ Python — ${library}…`);
  await kit.waitFor('export-python');
  await kit.waitFor('export-python-code', { timeout: 30_000 });
  await kit.settle({ renders: false });
};

/** The dialog from its top down to its notes: what the figures are about (the code is the other
 * page's business). */
const downToNotes = async (page, kit) => {
  const dialog = await kit.box('export-python');
  const notes = await kit.box('export-python-issues');
  return { x: dialog.x, y: dialog.y, width: dialog.width, height: notes.y + notes.height - dialog.y + 6 };
};

const pad = { top: 10, right: 10, bottom: 0, left: 10 };

export default {
  page: 'manim/ce-vs-gl',
  project: 'docs/web/examples/ce-gl-shapes.mfe.json',
  viewport: { width: 1440, height: 900 },
  items: [
    {
      kind: 'shot',
      name: 'dialog-ce',
      setup: openPythonDialog('ManimCE'),
      target: downToNotes,
      padding: pad,
      highlight: [{ target: 'export-python-issues', label: 1, markerAt: 'right' }],
    },
    {
      kind: 'shot',
      name: 'dialog-gl',
      setup: openPythonDialog('ManimGL'),
      target: downToNotes,
      padding: pad,
      highlight: [{ target: 'export-python-issues', label: 1, markerAt: 'right' }],
    },
  ],
};
