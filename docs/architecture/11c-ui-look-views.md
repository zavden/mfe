# Architecture §11 (3 of 6): The look and some views

[Index](../ARCHITECTURE.md) · Previous:
[§11 History, stores, browser state](11b-ui-history-state.md) · Next:
[§11 Formula templates, text composition](11d-templates-text-composition.md)

Holds more of §11 *UI layer and browser state*: the look (the Mint theme and its tokens),
identification colours, forced colours and the narrow layout, the list of glyphs, the drawing that
links glyphs, the relation editor's own preview, its raw preview and its side column, the timeline's
slider, and clips locked in the preview.

See also: [§11 The modules of `ui/`](11a-ui-layer.md#ui-modules) ·
[Relations in Manim](05a-time-model.md#relations-in-manim) ·
[§7 Rendering](06-07-catalogue-rendering.md#7-rendering)

---

<a id="the-look"></a>
The look is one theme, Mint, in a dark and a light variant, and all of it is in the custom
properties at the top of `ui/styles.css` (its header comment lists them): surfaces (`--bg`,
`--panel`, `--panel-header`, `--raised`, `--well`, `--input-bg`), edges (`--border` for a divider,
`--border-strong` for the edge that identifies a control), text (`--text`, `--text-dim`,
`--text-muted`), the accent for what is on, the selection teal for what is chosen, the primary
button's gradient, the gradients, lights and shadows of the glass, the radii (`--radius-control`,
`--radius-card`, `--radius-panel`), the two font stacks (`--font-ui`, `--font-mono`; no font is
bundled) and `--motion-fast`. An area's stylesheet writes no colour and no font stack of its own:
it uses the tokens, and the shared classes of `styles.css` for buttons (`.btn`, `.btn-small`,
`.btn-primary`: one primary action per place), fields, tabs, menus and the panel frame.
`styles.css` is imported after the components (`main.tsx`), so on a tie in specificity its rules
win: an area that overrides a shared rule writes a more specific selector.
`ui/__tests__/themeContrast.test.ts` reads the tokens from the stylesheet and holds both variants
to WCAG AA: text on every surface it is written on at 4.5:1, identifying edges, the accent and the
focus ring at 3:1, and the two colours of the issues (D177) — `--danger` for what has an error,
`--warning` for what has only warnings — at 4.5:1 as the title of a section on its card and at 3:1
as the marks of a relation on the timeline's lanes. The canvases that draw chrome (the Preview's
overlay, the text composition's
stage) read the tokens with `getComputedStyle` and repaint when `data-theme` changes. `PanelFrame`
gives each panel its title bar — icon, title, the panel's own `tools` at its far end, fold button;
`FOLDED_PX` in `ui/panelsStore.ts` is that bar's height with the frame's two edges — and `Tabs`
takes an icon per tab. The Preview's view toolbar (align by symbol, the circle selector, handles,
snap, the zoom) is such tools: its state is the stage's, so `PreviewPanel` hands the frame an
empty slot and the stage draws the toolbar into it through a portal; nothing floats over the
picture but the bar of a selection or of picked glyphs. A bar too narrow for the title and the
tools hides the title from view (a container query on the header), not from the heading.

