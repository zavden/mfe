# Architecture §11 (2 of 6): History, stores, browser state

[Index](../ARCHITECTURE.md) · Previous: [§11 UI layer](11a-ui-layer.md) · Next:
[§11 The look and some views](11c-ui-look-views.md)

Holds more of §11 *UI layer and browser state*: owned gestures and the undo history, a step made of
several writes, history routing and Duplicate, the stores besides the project, the services, the
menu key, the Renderer label, what the browser keeps (`localStorage`, IndexedDB), autosave records,
their alive marks and pruning.

See also: [§11 UI layer](11a-ui-layer.md#11-ui-layer-and-browser-state) ·
[Glyph index spaces](01-03-foundations.md#glyph-index-spaces) · [Durable original media and portable
projects](11f-media-audio.md#durable-original-media-and-portable-projects)

---

<a id="owned-gestures"></a>
**Owned gestures** (`store/projectStore.ts`). A continuous edit — a clip dragged on the timeline, a
formula moved in the preview, a node of a path, a value scrubbed — is one undo step.
`history.beginGesture(onCancel?)` stops the recording and hands its caller a handle
(`ProjectGesture`): the caller owns the gesture. What an owner and the rest of the app can count on
is a contract; its core, that any other edit and Undo or Redo cancel the gesture in progress, is a
decision of the project's owner (D82):

- *Only what goes through the handle belongs to the gesture*: `handle.update(recipe)`, or any store
  action called inside `handle.run(…)`, synchronously. `end()` records what the project became as
  one step, none when it is still the project the gesture started from; `cancel()` puts the project
  back as the gesture found it. Neither touches the steps already recorded, behind or ahead.
- *Any other edit cancels the gesture in progress.* An `update` that does not come through the
  handle — a command, a shortcut, a menu, another editor — first cancels the live gesture, whose
  `onCancel` runs, and is then applied as a step of its own. Starting another gesture and loading a
  project cancel it as well.
- *Undo and Redo cancel it, and do nothing else*: the first Ctrl/⌘+Z during a drag gives the drag up
  and undoes no recorded step. The store's raw `temporal` commands have the same boundary, and
  `history.canUndo()` is true while a gesture lives.
- *Derived data is not an edit.* `amend` (the syncs: snapshots, the positions of attached objects,
  also when they finish later) neither cancels the gesture nor makes a step of its own: what it
  changed is recorded with the gesture when that ends (a gesture that wrote nothing then records the
  derived data alone) and goes with it when that is cancelled, where the syncs settle the project
  again.
- *A handle without its gesture does nothing.* After an end, a cancellation or a replacement,
  `active` is false and `run`, `update`, `end` and `cancel` are ignored: a late pointer event cannot
  write into a newer gesture, finish it or revive its own. Pointer owners also let go when the
  capture is lost or the document replaced (`ui/pointer.ts`, `project/trackProjectPointer.ts`, the
  preview's hooks).
- *A scoped rollback is the one refinement* (Edit path). An owner that has given back the one field
  it wrote may call `finishCancellation()` in place of `cancel()`: what else is newer — a lock, an
  amendment — stays, and so do both stacks; when that leaves the project as the gesture found it,
  the store puts the very object back, since the document counts as unsaved while the project is
  another object. An owner that cannot give its field back (the path session ended under the drag)
  cancels like any other. No UI module writes the project store but through its actions and handles.

What follows for new code: whatever must write the project while a drag lives writes through the
handle of that drag. Anything else that calls `update` then ends the drag, on purpose: a drag that
freezes is a foreign write to look for, not a rule to relax. A command that plans with the project
— it reads it, works out what to write and then calls `update` — calls
`history.cancelForeignGesture()` before it reads: `update` would cancel the drag only after the
plan was made, with what the drag had moved, and apply it to the project the cancellation brings
back. A command that is then refused has given the drag up all the same, as Undo does. A field of a
panel that keeps part of what it draws (the other coordinate of a position, the length of a block)
is such a command too, for what it draws may be what a held drag shows: it works its change out
inside the recipe, from the draft `update` hands it, or cancels first and reads the store. So does
a command that takes the project out of the editor: Save, Save As and the question about unsaved
changes (`project/actions.ts`) give the drag up before they read, so that a file holds a state the
history can reach, not a move Escape would still take back. A key whose command depends on the
project decides with `history.projectBeforeGesture()`, the project the drag started from: S splits
the selected clips under the playhead or switches the circle selector as it would with no drag held
(`splitKeyApplies`), not by where the drag has taken a clip so far. Core modules import no UI code.

<a id="a-step-made-of-several-writes"></a>
**A step made of several writes** is not a gesture. `history.continueStep(write)` joins the step
`write` makes to the step before it, and `history.retractStep()` takes the last step back and leaves
nothing to redo. They are for an edit made click by click with anything else allowed in between
(colours in order, `preview/colourOrder.ts`): nothing is held open, so another edit cancels nothing
— it is a step of its own, and the caller's next write starts another. The caller answers for the
step before being its own and the last one: it keeps the project object its last write left, and
continues that step only while the project is still that very object. `history.depth()` counts the
steps there are to undo, which tells whether a write made a step of its own, joined the one before
it or made none: the guard of the Slides mode ([§13](13-slides-mode.md#the-guard)) uses the three —
it deletes the marks an edit covered in the edit's own step, or takes the edit back down to the
depth from before it. A joined write makes no step, so it pushes none out of a history that is full
(`HISTORY_LIMIT`, 200 steps): `continueStep` puts the states back as they were before the write.

<a id="history-routing"></a>
History routing follows the top modal. Immediate-edit dialogs allow project history; idle text
fields retain native text undo. Draft-only modals consume history keys on non-text controls, and
a live project gesture owns the first cancellation even if a text field retained focus.
Ctrl/⌘+D duplicates on the timeline only (clips, a block); a formula is duplicated from its card
(`duplicateFormula`) or from the menu of the selected ones (`creator/formulaCommands.ts`), under
the same object and lock rules. What Duplicate makes, Unlink formula makes too, through the same
code: `formulaCopies` (deep copies with new ids and the next free names), `insertFormulaCopies`
(each right after its original, in the list and in its group) and `addFormulaCopies`, which seeds
their renders and writes them as one undo step, with what goes with them in that step.

<a id="stores-besides-the-project"></a>
Stores besides the project, render and UI stores (`store/`): the document (`project/documentStore`:
file name, handle, the saved baseline and `documentStatus` — "Unsaved changes", "Recovered, not
saved", "Saved", "Not saved yet"; a save captures the project and document session before any picker
or permission await. `project/saveQueue.ts` orders physical writes through close for the same native
file, using `isSameEntry` for handle aliases and serializing uncertain destinations conservatively.
Known distinct files can finish independently. A successful save owns the baseline, `dirty` tells
whether later edits remain, and an older completion cannot steal a newer successful save's handle.
Document replacement cancels before opening a writer; an already-open writer finishes its captured
revision without changing the replacement document. A destination the user chose in the picker is
the exception: it receives the captured revision as a copy with a notice (`committed` in
`project/actions.ts`), and the open document adopts nothing, turning dirty only if the copy went
over its own file (without a handle, a file of its name). Failed streams are aborted, and every exit
releases its reservation. Open reads the chosen file before it asks about unsaved work, so that a
file that is no project asks nothing; «Save» in that question writes a file afterwards, which may be
the chosen one — the file that is open chosen again, or the destination given to Save As. A file
with a handle is therefore read again after such a save (`askToReplace` tells it from the other
answers, `prepareOpened` reads), what the first read copied into the browser is given up, and what
opens is what the file holds then; a file that cannot be read again, or a project edited meanwhile,
leaves the open document as it is), dialogs and notices, the timeline's zoom and snap, the Preview's
own view of the scene (`preview/viewStore.ts`: where it looks from and how close, which its gestures
write and a shortcut, a menu or the multicamera's «Fit» can set), the open editors (formula, Edit
together, relation, relation chain, a Morph block's pairs, export), the project library
(`project/libraryStore`: the synced folder, its projects and whether the Projects dialog is open),
the open Help dialog and the Animations tab. None of them is undoable.

<a id="services"></a>
What runs in the background is a set of services (`project/useAppServices.ts`, started by the
layout). Each is a `start…()` that registers its listeners and returns the function that removes
them: the render and attach syncs, the tracking of unsaved changes, the ownership and the collection
of the originals, autosave, the watch on missing recordings, and *session tracking*
(`project/sessionTracking.ts`), which keeps the editing sessions that live outside the project on
their document. The preview's glyph pick, align by symbol and Edit path follow the project and the
renders (`startGlyphPickTracking`, `startSymbolAlignTracking`, `startPathEditTracking`; Edit path
hears of its own writes there too, which is how the next command tells them from foreign edits; a
command of align by symbol reads its symbols through `current()`, before any effect has run, as the
commands on picked glyphs do), a text composition ends when its text or its clip leaves the project,
the choice of what a shape's Transform goes to when its shape or that Transform does
(`startShapeRetargetTracking`), and all of them, with the requests of the formula and multi-formula
editors and the search of formulas, end when the document is replaced (`onDocumentReplaced`: a
project was loaded, or the document session changed), without writing into the new one, which may
reuse ids: a saved copy opened again has every one of them. A command that asks before it writes
(the words of a Slides comment, and a deletion that is confirmed: every pause, a track, a block or
its group, clips that objects are attached to, formulas; and «Apply to all» of the Standard scale
dialog) listens to nothing, and its question may still be on screen when the file chosen in File →
Open… arrives: it takes `currentDocumentCheck()` (`project/documentStore.ts`) before asking and,
when the answer comes over another document, writes nothing, whatever ids that one has. An edit of
the same document meanwhile does not make it another: the command reads the project again and goes
on. A draft that holds values of the document itself goes the same way: Project settings… holds
the whole of its `meta` and the name field of the menu bar its name, and a document that has nothing
to save is replaced without a question, so either could still be on screen when the other document
arrives. Both end on `onDocumentReplaced` (the dialog closes, the field drops what was typed), and
the dialog's Apply asks `currentDocumentCheck()` as well: neither writes the first document's
values into the second. No module registers a listener by being imported: nothing could stop it, a
hot reload would leave the old one behind, and it would run in every unit test that imports the
module (`importListeners.test.ts` reads the sources for one). A unit test of what a service does
starts it (`test/services.ts`).

<a id="the-menu-key"></a>
One of the services is the menu key (`ui/contextMenuKey.ts`). On Windows and Linux the browser
turns the Menu key and Shift+F10 into a `contextmenu` event at the focused element, and every menu
that hangs from a right-click opens with them; a Mac has no such key and its browsers send
nothing. There the service sends the same event to the same place (the middle of what has the
focus), unless a component took the key first, as the timeline does for its clips and blocks: the
components know one way only, `onContextMenu`. `ui/platform.ts` has the one `isMac()` the app
asks, for this, for the command key (`commandForKey`: ⌘ on a Mac, Ctrl elsewhere) and for the
hints of the menu bar and of the tooltips that give a button's key or gesture (`keyHint`:
"Ctrl+Alt+N", "Ctrl + wheel"; "⌥⌘N", "⌘ + wheel" on a Mac, whose menus write the modifiers in an
order of their own — Control, Option, Shift, Command: ⌃⌥⇧⌘ — with nothing between the keys), for the
texts that name keys and are written once for every system, as the README writes them (`keysText`: a
hint, a tooltip, the words and the caps of the shortcut sheet read "Ctrl/⌘+Shift+Z", "Alt + drag"
and "Shift: a range" as they are elsewhere, and "⇧⌘Z", "⌥ + drag" and "⇧: a range" on a Mac; a
builder that puts a name of the user's in its text converts its own words, and takes the system as a
parameter, `lineDrawHint`, `retargetHint`; `keysSpoken` names the keys instead — "Shift-Command-Z",
"hold Option" — for what a screen reader is given: an announcement, the row headers of the sheet),
and the one way a key press is read as a letter, `letterOf` (`commandForKey`, `timelineKey`,
`regionKeyEdge`): the letter the key types, wherever a Latin layout puts it (Dvorak, AZERTY), else
the letter a Latin keyboard has at the key's place (`code`) when the key typed a letter of another
script (Ctrl+Z is «я» on a Russian layout) or Alt was held (Option and AltGr compose other
characters).

Another service is the Control key (`ui/pinch.ts`, `startControlKey`). Chrome sends a pinch of the
trackpad as wheel events with Ctrl held, though no key is, whose `deltaY` adds up to −100 ×
ln(scale) of the gesture; the three views that zoom with the wheel (the Preview, the timeline, the
stage of the text editor) ask `zoomFactor` for their factor. On a Mac a wheel with Ctrl and no
Control key down is a pinch, and zooms by the scale of the gesture, exp(−deltaY / 100): fingers
twice as far apart, twice as large. Any other wheel, and every wheel elsewhere, zooms by the view's
own rate. A wheel alone is a scroll, and on a Mac it moves the Preview's view (`scrollPans`): the
scene follows the fingers, by `panByPixels` as a drag of the view does, unless the wheel is over
something with a wheel of its own (`OWN_WHEEL`: a menu, a field); taken, it does not start the
browser's "back" either. Elsewhere the Preview leaves a wheel alone to the browser.

A few shortcuts are other keys on a Mac, where the keys of the system come first (`commandForKey`,
and the `mac` rows of the shortcut sheet). Distribute is Ctrl+Alt+H and V with the Control key
itself there (⌃⌥H and ⌃⌥V, as the action's `keys` say: "Ctrl+Alt+H"): with ⌘ they would be ⌥⌘H,
which hides the other apps, and ⌥⌘V, which pastes a style. Save As is ⇧⌘S there, as in every app of
a Mac, and Sync folder takes ⌥⌘S, the key Save As has elsewhere: the two change places
(`saveAsKeys`, `syncFolderKeys`, which the File menu reads). And the row of the formula list that
has the focus is added to the selection, or taken out, with ⌘+Return there (`listKeyOf`,
`creator/formulaSelection.ts`, which the cards, the group rows and the search results ask), the
click with ⌘ of the keyboard: ⌘+Space is Spotlight's and Ctrl+Space changes the language of the
keyboard, so neither may reach the page.

<a id="the-renderer-label"></a>
The top bar's **Renderer** label sums up where the formulas' glyphs come from (`engineStatus.ts`,
from the render store, not from the companion's state): `LaTeX` when every formula has an exact
render from the companion, `MathJax` when none has, `mixed` otherwise; each formula's badge in the
Creator says the same for that formula ("exact" or "MathJax"). These are the two fidelity levels
of [§1](01-03-foundations.md#1-two-fidelity-levels) ("exact mode", "free mode").

<a id="what-the-browser-keeps"></a>
What the browser keeps (`localStorage`, through `ui/storage.ts`, which tolerates a blocked store):

| Key | What | Written |
|---|---|---|
| `mfe.autosave.<session>` | one page writer's project, name, file name, document id and unsaved state | 400 ms after a change; pending recovery also retries at startup, heartbeat and page lifecycle |
| `mfe.alive.<session>` | when that tab was last seen, while it is open; `taken:<when>` once another page copied the record of a tab that stopped answering | every 15 s; removed when the page goes away, with its record when that is pruned, and at startup after a day without a record |
| `mfe.away.<session>` | when that page went into the back/forward cache: for the autosave it is a closed tab, but what it owns in the media store waits for it | on `pagehide` with `persisted`; removed when the page is shown again, and at startup after a day |
| `mfe.autosave.unreadable.<session>` | a copy of each autosave this version could not restore (also offered as a download), under its record's session; the five saved last are kept. `mfe.autosave.unreadable` alone is the one copy earlier versions kept, left where it is | at startup, when that happens |
| `mfe.preferences` | editor preferences: "Always add intro / outro", default intro and outro, "Suggest morph pairs", snap to objects in the preview, the colour and width of its snap guides, the colour of the glyphs picked with Alt, the scale step of the handles and whether they stay shown without Shift, the grid, the reach of align by symbol and of the circle selector (the Preview's and the pair editors'), the Preview's selector on or off, the suffix of Split at playhead, the standard scale of new formulas and texts, the opacity of a formula locked in the preview, the Creator's view and the size of the previews of each of its views, the lists of glyphs of a glyph view and of the pair editors | on change |
| `mfe.theme` | `dark`, `light` or `system` | on change |
| `mfe.palettes.v1` | bounded semantic palette library and active entry ID | explicit library operation, serialized with a browser lock |
| `mfe.export.target` | the Python target the Export… button of the menu bar opens: the last one used | on change |

The panel sizes are stored too, by `react-resizable-panels` under the ids of the two panel groups
(`AppLayout.tsx`), a folded panel's among them: `ui/panelsStore.ts` keeps which of the Creator,
Animations and Timeline panels are folded to their title bar, holds their imperative handles while
the resizable layout is up, and folds or unfolds them for the headers' buttons (`PanelFrame.tsx`),
View ▸ Panels and the keys C and A (D191: `toggle-creator` and `toggle-animations` in
`project/shortcuts.ts`, alone, outside fields, menus and dialogs, once however long the key is held;
`FOLDABLE_PANELS` names each panel's key for the tooltips and the menu); the layout reports every
size, so a separator dragged past a panel's minimum counts too. Every page load allocates a fresh
autosave writer in memory. `sessionStorage` (`mfe.session`) points to its record for the next
reload; copied session storage never grants another live page the same writer. `restoreAutosave()`
runs before the first render (`App.tsx`): a reload copies its previous record, and a new tab can
recover the newest record without a recent heartbeat. Transfers verify the destination before
removing an unchanged source. Sources with stale heartbeats remain stored because their pages may be
suspended. Failed transfers retain their source in `mfe.recoverySource` (session storage), report
blocked autosave, and retry at startup, heartbeats and page lifecycle events without another edit.
Pending sources are protected from pruning; other closed records remain listed for a week, five at
most. Legacy records and unreadable backups follow the same copy-before-delete rule. When the
restored project had unsaved changes, the document state says so, and its tooltip adds that it was
recovered from this browser. IndexedDB (database `mfe`, store `handles`) keeps the current
document's file handle, which `localStorage` cannot hold (`project/files.ts`, `storeHandle` /
`loadStoredHandle`): after the restore, `restoreDocumentHandle()` puts it back when it belongs to
the restored document — the autosave record and the stored handle both carry the document's id
(`documentStore.documentId`), so a handle another tab stored for a file of the same name in another
folder is left alone and Save asks where — and plain Save then writes the same file again; the Save
action asks the browser's permission first (`ensureWritable`) and falls back to Save As when it is
refused. The same store keeps the project library's folder (`project/library.ts`, pure: the entries
of a folder listed one level deep, newest first; `libraryStore.ts`: Sync folder, the listing and its
restore at startup): in Chrome/Edge a directory handle, listed again whenever the Projects dialog
opens (`ProjectsDialog.tsx`, thumbnails through `libraryThumbs.ts`: one MathJax render per distinct
formula, and a font text from the geometry its file carries, checked as on Open, once per session,
but not stored, since nobody owns the geometry of a project that is only listed), elsewhere a
snapshot of the folder's files taken through a `webkitdirectory` input. A project opened from the
library carries its file handle when it has one, so Save writes it in place, and Save As starts in
the folder. A file that is a project and does not open is not counted with the `.json` files that
are no projects: a failed `parseProject` says which of the two it is (`isProject`: the file names
the app's format), and `buildLibrary` lists such files apart, each with the reason (`unopened`),
which the dialog shows under the cards; a package that could not be read for the listing keeps why
(`FolderFile.unreadable`, which a snapshot keeps too). A package whose container is whole and whose
project does not open is refused with the project's own reason (`UnopenedProjectError`,
`media/errors.ts`), and Open shows it as it shows a `.mfe.json`'s: «damaged» is said of a package
that is. The dialog lays the entries as cards in a grid (D153, `project.css`: a column per 480px
of room, a container query for the cards of two columns or more), and above them has a search
(`filterEntries` in `library.ts`: every word in the project's name or in its file's, case and
accents apart) and a switch between every project and the starred ones
(`project/projectFavorites.ts`: the names of the starred files by the name of the folder, in
`localStorage` under `mfe.projectFavorites.v1`, read again before each change so that another tab's
stars are kept; nothing is written in the folder, a browser tells no more of a folder than its
name, and so a renamed file loses its star). The search field takes the focus by marking itself
with `data-autofocus`, which a `Modal` looks for before its first control. Either way a control
that is disabled when the dialog opens is passed over, and a dialog with none to focus takes the
focus itself: left on what opened the dialog, the focus would keep the keys acting behind it (the
arrows of the timeline under the pair editor of a Morph, which opened on a disabled button).
`window.__mfe` (`src/devtools.ts`) exposes the stores to the e2e specs in the dev server only.

The examples the app carries (`project/starterExamples.ts`) are four files of `examples/`, imported
as data: the build is one script, so they are part of it and open from `file://`. `openExample`
(`project/actions.ts`) opens one through `openProjectVia`, the way of every file: the reader of
files reads its text, the question about unsaved work comes once it is a readable project, and what
opens is a document without a file (`fileName` and `handle` null) and with an empty history, so
that Save asks where it goes. The empty Creator offers the first (`FIRST_EXAMPLE`), Help ▸ Examples
all of them. One that is offered opens with nothing to tell (`starterExamples.test.ts`): it is a
file the repo checks as an example (`test/examples.ts`), of the current format — one that had to be
upgraded would say so each time it opens —, without issues, without a font text, whose appearance
would need the companion, and without marks of the Slides mode.

<a id="the-alive-mark"></a>
The alive mark decides what a page may do with another page's record (`readMark` in
`project/autosave.ts`): seen within a minute it is alive; older, or more than a minute ahead of the
clock, it is stale; without one the page left in order. A reload of the tab — Navigation Timing
says `reload`, or `document.wasDiscarded`, and the page could replace the session id it found —
removes the previous page's mark and takes its record at once: a crash leaves a fresh mark, and the
page is gone all the same. Without that proof a fresh mark protects the record. A page that found
one for its previous page (a browser session restored after the browser died, or a duplicated tab
whose original is open) takes no other record and reads the mark again when it would expire, plus
`RECHECK_MARGIN_MS` (`awaitPrevious`): an unchanged mark means the page is gone, and its record is
restored by itself if the user has not used the new page (no pointer or key input, the new project
untouched), else offered in a notice with a Recover action.

After a verified copy the record of a page without a mark is removed. One behind a stale mark
stays and its mark becomes `taken:<when>`: its page may be suspended or discarded and have no other
copy of its work, so its own tab can still take it (a reload, or a restored session, which then
removes it) or go on with it (a resumed page writes a fresh mark), but no other page lists or
restores it again. Pruning follows the same care. Any record goes a week after its page was last
there, which is its last save or its mark, whichever is later. Only the records of closed tabs and
those already taken are also limited to the newest five each; a record behind a stale mark is never
ended by count, only left out of the list. Marks without a record go at startup after a day. A page
that runs again after looking gone (`pageshow`, `visibilitychange`, `resume`, every heartbeat)
writes its mark and, if it ever had one, its missing record. It does so under the writer id it has
then: a page whose session storage is emptied under it ("Clear site data" with the tab open) gets
a new id at its next write, and its autosave follows, writing the work back once and keeping every
id the page has had marked alive, since what the page owns in the media store is still named after
the first.
