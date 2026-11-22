# Architecture §11 (1 of 6): UI layer

[Index](../ARCHITECTURE.md) · Previous:
[§9–§10 Testing, working rules](09-10-testing-working-rules.md) · Next:
[§11 History, stores, browser state](11b-ui-history-state.md)

Holds the opening of §11 *UI layer and browser state*: what a clip adds to a context menu, Unlink
formula, the creation of attached objects, main playback, the modules of `ui/` (animations, preview,
colors, relations, morph, timeline, menus, focus, the Creator), groups of formulas, the search of
formulas, the keys of the Preview's modes, drawing a line and one mode of the Preview at a time. §11
goes on in [11b](11b-ui-history-state.md) to [11f](11f-media-audio.md).

See also: [Editing blocks (UI)](05c-rules-blocks-events.md#editing-blocks-ui) ·
[§7 Rendering](06-07-catalogue-rendering.md#7-rendering) ·
[Owned gestures](11b-ui-history-state.md#owned-gestures) ·
[Lines and arrows](05b-attached-objects.md#lines-and-arrows)

---

## 11. UI layer and browser state

`animations/ObjectMenuItems.tsx` is what a clip adds about itself to a context menu (D118, D120)
— the same entries in the preview's menu on the object and in the timeline's menu on its clip:
for every clip «Intro ›» and «Outro ›» with the catalogue's animations and None, the current one
ticked, and «Remove animations»; for a formula or a text «Remove relations» and «Unlink formula
(make a copy)» (below); for a brace or a shape «Colour ›» (the object's, with the swatches the glyph
menus share, `colors/ColourSwatches.tsx`), «Direction ›» when it is an attached brace, and «Detach»
— through `animations/objectActions.ts` and `braceActions.ts`. `setClipPhase` gives the animation as
the panel's select does, after `animations/phasePlan.ts` (pure) has said what it would run into at
its own length — a Transform of the whole formula that `setPhaseKind` would cut or drop, and
every error validation would report that the project does not have now: the window of a
transformation, a block or an attached object that needs the same glyphs — and how long it can
be without any of it (it tries the instants where something of the clip starts or ends); with
conflicts a dialog lists them and the user adds it anyway, adds it shortened or leaves it. A
new intro is recorded as the object's `Formula.intro` (`recordClipIntro`,
`creator/formulaActions.ts`) unless «Appears with» gives that intro already, and the object's
other clips stay as they are. `removeClipAnimations` takes the intro, the outro and the blocks
but the Morph ones, in one undo step; `removeClipTransformations` the relations of the clip,
both ways, that `relationLock` lets go, and its Morph blocks.
**Unlink formula (make a copy)** (`timeline/unlinkClips.ts`, pure, and `unlinkClipsById` of
`timeline/clipActions.ts`): the clips of a formula that has other clips leave it for a copy of
it, the one Duplicate makes (`addFormulaCopies` of `creator/formulaActions.ts`), in one undo step.
`planUnlink` says which: the clips of an object the Creator lists (`unlinks`: a formula, a LaTeX
text, a font text; a brace, a shape or a line lives with its clips) on unlocked tracks, one copy
per formula, shared by those of the same formula, for a formula that keeps a clip of its own —
one not among them, a selected clip on a locked track too. The copy has its original's snapshot,
and everything else of a clip names clips and canonical glyphs — its blocks and Morph pairs, its
glyph colours, both sides of its relations, the objects attached to it and the fits and ends of
other clips' Transforms on it, its groups of blocks —, so `moveToCopies` changes `formulaId` and
nothing else; the glyphs picked on such a clip are picked again for the copy. `unlinkEntry` is
the entry of both menus — of one clip (here) and of the selected clips (`ClipsMenu.tsx`) —:
its text, «Unlink formulas (make N copies)» for several, and its tooltip, what it does or why it
is off (a formula's only clip, all the clips of their formulas, a locked track); a `MenuItem`
takes that `title`.
**Split at playhead** (D169; `timeline/splitClips.ts`, pure, and `splitAtPlayhead` of
`timeline/splitActions.ts`): the clips the playhead is strictly inside (`splitCandidates`) are cut
in two there, in one undo step with the sounds selected with them (`splitAudioAt` of
`audioCommands.ts`). `planSplit` builds the project with the clips split. The first half is the clip
— its id, its formula, its intro, the blocks that end by the cut — with no outro; the second is a
new clip of a **copy** of the formula (`splitName`: the name plus the suffix of the preferences,
numbered when taken), with no intro, the outro, the blocks from the cut on (their ids kept, their
starts counted from it) and, as its initial state, the state the tweens left at the cut (`stateAt`)
plus the colours a part transform gave glyphs (`settledParts`); the copy hides the glyphs that are
not on screen then (`hiddenAtCut`, from `clipLifetimes`), and the first half leaves out of its intro
itself those that had not come by then (`leftOutAtCut` writes its `Clip.startHidden`, D178: what
brought them is the second half's, and its intro would bring them; those the formula hides, or of a
clip that starts empty, are listed too when they came later, so that showing them again does not
bring them into the first half). What names the clip from the cut on is given to the second half:
the relations whose window starts then (the offset of one that arrives at it counted from its start)
and the placement uses measured then (`placementUses`: an attachment that starts, a fit or the ends
of a tween). A clip is **refused** with a reason (`SplitRefusal`) when something crosses the cut
(`crossing`: the intro, the outro, a block, a relation's window, the clip of an attached object that
is not split with it — not selected, or selected and refused itself, which «could not be split»
(A2-03) —, a locked track, a half shorter than `MIN_CLIP_LENGTH`, a relation with a clip
on a locked track that would go to the second half: it is not edited), when the state does not fit
in a clip (`settledParts`: glyphs a part transform moved or made fainter, a fit, ends that
moved or a stroke width a tween of the ends gave, an intro or an Appear whose easing comes back, an
attached object a tween of its own moved), and when a check of the result fails — each made against
the project it comes from: the stays on screen of every glyph must be the ones it had, cut in two
(`lifetimeBlocker`; blocks name the glyphs they animated in the whole clip when their target would
take in others — in the second half its Appear and Disappear blocks, for the glyphs on screen at the
cut; in the first the Appear blocks that would bring a glyph a relation or a Morph block had still
to bring, emptied when they brought nothing —, and a brace, a shape or a line that only came after
the cut refuses it: one piece, which a clip cannot leave out of its intro); no error may be new
(`validateProject`, `newErrors`: told by code and by what each is about, and said as a reason of the
split, `errorReason`: which half, the copy a second half would be of named as that half); and,
with the renders, the settled scene must draw the same at instants taken in each half
(`sceneDifferences`: the drawables of both evaluators, the second half standing for its clip from
the cut on; a clip whose object, or one it is placed by or that is placed by it, has no render yet
is refused rather than left unchecked: `missingRender`). Every clip a check finds at fault is
refused in the same round (A2-02) — but one placed by another at fault, which waits for the next
round —, the others are then planned again without them, and one notice names them all.
`splitKeyApplies` says when S is the split's key rather than the circle selector's
(`project/shortcuts.ts` asks it too): a sound selected, or a selected clip under the playhead while
the keyboard is not in the Preview (S pressed in an open menu is the menu's and goes to neither:
both listeners ask `inOpenMenu` first); `splitEntry` is the entry of the menus («Split at playhead
(S)», `ObjectMenuItems.tsx` and `ClipsMenu.tsx`), off with the reason when the playhead is in none
of the clips.
A new brace or shape has no intro: it is on screen when its clip starts, and takes one from
that menu.
`animations/attachmentCreation.ts` plans braces, labels and shapes from explicit project,
playhead, intro duration and standard-scale values. It owns the pure timing/preset rules and
uses `createEditorFormula` with each kind's existing defaults. Actions apply one plan in one
store update, then select, announce and open the label editor as appropriate. Track placement
is calculated against that update's actual draft, after any active gesture has been cancelled;
plans cannot retain a track that existed only in an abandoned gesture. The shape actions import
these policies directly, without depending on the brace action module's UI effects.

<a id="main-playback"></a>
`transport/playbackController.ts` owns main playback through an injected live-state host and
monotonic frame clock. `transport/mainPlayback.ts` connects the stores and browser scheduler;
Transport connects and disposes it while retaining controls and focus handling. Each frame samples
absolute elapsed time and current duration/loop settings; a frame the browser stamped before
playing began (it stamps a frame with the instant the frame began) counts as no time passed, so
the scene never goes back from where it was played. Play restarts at the end; pause, seek, reset
and disposal invalidate queued callbacks. Seek retains each caller's bounds and snapping.
Disposal releases subscriptions and frames without changing stored state, so remount can resume.
New/Open reset through this boundary; timeline, block-state and path-edit commands use it too.
BlockPreview retains its independent clock and local range. This prepares a synchronization
boundary now reused by audio integration without putting audio inside visual clips.

<a id="ui-modules"></a>
`ui/` holds the React components and, next to them, plain `.ts` modules with the logic that can be
pure (and is unit-tested): `animations/Section.tsx` (a titled section of the Animations and relation
panels wearing a `tone`, R5: a stripe on its left edge and its title in that colour — Intro and
Outro the Appear and Disappear block colours, a block's Animation section its category, Animations
the block colour, Timing the time colour, Initial state `--section-initial`, Relations the info
blue, Problems the danger red, Warnings `--warning` — neutral without one; the buttons that make
something carry `an-accent-button`, the accent outlined on a tint of itself and filled on hover;
`IssuesSection`, in `IssueList.tsx`, closes the panel of a clip, a block or a relation with its
issues, D177: «Problems», the errors first, as soon as one of them is an error, «Warnings» when
they are all warnings — a warning is a notice, and red is for errors, which need an edit),
`animations/BlockDialog.tsx` (the dialog of an animation block, R2: a double-click on a block of the
timeline selects it and opens it — `animations/blockDialogStore.ts`, mounted by `BlockDialogHost`
into document.body — a resizable, maximizable `Modal` whose left column is the panel's
`BlockProperties` with more room, its Glyphs section leaving the picking to the right column: the
formula in large, `GlyphPicker` at its `large` size, which has most of a dialog that is wide by
default — the fields keep a panel's width, and at the dialog's own size the view has a height of
its own, what the window leaves, whatever the shape of the formula; a block that names no glyphs
(a keyframe, a morph) has its fields alone, in a narrower dialog that remembers a size of its own
(`Modal`'s `sizeKey`); **Preview**, in the title bar (`headerTools`), opens the block's own
preview in a `Modal` over the dialog, which closes alone — `BlockPreview.tsx`,
the clip alone looping from a little before the block to a little after it through the same
`createEvaluator` in a canvas of its own framed on the clip — `animations/blockPreview.ts`: the span
it loops over, the loop clock, the block's progress, the camera that frames a box — with play, pause
and a playhead to scrub, the whole picture in the room its dialog has once that is sized by hand
or maximized (the canvas's frame is a size container); and under it the block's easing curve,
`EasingCurve.tsx` over `animations/easingCurve.ts`, the
rate function of the project's target sampled for an SVG with the point where the preview is; the
dialog and the panel edit the block through the same actions, one undo step each, and the dialog
goes when its block does, its preview with it — and when a mode of the Preview turns on, which only
one of its own buttons can do under a modal (**Edit path…** of a Morph's pair, **Pick again…** of a
shape's Transform): the mode takes the clicks of the Preview, which the dialog covers, so
`BlockDialogHost` hears it (`onPreviewMode`, in an effect) and closes),
`animations/transformEdit.ts`, `preview/gesture.ts` (what a drag of the
formula or of a handle edits — the part under edit, else the keyframe at the playhead — and how its
result is written to the clip; a group transform lists every member that can be edited),
`preview/marquee.ts` (the selection rectangle: its box, the clips whose box it touches, and how it
merges with the selection from before), `preview/groupTransform.ts` (several clips scaled or turned
as one about the centre of their union box: the box the handles frame, the smallest factor, and
where each member ends up), `preview/align.ts` (how far each box moves to align or distribute them),
`preview/boxes.ts` (the box that encloses a placed formula, and the frame's), `preview/geometry.ts`
(what the editing tools measure: the evaluator's `geometry(t)` — every glyph of each clip on screen
where its state and its part transforms put it, drawn or not, and their union — at the playhead, by
clip; the snapping, the selection rectangle, the group handles, align, distribute, paste properties
and align by symbol all read it, so a glyph a part transform has moved counts where it is) and
`preview/alignActions.ts` (the glue for Edit → Align / Distribute, the preview's context menu and
the Alt keys: which selected clips can move now — `editableSelection`, what Paste properties writes
to as well, less the clips placed by what they hang on (`alignableSelection`: an attached object, a
shape a Transform has carried, which follow their hosts) —, one undo step for all, a notice for
those that stay), `preview/glyphAlign.ts` (align by symbol: the shift that puts one glyph's side,
corner or centre on another's) and `preview/symbolAlign.ts` (the two-click mode as a store — the
symbol to move, `target`, then its `reference`, then the compass, opened on the reference: what
moves is chosen before where it goes — and the move it applies under the rules of a drag; the two
symbols are measured when the side is chosen, where they are at the playhead then — unless the
symbol to move was *kept*: G, in the reference step, stores the playhead in the phase (`held`, with
the end state under edit on that formula, if any), and that symbol is then measured with
`geometryAt` at the kept instant and the move written, through `previewEdit` at that instant, to the
keyframe in effect there, so that a formula is aligned to one it is never on screen with; the panel
draws the kept formula as a ghost of `evaluate(held.at)` with the symbol outlined in it, and the
timeline's ruler marks the instant, `timeline/SymbolHoldMark.tsx`; a reference clicked where the
symbol to move is not on screen and was not kept is not taken, and the notice names G),
`preview/symbolHold.ts` (what can go wrong with such a move, pure: `alignRefusal` — the formula
hangs on another one, is locked, or is moving at the instant, a tween of it, a part transform of
that glyph or an Indicate or a Wiggle running, when a shift of the keyframe shows only in part; G
then keeps nothing, and the move of the plain mode is not made either — and `alignWarnings`, what
moves beyond a move that was made: a later tween with a `position` of its own, the states before the
end that moved, a part transform that had moved the glyph, a reference whose box is another at the
instant nearest to the kept one; with the words of the notices), `preview/glyphCursor.ts` (the
keyboard's way through the glyphs on screen while a symbol is chosen: ←/→ along a formula, ↑/↓
between formulas, Enter picks; the mode takes these keys in the capture phase, before what has the
focus hears them — a clip of the timeline would move the selection with the same arrow —, and
leaves them to a menu that is open, `inOpenMenu` of `ui/focus.ts`: the bar with its menus closed
owns none, since an entry chosen there leaves the focus on its button),
`preview/pathEdit.ts` (the Edit-path mode as a store — one pair of a
relation or a Morph block, entered from the pair lists of the Animations panel, a relation's row of
the Relations list, the path picker, the menu of a relation's band and the link menu of the pair
editor, which saves first — and its pure helpers: the chord measured from the pair's source
glyphs as the window starts and its targets as it ends, through `geometry.ts`; hit-testing of
handles, anchors and curve; moving an anchor with its handles, a handle with its smooth partner —
mirrored through the anchor, or turned keeping its own length (`HandleLink`, D176: `handleLink`
reads the keys of each move, Shift and Ctrl/⌘) — or breaking the pair, toggling smooth and
corner, adding a node where the curve was pressed and
removing one, all in the chord's frame; a pair without a path starts from its holder's arc as nodes
(`arcSpline`), and a path left as that arc or as the chord is dropped on leaving, so the pair
follows the arc again: such a path is no path of its own, by `hasEditedPath` of
`relations/relationOps.ts`, the rule the marks of an edited path build on, `wearsEditedPath`),
`preview/pathRoutes.ts` (the routes of the pair in the mode, D167 — the store's `route`, null for
the common path, «All together» —: `routeChoices`, the routes of a pair that plays two or more;
`opensPerGlyph`, whether the mode opens with them shown — the store's `perGlyph`, «Path per
glyph» (D175), a flag of the session like `lockOthers`, the other routes locked: off, the common
path is drawn once, on the chord of the first route that can carry it (`pathEditFrame`), and
nothing chooses a route; the frame's `choosable` says when a click does —; the path a route
follows and the edit that gives it one of its own or takes it away, `setRoutePath`;
`dropPlainPaths`, the paths that say nothing of their own, which leaving a route or the mode
drops; the curve of every route on its own chord for the overlay, its hit-test, and the glyph of
one route alone; the words of the bar, `PathRouteBar.tsx`, the option and the lock first) and
`preview/usePathGestures.ts` (its pointer and keys — each change one undo
step, a press on the curve adding and dragging in one — taken in the capture phase, ahead of the
app's shortcuts), `preview/grid.ts` (the grid's spacings; its lines inside the frame,
`MAX_GRID_LINES` on an axis at most and counted by the line — a camera may look anywhere, so far out
that a multiple of the step plus one is the same number, and more lines are thinned evenly; where a
box lands when it snaps to a node by its centre or its edges) and `preview/gridLayer.ts` (the grid
drawn under the formulas through the renderer's `underlay`), `preview/propertyClipboard.ts` (a small
in-app clipboard for a clip's state as shown at the playhead (`stateAt`), and the paste of all of it
but the position, or of one group — transformation, appearance, per-glyph colours onto clips of the
same formula, position — onto the selected clips that can be edited, one undo step: the keyframe in
effect through `patchKeyframe`, where per-glyph colours replace an initial state's and merge into a
tween's target), `preview/snap.ts` (where a dragged box sticks: the nearest edge or centre line of
the other boxes and of the frame within the snap distance — or, on an axis none of those takes, the
spacing that puts it as far from two boxes as they are from it, or at the gap two neighbours keep —
and the guides to draw: lines, and bars with ticks for equal gaps; `snapSize`: the factor at which a
corner drag makes the box as wide or as tall as another; `snapBox` along one axis alone, for a drag
held to it) `preview/dragSnap.ts` (what a drag snaps with, captured when it starts: the moving box
and its targets; and `dragTravel`, where the drag goes for the pointer's travel: held with Alt to
the axis the pointer has gone further along since the drag began, chosen again as it moves
(`preview/axisLock.ts`), stuck to the objects — along that axis alone when held, so that no snap
pulls the box off its line — and to the grid on the axes no object guide took, never across the
held one; Ctrl/⌘ turns both snaps off, held or not), `preview/selectionMove.ts` (what a move of the
selection moves, by the rules of a drag — `planMove`: the clip it starts from, the pressed one for
a drag, and the selected clips that go along, or why that clip stays, with the notice a drag gives
(`warnRefusal`); the pointer drag and the arrow keys ask it alike), `preview/nudge.ts` (the arrow
keys: while the frame of the preview has the focus — a click on the scene gives it, Tab never does,
`tabIndex` −1 — and something selected is on screen, ←/→/↑/↓ move the selection by 0.01, Shift by
0.1, through `planMove` and `writeTravel` of `gesture.ts`, as a drag would and to six decimals; a
run of presses is one undo step, joined with `history.continueStep` while the step of the press
before is still on top of the undo stack and the selection object, the instant and the keyframes
are the same — derived data amended in between keeps it, any other step starts a new one —; a drag
still held is given up first; the clips that stay are named with `reportSkipped`, or a lone one
with the drag's notice, not again while it is up; with nothing selected on screen, in a mode of the
preview (`previewModeOn`), under a dialog or with Ctrl/⌘ or Alt the key is not the selection's and
goes on as before — to the mode, the dialog, or the playhead, `Transport.tsx`) and
`preview/usePreviewGestures.ts` (the preview's pointer gestures as a hook — select and
modifier-click, the selection rectangle, moving with snapping (`moveDrag`: a pointer move places
the drag, and so do Alt and Ctrl/⌘ pressed or let go while it runs, in any order and with no
pointer move — Alt's default taken then, for Windows —, and a blur of the window, which lets both
go), the transform handles of a clip or a group, align by symbol, the glyph pick,
pan and zoom, Escape, Shift and Alt; the panel gives it the drawables, the boxes and the handles'
geometry and gets back the gesture state its overlay and markup show; it also gives it what of the
scene answers the pointer — `reach`, from `preview/pointerReach.ts` (D192): the objects, or the
camera's rectangles alone in the world view of the multicamera (the objects there too while F is
held, `preview/useObjectsKey.ts`), or nothing while the scene plays or the fly key is held, a mode
of the preview going on its own way —, and unless that is the objects the hook takes none of them,
the pan, the zoom and the scene's own menu being all that is left (`e2e/previewReach.spec.ts`,
`e2e/camera.spec.ts`); with the circle selector on — the `circleSelect` preference, a switch of the
view's toolbar and the S key, which `project/shortcuts.ts` leaves to the timeline while an audio
clip is selected, since S splits it — every `pickClip` of the hook (press, hover, context menu, Alt
press) gets a `reach`, the `symbolRadius` of align by symbol in scene units, and takes the glyph
`pickGlyph` finds nearest within it before the clip's padded box, so that what the circle outlines
is what the click takes; the overlay draws that circle dashed, in the accent over its contrast,
`halo.selector`), `preview/glyphPick.ts` (the glyph pick, D74: with Alt, a click on a glyph of a
formula picks it — again takes it out, Shift the range from the last one — and a drag from a formula
a rectangle that picks the glyphs it touches, Shift adding, under the Creator's rules; the pick is
`parts`, the glyphs of each of one or more clips in the order the clips joined, D117: a click on a
glyph of another formula adds a part, a range stays within its formula and the rectangle takes the
glyphs of every formula it touches; what a part names, `'all'` for every glyph of its formula; how
the pick is pruned when the selection or the project changes under it — its clips are the selection,
exactly, and it goes whole when one of them does — and how it is described),
`preview/glyphPickStore.ts` (the pick: editor state outside the project, beside the
selection; each part owns the render of its formula it was read in) and `preview/glyphActions.ts`
(what the pick takes — a colour, hiding at the start, a brace on a side, a shape — through the
Creator's, the braces' and the shapes' actions, one undo step each; over several formulas, a colour
for the glyphs of all in one step and one brace or one shape attached to them all, the first part's
clip and the others as its `also`, and nothing of what is of one formula; what the clip's menu and
the glyph dialog read of a pick in their clip alone; and the colour sequence, D92: Copy puts the own
colours of the pick in an in-app
clipboard, as `propertyClipboard.ts` does, and Paste gives them to the pick as one undo step, or
says in a notice why they do not go), `preview/colourSequence.ts` (the colour sequence: the symbols
and the own colours of the copied glyphs, and how they go onto a pick — a glyph takes the colour of
the copied glyph that is the same symbol, equal symbols in glyph order, and both picks must hold the
same symbols; in glyph order alone a sum's upper limit and its ∑ would swap colours, since TeX
writes the limit first in a formula, set in display style, and the ∑ first in the «$…$» of a text,
set inline; pairing by nearest position fails where a text wraps; `pasteNote` writes the line under
Paste, with what the symbols do not tell — two or more glyphs without a known symbol go in glyph
order, and two picks rendered by different backends may have equal symbols in another order; the
fixtures of its tests hold the exact backend's glyph orders of 38 expressions set both ways and of a
selection of 2,160 nested ones, the two known limits among them: an operator inside the upper limit
of the same operator, whose two glyphs are swapped, and a delimiter or a radical that display style
builds from more pieces, which gives another number of glyphs) and
`preview/ColourSequenceItems.tsx` (the two entries in the pick's menus, with that line under
Paste),
`preview/CopyColourItem.tsx` («Copy colour to clipboard», D130, in those menus when the pick is a
single glyph: the colour it is seen in goes to the system clipboard as `#RRGGBB` through
`ui/clipboard.ts`, and a notice gives the colour when the browser refuses),
`colors/HexColourField.tsx` (the Hex field under the swatches of every context menu's colours,
`colors/ColourSwatches.tsx`: `parseHexColour` of `colors/hexColour.ts` reads `#RRGGBB` or `#RGB`,
Enter or Apply gives the colour to the menu's caller; a field in a menu is one of its stops —
`data-ctx-field`, which `ContextMenu.tsx` reaches with ↑/↓ — and keeps ←/→, Home and End for its
text),
`preview/colourOrder.ts` (colours in order, D129: a mode of the preview, as align by symbol is, for
colours that go by the order of the clicks and not by symbol; `phase` is the copy, with the colours
read so far — `seenColour`: the glyph's own, else its object's, never what a clip adds — or the
paste, with the list and what was pasted, each entry keeping the own colour its glyph had;
`clickColourGlyph` is what a click of the mode does, `stepBackColourOrder` Backspace,
`startColourPaste` Enter and Shift+V, which pastes the kept list again; a pasted colour is written
at its click through `assignGlyphColors` and joined to the step of the click before
(`history.continueStep`), the only one taken back for good (`retractStep`), so the paste is one undo
step with nothing held open; `startColourOrderTracking`, one of the app's services, ends the mode
when what it pasted is no longer there and when a project is opened (another mode of the preview
turning on ends it as it ends any other, `preview/previewModes.ts`);
`useColourOrderKeys` takes Enter, Backspace and Escape before anything else hears them;
`usePreviewGestures` gives the mode its clicks — the glyph under the pointer, of the objects whose
glyphs take colours, and no Alt pick, drag or rectangle meanwhile —, the overlay frames the glyphs
clicked (`framed`) and `animations/ColourOrderStrip.tsx` shows the list at the top of the Animations
panel, which the mode unfolds),
`colors/colorMatchActions.ts` (the edits of the Match colors dialog, one undo step each;
the next free names; what each entry's pattern lacks; the formulas a selection stands for),
`colors/applyColorMatch.ts` (`computeMatchColors`, the colours a list gives one formula through a
labelled render, and the apply that makes them the selected formulas' per-glyph colours in one undo
step, with a notice; an object of another kind selected with them takes nothing and keeps what it
has (`takesMatchColors`: a font text is named in the notice, a brace or a shape is not counted;
`matchColorsBlocker` names the first object of a selection a list cannot colour, which turns
«Edit together»'s Match colors off — its menu lists the project's lists as «Apply match colors»
does, with `ColorMatchLabel`, and applies the one chosen to the formulas open, D155);
each pending command owns its document session and selected formula revisions, and a later command
supersedes it only on overlapping formulas. Project/list edits invalidate the captured inputs
permanently, even if undone; listeners are released on completion or failure),
`colors/useMatchPreview.ts` (the dialog's preview: those colours on one formula, a moment after the
list or the formula changes), `blockRange.ts`, `issues.ts` (the issues of one clip, block or
relation, over one cached validation per project, and how grave they are: `issueSection`, the title,
tone and order of the section that lists them; `relationSeverities`, the graver severity of each
relation's, and `issueMark`, its class — `is-bad` in the danger red for an error, `is-warned` in
`--warning` for warnings only —, for the relations of the timeline and, through `pairSeverities`
and `morphPairSeverities`, the pairs of both pair editors), `catalogue.ts` (the animations and
rate functions every menu offers), `context.ts`; `relations/relationOps.ts` (the pair operations, on
anything that
holds pairs — `PairHolder`: a relation or a Morph block; `linkPair` adds a pair or, linking onto the
targets of one existing pair, adds the sources to it — D53, two glyphs that become one;
`hasEditedPath`, whether a pair has a path of its own — neither the chord nor its holder's arc —,
with `editedPathCount` and `pathOfPair` over it; `relationPathAction`, what **Edit path…** of a
relation's row in the Relations list does: the mode on its one pair, the path picker for several,
or the reason it cannot — a locked track, a formula that is gone, no pairs; `relationsBetween`,
the relations of two clips in a direction, in the order of their windows, with `relationNumber`
and `relationTitle` to tell them apart by when they play, "Relation 2 of 3"; `relateBlocker`, why
two clips cannot be related at all, which the button, the link ports and the marks of a link's
targets share; `newRelation`, whose window starts at the playhead when one fits there
(`windowAt`), else is the one of `addedWindow` — the default, or after the last window of two
related clips — with a note for the editor; with the region marked on the timeline (D180) the window
is the region, whatever the playhead says, and `windowIn` gives the sentence that the editor shows
instead of a relation when the two clips allow no window all along it), `lockedRelations.ts` (the
relations a locked track holds, D34: how far an edit of their other clip may go and leave their
windows where they play, inside it — `lockedLimits`, read by `startBounds`, `endBounds`,
`constrainMove`, `phaseLimits` and the Intro and Outro fields —, whether a change made whole or not
at all would leave one out — `lockedBreak`, for a paste of a timing and an intro or an outro from
the menu —, the windows put back in their time after a move of their target
(`restoreLockedWindows`) and the words of the refusals, which end with `relationLock`'s sentence),
`relationChoiceStore.ts`
(`relateClips`, what **Create relation…** and a link port of the timeline ask: the editor on a new
relation when the two clips have none, else the menu of `RelationChoiceMenu.tsx` — edit one of
theirs, or add another — at a point on screen, mounted by `RelationChoiceHost`),
`relationDraft.ts` (the relation editor's draft: the relation, the source's outro, the target's
intro and whether the target starts empty; `relationEligibility`, the glyphs the other transfers of
the project keep from the draft — the ownership rules of the validation read before a pair is made,
for the drawing to dim, with in `consumed` the sources another transfer takes at the window's start
or later), `pairStyle.ts` (the badge of a pair's style and `consumedSources`, the sources the pairs
of a draft consume: with those of `consumed`, `GlyphLinkCanvas` outlines them in red dashes —
`is-consumed`, D184 —, in both pair editors: a glyph a Transform or a Fade transform takes can only
be copied by another pair), `pairDraft.ts` (a draft of pairs taken through a
snapshot transition: pairs, selections, the step that leads to the current snapshot),
`pairGestures.ts` (the rules of both pair editors for a click on a glyph, the pairs a
selection holds or emphasises and what a right-click works on: across the two sides, the clicked
glyph joins the selection of the other side), `pairPick.ts`, `linkLayout.ts`, `linkRoutes.ts`,
`pairView.ts` and `usePairStage.ts` (the drawing of both pair editors: which glyph a point means,
where the two formulas and the links go, its view, and what an editor keeps of it —
[the drawing that links glyphs](11c-ui-look-views.md#the-drawing-that-links-glyphs)),
`linkAs.ts` («Link as», what the right-click menu
offers for glyphs selected on both sides: `linkOffer` tries each style of a new pair on the draft —
the editor's own `link` and its reading of the validation, `draftProblems` or `morphProblems` — and
gives each with the reason it cannot be, a refused link or an error the draft would gain, or with
the warning it would bring; onto the targets of a pair the choices are to join it or to bring them
through a pair of its own, and onto targets that several pairs bring, one more pair of its own;
`hintedProblem` says such a problem with the word the canvas has for the glyph, who else takes it),
`pairShare.ts` (a join taken apart and put back, D167, for pairs of one target: `splitPair`, a
pair per source onto that target, each with the style it played and the path it followed, and
`joinPairs`, the way back — a common path or routes of their own, a transform with copies as one
`copies` pair),
`pairSession.ts` (the draft session
of both pair editors, pure: pairs with an identity each, `identified` and `stripIds` for the
project, the snapshot revision the indices refer to and `reconcile`, which takes the draft, its
baseline, the selections and a suggestion through a formula's re-render or holds Save back,
`dropSharedGlyphs` for a Morph block) and `usePairSession.ts` (the session in React: it watches the
stores for the re-base, links through the holder the editor gives, deletes after the held
confirmation unless a re-base came first, and hands the editors the handlers of their canvas, pair
list and pair menu); `morph/morphDraft.ts` (the Morph pair editor: which glyphs can be sources and
targets of the block, `lineOrder` and Suggest, linking with the block's rule, re-basing a draft, the
problems of a draft, the summary line) and `morph/morphEditorStore.ts` (which block's pairs are
being edited: `openMorphEditor(clipId, actionId)` and `close`, read by `MorphEditorHost`; on
`window.__mfe` for the e2e specs); `animations/startsEmptyNotice.ts` (one of the app's services: the
notice a clip that starts empty gets when an edit leaves it with nothing to show — `clipsLeftEmpty`,
the project before and after; not a clip that now ends before anything of it came on screen, as the
first half of a split does (A2-01): its panel's warning says it —, the mark left alone);
`animations/PhaseEditor.tsx` (the Intro and
Outro sections of the Timing tab: the Intro's has the «Starts empty» box and, for a clip that leaves
glyphs out of its intro itself — `Clip.startHidden`, the first half of a split —, the line that says
how many of them the formula does not hide anyway (`leftOutGlyphs` and `startHiddenLine` of
`clipEdit.ts`), with the button that brings those back (`clearStartHidden`: the ones the formula
hides stay in the list); the line waits while the clip starts empty);
`timeline/relationBands.ts` (the stripe of each relation band in the lane of its clip: bands that
overlap in time share the lane); `timeline/clipOps.ts`, `trackLayout.ts`, `marquee.ts` (the
selection rectangle over the lanes: the clips it touches in time and rows), `groupTrim.ts` (a
trim of the selected clips together, D168: who takes part — the pressed clip alone, or with it
every selected clip of the scene and of the sound that can be trimmed —, how far the edge of each
can go and so of all of them, and the edit, the same time for every one; the gesture is
`startTrim` of `useTimelineGestures.ts`, for one clip and for many), `ClipsMenu.tsx` (the
right-click menu of several selected clips: Edit together…, one brace or one shape over them all,
Apply match colors, Unlink formula, Split at playhead, Duplicate, Delete), `unlinkClips.ts`
(Unlink formula: the clip menus of [§11](#11-ui-layer-and-browser-state), above),
`splitClips.ts` and `splitActions.ts` (Split at playhead, D169: the plan and its checks, and
the command, the key and the menus' entry; above),
`region.ts`, `useRegionGestures.ts`, `useRegionKeys.ts`, `regionActions.ts` and `RegionMarks.tsx`
(the region marked on the ruler that what is created next takes, D180: its geometry, the Shift
drag that draws it and its two marks, the I, O and Esc keys, and how it is drawn;
[§11, the timeline](11c-ui-look-views.md)),
`RelationMenu.tsx` (the right-click menu of a relation's window band: Edit pairs…, Edit path… on
each pair — up to five in the menu itself, else behind Choose a pair…, which opens the path picker
—, Delete relation), `relations/pathPickerStore.ts` and `PathPickerDialog.tsx` (the picker: the
relation's diagram, its links lit by the hovered row, beside one row per pair with a picture of the
curve its glyphs follow — `pathPreview.ts`: the pair's path, else the relation's arc, else the
chord, as points of the chord's frame —, its style and what it follows; a click on a row or a link
opens the Edit-path mode on that pair), `relations/EditedPathDot.tsx` (the mark of a pair with a
path of its own, `hasEditedPath`: a dot that says "Edited path" as its tooltip and accessible name,
and takes the text's colour under forced colours, beside each such pair wherever pairs are listed
next to an Edit path… — the picker, the band's menu, the pair menu of both pair editors, the panels
of a relation and of a Morph block —; a relation's row in the Relations list,
`relations/RelationsSection.tsx`, counts them, "2 paths edited"), `keyboardNav.ts` (the keyboard
model of the clips and
blocks: the one Tab stop, where the arrows go — along a track, between tracks, through a clip's
block lanes — how an item reads to assistive technology, where Alt + arrows take a clip, how far the
view scrolls to show an item) with `useTimelineKeyboard.ts` (the hook: focus and selection together,
Enter and the menu key, the focus kept after a deletion, and given once the timeline is drawn again
to a block whose group is folded or unfolded — `focusItemWhenDrawn`: given at once it would be on
the block that goes, and from there the timeline sends the focus to its Tab stop and shows it, the
first clip of the project when nothing is selected), `clipActions.ts` (the commands of clips,
each one undo step: deleting, with a question first when attached objects go too; duplicating the
selected ones; unlinking them from their formula into a copy of it; moving one with Alt + arrows —
the ones that plan give up a drag still held before they read the project), `hoverTip.ts`
(the clip tooltip shows after the pointer rests 0.6 s and hides on the next move), `timelinePan.ts`
(`startTimelinePan`: the middle button, held, drags the scrolling element both ways at once under
pointer capture, and Escape puts the view back; the wheel, a trackpad and a touch mouse scroll that
element natively on both axes, and `overscroll-behavior: contain` keeps what is left of such a
gesture at an end of the timeline from reaching the page, where a sideways swipe is the browser's
“back”), `scrollSlider.ts` with `TimelineSlider.tsx` (the toolbar's slider: the thumb of a bar
for a view's scroll, and the scroll for a thumb's place), `useAltHeld.ts` (Alt held is "trim
only": the tracks area carries `is-trim-only`, under which nothing in the lanes nor in the layers
over them — blocks, relation windows, link ports, state icons — takes the pointer but the clips'
trim handles, which a block or a window ending where its clip does would cover, and the inner
edge of their intro and of their outro (`.tl-phase-handle`, the whole of its dashed line
meanwhile), which a relation window that crosses it covers; a press that lands on no handle is
stopped there, so it selects nothing and clears no selection; a dialog and a text field keep the
key, and the pointer's own `altKey` corrects a missed key event);
`ui/time.ts` (`round6`, `snapToFrame`); `ui/pointer.ts` (the drag threshold, `isDrag` and
`trackPointer`, which every drag uses — `isDrag` takes the press and the pointer as points of the
screen, `ScreenPoint`, never as a place of the timeline's space —, and `isMainClick`, which every
press asks instead of reading the button: on a Mac a Ctrl+click is the secondary click, whose press
of the main button takes, moves and writes nothing before its menu opens;
`app/build/__tests__/mainClick.test.ts` reads the sources for it); `ui/focus.ts` (`keepFocus` for
toolbar buttons, `rovingIndex` for tabs, segments and menus, `typeAheadIndex` for a letter typed in
a menu or on the bar, `captureFocus` for popups, and `inOpenMenu`, whether a key is for a menu that
is open — pressed in one, on the bar while one of its menus is open, or on the page while one is
open —, which the app's shortcuts (`project/shortcuts.ts`), the playhead's keys
(`transport/Transport.tsx`), the timeline's (`timeline/useTimelineKeys.ts`) and its region's ask
first, as the modes of the Preview do: such a key is the menu's alone, and nothing moves, switches
or goes under a menu); `ui/selection.ts` (what a selection covers — `selectedFormulaIds`,
`highlightedClipIds`, `selectedBlock` — and `pruneSelection`, what is left of it once the project
changed under it); `ui/focusOrigin.ts` (whether the focus came from the keyboard: Space plays unless
it operates the focused control, `spaceOperates`); `ui/announcer.ts` (`announce`: a visually hidden
polite live region, `Announcer`, for keyboard work with no visible result — a clip moved, a
deletion); `engineStatus.ts`; `ContextMenu.tsx` (a menu at a point — a right-click, or under a
control — rendered into document.body and kept inside the window: `MenuItem`s, and `Submenu`s whose
panel opens beside its entry on hover, click, Enter, Space or → — to the right, or to the left near
the window's edge, level with the entry, `submenuSide.ts`: `submenuSide`, `placeSubmenu` — and
closes with ← back to the entry or when another entry of its menu is hovered; ↑/↓, Home and End walk
the panel that has the focus; Escape, Tab and a press outside close the whole menu. Tab (or
Shift+Tab) closes it, gives the focus back to what opened it and leaves the key alone, so that the
same press moves the focus on from there (the menu pattern of the WAI-ARIA practices); its listener
runs before a modal's focus trap, which then sees an ordinary Tab from the trigger. A menu opened
over something that takes no focus (a right-click on the preview) has nothing to give the focus back
to: the browser goes on from where the menu was, at the end of the page. Long menus —
preview clip's, the timeline clips', the picked glyphs', the brace, shape and label groups of Add
animation, the Creator's Apply match colors — put each section in one, R1); `MenuPopup.tsx` (the
menu bar's entries: items, separators, submenus (disabled or led by an icon too), colour swatches
and leading icons (`timeline/icons.tsx`), with the keyboard: `MenuBar` opens a menu on its first or
last item from ↓/↑, Enter or Space, changes menu with ←/→ from inside one, jumps to a menu by its
initial and leaves on Tab; a popup walks its entries with ↑/↓, Home, End and letters, and a submenu
takes →/← and Escape one level at a time; the `menubar` role is on the menus and the Export… split
button alone (its arrow lists every export: there is no Export menu), as a menubar owns menu items
only, and the title, the project's name, its state and the theme toggle are beside it in the bar)
and `preferencesMenu.ts` (the entries of the Preferences
menu: Snap to objects, the snap guides' colour and width, whether the transform handles stay shown
without Shift, their scale step — four presets, or Custom…, a number or a fraction typed into
`project/ScaleStepDialog.tsx` and read by `preview/scaleStep.ts`, kept as typed —, the grid, and
Standard scale…, the scales new formulas and new texts are born with, typed into
`project/StandardScaleDialog.tsx` and read by `creator/standardScale.ts` (R4: `newFontSize` gives a
new object 48 × the scale of its kind when `creator/formulaActions.ts` makes it; saving the
preference never changes the objects that exist, the dialog's «Apply to all formulas» and «… texts»
do: `planStandardScale` lists every object of the kind — every formula, or every LaTeX text — whose
font size is not 48 × the scale typed, `applyScaleBlocker` says why the button cannot act,
`applyScaleQuestion` words the `confirmDialog` that says how many change, and `applyStandardScale`
writes the font sizes as one undo step, the clips' own scale and animations untouched; «Edit
together»'s Scale (D155) writes them the same way, `setScaleOf`, for the objects it has open that
have a scale of their own (`hasOwnScale`; `sharedScale` is what its field shows, the scale they
share or nothing, "mixed", and `unscaledNote` what it says of the braces, shapes and lines it leaves
out), and `scaleFieldError` is what its field and the formula editor's refuse; the formula
editor shows a size as scale and font size, one value,
`scaleOfFontSize` / `fontSizeOfScale` — of an object typeset from a source only: a brace and a
shape are fitted to their target, and have no such field), and Split suffix…, what «Split at
playhead» adds to an object's name to name the copy that takes a split clip's second half (D169:
`f1_s`), typed into `project/SplitSuffixDialog.tsx` and checked by `timeline/splitSuffix.ts`
(`isSplitSuffix`, `splitSuffixError`: 1 to 16 ASCII letters, digits or "_", so that the name stays
a Python variable), over `ui/preferences.ts`);
`help/shortcutSheet.ts` (the
shortcut sheet, kept equal to the [README](../../README.md) table by a unit test; a row says what a
Mac has in its place where its keys are others, `mac`, and the README lists those under "On macOS",
by the same test) and `help/keyCaps.ts` (its keys split into key caps, and drawn on a Mac as its
menus write them, `macLines`); `creator/FormulaItem.tsx` and
`creator/FormulaBlock.tsx` (the two faces of a formula in the Creator's list — a row with its
rendering, or a block in a grid, R3, the view an editor preference, `creatorView`, switched by one
key of the toolbar that shows the other view's icon, `creator/viewToggle.ts`, D179 — sharing
`creator/FormulaCardParts.tsx`: the inline rename, the edit / duplicate / delete buttons and the
start of a drag onto the timeline; `creator/formulaSelection.ts` is the listbox's pure model —
click, Ctrl, Shift and the keys, with the grid's columns for ↑/↓ and ←/→ —,
`creator/regionSelect.ts` and `creator/useRegionSelect.ts` the region over it, the search's
([below](#the-search-of-formulas)) in both views (D172: its `RegionOptions` say that the cards
are the rows and blocks of formulas, not a group's row, and that a press on any row is the row's
unless Alt is held — `startsRegion` —, its drag onto the timeline or into a group then held back
until the button is let go),
`creator/kindSelection.ts` the rows of the menu of its toolbar that select every object of a kind
(D155: `toggleKindSelection` adds every formula, LaTeX text or font text of the project to the
formulas selected, or takes the kind out when all of it is; `kindRows` is what the rows say and
whether each is ticked, `aria-checked`), `creator/KindMenu.tsx` that menu's key, ∑ with an arrow,
lit while a kind is all selected, and the menu it drops on hover or on a press (D183, three keys
before; a portal into the document that exists only while open, its `menuitemcheckbox` rows staying
open after a choice), `creator/hoverMenu.ts` when such a menu opens and closes (`createHoverMenu`:
150 ms of rest on the key, 300 ms off the key and the menu, at once on a press, Escape, a press
elsewhere or a resize) and where it hangs (`placeHoverMenu`), `creator/previewSize.ts` the size of
the previews of each view, one key «+/−» after that key (D173, D183, `creator/PreviewSizeKey.tsx`:
a click larger, a right-click or a Shift+click smaller, ↑ and ↓; 1×, 1.5×, 2× or 3×, the editor
preferences `creatorListPreview` and `creatorBlockPreview`; the list sets the height of its rows'
renderings, `listPreviewHeights`, as CSS variables), `creator/formulaStatus.ts` what the status
badge says,
empty, rendering, error, exact or MathJax, for the row, the block and `creator/FormulaTooltip.tsx`,
the block's tooltip with the rendering, placed and sized by `creator/blockTip.ts` (`tipSize`: its
rendering as many times wider and taller as the block view's size says, as large as fits in a
smaller window; `placeTip`, inside the window) through `creator/useTipFrame.ts`);
`creator/blockFace.ts` (the compact face of a formula’s block narrower than `COMPACT_BLOCK_WIDTH`,
the owner’s design for a block with no room for its name: the stylesheet chooses it with a container
query on the block’s own width — the block is the container `formula-block`, and what it holds is in
`.formula-block-face`, since a container’s query does not reach the container —; the face is a pane
of glass tinted with its tag’s colour (`--tag` over `--panel`: `--glass-top` of it at the top,
`--glass-foot` at the foot, more in the light theme; an edge of the tag inside the border, of the
accent when selected), with the name alone in the text’s colour (`blockFace.test.ts` holds it to 4.5
to 1 over any tag, in both themes), and the rest waits in its corners for the pointer or the
keyboard’s focus, with no fade — the buttons at the top, the kind and the render as one character at
the bottom left (`statusMark`, which the status badge carries as `data-mark` and the stylesheet
draws in place of its words), the clips and the tag’s icon at the bottom right —, a warning and a
render that failed showing all along; `e2e/creatorBlocks.spec.ts`); `creator/FormulaThumb.tsx` (that
rendering, in every list, tooltip and the Projects dialog: each glyph painted by its `GlyphStyle` as
the Preview paints it — a text glyph filled; a box, a line and the shaft of an arrow stroked and
empty — with a stroke never under a pixel wide); `creator/renderErrors.ts` (render errors in the
user's terms: what the formula left open instead of the `align*` wrapper, the undefined command and
its package), `creator/glyphsUnavailable.ts` and `creator/sources/` (the formula editor is a header
every kind of object shares — name, tag, size, colour, Appears with — over the source panel of its
kind, `SOURCE_PANELS`: `draftOf`, the fields Apply commits, and the panel that edits them,
`MathSource.tsx` for LaTeX and packages; a text, with a font or LaTeX, has none:
`creator/formulaEditorStore.ts` opens the composition workspace in the editor's place,
[below](11d-templates-text-composition.md#text-composition-workspace); the editor keeps the draft,
the preview render, Apply, Revert and the glyph column, and reads `KINDS` to leave out what the kind
lacks, as the list's menu does for Edit together… and Apply match colors). `ui/ErrorBoundary.tsx`
wraps the layout: a render that throws shows a way back (reload, which the autosave makes safe —
unless the last autosave could not be written, which the screen says —, or download the project)
instead of a blank page.

<a id="the-on-screen-keypad-of-the-formula-editor"></a>
**The on-screen keypad of the formula editor** (`ui/creator/keypad/`). `creator/LatexInput.tsx`,
the visual field (MathLive) over the raw LaTeX, has the **Keyboard** key beside its title, which
shows a keypad in the dialog, under the field. `keypadLayout.ts` is its one source, as data: four
tabs (`KEYPAD_TABS`), rows as wide as each other and as many in every tab — so the keypad does not
change its height from tab to tab —, and keys that write (LaTeX with MathLive's marks: `#@` is what
is selected or stands before the caret, `#0` what is selected or a hole, `#?` a hole) or do one of
six things (move left or right, delete, clear, the capitals, apply). A key has an id (its test id),
a name (its accessible name and its tooltip), a face (LaTeX, with a `\square` for a hole, or a
text) and a tone (its look); `faceLines` tells the faces taller than a line, which the keypad draws
smaller. Its test renders what every key writes with the editor's MathJax, holes filled, and every
face with MathLive. What the draft takes from the field is its LaTeX without MathLive's mark for a
hole still empty (`latex-without-placeholders`: `\frac{}{}`, an empty group, where MathLive says
`\placeholder{}`, which neither MathJax nor Manim typesets), so a formula being written is not an
error at every key.

`FormulaKeypad.tsx` is the keypad: `ui/Tabs.tsx` over a grid of buttons — the keys of the shown tab
only, so a key is on the page once — whose faces MathLive's static element draws (`<math-span>`; it
leaves `\placeholder{}` blank, hence the square). It runs `keypadActions.ts` (pure: `keyAction`,
the LaTeX or the field's command of a key; `neighbourKey`, the key an arrow reaches, by the columns
the keys take) on the field, with `insert` and `executeCommand`. A press of the pointer does not
take the focus (`keepFocus`), so typing goes on in the field; from the physical keyboard the keys
are one tab stop (a roving `tabIndex`), a key pressed there keeps the focus, and undo and redo on a
key are sent to the field: the project's shortcut, which a dialog that allows history answers from
any control that is not a field, would undo an applied step instead of the last key. Its Apply key
calls `onApply` (`SourcePanelProps`, from `FormulaEditor`) after telling the draft an edit of the
field it has not heard of yet (`flushSync`): MathLive dispatches `input` a task after a change, and
a key pressed right before Apply would be left out of what is applied. Only an edit is told
(`LatexInput` keeps what the field held when it was last shown a text or told a change): what the
field holds of a source typed in the textarea is MathLive's own writing of it, which never takes
the place of what was typed.

`preferences.ts` holds whether the keypad was left shown (`formulaKeyboardShown`): the editor opens
with it. MathLive has an on-screen keyboard of its own, one for the page, at the bottom of the
window. It is never shown: the field asks for none (`mathVirtualKeyboardPolicy = 'manual'`) and the
key the field would draw for it is hidden (`creator.css`). The two were built side by side to be
compared (D214), and the keypad was the one kept; a browser that had chosen the other stored
`formulaKeyboard`, which is read past and not written again. `e2e/formulaKeyboard.spec.ts` covers
the keypad and that MathLive's keyboard stays away, and `build/dist.spec.ts` opens the keypad from
`file://`.

<a id="groups-of-formulas"></a>
**Groups of formulas** (`model/formulaGroups.ts`, format 22; `creator/groups/`).
`project.formulaGroups` — the last field of the project, absent while there is none — holds a name
and formula ids each: a way to keep the Creator's list in order that nothing else reads (the scene,
the lifetimes, the export and the video are the same with or without it). Its rule — a formula in
one group at most, only the kinds the Creator lists, a name, at least one formula, no group inside a
group — is kept in one place, as the rule of the groups of blocks is: `hasBrokenFormulaGroups` and
`repairFormulaGroups`, which the project store applies after every recipe and the loader to a file,
with a warning (`formula-group-repaired`); `validateProject` says what a project made some other way
still holds (`formula-group`). So nothing that deletes a formula knows about groups: the formula
leaves its group in the same step, and a group left without formulas goes. A group has no place of
its own in the file: the list follows `project.formulas`, and a group sits where the first of its
formulas (`formulaIds[0]`) would, the others coming under it in the group's order
(`formulaListOrder`, which is also the order of a selection of formulas: `selectionOrder` of
`ui/selection.ts`, the order Duplicate selects its copies in and what is left of a selection when a
formula goes keeps, audit B1-01). `groupRows.ts` is the
list, pure: `creatorRows` gives its rows — a formula, or a group and, while it is open, its formulas
—, and each row says which formulas it stands for; the list is not filtered
([the search of formulas](#the-search-of-formulas), below, has results of its own, flat). There is
no selection of a group: `creator/formulaSelection.ts` selects by rows (`clickRow`, `navigateRows`),
the row of a group standing for its formulas, so the menu of the selected formulas acts on a group
without knowing of it; `groupChoices` says what that menu offers about groups (Group, Add to
group ›, Remove from group), and opened on the row of a group it has Rename group and Ungroup.
`FormulaGroupRow.tsx` (the list view, with the renderings of the first `GROUP_THUMBS` formulas) and
`FormulaGroupBlock.tsx` (the block view, whose `GroupTooltip.tsx` has the renderings) are the two
faces of a group, sharing the rename in place, the keys and the drop of a formula dragged from the
list (`FORMULA_MIME`: the row of a group is a drop target, and is not dragged itself).
`groupActions.ts` holds the operations, one undo step each, which never change a formula and leave
the selection on the formulas; `groupUiStore.ts`, what the view remembers and the project does not:
which groups are open, and which one is being renamed.

<a id="the-search-of-formulas"></a>
**The search of formulas** (`creator/search/`). The magnifier of the Creator's toolbar and Ctrl/⌘+F
(`search-formulas`, the one command `project/shortcuts.ts` takes from a text field too) show
`FormulaSearchPanel`: a panel of its own, mounted beside the Preview panel in its slot of the layout
(`AppLayout`, the resizable layout and the stacked one) and placed over it. The Preview stays
mounted underneath, so that it keeps its view, its size and whatever mode it was in; `PanelFrame`'s
`inert` puts it out of reach of the pointer, the focus and assistive technology meanwhile.
`formulaSearch.ts` is the search, pure: `searchFormulas` gives the results of every tab for what was
typed — a tab per kind the Creator lists (`SEARCH_TABS`, which a test keeps equal to the `listed`
kinds) —, an object matching by its name, its source or the name of its group, in the order of the
Creator list (`formulaListOrder`) and flat, each result with its group; `emptyMessage` tells a
project without objects of a kind from a search that finds none. `formulaSearchStore.ts` keeps the
state of the view — open, the tab, the text, and a count of the requests, each of which takes the
focus to the field —, which ends with the document (`startFormulaSearchTracking`, one of the session
services), and remembers what had the focus when the search opened, to give it back once the panel
is gone (`returnSearchFocus`: only then can the Preview, no longer inert, take it). A result
(`SearchResultCard.tsx`) is a card of the list in what it does, through the same pieces: `clickRow`
and `navigateRows` of `formulaSelection.ts` over the results of the tab, `startFormulaDrag`,
`openFormulaEditor`, and `FormulaSelectionMenu.tsx`, the menu of the selected formulas, which the
Creator list opens too. A region (D155) is a rectangle dragged from the empty space of the results
— a card keeps its own press, for its click and its drag —: `creator/regionSelect.ts`, pure, says
what it does by the keys held at the press (`regionMode`: none replaces the selection, the selected
objects the tab or the text hide leaving it as on a plain click; Shift adds; Ctrl/⌘ takes out),
which cards it touches and what the selection becomes (`regionSelection`), with its corners in the
coordinates of the results' content (`contentPoint`, `contentBox`), so that it stays on its cards
while the list scrolls under it; `creator/useRegionSelect.ts` is the gesture — the rectangle
measured again on each move and each scroll, drawn as the app's other rectangles (`.marquee-box`),
the click of its release swallowed, Escape (`trackPointer`'s) giving the selection back. Both are
the Creator list's too (D172), which tells them what its cards and its rows are (`RegionOptions`):
the search's cards are its result cards alone, and Alt changes nothing there. The search is no
dialog — nothing is trapped and the modal stack does not know of it —, so its Escape is a listener
of its own (`useFormulaSearchKeys.ts`) that leaves the key to whoever takes it first: a dialog, a
menu, a field that takes an edit back, a drag.
`preview/previewCover.ts` says that the Preview is covered: its own key handlers (the modes that
take Enter and Escape, Escape on a pick or a drag) and the commands of `shortcuts.ts` that act on
the scene (`actsOnPreview`) wait while it is, so a mode that was on is there, as it was, when the
Preview is back.

<a id="the-keys-of-the-previews-modes"></a>
**The keys of the Preview's modes** (`preview/modeKeys.ts`). Edit path, the choice of a shape's
target, colours in order, align by symbol, drawing a line and Edit curve each have keys of their own
(`usePathGestures.ts`, `useShapeRetargetKeys.ts`, `useColourOrderKeys.ts`, `usePreviewGestures.ts`,
`LineLayer.tsx`, `useLineCurveKeys.ts`), and the rule is one for the six: a mode that is on takes
its keys in the capture phase, before what has the focus hears
them, and stops them — a focused clip would open its formula with the same Enter and move the
selection with the same arrow, and a key does one thing —, unless the key is somebody else's, which
`keyIsTaken(event)` answers: a dialog is open, a field is being typed in, the Preview is covered, or
a menu is open (`inOpenMenu` of `ui/focus.ts`: the key was pressed inside a menu, on the bar while
one of its menus is open, or on the page while a menu is open, a press on its heading having let
the focus go). The bar with its menus closed owns no key of a mode: an entry
chosen in a menu leaves the focus on the menu's button, and a mode started from there has its keys
at once. A key held with Ctrl, ⌘ or Alt is a shortcut's, not a mode's: `modeOwnsKey(event)` answers
both things and the six ask it, the Escape that leaves align by symbol among them — with one of
those keys held, the symbol chosen stays. Two Escapes are taken with them held too: the one that
lets the glyphs picked with Alt go, which asks `keyIsTaken` alone, since the key that picked them is
easily still down, and the Escape of a drag, which asks nothing, since a drag holds the pointer
wherever the focus is. A mode's own bar — the strip of colours in order, the routes of Edit path
(`data-mode-bar`) — has buttons that Enter and Space press: `pressesModeBar` leaves them the key,
but not while the mode holds a drag, when Enter is the mode's. A new mode takes its keys through
`modeOwnsKey`; the cases are pinned mode by mode in `e2e/previewModeKeys.spec.ts`. The arrows that
move the selected objects (`nudge.ts`) are heard on the frame of the preview itself, in the bubble
phase: after every mode, and before the playhead's listener on the window, which a key they took
(`preventDefault`) leaves alone, as it leaves the ones a focused timeline clip takes.

<a id="drawing-a-line"></a>
**Drawing a line** (`preview/lineDraw.ts`, `preview/LineLayer.tsx`; D137, D140). «Add line ▸» starts
a fifth mode of the preview with the kind chosen. In a clip's menus the line starts on that clip —
on its picked glyphs, when the preview's menu opened on them — and one click puts its end
(`startLineDraw(line, from)`); in the menu of the preview's empty space two clicks put the start and
the end. The last end makes the line (`planLine`, `applyLine`: its object and its clip in one undo
step, on the nearest free track in front of the front-most of its hosts, a new one right above it
when none has room; a line between two points goes on the front-most track with room). A click on an
object that takes an end puts it on the whole of it, a click anywhere else at that point (`endAt`);
with Alt held the layer steps aside (`pointer-events: none`), the preview picks symbols as always,
and when the button is let go the pick becomes the end (`endFromPick`). An end put on glyphs is not
put yet: it **waits for its anchor** (`pending`, `offerLineEnd`), and the compass of align by symbol
(`SymbolCompass`, with a tenth choice under its grid, «Auto») asks where on them it is; its answer
puts the end (`anchorPendingEnd`), Escape or a press elsewhere gives that end up and leaves the mode
waiting for it. An end on symbols holds the index space it was picked in (`PickRevision`, B6-04):
while the mode is on, the start and the end the compass asks about follow their glyphs through a new
render of their formula (`followedEnd`, `pickRebase`; `follow`, which `startLineDrawTracking` runs
on every change of the project or the renders, and the last end runs before it makes the line), as
align by symbol does; when none is left, or the formula changed with no glyph transition, the mode
ends — a waiting end alone is given up — and a notice says so.
What an end would go on — under the pointer, or waiting for its anchor — is `aim`,
which the preview draws as it draws picked glyphs. The layer is real elements over the canvas — a
surface for the clicks while the mode is on, the compass, and for the one selected line a handle at
each end, the start's in the accent and the end's in the theme's red (`--line-start`, `--line-end`;
the same mark, `.line-end-dot`, is in the menus and the panel), and a rubber band while one is
dragged —, so the gestures hook of the preview knows nothing of lines beyond leaving them out of
what it scales and turns, and opening the menu of the empty space. The surface of a mode — Add
line's, and Edit curve's with its points and handles — is the scene's for what is no click: its
middle button pans the view (`panFrom` of the gestures, which gives the canvas the pointer), its
right-click opens the preview's menu (`onContextMenu`; on a Mac a Ctrl+click is that click and puts
nothing, `isMainClick` of `ui/pointer.ts`), and the wheel is heard on the frame, over it. An entry
chosen in that menu ends the mode before it acts, Edit curve keeping its curve (`onMenuChoice` of
`ui/focus.ts`, heard while the menu is open; Edit path, whose canvas hears the right-click as with
no mode on, ends the same way and keeps its path), and the menu closed with Escape or a press
elsewhere leaves the mode on; the clip the right-click selects shows no hint of the preview's own
(its handles', a pick's), which gives way to the mode's as it does to the other modes'. A
**dragged end is left free** where it is dropped and goes on nothing by itself; with Alt held at
the drop it goes on the symbol
under the pointer, with Alt and Shift on the whole formula there, and in both cases the compass asks
its anchor before anything moves. With Ctrl/⌘ held the pointer is brought onto the line's own axis,
on the dragged end's side of the other one (`alongLine`): the line grows or shrinks and keeps its
direction. The handle's own menu frees the end («Detach», `freeLineEnd`) or asks its anchor again
(`askLineAnchor`); the clip's menu has «Detach ▸» with «Detach start», «Detach end» and «Detach all»
(`freeLineEnds`: both ends free where they are drawn, one undo step), and the Line section the
anchor of each end as a field (`setLineAnchor`). A line is a block subject of its own
(`blockSubject`: `line`): «Add animation» offers it what `validateProject` lets a line have — the
intros and outros of `KINDS.line`, one Transform, the emphasis effects that do not animate its size
— and `planNewBlock` refuses it a part or a morph, as it does a brace and a shape; the menu of one
of its blocks («Change animation», «Change effect») and the selects of the block's panel list the
same, an arrow's GrowArrow among them (`appearChoicesOf`, `disappearChoicesOf`,
`emphasisChoicesOf`), and `changeBlockAnimation` and `changeEmphasisEffect` write nothing else.
`moveLineEnd`
writes what all of them mean in one undo step: the end that stays keeps its glyphs or the point it
is drawn at; with both ends free the attachment goes and the object's vector and the clip's position
are written; a line object that has other clips gets an object of its own first, since the vector is
one clip's. Manim leaves a line's gap at a free end too, so the point the attachment holds for a
free end is the gap further out along the line (`pointForFreeEnd`, a few rounds: the direction
depends on where the line leaves the glyphs of its other end): the line drawn ends where the pointer
was. The ends are those the line's clip starts with: once a Transform has moved the line, or on a
locked track, the handles stay, and say why (`lineEndsLock`).

<a id="one-mode-of-the-preview-at-a-time"></a>
**One mode of the Preview at a time** (`preview/previewModes.ts`). The six modes (drawing a line is
the fifth, Edit curve the sixth) take the same clicks and some of the same keys, so two of them on
at once would both
answer an Enter — the choice of a shape's target made its Transform while align by symbol chose a
glyph. Turning one on turns off the one that was on, and it is done in one place: each mode says how
it ends, and whether it is on, in the module of its store (`registerPreviewMode` — a line of the
module, not a listener, and a mode whose module was never loaded cannot be on; `previewModeOn()`
asks them all, and the arrow keys of the selection give way to any mode that is on, `nudge.ts`) and
calls `endPreviewModes(itself)` as it turns on — `toggle` of align by symbol, `start` of the choice
of a target, `open` of Edit path,
`enter` of colours in order, `start` of drawing a line, `open` of Edit curve. No mode imports
another, and none watches the others' stores. A mode
ends as it would by itself: Edit path settles its path (`close`, which may write a step), colours in
order keeps what it pasted. What covers the Preview while a mode turns on gets out of its way:
`onPreviewMode(hear)` tells who asked, in an effect, of every mode as it turns on, until its result
is called (the block dialog closes). The glyphs picked with Alt are no mode: the modes that use them
or cannot have them let them go themselves. A new mode adds its two lines;
`transientSessions.test.tsx` walks the ordered pairs.