<a id="zen-mode"></a>
**Zen mode** (D182, D188; `Preferences.zenMode`, off by default) is another arrangement of the same
four panels for small windows, designed at 1366×768: the timeline in a column on the left, drawn
vertical, and the Preview with the rest, the Creator and the Animations panel in a drawer over it.
Three things make it only an arrangement. **The panels are rendered once.** `AppLayout` gives each
of the four a DOM node of its own (`useHome`) and renders it there through a portal; the layout in
use — the resizable one, the stacked one of a narrow window, Zen mode's — puts the node in its place
(`Home`). Changing the layout moves nodes and mounts nothing again, so the Preview keeps its view
and its modes and the other panels what they had open. A consequence: a React event of a panel does
not come up through the layout's components, only through the DOM, which is why `ZenStage` hears
Escape on the document and the press that closes its drawer on the Preview's place, on the way down.
**The drawer folds through the panels store.** `ZenStage.tsx` is the Preview's place with a strip
along its top or its bottom (`Preferences.zenStrip`, moved by the strip's own button) and the
drawer: two halves, the Creator on the left and the Animations panel on the right, each opened and
closed by its button of the strip, both mounted always. Each half registers a handle of its own
(`FoldHandle`) in `panelsStore.ts` and reports its fold — the half closed —, so `collapsed`,
`toggle`, the fold button of a `PanelFrame`, View ▸ Panels and whatever unfolds a panel it needs
work with the code they have in the usual layout; the store only knows the side of the strip
(`strip`, `setStrip`), for the way a panel folds (`foldSide`), and carries no fold from one layout
to the other. `zenDrawer.ts` keeps which halves are open, the drawer's height and where the halves
meet in the browser. A press on the Preview's scene (`preview-frame`) closes the halves and goes on
to the scene; one on the timeline, the transport or the search does not. The colours in order, which
unfold the Animations panel to list what they take, leave it closed here (`strip !== null`): it
would open over the glyphs to click. The strip's tools (`ZenStripTools.tsx`) call what the Creator
and the Edit menu have — the search of formulas, `createObject` for «+ New» and its menu,
`useTemplatesUi.open` for My templates and Favorites (the Templates tab mounts when one of its lists
is asked for), Undo and Redo. The search of formulas covers the Preview's place (`.preview-slot`,
here the stage's body), the drawer with it.

**The timeline is turned, not rewritten.** `useTimelineStore.vertical` (set by `AppLayout` with the
mode) adds `is-vertical` to `.tl`, and one CSS transform — `rotate(90deg)` about the well's corner,
then moved back by its height — turns the whole well a quarter clockwise (`.tl-well`, sized from its
place with container units; D193): time runs down the screen, the tracks are columns with the
headers as their tops, and what is at the top of the timeline that lies is on the right of the one
that stands — **the ruler is the column's right edge**, beside the Preview (D188), the Camera row
next to it, then the first track, and the others go on to the left. (Until D193 the well was
transposed, x and y traded, which put the first track on the left and needed the ruler laid out
last; the owner asked for the order the lying timeline has.) The layout (`trackLayout.ts`), the
relation arrows and every planner are untouched: they still think of time along x and the tracks
down y. What reads the screen goes through `timeline/axis.ts`: `along` and `across` for a pointer,
`boxOf` for an element's box, `wheelOf` for the wheel and `arrowOf` for the arrow keys, which follow
the screen (up and down along time, right towards the ruler and the first track). Across the tracks
the space grows away from the ruler, so a place across is the screen's x with its sign changed: it
is only ever compared with another place or with a box's `top`, read the same way. What goes back to
the screen — a menu's corner, the tooltip, `elementFromPoint` — keeps the event's own coordinates,
and so does the drag threshold: `isDrag` (`ui/pointer.ts`) compares two points of the screen
(`ScreenPoint`), so a gesture of the timeline keeps its press as the screen gave it (`screenPoint`),
beside the place along time and across the tracks it measures its travel from. (A place of the
timeline's space given as the press made every first move a drag when the timeline stood.) What is
read stays upright by a quarter turn back about a corner of its own — the three ways are written at
the head of the CSS block «The vertical timeline» — (the names of clips, the ruler's labels, the
readouts of a drag), each as wide as its part of the track (`--lane-height`, `--row-height` of the
row) and cut there. The name of an animation — on a block, an intro, an outro — is not stood up
(D189): a column is too narrow for it, so it runs down what it names, under its icon, and reads
downward, as the well turns it. The header of a track has a body (`.tl-header-body`)
that fills its column's top, and the icons turn back about their middle, except those whose
direction is the layout's (the chevron of a group of blocks, the arrows that move a track, which
then point right, towards the front, and left). **The scrollbars are drawn by hand**: a turned
scroller's own bars would be turned with it, so they are hidden and `TimelineScrollbars.tsx` draws
one for time down the left edge and one for the tracks along the bottom while they do not all fit,
in the well's place — outside what is turned, so they read the screen as it is, the thumb of the
tracks starting at the right end, where the first track is (`scrollbar.ts`: `barThumb`,
`scrollForThumbMove`). The headers are a shorter band along a vertical timeline (`headerWidth.ts`:
`headerWidth()` for what is worked out when something happens, `useHeaderWidth()` for what is
drawn), the toolbar wraps into the column, and each way keeps the sizes of its tracks
(`otherRowSizes`, traded by `setVertical`; `VERTICAL_SIZES` starts wider, so that a name cut to its
column still says something). In any layout `useFlyKey.ts` moves the view along time with the mouse
while T is held, through the same `along` and `scrollForThumbMove`; with Shift held too it takes the
playhead to the pointer instead (D189) — at once from the pointer's last place, then with every
move, through the `scrubTo` the ruler's own scrub uses —, and `data-flying` on `.tl` says which of
the two the mouse moves (`view`, `playhead`). The same is kept in the store `useFlying` for the
Preview, whose scene leaves the pointer alone while the key is held (`preview/pointerReach.ts`,
D192): in the vertical timeline the pointer goes down the Preview, which outlined what it passed
over. The keys C and A open and close the halves of the drawer through `usePanels.toggle`, as they
fold the panels in the usual layout (D191). `e2e/zenMode.spec.ts` holds the layout, the drawer and
the strip, `e2e/zenTimeline.spec.ts` every gesture along the other axis, that what is read is drawn
with the identity matrix and the name of an animation with a quarter turn.

<a id="reds"></a>
Red has three readings, told apart by what it is drawn as (D187). **Plain red is an error**: the
«Problems» of a panel, a field's error, the notes of the Python dialog that hold the export, and a
notice of kind `error`, which stays until it is dismissed — a file «Opened with N issues» is such a
notice when one of its issues is an error, and a warning's (`--warning`, amber) when they are
warnings alone (`applyOpened`, `ui/project/actions.ts`). **Red beside green is an end beside its
start**: the region's «]» after its «[» (D180), the dot of a line's end beside the accent of its
start (`--line-end`, `--line-start`; D140). **Red dashes are a consumed source** in the pair editors
(`is-consumed`, D184). A warning is never red.

<a id="identification-colours"></a>
Identification colours (formula tags, relation pairs) are the author's and read the same in both
themes: a formula's tag is a dot on its card and a stripe on its clips; text on them uses
`--on-id-color`. UI colours are theme tokens (`ui/styles.css`; `@media (forced-colors: active)`
blocks next to the rules they complete give every state a ring, a border or an underline in the
system colours, and `forced-color-adjust: none` keeps colour samples and formula previews theirs;
below 760 px — `useMediaQuery.ts`, `NARROW_LAYOUT` — `AppLayout` stacks the four panels and the page
scrolls), and the timeline passes its layout constants (`timeline/layout.ts`) to the stylesheet as
CSS variables. `AppLayout` keeps creator, relation and Morph editor hosts outside those responsive
branches. Unapplied drafts and native input history therefore survive resizing. Creator requests
close on project/document replacement and carry transient revisions guarding delayed close calls.
`ColorField` binds native change listeners to actual input nodes through a callback ref and removes
them on replacement; input previews the swatch, change commits once, and equal values are ignored.

<a id="the-list-of-glyphs"></a>
**The list of glyphs.** `creator/GlyphColors.tsx`, the glyph view of the formula editor and of the
text composition workspace, draws the glyphs (`creator/GlyphView.tsx`) and has the tools that colour
and hide the selection. It also lists the glyphs under the drawing, a key each with its index and
label, only when the editor preference `glyphList` asks for it (`ui/preferences.ts`; off by
default): the list is the way to pick glyphs from the keyboard, and the room it takes grows with the
object. `creator/GlyphListToggle.tsx` is the key that switches it. Each editor places it itself
(beside the "Glyphs" title; after the Placement / Glyphs switch, while the glyph view shows) and
disables it where `hasGlyphs` (`creator/glyphsUnavailable.ts`) finds nothing to list. The selection
belongs to the view, not to the list: it stays when the list goes. The relation editor and the pair
editor of Morph blocks do the same with the lists of their two sides (`creator/GlyphChips.tsx`,
under their drawing): one preference for the two, `relationGlyphList`, and the same key with the
look of the toolbar's buttons, just before the key that hides the links. A choice made in a glyph
view does not change the pair editors', nor theirs a glyph view's.

<a id="the-drawing-that-links-glyphs"></a>
**The drawing that links glyphs** (D207; `relations/GlyphLinkCanvas.tsx`) is the one SVG of both
pair editors — the relation editor's and the pair editor of Morph blocks —: the two formulas, their
glyphs marked, the pairs as coloured links with a badge each. Its arithmetic is in pure modules
beside it, and the editor holds what must outlive it (`relations/usePairStage.ts`: the layout and
the view; `setLayout` asks the drawing to open again).

*Which glyph the pointer means* (`relations/pairPick.ts`). The elements of the glyphs hear nothing:
the drawing hears the pointer and asks `pickPairGlyph`, the Preview's circle selector on the two
formulas — the glyph with ink under the point (the renderer's own test, `containsPoint` on the
flattened outline, which `render` exports for it), else the one whose box is nearest within the
circle, a point inside a box being at no distance from it; of several as near, the smallest. The
circle is always on here, with the Preview's size (`symbolRadius`; Shift + wheel changes it through
`turnSymbolReach`, the one step of both: `symbolReachAfterWheel` turns the reach finer than the
whole pixel it is kept in, so that the small events of a trackpad's scroll add up to what one event
of their length gives, and each view keeps the part of a pixel it has turned so far, which holds
while the reach is the one it rounds to). It is drawn at the pointer and the glyph it would
take is the hovered one, with its index in a badge. A click and a right-click say where they are in
whole pixels and the pointer says it finer: within the pixel the place is the pointer's, so that
what the circle showed is what is taken. An event without a place on the drawing — a script's, a
drawing that is not laid out (jsdom) — means the element it was sent to. The pointer moving redraws
little: a glyph is a memoised component, and the circle keeps its place in a state of its own.

