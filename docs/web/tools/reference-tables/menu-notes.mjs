/* What each entry of the app's menus does, and the page that teaches it, for reference/menus.
 *
 * Every note is `[text, page]` (a page id of the site, or null), or `{ text, page, label }` when
 * the entry's label changes with the project (its text then says it: "Delete N clips"). The keys
 * are the entries' test ids as the capture files read them
 * (`tools/captures/reference/menus.mjs`): `menu-item-<menu>-<entry>` for the menu bar, and the
 * test ids of the right-click menus. An entry of a context menu whose label differs between kinds
 * of object has the key `<test id>|<label>`; the plain test id serves otherwise.
 *
 * `tools/reference-tables.mjs` reads this file: an entry of the data without a note is reported
 * (and nothing is written), and a note without an entry is reported as stale. The submenus that
 * only hold choices of one thing (every item a radio) are listed in one line by the generator;
 * every other submenu needs a note for each of its entries. */

/** The keys an entry of the menu bar has on a Mac, where they are others than elsewhere, written
 * for `<kbd data-keys-mac>` (`Mod` is ⌘ there, `Ctrl` the Control key itself). The capture reads
 * the menus as Windows and Linux show them, so these are written here, from what the app does on
 * a Mac (`saveAsKeys`, `syncFolderKeys` and `commandForKey` of `app/src/ui/project/shortcuts.ts`,
 * the `keys` of `DISTRIBUTE_ACTIONS`; the README lists them under "On macOS"): Save As is ⇧⌘S
 * there and Sync folder ⌥⌘S, and Distribute takes the Control key, ⌃⌥H and ⌃⌥V. An id that is no
 * entry of the menus, or an entry that has no keys, is reported. */
export const MENU_MAC_KEYS = {
  'menu-item-file-sync-folder': 'Mod+Alt+S',
  'menu-item-file-save-as': 'Mod+Shift+S',
  'menu-item-edit-distribute-h': 'Ctrl+Alt+H',
  'menu-item-edit-distribute-v': 'Ctrl+Alt+V',
};

