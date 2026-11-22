/* The preferences of the editor, for reference/preferences: what each does, where it is changed,
 * and its default, which `default(data)` reads from `media/reference/preferences/defaults.data.js`
 * (the capture of `defaultPreferences()` and the other defaults of the app), so that a default
 * cannot drift from the app. `tools/reference-tables.mjs` makes the tables from this file.
 *
 * A preference is kept by the browser, for its user, and is not part of a project file. Each row
 * says where in the app it is set, in the order a reader meets them: `where` lists places, each a
 * menu path or a label of the app as it is shown (`{ ui }`), a key (`{ keys }`) or plain words;
 * `page` is the page of the documentation that teaches what it changes. */

const onOff = (value) => (value ? 'On' : 'Off');
const intro = { write: 'Write', fade_in: 'FadeIn', grow_from_center: 'GrowFromCenter', draw_border_then_fill: 'DrawBorderThenFill', create: 'Create' };
const outro = { fade_out: 'FadeOut', unwrite: 'Unwrite', shrink_to_center: 'ShrinkToCenter', uncreate: 'Uncreate' };
const colour = (data, hex) => data.guideColors.find((c) => c.value.toLowerCase() === hex.toLowerCase())?.label ?? hex;
const seconds = (value) => `${+value.toFixed(3)} s`;
const spec = (names, value) => `${names[value.kind] ?? value.kind}, ${seconds(value.duration)}, ${value.easing}`;

export const PREFERENCE_GROUPS = [
  { id: 'look', title: 'Look and layout' },
  { id: 'preview', title: 'The Preview' },
  { id: 'new', title: 'New objects and animations' },
  { id: 'output', title: 'Glyphs and export' },
];

