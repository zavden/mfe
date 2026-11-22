/* The page that teaches each row of the shortcut sheet (reference/shortcuts), by the row's
 * `keys` text as `app/src/ui/help/shortcutSheet.ts` writes it. `null` is a row with no page to
 * point to (undo and redo, Esc).
 *
 * `tools/reference-tables.mjs` reads this file; a row of the sheet that is not here is reported,
 * so a new shortcut of the app cannot reach the page without a link (or an explicit `null`). */
export const SHORTCUT_LINKS = {
  // Files and history
  'Ctrl/⌘+Alt+N, Ctrl/⌘+O': 'start/projects',
  'Ctrl/⌘+S, Ctrl/⌘+Alt+S': 'start/projects',
  'Ctrl/⌘+Shift+S': 'start/projects',
  'Ctrl/⌘+Z; Ctrl/⌘+Shift+Z or Ctrl+Y': null,
  // Playback
  Space: 'basics/preview',
  'Home, End; ←/→ (Shift: 1 s)': 'basics/timeline',
  'Ctrl/⌘ (held while dragging on the ruler)': 'basics/timeline',
  // Editing
  'Ctrl/⌘+A': 'basics/preview',
  'Ctrl/⌘+F; Esc': 'objects/organizing',
  'Alt+A / Alt+H / Alt+D (Shift: to the frame)': 'layout/align',
  'Alt+W / Alt+V / Alt+S (Shift: to the frame)': 'layout/align',
  'Ctrl/⌘+Alt+H / Ctrl/⌘+Alt+V': 'layout/align',
  '←/→, ↑/↓ (Shift: 0.1)': 'basics/preview',
  'Alt+G': 'layout/align-symbol',
  'Shift+Alt+G': 'layout/align-symbol',
  S: 'layout/glyph-picking',
  G: 'layout/align-symbol',
  'Shift+C': 'color/coloring',
  'Shift+V': 'color/coloring',
  'Enter; Backspace; Esc': 'color/coloring',
  'Delete / Backspace': 'basics/timeline',
  'F2; Enter': 'basics/formulas',
  'F2; Enter (→/← too in the list view)': 'objects/organizing',
  // No page teaches the keys of the formula list yet (objects/organizing has the search, the
  // region and the groups, not the keyboard): no link rather than a link that does not answer.
  '↑/↓, Home, End; Shift+↑/↓; Ctrl/⌘+Space (←/→ too in the block view)': null,
  'Ctrl/⌘+D': 'basics/timeline',
  'Tab; ←/→, ↑/↓, Home, End; Shift+←/→': 'basics/timeline',
  'Enter; Shift+F10 or Menu': 'reference/menus',
  'Alt+←/→ (Shift: 5 frames); Alt+↑/↓': 'basics/timeline',
  'Alt+←/→ (Shift: 5 frames)': 'animations/blocks',
  // Preview and timeline
  'Shift (held)': 'basics/preview',
  'Alt (held)': 'basics/intro-outro',
  'Ctrl/⌘ (held while dragging)': 'basics/preview',
  'Alt; Ctrl/⌘+Alt (pressed while dragging)': 'basics/preview',
  'Ctrl/⌘ + wheel; Alt + drag on empty space, or the middle button': 'basics/preview',
  'Ctrl/⌘ + wheel; middle button (held)': 'basics/timeline',
  'T (held while moving the mouse)': 'basics/timeline',
  'Shift+T (held while moving the mouse)': 'basics/timeline',
  '↑/↓, ←/→ (in Zen mode)': 'start/interface#zen',
  'Shift (held while dragging on the ruler)': 'basics/timeline',
  'I, O; Esc': 'basics/timeline',
  'Ctrl/⌘; Alt; Alt+Shift (held while dragging an end of a line)': 'objects/lines-arrows',
  // Nor do the number boxes' arrow keys and wheel have a page (animations/timing teaches the
  // timing, not these).
  '↑/↓ (Shift: ×10); wheel with the mouse button held on the number (Shift: ×10, Alt: ×0.1)': null,
  'Alt + click; Alt + drag from a formula': 'layout/glyph-picking',
  'Enter / Esc': 'objects/shapes',
  '←/→, ↑/↓ (Shift: 10 px); Delete / Backspace; Enter, Esc': 'transforms/custom-paths',
  'Delete / Backspace; Enter; Esc': 'objects/lines-arrows',
  'Alt + click; Esc': 'objects/lines-arrows',
  "Ctrl/⌘+'": 'basics/preview',
  'Alt+↑ / Alt+↓': 'basics/preview',
  // Dialogs and help
  '↓ / ↑, Enter; ←/→; Home, End; a letter; Tab': 'reference/menus',
  'Ctrl/⌘+Enter': 'basics/formulas',
  Esc: null,
  'C; A': 'start/interface',
  'Alt+M': 'animations/camera',
  V: 'animations/camera#view',
  'F (held)': 'animations/camera#formulas',
  'Tab; ←/→, Home, End; Enter, Shift+F10 or Menu': 'animations/camera#keys',
  'P; Shift+P': 'basics/slides#add',
  'Tab; ←/→; Delete / Backspace; Enter; Shift+F10 or Menu': 'basics/slides#keys',
  '?': 'reference/menus',
};

/** What the sheet leaves unsaid about a row, appended to its text as a sentence of its own (by the
 * row's `keys`; `[[Label]]` is an interface label). */
export const SHORTCUT_EXTRA = {
  // The sheet says where the file keys work. The handler (shortcuts.ts) leaves them to a text field
  // with the focus (only Ctrl/⌘+F is taken there) and takes nothing while a dialog is open: the
  // browser may then act on them.
  'Ctrl/⌘+Alt+N, Ctrl/⌘+O':
    'In a text field or a dialog the browser may take these keys instead: click out of the field, close the dialog, or use the [[File]] menu.',
  'Ctrl/⌘+S, Ctrl/⌘+Alt+S':
    'In a text field or a dialog the browser may take these keys instead (Ctrl+S offers to save the page): click out of the field, close the dialog, or use the [[File]] menu.',
};