*Where the formulas go* (`relations/linkLayout.ts`). The unit of the spacing is the size of the
text, `textSize`: the median of the longer sides of the glyphs of both formulas (`rendersTextSize`),
which neither the lines of a derivation nor a big delimiter move — the height of the formula, or its
tallest glyph, made the unit several times the text, and the glyphs small. `linkFrame(a, b, text,
layout)` gives the two offsets and the box of the drawing in one of two layouts: `stacked`, both
about x = 0 with a gap of some three letters between the source and the target under it, or `side`,
both about y = 0 with that gap between the source and the target at its right, and room over them
for the arcs (a share of the width: it is by its width that such a drawing fits its element). Each
leaves room under the formulas for the index of a hovered glyph. Stacked, the room over the source
is for the keys of the view, which are over that corner of the element: the room of the text or a
share of the width, whichever is more — a line that ends under the keys is as wide as the drawing,
and the keys are 34 px of an element some 660 px wide. The raw preview lays its stage out with the
same function, and the player's copy (`embed/pairs.ts`) follows it, held by
`embed/__tests__/pairs.test.ts`.

*What is the screen's.* The drawing measures itself (`ui/useContentSize.ts`, which the glyph view
shares) and gives in CSS pixels, at any scale, the mark of a glyph — its box and two pixels around
it, ten at least each way, as the frames of a glyph view —, the badges of the pairs, the index, the
heads of the arrows and the circle of the selector. *Where the links go* (`relations/linkRoutes.ts`)
therefore depends on that scale. Stacked, the junctions are on rows across the gap: a pair has a row
of its own while the gap holds them, eight at most and never nearer than a badge is high; a pair
moves to a row with room rather than lay its badge on another, and the badges of a row that still
meet move apart sideways with their junctions (`apart`). Side by side a link is an arc that turns
over the highest glyph of its pair; arcs that would run along each other are one over another, nine
pixels apart, and the badge of an arc is put beside its junction where it would lie on another's. No
badge is under another.