/** The entries of the menu bar's menus, and of the menu the Export… button's arrow opens. */
export const MENU_BAR_NOTES = {
  // ---- File ----
  'menu-item-file-new': [
    "Starts an empty project. When the project has unsaved changes it asks first: Save, Don't save or Cancel.",
    'start/projects',
  ],
  'menu-item-file-open': [
    'Opens the Projects dialog: the projects of your synced folder as cards, with a search box and favourites. [[Other file…]] in that dialog is the browser’s own file picker, for a file that is not in the folder.',
    'start/projects',
  ],
  'menu-item-file-sync-folder': [
    'Picks the folder that holds your projects, once. Chrome and Edge keep it and list it again each time; other browsers keep a snapshot of it until you sync again.',
    'start/projects',
  ],
  'menu-item-file-recover': [
    'Lists the autosaved work of other tabs that were closed, kept for a week, the five most recent, so you can bring it back.',
    'start/projects',
  ],
  'menu-item-file-recover-none': ['What the submenu says when there is nothing to recover.', 'start/projects'],
  'menu-item-file-save': [
    'Saves the project to its file, and asks where when it has none. A browser without file access downloads a new file each time.',
    'start/projects',
  ],
  'menu-item-file-save-as': [
    'Saves the project under a new name or in a new place; the picker starts in the synced folder when there is one.',
    'start/projects',
  ],
  'menu-item-file-settings': [
    'Opens [[Project settings]]: name, target (ManimCE or ManimGL), resolution, frame rate, background, LaTeX preamble and duration. They belong to the project and are saved in its file.',
    'reference/preferences',
  ],
  // ---- Edit ----
  'menu-item-edit-undo': ['Takes back the last change. During a drag it cancels the drag first.', 'start/interface'],
  'menu-item-edit-redo': ['Brings back what Undo took back.', 'start/interface'],
  'menu-item-edit-delete-formula': [
    'Deletes the formula selected in the Creator, with its clips and their relations, as one undo step. It asks first, and the confirm button is held down.',
    'basics/formulas',
  ],
  'menu-item-edit-copy-properties': [
    'Takes the state of the one clip selected in the Preview as it is at the playhead: position, scale, rotation, flips, opacity, colour and glyph colours.',
    'animations/timing',
  ],
  'menu-item-edit-paste-properties': [
    'Gives the copied properties to the selected clips, all of them but the position or one group. Each entry shows what it would paste; a paste is one undo step.',
    'animations/timing',
  ],
  'menu-item-edit-paste-properties-all': ['Everything but the position.', 'animations/timing'],
  'menu-item-edit-paste-properties-transformation': ['Scale, rotation and flips.', 'animations/timing'],
  'menu-item-edit-paste-properties-appearance': ['Opacity and colour.', 'animations/timing'],
  'menu-item-edit-paste-properties-glyph-colors': [
    'The colours of the glyphs, onto clips of the same formula only, since they go by glyph.',
    'animations/timing',
  ],
  'menu-item-edit-paste-properties-position': ['The position; several clips end up stacked on one point.', 'animations/timing'],
  'menu-item-edit-align': [
    'Lines up the clips selected in the Preview. A lone clip, or Shift held while you choose, aligns to the frame.',
    'layout/align',
  ],
  'menu-item-edit-align-left': ['Aligns on the outermost left edge of the selection.', 'layout/align'],
  'menu-item-edit-align-center': ['Aligns on the middle, horizontally.', 'layout/align'],
  'menu-item-edit-align-right': ['Aligns on the outermost right edge.', 'layout/align'],
  'menu-item-edit-align-top': ['Aligns on the outermost top edge.', 'layout/align'],
  'menu-item-edit-align-middle': ['Aligns on the middle, vertically.', 'layout/align'],
  'menu-item-edit-align-bottom': ['Aligns on the outermost bottom edge.', 'layout/align'],
  'menu-item-edit-align-symbol': [
    'A two-click mode: click the symbol to move, then the reference symbol; a compass asks on which side or corner it lands.',
    'layout/align-symbol',
  ],
  'menu-item-edit-align-symbol-locked': [
    'The same, with the reference symbol on a formula locked in the Preview: it stays where it is and the other formula moves to it.',
    'layout/align-symbol',
  ],
  'menu-item-edit-distribute': ['Spaces three or more selected clips evenly.', 'layout/align'],
  'menu-item-edit-distribute-h': ['Evens out the gaps between the clips, left to right.', 'layout/align'],
  'menu-item-edit-distribute-v': ['Evens out the gaps between the clips, top to bottom.', 'layout/align'],
  'menu-item-edit-apply-palette': [
    'Previews what the active palette would change in the formulas and objects that exist, and applies it as one undo step. Off while no palette is active.',
    'color/palettes',
  ],
  'menu-item-edit-match-colors': [
    'The project’s lists of LaTeX patterns and the colours they give. Each list of the project is also an entry here, below the two commands.',
    'color/match-colors',
  ],
  'menu-item-edit-match-colors-create': ['Opens the [[Match colors]] dialog on a new, empty list.', 'color/match-colors'],
  'menu-item-edit-match-colors-from-palette': [
    'Makes a list with four rows (variable, constant, operator and result), coloured from the active palette, for you to fill with patterns.',
    'color/match-colors',
  ],
  'menu-item-edit-colours-order': [
    'Copies colours from glyphs in the Preview, one by one, and pastes them in the same order onto other glyphs.',
    'color/coloring',
  ],
  'menu-item-edit-colours-order-copy': [
    'Starts the copy: click the glyphs whose colours to copy, in order; Enter then pastes them on the glyphs you click next.',
    'color/coloring',
  ],
  'menu-item-edit-colours-order-paste': [
    'Pastes the colours last copied once more, from the first one. Off until something was copied.',
    'color/coloring',
  ],
  'menu-item-edit-auto-intro': [
    'New clips get the intro chosen in [[Default intro & outro…]] (the animation in brackets) instead of appearing at once.',
    'basics/intro-outro',
  ],
  'menu-item-edit-auto-outro': [
    'New clips get the outro chosen in [[Default intro & outro…]] (the animation in brackets) instead of disappearing at once.',
    'basics/intro-outro',
  ],
  'menu-item-edit-default-animations': [
    'Chooses the animation, duration, easing and lag ratio of the intro and the outro that the two entries above give.',
    'basics/intro-outro',
  ],
  'menu-item-edit-auto-suggest-morph-pairs': [
    'A new Morph block starts with the pairs Suggest finds, instead of none.',
    'transforms/morph',
  ],
  // ---- View ----
  'menu-item-view-toggle-theme': [
    'Flips between the dark and the light theme, as the round, half-filled button at the end of the menu bar does.',
    'start/interface',
  ],
  'menu-item-view-theme': [
    'System follows your operating system as it changes; Dark and Light fix one.',
    'start/interface',
  ],
  'menu-item-view-panels': {
    text: 'Shows or folds the Creator, the Animations panel and the Timeline to their title bars: a tick means the panel is shown. The layout remembers it. Off in the stacked layout of a narrow window, where nothing folds. All three are shown by default. Outside a text field, the key C does it for the Creator and A for the Animations panel.',
    page: 'start/interface',
    children: 'hide',
  },
  'menu-item-view-multicamera': [
    'Gives the scene a camera, or takes it away: with it the timeline has a Camera row for its moves, and the Preview shows the world around the frame, with the camera drawn as a rectangle. It stays on while the camera has target cameras or moves: delete them first, and a notice says so.',
    'animations/camera',
  ],
  'menu-item-view-camera-view': [
    'With the multicamera on, looks through the camera at the playhead, as the video does, or goes back to the world with the camera’s rectangles. Greyed out without a camera.',
    'animations/camera#view',
  ],
  'menu-item-view-slides': [
    'Turns the Slides mode on or off: pauses and comments on the scene’s time, where it rests, for the exported web page and the Python. It stays on while the project has a pause or a comment: delete them first, and a notice says so.',
    'basics/slides#on',
  ],
  'menu-item-view-slides-add-pause': [
    'Adds a pause at the playhead, where the scene rests; where something animates, a notice says what runs there. Greyed out while the Slides mode is off.',
    'basics/slides#add',
  ],
  'menu-item-view-slides-add-comment': [
    'Adds a comment at the playhead, its words asked for first. Greyed out while the Slides mode is off.',
    'basics/slides#add',
  ],
  'menu-item-view-slides-add-pauses': [
    'Adds a pause where each animation ends and another follows, but in a rest that holds one already, as one undo step: then delete the ones you do not want. Greyed out while the Slides mode is off.',
    'basics/slides#all-pauses',
  ],
  'menu-item-view-slides-skip-every': [
    'Makes every pause that has a wait to skip skip it: going on from it, the exported page and the rehearsal jump to where the next animation starts. The others stay as they are, and the notice counts them. One undo step; greyed out while the project has no pause.',
    'basics/slides#skip-all',
  ],
  'menu-item-view-slides-keep-every': [
    'Makes every pause keep its wait again, as one undo step. Greyed out while the project has no pause.',
    'basics/slides#skip-all',
  ],
  'menu-item-view-slides-delete-pauses': [
    'Deletes every pause, with its note; the comments stay. It asks first, saying how many go, and its button is held down; one undo step brings them back. Greyed out while the project has no pause.',
    'basics/slides#delete-pauses',
  ],
  'menu-item-view-prefer-auto': [
    'Formulas use the companion’s exact LaTeX glyphs when it is running, and MathJax otherwise.',
    'manim/companion',
  ],
  'menu-item-view-prefer-mathjax': [
    'Forces MathJax, the browser’s own renderer, even when the companion is running.',
    'basics/formulas',
  ],
  'menu-item-view-prefer-latex': [
    'Forces the companion’s exact LaTeX glyphs. Without the companion running, a formula shows an error that says so.',
    'manim/companion',
  ],
  // ---- Preferences ----
  'menu-item-preferences-snap-objects': [
    'A dragged formula sticks to the edges and centres of the others and of the frame. Hold Ctrl/⌘ after pressing to drag freely.',
    'basics/preview',
  ],
  'menu-item-preferences-guide-color': ['The colour of the guide lines a snapped drag shows in the Preview.', 'basics/preview'],
  'menu-item-preferences-guide-width': ['How thick those guide lines are.', 'basics/preview'],
  'menu-item-preferences-pick-color': [
    'The colour of the glyphs picked with Alt in the Preview, and of the rectangle that picks them.',
    'layout/glyph-picking',
  ],
  'menu-item-preferences-keep-handles': [
    'Keeps the transform handles on the selected clips without Shift held.',
    'basics/preview',
  ],
  'menu-item-preferences-scale-step': [
    'The step a corner drag’s scale snaps to. [[Custom…]] takes a number or a fraction, such as 1/3.',
    'basics/preview',
  ],
  'menu-item-preferences-locked-opacity': [
    'How opaque the Preview draws a formula locked in it. The Preview only: nothing exported is faded.',
    'basics/preview',
  ],
  'menu-item-preferences-show-grid': [
    'Draws a grid in the Preview, under the formulas, and makes a dragged formula snap to it (Ctrl/⌘ frees it). Never part of an export.',
    'basics/preview',
  ],
  'menu-item-preferences-grid-step': ['The spacing of the grid, in Manim units.', 'basics/preview'],
  'menu-item-preferences-grid-anchor': [
    'What the grid holds while you drag: the formula’s centre, or whichever of its edges is nearer to a line.',
    'basics/preview',
  ],
  'menu-item-preferences-camera-route': [
    'In the world view of a scene with a camera, draws the line with arrowheads that joins the camera’s frames in the order its moves run.',
    'animations/camera#on',
  ],
  'menu-item-preferences-camera-veil': [
    'In the world view of a scene with a camera, dims what the camera leaves out at the playhead.',
    'animations/camera#on',
  ],
  'menu-item-preferences-standard-scale': [
    'The size new formulas and new LaTeX texts are born with (1 is Manim’s font size 48). In its dialog, [[Apply to all formulas]] and [[Apply to all texts]] give it to the ones that exist.',
    'basics/formulas',
  ],
  'menu-item-preferences-split-suffix': [
    'The suffix that names the copy a split makes: a clip cut at the playhead (S) gives its second half a copy of its formula, named after it with this suffix. The brackets show the suffix in use; its dialog takes letters, digits and “_”, at most 16.',
    'basics/timeline#splitting',
  ],
  'menu-item-preferences-zen-mode': [
    'For small windows: the timeline becomes a column on the left, drawn vertical, and the Preview takes the rest; the Creator and the Animations panel open over it, side by side, from two buttons of a strip. It only rearranges the window.',
    'start/interface#zen',
  ],
  'menu-item-preferences-chroma-lab': [
    'Opens Chroma Lab, the colour studio that comes inside the editor, to make a palette and send it to the editor.',
    'color/palettes',
  ],
  'menu-item-preferences-editor-palettes': [
    'Opens the palette library: import, make, edit, activate and delete palettes of named colour roles.',
    'color/palettes',
  ],
  // ---- Export ----
  'menu-item-export-export-ce': ['Exports the scene as a Python file for ManimCE.', 'basics/export'],
  'menu-item-export-export-gl': ['Exports the scene as a Python file for ManimGL.', 'basics/export'],
  'menu-item-export-export-video': [
    'Renders the scene to a video file: in the browser, with the companion’s ffmpeg, or by Manim itself.',
    'sound/video',
  ],
  'menu-item-export-export-image': [
    'Writes the frame at the playhead as a PNG picture, the one a video shows there: at the project’s size or twice it, over the scene’s background or transparent.',
    'basics/export#image',
  ],
  'menu-item-export-export-audio': ['Exports the sound of the project as one audio file: WAV or WebM with Opus, and M4A where the browser can encode AAC.', 'sound/audio'],
  'menu-item-export-export-html': [
    'Writes the scene as a web page that plays it live and stops at each pause of the Slides mode: a folder to work on and embed, its zip, or one file.',
    'basics/slides#export-html',
  ],
  // ---- Help ----
  'menu-item-help-shortcuts': ['Shows the table of keyboard shortcuts and click gestures.', 'reference/shortcuts'],
  'menu-item-help-examples': [
    'Opens one of the example projects the app carries, as a file opens: it asks first about unsaved work, and the example becomes a project of yours without a file, so Save asks where it goes.',
    'start/projects#examples',
  ],
  'menu-item-help-examples-completing-the-square': [
    'The quadratic formula derived step by step. [[Try an example]], in the Creator of a project with no formula, opens it too.',
    'start/projects#examples',
  ],
  'menu-item-help-examples-hello': ['Two formulas and the relation between them.', 'start/projects#examples'],
  'menu-item-help-examples-camera': ['The scene’s camera and its moves.', 'start/projects#examples'],
  'menu-item-help-examples-braces': ['Braces over parts of a sum, each with its label.', 'start/projects#examples'],
  'menu-item-help-engine-inspector': [
    'Shows how a formula splits into glyphs with each renderer, MathJax and the companion’s LaTeX.',
    'manim/companion#exact-glyphs',
  ],
  // No page of the documentation teaches this dialog: no link.
  'menu-item-help-licenses': ['Lists the open-source components the app contains and opens their notices.'],
  'menu-item-help-about': [
    'Shows the version of the app, the project file format version, the MathJax and companion versions and the licence.',
    'reference/files',
  ],
};

