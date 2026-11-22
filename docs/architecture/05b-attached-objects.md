# Architecture §5 (2 of 3): Attached objects

[Index](../ARCHITECTURE.md) · Previous: [§5 Time model](05a-time-model.md) · Next:
[§5 Rules, editing blocks, events](05c-rules-blocks-events.md)

Holds §5's subsection *Attached objects*: labels, braces and shapes hung on glyphs of other clips
and how both libraries measure them, objects over several clips, a shape's paint, a tween that
carries a shape (`fit`), `placementUses`, Manim's basic shapes, lines and arrows, curved lines and
tips, GrowArrow, and a tween that carries the ends of a line.

See also: [Object kinds](01-03-foundations.md#object-kinds) · [Existing producers and geometry
conventions](04-formula-engine.md#existing-producers-and-geometry-conventions) ·
[Rules](05c-rules-blocks-events.md#rules-enforced-by-validateproject) ·
[§8 Glyph membership](08a-export-python.md#glyph-membership) ·
[§11 Drawing a line](11a-ui-layer.md#drawing-a-line)

---

### Attached objects

An object can hang on glyphs of another clip (`clip.attach = { clipId, glyphs, rule, …, buff }`, R4,
D65): a label beside some glyphs (`rule: 'next_to'`, with a `side`), a brace fitted to them (`rule:
'brace'`, with a `direction`; D66), a label at the tip of a brace (`rule: 'tip'`; D69), a shape
fitted to them (`rule: 'shape'`; D71). Its placement is **derived from the target glyphs as they are
when the attached clip starts** — the target's state, tweens and part transforms at that instant —
and is static afterwards, exactly as a `Brace` or a `next_to` in Manim measures its target once,
when it is built; there are no updaters. The measure follows each library's box rule, on the point
lists Manim stores (`toPointPath`, `pointPathBox`), never on the rotated box of `geometry(t)`:
ManimCE takes corners and centres from the anchors of the curves (`get_critical_point` reads
`get_points_defining_boundary`, the anchors of a VMobject) and widths from every point, ManimGL
every point for both (`scene/measure.ts`; `SceneEvaluator.measure`). The attach sync
(`store/attachSync.ts`) recomputes the placements after every change of the project or of a render
and writes them into `clip.initial.position` with `amend`, as derived data without an undo step
(like a snapshot); detaching (`attach: null`) freezes the object where it is. A brace is fitted as
well as placed: its target is measured in the frame where the brace points down (turned by minus the
direction about the origin, as `Brace` turns it), the box across the direction gives the brace's
`width` — written into the object, whose render (`geom/brace.ts`, through its glyph producer)
follows —, and the brace built for that width goes with its upper-left corner `buff` below the box's
lower-left one, turned back: the clip's position and rotation. The first attached clip of a brace
object fits its width; another clip of the same object is placed with it. A label at a brace's tip
goes where `brace.put_at_tip(label, buff=…)` puts it, `next_to(tip, np.round(direction), buff)`,
from the brace's points when the label's clip starts (its tweens until then count): the evaluator
hands them over as rendered and as placed (`SceneEvaluator.points`), the tip is the point the
library fixed when it built the brace, found where the brace points down — ManimCE's point nearest
the bottom centre of the anchors' box, ManimGL's lowest point (`braceTipIndex`) — and read where it
is placed, and the direction runs from the centre `get_center` reads to the tip, rounded half to
even on each axis as `np.round` rounds (`readBraceTip`). It is measured, never taken from the
brace's angle: a tilted brace's box is off its axis, so at 30° or 62° the label goes to a corner
where the angle alone would give a side. A label's `buff: null` is the gap `get_tex` leaves in the
project's library (`BRACE_LABEL_BUFF`). A shape is fitted to the target's box as its Manim class
fits its own (`scene/shapes.ts`, `fitShape`, checked point for point against both libraries,
`gen_decorations.py`): a box (`SurroundingRectangle(target, buff=…)`) is the box of every point
`buff` wider on every side, centred on it (ManimCE wraps the target in a plain `Group`, whose centre
is every point's, not the anchors'); a circle (the export's `_circle_around`:
`Circle(radius=hypot(width, height) / 2 + buff).move_to(target)`) runs through the corners of that
box `buff` further out, centred where `get_center` reads (each library's own `Circle.surround` means
something else: a `buffer_factor` in ManimCE, a circle as wide as the target in ManimGL); an
underline (`Underline(target, buff=…)`) is as wide as every point and hangs `next_to` the critical
box, `buff` below it; a cross (`Cross(target)`) stretches its two lines over the width and height of
every point, centred where `get_center` reads; a cross line (`cross_line`, D128) is one of those
two lines — along its `diagonal`, the rising one unless it names the other (`diagonalOf`), from the
first corner the diagonal names to the second, where the cross runs its rising line downwards —,
fitted as the cross is and, like it, at no gap (`overCorners`). The size goes to the object
(`width`, `height`, whose
render follows through its producer; the first attached clip of a shape object fits it, another clip
of the same object is placed with it) and the centre to the clip, which stays unturned. The pure
settle of a project value (`settleScene`: the pins, the export check) remakes the renders a pass
changed through `refreshLocalRenders`, as the render sync does in the app. Both pure and live sync
derive their propagation bound from the attachment graph's depth, including shared fitted-size
ownership; there is no fixed eight-pass ceiling. `attachmentReadiness` and `settleScene().readiness`
distinguish settled attachments from missing/stale renders, unsupported fits, unmeasurable glyphs,
cycles and unresolved dependencies. Cycles are reported instead of iterated. Persisted shape fits
must have finite nonnegative dimensions and finite placement: a valid negative inset or exact zero
is supported, while an unsupported fit keeps the last valid geometry. `attachmentIssues` reports
`attach-shape-fit` in the clip's problems and export diagnostics, cached by project and render map
in the UI. Temporary Circumscribe contours retain their separate finite signed-gap semantics.
New brace labels use the same `creator/newFormula.ts` defaults as ordinary formula creation,
including the Standard scale of their kind; existing labels do not change with it, but «Apply to
all» of its dialog sets them as it sets every object of their kind. The Python places the
mobject the same way, in the step where its clip starts, so the readable form
(`f2.next_to(f1[0][2:5], DOWN, buff=0.25)`) is exact by construction: Manim measures the real glyphs
at that instant ([§8](08a-export-python.md#glyph-membership)). A glyph transition of the target's
formula remaps the attachment's glyphs (`remapGlyphRefs`); deleting the target deletes what hangs on
it (`deleteClips`, asking first), and a duplicate keeps its attachment, moved to the copy when the
target is copied too.

A brace or a shape can span **glyphs of several clips** (`attach.also`, format 21, D117): the
attachment names the glyphs of one clip as any does, and those of the others in `also`
(`attachTargets` lists them all, `spansClips` says whether there are several). It is what
`Brace(VGroup(…), direction, buff)` and `SurroundingRectangle(VGroup(…), buff=…)` are in Manim, and
it is measured the same way: the point lists of the glyphs of every target, at the instant the
object's clip starts, boxed as one group by the library's rule (`measureTarget` in
`scene/attach.ts`; the union of the anchors for ManimCE's corners, of every point otherwise), in
the brace's own frame when it points to a side. Everything above then holds with that group for a
target, and of each clip: the dependency graph and the readiness count every target, validation
asks each for quiet glyphs that are still there, and the chain of attachments is followed through
all of them. The Python builds it on the group, `b1 = Brace(VGroup(f1[0][2:5], f2[0][0]), DOWN,
buff=0.2)`, each clip's glyphs named as for one target (the export check's `spanning` case holds
both libraries to the preview, frame by frame). One rule differs: such an object is **not deleted
with one of its clips**. `deleteClips` frees it in the same undo step — `attach: null`, where it
is, with a label at its tip still hanging on it (`freedClips`; a notice names what was detached,
`timeline/freedObjects.ts`) —, as a render that leaves one of its targets without glyphs does; an
object on one clip still goes with that clip. A duplicate hangs on the copies of the clips copied
along with it and on the others as they are. It is made from glyphs picked in several formulas in
the preview (`glyphActions.ts`): its clip runs where the windows of all its targets meet
(`attachedWindowOver`), on a track in front of the front-most of them, or behind the back-most for a
highlight. Whatever it hangs on, the track of a new attached object is looked for on its own side
only (`nearestFreeTrack`: the nearest track with room in front of its target, or behind it for a
highlight), and a track is opened right beside the target's when that side has none
(`newTrackBeside`, D137): an object that goes in front never lands behind, nor a highlight in front.

<a id="a-shapes-paint"></a>
**A shape's paint** (D123, format 23; `model/shapePaint.ts`). A shape object paints with its `style`
and one colour, unless it has a `fillColor`: Manim's `fill_color`, the fill's alone, the stroke
keeping `color` and the colour a clip overrides it with. A clip state can carry the paint a tween
sets — `strokeWidth`, `strokeOpacity`, `fillOpacity`, `fillColor`, each optional, the object's own
while absent — and the chain of states hands it on from tween to tween like any other field. The
evaluator paints such a shape from the state of its clip rather than from its render
(`anim/pose.ts`, `Pose.paint`; `paintsApart` says which shapes: one with a fill colour of its own,
or one a state repaints — any other is drawn exactly as before). Between two keyframes every channel
goes linearly, as `Transform` interpolates a style in both libraries (MANIM-QUIRKS, "5 bis"): the
stroke's width, the two colours component by component — the fill's from the stroke's colour when it
had none of its own, and an invisible fill has a colour all the same —, and the two opacities *with
the clip's opacity in them*, since what Manim holds and interpolates is the product: a clip that
fades out while its fill fades in shows no fill on the way. A line and a cross have no inside to
fill (`hasInside`).

<a id="a-tween-that-carries-a-shape-to-other-glyphs"></a>
**A tween that carries a shape to other glyphs** (`TweenFit`, D123). A tween on a shape's clip can
have a `fit`: the glyphs of a clip, and of others (`also`), that it carries the shape to surround —
Manim's `Transform(shape, SurroundingRectangle(other))`. It is a tween, so it keeps a tween's rules
(between the intro and the outro, clear of the other tweens) and its place on the timeline; what
differs is where it ends. The attach sync measures its target *when the tween starts* and fits the
shape to it as an attached shape is fitted (`fitShape`, with the gap of the shape's own attachment,
`fitGap`), writing the box it finds into `fit.fitted` as it writes an attached shape's size
(`deriveFits`; the targets of a clip's fits are dependencies of the clip in the attachment graph, so
a fit is placed after its target and a chain that goes round is refused). `actionStates` then ends
the tween on that box — its centre, unturned, at scale 1, whatever `to` says of the placement — and
carries the box's size along the chain beside the state (`ActionStates.fit`, `TweenEvent.fit`); an
easing that returns gives both back. The evaluator draws the clip by stretches (`anim/fit.ts`): the
render's own shape until the first such tween, afterwards the shape of each fit's size
(`shapeContours`, centred as the producer centres a render) under the clip's pose; while one runs,
every point goes from where it is — the earlier shape as the state before the tween places it,
turned and scaled as it was — to the new shape where the fit puts it, which is what a `Transform`
between two shapes of one kind does (both libraries build them with the same number of points, so
nothing is aligned; a circle passes through the circle of the mean radius, not the one around the
box in between). What is drawn, `geometry`, `points` and `measure` all read the shape that way, so a
brace made on the shape afterwards hangs on it where it is. Validation asks of a fit's targets what
it asks of an attachment's, at the instant the tween starts (`attach-target-busy`, `-gone`,
`-hidden`, `attach-cycle`), and that the clip be a shape's (`fit-shape`). A fit follows its glyphs
when its target is rendered again (`remapGlyphRefs`; left with none, the tween goes), goes with the
clip of any of its targets (`deleteClips`), and a duplicate goes to the copies of its targets.
Nothing follows the shape to its new place: what hangs on it was fitted when its own clip started.

What places a clip by glyphs of other clips is listed in one place: `placementUses(clip)`
(`model/placementRefs.ts`) gives its attachment and the fits of its tweens as *uses* — the owner of
the reference, the instant its targets are measured at (the clip's start, the tween's), where it is
in the clip, and the targets as the project holds them, so that a draft's can be written.
Validation, the instants a change of timing is measured again at, the glyph remap, deletion,
duplication, the attach sync and the plan of the generated Python read that list, each with its own
policy for each owner (a lost target frees an attachment and removes a fit); something new that
places a clip is added there. The placements themselves have two writers, `applyAttachments` on a
draft (the app) and the pure one inside `settleScene` (the pins, the export check), which
`scene/__tests__/placementWriters.test.ts` holds to each other.

`geom/shapes.ts` builds Manim's basic shapes as each library builds them, point for point (fixtures
sampled from both venvs, `gen_shapes.py`): `Circle` (ManimCE's eight cubics, ManimGL's sixteen
quadratics raised to cubics, a `Dot` being the same circle in another style), `Rectangle` and
`RoundedRectangle` (a quarter arc per corner, one cubic or two quadratics, between straight runs;
ManimCE keeps the cut of a corner within half the shorter side), `Line` with its buff (a line
shorter than twice its buff stays whole in ManimCE and shrinks to its midpoint in ManimGL) and
ManimCE's `Arrow` — the shaft shortened by the buff and by the tip, a filled triangular tip, both
the tip and the stroke width capped by the arrow's length — which `Line(...).add_tip(length=,
width=)` reproduces in ManimGL with the same values, so the export writes that there.
`MANIM_SHAPE_STYLE` records each shape's default style (fill opacity, stroke width and opacity: a
`GlyphStyle`, the style a glyph paints its path with; a text glyph's is `TEXT_STYLE`, filled without
a stroke). The shape objects are built on these.

<a id="lines-and-arrows"></a>
**Lines and arrows** (`line`, format 26, D137). A line object is Manim's `Line`, `DashedLine`,
`Arrow` or `DoubleArrow` along its `vector`, from where it is drawn to where it ends:
`geom/lines.ts` (`lineParts`) builds its members in the order of the mobject's family, each with its
paint — the line; the dashes of a dashed line, the line itself left without points; an arrow's shaft
and then its tips, the one at the end first —, and its producer centres them where the library
reads the centre of the line (`lineCentre`: the middle of the line unless a tip widens the box on
one side or a curve bulges out of it, and `lineEndsAt` gives the two ends back for a clip's state).
Measured in both venvs (`gen_lines.py`, 144 cases each, `scene/__tests__/lines.test.ts`): the two
libraries cut the dashes differently (ManimCE at least two, the first at the start and the last at
the end; ManimGL as many as fit, the last ending a little short, one for a short line and none for a
line of no length); a short arrow's tip is capped at a quarter of its length and its stroke at five
times it, a double arrow's stroke at five times what its two tips leave of it (ManimCE measures it
once the second tip has shortened the shaft); and ManimGL, whose own `Arrow` is a filled polygon,
builds the same members as a `Line` with `add_tip(length=, width=)` — but not with two of them: a
second `add_tip` moves the first tip, so the export writes an `_arrow` helper there, and no tip at
all on a line of no length. A line has **no scale, turn or flip of its own**: its two ends say where
it is. ManimCE's `Arrow` keeps the size of its tip when it is scaled and sets its stroke again from
its length, so nothing that scales a line would look alike in the two libraries; the kind takes the
intros and outros that draw or fade it (`KINDS.line`), the editors offer no scale, turn or flip for
it, and `validateProject` refuses them (`line-pose`, `line-animation`: a pose that is not plain, a
fade with a scale, a block that scales or reshapes). A clip of a line hangs **by its ends** (`rule:
'ends'`, `EndsAttach`): `start` and `end`, each the glyphs it is on or a point of the scene, at
least one on glyphs, and the `buff`. An end on glyphs also says where on them it is (`anchor`,
format 27, D140): `auto`, the edge the library finds towards the other end, or one of the nine
points of their box — a corner, the middle of a side, the centre —, which the sync reads as
`get_critical_point` does in the project's library and hands on as a point (`glyphEndInput`,
`lineEndInput`). The attach sync measures them as `Line(start, end, buff=…)` does when it is given
mobjects (`scene/lines.ts`, `manimLineEnds`): each end's rough place — its point, or the centre
`get_center` reads —, the direction from the one to the other, then for an end on glyphs with the
anchor `auto` their edge that way, which the two libraries mean differently: ManimCE
`get_boundary_point`, the first of the anchors farthest along the direction; ManimGL
`get_continuous_bounding_box_point`, where the ray from the centre of the box of
every point leaves it. The line between the two is then `buff` shorter at each end, a free one too
(ManimCE leaves a line shorter than twice its buff whole, ManimGL shrinks it to its middle). The
sync writes the object's `vector` and the clip's position, unturned (`fitLineClip`; the first
attached clip of a line object fits it, another clip of the same object starts where its own ends
put it and runs along that vector). As for every use of other clips' glyphs (`placementUses`), the
ends are followed through a new render of their host, validated at the instant the line's clip
starts, and copied with it; a line with an end, or both, on one clip goes with that clip, and a line
between two clips is freed whole when one of them goes (`spansClips`), as when an end loses its last
glyph. An end goes on a formula or a text, not on what is itself fitted to others (`attach-rule`).
Two ends Manim finds no line between — at one place with glyphs among them, both on one formula at
`auto` for instance: `manimLineEnds` has no direction to look for an edge in, and ManimCE draws
nothing there while ManimGL stops the scene — are refused by the line tool as two free points at one
place are (`planLine`, `moveLineEnd`), and a saved one is reported by `attachmentIssues`
(`attach-line-ends`, `foundLineEnds`), in the ends a Transform carries a line to as well; the sync
leaves such a line as it was.
The Python builds a line in the step where its clip starts, on the mobjects themselves — `l1 =
Arrow(f1[0][0:2], f2[0])`, `l1 = DashedLine([5.5, 3, 0], f2, buff=0.1)` (`lineLines`,
`lineConstruct`) —, so that Manim finds the edges as the editor did, and an end with an anchor as
the point read off them, `l1 = Arrow(f1.get_corner(DR), f2[0].get_left())`; ManimCE's classes cap a
short arrow themselves, and for ManimGL the editor writes the capped values, from the vector it
fitted. A free line is built between the two points its clip's first state puts its ends at (the
emitter is `placed`: the setup adds no move), and a line object with several clips at the points the
project has each of them — the points the project's library gives: a clip's position is the centre
that library reads, and the other reads the centre of an arc or of a dot tip elsewhere, so an export
to the other library also moves a line by vectors, not `move_to` (audit A4-05; the export check's
`loose-arcs-from-other-target`). An arrow's glyphs are the mobject and then its submobjects
(`glyphMembers`: `family`), which is what ManimGL's lag counts from and how the generator names
them. ManimGL's `Line` is light grey unless told, so its colour is always written there. The export
check's case `arrows` renders every kind with both libraries and holds the preview to each frame.

<a id="curved-lines-and-tips"></a>
**Curved lines and tips** (format 28, D145, D146). A line object's `curve` bends it between its two
ends — `vector` still runs from the one to the other —, and `tip` and `startTip` are the shapes of
its tips. `geom/lines.ts` (`buildLine`) makes the way of the line as each library holds it,
ManimCE's cubics and ManimGL's quadratics, and from it the members, their capped values and the
centre the library reads (`LineBuild`). An **arc** is the `path_arc` of each class: ManimCE's
`ArcBetweenPoints`, eight cubics, and ManimGL's `add_arc_to`, a quadratic for each eighth of a turn.
Manim leaves the gap at an end (`buff`) **along the arc**, cutting it by curve count: the part of
the arc it takes at each end is the curve's `trim`, which the attach sync derives with the vector
(`arcDrawn`, `drawnEnds`; ManimCE measures the arc by its pieces, ManimGL takes a clockwise arc to
be as long as the distance between its ends, and the preview follows each), and a free arc that
keeps one is written between the points that gap was taken from (`arcUndrawn`). A **tip** has its
point on the end of the way, along the way there, and the way is then put between its start and the
base of the tip — turned and scaled about its start, what `put_start_and_end_on` does —; a double
arrow's second tip is made on the way the first has shortened, and the first turns with it, as
ManimCE's `DoubleArrow` builds them. The shapes: Manim's triangle; ManimCE's `StealthTip`, with a
stroke of its own, whose base is its notch; a dot as wide as the tip is long. The dashes of an arc
are each library's, counted by the distance between its ends. A **spline** is cubic stretches
through nodes in the frame of the two ends, the first at (0, 0) and the last at (1, 0), as a pair's
path is — validation refuses any other (`line-curve`), whose line would not end at its end —
(`splineStretches`; a handle that is not there sits a
third of the way to the next control point, so that a tip finds its way): no class of Manim draws
it, so the export bends the straight line of the class with a `_spline` helper — ManimCE holds the
cubics; in ManimGL, whose own conversion of a cubic fails where the curve leaves an anchor straight,
each stretch is eight quadratics tangent to it — and cuts its dashes with `_dashed`, ManimCE's rule
in both libraries. ManimGL takes the tips it lacks, and two tips, from `_arrow`, which puts them on
as ManimCE does; its own dot is asked twice as long. A bent line fades by its stroke
(`opacityChain`): Manim's `set_opacity` would fill what the curve encloses. All of it is held to
both venvs (`gen_curved_lines.py`, 254 cases each, `curvedLines.test.ts`: every point of every
member, the caps and the centre; the generator holds the text of the export's helpers, which a test
compares) and rendered by the export check (case `curves`). In the editor
(`ui/preview/lineCurve.ts`) a line is bent and never unbent — a straight one into an arc or a
spline, an arc into a spline —; what changes the centre of a line (its curve, its tips, its kind)
keeps the ends of a free clip where they are (`relook`), and takes from its Transforms the degrees
they held once the line is no arc a Transform can change (a spline, a dashed line); an arc's
degrees are a field and a handle
in the preview, a stem along the arc where it leaves its start (`arcFromPointer`); the shape of a
path is copied and pasted between lines of any kind (D151: `copyLineShape`, `pasteLineShape` and
the app's own small clipboard `useLineShapeClipboard` — straight, an arc's degrees, a copy of a
spline's nodes, which are in the frame of the two ends and so fit the line that takes them; never
the tips, the kind, the stroke or the ends — the one way back from a bend besides Undo, in «Curve ›»
of a line's menu and in the menu of several clips); and a spline is
shaped in the mode «Edit curve» (`useLineCurveEdit`, `LineCurveLayer.tsx`), one of the preview's
modes, with the pure edits of the custom paths (`pathEdit.ts`) on the nodes as the line draws them
(`explicitNodes`; a smooth point's handles mirror each other there too, `handleLink`, D176): each
change is an undo step, Enter keeps the curve and Esc puts back the one the mode started with —
its keys (`useLineCurveKeys.ts`; Delete and Backspace with no point selected too, which then
remove nothing where the timeline would delete the line's clip) and its Done hold wherever the
playhead is, its points only while the line is on screen there (`curveShownAt`), and it opens with
the playback paused and the playhead on the clip (`mainPlayback`). It does not open on a clip on a
locked track or locked in the preview, and ends — saying so, the curve kept — when its clip is
locked while it is on (`curveLock`, `startLineCurveTracking`); `setLineNodes` writes nothing for
such a clip.
**GrowArrow** (format 29) is one more intro, `grow_arrow`, which an arrow or a double arrow alone
takes (`introsOf`; `validateProject` refuses it elsewhere, `grow-arrow`, `line-animation`): Manim's
`GrowArrow` scales the arrow from nothing about its start, tips and all, so what is drawn at a
progress is the arrow scaled by it about that point (`growArrowLook`, the start read off the render
by `lineEndsLocal`); ManimCE's `Arrow` sets its stroke from its length and so grows the shaft's
stroke with it, ManimGL keeps the stroke, and the preview follows the project's library. The export
writes `GrowArrow(l1)` on the arrow itself — ManimCE's scales it with its tips, which only an
`Arrow` takes, and a spline's is one still. A lag ratio of its own goes with it (`lag_ratio=`, to
`_TraceArrow` below too) and staggers the members — the shaft, then the tip at its end, then the one
at its start — in both libraries as in the preview (the export check's case `grow-arrow-lags`; audit
A5-03). A **bent** arrow (`tracesAsArrow`: one
with a `curve`) grows otherwise (D149), by an animation of the editor's own, since scaling a curve
about its start only swells it: its shaft is drawn from its start as `Create` draws it
(`pointwise_become_partial`, by the count of its curves — ManimCE's cubics, ManimGL's quadratics),
the tip at its end sits with its base on the end of what is drawn, turned as the shaft runs there,
and grows about that base from nothing to its size over the first quarter of the way
(`TRACE_TIP_GROWN`), and the tip at the start of a double arrow grows about its own base, where it
is. The tip keeps the turn it has to the shaft in the arrow as built — Manim points it along the
line before the shaft is shortened to its base —, so the animation ends exactly at that arrow.
`buildLine` hands out what it follows (`LineBuild.trace`: the shaft as the library holds it and the
bases of the tips; `traceAt`), `traceArrowLook` draws it in the preview, and the export writes
`_TraceArrow(l1)` with the helper of the project's library (`TRACE_ARROW_HELPERS`), which
`traceArrow.test.ts` checks the preview against point for point, both run in each library
(`gen_curved_lines.py`). `setLineKind` — the field «Kind» and «Become ›» of a line's menu (D148) —
gives an arrow left without a tip a `create` where it had a `grow_arrow`.

<a id="a-tween-that-carries-the-ends-of-a-line"></a>
**A tween that carries the ends of a line** (`TweenEnds`, format 30, D144). A tween of a line's clip
can hold `ends` — where the two ends are once it has ended, on glyphs or at points — and is then one
more use of `placementUses` (owner `ends`): validation checks its targets — on a formula or a text,
as an attachment's ends (`attach-rule`, `checkEndHosts`) — and the instant they are
measured at, the glyph remap and the deletion of a clip leave an end free where it was drawn
(`freeTweenEnd`: beside an end still on glyphs, at the point Manim is to be given for the line to
end there, which the model cannot measure — `freedEndPoint` works it out with `pointForFreeEnd`
from the project and the renders before the change, and the app hands it to `deleteClips` and
`remapGlyphRefs` —; beside a free end, the two at the points the line was drawn between, two free
ends having no gap). The attach sync measures it when the tween starts (`deriveEnds`,
`tweenEndsDrawn`: the line Manim draws between the glyphs then, at the tween's gap and the line's
arc; two free ends are the two points) and writes `ends.drawn`; `actionStates` puts the clip at
`drawn.center` from then on, so everything that reads a clip's state finds the line there. What the
line is after each
of those tweens is the fold of `scene/lineStates.ts` (`carryLine`), which follows the Python that
plays them: an arrow and a double arrow are built anew between the new ends (`buildLine`), a line
and a dashed line are carried — the points they have, moved, turned and scaled as
`put_start_and_end_on` does it (`similarityOnto`), a dashed line by the ends Manim reads off its
dashes, which in ManimGL stop short of the line's —, and a line whose arc takes other degrees is
built anew. A state holds the members **as the library holds them** (`LineGeometry`: point paths),
because `Transform` aligns the points of the two mobjects (`alignPointPaths`) and leaves the line
with the aligned ones: an arc ManimGL drew with two quadratics, sent to one it draws with one, stays
in two, and its centre (`lineCentreOf`) and what cuts it later are read off those points.
`anim/ends.ts` gives the evaluator the members and their styles at an instant, through the interface
a shape's fit has (`rt.fit`): the state in effect about its centre, or, while a tween runs, every
point between the two states and the stroke width with them; a GrowArrow after a tween grows the
line it left (`builtAt`), a bent one traced along its shaft in the layout `traceAt` reads, curves
that share their ends (ManimCE holds four points for each cubic; audit A4-02). The export
(`endsTween`) writes
`Transform(l1, l1_to)` for what is built anew — `l1_to` by the constructor the export always writes,
on the glyphs an end is on — and `l1.animate.put_start_and_end_on(a, b)` with
`.set_stroke(width=…)`, `.set_color(…)` and the opacity for what is carried, the two points read off
a plain `Line` on the glyphs when an end is on some; the dashes of a spline have no ends for Manim
to read, and a `_carried` helper makes the copy `Transform` plays. A line off the screen takes what
the tween leaves at once (`become`, or the carried points), and nothing of a tween whose easing
comes back (audit A5-05). ManimCE's `Arrow` sets its stroke again from the width it was first asked
whenever it is scaled, so after a tween that changes it the export tells it the one it has
(`initial_stroke_width`). `gen_line_moves.py` samples all of it in both libraries
(`lineMoves.test.ts`), and the case `line-ends` of the export check renders it. In
the preview the handles at a line's ends show the ends in effect at the playhead
(`lineEndsInEffect`) and move them in the tween in effect there (`moveLineEnd` with its
`EndsScope`; the end that stays keeps its glyphs or where the tween draws it — never the point it
holds for a free end beside one on glyphs, the gap further out, which it is given once again, as a
clip's own end is), a new Transform of a line starts with the ends the line has
(`endsForNewTween`), and a line between two free points is moved by moving both (`patchKeyframe`).
**Reverse points** (D147,
`reverseLineIn`) swaps the start and the end of a line object where they are: the opposite vector,
the curve run backwards (`reversedCurve`), a double arrow's two tip shapes, the ends each clip hangs
by and the ends each tween carries. «Edit curve» on the line ends first, keeping its curve, as it
does before a paste of a path shape (`endCurveEditOn`): its Esc would put back nodes of before.