*The view* (`relations/pairView.ts`) is a centre and a zoom over the frame of a camera
(`render/camera.ts`), so its arithmetic is the Preview's: at zoom 1 the whole drawing fits the
element (`fitView`), `viewBoxOf` says what the SVG shows, and the same view shows the same part in
an element of another size. The gestures are the Preview's too — Ctrl/⌘ + wheel zooms about the
pointer, the middle button or Alt + drag moves the view (a drag is not a click, Escape puts it
back), a scroll moves it and a pinch zooms on a Mac (`ui/pinch.ts`) —, and the keys over the corner
(`.rel-view-tools`) step the zoom and show all of it. The centre stays inside the drawing. The
element keeps the box of the whole drawing (a CSS `aspect-ratio`, up to the height the window
allows) whatever its view shows, so nothing moves around it when the view changes.

*How it opens.* Once the element has a size the drawing chooses its layout, unless the editor holds
one: `preferredLayout` takes the one whose opening view draws the text larger — stacked for wide
formulas, side by side for tall ones, and stacked unless the other is a tenth larger —, for the
element each layout would have. What it compares is the size of the text on screen as far as 32 px,
beyond which larger is worth nothing: a short formula, which stacked draws that large, stays
stacked. Then `openingView` frames what takes part: the glyphs that can be linked (those
`ineligible` does not name) and those of the pairs made, on both sides, never nearer than a text of
32 px, and the whole drawing when that is about all of it. The first key over the corner changes
the layout while the editor is open, and the drawing opens again in the other. Neither is stored:
they are the editor's while it is open, so that the relation editor's drawing comes back from a
preview as it was left.

