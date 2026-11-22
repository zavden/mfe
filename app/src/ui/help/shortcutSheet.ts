/* The keyboard shortcuts and click gestures, as Help → Keyboard shortcuts… lists them. The
 * README's table holds the same rows in the same order (a unit test compares them), so a new
 * shortcut is added here and there. A row whose keys are others on a Mac says so (`mac`), and the
 * README lists those under "On macOS" (the same test). Pure. */

/** What a row says: its keys, where they work and what they do. */
export interface ShortcutText {
  /** The keys, as the README writes them ("Ctrl/⌘+S, Ctrl/⌘+Alt+S"). */
  keys: string;
  /** Where they work. */
  where: string;
  what: string;
}

export interface ShortcutRow extends ShortcutText {
  /** What a Mac has in the place of any of them: other keys, or words that are not true there. In
   * the same notation ("Ctrl/⌘" is its ⌘, "Ctrl" its Control key). */
  mac?: Partial<ShortcutText>;
}

export interface ShortcutGroup {
  title: string;
  rows: readonly ShortcutRow[];
}

export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = [
  {
    title: 'Files and history',
    rows: [
      {
        keys: 'Ctrl/⌘+Alt+N, Ctrl/⌘+O',
        where: 'outside text fields and dialogs',
        what: 'New project, open a project (the Projects dialog)',
      },
      {
        keys: 'Ctrl/⌘+S, Ctrl/⌘+Alt+S',
        where: 'outside text fields and dialogs',
        what: 'Save, Save As',
        // Save As is ⇧⌘S in every app of a Mac; Sync folder takes the key it leaves.
        mac: { keys: 'Ctrl/⌘+S, Ctrl/⌘+Shift+S' },
      },
      {
        keys: 'Ctrl/⌘+Shift+S',
        where: 'outside text fields and dialogs; anywhere in the Projects dialog',
        what: 'Sync folder (the project library)',
        mac: { keys: 'Ctrl/⌘+Alt+S' },
      },
      {
        keys: 'Ctrl/⌘+Z; Ctrl/⌘+Shift+Z or Ctrl+Y',
        where: 'anywhere but text fields',
        what: 'Undo; redo (Ctrl+Y on Windows and Linux only; also in immediate-edit dialogs); cancel an active gesture first',
        mac: {
          keys: 'Ctrl/⌘+Z; Ctrl/⌘+Shift+Z',
          what: 'Undo; redo (also in immediate-edit dialogs); cancel an active gesture first',
        },
      },
    ],
  },
  {
    title: 'Playback',
    rows: [
      {
        keys: 'Space',
        where: 'outside fields, checkboxes, menus and dialogs',
        what: 'Play / pause (a button reached with Tab takes Space itself)',
      },
      {
        keys: 'Home, End; ←/→ (Shift: 1 s)',
        where: 'outside fields and dialogs',
        what: 'Playhead to the start or the end; step a frame',
      },
      {
        keys: 'Ctrl/⌘ (held while dragging on the ruler)',
        where: 'timeline',
        what: 'Move the playhead tick by tick: in steps of dt, the time between two small ticks of the ruler (the timeline’s toolbar shows it, and its − and + set one of your own)',
      },
    ],
  },
  {
    title: 'Editing',
    rows: [
      {
        keys: 'Ctrl/⌘+A',
        where: 'outside text fields and dialogs',
        what: 'Select every clip on screen at the playhead',
      },
      {
        keys: 'Ctrl/⌘+F; Esc',
        where: 'anywhere but dialogs',
        what: 'Search formulas: a panel in the place of the Preview lists the formulas, LaTeX texts and font texts whose name or source has what is typed (pressed again, back to its field); Esc closes it',
      },
      {
        keys: 'Alt+A / Alt+H / Alt+D (Shift: to the frame)',
        where: 'preview selection',
        what: 'Align left / centre / right',
      },
      {
        keys: 'Alt+W / Alt+V / Alt+S (Shift: to the frame)',
        where: 'preview selection',
        what: 'Align top / middle / bottom',
      },
      {
        keys: 'Ctrl/⌘+Alt+H / Ctrl/⌘+Alt+V',
        where: 'preview selection',
        what: 'Distribute horizontally / vertically (3+ clips)',
        // The Control key itself there: ⌥⌘H and ⌥⌘V are the system's.
        mac: { keys: 'Ctrl+Alt+H / Ctrl+Alt+V' },
      },
      {
        keys: '←/→, ↑/↓ (Shift: 0.1)',
        where: 'preview, after a click on it, with clips selected',
        what: 'Move the selected clips 0.01 (Shift: 0.1) at the playhead, as a drag would move them; a run of presses is one undo step. With nothing selected, ←/→ step the playhead',
      },
      {
        keys: 'Alt+G',
        where: 'preview',
        what: 'Align by symbol: click the symbol to move, then the reference symbol (or ←/→, ↑/↓ and Enter); a compass picks the side; Shift+wheel sets the reach',
      },
      {
        keys: 'Shift+Alt+G',
        where: 'preview',
        what: 'Align by symbol, the reference symbol on a formula locked in the preview: it stays, and the formula of the first symbol moves to it',
      },
      {
        keys: 'S',
        where: 'outside fields and dialogs',
        what: 'Circle selector of the preview on or off: a click takes the symbol nearest to the pointer within a circle (Shift+wheel sets its reach); with a selected clip under the playhead and the keyboard out of the preview, or with a sound selected, S splits the selected clips at the playhead instead — the second half of a formula’s clip becomes a clip of a copy of it (Preferences → Split suffix names it)',
      },
      {
        keys: 'G',
        where: 'preview, aligning by symbol',
        what: 'Keep the symbol to move as it is at the playhead, to click its reference at another time (its formula stays in view, faint, and the ruler marks the instant); G again lets it go',
      },
      {
        keys: 'Shift+C',
        where: 'outside fields and dialogs',
        what: 'Copy colours in order: click, one by one, the glyphs of the preview whose colours to copy (the Animations panel lists them); Enter then pastes them, in that order, on the glyphs clicked next; Shift+C again leaves',
      },
      {
        keys: 'Shift+V',
        where: 'outside fields and dialogs',
        what: 'Paste the colours last copied in order once more, from the first one',
      },
      {
        keys: 'Enter; Backspace; Esc',
        where: 'preview, colours in order',
        what: 'Go on from the copy to the paste; take the last click back; leave, keeping what was pasted',
      },
      {
        keys: 'Delete / Backspace',
        where: 'Creator, timeline',
        what: 'Delete the selected formula (held to confirm), clips, relation, block, camera move or target camera',
      },
      { keys: 'F2; Enter', where: 'formula card', what: 'Rename; edit the formula' },
      {
        keys: 'F2; Enter (→/← too in the list view)',
        where: 'group of formulas',
        what: 'Rename the group; open or close it',
      },
      {
        keys: '↑/↓, Home, End; Shift+↑/↓; Ctrl/⌘+Space (←/→ too in the block view)',
        where: 'formula list',
        what: 'Move and select; extend the selection; add or remove a formula',
        // ⌘+Space is Spotlight's on a Mac, and Ctrl+Space changes the keyboard's language.
        mac: { keys: '↑/↓, Home, End; Shift+↑/↓; Ctrl/⌘+Enter (←/→ too in the block view)' },
      },
      {
        keys: 'Ctrl/⌘+D',
        where: 'timeline',
        what: 'Duplicate the selected clips, block or camera move (a formula: Duplicate in its menu)',
      },
      {
        keys: 'Tab; ←/→, ↑/↓, Home, End; Shift+←/→',
        where: 'timeline',
        what: "Into the clips; between the clips of a track, the tracks and a clip's block lanes; extend the selection along the track",
      },
      {
        keys: 'Enter; Shift+F10 or Menu',
        where: 'timeline clip or block',
        what: "Open the clip's formula or the block's menu; the clip's Add animation menu (at the playhead), the menu of the selected clips when there are several, or the block's menu",
        // A Mac's keyboard has no Menu key.
        mac: { keys: 'Enter; Shift+F10' },
      },
      {
        keys: 'Alt+←/→ (Shift: 5 frames); Alt+↑/↓',
        where: 'timeline clip',
        what: 'Move the clip a frame; to the track above or below',
      },
      {
        keys: 'Alt+←/→ (Shift: 5 frames)',
        where: 'timeline block, camera move',
        what: 'Nudge the selected block or camera move a frame; it stops against what it cannot run alongside',
      },
      {
        keys: 'Tab; ←/→, Home, End; Enter, Shift+F10 or Menu',
        where: 'timeline, Camera row',
        what: "Into the camera's moves; between them, in the order they run; the menu of a move",
        // A Mac's keyboard has no Menu key.
        mac: { keys: 'Tab; ←/→, Home, End; Enter, Shift+F10' },
      },
      {
        keys: 'P; Shift+P',
        where: 'outside fields, menus and dialogs, with the Slides mode on',
        what: 'Add a pause at the playhead; add a comment there, its words asked for first — where the scene rests (elsewhere a notice says what runs there; a second pause on a frame is not added)',
      },
      {
        keys: 'Tab; ←/→; Delete / Backspace; Enter; Shift+F10 or Menu',
        where: 'a pause or a comment on the ruler (Slides mode)',
        what: 'Reach the marks one by one; move the focused mark a frame inside its zone (↑/↓ in Zen mode); delete it; write its words; its menu',
        // A Mac's keyboard has no Menu key.
        mac: { keys: 'Tab; ←/→; Delete / Backspace; Enter; Shift+F10' },
      },
    ],
  },
  {
    title: 'Preview and timeline',
    rows: [
      {
        keys: 'Shift (held)',
        where: 'preview, timeline',
        what: 'Transform handles on the selected clips (a group when several); link ports on every clip',
      },
      {
        keys: 'Alt (held)',
        where: 'timeline',
        what: 'Only the edges answer the pointer — of the clips, and of their intros and outros: trim a clip, or make an intro or an outro longer or shorter, where a block or a relation window covers the edge',
      },
      {
        keys: 'Ctrl/⌘ (held while dragging)',
        where: 'preview',
        what: 'Free scale and rotation (no scale step — Preferences → Scale step — nor 15° steps); no snapping to other formulas',
      },
      {
        keys: 'Alt; Ctrl/⌘+Alt (pressed while dragging)',
        where: 'preview',
        what: 'Move only horizontally or only vertically — the way the pointer has gone further from where the drag began —, still snapping along that axis to other formulas and to the grid; with Ctrl/⌘ too, without snapping. Let go of Alt and the drag is free again',
      },
      {
        keys: 'Ctrl/⌘ + wheel; Alt + drag on empty space, or the middle button',
        where: 'preview',
        what: 'Zoom about the pointer; pan',
        // A trackpad zooms with a pinch, and moves the view with a scroll.
        mac: {
          keys: 'pinch or Ctrl/⌘ + wheel; scroll, Alt + drag on empty space, or the middle button',
        },
      },
      {
        keys: 'Ctrl/⌘ + wheel; middle button (held)',
        where: 'timeline',
        what: 'Zoom about the pointer; drag the view both ways at once (Esc puts it back)',
        mac: { keys: 'pinch or Ctrl/⌘ + wheel; middle button (held)' },
      },
      {
        keys: 'T (held while moving the mouse)',
        where: 'outside fields, menus and dialogs',
        what: 'Move the timeline’s view along time as dragging its scrollbar would, wherever the pointer is: sideways, or up and down in Zen mode; the view stays where it is when T is released',
      },
      {
        keys: 'Shift+T (held while moving the mouse)',
        where: 'outside fields, menus and dialogs',
        what: 'Move the playhead to the time the pointer is at, at once and as it moves, wherever the pointer is: its place sideways, or up and down in Zen mode; the playhead stays where it is when the keys are released, and Shift pressed or let go while T is held changes between the playhead and the view',
      },
      {
        keys: '↑/↓, ←/→ (in Zen mode)',
        where: 'timeline',
        what: 'The timeline is vertical there and the arrows follow the screen: ↑/↓ go along time and ←/→ across the tracks, → towards the ruler, where the first track is; Alt+↑/↓ moves the clip a frame, Alt+←/→ to the track on that side',
      },
      {
        keys: 'Shift (held while dragging on the ruler)',
        where: 'timeline',
        what: 'Mark a region, its start in green and its end in red: what is created next (an animation block, a relation, a formula brought to the timeline) takes it, from its start to its end, or is not made when it does not fit there',
      },
      {
        keys: 'I, O; Esc',
        where: 'outside fields, menus and dialogs',
        what: 'Put the start, the end of the timeline’s region at the playhead; remove the region (when Esc has nothing else to cancel or close)',
      },
      {
        keys: 'Ctrl/⌘; Alt; Alt+Shift (held while dragging an end of a line)',
        where: 'preview',
        what: 'Along the line: longer or shorter, in the direction it had; onto the symbol under the pointer; onto the whole formula there (a compass asks the point of them). With none, the end is left free where it is dropped',
      },
      {
        keys: '↑/↓ (Shift: ×10); wheel with the mouse button held on the number (Shift: ×10, Alt: ×0.1)',
        where: 'number boxes of the Animations and Relations panels',
        what: "Nudge the value by the field's own step, up for more. The wheel writes as it turns — the preview follows —, its turns are one undo step when the button is let go, and Esc takes them back; without the button held the wheel scrolls the panel as always",
      },
      {
        keys: 'Alt + click; Alt + drag from a formula',
        where: 'preview',
        what: 'Select a glyph of a formula, with those selected in other formulas (again: take it out; Shift: a range within the formula); a rectangle that selects the glyphs it touches, of every formula (Shift adds)',
      },
      {
        keys: 'Enter / Esc',
        where: 'preview, while the new target of a shape is chosen',
        what: 'Make the Transform that carries the shape to what is chosen, at the playhead; leave without making it',
      },
      {
        keys: '←/→, ↑/↓ (Shift: 10 px); Delete / Backspace; Enter, Esc',
        where: 'preview, Edit path',
        what: 'Move the selected anchor or handle a pixel (Shift: ten); remove the selected anchor, or bring the selected handle back to it; finish, as Done does',
      },
      {
        keys: 'Delete / Backspace; Enter; Esc',
        where: 'preview, Edit curve',
        what: 'Remove the selected point of the line; keep the curve, as Done does; put back the curve the mode started with',
      },
      {
        keys: 'Alt + click; Esc',
        where: 'preview, Add line',
        what: 'Put an end of the line on the symbols the preview picks, not on the whole formula; give up the end being chosen, then leave the mode',
      },
      { keys: "Ctrl/⌘+'", where: 'outside text fields and dialogs', what: 'Show or hide the grid' },
      { keys: 'Alt+↑ / Alt+↓', where: 'while the grid is shown', what: 'Denser / sparser grid' },
    ],
  },
  {
    title: 'Dialogs and help',
    rows: [
      {
        keys: '↓ / ↑, Enter; ←/→; Home, End; a letter; Tab',
        where: 'menu bar',
        what: 'Open a menu on its first / last item; the previous or next menu; the first or last item; the next item with that initial; leave the menu',
      },
      {
        keys: 'Ctrl/⌘+Enter',
        where: 'formula editor, text editor',
        what: "Apply: the formula's source as typed, or the text's draft (one undo step)",
      },
      {
        keys: 'Esc',
        where: 'while dragging, in dialogs and menus',
        what: "Cancel the drag; close the dialog (a field's own edit first) or one level of menu",
      },
      {
        keys: 'C; A',
        where: 'outside fields, menus and dialogs',
        what: 'Show or fold the Creator; the Animations panel — in Zen mode, open or close its half of the drawer over the Preview',
      },
      {
        keys: 'Alt+M',
        where: 'outside fields, menus and dialogs',
        what: 'Multicamera on or off: the scene gets a camera (the Camera row of the timeline) or loses it — off only once every target camera and every camera move is deleted',
      },
      {
        keys: 'V',
        where: 'outside fields, menus and dialogs, with the multicamera on',
        what: 'Camera view on or off: the Preview looks through the scene’s camera at the playhead, as the video does, or shows the world with the camera’s rectangles',
      },
      {
        keys: 'F (held)',
        where: 'the Preview with the multicamera on, in the world view',
        what: 'The pointer takes the objects of the scene, as in the camera view, instead of the camera’s rectangles: they are selected, moved and transformed while the key is down, and the scene does not play',
      },
      { keys: '?', where: 'outside text fields and dialogs', what: 'Show the keyboard shortcuts' },
    ],
  },
];

/** Every row, in order (the README table). */
export const SHORTCUT_ROWS: readonly ShortcutRow[] = SHORTCUT_GROUPS.flatMap((g) => g.rows);

/** What a row says on the system the app runs on: on a Mac, what it has of its own there. Still in
 * the notation of the README (`keysText` and `macLines` write it the Mac's way). */
export function sheetRow(row: ShortcutRow, mac: boolean): ShortcutText {
  const { keys, where, what } = row;
  return mac ? { keys, where, what, ...row.mac } : { keys, where, what };
}

/** The mouse gestures that go with the shortcuts (the README's "Clicks:" paragraph). */
export const CLICK_GESTURES =
  'Shift+click selects a range, Ctrl/⌘+click toggles, a box dragged over glyphs selects them ' +
  '(Ctrl/⌘ adds); a double-click on a formula card or on a clip opens the formula editor, and on ' +
  'an animation block its dialog. In the ' +
  'preview, Ctrl/⌘+click or Shift+click adds a clip to the selection or takes it out, and a drag ' +
  'on empty space draws a rectangle that selects the clips it touches (with Ctrl/⌘ or Shift, it ' +
  'adds them; Esc cancels).';