/** The test ids of the Export… button's menu are `export-button-…`; the notes are written under
 * the ids the entries had when the bar had an Export menu (`menu-item-export-…`). */
export const EXPORT_BUTTON_PREFIX = { from: 'export-button-', to: 'menu-item-export-' };

/** The right-click menus. */
export const CONTEXT_NOTES = {
  // ---- A clip: Add animation, and the clip's own entries ----
  'add-animation-group-appear': [
    'Adds a block that brings the glyphs in at the playhead, or at the time you right-clicked when the playhead is not on the clip. [[GrowArrow]] is for arrows.',
    'animations/blocks',
  ],
  'add-animation-group-disappear': [
    'Adds a block that takes the glyphs out at that time.',
    'animations/blocks',
  ],
  'add-animation-group-transform': [
    'Adds a Transform block: the whole object moves, turns or rescales, or (a shape) goes to surround something else.',
    'animations/blocks',
  ],
  'add-animation-tween|Whole formula (keyframe)': [
    'Adds a keyframe for the whole formula or text: position, scale, rotation, opacity and colour change over the block.',
    'animations/blocks',
  ],
  'add-animation-tween|Transform': {
    text: 'Adds the Transform of a brace, a shape, a line or an arrow: its place, size, colour and, for a line, its ends and stroke change over the block.',
    page: 'animations/blocks',
    // The grey "ends · stroke · colour" is there for a line or an arrow only.
    hint: null,
  },
  'add-animation-transform': [
    'Adds a block that moves, turns or recolours some of the glyphs of the formula while the rest stays.',
    'animations/blocks',
  ],
  'add-animation-retarget': [
    'Carries the shape to surround another formula or other glyphs: pick the new target in the Preview, then confirm.',
    'objects/shapes',
  ],
  'add-animation-morph': [
    'Adds a Morph block: a transformation between the glyphs of this same formula, for a derivation on one clip.',
    'transforms/morph',
  ],
  'add-animation-group-emphasis': [
    'Adds a block that draws attention at that time. A line or an arrow offers only [[Circumscribe]], [[Flash]] and [[FocusOn]].',
    'animations/blocks',
  ],
  'add-brace': [
    'Puts a brace on the clip, on the side you choose. On a formula or a text, [[On some glyphs…]] opens a dialog to pick which glyphs it spans.',
    'objects/braces',
  ],
  'add-shape': [
    'Puts a shape around the clip. [[On some glyphs…]] picks which glyphs it surrounds.',
    'objects/shapes',
  ],
  'add-line': [
    'Draws a line or an arrow that starts on this clip: a compass asks where on it, then one click puts the other end.',
    'objects/lines-arrows',
  ],
  'add-label': [
    'Puts a label at the tip of the brace: a formula or a LaTeX text.',
    'objects/braces',
  ],
  'clip-menu-color': {
    text: 'The colour of the brace or shape: the twelve Manim colours, the roles of the active palette, or any #RRGGBB typed in the field and applied.',
    page: 'color/coloring',
    children: 'hide',
  },
  'clip-menu-direction': ['Moves the brace to another side of what it spans.', 'objects/braces'],
  'clip-menu-detach': [
    'Frees the brace or shape from what it hangs on: it stays where it is and no longer follows that clip.',
    'objects/braces',
  ],
  'clip-menu-become': [
    'Turns the line into another kind of line: it keeps its ends, its curve and its tips.',
    'objects/lines-arrows',
  ],
  'clip-menu-reverse': { text: 'Swaps the start and the end of the line.', page: 'objects/lines-arrows', hint: 'start ⇄ end' },
  'clip-menu-curve': [
    'Bends the line into an arc or a spline, or shapes the spline it has; copies the shape of its path, or gives it the copied one.',
    'objects/lines-arrows',
  ],
  // The hint of Arc is "path_arc", or the angle once the line is an arc; Copy and Paste path shape
  // say the shape of the path and what was copied.
  'clip-menu-curve-arc': { text: 'Bends the line into an arc of a circle (Manim’s path_arc).', page: 'objects/lines-arrows', hint: null },
  'clip-menu-curve-spline': {
    text: 'Turns it into a spline with points and handles you can edit in the Preview. Once the line is a spline the entry reads [[Edit curve]].',
    page: 'objects/lines-arrows',
    hint: 'points and handles',
  },
  'clip-menu-curve-copy': { text: 'Copies the shape of the line’s path.', page: 'objects/lines-arrows', hint: null },
  'clip-menu-curve-paste': {
    text: 'Gives the line the shape last copied. Off until something was copied.',
    page: 'objects/lines-arrows',
    hint: null,
  },
  'clip-menu-detach-ends': [
    'Frees one end of the line or both from the glyphs they are on; off when both are free already.',
    'objects/lines-arrows',
  ],
  'clip-menu-intro': [
    'The animation the clip starts with, the current one ticked. [[None]] makes the formula appear at the clip’s start. Lines and arrows offer fewer; [[GrowArrow]] is for arrows.',
    'basics/intro-outro',
  ],
  'clip-menu-outro': [
    'The animation the clip ends with, the current one ticked. [[None]] makes it disappear at the clip’s end.',
    'basics/intro-outro',
  ],
  'clip-menu-timing': [
    'Copy when this clip starts and ends and how long its intro and outro are, or paste one of those onto this clip.',
    'animations/timing',
  ],
  // Its hint is the time span of the clip.
  'clip-menu-timing-copy': { text: 'Copies the clip’s start, end, duration and intro and outro times.', page: 'animations/timing', hint: null },
  'clip-menu-timing-paste-start': ['Moves the clip to start when the copied clip does.', 'animations/timing'],
  'clip-menu-timing-paste-end': ['Moves the clip to end when the copied clip does.', 'animations/timing'],
  'clip-menu-timing-paste-duration': ['Makes the clip last as long as the copied one, from where it starts.', 'animations/timing'],
  'clip-menu-timing-paste-intro': ['Gives its intro the length of the copied clip’s intro.', 'animations/timing'],
  'clip-menu-timing-paste-outro': ['Gives its outro the length of the copied clip’s outro.', 'animations/timing'],
  'clip-menu-remove-animations': [
    'Takes off the clip’s intro, its outro and its blocks, but the Morph ones.',
    'basics/intro-outro',
  ],
  // The hint "and Morph blocks" shows only when the clip has a Morph block.
  'clip-menu-remove-relations': {
    text: 'Takes off the clip’s transformations of glyphs: its relations with other clips and its Morph blocks.',
    page: 'transforms/relations',
    hint: null,
  },
  'clip-menu-unlink': [
    'Gives this clip a copy of its formula of its own, so editing one no longer changes the other. Off, its tooltip saying why, for a formula’s only clip.',
    'animations/timing',
  ],
  // splitEntry (timeline/splitActions.ts): off unless the playhead is inside the clip, on a track
  // that is not locked; its tooltip names the copy the second half gets.
  'clip-menu-split': [
    'Cuts the clip in two at the playhead: the second half becomes a clip of a copy of its formula, that starts as the object is then. Off, its tooltip saying why, while the playhead is outside the clip or the track is locked; when something keeps the clip whole, a notice says what.',
    'basics/timeline#splitting',
  ],
  'clip-menu-preview-lock': [
    'The Preview then draws the clip and leaves it alone: a press goes through it to what is under it, and nothing done in the Preview moves it.',
    'basics/preview',
  ],
  // ---- Several clips ----
  'clips-menu-edit': ['Opens the formula of these clips in its editor.', 'basics/formulas'],
  'clips-menu-edit-together': [
    'Opens the formulas of the selected clips in one editor, to set their scale or glyph colours together.',
    'objects/organizing',
  ],
  // spanningBrace / spanningShape (attachmentCreation.ts): not offered with a brace (or, for a shape, a
  // shape) among the clips; off, with a reason, when the clips are never on screen together.
  'clips-menu-brace': [
    'Puts one brace over all the selected clips. Not offered when a brace is among them; off, its tooltip saying why, when the clips are never on screen together.',
    'objects/braces',
  ],
  'clips-menu-shape': [
    'Puts one shape around all the selected clips. Not offered when a brace or a shape is among them; off, its tooltip saying why, when the clips are never on screen together.',
    'objects/shapes',
  ],
  'clips-menu-match': ['Colours the glyphs of the selected clips’ formulas with one of the project’s match colour lists.', 'color/match-colors'],
  'clips-menu-match-create': ['Opens the [[Match colors]] dialog on a new list (what the submenu offers while the project has none).', 'color/match-colors'],
  // Its hint says what was copied: "nothing copied", or the shape and the line it came from.
  'clips-menu-paste-shape': {
    text: 'Gives each line among the selected clips the shape of the path last copied. Off until something was copied that fits one of them.',
    page: 'objects/lines-arrows',
    hint: null,
  },
  'clips-menu-timing': ['Pastes a part of the copied timing onto every selected clip.', 'animations/timing'],
  'clips-menu-unlink': [
    'Gives each formula of the selection a copy of its own, shared by its selected clips.',
    'animations/timing',
  ],
  'clips-menu-split': [
    'Cuts in two at the playhead the selected clips it is inside, the sounds among them too, as one undo step. Off while it is inside none of them, or only inside clips on locked tracks.',
    'basics/timeline#splitting',
  ],
  'clips-menu-preview-lock': ['Locks them all in the Preview, or unlocks them when they all are.', 'basics/preview'],
  'clips-menu-duplicate': ['Duplicates the selected clips on the timeline.', 'basics/timeline'],
  'clips-menu-delete': {
    text: 'Deletes the selected clips as one undo step; the formulas stay in the Creator. When braces, shapes or lines attached to them would go too, it asks first.',
    page: 'basics/timeline',
    label: 'Delete N clips',
  },
  // ---- A block ----
  'block-menu-change-*': {
    text: 'Changes the animation of an Appear or Disappear block to another of the nine, the current one ticked. A block of a line lists only what a line takes.',
    page: 'animations/blocks',
    label: 'Change animation',
  },
  'block-menu-effect-*': {
    text: 'Changes the effect of an Emphasis block to another of the five, the current one ticked. A block of a line lists Circumscribe, Flash and FocusOn.',
    page: 'animations/blocks',
    label: 'Change effect',
  },
  'block-menu-pairs': ['Opens the pair editor of the Morph block.', 'transforms/morph'],
  'block-menu-duplicate': [
    'Makes a copy of the block next to it. A Morph block’s copy has no pairs.',
    'animations/blocks',
  ],
  'block-menu-duplicate-others': [
    'Makes a copy that animates the other glyphs of the formula, so every glyph is covered once. Not on a block of an arrow, which takes all of it.',
    'animations/blocks',
  ],
  'block-menu-split-runs': [
    'Splits a block that names glyphs into one block per run of consecutive glyphs. Not on a block of an arrow, which takes all of it.',
    'animations/blocks',
  ],
  'block-menu-split': [
    'Opens the Split dialog to divide a block that names glyphs as you choose. Not on a block of an arrow, which takes all of it.',
    'animations/timing',
  ],
  'block-menu-delete': ['Deletes the block, after a question whose confirm button is held down.', 'animations/blocks'],
  'block-menu-fold': ['Draws the group of this block as one block again.', 'animations/groups'],
  'block-menu-leave': ['Takes this block out of its group.', 'animations/groups'],
  'block-menu-ungroup': ['Undoes the group; its blocks stay.', 'animations/groups'],
  'block-menu-group': {
    text: 'Makes one group of this block and the blocks of its clip that start with it and last as long; N is how many. In a block of an unfolded group the entry ends “with its group”. Shown when there are some.',
    page: 'animations/groups',
    label: 'Group with the N blocks that run with it',
  },
  'group-menu-unfold': ['Shows the group’s blocks on lanes of their own.', 'animations/groups'],
  'group-menu-ungroup': ['Undoes the group; its blocks stay.', 'animations/groups'],
  'group-menu-group': {
    text: 'Takes into the group the blocks of its clip that start with it and last as long; N is how many. Shown when there are some.',
    page: 'animations/groups',
    label: 'Group with the N blocks that run with it',
  },
  'group-menu-duplicate': ['Copies the whole group.', 'animations/groups'],
  'group-menu-delete': ['Deletes the whole group, after a question whose confirm button is held down.', 'animations/groups'],
  // ---- A relation ----
  'relation-menu-edit-pairs': ['Opens the relation editor on this relation.', 'transforms/relation-editor'],
  'relation-menu-choose-path': {
    text: 'Edits the path of one pair in the Preview. A relation of up to five pairs lists them under the heading [[Edit path]] instead; from six on this entry opens a dialog with the relation’s diagram and a picture of each pair’s path.',
    page: 'transforms/custom-paths',
    label: 'Choose a pair…',
  },
  'relation-menu-delete': ['Deletes the relation.', 'transforms/relations'],
  // ---- An audio clip ----
  'audio-menu-edit': ['Opens the editor of the clip: its trim and its volume curve.', 'sound/audio'],
  'audio-menu-split': ['Cuts the clip in two at the playhead.', 'sound/audio'],
  'audio-menu-fade-in': ['Makes the volume rise from silence over the first half second of the clip, or its first half when the clip is shorter than a second.', 'sound/audio'],
  'audio-menu-fade-out': ['Makes the volume fall to silence over the last half second of the clip, or its second half when the clip is shorter than a second.', 'sound/audio'],
  'audio-menu-timing': ['Copy or paste when the clip starts and ends. A sound has no intro or outro.', 'animations/timing'],
  'audio-menu-timing-copy': { text: 'Copies the clip’s start, end and duration.', page: 'animations/timing', hint: null },
  'audio-menu-timing-paste-start': ['Moves the clip to start when the copied clip does.', 'animations/timing'],
  'audio-menu-timing-paste-end': ['Moves the clip to end when the copied clip does.', 'animations/timing'],
  'audio-menu-timing-paste-duration': ['Makes the clip last as long as the copied one.', 'animations/timing'],
  'audio-menu-duplicate': ['Duplicates the clip, or the clips that are selected.', 'sound/audio'],
  'audio-menu-delete': ['Deletes the clip, or the clips that are selected.', 'sound/audio'],
  // ---- The Preview ----
  'preview-menu-copy-properties': ['Copies the properties of the clip under the pointer.', 'animations/timing'],
  'preview-menu-paste': ['Pastes the copied properties onto the selected clips, all but the position or one group.', 'animations/timing'],
  'preview-menu-align': ['Lines up the selected clips; [[Align by symbol…]] starts the two-click mode.', 'layout/align'],
  'preview-menu-distribute': ['Spaces three or more selected clips evenly.', 'layout/align'],
  // On a brace or a shape: what the timeline's menu has under clip-menu-*.
  'preview-menu-color': {
    text: 'The colour of the brace or shape: the twelve Manim colours, the roles of the active palette, or any #RRGGBB typed in the field and applied.',
    page: 'color/coloring',
    children: 'hide',
  },
  'preview-menu-direction': ['Moves the brace to another side of what it spans.', 'objects/braces'],
  'preview-menu-detach': [
    'Frees the brace or shape from what it hangs on: it stays where it is and no longer follows that clip.',
    'objects/braces',
  ],
  'preview-menu-label': ['Puts a label at the tip of the brace under the pointer: a formula or a LaTeX text.', 'objects/braces'],
  'preview-menu-retarget': [
    'Carries the shape to surround another formula or other glyphs: pick the new target in the Preview, then confirm.',
    'objects/shapes',
  ],
  'preview-menu-brace': [
    'Puts a brace on the clip under the pointer, or on the glyphs picked on it with Alt, or over all the selected clips.',
    'objects/braces',
  ],
  'preview-menu-shape': [
    'Puts a shape around the clip under the pointer, or around the glyphs picked on it, or around all the selected clips.',
    'objects/shapes',
  ],
  'preview-menu-line': [
    'Draws a line or an arrow that starts on this clip: a compass asks where on it, then one click puts the other end.',
    'objects/lines-arrows',
  ],
  'preview-menu-intro': ['The animation the clip starts with, the current one ticked.', 'basics/intro-outro'],
  'preview-menu-outro': ['The animation the clip ends with, the current one ticked.', 'basics/intro-outro'],
  'preview-menu-remove-animations': ['Takes off the clip’s intro, outro and blocks, but the Morph ones.', 'basics/intro-outro'],
  'preview-menu-remove-relations': { text: 'Takes off the clip’s relations and Morph blocks.', page: 'transforms/relations', hint: null },
  'preview-menu-unlink': ['Gives this clip a copy of its formula of its own.', 'animations/timing'],
  'preview-menu-split': [
    'Cuts the clip in two at the playhead: the second half becomes a clip of a copy of its formula.',
    'basics/timeline#splitting',
  ],
  'preview-menu-match': ['Colours the glyphs of the selected clips’ formulas with a match colour list.', 'color/match-colors'],
  'preview-menu-copy-colours-order': ['Starts [[Colours in order]]: click glyphs whose colours to copy, in order.', 'color/coloring'],
  'preview-menu-paste-colours-order': ['Pastes the colours last copied, in order, from the first one. Off until something was copied.', 'color/coloring'],
  'preview-space-line-line': ['Draws a line: click where it starts, then where it ends.', 'objects/lines-arrows'],
  'preview-space-line-dashed': ['Draws a dashed line the same way.', 'objects/lines-arrows'],
  'preview-space-line-arrow': ['Draws an arrow, with its tip at the end.', 'objects/lines-arrows'],
  'preview-space-line-double_arrow': ['Draws a double arrow, with a tip at each end.', 'objects/lines-arrows'],
  // ---- The camera ----
  'preview-space-camera-add-target': [
    'Adds a target camera centred where you clicked, as large as the camera is at the playhead, and selects it.',
    'animations/camera#targets',
  ],
  'preview-space-camera-add-move': [
    'Adds a camera move at the playhead, a second long, where the scene is free; the playhead goes to its end, where the camera is then put.',
    'animations/camera#move',
  ],
  'camera-menu-add-target': ['Adds a target camera in the frame of this rectangle.', 'animations/camera#targets'],
  'camera-menu-add-move': ['Adds a camera move at the playhead, a second long, where the scene is free.', 'animations/camera#move'],
  'camera-menu-move-here': ['Adds a camera move to this target camera, at the playhead.', 'animations/camera#targets'],
  'camera-menu-rename': ['Asks for the target camera’s new name.', 'animations/camera#targets'],
  'camera-menu-delete': [
    'Deletes the target camera, after a question when moves go to it: those moves stay, each going to a frame of its own where the target camera was.',
    'animations/camera#targets',
  ],
  'camera-move-menu-isolate': [
    'Leaves the rectangle of the frame this move goes to as the only one that answers the pointer in the Preview, for frames that lie one over another. [[Stop isolating]] ends it.',
    'animations/camera#isolate',
  ],
  'camera-move-menu-duplicate': ['Copies the move into the first place after it with room for its whole length.', 'animations/camera#block'],
  'camera-move-menu-delete': ['Deletes the move.', 'animations/camera#block'],
  'camera-lane-menu-add': { text: 'Adds a camera move at the time you clicked, a second long, where the scene is free.', page: 'animations/camera#move', label: 'Add camera move here' },
  // ---- The ruler in the Slides mode ----
  'slide-menu-add-pause': {
    text: 'Adds a pause at the time clicked, on a frame; with Snap on, pulled onto the playhead or the edge of the zone when they are near. Greyed out where something animates, and a line says what runs there.',
    page: 'basics/slides#add',
    label: 'Add pause here (time)',
  },
  'slide-menu-add-comment': [
    'Adds a comment there, its words asked for first. Greyed out where something animates.',
    'basics/slides#add',
  ],
  'slide-menu-add-pauses': [
    'Adds a pause where each animation ends and another follows, but in a rest that holds one already, as one undo step. On the menu wherever it is opened.',
    'basics/slides#all-pauses',
  ],
  'slide-menu-skip-every': [
    'Makes every pause that has a wait to skip skip it, as one undo step; the others stay as they are. On the menu wherever it is opened; greyed out while the project has no pause.',
    'basics/slides#skip-all',
  ],
  'slide-menu-keep-every': [
    'Makes every pause keep its wait again, as one undo step. On the menu wherever it is opened; greyed out while the project has no pause.',
    'basics/slides#skip-all',
  ],
  'slide-menu-delete-pauses': [
    'Deletes every pause, with its note; the comments stay. It asks first, saying how many go, and its button is held down; one undo step brings them back. On the menu wherever it is opened; greyed out while the project has no pause.',
    'basics/slides#delete-pauses',
  ],
  // ---- A pause or a comment on the ruler ----
  'slide-mark-menu-words|Edit note…': [
    'Writes the note of the pause, for whoever presents; emptied, the note goes. A pause without one reads [[Add a note…]].',
    'basics/slides#marks',
  ],
  'slide-mark-menu-words|Edit comment…': [
    'Writes the words of the comment; a comment is not kept without them.',
    'basics/slides#marks',
  ],
  'slide-mark-menu-skip': [
    'A pause’s box: going on from it, the exported page and the rehearsal jump over the rest that follows, to where the next animation starts. Greyed out, with a line that says why, where there is nothing to skip. One undo step.',
    'basics/slides#skip-wait',
  ],
  'slide-mark-menu-delete': ['Deletes the mark, as one undo step.', 'basics/slides#marks'],
  // ---- The end of a line ----
  // Its hint, "it is free", is there when the end is free already.
  'line-end-menu-detach': { text: 'Frees this end from the glyphs it is on. Off when it is free already.', page: 'objects/lines-arrows', hint: null },
  'line-end-menu-anchor': ['Opens the compass to choose another point of what the end is on.', 'objects/lines-arrows'],
  // ---- The Creator ----
  'formula-menu-edit': ['Opens the formula in its editor.', 'basics/formulas'],
  'formula-menu-edit-together': ['Opens the selected formulas in one editor: one scale and glyph colours for all.', 'objects/organizing'],
  'formula-menu-add-to-timeline': ['Puts a clip of each selected formula on the timeline at the playhead, or in the region when one is marked on the ruler.', 'basics/timeline'],
  'formula-menu-group': ['Makes a group of the selected formulas, in the Creator’s list.', 'objects/organizing'],
  'formula-menu-rename-group': ['Renames the group.', 'objects/organizing'],
  'formula-menu-ungroup': ['Undoes the group; its formulas stay.', 'objects/organizing'],
  'formula-menu-match': ['Colours the glyphs of the selected formulas with one of the project’s match colour lists.', 'color/match-colors'],
  'formula-menu-match-create': ['Opens the [[Match colors]] dialog on a new list (what the submenu offers while the project has none).', 'color/match-colors'],
  'formula-menu-duplicate': ['Makes a copy of each selected formula, under the next free name, right after the original.', 'objects/organizing'],
  'formula-menu-delete': {
    text: 'Deletes the selected formulas with their clips and relations, as one undo step, after a question whose confirm button is held down. With several selected it says how many: Delete N formulas….',
    page: 'basics/formulas',
    label: 'Delete…',
  },
  'creator-new-math': ['A new formula, written in LaTeX math.', 'basics/formulas'],
  'creator-new-tex': ['A new LaTeX text: prose with formulas between dollar signs.', 'objects/texts'],
  'creator-new-text': ['A new font text: plain text in any font, shaped by the companion.', 'objects/texts'],
  // ---- Glyphs ----
  swatches: [
    'The twelve Manim colours, then the roles of the active palette: one click colours what the menu acts on.',
    'color/coloring',
  ],
  'glyph-menu-color-hex-apply': ['Colours the selected glyphs with the #RRGGBB typed in the field above it.', 'color/coloring'],
  'glyph-menu-clear-color': ['Gives the selected glyphs back the colour of the whole formula.', 'color/coloring'],
  'glyph-menu-hide': ['Hides the selected glyphs at the start of the clip, so that an Appear block can bring them in later.', 'animations/blocks'],
  'glyph-menu-show': ['Shows glyphs that were hidden at the start.', 'animations/blocks'],
    'rel-style-menu-inherit': ['The pair takes the style of the relation.', 'transforms/relations'],
  'rel-style-menu-transform': ['The glyph moves from the source to the target.', 'transforms/relations'],
  'rel-style-menu-copy': ['A copy of the source glyph moves to the target; the source stays.', 'transforms/relations'],
  'rel-style-menu-fade': ['The source glyph fades out as the target glyph fades in (Manim’s FadeTransform).', 'transforms/relations'],
  'rel-style-menu-fade_copy': ['A copy of the source glyph fades out as the target glyph fades in; the source stays.', 'transforms/relations'],
  'rel-style-menu-edit-path': ['Shapes the path of this pair in the Preview.', 'transforms/custom-paths'],
  'rel-style-menu-clear-path': ['Gives the pair a straight path again.', 'transforms/custom-paths'],
  'rel-style-menu-delete': ['Deletes the link of the selected glyphs, after a question.', 'transforms/relation-editor'],
};

