# Architecture §5 (3 of 3): Rules, editing blocks, events

[Index](../ARCHITECTURE.md) · Previous: [§5 Attached objects](05b-attached-objects.md) · Next:
[§6–§7 Animation catalogue, rendering](06-07-catalogue-rendering.md)

Holds §5's subsections *Rules (enforced by `validateProject`)*, with *Blocks that run at the same
time*; *Editing blocks (UI)*: allowed ranges and drags, the timing of a clip copied, groups of
animation blocks, Morph blocks and the pair editor, braces and shapes; and *Events* (`buildEvents`).

See also: [Glyph lifetime](05a-time-model.md#glyph-lifetime) ·
[Attached objects](05b-attached-objects.md#attached-objects) ·
[§7 Rendering](06-07-catalogue-rendering.md#7-rendering) ·
[§8 Timing](08a-export-python.md#timing-frame-grid-then-slices) ·
[§11 The modules of `ui/`](11a-ui-layer.md#ui-modules)

---

### Rules (enforced by `validateProject`)

- Clips on one track do not overlap; a relation therefore always links clips on different tracks.
- `intro.duration + outro.duration ≤ clip length`; duration is 0 exactly for kind `none`.
- A tween lies between the intro end and the outro start; the other actions lie inside the clip.
- An action never animates a glyph while something else animates it: the intro, the outro, a
  relation window (its targets, and its sources — copied ones included) or another action; a tween
  animates every glyph. Manim cannot run two animations on one submobject at once, but it can on
  different ones, so blocks on different glyphs may run together and preview and export stay
  identical. A Morph block's pairs count as an action here, against the intro, the outro and the
  other blocks of their glyphs (`action-overlap` names the Morph block); two transfers on one glyph,
  relations or morphs, never meet this rule: the ownership rules below keep them apart.
- An Emphasis block (`emphasis`: Indicate, Wiggle, Circumscribe, Flash, FocusOn; D73) acts on the
  targeted glyphs on screen when it starts and leaves them as they were. Indicate and Wiggle animate
  them (busy, as under a part Transform); Circumscribe, Flash and FocusOn only measure them then and
  draw something of their own, so they may run while a tween or another block moves them — but not
  start while the intro, the outro, an Appear or Disappear block or a transfer window is still
  drawing them (`emphasis-target-busy`, the rule of `attach-target-busy`).
- An `appear` cannot bring back a glyph a relation or a Morph block consumed (error). Glyphs an
  action lists but leaves out (already on or off screen, still to arrive by a relation or a Morph
  block) and actions that animate no glyph (a Morph block without pairs among them): warnings. So is
  an intro of a kind other than `none` that animates no glyph because its glyphs wait for Appear
  blocks (`intro-empty`; hidden glyphs and transfer targets may add to that).
- Only a clip of a formula or a text starts empty (`starts-empty-kind`, an error on a brace, a
  shape or a line: one piece, which nothing brings in by parts). One that starts empty and has no
  glyph ever on screen — no relation, Morph block or Appear block brings any — never shows: a
  warning (`starts-empty-unused`). Its intro, idle by what the clip is, gets no `intro-empty`.
- Only a clip of a formula or a text leaves glyphs of its own out of its intro (`Clip.startHidden`;
  `start-hidden-kind`, an error on a brace, a shape or a line). Glyphs of the list that the formula
  does not have: a warning (`glyph-range`), as for the formula's hidden glyphs. A clip with such a
  list and no glyph ever on screen never shows: a warning (`start-hidden-unused`).
- A relation is between formulas and texts: a brace, a shape or a line is one piece
  (`KINDS[kind].transfers`), the editor relates nothing with it (`relationBlocker`), and a relation
  a saved project has with one on a side gets a warning (`relation-kind`, on the relation): it still
  plays and exports as it is, as a part Transform or a Morph block of one does (D123), and the
  warning says it cannot be edited and how to delete it. What would edit it — Edit pairs… and Edit
  path… in its panel, the menu of its band and the Relations list, its settings, a drag of its band
  — is greyed out or refused with the reason (`onePieceRelation`, `ui/relations/relationOps.ts`);
  Delete is left, and the relation editor opened on it says why it edits nothing.
- A block of an arrow or a double arrow names all of it (`arrow-part`, an error on the block's
  glyphs, says how to mend one that names a part): Manim's arrow is its shaft, its tips its
  submobjects (`glyphMembers`: `family`), and the Python names the shaft by the arrow, tips and all,
  so a block of a part would play a part in the preview and the whole arrow in the video (audit
  A5-07; the owner's decision). The editor gives such a block every glyph (`animatedWhole`): no
  glyph picker, no split, no copy for other glyphs, and a line that becomes an arrow gives its
  blocks all of it.
- A relation window lies within `[A.start + A.intro, A.end]` and `[B.start, B.end − B.outro]`. Two
  clips can have several relations, with windows that overlap or not (format 31): no rule is about
  the pair of clips, and the ones about glyphs, next, are what keeps two relations off one glyph.
- Over every glyph transfer, relations and Morph blocks alike (errors, at the pair's path): a target
  glyph arrives through one transfer, and through one pair of it — or through several pairs of
  that transfer that bring exactly the same targets, a join taken apart (D167): the first of them
  brings the glyphs and the others arrive onto them, each with its own style and path —
  (`target-conflict`), and through none once a pair has consumed it, since
  it is part of other glyphs then (`target-consumed`); a source glyph is consumed at most once
  (`source-consumed-twice`), and any copy of it starts no later than the window that consumes it
  (`source-used-after-consumed`) — a pair of several sources and one target with `extras: copies`
  consumes its authored principal and copies the others (`sourceRoles`, `model/transfers.ts`, D54);
  a source that another transfer is still bringing in when the window starts cannot be used
  (`source-arriving`; adjacent windows may touch). The messages name the Morph block when the pair
  is one of its, and blame the pair that consumes later in time.
- A glyph is never on both sides of one Morph block (`morph-both-sides`, an error on the block): it
  cannot turn into itself, nor be a source and a target of the same play. One source copied several
  times (in one block or in two that overlap) and 1→n, n→1 and n→m pairs are allowed.
- A Morph block that consumes may start inside the outro (its source stays out of the outro, its
  target leaves at the clip end), but not exactly when the outro starts: at a tie the pair comes
  first, and the outro would take the target too. One that copies collides with the outro on its
  sources.
- A source glyph that is not on screen when its window starts (hidden and not arrived yet, still
  being brought in by the intro or an appear, taken out by a `disappear`): warning (`source-hidden`,
  worded for a relation or a Morph block).
- A `{{ … }}` group that spans an alignment tab (`&`): warning (`group-alignment`). ManimCE splits
  such a group into parts and compiles it; ManimGL keeps the braces, and LaTeX stops at the `&`.
- Hidden tracks are a preview toggle only; they are still exported (the export dialog warns).
- The scene's camera (`Project.camera`, format 34; [§12](12-scene-camera.md#12-the-scenes-camera)):
  every frame of it — the initial one, a target camera's, a move's own — is 0.125 to 80 units tall
  (`camera-frame`); a move's target camera is one of the project's (`dangling-ref`); no two moves
  overlap, though they may touch (`camera-move-overlap`, an error on the later one); and nothing
  else animates while the camera moves: an intro, an outro, a block or a relation that overlaps a
  move is an error on it (`camera-region`, [The locked
  region](12-scene-camera.md#the-locked-region)). Two target cameras of one name are a warning
  (`duplicate-name`). A move that ends after a set duration of the scene is a warning, as a clip is
  (`scene-duration`).
- The marks of the Slides mode (`Project.slides`, format 35;
  [§13](13-slides-mode.md#13-the-slides-mode)) give warnings only, since the scene is whole without
  them: a mark under an animation (`slide-mark-busy`) or past the end of the scene
  (`slide-mark-outside`), which every export leaves out; a comment without words
  (`slide-mark-empty`); a second pause at an instant (`slide-mark-twice`).
- An attached object (`attachIssues`): its target exists and is another clip (`dangling-ref`,
  `attach-self`), its glyph list is not empty and within the target's formula (`attach-empty`,
  `glyph-range`), and the chain of attachments does not go round (`attach-cycle`). When its clip
  starts, none of the target glyphs may be strictly inside the target's intro or outro, an Appear or
  Disappear block or a transfer window (`attach-target-busy`: Manim would measure a formula half
  drawn; a tween or a part Transform is fine, the interpolated glyph is what both measure), and none
  may have left the screen (`attach-target-gone`: a glyph a transfer turned into others, or an outro
  took, is not where the preview measures it). A target glyph not on screen yet is measured where it
  would be, by both: a warning (`attach-target-hidden`).
- Timing validation simulates the edited lifetimes and their incident relation partners, then
  checks transfer ownership, clip lifetime and direct attachment consumers. Diagnostics retain
  full-project paths and stable subject/participant identities. Attachment measurement instants
  are exact clamp boundaries and slot candidates, including after auto-suggested Morph pairs are
  populated. It does not run full validation on every pointer frame. Measuring-only Emphasis owns
  its start instant; later transfers do not shorten its legal duration. Extra transfer ownership
  rivals apply to Morph actions only.

Candidate edits compare structured `Issue.identity` subjects, participant multiplicity and glyphs
through `model/diagnostics.ts`. A new owner worsens an existing conflict; removing owners or glyphs
does not create a false new error. Relation/Morph draft validation also includes new errors on other
owners, while preserving the ability to repair unrelated imported problems. So do the Default style
of a relation's panel and of a Morph block's, which decides what their pairs without a style of
their own consume (`setRelationStyle`, `setMorphStyle`; `introducedError` of
`ui/relations/draftValidation.ts`): a style that gives the project an error it did not have is not
set, and a notice says why (audit A3-04).

<a id="blocks-that-run-at-the-same-time"></a>
**Blocks that run at the same time.** Two blocks of a clip may overlap in time when the glyphs they
animate are disjoint; what each animates is what the lifetime says (an Appear the glyphs off screen
when it starts, a Disappear those on screen, a part Transform its list, a tween every glyph, a Morph
both sides of its pairs). The table gives the outcome for a block that starts while something else
animates one of its glyphs. The planner (`actionConflicts` in `model/conflicts.ts`, whose typed
reason `blockConflicts` words, below) refuses every error case before it reaches the project, and
`ui/animations/__tests__/parallelRules.test.ts` generates every pair of block kinds, on different
glyphs and on a shared one, against validation, the lifetime and the planner.

| The later block… | …meets | Outcome |
|---|---|---|
| animates a glyph another block animates then | Appear, Disappear, part Transform, Morph pair | error `action-overlap`, on the later block |
| is a tween, or meets one | anything | error `action-overlap`: a tween animates every glyph |
| animates a glyph the intro or the outro animates then | the intro / the outro | error `action-overlap` |
| animates a glyph a relation window moves then (a target arriving, a source consumed or copied) | the window | error `action-overlap` |
| is an Appear of a glyph on screen, or a Disappear of one off screen (the other block brought or took it already) | — | warning `action-skips-glyphs`; no conflict |
| is an Appear of a glyph a later transfer brings | a relation / a Morph | warning `action-skips-glyphs` |
| is an Appear of a glyph a transfer consumed | a relation / a Morph | error `appear-consumed` |
| animates no glyph at all | — | warning `action-empty` |
| is a Morph whose source is off screen, or still arriving, or whose target is on screen | the intro, blocks, transfers | warning `source-hidden` / error `source-arriving` / the planner refuses it |
| copies a source after a transfer consumed it | transfers | error `source-used-after-consumed` |
| is a Morph copying a source another Morph or relation copies then | that transfer | allowed: two copies of one source may run together |
| is an Indicate or a Wiggle of a glyph another block animates then (or meets one) | Appear, Disappear, part Transform, Morph pair, tween | error `action-overlap` |
| is a Circumscribe, a Flash or a FocusOn | a tween, a part Transform, an Indicate: anything that moves its glyphs | allowed: it only measures them when it starts; starting while they are half drawn (the intro, an Appear, a transfer…) is `emphasis-target-busy` |
| animates only glyphs nothing else animates then | — | allowed: the timeline stacks the blocks in lanes |

### Editing blocks (UI)

The timeline draws every action as a block in the top half of its clip; blocks that overlap in time
get sub-lanes (greedy, in start order, with the block dragged last — `topBlock` in the timeline
store — on the first lane), and a track grows by one lane height per extra lane —
`ui/timeline/trackLayout.ts` is the only source of row offsets and heights (rows, relation bands and
arrows, link ports, drag targets). The lanes of a track are as tall as its scale says
(`ui/timeline/rowSizes.ts`): a vertical zoom for every track, from the standard height to three
times it by steps of a quarter, set by the keys in the corner over the headers
(`RowZoomControls.tsx`, which keep the track at the top of the view where it is), and a factor of
its own on top of it for a track resized by the two keys beside its name (`steppedScale`: a step
of the same grid for that track alone, up to four times the standard height) or by the top or
bottom edge of its header (`TrackHeader.tsx`; a double-click on an edge removes it). It is a view
state, one object in the
timeline store (`rowSizes`, a new one whenever it changes: the layout is cached by it, and every
caller of `tracksLayout` passes the store's), like the zoom along the time. Each row carries its
`scale` and the height of its lanes, `lane`, on whole pixels: the row hands it to its clips and
blocks as `--lane-height`, the layers over them read it from the layout, and an audio track
leaves the graph of its clips what its caption does not take (`AudioClipBlock`'s `graphHeight`,
over which `volumeScale.ts` stretches). The standard height is the lowest: a track's header needs
its two lines.
What is drawn over the clips sits in layers of its own in the
tracks element, over the clips and under the track headers: the relation windows and arrows
(`TimelineRelations.tsx`), the link ports while Shift is held (`TimelineLinkPorts.tsx`, in a clip's
lower half, so they never cover a block) and the start and end icons of the selected block. The
ruler labels only the stretch around the view, widened by a viewport on each side and kept until the
view leaves it (`useVisibleSeconds.ts`, `labelBand` in `ruler.ts`): an hour at the closest zoom has
72 000 major ticks. A block may move or stretch only within its *allowed range* (the rules in
`model/conflicts.ts`, the clamping in `ui/animations/blockRange.ts`): its bounds (the clip, or intro
end to outro start for a tween), cut at the nearest busy spans (`clipLifetimes`) of the glyphs it
animates; because moving an appear or disappear can change which glyphs it animates, each candidate
position is also checked against a re-simulated lifetime, so a block never passes another animation
of its own glyphs, and against validation: a timing edit never gives a valid project an error it did
not have (a copy of a source stops, exactly, at the transfer that consumes it; a block already in
conflict moves freely, but not into a new error). While a block is dragged, a readout under it
(`BlockDragReadout`, from `blockDrag` in the timeline store and the pure `ui/timeline/blockDrag.ts`)
gives its time, the blocks of its clip it runs in parallel with, and, when the planner holds it
short of the pointer, the planner's sentence for where the pointer asked it to be; the block is
marked meanwhile. The intro and the outro of a clip are stretched the same way, from the grab
zone on their inner edge in the lower part of the clip (`ui/timeline/phaseGestures.ts`, D119; the
strip above is the blocks', which often start where the intro ends): the pure
`ui/timeline/phaseDrag.ts` gives the limits — no shorter than the shortest animation, no longer
than the clip leaves beside the other one, and never over a tween, which cannot share its time
with them — and what the edge snaps to (`blockSnapPoints`); one drag is one undo step, Escape
cancels it, and `PhaseDragReadout` (from `phaseDrag` in the timeline store) says the animation
and how long it lasts meanwhile. **The timing of a clip is copied and pasted** (D150,
`ui/timeline/clipTiming.ts`; «Timing ›» in the menus of one clip, of several and of a sound,
`TimingMenuItems.tsx`): a Copy takes the clip's start, its end and how long its intro and its
outro are into a small clipboard of the app's own (`useTimingClipboard`), and a Paste writes one
of them — the start or the end moves the clip (`constrainMove`, as a drag), the duration moves
its end (`endBounds`, `trimEnd`; a sound's by `trimAudioClip`), the time of an intro or an outro
is `setPhaseDuration` within `phaseLimits`. Unlike a drag, which stops where it can, a paste
does what it says or nothing (`planTimingPaste`, pure): a clip stays when another of its track
is in the way, on a locked track, and when its blocks (`fitActions` would change them) or the
window of a relation of it (`fitWindow`) would be cut — or would no longer fit, for a relation with
a clip on a locked track, which stays where it plays (`lockedBreak`); pasted onto several clips,
each is planned where the ones before it left the timeline (`planTimingPastes`), all in one undo
step, and a notice names the ones that stay and why. A relation's window drags the same way
(`ui/relations/windowRange.ts`): inside its
range, never into a new error, settling on the boundary of the block or window it ran into; while it
is dragged, a readout over the band gives the window (`windowDrag` in the timeline store). New and
duplicated blocks go to the asked time, else the nearest time that fits. A clip's menu on the
timeline asks for the playhead when the playhead is inside the clip, else for the time clicked —
the clip's start from the keyboard (`clipMenuTime` in `ui/animations/blockOps.ts`; its header says
which, `addTimeLabel`) —, as the Animations panel's **Add animation** asks for the playhead (D171,
the rule of a new relation, D166); a block asked for at the playhead that starts elsewhere is
reported by `addBlock` in a notice (`playheadBlockNote`: where it starts, and what stops it at the
playhead — the intro, another block, the end of the clip). While a region is marked on the timeline
(D180, `ui/timeline/region.ts`) the block takes the region instead, whatever time it was asked for:
it starts where the region starts and lasts until it ends (`NewBlockOptions.region`, which
`addBlock` reads from the timeline store; the menu's header says "region 1.00–3.00 s"). It is not
made when it does not fit there, and `regionTiming` says why — the clip does not hold the region,
the region is shorter than a block may be, or what `actionConflicts` finds in the way, worded by
`conflictSentence`; nothing moves it to a free time nearby. A new Morph whose suggested pairs would
not fit in the region comes without them. The blocks the Preview makes at the playhead (a keyframe
of an edit, the Transform that carries a shape to another target) do not look at the region. An
Appear or Disappear of
every glyph that lands alongside other blocks stores the glyphs left for it there as an explicit
list (`planNewBlock`, `parallelComplement`: for an Appear those off screen then that a transfer has
not consumed and does not bring later — what an Appear of every glyph brings there
(`appearSkipReason`; audit A8-02) —, on screen for a Disappear, that the blocks it runs with do not
animate and no other block of its kind names), since
`'all'` would take in the other block's glyphs as soon as either moved and pull every glyph out of
the intro; when nothing is left for it there, it keeps `'all'` and the plan's note, shown by
`addBlock`, says so. **Duplicate for the other glyphs** (`planParallelCopy`, with `complementGlyphs`
in `ui/animations/parallel.ts`) copies a block at its own time for the glyphs it does not name that
such a copy would animate there (off screen for an Appear, by the same rule, on screen for a
Disappear, every other one for a part Transform), moved to the nearest fit, with a note, when they
are busy then. A block
that names glyphs splits into blocks that run at its time on different glyphs
(`ui/animations/splitBlock.ts`, pure; `splitBlockIntoRuns` and `splitBlock` in `blockActions`):
**Split into runs** gives one block per run of consecutive indices, **Split…** (`SplitBlockDialog`,
opened through `splitDialogStore`: a resizable, maximizable `Modal`, its glyph view taking the room
it gains) moves the chosen glyphs to new blocks, one per part set aside in the dialog
(`splitByParts`, `withPart`); a block of `'all'`
divides the glyphs its lifetime says it animates there, and every piece names its
glyphs explicitly. The first piece keeps the block's id and the others are new, as one undo step,
and the first new one is selected; the pieces are one group
(["Groups of animation blocks"](#groups-of-animation-blocks), below). A Transform block is a tween
(whole formula, keyframe) or a part transform (chosen glyphs, relative fields); the panel turns one
into the other keeping id, time and easing (`planKindChange`, re-slotted when the other kind's
bounds need it), and a new part names no glyph until the picker does. An **Emphasis block** (D73)
comes from **Add animation → Emphasis → Indicate / Wiggle / Circumscribe / Flash / FocusOn**, on
every glyph on screen (`'all'`), in the `--block-emphasis` colours; the panel's **Effect** select
and the block's menu run another effect keeping the time and the glyphs and taking the new effect's
defaults (`convertEmphasis`), and the panel shows the effect's own settings (the colour, the scale,
the angle and the wiggles, the gap, the stroke and the time width, the opacity) with the pulse
easings alone for an Indicate and no easing for a Flash. The start and end icons of a selected
Transform block (`ui/timeline/BlockStateIcons.tsx`, `ui/animations/transformEdit.ts`) work for both:
the end icon puts the playhead where the block reaches its target and the preview edits that target
— the tween's keyframe, or the part's shift (drag), scale and rotation (handles on the part's box,
turned with its glyphs when they all turned by the same angle — `partTurn`, `turnedBox` — else
upright) — with the start state drawn faintly.

<a id="groups-of-animation-blocks"></a>
**Groups of animation blocks** (`model/groups.ts`, format 19). A block that names glyphs (appear,
disappear, part transform, emphasis) can carry `group`; the blocks of a clip with the same one are a
group, like the animations of Manim's `AnimationGroup`: two or more, one start, one duration, each
with its own animation, glyphs and options. The group is a mark and nothing else: the engine, the
lifetimes, the conflicts and the export read the blocks as they always did — blocks that run
together are one `self.play` already, and the pinned Python of `examples/animation-blocks.mfe.json`,
whose simultaneous blocks are grouped, did not change. The rule is kept in one place: a block that
no longer runs with its group leaves it (`repairClipGroups`), which the project store applies after
every recipe (`update` and `amend`) and the loader to a file, with a warning
(`animation-group-repaired`). So no operation dissolves a group by hand, and an edit that moves one
member alone takes it out. The timing of a member is its group's: `blockLimits`, `clampTiming` and
the reason a drag stops (`stopReason`) answer for every member (`movedWith`), `setBlockTiming`
writes all of them in one step, and a block does not snap to the edges of its own group; a drag,
Alt+arrows and the panel's Timing fields therefore move a group as one. Three things make a group:
the pieces of a split (`pieces` in `splitBlock.ts`: the block's own group, else a new one), a copy
for the other glyphs that lands alongside its block (`Plan.joins`, applied by `insert`), and **Group
with the blocks that run with it** (`groupBlocks` over `runsWith`: same start, same duration; a
group among them joins whole). A copy made after a block is on its own (`planCopy`), a block that
changes its animation stays in its group (`convertBlock`), and a group is copied whole where all its
blocks fit (`planGroupCopy`, `findBlockSlot` with `mates`) and deleted whole after asking. On the
timeline (`timeline/blockGroups.ts`) a group is folded into one block on one lane unless it is
unfolded — `unfolded` in the timeline store, a view state no file keeps and the next document starts
without: `drawnBlocks` gives what is drawn, `clipLanes` one lane for a folded group
(`ClipLanes.shownAs` names the block that draws each block), and `GroupBlock` draws it, standing for
its selected member, else its first. The selection stays `{ kind: 'action' }`: the menus, the keys
and the keyboard ask `foldedGroupOf` whether the selected block is drawn as its group, and act on
the whole group then. The Animations panel shows the group of the selected block above its settings
(`GroupMembers`).

<a id="animation-icons"></a>
**Every animation has an icon** (D189; `ui/animations/animationIcons.ts`, drawn by
`AnimationIcon.tsx`). The drawings are data in the 16×16 box of `timeline/icons.tsx` — paths stroked
with the house stroke or filled, mirrored for the reverse of an animation —, and one function per
place says which icon a thing shows: `phaseIcon` (an intro, an outro, the animation of an Appear or
a Disappear block), `emphasisIcon`, `relationIcon` (a relation's style, a pair's own), `blockIcon`
(any block: a Transform of the whole object has one for a shape carried around other glyphs, one for
a line's ends and one for the rest) and `groupIcon` (a folded group: its members' when they share
one). The module's test reads the kinds from the format's schemas and from the catalogue, so a kind
added later fails until it has an icon. On the timeline a block, a folded group, an intro and an
outro draw their icon before their name (`ActionBlock`, `GroupBlock`, `PhaseName` in
`ClipBlock.tsx`). One too short for its name — all of a short name, four letters and the «…» of a
long one, after the icon: `blockShowsName` and `phaseShowsName` in `timeline/layout.ts` — draws the
icon alone and keeps the name in the page, hidden, and in its tooltip. In the vertical timeline the
name runs down the block under the icon ([Zen mode](11c-ui-look-views.md#zen-mode)). The menus and
the panels do not draw the icons yet.

<a id="a-morph-block"></a>
A **Morph block** comes from **Add animation → Morph within the formula** without pairs, so it
fits anywhere in its clip; it is drawn in the `--block-morph` colours (a blue in both themes),
labelled "Morph · n" (n pairs), and its menu starts with **Edit pairs…** and has no animation to
change. Its allowed range is its clip cut by the busy spans of both sides of its pairs, its own
transfer's left out (and another transfer's that only copies a glyph it copies: two copies of one
source may run together), and each candidate position is checked against what its pairs need: every
source fully on screen when it starts (not absent, not still arriving through another transfer) and
no target on screen then through anything but the block. `actionConflicts` returns why a block
cannot be where it is, as a typed reason (`ActionConflict`: its bounds, a consumed glyph, what a
Morph needs, the animation it runs alongside, the validation error it would add), which
`blockConflicts` words naming the glyphs ("Source glyph 4 “=” is not fully on screen
Morph block starts."), or null; `clampTiming` and `findBlockSlot` only test it against null. A copy
(`planCopy`, "Duplicate without pairs") keeps the style, path arc, duration and easing but not the
pairs, since a target has one owner. The panel edits the default style and the path arc, lists the
pairs read-only and opens the pair editor (`openMorphEditor(clipId, actionId)`); a selected morph
outlines both sides of its pairs in the preview and has no start and end icons.

<a id="the-pair-editor"></a>
The **pair editor** (`ui/morph/`: `MorphEditor.tsx` in a stable `MorphEditorHost` outside responsive
panel branches) draws the formula twice — sources on top and targets below, or side by side — with
the relation editor's canvas (`GlyphLinkCanvas` with the `morph` test-id prefix and per-side
`ineligible` reasons and `notes`: [the drawing that links
glyphs](11c-ui-look-views.md#the-drawing-that-links-glyphs), whose spacing by the text, circle
selector, view and layouts keep the glyphs of a tall derivation readable), the relation editor's key
and preference for the lists of glyphs, its pair list and pair menu, and the same draft session
(`relations/usePairSession.ts`: the pairs with an identity each, their selections, suggestion, hover
and menu, the gestures of `pairGestures.ts`, the pair operations of `relationOps.ts` on any
`PairHolder`, the deletion dialog and the re-base; what differs comes in as options: the holder with
its default style, `linkMorphPair`, the block's `morphProblems` and the canvas's reasons for «Link
as» (`relations/linkAs.ts`), the wording, and `selfPairs`). What may take part comes from
`morphEligibility` (`morph/morphDraft.ts`), on the lifetime with the block's own pairs taken out, so
that linking never changes what is offered: a source is fully on screen when the block starts and
not consumed by then; a target is off screen until then — or on screen only because the intro
brought it: linked, it skips the intro and arrives through the block — not consumed, not a source of
an earlier transfer, and brought in by no other relation or Morph block. The other glyphs are dimmed
with the reason in their tooltip ("not on screen yet", "still arriving", "brought in by a relation",
…) but stay clickable; a glyph on both sides of the block is refused when linked (`linkMorphPair`).
**Suggest pairs by label** (`suggestMorphPairs`) walks the eligible targets line by line
(`lineOrder`: rows top to bottom, then left to right) and gives each the nearest eligible source
before it with the same label, each source once: on `A &= x_1 \\ &= x_2 \\ &= x_3` a block at 2 s
gets row 1's `=` and `x` → row 2's and, that one saved, a block at 4 s row 2's → row 3's. The
suggestion is drawn dashed until accepted; with the `autoSuggestMorphPairs` preference (off by
default) a new block starts with it. The Problems list (`morphProblems`) is what validation says of
the draft: the block's issues, its clip's `action-overlap` issues and every other issue the pairs
cause elsewhere (another transfer's ownership, an Appear block emptied by a target). **Save pairs**
writes only the pairs, in one `editBlock` update (one undo step); it is off while nothing changed,
while there are errors, and when the formula re-rendered and the draft could not be re-based through
the published transition (`pairSession.ts`). Loading another document closes the editor.

<a id="braces-and-shapes"></a>
**Braces and shapes** (D123). A brace and a shape are one piece each (`blockSubject`): their Add
animation menu has the Transform of the whole object alone and no Morph, their Transform has no
whole / part switch, and the words name the object, not a formula; `planNewBlock` and
`planKindChange` refuse a transform of a part and a morph on them, and one a saved project has keeps
working. **Add brace** is offered on a shape, on the whole of it, and for several selected clips —
`planSpanningBrace`: one brace over them all through `attach.also`, null with a brace among them,
refused when they are never on screen together. **Add shape** is offered for several selected
clips likewise (`planSpanningShape`, D126: one shape around them all, null with a brace or a shape
among them — no menu puts a shape on either). A shape's Transform (`TweenEditor`) has the paint
fields behind their ticks, each starting from what the shape has there (`shapePaint` of the state
before); its object has a Fill colour behind a tick, in the Shape section and in its editor. **«To
another formula or glyphs…»** (`preview/shapeRetarget.ts`) is a mode of the preview, as align by
symbol and Edit path are: `startRetarget` — from the shape's clip, Add animation or the shape in the
preview — sets the request, the preview shows a hint with what is chosen and a «Transform here»
button, and the selection works as always; `chosenTargets` reads the picked symbols when there are
some, else the selected clips whole, never the shape's own. Enter (`useShapeRetargetKeys`, taken
before anything else hears it) or the button calls `confirmRetarget`: `planRetarget` makes a fit
tween of a second at the playhead through `findBlockSlot`, or gives the tween of «Pick again…» its
new targets, and refuses what validation would not stand, with its words; it is one undo step, and
the block is selected. A shape on a locked track is refused when the mode starts and again when the
Transform is planned (`shapeLock`): the track may be locked while the target is chosen, and the mode
then stays on, as after any refusal. The block is drawn as any Transform, labelled with where to
(`blockLabel`, `attachHosts`); its panel names the targets (`describeTargets`) in place of the
placement fields; the preview outlines them while it is selected; its end icon only shows the end
state. A shape a fit places (`fitInEffect`: the keyframe in effect is one) does not move by hand in
the preview, and the notice names that Transform rather than what the shape first hung on.

### Events

`buildEvents(project)` flattens the project into `IntroEvent`, `OutroEvent`, `TweenEvent`,
`TransferEvent` (one per glyph transfer, keyed like its lifetime causes), `AppearEvent`,
`DisappearEvent` and `PartTransformEvent` records with absolute times, sorted by start; the glyphs
of intros, outros, appears and disappears come from `clipLifetimes`, and an action that animates no
glyph produces no event. **The evaluator (preview, video) and the code generator both consume these
events** — that is the mechanism that keeps them in agreement. Any timing rule lives in
`buildEvents`, not in its consumers.

An evaluator and a codegen context each prepare lifetimes once and pass that local map to
`buildEvents(project, lifetimes)`. The one-argument convenience call prepares its own map. Reuse
lasts only for that operation and project value; edits, undo, render-map replacement and
attachment-settling passes still create fresh evaluators. Validation keeps its independent
lifetime pass, and hidden tracks remain included in events and exports.