<a id="the-relation-editors-own-preview"></a>
**The relation editor's own preview** (D156; `relations/RelationPreview.tsx`, its arithmetic in
`relations/relationPreview.ts`) takes the place of the drawing when the switch over it
(`SegmentedControl`, Link | Preview) says so. It draws the editor's DRAFT, not the project: the
draft as it would be saved now (`resolveDraft`) laid over the project by `projectWithDraft`, read
by the same `createEvaluator` as the preview (with `includeHidden`, as the export reads it), the
drawables of the relation's two clips alone, in a canvas of its own whose camera frames them at
the ends of the loop and all along the window (`framedTimes`: a path that bulges away stays in the
picture). The loop runs over the window padded by `WINDOW_PAD` within the time either clip is on
the scene (`relationSpan`); its clock is `relations/useLoopClock.ts` (`BlockPreview`'s
`loopTime`), its bar `relations/PreviewBar.tsx`, which marks the window (`windowBand`), and its
camera `BlockPreview`'s `fitCamera`. The scene is made again only when what
the draft says changes (its JSON is the memo's key), not at each render of the editor. The editor
keeps the component mounted while the drawing is back (`active` false): it computes and draws
nothing then, and its instant is kept. While the draft has an error the editor says so in its
place. The list of pairs of both pair editors (`PairList`) gives a pair its Edit path…, the
editor's `editPath` that the link's menu calls too, and its `EditedPathDot`.

<a id="the-raw-preview"></a>
**The raw preview** (D157; `relations/RawPreview.tsx`) animates the drawing that links the glyphs,
in its place: asked for by the last key of the drawing's toolbar, it renders a canvas with the
drawing's box and, where the toolbar was, the same `PreviewBar` with the key that ends it. Its
stage is the drawing's: `relations/linkLayout.ts` (`linkFrame`, which `GlyphLinkCanvas` lays
itself out with) says where each formula goes, in the layout the drawing has (`PairStage.layout`),
and `rawStage` turns it into the centre of each clip and a camera whose frame is the drawing's box,
so the two pictures coincide — the preview shows the two formulas whole, whatever part of the
drawing its view had. Its scene is `rawScene`: the draft's project with the two clips put there — at
their formula's own size, upright, attached to nothing, without the blocks that move or reshape them
(those that show and hide glyphs stay) —, the other relations of the two clips left out, and the
relation with no path arc and no path of a pair's own: the glyphs go straight, and the scene engine
does the rest (styles, copies, what the unpaired glyphs do). Two guides are drawn with it: the
target as it stands when the loop ends, as drawables at half their opacity under everything, and,
through the renderer's `underlay`, the dashed outline of each glyph of either formula that no framed
instant of the loop shows. Escape is heard on the window, in the capture phase, before the dialog's
own listener on the document: it ends the preview and goes no further, unless a field owns it
(`fieldOwnsEscape`). The toolbar is as high as two lines of what is selected, so that it keeps its
height when those words wrap beside its keys (nothing may move under a pressed glyph).