/** Entries the capture does not meet (they depend on the project or on what is clicked), with
 * the menu they belong to: the generator adds them to the table of that menu. */
export const EXTRA_CONTEXT_ENTRIES = {};

/** The right-click menus of the page, in order: which scenarios of `context-menus.data.js` make
 * each table, and how its "For" column names them. `names` maps a scenario to what it is called
 * there; a table of one scenario has no such column. */
export const CONTEXT_GROUPS = [
  {
    id: 'timeline-clip',
    names: {
      'timeline-clip-formula': 'formulas',
      'timeline-clip-latex-text': 'LaTeX texts',
      'timeline-clip-font-text': 'font texts',
      'timeline-clip-brace': 'braces',
      'timeline-clip-shape': 'shapes',
      'timeline-clip-line': 'lines',
      'timeline-clip-arrow': 'arrows',
    },
  },
  {
    id: 'timeline-clips',
    names: {
      'timeline-clips': 'clips of several formulas',
      'timeline-clips-one-formula': 'clips of one formula',
      'timeline-clips-line': 'a line among them',
    },
  },
  {
    id: 'timeline-block',
    names: {
      'timeline-block-appear': 'Appear and Disappear blocks',
      'timeline-block-emphasis': 'Emphasis blocks',
      'timeline-block-morph': 'Morph blocks',
      'timeline-block-transform': 'Transform blocks',
      'timeline-block-in-group': 'blocks of an unfolded group',
      'timeline-block-peers': 'a block that runs with others',
    },
  },
  { id: 'timeline-group', names: { 'timeline-group': 'a folded group' } },
  { id: 'timeline-relation', names: { 'timeline-relation': 'a relation' } },
  { id: 'timeline-audio', names: { 'timeline-clip-audio': 'an audio clip' } },
  {
    id: 'preview-clip',
    names: { 'preview-clip': 'a formula or text', 'preview-brace': 'a brace', 'preview-shape': 'a shape' },
  },
  {
    id: 'preview-space',
    names: { 'preview-space': 'without a camera', 'preview-space-camera': 'with the multicamera on' },
  },
  {
    id: 'preview-camera',
    names: { 'preview-camera-target': 'a target camera', 'preview-camera': 'the camera' },
  },
  {
    id: 'timeline-camera',
    names: { 'timeline-camera-move': 'a camera move', 'timeline-camera-lane': 'the Camera row' },
  },
  {
    id: 'slides-ruler',
    names: {
      'slides-ruler-rest': 'where the scene rests',
      'slides-ruler-busy': 'where something animates',
    },
  },
  {
    id: 'slides-mark',
    names: { 'slides-mark-pause': 'a pause', 'slides-mark-comment': 'a comment' },
  },
  { id: 'line-end', names: { 'line-end': 'an end of a line' } },
  {
    id: 'creator',
    names: {
      'creator-formulas': 'several formulas',
      'creator-formula': 'one formula',
      'creator-group': 'a group',
    },
  },
  { id: 'creator-new', names: { 'creator-new': 'the arrow of + New' } },
  {
    id: 'glyphs',
    names: {
      'formula-editor-glyph': 'a glyph in the formula editor',
      'relation-editor-glyph': 'a pair in the relation editor',
    },
  },
];
