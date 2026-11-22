/* Captures of manim/python: the Export ▸ Python — ManimCE… dialog of the example `python-scene`
 * (three equations, MathJax glyphs, no companion): the options, the notes the generator makes and
 * the code. The page reads the same code from the example's own Python files. */

/** Export ▸ Python — ManimCE… (or ManimGL…): the dialog, with its code generated. */
const openPythonDialog = (library) => async (page, kit) => {
  await kit.choose(`Export ▸ Python — ${library}…`);
  await kit.waitFor('export-python');
  await kit.waitFor('export-python-code', { timeout: 30_000 });
  await kit.settle({ renders: false });
};

export default {
  page: 'manim/python',
  project: 'docs/web/examples/python-scene.mfe.json',
  viewport: { width: 1440, height: 900 },
  items: [
    {
      // The dialog: the scene's name, the two options, the notes of the generator (every formula
      // is matched by position when the scene runs: the renders are MathJax's) and the code.
      kind: 'shot',
      name: 'export-dialog',
      scale: 1.5,
      setup: openPythonDialog('ManimCE'),
      target: 'export-python',
      padding: 10,
      highlight: [
        { target: 'export-python-scene-name', label: 1, markerAt: 'right' },
        {
          target: { css: '.py-check:has([data-testid="export-python-indexing"])' },
          label: 2,
          markerAt: 'right',
        },
        {
          target: { css: '.py-check:has([data-testid="export-python-comments"])' },
          label: 3,
          markerAt: 'right',
        },
        { target: 'export-python-issues', label: 4, markerAt: 'right' },
        { target: 'export-python-code', label: 5, markerAt: 'right' },
        {
          target: { union: ['export-python-copy', 'export-python-download'] },
          label: 6,
          markerAt: 'top',
        },
      ],
    },
  ],
};