<a id="the-relation-editors-side-column"></a>
**The relation editor's side column** (`relations/RelationEditor.tsx`, with the parts of
`relations/RelationSidebar.tsx`) is two tabs (`ui/Tabs.tsx`): the pairs, which the tab counts, and
the animation, that is the timing and style of the relation and what its unpaired glyphs do. Those
are what the scene plays once the draft is saved (`unpairedGlyphs`, the lifetimes of
`projectWithDraft`; audit A3-03): the glyphs of the source its outro takes away and those of the
target its intro brings, not those a Morph block or an Appear or a Disappear block takes or brings,
nor those the target hides — of a target that starts empty, those nothing brings. The player's copy
(`embed/pairs.ts`) reads them so with the clips' own intros and outros. The
problems are listed under both. A press on the drawing (`GlyphLinkCanvas`'s `onPress`) or a pick in
the lists of glyphs brings the pairs back, so nothing may move under the pointer that pressed: the
two panels share one grid cell, the one that does not show only out of sight (`visibility`), and
the editor is as high with either. For the same reason a row of the list of pairs is brought into
view by `relations/revealRow.ts`, which scrolls the list alone (`scrollIntoView` scrolls every
ancestor that can, the dialog too), and that list is no higher than the drawing may be, so that all
of it is on screen.

<a id="the-timelines-slider"></a>
**The timeline's slider** (`timeline/TimelineSlider.tsx`, its geometry in
`timeline/scrollSlider.ts`) is the scroll bar of the timeline's scrolling element, drawn in the
toolbar. That element stays the one place where the scroll is kept: the slider reads its
`scrollLeft`, `clientWidth` and `scrollWidth` (on its scroll events and on a resize of it, of its
content or of the bar) and writes `scrollLeft`. The thumb is to the bar what the lanes in view are
to all of them, the column of track headers (`HEADER_WIDTH`) being part of neither (`sliderThumb`);
it is never shorter than `MIN_THUMB`, and it fills the bar, with nothing to move, when all it could
travel is under a pixel. A press holds the thumb where it lands, or by its middle when it lands
beside it (`thumbHold`), and `scrollForThumb` turns the thumb's place back into a scroll; Escape
gives the view back as the drag found it. The zoom is around the slider in the toolbar
(`TimelineToolbar.tsx`: out and in before it; after it the key of the whole timeline and the
readouts — the zoom, and «dt», the ruler's small step at that zoom as `tickLabel` of `ruler.ts`
says it; the playhead dragged on the ruler with Ctrl/⌘ held goes by that step, `nearestTick`, in
`startScrub` of `useTimelineGestures.ts`, D174 —, in two sides, each as wide as what it holds):
that key sets `wholeZoom` (`timeline/ruler.ts`), the view's width over
the seconds the timeline lays out (`timelineExtent`: the scene, or as far as its clips reach, and
six seconds of room after the end, never under twelve), half a pixel under, so that nothing is left
to scroll; `lowestZoom`, the store's minimum, is that same value whenever it is under the lowest
zoom of a short scene, so a long timeline always fits whole and zooming out stops exactly there.
Like the buttons beside it the slider does not take the focus when pressed (`keepFocus`), and it is
a control for `clearSelectionOnBackground` (`[role="scrollbar"]`); reached with Tab, its keys
(`keyScroll`) are prevented, which is how the transport's own arrows, Home and End know to leave
them. For "everything in view" to mean no scroll at all, nothing may reach past the tracks: the
ruler's row cuts its labels at its end (`overflow-x: clip`), the last one being that of a tick at or
past the end of the timeline. The slider is in the middle of the toolbar, not of the room the tools
leave: the toolbar is a size container, and after the slider's row comes an empty box as wide as the
tools (`100cqi` less the slider's cell) less what the side after the slider is wider than the one
before it, which shrinks only once the slider is down to 320px; in the stacked layout of a narrow
window, what follows the slider takes a line under it.

**A dt of one's own** (D181): the − and + around «dt» set `ownDt` in the timeline store
(`timelineStore.ts`; a view state of the session: no file, no undo, no preference) a tenth of a
second away from the dt shown, without zooming — `steppedDt` of `ruler.ts`, worked out in whole
tenths, from `MIN_OWN_DT` (0.1 s) to `MAX_OWN_DT` (an hour); the zoom's own can be shorter. Every
reader of dt outside React goes through `timelineDt(fps)` of the store, the own dt or else
`rulerScale(pxPerSecond, fps).minor`: `snapOptionsAt` (the grid that clips, blocks, phases and
relation windows snap to) and `scrubTo` (the playhead dragged with Ctrl/⌘ held). The toolbar and the
ruler select `ownDt` and the zoom themselves: the readout says one's own with `ownDtLabel` (seconds,
to the tenth, which minutes would round away) in the accent (`is-own`, `data-own`), and the ruler
draws its small ticks with `smallTicks` — none closer together than `MIN_TICK_SPACING`, 4px —, its
labels being still the zoom's. A zoom the user makes drops it (`zoomTo`, from `setZoom`: the keys,
Ctrl/⌘ + wheel, the whole timeline); a zoom to the value it has keeps it, and so does the zoom a
new minimum moves (`setMinimumZoom`: a wider window, a shorter scene), which the user did not make
(S7-N2).