export const PREFERENCES = [
  // ---- Look and layout ----
  {
    group: 'look',
    label: 'Theme',
    where: [{ ui: 'View ▸ Theme' }, { ui: 'View ▸ Toggle theme' }, 'the button at the end of the menu bar'],
    what: 'Dark, Light, or System, which follows the colour scheme of your operating system as it changes. The button and [[Toggle theme]] flip between dark and light and keep that choice.',
    page: 'start/interface#themes',
    default: (d) => d.theme.default[0].toUpperCase() + d.theme.default.slice(1),
  },
  {
    group: 'look',
    label: 'Panels',
    where: [{ ui: 'View ▸ Panels' }, 'the chevron in a panel’s header', 'dragging the gaps between panels'],
    what: 'Folds the Creator, the Animations panel and the Timeline to their title bars, and sets their sizes. The browser remembers both, so the layout comes back as you left it. In the stacked layout of a narrow window there is nothing to fold.',
    page: 'start/interface#panels',
    default: () => 'All three shown, at their standard sizes',
  },
  {
    group: 'look',
    label: 'Zen mode',
    where: [{ ui: 'Preferences ▸ Zen mode' }],
    what: 'An arrangement for small windows: the timeline is a column on the left, drawn vertical, and the Preview takes all the rest. The Creator and the Animations panel are behind two buttons of a strip along the Preview, each opening its panel as a half of a drawer over it. The browser also remembers the side of the Preview the strip is on, which halves are open, the drawer’s height and where its halves meet.',
    page: 'start/interface#zen',
    default: (d) => (d.preferences.zenMode ? 'On' : 'Off'),
  },
  {
    group: 'look',
    label: 'Creator list',
    plainLabel: true,
    where: ['the key beside the search in the Creator, which switches to the other view'],
    what: 'Shows the formulas as rows with their rendering, or as a grid of blocks.',
    page: 'basics/formulas#list-blocks',
    default: (d) => (d.preferences.creatorView === 'list' ? 'List' : 'Blocks'),
  },
  {
    group: 'look',
    label: 'Previews of the Creator list',
    plainLabel: true,
    where: ['the +/− key of the Creator’s toolbar (a click larger, a right-click smaller), in the list view'],
    what: 'How tall the drawing of each card of the list view is: 1×, 1.5×, 2× or 3× its standard height of 52 pixels. The block view has a size of its own.',
    page: 'basics/formulas#preview-size',
    default: (d) => `${d.preferences.creatorListPreview}×`,
  },
  {
    group: 'look',
    label: 'Preview tooltip of the blocks',
    plainLabel: true,
    where: ['the +/− key of the Creator’s toolbar (a click larger, a right-click smaller), in the block view'],
    what: 'How large the tooltip beside a block is, with its drawing: 1×, 1.5×, 2× or 3×, the drawing as many times wider and taller. The list view has a size of its own.',
    page: 'basics/formulas#preview-size',
    default: (d) => `${d.preferences.creatorBlockPreview}×`,
  },
  {
    group: 'look',
    label: 'Glyph list',
    where: ['the Glyph list key beside the Glyphs title in the formula editor and the text editor'],
    what: 'Lists the glyphs under the drawing as keys, each with its index and label: the way to pick glyphs from the keyboard. It takes room, so it shows only when asked for.',
    page: 'layout/glyph-picking#glyph-view',
    default: (d) => onOff(d.preferences.glyphList),
  },
  {
    group: 'look',
    label: 'Glyph list of the pair editors',
    plainLabel: true,
    where: ['the Glyph list key in the relation editor and in the pair editor of a Morph block'],
    what: 'The same list under each of the two formulas of a pair editor: one choice for the two editors.',
    page: 'transforms/relation-editor#keyboard',
    default: (d) => onOff(d.preferences.relationGlyphList),
  },
  {
    group: 'look',
    label: 'Formula keypad',
    where: ['the ⌨ Keyboard key beside the LaTeX title of the formula editor, which shows and hides it'],
    what: 'Whether the on-screen keypad of the formula editor, under the visual field, was left shown: it is there again the next time the editor opens, until its key hides it.',
    page: 'basics/formulas#keyboard',
    default: (d) => (d.preferences.formulaKeyboardShown ? 'Shown' : 'Hidden'),
  },
  // ---- The Preview ----
  {
    group: 'preview',
    label: 'Snap to objects',
    where: [{ ui: 'Preferences ▸ Snap to objects' }, 'the magnet button in the Preview’s toolbar'],
    what: 'A dragged formula sticks to the edges and centres of the other formulas and of the frame, and to the gaps between them. Hold Ctrl/⌘ after pressing to drag freely.',
    page: 'basics/preview#drag-snap',
    default: (d) => onOff(d.preferences.snapObjects),
  },
  {
    group: 'preview',
    label: 'Guide colour',
    where: [{ ui: 'Preferences ▸ Guide colour' }],
    what: 'The colour of the guide lines that a snapped drag shows: yellow, orange, magenta, cyan, green or white.',
    page: 'basics/preview#drag-snap',
    default: (d) => colour(d, d.preferences.guideColor),
  },
  {
    group: 'preview',
    label: 'Guide width',
    where: [{ ui: 'Preferences ▸ Guide width' }],
    what: 'How thick those lines are: thin, regular or thick.',
    page: 'basics/preview#drag-snap',
    default: (d) => d.preferences.guideWidth[0].toUpperCase() + d.preferences.guideWidth.slice(1),
  },
  {
    group: 'preview',
    label: 'Glyph selection colour',
    where: [{ ui: 'Preferences ▸ Glyph selection colour' }],
    what: 'The colour of the glyphs picked with Alt in the Preview, and of the rectangle that picks them. The same six colours as the guides.',
    page: 'layout/glyph-picking#selection-colour',
    default: (d) => colour(d, d.preferences.pickColor),
  },
  {
    group: 'preview',
    label: 'Keep the transform handles shown',
    where: [{ ui: 'Preferences ▸ Keep the transform handles shown' }, 'the handles button in the Preview’s toolbar'],
    what: 'Keeps the handles for scaling and rotating on the selected clips. Off, they show only while you hold Shift.',
    page: 'basics/preview#handles',
    default: (d) => onOff(d.preferences.keepHandles),
  },
  {
    group: 'preview',
    label: 'Scale step',
    where: [{ ui: 'Preferences ▸ Scale step' }, { ui: 'Preferences ▸ Scale step ▸ Custom…' }],
    what: 'The step that a corner drag’s scale snaps to. Choose a preset, or [[Custom…]] for a number or a fraction such as 1/3, from 0.01 to 2.',
    page: 'basics/preview#handles',
    default: (d) => `${d.preferences.scaleStep} (presets ${d.scaleSteps.join(', ')})`,
  },
  {
    group: 'preview',
    label: 'Locked formulas',
    where: [{ ui: 'Preferences ▸ Locked formulas' }],
    what: 'How opaque the Preview draws a formula that is locked in it, of its own opacity: 20, 30, 40, 50, 60, 80 or 100 %. Only the Preview is faded; nothing exported is.',
    page: 'basics/preview#lock',
    default: (d) => `${Math.round(d.preferences.lockedOpacity * 100)} %`,
  },
  {
    group: 'preview',
    label: 'Show grid',
    where: [{ ui: 'Preferences ▸ Show grid' }, 'the # button in the bar under the Preview', { keys: "Mod+'" }],
    what: 'Draws a grid under the formulas and makes a dragged formula snap to it (Ctrl/⌘ held frees it). The grid is never part of an export.',
    page: 'basics/preview#grid',
    default: (d) => onOff(d.preferences.grid),
  },
  {
    group: 'preview',
    label: 'Grid spacing',
    where: [{ ui: 'Preferences ▸ Grid spacing' }, '− and + beside the # button', 'Alt+↑ and Alt+↓ while the grid is shown'],
    what: 'The distance between grid lines, in Manim units: 2, 1, 0.5, 0.25 or 0.1.',
    page: 'basics/preview#grid',
    default: (d) => `${d.preferences.gridStep} ${d.preferences.gridStep === 1 ? 'unit' : 'units'}`,
  },
  {
    group: 'preview',
    label: 'Grid snaps',
    where: [{ ui: 'Preferences ▸ Grid snaps' }, 'the last button of the grid controls, under the Preview'],
    what: 'What the grid holds while you drag: the formula’s centre, or whichever of its edges is nearer to a line.',
    page: 'basics/preview#grid',
    default: (d) => (d.preferences.gridAnchor === 'center' ? 'The formula’s centre' : 'Its nearest edges'),
  },
  {
    group: 'preview',
    label: 'Show the camera’s route',
    where: [{ ui: 'Preferences ▸ Show the camera’s route' }],
    what: 'In the world view of a scene with a camera, draws the line with arrowheads that joins the camera’s frames in the order its moves run.',
    page: 'animations/camera#on',
    default: (d) => onOff(d.preferences.cameraRoute),
  },
  {
    group: 'preview',
    label: 'Dim what the camera leaves out',
    where: [{ ui: 'Preferences ▸ Dim what the camera leaves out' }],
    what: 'In the world view of a scene with a camera, dims what the camera leaves out at the playhead.',
    page: 'animations/camera#on',
    default: (d) => onOff(d.preferences.cameraVeil),
  },
  {
    group: 'preview',
    label: 'Circle selector',
    where: ['the Circle selector button in the Preview’s toolbar', { keys: 'S' }],
    what: 'A click takes the symbol nearest to the pointer within a circle, instead of what is right under it: the formula, or with Alt the symbol itself.',
    page: 'layout/glyph-picking#circle',
    default: (d) => onOff(d.preferences.circleSelect),
  },
  {
    group: 'preview',
    label: 'Reach of the circle',
    plainLabel: true,
    where: ['Shift + wheel in the Preview while the circle selector or Align by symbol is on, and over the drawing of a pair editor'],
    what: 'How far from the pointer, in screen pixels, a symbol is still picked: the radius of the circle selector, of Align by symbol and of the circle that takes glyphs in the pair editors.',
    page: 'layout/glyph-picking#circle',
    default: (d) => `${d.symbolRadius.default} px (from ${d.symbolRadius.min} to ${d.symbolRadius.max})`,
  },
  // ---- New objects and animations ----
  {
    group: 'new',
    label: 'Standard scale',
    where: [{ ui: 'Preferences ▸ Standard scale…' }],
    what: 'The size that new formulas and new LaTeX texts are born with: 1 is Manim’s font size 48, 1.5 is 72. Saving leaves the objects that exist as they are; [[Apply to all formulas]] and [[Apply to all texts]] give the scale typed to every one of the project.',
    page: 'objects/organizing#standard-scale',
    default: (d) => `${d.preferences.standardScale.math} for formulas and ${d.preferences.standardScale.tex} for texts (font size ${d.fontSize})`,
  },
  {
    group: 'new',
    label: 'Split suffix',
    where: [{ ui: 'Preferences ▸ Split suffix…' }],
    what: 'The suffix that names the copy a split makes: cutting a clip at the playhead (S) gives its second half a copy of its formula, named after it with this suffix — f1 becomes f1_s, or f1_s1, f1_s2… when that name is taken. Letters, digits and “_”, at most 16, so that the name stays a Python variable.',
    page: 'basics/timeline#splitting',
    default: (d) => d.preferences.splitSuffix,
  },
  {
    group: 'new',
    label: 'Always add intro',
    where: [{ ui: 'Edit ▸ Always add intro' }],
    what: 'New clips get the intro chosen in [[Default intro & outro…]], instead of appearing at once. A formula can choose its own with [[Appears with]] in its editor.',
    page: 'basics/intro-outro#defaults',
    default: (d) => onOff(d.preferences.autoIntro),
  },
  {
    group: 'new',
    label: 'Always add outro',
    where: [{ ui: 'Edit ▸ Always add outro' }],
    what: 'New clips get the outro chosen in [[Default intro & outro…]], instead of disappearing at once.',
    page: 'basics/intro-outro#defaults',
    default: (d) => onOff(d.preferences.autoOutro),
  },
  {
    group: 'new',
    label: 'Default intro & outro',
    where: [{ ui: 'Edit ▸ Default intro & outro…' }],
    what: 'The animation, duration, easing, lag ratio and, for the fades, shift and scale of the intro and of the outro that the two switches above give. [[Restore defaults]] puts the standard ones back.',
    page: 'basics/intro-outro#defaults',
    default: (d) => `intro ${spec(intro, d.preferences.intro)}; outro ${spec(outro, d.preferences.outro)}`,
  },
  {
    group: 'new',
    label: 'Suggest morph pairs',
    where: [{ ui: 'Edit ▸ Suggest morph pairs' }],
    what: 'A new Morph block starts with the pairs that Suggest finds for it where it lands, instead of none. A copy of a block is never given pairs.',
    page: 'transforms/morph',
    default: (d) => onOff(d.preferences.autoSuggestMorphPairs),
  },
  // ---- Glyphs and export ----
  {
    group: 'output',
    label: 'Glyph source',
    where: ['the three Glyph source items of the View menu'],
    what: 'Which renderer draws the formulas: Automatic (the companion’s exact LaTeX glyphs when it runs, MathJax otherwise), MathJax, or LaTeX (companion). This one is not remembered: after a reload it is Automatic again.',
    page: 'manim/companion#exact-glyphs',
    default: (d) => (d.glyphSource === 'auto' ? 'Automatic' : d.glyphSource),
  },
  {
    group: 'output',
    label: 'Python target of the Export… button',
    plainLabel: true,
    where: [{ ui: 'Export ▸ Python — ManimCE…' }, { ui: 'Export ▸ Python — ManimGL…' }],
    what: 'The [[Export…]] button exports Python for the target of the last Python export you opened. The browser remembers it.',
    page: 'basics/export#menu',
    default: () => 'ManimCE',
  },
];
