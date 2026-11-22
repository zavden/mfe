/* Captures of manim/companion: the renderer badge of the menu bar, as it reads with no companion
 * running (the tools never start one), and the View menu's choice of glyph source. */

export default {
  page: 'manim/companion',
  project: 'docs/web/examples/hero.mfe.json',
  viewport: { width: 1440, height: 900 },
  items: [
    {
      // The right end of the menu bar: the renderer the formulas really use, then the theme switch.
      kind: 'shot',
      name: 'renderer-badge',
      target: async (page, kit) => {
        const bar = await kit.box('menu-bar');
        const badge = await kit.box('engine-status');
        const toggle = await kit.box('theme-toggle');
        const left = badge.x - 14;
        return {
          x: left,
          y: bar.y,
          width: toggle.x + toggle.width + 14 - left,
          height: bar.height + 30,
        };
      },
      highlight: [{ target: 'engine-status', label: 1, markerAt: 'bottom' }],
    },
    {
      // View ▸ Glyph source: Automatic, MathJax, LaTeX (companion).
      kind: 'shot',
      name: 'glyph-source',
      setup: async (page, kit) => {
        await kit.openMenu('View');
      },
      target: '.menu-popup[aria-label="View"]',
      padding: 10,
      highlight: [
        {
          target: { role: 'menuitemradio', name: 'Glyph source: Automatic', exact: false },
          label: 1,
          markerAt: 'right',
        },
      ],
    },
  ],
};