**The region** (D180): a stretch of time marked on the ruler that what is created next takes —
`region` in the timeline store, a `TimeRegion` in seconds on frames (`ui/timeline/region.ts`, pure:
the region between two times, with an end moved, with its start or its end put at the playhead, cut
where the laid-out timeline ends, and which key is whose). It is view state like the zoom: no file,
no undo, no preference; it goes with its document (`startTimelineViewTracking`) and stays until it
is removed. The store keeps it as it was marked (`markedRegion`) and shows it within the seconds
the timeline lays out (`setRegionLimit`, from `Timeline.tsx`; `regionWithin`): a shorter scene cuts
the region shown, or leaves none of it, and when the timeline grows again — the edit given up with
Escape, undone, or any other — it comes back whole by itself (A6-01); marking another one replaces
it, and Escape during a gesture of the region brings back the one marked. `useRegionGestures.ts`:
Shift pressed on the ruler draws it past the drag threshold (`Timeline.tsx` sends the press there
instead of to `startScrub`), and each of its two marks drags
an end — an end goes where the playhead would, on a frame, on the small ticks alone with Ctrl/⌘ held
(dt, D174 and D181), and it snaps like a clip's edge while Snap is on (Shift suspends that for a
mark; it cannot for a region being drawn, whose key it is); Escape during either brings the region
back. `RegionMarks.tsx` draws it: in the ruler a tinted band between a green «[» and a red «]»
(`--region-in`, `--region-out`), over the tracks a fainter band; the band takes no press, and a mark
takes one by its upper 15px alone, so that the foot of the ruler, where the playhead has its head,
stays the playhead's when the two are at the same time (as right after I or O); a mark pressed and
let go is a press on the ruler (`scrubTo`). `useRegionKeys.ts`: I and O put the start and the end at
the playhead (`regionKeyEdge`, `markRegionEdge`: with no end after the playhead the region runs to
the end of the scene, with no start before it, from 0) — not in a field, a dialog or an open menu,
nor with the Timeline panel folded —, and Escape removes it when the key has nothing else to do:
what else wants the key is read as it goes down, in the capture phase (a pressed pointer, a dialog,
the search over the Preview, a mode of the Preview, glyphs picked with Alt, a keyframe being edited,
a field, an open menu), because some of those let go of what they had without marking the event, and
the region is removed in the bubble phase when nobody stopped the key or prevented its default. The
same free Escape first ends the isolation of a camera move in the Preview (`stopIsolating`,
[§12](12-scene-camera.md)): a press for the isolation, the next for the region. Who reads it:
`addBlock` for a new animation block ([§5, the blocks](05c-rules-blocks-events.md)),
`RelationEditor` for a new relation's window (`windowIn`, [§11](11a-ui-layer.md)), and
`useFormulaDrop` and `addToTimeline` for the clip of a formula brought to the timeline
(`regionFreeOn`, `addClipIn`, [§5](05a-time-model.md)); braces, shapes and lines made from the
menus, duplicates, splits and what the Preview makes at the playhead do not.

