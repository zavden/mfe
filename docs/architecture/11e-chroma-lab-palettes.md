# Architecture §11 (5 of 6): Chroma Lab and editor palettes

[Index](../ARCHITECTURE.md) · Previous:
[§11 Formula templates, text composition](11d-templates-text-composition.md) · Next:
[§11 Media, packages, audio](11f-media-audio.md)

Holds §11's subsection *Chroma Lab and editor palettes*: the pinned Chroma Lab in its frame, files
dropped on it, the host bridge, the palette format and library, roles of the user's, palettes made
in the editor, the colours of new objects and Apply palette.

See also: [§2 Modules](01-03-foundations.md#2-modules) ·
[§10 Working rules](09-10-testing-working-rules.md#10-working-rules) ·
[§11 The modules of `ui/`](11a-ui-layer.md#ui-modules) ·
[`app/src/ui/chroma/README.md`](../../app/src/ui/chroma/README.md)

---

### Chroma Lab and editor palettes

`ui/chroma/ChromaLabDialog.tsx` hosts the complete pinned Chroma Lab 1.3.0 distribution in a local
iframe. The frame is a page of the editor's own origin (`./chroma-lab/index.html`) and carries no
`sandbox` attribute, so nothing isolates the two documents: each could reach the DOM and the storage
of the other. Their separation is a convention the host keeps (below), and the child is trusted as
the editor's own code is, being the pinned files the build verifies. `ui/chroma/snapshot.json`
records its source commit, hashes, byte sizes and actual license metadata; `src/data/chroma-lab/`
contains unchanged upstream files. The Vite plugin verifies these hashes, serves the files in
development and emits the same tree into `dist/chroma-lab/`. MFE keeps its single classic IIFE; the
child loads its own classic IIFE and embedded Blob worker. Local help, videos, posters and
dependency notices ship with it. No upstream checkout or network is needed at runtime. The preserved
distribution adds 759,235 raw bytes, excluding MFE's adapter code.

The host lives beside the other MenuBar dialogs, outside responsive panel branches. The frame has
the whole body of the dialog: what the editor adds sits in the title bar (`Modal`'s `headerTools`,
controls between the title and the window buttons) — **Import palette…**, **Editor palettes…** and
an information button whose panel tells how a theme reaches the editor and links Chroma Lab's
notices; the panel closes on its button, on Escape (the dialog stays), on a press elsewhere and when
the window loses the focus to the frame, whose presses the host never hears. Resizing and maximizing
preserve the frame identity; closing destroys its document and worker. An explicit iframe
tab stop and footer controls permit keyboard entry and exit. `allowHistory={false}` keeps editor
history quiet; Chroma owns its internal keyboard events and undo. The applications' UI themes and
scene backgrounds remain independent. A theme crosses from Chroma to the editor in two ways, both
the user's own act: the host bridge (below) and a JSON theme file. The host's **Import palette…**
opens the file picker itself and stores the chosen theme in the editor's library
(`ui/colors/usePaletteImport.ts`, the hook Editor palettes imports with: one file, at most 1 MiB,
and a newer file or a closed dialog drops a read still under way); MenuBar then opens Editor
palettes on that entry, and a refused file is explained over the frame. The same file can be
dragged onto either dialog: `ui/fileDrop.ts` (`useFileDrop`, with `FileDropOverlay`) makes an area
take a drag of files. The area's handlers accept the drag as it enters and take the drop wherever in
the area the browser says it is; the overlay shows where the files go and covers what could take the
drag away, the frame above all. It comes down when the drag leaves the element it entered last (a
browser enters the next element before it leaves the previous one), which also holds for a drag that
clips an edge or is cancelled before the browser has looked under the pointer again, when the
overlay itself hears nothing; a press, a key or a drop anywhere lowers one left behind (the end of a
drag is heard on its way back up, after the area: the drop lands on the overlay, a browser renders
between the listeners of an event it delivers, and React hands an event to no one once its target
has left the page, so an overlay lowered first would take the drop with it). Before the drop a
browser tells only the type of each dragged file, so the Chroma host takes a drag only when one of
its files is reported as `application/json`: a picture, or a file whose type the browser does not
tell, stays with the studio and its extractor. Being of the same origin, the host puts the same
handlers on the frame's document (a drag can enter the frame without crossing the host) and installs
there the guard the app installs on its own window, `guardFileDrops`: a file dropped where nothing
takes it is refused, since a browser would otherwise open it in place of the editor. The guard
leaves alone the events a drop zone has already cancelled and the native file fields. The host
neither reads private storage to guess the live palette nor intercepts downloads. Its
export-before-close reminder avoids promising child persistence the parent cannot verify. The studio
keeps its own state in `localStorage` under `chromalab-v1` and `chroma-manim-studio-v1`; the editor
never reads or writes those keys.

Chroma Lab is the editor's own color studio: an extension of Manim Formula Editor that lives in a
repository of its own, comes inside every build as the pinned copy, and is optional to use (a
palette can be made and edited in Editor palettes without it). The **host bridge** is the one live
boundary between the two documents, and it is messages only. Its contract is "Host bridge" in Chroma
Lab's `docs/ARCHITECTURE.md`; `ui/chroma/hostBridge.ts` is the editor's side (`startChromaHost`, a
service the dialog starts and stops with itself). Every message carries `channel: 'chroma-lab'` and
`version: 1`. Chroma Lab greets its parent (`hello`); the editor presents itself by name (`host`),
in answer to the greeting and again when the frame loads (Chroma Lab takes the first, and a repeat
changes nothing); Chroma Lab answers `ready` and draws **Send to Manim Formula Editor** beside its
JSON export, in Exploration and in Seeds & themes; on that click it posts `theme`, the data its JSON
button writes; the editor answers `theme-result` with what came of it, which Chroma Lab shows as a
notice. The editor hears only the window of its frame, from its own origin, and Chroma Lab takes a
host only from its parent at that same origin, so a page of another site that frames a published
copy cannot pose as the editor. What arrives is data: it is turned into text and goes through
`parsePalette` and the library exactly as a file does (`usePaletteImport.importTheme`), so a theme
that is not one is refused with the same message, in the host's toolbar and to the frame, and
MenuBar opens Editor palettes on what was imported. A build opened from disk has an opaque origin: a
message from it says `null` whatever `location.origin` says (Chrome says `file://`) and it cannot be
named as a target, so there the editor expects `null` and posts to `*`; the frame is still
identified by its window. The dialog shows `data-bridge="ready"` once Chroma Lab has answered.
Chroma Lab opened alone has no parent and draws no button. The bridge has one version at a time: a
refresh of the pinned copy that changes the protocol changes `hostBridge.ts` with it
([`ui/chroma/README.md`](../../app/src/ui/chroma/README.md)).

`ui/colors/palette.ts` parses a complete `manim-palette` v1 envelope with eleven roles and a 1 MiB
file limit. It rejects unknown versions, missing/unknown roles, alpha or non-hex colors, and the
generic palette-array export. Canonical metadata normalization follows Chroma's importer, with
warnings for clamped or discarded fields; frozen normalized metadata is retained for portable
export. Only opaque literal colors affect the editor, never imported style or contrast reports.
A color may be written as 3- or 6-digit hex, with or without `#`; it is trimmed and kept as
upper-case `#RRGGBB`. The roles of one group must share both their color and their lock. Besides
`format`, `version` and `colors`, the envelope may carry `name`, `style`, `seeds`, `mode`,
`backgroundMode`, `groups`, `locks` and `generation`; any other field is discarded with a warning.

`paletteLibrary.ts` validates a separate versioned preference document with up to 24 entries,
editor-generated IDs, independent display names and a nullable active ID. Exact normalized source
duplicates reuse an entry before capacity checks; name collisions do not replace content.
Duplicate stored IDs and corrupt entries are rejected individually. A stored value that is not a
library at all (broken JSON, no `version`, a version 1 without its list) reads as `damaged`: the
store works in memory and `resetLibrary` replaces the value with what the tab holds, which Retry
saving never does. A value with another `version` is not damaged: it is protected from overwrite and
offered no reset. `paletteStore.ts` serializes ID-based intentions within the tab and with the named
browser lock `mfe.palettes.v1.write`. Each mutation rereads the latest library under that lock,
applies pending intentions and checks `safeStorage.setItem`'s success. Failed writes retain usable
memory state and pending intentions for retry; deduplicated imports remap later intentions to the
surviving ID. The replay (`replayPaletteOperations`) applies the pending intentions one by one: an
intention the latest library refuses (its palette was removed meanwhile, the library filled up) is
dropped and named in the warnings (what was done to a dropped import goes with it), so that
no later change or retry is refused because of it. A new change that is refused while others wait
still lets those be saved, and is then reported to its caller. Storage events and focus refresh
clean tabs. Missing coordination, denied reads and unknown storage versions remain explicit
session-only states, with JSON export. No palette preference action edits the project, its undo
stack or dirty baseline.

The library document is `{ version: 1, activePaletteId, palettes }`, stored under
`mfe.palettes.v1`. Each entry is `{ id, displayName, source }`: an ID of at most 200 characters, a
trimmed display name of 1 to 120 and the normalized palette; an entry made or changed in the editor
also has `authored: true` (below). An import whose display name is taken receives a ` (n)` suffix.
Deleting the active entry leaves `activePaletteId` null, which means the Manim defaults, and never
activates another entry; a stored active ID that names no entry reads as null.

A palette may hold roles of the user's beside the eleven (D154): `customRoles`, an optional list
of `{ name, color }` in the order they were added, part of the source — so it is stored,
duplicated, exported and imported with it — and absent when empty, so that a palette without them
is written byte for byte as before. A name is trimmed, 1 to 32 characters on one line, none of the
eleven role names and unique in its palette whatever its case (`customRoleName`); a palette holds
24 at most. Chroma Lab is not changed: its reader takes the fields it knows from a theme and never
sees this one, while an unknown key inside `colors` is still refused by both. `changeCustomRoles`
(`paletteEdit.ts`) adds, renames, recolors and deletes one, leaving the eleven colors, the recipe
and the background mode alone; the library's `custom-role` intention carries such a change and marks
the entry `authored`. Nothing takes a role of the user's by itself — `paletteRoleForKind` and Apply
palette know the eleven — : `PaletteRoleChoices` offers them after the eleven wherever a color is
chosen by role, as swatches with their names in the tooltips, or (`named`: the pop-up of the Roles
button and the color menu of Match colors) as blocks with the name beside the color, the user's
under a heading of their own. `PaletteCustomRoles` is their editor under the eleven fields of
`PaletteLibraryDialog`: a `CommitInput` for the name, a `HexColorField`, Delete, and a row that
adds one; a name the palette cannot have is said beside its field and never sent.

A palette is also made and edited in Editor palettes, with no file. `ui/colors/paletteEdit.ts` is
the pure part, and whatever it returns is a complete `manim-palette` v1 source that
`normalizePalette` reads back unchanged: `newPaletteSource` starts from `DEFAULT_PALETTE_COLORS`,
the colors the editor uses with no palette (the default background, `DEFAULT_COLOR`, `SHAPE_COLORS`,
and Manim's BLUE, GOLD, WHITE and GREEN for the four roles no object is born with), so activating a
new palette changes nothing until a color is edited, except for new underlines, which share the
`rectangle` role with boxes and take their yellow instead of Manim's white; `recolorSource` puts one
role in another color, takes that role out of a linked group (the roles of a group share one color,
and the others keep theirs), drops `generation` (the colors are no longer the output of the recipe,
which is what Chroma Lab does to a palette edited by hand) and leaves a manual background whichever
role changed (Chroma Lab calculates an automatic background from the foreground colors, which the
editor does not); seeds, style, mode and locks stay. The library's log has an intention for each:
`create` adds an entry and, unlike `import`, never takes it for an entry with the same source (a
duplicate is a second entry on purpose); `recolor` names a palette, a role and a color, and is
refused like a rename when its palette is gone. Both mark the entry `authored`. The source of an
authored entry carries its `displayName` as `name` and follows a rename, so Export, which writes the
stored source as it is, writes a file that the importer takes for that same entry; an imported entry
nobody changed has no mark and keeps the source of its file, name included, whatever it is called in
the editor. A stored library without the mark reads as before, and an older build of the editor that
writes the library drops the mark: such an entry is then exported under the name of its source
again. `PaletteLibraryDialog` draws New palette, Duplicate, a `HexColorField` per role
(`roles={false}`: the field edits a role of the selected palette and does not offer the roles of the
active one) and `PaletteSample`, a picture of the eleven colors on the palette's background. A color
is committed when the native picker closes or the hex is accepted, one intention each; the fields,
New palette and Duplicate are not disabled while a save is under way, since a browser takes the
focus from a control that is (a field reached with Tab, a button pressed with Enter), and the
intentions are saved in order anyway. There is no draft and no undo: the library is a preference,
and Duplicate is how a palette is kept as it was. Editing the active palette is seen at once by what
reads it (`getActivePalette`, the role choices) and never by the project.

`PaletteRoleChoices` and `PaletteRoleButton` share named roles across glyph menus, swatch rows,
Match colors, hex fields and animation color fields. Roles are keyed by role, including equal-color
roles, and expose role plus hex accessible names. Compact controls use a popup owned by one active
palette and enabled lifetime. Selecting a role copies its hex through the existing commit callback.
Native pickers, Manim colors and identification-color defaults retain their existing behavior.

Creation actions resolve the active palette once and pass colors explicitly to pure
`creator/newFormula.ts` and `animations/attachmentCreation.ts`. Authored fields win. Shapes keep
their style presets and text keeps standard scale. `project/newEditorProject.ts` owns new-document
backgrounds; File New and pristine startup use it after preferences hydrate. Startup recovery takes
precedence, and repeated initialization cannot replace an already initialized document. Core
factories, parsing, migrations and ordinary replacement never read palette preferences.

`applyPalette.ts` plans background and base-object color changes. A single locked-track use protects
the entire shared object; an object of a kind whose glyphs are colored one by one
(`KINDS[kind].glyphColors`: `math`, `tex` and `text`) is skipped as well when it has such colors,
while the part colors of a brace or a shape do not protect it. Counts are per unique object. Hidden
tracks are eligible. All glyph, clip and animation overrides, tags, styles and timing survive.
Background selection is explicit and global; canonical color equality avoids no-op history.
`applyPaletteActions.ts` cancels transient gestures before preview, owns the document session and a
sticky project revision, and rechecks the actual post-cancellation draft inside one project update.
Stale confirmation produces a fresh preview without edits; a replaced document cancels the command.
Apply and its undo never mutate the palette library.

Apply palette gives each object the role that creation gives its kind, through the one pure
mapping `paletteRoleForKind` (`ui/colors/palette.ts`): `math` → `formula`, `tex` and `text` →
`text`, `brace` → `muted`, box and underline shapes → `rectangle`, circle → `circle`, cross and
cross line → `arrow`. It writes only `Formula.color` and, while the background stays selected (the
dialog's default), `meta.background`.

Match colors palette templates copy four hex values into ordinary empty-pattern entries. Their
IDs are checked against `projectIdEntries`, including every entity kind, and their names are made
unique. Creation is one undo step and focuses the first pattern; applying patterns stays explicit.
No format change, generated palette variable, live role binding or renderer dependency is added.
