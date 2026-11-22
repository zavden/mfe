# Architecture §13: The Slides mode and the exported page

[Index](../ARCHITECTURE.md) · Previous: [§12 The scene's camera](12-scene-camera.md)

Holds §13 *The Slides mode* (D200): the marks a project keeps — pauses and comments at instants of
the scene —, where one may stand, what is said of one that does not, what the editor asks when an
edit covers one, the mode in the editor (its ruler by zone, the marks on it, the rehearsal of the
pauses in the Preview) and the marks in the Python; and what the mode is for, the **exported page**
(Export ▸ HTML): the runtime that draws the scene as it plays, how the app carries it, the forms it
is exported in, its controls and its look, and what its folder tells an agent.

See also: [docs/FORMAT.md, Slides](../FORMAT.md#slides) ·
[Rules](05c-rules-blocks-events.md#rules-enforced-by-validateproject) ·
[§12 The locked region](12-scene-camera.md#the-locked-region)

---

## 13. The Slides mode

A scene made in the editor is meant to be shown, and a talk stops where the speaker says so. A
project whose **Slides mode** is on keeps **marks** in `Project.slides` (`Slides`, format 35): each
a **pause** or a **comment** at an instant of the scene (`SlideMark`: `time`, `kind` and an optional
`text`, the words of a comment or the note of a pause). The marks are for the exports that can stop
or carry words. Without the field the mode is off and nothing of this section applies; with it, the
scene, the preview and the video are still the ones of a project that never had it.

A mark belongs to no clip: it keeps its instant when clips move. That is the owner's choice for a
mode meant for the end of the work, and what makes the question of the next subsection — what
becomes of a mark when an edit changes what happens at its instant — one the model can answer for
any edit at all.

### Where the scene animates and where it rests

`model/slides.ts` cuts the scene in two kinds of stretch, from the model alone. An **animation
span** is a time in which something animates: every window of `animationWindows` (`model/camera.ts`:
the intros and the outros that are animations, every block, every relation) and every camera move,
merged where they overlap (`animationSpans`). Two that only touch stay two spans. A **pause zone**
is what the spans leave of `[0, sceneDuration]` (`pauseZones`), the tail in which only sound plays
included: one zone before the first span, one between each two and one after the last, so a zone has
no length where two spans touch, and at the start or the end of a scene that begins or ends with an
animation. Both lists are worked out once for a project object and kept for it (a project is a
value: an edit makes another).

A mark stands in a pause zone, **its edges included** (`zoneAt`, `markStanding`, within
`TIME_EPSILON`): just where an animation ends or starts is where a pause is wanted most, and the
instant between two animations that touch is the classic place of one. A pause at `t` shows the
scene as it is at `t` — what the Preview shows with the playhead there: an animation that ends at
`t` is seen ended, and what appears or goes at `t` without an animation has done so.

The zones are the waits of the exported Python read off the model, and a little wider on the side of
the animations: a block that changes nothing is a span here though the code only waits there, and
the clips of a hidden track count, since they are exported. The other way round cannot be: a pause
is never offered where the code plays. `nearestPauseTime` gives the instant nearest to a time at
which a mark may stand, `pauseZoneAt` the zone a mark can be dragged within, and `coverAt` what
animates at an instant — the animation that started first, or a camera move —, which `markCoverName`
(`model/validate.ts`) puts in a sentence.

### A mark out of place

An edit can leave a mark under an animation (`busy`) or past the end of the scene (`outside`). That
is no error of the project, which is whole without its marks: `slideMarkIssues`, a section of
`validateProject`, gives **warnings** — `slide-mark-busy`, naming what runs there, and
`slide-mark-outside` —, so no export is held back, and every export leaves such a mark out
(`exportedMarks`, which also keeps one pause of several at an instant; `exportedPauses` are the
stops of the exported page). A comment without words is `slide-mark-empty`, a second pause at an
instant `slide-mark-twice`. `coveredMarks` lists the marks out of place, in order, with why: what
the editor asks about after the edit that covered them.

`marksInOrder` is the order every reader of the marks uses: by instant, a comment before the pause
it shares one with — it is read before the scene stops —, then by id, so that the answer does not
depend on the order of the file. A mark's id has the kind `p` in the project's namespace
(`model/ids.ts`).

### The guard

An edit that covers a mark is asked about when it is made (`ui/slides/slideGuard.ts`,
`startSlideGuard`, one of the app's services). The editor writes the project from some eighty places
and nine kinds of drag; a check before each of them would be eighty chances to forget one. The guard
is **one check after**: it listens to the project and to the history, looks once the edit is a step
— when a drag ends, never while it runs (`history.isGesturing`), and once the writes of the command
that runs are made (a microtask), so that a command of several writes is one edit —, and compares
the project with the last one it left as it was. `newlyCoveredMarks` gives the marks that stood
there and are now out of place; a project without marks, an edit that reaches none and a mark that
was out of place already ask nothing.

The question (`coveredQuestion`) lists them — what each is, when, a comment's first words, and what
runs there now — and has two answers. **Delete them and keep the change** deletes them with
`history.continueStep`, so the edit and the deletion are one undo step: one undo brings back the
clip and its marks. **Take the change back**, also Escape, calls `history.retractStep` down to the
depth the history had before the edit (`history.depth`): the project is the very object from before
it and nothing is left to redo. The project is read again when the answer comes: a render that
finished meanwhile amended it.

Nothing is asked of another document (`projectLoads`), so a file edited by hand opens with its
warnings in sight and no question; nor of an undo or a redo: every state the history can return to
was looked at when it was made, and the guard remembers the project objects it has seen.

### The mode in the editor

`toggleSlides` (`ui/slides/slideActions.ts`; View ▸ Slides, and the toggle with a screen after Snap
in the timeline's toolbar) gives the project its `slides` field with no mark, or takes it away, as
one undo step. While a pause or a comment is there it changes nothing and a notice gives
`slidesOffBlocker`'s sentence, as the multicamera's does
(§12 [The Camera row](12-scene-camera.md#the-camera-row)): the menu item is not disabled, and the
toggle says why in its tooltip (`aria-disabled`, `is-held`). The mode has no key of its own: Alt+S,
the one that would say it, aligns to the bottom. The toggle is an icon, as the multicamera's in the
Preview: the toolbar's slider keeps its room, and the tools of Zen mode stay on one row. With the
mode off nothing of what follows is drawn, and the ruler has no menu.

`ui/slides/slideOps.ts` is the pure half of the commands, with unit tests: what a command works out
on a project before `slideActions.ts` writes it, and what the timeline draws — the words included,
so that the menus, the tooltips and the screen reader say the same thing.

### The ruler by zone

`rulerZones` lays the pause zones and the animation spans of the model one after the other, from 0
to the end of the scene; a pause zone of no length is a `notch`. `timeline/SlideMarks.tsx` draws
them in the ruler (`SlideZonesOnRuler`, the ruler's first child, under its ticks and numbers and
under the region), in `timeline/slidesTimeline.css`: a tint of `--slide-pause`, a blue-green, where
a pause may stand; a tint of `--slide-busy`, a red-orange, hatched with thin stripes of it, where
something animates — the hatch tells the two apart without their colours, and the two hues stay
apart in red-green colour blindness; a notch is a bar three pixels wide of the pause colour. The
two tokens are the theme's (`styles.css`, both themes), and the strength of the tints two properties
of the timeline (`--slide-tint`, `--slide-hatch`) that `themeContrast.test.ts` reads: the ruler's
numbers stay at 4.5:1 over the tints (4:1 over a stripe). Under forced colours a pause zone is a
bar of `Highlight` along the top of the ruler, an animation a hatch of `GrayText`.

The zones are worked out of the store's project, so they follow an edit as it is made — a clip
dragged moves them before it is let go — and they let every press through to the ruler.

### Marks on the ruler

`SlideMarksOnRuler` draws each mark in the upper part of the ruler, on its instant: a pause a tag
with «‖», a comment a hollow speech bubble with three dots, the point of either on the instant; the
foot of the ruler stays the playhead's, as with the region's marks. Marks that share an instant
stand side by side about it in the order of `marksInOrder` (`markSpread`). A mark the project warns
about (`markWarnings`: out of place, or another `slide-mark-*` warning) is drawn in `--warning`; a
pause that skips its wait in `--slide-skip`, its tag «‖▸» ([A pause that skips its
wait](#a-pause-that-skips-its-wait)), and the warning wins over it. `SlidePauseLines` runs a thin
dashed line down the tracks at each pause, beside the region's lines and under the playhead's. In
the vertical timeline the «‖» and the dots are turned back a quarter, upright on the screen. Each
mark is a button, named «Pause at 3.20 s» — and «(skips its wait: 0.50 s)» for such a pause — with
its words (`markLabel`) and described by its warnings; hovering it or reaching it with the keyboard
shows at once, in a tooltip rendered into the page's body beside the ruler (`SlideMarkTip`), what it
is and when, its words with their lines, and its warnings.

- **The ruler's menu** (`timeline/SlideMenus.tsx`, opened by `Timeline.tsx` while the mode is on):
  `rulerSpot` takes the time clicked on a frame and, while Snap is on, onto the playhead or an edge
  of a pause zone within the snapping distance — the edges kept exact, frames or not —, then holds
  it inside the zone; a click on an animation near enough to a notch reaches it. In a pause zone the
  menu adds a pause or a comment there; where something animates both entries are disabled, and a
  line (`ctx-note`, their description) says what runs then (`markCoverName`).
- **Adding** (`addPause`, `addComment`): `addRefusal` keeps a mark off an animation and off the time
  past the end, and a second pause off a frame that has one — that one takes the focus instead, and
  a notice says so. A comment's words are asked for first, in the prompt's field of several lines
  (`promptDialog({ multiline })`: Enter starts a new line, Ctrl/⌘+Enter gives the text, at most
  `MAX_MARK_WORDS` characters), and the project is asked again when they come. The new mark is
  written in the order of the marks (`withMarkAdded`) and takes the focus.
- **A mark's menu**: its words — «Edit comment…», or a pause's «Add a note…» / «Edit note…»
  (`wordsEntry`) —, for a pause **Skip the wait after it**, and Delete. `editMarkWords` writes them
  in the same dialog: a pause left without words loses its note; a comment is never kept without
  them (`commentWordsIssue`).
- **Dragging** (`timeline/slideMarkGestures.ts`): a press and a release without a drag put the
  playhead on the mark; a drag moves it through a gesture of the history (one undo step; Escape
  cancels), the time read along the screen's axis of time (`axis.ts`). `markMoveTime` keeps it on
  frames, snapped as a new mark is (Shift suspends it), inside the zone it stood in when the drag
  began; a mark out of place goes to `nearestPauseTime`, in any zone. A pause never lands on the
  frame of another: it waits where it was. The tooltip follows the mark meanwhile.
- **Keys** (the mark's own, taken before the timeline's and the playback's): ←/→ — ↑/↓ drawn
  vertical, through `arrowOf` — move it a frame (`markStep`: the next frame on that side, inside its
  zone; a mark out of place to the edge of what covers it on that side), a step each, the focus kept
  on it; at an edge a screen reader is told what is next. Delete or Backspace delete it, the focus
  going on to the mark after it; Enter writes its words; the Menu key or Shift+F10 open its menu.
  P and Shift+P (`shortcuts.ts`, and their entries of the View menu) add a pause or a comment at the
  playhead, held in the pause zone it is in; only while the mode is on, so that the keys are
  nobody's while it is off, and never from a field.
- **A pause after every animation** (`addPausesAfterAnimations`; View ▸ Add a pause after every
  animation, and the ruler's menu wherever it is opened) is for a long scene: every place a talk
  could stop at once, for its owner to delete the ones not wanted — the owner's request. It adds a
  pause at the start of each rest between two animations (`restsBetweenAnimations`: the pause zones
  that have an animation before and another after, one of no length where the two touch; not the
  start of the scene, where nothing has happened, nor what follows its last animation, where it only
  ends), the edge kept exact as a snapped mark's is. A rest that holds a pause already, anywhere in
  it, gets none, nor does a frame that has one (`pausesAfterAnimations`), so the command can be run
  again after more work on the scene. One undo step for them all; a notice says how many, or why
  none; the first one added takes the focus, and Delete walks on from it.
- **Every pause deleted** (`deleteEveryPause`; View ▸ Delete every pause…, greyed out while the
  project has none, and the ruler's menu) is the way back from the command before, the owner's
  request too: every pause goes, its note and whether it skips its wait with it, and the comments
  stay (`withoutPauses`). It asks first (D204: the owner's word, after trying it): a question that
  says how many pauses go and how many comments stay (`deleteEveryPauseQuestion`), with the button
  of a deletion, held down (`confirmDelete`); what is deleted is the pauses the project has when it
  is answered, and nothing if the document is another by then. One undo step: Undo brings them back,
  and the notice says so, with how many comments stay. The focus goes to the first comment left, or
  to the mode's button in the timeline's toolbar when none is.

None of these writes covers a mark — a mark is only ever put or moved where one may stand —, so
the guard has nothing to ask of them: an edit that covers one is its business
(§13 [The guard](#the-guard)).

### The rehearsal

«Stop at pauses» in the transport (`timelineStore.stopAtPauses`; shown only to a project with the
Slides mode on) makes the Preview stop at each pause as the exported page does. The stops are the
page's own (`stopsOf`, `model/slides.ts`, of `exportedPauses`), read afresh on every frame
(`rehearsedStops`, `transport/mainPlayback.ts`); the playback controller stops at the first one it
reaches since the last frame, exactly (`stopReached`, `transport/playback.ts`), and so does the
clock of a scene with sound, which is the audio device's: the playhead stays on the pause, not
where the device had got to by the frame that saw it (`standAt`), or the next Play would find no
pause there whose wait to skip. It is a way of playing, not part of the project: nothing of it is
saved.

### A pause that skips its wait

A scene made for a video has rests between its animations — the breath between two steps —, and a
talk that stops at a pause has no use for the rest that follows it: the speaker has just waited. So
a pause can **skip its wait** (`SlideMark.skipWait`, format 36, D202; the owner asked for «pausas
instantáneas» and chose the name): when the exported page, or the rehearsal of the Preview, goes on
from it, the scene jumps to where the next animation starts. `skippedWait(project, mark)`
(`model/slides.ts`, pure) is the stretch jumped over, the same for both: from the pause's instant to
the end of the rest it stands in, or to the next pause of that rest when one comes first, where the
scene stops again. It is null — nothing is skipped — for a pause that keeps its wait, for a comment,
for a mark out of place, where the animation starts at the pause's own instant, and in the rest
after the last animation, which nothing follows but the end of the scene and which may hold the tail
of its sound.

The jump happens **only where the scene really stopped**: played through its pauses (the page's
switch, `data-pauses="off"`, the Preview without «Stop at pauses») the scene keeps its rests, and so
do the Python — whose `# PAUSE` line says that the page skips the wait — and every video. The
timeline is not edited: the field is a way of presenting, set and cleared pause by pause or for all
of them at once, and the scene's time, its length and what an instant shows are the same with it and
without it.

**In the editor.** `ui/slides/slideOps.ts` asks the rule as `waitToSkip`, the `skippedWait` of a
pause as if it skipped — whether it has a wait to skip —, and `noWaitReason` says in a sentence
which case of the rule gives none: out of place, after the last animation, or an animation that
starts at its instant. A pause's menu has **Skip the wait after it**, a `menuitemcheckbox` (the
`checked` of `MenuItem`), greyed out with that sentence under it where there is nothing to skip, but
free to clear a pause that skips with nothing to skip, as an edit can leave one (`setSkipWait`).
**Skip the wait at every pause** sets the field on the pauses that have a wait to skip only
(`skipEveryWait`) and counts the others in its notice; **Keep the wait at every pause** clears it
from every pause that has it (`keepEveryWait`). Each is one undo step, in the View menu and in the
ruler's, greyed out while the scene has no pause, as **Delete every pause…** is (D204; the mode
being off is one way of having none), and with no key of its own. No command writes
`skipWait: false`: the field goes. The other writes of a mark — a move, a drag, its words, the
guard — keep it.

**On the ruler.** Such a pause is drawn in `--slide-skip`, a violet of each theme — the one the
exported page draws its skipped waits in —, which `themeContrast.test.ts` holds to the rules of the
ruler's other two colours (3:1 on the bar and over the pause tint, its «‖▸» 3:1 on it, its words
4.5:1 on the panel) and to a hue apart from the warning, the accent and the busy colour. Its line
down the tracks is violet too, and its name and its tooltip say how long it skips («skips its wait:
0.50 s», `skipWords`), or that it skips nothing there and why. `SlideSkipsOnRuler`
(`timeline/SlideMarks.tsx`) draws, for each pause with a `skippedWait`, a line of two pixels along
the ruler under its numbers and over its small ticks, from the pause to where the scene goes on,
ended by an arrow's point (`slide-skip-span`). It is worked out of the store's project, so it
follows an edit as it is made, a drag included, and lets every press through. Under forced colours
the mark, its line and the stretch take `LinkText`, a colour of their own beside the text's of the
other marks and the selection's of a warned one.

**In the rehearsal.** `rehearsedSkips` (`transport/mainPlayback.ts`) are the `skippedWait` of the
pauses the page stops at, while «Stop at pauses» is on, worked out once for a project. When playing
starts, `skipFrom` (`transport/playback.ts`) takes a playhead that stands at the start of one to its
end and plays from there — or leaves it standing there, not playing, when that end is a stop: the
next pause of the rest. The visual clock does it when a run starts (`PlaybackState.skips`); a scene
with sound does it before the audio device starts (`mainPlayback.play`), so that the sound starts
there too. A pause at 0 s is no stop, but the playhead stands at it before the first Play: one that
skips its wait is skipped then.

**In the exports.** The `# PAUSE` line of such a pause ends with
`, the exported page skips the 0.50 s wait after it` before its note (`markLines`, the length of
`skippedWait`), and its `self.wait` is the same; the export-check case `slide-marks` has one
([§8](08a-export-python.md#the-marks-of-the-slides-mode)). The «Slides» line of Export ▸ HTML's
dialog says how many of the pauses skip their wait (`marksSummary`).

### The marks in the Python

The exported Python carries every mark an export carries as a comment at its instant in
`construct` — `# NOTE` for a comment, `# PAUSE n of N` for a pause —, splitting the wait it falls
in, after what appears or goes at its instant and before what starts there:
[§8, The marks of the Slides mode](08a-export-python.md#the-marks-of-the-slides-mode).

«Render with Manim» generates its Python from a project without the field (`exportProject`,
`ui/export/videoExportModel.ts`): nobody reads that script, and a note about a mark out of place —
one in a tail of sound alone is past the end of a render that covers the visual length — says
nothing about the video.

### The exported page

Export ▸ HTML writes the scene as a page that **is the animation**: drawn as it plays by the app's
own evaluator, not a video of it. That is what lets its owner — or an agent — go on working on it:
the scene is data that can be edited, and the picture is elements that can be reached. The code that
runs in the page is `app/src/deck/` (the *runtime*; entry `main.ts`, which sets `window.MFE`), built
on the engine of the documentation's player (`embed/engine.ts`: `makeScene`, the evaluator, the
canvas renderer). It holds no MathJax: a formula travels as the outlines the editor drew.

**The two files of a scene.** `scene.js` is the project (format 35) and calls `MFE.scene(name,
project, assets)`; `glyphs.js` is the outline of every glyph of every formula, one glyph a line of
SVG path data, and calls `MFE.glyphs(name, data)` (`deck/glyphFile.ts`, `pathData.ts`: `M`, `C`,
`Z`, absolute, y down, each number to a ten-thousandth of a unit). They are scripts, not JSON,
loaded by plain `<script src>` in order: a page opened from `file://` may not `fetch` a file beside
it nor load a module. `buildDeckScene` (`deck/sceneFile.ts`) reads the project with the editor's
schema and checks it with `validateProject`, so a mistake in a scene file edited by hand is said in
the editor's own words, with where (`clips[2].intro.kind`); each formula's entry of the glyph file
says what its outlines were made of (`made`, the list of `makeup` of the player's engine), so a
scene that changed a formula's source is told so by name instead of being drawn with the old
outlines as if nothing had happened, and a formula without outlines is not drawn. A line or an arrow
has no outlines: the page builds it from its fields (`embed/lines.ts`). Problems are shown in a
panel over the stage (`.mfe-problems`) and in the console; what can be drawn is drawn.

**The stage** (`deck/svgStage.ts`) is SVG: a group per clip, named by `data-clip` (`names.ts`: the
formula's name as an identifier, then `_2`, `_3` in the order the clips start — the names the
exported Python gives its variables), a `<path class="mfe-glyph" data-glyph="n">` per glyph, a group
per transfer for the glyphs in flight (`.mfe-flight`, `data-from`, `data-to`), a group for what an
emphasis draws for a moment (`.mfe-effects`), and two free layers (`.mfe-below`, `.mfe-above`). The
division of the work is the contract: the attributes of the paths are the stage's, written again
every frame (only what changed: the evaluator hands the same list of contours for a glyph that did
not move); the groups are their reader's, for a class, a transform, a CSS animation. No element has
an `id`: two scenes share a page. The units are the scene's with y down, as every SVG has it, so
what a page adds to a layer is upright.

The groups are made once, in the order the canvas paints in — by depth, and at one depth the clips'
own glyphs, then the pieces of each transfer, then the effects —, so the order of the document is
the order of the canvas by construction. `Drawable.transfer`, the key of the transfer a piece in
flight belongs to, is what tells those pieces from a clip's own glyphs (the evaluator sets it; the
canvas does not read it). `deck/__tests__/svgStage.test.ts` holds the stage to the canvas's order on
every example of the repository, forwards and backwards, and `e2e/deckParity.spec.ts` compares the
two pictures pixel by pixel in a browser (a mean difference of 0.007 of 255 on five examples). A
page can ask for the canvas instead (`data-renderer="canvas"`): the app's own renderer, kept as the
way out for a scene too heavy for a browser's SVG.

**The deck** (`deck/deck.ts`, `createDeck`) is a scene mounted in an element, and the object a
page's own code extends it through: `play`, `pause`, `seek`, `next`, `previous`;
`on('time' | 'play' | 'pause' | 'slide' | 'end' | 'change')`; `animate({ from, to, ease, update })`,
an animation of the page's as a function of the scene's time — its `update` runs on every frame
drawn, playing or not, with the eased fraction, so it is right after a jump too —; `clip`,
`flights`, `layer`, and `box` / `glyphBox`, where a clip or a glyph is, in the stage's units (a
clip's name the scene does not have is said in the console once, with the names it has); `atPause`,
the index of the pause it stands at (not playing, at its time), else null. A listener hears what
happens after it is added, nothing of where the deck stands then. Its clock (`deck/slideClock.ts`,
pure) is the scene's time with the pauses of the Slides mode: the *stops* are the pauses that stand,
strictly inside the scene (`stopsOf`, the model's: the editor's rehearsal stops at them too), and
playing stops at the first one it reaches, exactly, until told to go
on. Each pause says where the scene goes on from it (`DeckPause.resume`: its own time, or the end of
`skippedWait`). Standing at a pause that skips its wait with its pauses in force (not `through`),
every way of going on — `play`, `toggle`, `next`, the keys, a click on the stage, the bar — first
puts the time at the end of the wait, the sound with it, then plays (`playStart`); when that end is
the next pause the deck stands there at once, a `play` and a `pause` as if it had played to it.
Played through, nothing is skipped, and a seek into the wait shows that instant: the scene's time
and length are the same with the field and without it. What an animation of the page (`animate`)
does over the wait is not seen when presenting, which its comment says. Options come from the
element's `data-` attributes, from the address when the page is the scene's own (`data-page`) and
from `MFE.mount` (`options.ts`). The sound, when the scene has one, is an `<audio>` that follows the
clock. Its bar, its keys and its notes are built on that same object
([The controls and the look of the exported page](#the-controls-and-the-look-of-the-exported-page)).
`registry.ts` keeps the scenes a page loaded and the decks it mounted, mounts every `.mfe-deck` once
the page's scripts have run, and reads the scenes a page carries inside itself (the single-file
form).

### How the runtime reaches the app

The app has to carry the runtime as text to write it out. `build/deckRuntime.ts` is a Vite plugin
that gives the module `virtual:mfe-deck-runtime` — `runtime`, `licenses`, `css`, and the type files
of the folder, `mfeTypes` and `sceneTypes` ([below](#what-the-exported-folder-tells-an-agent)) — by
building `src/deck/main.ts` when the module is asked for: one classic script (an IIFE, minified, no
code splitting), a build inside the build that takes a twentieth of a second. So the runtime the app
exports is always the one its sources make, in the dev server, in a build and under the test runner
alike; no built file is kept in the repository and none can go stale. The stylesheet
(`src/deck/player.css`) comes through the same module, since the test runner reads a stylesheet
import as nothing. Only the packages of `ALLOWED_PACKAGES` may be inside the runtime (zod: the
schema), its licences are those of what it holds (`runtimeComponents`), and it runs without a
document, where it only sets `MFE`: what a check of a scene file in Node needs
(`build/__tests__/deckRuntime.test.ts`). The documentation's player stays a bundle of its own
(`docs/web/assets/player.js`, by its own tool).

### The forms of the export

`export/html/` is pure. `packDeck` gives the files of the folder as text — the page, the scene
(`readableJson.ts` writes the project so that what fits on a line stays on one: short lines, a
fraction of the size), the outlines, `custom.js`, the stylesheet, the engine with its licences, and
what tells the folder to its reader ([below](#what-the-exported-folder-tells-an-agent)) —;
`exportHtml.ts` gives the forms: the **folder** as bytes, with the scene's sound beside it
(`audio.m4a`, or `audio.wav` where the browser does not encode AAC); the same folder as a **zip**
(`storeZip.ts`, stored without compression: the files are small text) for a browser that cannot
write a folder; and the page as **one file** (`singleFile.ts`): its look in a `<style>`, the scene
and the outlines as blocks of JSON the runtime reads when it runs, its sound as a `data:` address,
the folder’s guide in a comment at the head of its body, and the runtime last. The guide is there as
it is written: a block of `<script>` could not hold it, since it shows the `<script>` tags that
embed a scene, while the HTML syntax lets a comment hold `--`, so only what would end the comment is
written with an entity (`inComment`); the comment says which part of the page each file of the
folder is. `sceneForPage` gives the page only the marks of the Slides mode that stand where they
may: one out of place is left out where the dialog says so, not warned of every time the page is
opened.

The dialog (`ui/export/HtmlExportDialog.tsx`, `htmlExportRun.ts`) has no size, frame rate or encoder
to choose: the page is drawn as it plays. Where the browser lets a folder be chosen
(`showDirectoryPicker`), the scene is written as a folder of its name inside the one chosen, and
**written again over it, it keeps `custom.js`, `player.css` and `index.html` as they are when they
exist** (`KEPT_FILES`, `writeExportFolder`): what its owner or an agent added survives the scene
going back to the editor. The sound is the whole scene mixed as the Preview plays it
(`mixPageSound`, on `export/audio`), and `scene.js` names its file in the last argument of its call
with the SHA-256 of its bytes — `{ "audio": "audio.m4a", "sha256": "…" }` (`sceneFile`; the page
reads the name alone, `SceneAssets`). The record is for the next export over the folder: before it
writes, `writeExportFolder` reads what the `scene.js` that is there says of its sound
(`recordedSound`), and once it has written it removes the `audio.m4a` or `audio.wav` that it did not
write itself, when that is the file the record names and its bytes are the ones recorded
(`clearEarlierSound`, `hashBlob`). A scene exported again without its sound, or from a browser that
writes the other kind of file, would otherwise leave in the folder a recording its page no longer
plays, to go with the folder to whoever gets it. Any other sound file may be its owner's: it stays
(`FolderWritten.left`), and the notice, a warning then, names it.

### The controls and the look of the exported page

A deck of an exported page (`deck/deck.ts`, Export ▸ HTML) gets its bar, its keys, its notes, full
screen and a blackout from `attachControls` (`deck/controls.ts`), which `createDeck` calls unless
`options.controls` is `none`. They are built on the deck's public object alone, as a page's own
controls would be, and redrawn from it on its `change` event; what `attachControls` returns takes
all of it away, the attributes it wrote and the listeners it added to the document included (the
deck's `destroy` calls it). The parts are modules of their own: `timeline.ts` (the slider),
`keys.ts` (which command a key is, pure), `notes.ts` (`notesAt`, pure, and the region),
`fullscreen.ts` and `icons.ts` (inline SVG built as elements, so a page under Trusted Types shows
them). None imports the documentation's player (`embed/player.ts`) or anything of `ui/`.

**What they build.** After the deck's `.mfe-screen` (which holds the `.mfe-stage`) comes the bar,
`.mfe-bar` (`role="group"`): the buttons `.mfe-previous`, `.mfe-play` (play, pause, and play again
at the end), `.mfe-next`, the timeline `.mfe-timeline`, the slide count `.mfe-slide-count` ("2 / 3",
hidden with no pauses), the time `.mfe-time`, and the toggles `.mfe-through` (play through the
pauses, `deck.through`; hidden with no pauses), `.mfe-mute` (only when `deck.hasSound`),
`.mfe-notes-button` (hidden when the scene has no words for the notes; none with the `notes` option
off) and `.mfe-fullscreen` (only where the page may go full screen). Every button is a
`<button class="mfe-button …">` with a name; a toggle says whether it is on in `aria-pressed`, one
that can do nothing now has `aria-disabled="true"` (never `disabled`, which would drop the focus and
with it the deck's keys). The timeline is a slider (`aria-valuemin`, `-max`, `-now` in seconds,
`aria-valuetext` with the slide) holding `.mfe-timeline-track` with `.mfe-timeline-played`, a
`.mfe-pause-mark` per pause inside the scene (at `--mfe-at`, 0…1, its note in its tooltip) and
`.mfe-timeline-thumb`; the playhead is its `--mfe-progress`. The notch of a pause that skips its
wait has `data-skip-wait`, the colour `--mfe-skip-wait` and a title that says to where («Pause 1 ·
1.50 s · skips its wait to 2.00 s»), and the wait it jumps over is a `.mfe-timeline-skip` in the
track, from `--mfe-at` to `--mfe-to`: dashes over the groove and over the played part, which shows
between them — a stretch the presenter will not see, told by its shape as well as its colour (in
forced colours, dashes of `CanvasText`). Standing at such a pause the slider's value text ends with
«at a pause that skips its wait», and the label of its note in the notes with «skips its wait». A
press seeks (on a notch, to the pause exactly), a drag scrubs and playback goes on after it if it
was playing (from the end of the wait, after a press on the notch of a pause that skips it: the deck
stands at that pause when it goes on); with the focus its arrows step a frame (a second with Shift),
Home and End go to the ends. The press is the main button's and not a Mac's click with Ctrl, which
is the secondary click there and opens the browser's menu: the bar asks `isMainPress`
(`embed/press.ts`), as the scrub bar and the strip of the documentation's player do. After the bar
come the notes, `.mfe-notes` (a region, hidden), and `.mfe-live`, a polite status that says the
slide when the deck comes to stand at a pause; over the stage, inside the screen, `.mfe-blackout`.
`data-controls="minimal"` builds the play button and the timeline alone; the keys and the notes are
there all the same. `data-notes="off"` (the `notes` option) builds no notes and no button, and
leaves S to the page: the notes show the author's comments, tasks for whoever works on the scene, to
any reader. A click on the stage plays or pauses, unless a handler of the page called
`preventDefault` (an agent's clickable layer).

The deck's element says what the controls show, for the stylesheet and for a page's own rules:
`data-mfe-controls` (`full`, `minimal`), `data-mfe-notes` (open), `data-mfe-blackout`,
`data-mfe-fullscreen`, and `data-mfe-idle` (full screen, and the pointer has rested `IDLE_DELAY`,
2.5 s, out of the bar and with no focus in it: the bar and the pointer hide). The deck itself writes
`data-mfe-state` (`playing`, `paused`, `ended`). The element gets `tabindex="-1"` when it has none,
so that a press anywhere in it (the stage, the bar's words) gives it the focus its keys follow; it
is no stop of the Tab key.

**The keys** are the ones PowerPoint and reveal.js share, and what a presenter's remote sends (a
Logitech R400, R700 or R800 sends PageDown, PageUp and `.`):

| Keys | Command |
|---|---|
| → ↓ Space PageDown N Enter | go on: `deck.next()` (to the next pause; while playing, there at once) |
| ← ↑ PageUp P Backspace, Shift+Space | back: `deck.previous()` |
| Home, End | the start, the end (`deck.seek`) |
| K | play or pause |
| F | full screen (the deck's element) |
| S | the notes (nothing with the `notes` option off) |
| B or `.` | black the stage out, and back |
| M | the sound, when the scene has one |

Where they are heard is the deck's `keys` option: `page` (the scene's own page, whose deck has
`data-page`) listens on the document but leaves a key whose target is inside another deck to that
deck; `focus` (an embedded deck) listens on the deck's element, so they are heard only while the
focus is inside it and Space and the arrows stay the host page's; `none` hears nothing. A key is
never taken with Ctrl, ⌘ or Alt held, while composing, in a field (an input, a text area, a select,
an editable element), as Space or Enter on a button or a link (they press it), as an arrow, Home,
End, PageUp, PageDown or Space on a widget of the page that moves with them (a slider, a list, a
menu, a tab list, a media element with controls); nor are Tab, Escape or the function keys taken
(the R400's F5 still reloads). The deck's own timeline is no such widget: it takes its arrows, Home
and End itself and leaves PageDown, PageUp and Space to the deck, which a presenter's remote means.
A switch held down switches once. While the stage is black, the first key that goes anywhere (or a
click on the stage) brings the scene back where it stood and does nothing else. Every command runs
inside the key's own event, so the first key press is the gesture a browser asks for before sound
plays or a page goes full screen.

**The notes** (`notesAt`) are the comments on the slide the deck is on and the note of the last
pause at or before its time, in the order of their instants (a comment before the pause it shares an
instant with), with the slide in a heading. They are for whoever presents, and hidden until S or
their button opens them; a page for readers turns them off (`data-notes="off"`).

**Full screen** uses the standard API, Safari's prefixed `webkitRequestFullscreen` where the
standard is missing, and nothing where neither exists (an iPhone) or the page may not
(`fullscreenEnabled` false, as in a frame without `allow="fullscreen"`): then there is no button and
F is not taken. Taking the controls away ends it.

**The look** is `player.css`, plain CSS that is the user's to change; the app carries it as text
(`build/deckRuntime.ts`). Every rule is under `.mfe-deck` (or `.mfe-page`) and at most two classes
deep, whatever more it needs being inside `:where()`, so a host page's rule of the same two classes
written after it wins; it has no id, no `!important`, no `@import` and nothing loaded from
elsewhere, and no Shadow DOM (it would get in the way of whoever restyles). Its public surface is
custom properties on `.mfe-deck`, a dark set by default and a light one under `data-theme="light"`
on the deck, or under a system set to light when the deck has no `data-theme` and is not the scene's
own page (which stays dark unless its deck says otherwise):

| Property | Dark | Light | What it is |
|---|---|---|---|
| `--mfe-accent` | `#43eeca` | `#087568` | the played part, the thumb, a toggle that is on |
| `--mfe-bar-background` | `#121619` | `#f2f5f6` | the bar |
| `--mfe-bar-text` | `#d5dee2` | `#1d2b31` | its icons, the slide count |
| `--mfe-bar-text-muted` | `#93a3ab` | `#56676f` | the time |
| `--mfe-pause-mark` | `#f4c867` | `#a86a00` | a pause's notch, and its label in the notes |
| `--mfe-skip-wait` | `#b69cff` | `#7048e8` | a pause that skips its wait: notch, dashes, label |
| `--mfe-timeline-track` | `rgb(255 255 255 / 22%)` | `rgb(0 0 0 / 18%)` | the timeline's groove |
| `--mfe-focus-ring` | `#8cc8ff` | `#2a5ba8` | the ring of the keyboard's focus |
| `--mfe-notes-background` | `#171c20` | `#ffffff` | the notes |
| `--mfe-notes-text` | `#e4ebee` | `#1d2b31` | their words |
| `--mfe-notes-text-muted` | `#93a3ab` | `#56676f` | their heading and labels |
| `--mfe-bar-height` | `40px` | | the bar's height |
| `--mfe-radius` | `6px` | | the corners of the buttons |
| `--mfe-font` | `system-ui, …` | | the controls' font (no font is loaded) |
| `--mfe-notes-height` | `140px` | | how tall the notes grow (on the scene's own page, are) |
| `--mfe-fullscreen-background` | `#000` | | around the stage in full screen |
| `--mfe-blackout-background` | `#000` | | the stage blacked out |
| `--mfe-stage-background` | `var(--mfe-scene-background, #000)` | | behind the scene |
| `--mfe-page-background` (on `.mfe-page`) | `#0b0d0f` | | the scene's own page |

The runtime writes `--mfe-aspect` and `--mfe-scene-background` on the deck's element (`deck.ts`;
`transparent` with `data-background="transparent"`, so the host page shows through), and
`--mfe-progress`, `--mfe-at` and `--mfe-to` on the timeline and its parts. The bar fits the deck's
width by container queries on the deck (`container: mfe-deck`), not by media queries, the least
needed going first: the time under 560 px, the through toggle and the slide count under 460 px, the
notes button under 400 px; at 320 px previous, play, next, the timeline, the sound and full screen
are left. In a page that styles every element of a kind (`* { margin }`, `button { padding; font }`,
`svg { width; height: auto }`, `div { line-height }`), each class resets what its control needs and
no more, and the icons' shapes are painted by class, so a page's rule for `path` does not reach
them. In forced colours the scene keeps its own colours (`forced-color-adjust: none` on the screen:
it is a picture), the controls take the system's, and a toggle that is on has a line under its icon
besides its colour. Every transition stops under `prefers-reduced-motion`. In full screen the deck's
element is a black box with the stage as large as it fits, the bar over its foot and the notes over
the stage.

**The scene's own page** (`index.html`, `<body class="mfe-page">`, written by `indexFile`) has no
margin and a dark backdrop, and its deck is centred and as large as the window allows in the scene's
shape with what the page holds under the stage in sight: its width is
`min(100vw, (100dvh − chrome) × --mfe-aspect)`, the chrome being the bar's height when there is a
bar (`data-mfe-controls`) and the notes' too when they are open. So `?controls=none` gives the stage
the whole window.

`deck/__tests__/contract.test.ts` pins the contract: every class and custom property above is in the
stylesheet and named in its head, the controls build every class and none it leaves out, the light
set is one set either way it applies, and every rule keeps to the limits above. The specs of
`e2e/deckControls.spec.ts` open an exported page from disk and embed it: two decks in a page with
hostile rules, the page in a frame, a host's accent, a transparent stage, a deck 320 px wide, real
full screen, the notes off, and the guide's controls that appear on hover.

### What the exported folder tells an agent

Export ▸ HTML writes a folder meant to be handed to a coding agent that has never seen the editor
and must extend the animation from the folder alone (the owner: «bien formateado por si el usuario
quiere potenciar esas animaciones con un agente», «fácil de embeber y cambiar estilos»). Besides the
page, the scene, the outlines, `custom.js`, the stylesheet and the engine, `packDeck`
(`export/html/packDeck.ts`) writes what makes it legible, each made from a source of the app so that
it cannot say what the page does not do:

| In the folder | Made by | From | Kept true by |
|---|---|---|---|
| The head comment of `scene.js` | `export/html/timelineWords.ts` | the project: `clipNames`, `animationWindows`, the camera's moves, `exportedMarks`, the snapshots' labels | `timelineWords.test.ts`: five examples pinned, read |
| `AGENTS.md`, `CLAUDE.md`, `README.md` | `agentGuide.ts`, `guideExamples.ts` | the model's catalogue and schema, `deck/options.ts`, the folder's `player.css`, the scene | `agentGuide.test.ts` |
| `types/mfe.d.ts`, `types/scene.d.ts` | `build/deckTypes.ts`, in the runtime's plugin | `deck/index.ts` and what it uses; `model/types.ts` | `build/__tests__/deckTypes.test.ts` |
| `check.mjs` | `checkScript.ts` | `MFE.check()` of the runtime | `checkScript.test.ts`, run by Node |
| `embed-example.html` | `embedExample.ts` | — | `embedExample.test.ts` |

**The timeline in words** opens `scene.js`: the clips by the names the page gives them with their
place in the file (`eq1  clips[0]`), the glyphs of each formula by index, and one line per thing
that happens — an intro, an outro, a block, a relation, a move of the camera, a clip that appears or
goes at once, a pause, a comment —, each with its time and where it is in the file
(`clips[1].actions[0]`). At one instant it keeps the order of the Python: what appears or goes at
once, then the marks, then what starts there. It is written at the export and says so: it does not
follow an edit. It says too that its times are the scene's, while in the data a block's `start`
counts from its clip's start and a relation's `offset` from its target clip's. A pause that skips
its wait says where the page goes on from it (`PAUSE 1 (skips its wait to 2.00 s)`), and so does its
line in the first section of `AGENTS.md`, whose pitfalls say what the jump does to an animation of
the page: what it draws over the wait is not seen when presenting.

**`AGENTS.md`** opens with the author's comments of the Slides mode as tasks, each with its instant,
what ended before it, what starts after it and what is on screen — a clip on screen with none of its
glyphs drawn then is said so (`clipsDrawnAt`, from the model's lifetimes), and so is a clip the
comment's words name that is not on screen then (`namesIn`) —, and the notes of the pauses as
context, then what to do with a comment once its task is done and where to make a change (a new
export writes `scene.js` again; `custom.js`, `player.css` and `index.html` stay); then the files,
how to look and check, the two ways to extend (the data of `scene.js`, code in `custom.js` through
`window.MFE`), the stage's contract and its coordinates — `scene.js` is Manim's, y up; the stage and
`deck.box` are SVG, y down, said twice —, embedding, restyling and the pitfalls. The vocabulary of
the scene is generated: one exhaustive record per enum of the model (`Record<IntroKind, …>` and the
like), so that a new kind does not compile until it is described; the fields of each block from the
schema; the options from `OPTION_NAMES` and `DEFAULT_OPTIONS`; the custom properties declared on
`.mfe-deck`, those of the scene's own page apart, and the classes from the text of the folder's own
`player.css` (`cssContract`: any stylesheet, the comment before a property its note, what is in a
selector's parentheses left out). The effects, the intros and the outros say what each draws, and a
short glossary turns an author's words into blocks. Its examples are made for the scene in hand and
are right by construction: an edit of `scene.js` (an Indicate, another intro, a pause, a colour) is
chosen among candidates until the project it makes has no problem the scene did not have
(`validateProject`), and each script for `custom.js` names the scene's clips and times. The one that
acts while the deck stands at a pause is made for the pause an author's comment shares its instant
with and for a clip drawn there (the one the comment names, if it is), reads `deck.atPause` and
calls its handler once after adding it, since a page opened at that pause sends no event; a scene
without pauses has none. The recipe of controls that appear on hover (`HOVER_BAR_CSS`) is CSS under
the host's own selector, which `e2e/deckControls.spec.ts` embeds as the export wrote it in
`AGENTS.md`. The tests run every script in the folder's own page (`src/test/folderPage.ts`: jsdom,
the folder's scripts in order, at an address of its own when it matters) and check what it does,
type-check them against `types/mfe.d.ts` (`src/test/typeCheck.ts`), apply every edit, and check that
the guide names every file of the folder, every kind of the catalogue and every member of
`MfeRuntime` and `Deck`. It is plain Markdown wrapped at 100 columns, well under what an agent reads
at once (about 25,000 tokens a read: the test holds it under 36,000 characters); no file of the
folder but the engine and the outlines is over the 256 KB that Claude Code reads whole.

**The type files** are made when the app asks for the runtime (`build/deckRuntime.ts` calls
`deckTypeFiles`, which loads the TypeScript parser then). `types/scene.d.ts` is `model/types.ts` as
it is, after a head that says the files of the editor's source its comments name are not in the
folder; that file must stay one of declarations alone. `types/mfe.d.ts` starts from the interfaces
`deck/index.ts` declares and re-exports — the runtime's object is declared as `MfeRuntime` for it —
and follows every name they use: a declaration of `src/deck/` comes with its comment, a type of the
model is imported from `./scene` (it must be in `model/types.ts`), `typeof` a constant becomes its
literal type, and a name nobody declares is taken for a global of the browser, which the test's
type-check proves.

**`check.mjs`** (Node 18, no dependency) runs `mfe-runtime.js`, `glyphs.js` and `scene.js` in a `vm`
context, as the page runs them, and prints what `MFE.check()` finds as
`scene.js:57 · clips[2].intro.kind: message` — the line where that part of the data starts, read off
the text of the call, or of the nearest part before it that the file holds (the project's own, for a
field it lacks) —, errors and warnings apart, with a summary and exit code 1 on an error. It
also says when a file is missing or does not run, when `glyphs.js`, `scene.js` and the `data-scene`
of `index.html` disagree on the scene's name — the attribute of an element, read as a browser reads
the page (`sceneNamesOf`: any quotes or none, not the text of a comment or of a script) —, and when
`custom.js` does not parse. It checks its own folder, or the one its argument names, from where it
runs (`node check.mjs ../blog/animation`: the copy of the scene's files beside a page that embeds
it).