<a id="clips-locked-in-the-preview"></a>
**Clips locked in the preview** (`preview/previewLock.ts`, format 20). A clip can carry
`previewLocked`: a state of the editor kept with the project, as a track's lock is, which the scene,
the export and the video do not read. The preview draws such a clip and leaves it alone. It is not
there for the pointer: `PreviewPanel` hands the gestures the drawables of the other clips only
(`reachable`), so a press, a hover, an Alt pick and the double-click that opens a text go through it
to what is under it; the selection rectangle drops it from the clips it touches, and Ctrl/⌘+A from
the clips on screen. Nothing the preview does moves it: selected from the timeline it has no handles
(the handles are those of the selected clips that are not locked), «Edit curve» does not open on
its line and ends when the clip is locked (`curveLock`, `lineCurve.ts`), and `previewEditableClips`
— the clips the timeline may edit, less the locked ones — is what a drag of a selection, the group
handles, Align, Distribute, Align by symbol and Paste properties ask for, where they asked
`editableClips` (the notice that names the clips that stayed says so). The boxes a dragged formula
snaps to still include it: it is locked to put the others in place around it. A track's lock does
less in the preview and more elsewhere: its clips cannot be edited anywhere, yet a press still
selects them. The timeline sets the mark (`setPreviewLock` in `timeline/clipActions.ts`, one undo
step, which also drops a glyph pick on a clip it locks): the last entry of a clip's menu and of the
menu of several selected clips, and a mark on a locked clip that unlocks it; a clip on a locked
track keeps the lock it has. The preview paints the locked clips faded (`fadeLocked`, at the
`lockedOpacity` preference: 40 % of their own opacity unless Preferences → Locked formulas says
otherwise). It is the panel that fades the drawables it hands its own canvas, so the scene, the
block previews and every export draw them as they are. Align by symbol has a form for them
(`symbolAlign.ts`, `source: 'locked'`, Shift+Alt+G, which a notice answers when no clip is locked):
its reference click (the second one), hover and keyboard cursor take the drawables of the locked
clips and nothing else, the way to align a formula to a symbol no click reaches otherwise; the
symbol to align, clicked first, is still of a clip that is not locked, the one that moves.
