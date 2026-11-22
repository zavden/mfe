# Architecture §11 (4 of 6): Formula templates, text composition

[Index](../ARCHITECTURE.md) · Previous: [§11 The look and some views](11c-ui-look-views.md) · Next:
[§11 Chroma Lab and editor palettes](11e-chroma-lab-palettes.md)

Holds §11's subsections *Formula templates* (placeholders, the library, the user's templates and the
synced folder, the Templates tab) and *Text composition workspace* (the editor of font texts and
LaTeX texts: its draft, paint and Apply).

See also: [Pango text and durable
appearance](04-formula-engine.md#pango-text-and-durable-appearance) ·
[Placeholder boxes](04-formula-engine.md#placeholder-boxes-a-font-text-nothing-has-shaped) ·
[Glyph index spaces](01-03-foundations.md#glyph-index-spaces) ·
[§2 Modules](01-03-foundations.md#2-modules)

---

### Formula templates

A template (`ui/creator/templates/`) is a LaTeX whose variable parts are **placeholders**: `#1`,
`#2`… in the text, each declared with a default value and, optionally, a label:
`{ id, name, category, description, level, latex, placeholders: [{ n, value, label? }], packages }`.
It exists so that a formula made from a template has its final LaTeX before its glyphs are first
made: changing the LaTeX afterwards would match its glyphs again (colours, pairs, hidden glyphs),
which is what a template with fixed text forced. A formula made from a template is an ordinary
formula: it does not remember its template, and the project format knows nothing of templates
(`createFormulaFromTemplate(template, name?)`, one undo step).

`placeholders.ts` holds the rules of the text, pure. A placeholder is `#` and a number from 1 on
(`#12` is number twelve; `\#` is LaTeX's hash to print). It is replaced as TeX replaces the
parameter of a macro: the braces are the template's (`x^{#2}` with `m+1` gives `x^{m+1}`). Where two
pieces meet, a space goes in when the join would change what they mean: a control word followed by a
letter, and a `{` followed by a `{` (ManimCE splits a `MathTex` on double braces, and that space is
its own advice); TeX ignores both in math mode, and a double brace the author wrote is left alone.
`placeholderIssues` says what is wrong between a text and its list (a number without a value and a
number declared twice are errors, a value the text does not use a warning), `placeholderRows` gives
a form one row per number of the text. The file `formula-templates/scripts/placeholders.py`, next to
the repo, states the same rules for the checks of the library: the two are kept in step by hand.

`library.ts` is the library that comes with the editor: `parseLibrary` refuses a template whose text
and list of placeholders disagree, and `templateLatex` is a template with its default values, which
is what a list draws, searches and shows as a tooltip. The 257 templates got their placeholders
without changing what they draw: `__tests__/fixtures/template-latex.json` is the LaTeX each one was,
and `defaultTemplates.test.ts` holds that the default values give it back, exactly, or with braces
added around a placeholder that is the argument of a script, which draw the same glyphs in the same
places. A new template adds its line to that file.

The user's own templates and the favourites among all templates are a preference of the editor, like
the palettes: not part of a project, not undoable. `userLibrary.ts` is the model, pure: the file
`{ format: "mfe-templates", version: 1, templates, favorites }` (the same in the browser's storage,
in the synced folder and in an export), where a template of the user has no level and carries when
it was last changed; `mergeLibraries` keeps every template of two libraries and, of one both have,
the one changed last (nothing records a deletion, so a template deleted in one place and still in
the other comes back); `planImport` and `applyImport` tell the new templates of a file from the ones
the library has with other content, which the user decides about (replace, keep both, keep the
library's); `readLibrary` leaves out the entries that are not templates and reads the rest, and
refuses a file of a later version. `userLibraryStore.ts` keeps it under the localStorage key
`mfe.templates.v1`: every change is made on what the storage holds at that moment, under the web
lock `mfe.templates.v1.write` where the browser has one, and written at once; a change the storage
does not take stays in the tab and is written with the next; a stored library that cannot be read is
set aside under `mfe.templates.v1.damaged`, never written over, and one of a later version is left
as it is. `watchTemplateLibrary`, started by `App`, follows what another tab writes.

With a synced folder that the browser keeps a handle of, the library is also the file
`templates/templates.json` of that folder (`templatesFolder.ts`): a sub-folder, because the project
library lists the folder one level deep. `startTemplatesFolder`, a service of `useAppServices`,
reads the file whenever the folder is listed (`pull`: the two copies are merged) and writes it with
every change of the library. The folder is synced for reading, so the first write asks the browser
for more (`ensureFolderWritable`, from the user's gesture); told no, the templates stay in the
browser. Its state says which: `none`, `synced`, `pending` (the folder's copy is behind and nobody
was asked yet), `denied`, `failed`. A file that cannot be read as a library is never written over,
and no file is made for an empty library. Nor is the file ever written with less than it holds: when
it has entries that are not templates here (`readLibrary` skips them), its other templates are taken
in and the file is left as it is; when the two copies together are more than a library holds
(`overLimit` of `mergeLibraries`, which drops nothing itself), neither copy is changed. Both are
`failed`, with a message that says what to do, until the folder is listed again. `templateFiles.ts`
is Export (a download of the library, or of chosen templates with their stars) and Import.

The tab itself (`TemplatesTab`) is four entries that open pop-ups; what is open — the list, and over
it the dialog of a template's values or the form — and the search of each list live in the store
`templatesUi.ts`. `templateList.ts`, pure, gives the items of a list (the editor's templates, the
user's, or the favourites among both) and their sections by category. `TemplateBrowser` is the
pop-up of a list, `UseTemplateDialog` asks for the values of a template's placeholders and draws the
formula they make, `TemplateForm` writes or changes a template of the user, and
`TemplatesStorageNote` says where the user's templates are kept. A thumbnail is of a LaTeX and its
packages, not of a template (`thumbs.ts`): rendered by MathJax once per session, one render per task
and only for cards near the view, so that scrolling stays smooth; a card (`TemplateThumb`) tells
what it shows by that same key, so a template whose packages alone were edited is drawn again;
`useLiveThumb` draws a formula
that changes as it is typed, once it has rested. The pop-ups are drawn in `#template-dialogs`, a
layer of the document's body put before the app: the Creator's panel is a size container, which in
some browsers holds what is fixed inside it, and a question the app asks (`DialogHost`) must come
over the pop-up that asked it. The two editors of a template (`UseTemplateDialog`, `TemplateForm`)
are resizable modals drawn 30 % larger than the app's size: the scale (`zoom`) is on the bar, the
body and the foot, not on the dialog, whose width and height stay in the pixels its resizing counts
in; resized or maximized, the drawing of the formula takes the room gained.

A browser without the File System Access API works on copies of the user's files, and nothing in the
interface tells: `ui/project/fileAccess.ts` says it once per session (a mark in sessionStorage),
when the app starts, in a notice that stays until it is closed (`sticky`, a field any notice can
have). What it says depends on what the browser can do (`showOpenFilePicker`,
`showDirectoryPicker`), not on its name.

### Text composition workspace

`ui/text/TextCompositionEditor` mounts through the persistent Creator host outside responsive panel
branches. It is the editor of both kinds of text: a font text (`text`) and a LaTeX text (`tex`),
which `creator/formulaEditorStore.ts` sends there instead of mounting the formula editor. The
session's draft is of the kind of its object (`textCompositionModel.ts`: `FontTextDraft`,
`LatexTextDraft`, told apart by their `kind`), and each kind has its editor: the font text's in
`TextCompositionEditor.tsx`, the LaTeX text's in `LatexTextComposition.tsx`, around the parts they
share (`CompositionParts.tsx`: the dialog with Cancel and Apply and the keys of the workspace, the
stage wired to the session's placement, the session's buttons, the line that says why Apply is
refused, `RenderStatus` (the one line over the stage, of a fixed height, whose dot is the state of
the render: `data-state` idle, busy, ok or error; while the draft is rendered again its words stay)
and `SessionMessages` (a strip of a fixed height under the stage for what the renderer refused or
warns of and why Apply waits: nothing that comes and goes may move the stage; in a dialog the author
sized or maximized, `textComposition.css` lets the workspace fill it, the canvas fitted whole in the
room left by container units); `useSessionFacts.ts`: what the project says of a session). The
ordinary multiline field and its native Undo/IME state survive stage renders and layout changes.
`textPreview.ts` coalesces source requests for 150 ms (200 ms for a LaTeX text, whose render is a
compilation), with one active request and one replaceable pending request, and keeps what the
renderer said of a refused one (`failure`: a LaTeX error with its log). Placement and view changes
never reshape text. Only current geometry enables contour-based centering or snapping; source and
absolute placement remain drafts.

`textCompositionStore.ts` binds the document session, original owned source fields, selected clip
and explicit initial/keyframe state. Apply revalidates those fields and locks before one project
update. Source/style belong to the shared asset; the placement of a clip belongs only to its chosen
occurrence. A session without a clip — a new text, or one opened from the Creator — places no
occurrence: its stage opens where the object keeps its new clips (`Formula.startPosition`, the
centre when absent) and, while `keepPosition` is on («New clips start here», on whenever a session
opens; D124), Apply keeps the stage position there. A change of it alone is one undo step, touches
no clip and is not held by the locks of a font text's source; off, the object keeps the position it
had, and the line under the stage says which of the two it is (`libraryPlacementNote`). Library-only
creation does not create a track or clip. Independent-copy edits preserve clip IDs and
relation/attachment edges while cloning the shared source, snapshot and geometry reference.
Attachment semantics remain intact; free positioning requires an explicit detach first.

Where nothing shapes the draft, the stage draws its placeholder boxes
([§4](04-formula-engine.md#placeholder-boxes-a-font-text-nothing-has-shaped)), measured by this
browser, and they are current geometry for placement: the text can be composed, placed and applied
without a companion. The status says "Placeholder boxes" beside the "needs the companion" badge, a
line under it says why (and how to start the companion, or what the running one lacks:
`companionTextNote`), and "Refresh appearance" stays unavailable, boxes being no appearance to save.
A text the other library shaped keeps that shape on the stage, as in the preview. The font list is
the request that starts the companion's text worker: the editor asks for it when nothing has started
the worker and again when it is ready, never while it starts, and for a worker that failed to start
only when the author asks.

An Apply that changes nothing writes no history entry. A change of placement alone checks only the
selected occurrence: its track must be unlocked and its clip unattached. Locks on other uses of a
shared font text block only its source and typography changes (its uses share one saved appearance;
a LaTeX text is rendered again and is not locked by them). Empty text keeps a selectable box of at
least 0.2 × 0.35 scene units (`selectableTextBox`).

**A LaTeX text** is rendered in the workspace with the request the render sync builds for the
applied object (`renderRequestFor(formula, meta, prefer)`, the glyph-source preference included), so
the draft's render is the one the sync will ask for after Apply, by the same key. Its draft also
holds what the formula editor's header gave it: its name (refused while another object has it; a new
object or an independent copy takes the next free one), its tag and its intro, which Apply sets
through `applyFormulaIntro` (`creator/formulaActions.ts`: the rule that brings along the clips still
at the previous intro, as a step of a project update; `creator/ObjectFields.tsx` has the tag and
intro fields both editors show). A source that does not compile can be applied, as it can be in the
Creator's list.

**The paint of a draft** (`glyphPaint.ts`, pure; `useDraftPaint.ts` keeps it; the Glyphs view shows
it with the formula editor's `GlyphColors`, whose edits the workspace takes through `edits`). A
draft has no canonical glyphs, so the colours and hidden glyphs the author sets count by the glyphs
of the render of the draft (`PaintState.basis`). The state starts from the applied object as the
sync resolved it (`ResolvedFormula.canonToRender`, only when that render is the render of the object
as it stands) or, for an object without a snapshot, unpainted on the first render of the draft.
Every new render of the draft is reached with `matchRenderChange` (`engine/correspondence.ts`), the
correspondence the sync uses, which carries the paint and `origin`, where each canonical glyph of
the object's snapshot is now; a step it cannot verify lets the paint go (`paintLost`) and leaves the
object's colours to the sync. On Apply (`planPaintCommit`, inside the session's one project update,
only when the author edited the paint and it counts by the render of the draft as written,
`paintIsBehind`): a snapshot that is that very render, or an exact one MathJax would replace for a
new layout or size alone, stays, and the paint is written by its canonical glyphs (those the render
lacks keep what they had); otherwise the render of the draft becomes the snapshot, `remapGlyphRefs`
carries the references of the project through `origin` first, the transition is published for
whoever holds indices of the old snapshot, and what was dropped or matched with little confidence
becomes the object's sync warning. These are the sync's own rules
([§4](04-formula-engine.md#4-formula-engine)), applied in the step that writes the text, so the sync
finds a snapshot that is already the render it asks for. A paint the author did not touch is not
written: Apply commits the fields and the sync re-maps as for any edit.

The canvas uses the same scene camera, placement matrices and backing-store/client ratios as
Preview, with its own Fit/zoom/pan view and draft-only gestures. Grid, frame guides and centering
operate on transformed Pango contours. Native input Undo stays local; stage placement has bounded
local history; application-menu Undo/Redo first cancels composition. The source editor pauses
`mainPlayback`, including audio, and preserves the playhead without automatically resuming.

Save/Open/New/Export guards require Apply or Cancel followed by a fresh command. They never
implicitly commit draft text or defer a privileged file picker past user activation. A bounded
sessionStorage sidecar (`mfe.text-composition.v2`) offers recovery only for the same document and
matching source/placement basis, with the paint the author edited and the key of the render it
counts by (it returns when the recovered draft is rendered to that key); active IME strings are not
persisted as committed text. Replacement sessions invalidate old draft/render responses. Explicit
appearance refresh invalidates just that text cache entry; normal companion reconnection preserves
saved geometry. Refresh Apply requires verified current geometry, prepares its durable lease,
revalidates the draft and publishes source, placement, references, snapshot and artifact in one Undo
operation. Failed refresh retains the old appearance; canceling the refresh intent still permits
applying and saving authored source without new contours.
