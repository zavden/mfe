# Architecture §8 (1 of 2): Export, Python

[Index](../ARCHITECTURE.md) · Previous:
[§6–§7 Animation catalogue, rendering](06-07-catalogue-rendering.md) · Next:
[§8 Export: video](08b-export-video.md)

Holds the opening of §8 *Export* and its subsection *Python (`export/codegen`)*: mobjects, font
text, timing in slices of the frame grid, glyph membership, tweens, relations, Morph blocks, clip
animations, animation and emphasis blocks, the issues, the marks of the Slides mode, the
implementation notes, the Manim behaviours the code relies on and the export check.

See also: [Relations in Manim](05a-time-model.md#relations-in-manim) ·
[Attached objects](05b-attached-objects.md#attached-objects) ·
[Events](05c-rules-blocks-events.md#events) ·
[§6 Animation catalogue](06-07-catalogue-rendering.md#6-animation-catalogue-v1) ·
[§9 Testing](09-10-testing-working-rules.md#9-testing)

---

## 8. Export

Contracts: `export/types.ts` (`GeneratePython`, `ExportVideo`). Public API: `generatePython`,
`exportVideo` from `export/index.ts`. Dialogs: `ui/export/` (`openExportDialog`, `ExportHost`).

### Python (`export/codegen`)

The generated file is a plain Manim scene a person can read and edit: `from manim import *` (CE)
or `from manimlib import *` (GL), small helpers only when used, one `Scene` subclass, and a
header comment with the command that renders it at the project's size and frame rate.

`symbols.ts` defines the fixed emitted namespace: constructors, animations, rate functions,
helpers and referenced builtins. Scene-class validation, safe suggestions and object identifiers
use it; one `NameAllocator` also reserves the scene name, glyph-list suffixes and generated locals.
Names in the saved project are unchanged, and ordinary safe emitted names remain readable.
`codegen/__tests__/namespace.test.ts` holds it to a list written apart (`namespaceSymbols`,
`tests/export/namespaceCases.ts`, whose cases the native namespace probe builds in real Manim) and
to every `def` and `class` of the helpers, those per library included: the two lists
for seven names that wait for a run of that probe before they join it (audit B4-03).

<a id="mobjects"></a>
**Mobjects.** One mobject per **clip** (a formula can be on the timeline several times), named after
the formula (`f1`, `f1_2`, …) and written by the emitter of its kind (`export/codegen/emitters.ts`,
`EMITTERS`): the class per target — `math` is `MathTex` in CE and `Tex` in GL; `tex` is `Tex` in CE
and `TexText` in GL, of the source inside the wrapper its layout needs (`engine/textSource.ts`) at
the size the clip is exported with, so the box keeps its scene units; ManimCE's `Tex` is text while
ManimGL's is math; `brace` is `Brace` in both: built on its target in the step where its clip starts
(below), or, detached, of a `Line` as wide as the brace's `width` at no gap, moved and turned like
any mobject (ManimGL's has no sharpness); `shape`, detached, is a `Rectangle` or `RoundedRectangle`,
a `Circle`, a `Line` or a `Cross` over a `Rectangle` of the size it was fitted to (a cross line: a
`Line` between two opposite corners of that size), always in its hex
colour (Manim's defaults differ per class and per library) and with the clip's opacity folded into
its fill and stroke opacities (`shapeStyleArgs`: `set_opacity` would fill a stroked shape) — and the
constructor lines with the size, the colour and the template; the passes that follow never ask for
the kind, a mobject being its glyphs. Packages and `meta.preamble` go through a `TexTemplate` (CE)
or `additional_preamble` (GL), so the scene compiles exactly what the companion compiled. Glyph `g`
(canonical) is `name[0][g]` in CE and `name[g]` in GL with literal indices (exact formulas), or
`name_g[g]` through the positional helper (D5): the file embeds each glyph's centre and size from
the snapshot, normalised by the formula height, and matches them to the real submobjects at run time
(`scipy.optimize.linear_sum_assignment`; scipy ships with both libraries). `indexing: 'auto'` uses
literal indices when the snapshot is exact for the export (`isExactSnapshot`: taken by the LaTeX
backend for this LaTeX, packages, size, preamble and target, by the current backend version — its
key is the one such a render has now); otherwise the helper, with an `export-positional` warning
that says why (MathJax snapshot, the other library, or a LaTeX snapshot kept from an earlier render,
say from before a change of target while the companion was offline). Exporting to the other target
keeps the preview's size (`font_size` converted with the 1.031 CE/GL ratio) and says so in `issues`.
Colours follow `glyphColor` precedence; the initial placement follows `placementMatrix` (flip/scale,
then rotate, then move the centre to `position`).

<a id="without-a-latex-render"></a>
**What the helper cannot reach.** The helper pairs each glyph of the editor with one of Manim's;
when the two renders split the formula into different numbers of glyphs
([§1](01-03-foundations.md#1-two-fidelity-levels): about one formula in ten, `\cdots` first among
the causes) some glyphs have no partner. A glyph of the editor without one is an empty `VMobject`,
and what animates it does nothing. A glyph of Manim's without one is in none of the lists the
script plays, so every animation of glyphs leaves it out, and what the video shows depends on how
the formula comes in. Rendered with ManimCE 0.22.1 and ManimGL 1.7.2 (2026-11-21), `1+2+\cdots+n`
going to `1+2+\cdots+n=\frac{n(n+1)}{2}` through a relation of seven pairs, Manim's nine glyphs
against MathJax's seven: with a Write intro, which plays `VGroup(*f_g[:])`, two of the three dots
are never drawn; with no intro or a fade, which add the mobject whole, the three dots are there
and two of them stay where the first formula stood when its glyphs go to the second. The scene
prints `Warning: Manim made 9 glyphs of a formula the editor split into 7; unmatched glyphs are not
animated.` once for each such formula.

The export can say which formulas those are only when it has both renders: `export-glyph-count`
compares the snapshot with the current render of the other backend (`prepare.ts`), and names the
pairs of a relation or a Morph block that would morph from or into nothing. With no companion
there is no LaTeX render, so the dialog has `export-positional` alone, the same for every formula
drawn by MathJax, and the count is learnt when the scene runs. Nothing in the editor warns of the
constructs of the list while they are typed.

<a id="font-text"></a>
**Font text.** `text` is `Text(source, font=…, font_size=…, weight=…, slant=…,
disable_ligatures=False)` in both libraries, built as the companion builds it to shape it
([docs/COMPANION.md](../COMPANION.md)): ManimGL's takes `alignment='LEFT'`, ManimCE's is made inside
`tempconfig` at 1920 × 1080, because its Pango width follows the render resolution otherwise. Its
glyphs are its submobjects, by literal index (never the positional helper), and colours come after
the construction. It is written from the geometry saved of its current source, font and size,
whichever library shaped it (`textShapedFor`, `engine/engine.ts`: the render the snapshot belongs to
answers, else the formula's own geometry reference). A text nothing has shaped as it stands is
written all the same when its glyphs are counted by its placeholder boxes
([§4](04-formula-engine.md#placeholder-boxes-a-font-text-nothing-has-shaped), `textCountedByBoxes`):
one glyph per character, on trust, at the size of the project's library, with that count as the
scene's only check and an `export-text-unshaped` warning (where the font joins letters into one
glyph, or the text runs right to left, the references can land on other glyphs). With neither a
shape nor such a count its glyphs are unknown and its clips are left out (`export-missing-render`).
Shaped by the export's library, the scene checks what it builds against the saved contour signature
([§4](04-formula-engine.md#pango-text-and-durable-appearance)); when none is at hand it only counts
the glyphs, and the issues say so (`export-text-unchecked`). Shaped by the other library, the same
`Text` is written with that count as its only check, and an `export-text-other-library` warning
names the texts: the two libraries build the same children in the same order for the same string —
measured over 168 texts (accents, ligatures, several lines, tabs, right-to-left and fallback
scripts; eight fonts, three sizes: `tests/parity/text_children.py`), and held frame by frame by
export-check for texts of one line. What differs is the look. The size: at equal `font_size` a
ManimCE text is 1.4678 times as large (`TEXT_CE_GL_SIZE_RATIO`: ManimCE draws an em as
`font_size / 72` units, ManimGL calibrates its texts by the digit zero of Pango's default font, so
the ratio follows the machine's default font by a few percent), and the export converts `font_size`
from the library that shaped the text — the size the preview shows — not from the project's. The
spacing, which the export does not convert: ManimCE sets the lines of a text `1.3 · font_size / 96`
units apart, 0.975 em whatever the font, and writes a tab as four spaces; ManimGL keeps 0.96 of the
font's own line height (1.07 to 1.31 em in the fonts measured; Pango 1.50 or later) and Pango's tab
stops.

<a id="timing-frame-grid-then-slices"></a>
**Timing: frame grid, then slices.** `buildEvents(project)` is the only input for timing — with the
moves of the scene's camera that go somewhere, the ops of no clip ([§12, The Python of a
camera](12-scene-camera.md#the-python-of-a-camera)).

1. Every event boundary is snapped to the frame grid of `meta.fps` (`round(t · fps) / fps`,
   at least one frame long), so every `self.play` / `self.wait` lasts a whole number of frames
   and the Manim video has exactly `round(duration · fps)` frames, like the web export. The
   shift is at most half a frame.
2. The timeline is cut at every event boundary. A stretch with nothing running is
   `self.wait(Δ)`. An event that runs alone over its whole interval is one ordinary call:
   `self.play(Anim(...), run_time=T, rate_func=…)`. Most projects (intro, transform, transform,
   outro) export as such plain calls.
3. Where events overlap, each overlapping animation is created once (`a3 = ReplacementTransform(...)`)
   and every slice plays the part of it that falls in the slice:
   `self.play(_Part(a3, 0.25, 0.75), _Part(a4, 0.0, 0.5), run_time=Δ)`. `_Part(anim, a0, a1)`
   (a helper of ~30 lines, same code in CE and GL) begins its animation only when `a0 == 0`,
   interpolates it over `[a0, a1]` (the inner animation keeps its own rate function and lag),
   leaves it at `a1` when the slice ends, and finishes and cleans it up from the scene only when
   `a1 == 1`.

Why slices and not one play per group with start delays: scene membership must change exactly
at event boundaries. ManimCE's Cairo renderer decides which mobjects it redraws once per
`self.play`, after `begin()`; a mobject added in the middle of a play (an animation that
starts late, the target a `ReplacementTransform` adds when it finishes) is not drawn until the
next play. With slices every `begin` and every clean-up happens at a play boundary. The same
code runs in GL, whose scene re-renders everything anyway.

<a id="glyph-membership"></a>
**Glyph membership.** The scene never holds a whole formula when only some of its glyphs should
be visible. An intro with `except` animates `VGroup` of the other glyphs; glyphs that arrive through
a relation or a Morph block enter as the target that `ReplacementTransform` / `FadeTransform` adds
when it finishes; consumed glyphs leave the same way. A source glyph morphed by
`ReplacementTransform` now looks like the target and is gone from the scene: it is never added
back (adding its formula, for example through `f1.animate`, would bring it back): it stays inside
the formula mobject in the target's shape, so after a `transform` or `fade` pair the formula is
never used whole again (`gone`, `isWhole`), while after copies only whole-formula calls
(`f.animate`, `FadeOut(f)`) are still used. A formula matched by position is never animated whole by
a staggered intro, outro, Appear or Disappear (Write, Create, their reverses, or any lag ratio above
0): the mobject would play in Manim's glyph order, which can differ from the editor's (a MathJax
fraction ends with its bar), so `VGroup(*f_g[:])` keeps the editor's. `copy` keeps the source:
`TransformFromCopy(src, dst)` in GL, `ReplacementTransform(src.copy(), dst)` in CE ([§5, "Relations
in Manim"](05a-time-model.md#relations-in-manim)). Instantaneous intros and outros (`none`) are
`self.add` / `self.remove` at a slice boundary; so is the placement of an attached object
([§5, "Attached objects"](05b-attached-objects.md#attached-objects)),
`f2.next_to(f1[0][2:5], DOWN, buff=0.25)` in the instant step where its clip starts, targets before
what hangs on them, its setup leaving out the `move_to`: Manim measures the real glyphs then, as the
evaluator did. An ordinary brace is built there — `b1 = Brace(f1[0][2:5], DOWN, buff=0.2)`, with its
colour, opacity and layer, and `sharpness=` for ManimCE when it is not Manim's; its setup writes
nothing unless an earlier dependency needs it — and a direction off the four sides is
`rotate_vector(DOWN, θ * DEGREES)`. ManimGL draws its brace from a font and ignores the sharpness
(`export-brace-sharpness` says so). A label at a brace's tip is put there in the step where its clip
starts, after the brace is built when both start then: `b1.put_at_tip(f2, buff=0.25)`, its gap
always written (for `buff: null` the one `get_tex` leaves: ManimGL's `put_at_tip` alone would leave
`next_to`'s 0.25); a label that starts before its brace exists in the Python keeps its derived
position (a `move_to` in its setup). A shape is built on its target there too, by its Manim class,
with its colour always written (Manim's defaults differ per class and per library: ManimCE's
`YELLOW` is not #FFFF00) and its style and the clip's opacity folded into the constructor
(`shapeStyleArgs`: `set_opacity` would fill a stroked shape):
`s1 = SurroundingRectangle(f1[0][2:5], buff=0.1, color="#FFFF00")`, rounded by `corner_radius=` in
ManimCE and `.round_corners()` in ManimGL, which has no such argument; a circle through the
`_circle_around` helper (each library's own `Circle.surround` means something else);
`Underline(…, buff=…)`, told in ManimGL to keep a plain stroke and not to stretch (its defaults
taper the stroke and stretch by 1.2); `Cross(…, stroke_color=…)`, its stroke width always written in
ManimGL (its default is tapered, including for detached Crosses); a cross line through the
`_cross_line` helper, which builds Manim's own `Cross` over the target and takes one of its lines —
so that it is fitted as a cross is in each library — as a plain `Line` from the corner its diagonal
starts at, its stroke width always written (a `Line` draws 4 wide, a cross line's own default is 6).
A detached shape is built at its stored size and moved like any mobject. A shape's glyphs are the
mobject itself (a box, a circle, an underline, a cross line; ManimCE's brace too) or its submobjects
(a cross's lines, ManimGL's brace), never `[0][g]` (`GlyphNaming.members`), and a tween or a part
transform fades it by its fill and stroke, each from its own opacity (`.set_fill(opacity=)` /
`.set_stroke(opacity=)`, `_Tween`'s `stroke=` pair).
Matched by position, a brace or a shape built on its target binds its glyph list after the
constructor (`b1_g = _glyphs(b1, […])`) only when the scene reads it — a glyph colour of its own, a
part transform, a relation —, most being only ever used whole: the list is written, and a last pass
over the lines (`dropUnreadGlyphLists`) takes out the ones that no other line names, which do not
ask for the helper either. A line is never matched by position, whatever was asked («Always use the
positional helper») and whatever library its snapshot was made for: its glyphs are the members of
its mobject in both libraries, a list would stand in for the arrow that `GrowArrow` and `Create`
need, and a line that lies flat has no height for `_glyphs` to measure by (`prepare.ts`). Layering
follows the tracks (front-most track drawn last) and must survive the re-adding that relations do.

An object with a fitting attachment and multiple clip uses keeps its first attached clip's shared
settled dimensions in every exported use, including the owner and detached uses. Each clip gets
fresh geometry with its own pose, scale, flips and paint; an already posed owner is never copied.
Targets needed before their starts are prepared invisibly at their settled future-initial positions,
including chains whose initial placement samples later target motion. Visibility still begins at
the clip's normal start, with the usual hidden-target warning. What needs a target early is a clip
attached to it that starts first, or a tween that carries its shape to it (`fit`) before it starts;
of a fit's targets only the attached ones are prepared, any other clip being built and placed by its
setup already (`attachmentPlan`). Missing readiness warns and retains saved geometry. Canonical
glyph bindings and initial glyph colors are rebuilt after deferred or replacement constructors, so
subsequent operations address the visible instance.

`paint.ts` multiplies independent base fill/stroke masks on restore and future-glyph jumps as well
as animations. `_Tween` accepts uniform pairs only when values agree, otherwise per-canonical-glyph
pairs; stroke color changes independently of opacity. The extended paint helper is emitted only
when needed. Sliced CE Unwrite uses a fresh kind-aware group of canonical members, including both
Cross lines. GL keeps its separate Unwrite path. Absent returning tweens settle at the same eased
endpoint as visible glyphs, preserving the established expiration of requested part overrides.

Native pivots use `manimCenter`/`manimBoxes`: glyph paths use native point representations before
scene transforms. Part transforms, Indicate/Wiggle and intro/outro pivots
share that measurement; display/selection boxes are unchanged.

<a id="tweens"></a>
**Tweens.** Exported as idiomatic `.animate` calls (`move_to`, `scale`, `set_color`,
`set_opacity`) when that reproduces the evaluator exactly — no rotation or flip change, and the
animated group is the whole formula, so its centre is the formula centre. Otherwise a small
tween helper interpolates the placement parametrically about the formula centre (true rotation,
flips through zero) for exactly the glyphs present.

<a id="relations"></a>
**Relations** follow ["Relations in Manim" (§5)](05a-time-model.md#relations-in-manim): one
animation per pair in the relation's window, `VGroup` on both sides when either side has more than
one glyph, `path_arc=θ·DEGREES` — or, for a pair with a custom path (D48),
`path_func=_spline_path([((u, v), in, out), …])`, the helper written once per file; the chord itself
(two nodes without handles) takes neither. A route with a path of its own (D167) gives that path to
its call when the call plays that route alone (a source of a pair that arrives separately); a call
that moves several glyphs along different paths — one transform of two groups — is wrapped instead,
`_route_paths(ReplacementTransform(…), [(source, target, path), …])`: an entry for each piece of the
animation, in the order Manim animates them — the routes of the call (`pairRoutes`: the two groups
as `padFamily` aligns them) —, with the piece's path function (`None` for a straight one,
`path_along_arc` for the relation's arc). A pair that brings the targets an earlier pair of the same
transfer brought plays as the extra sources of one pair do (CE: `Transform(…, remover=True)`).

<a id="morph-blocks"></a>
**Morph blocks** take the same code path, as a transfer whose two clips are one: per pair CE
`ReplacementTransform(f[0][i].copy(), f[0][j])` / GL `TransformFromCopy(f[i], f[j])` for `copy`,
`ReplacementTransform` for `transform`, `FadeTransform` for `fade` and `FadeTransform` of a copy of
the sources for `fade_copy`, with `path_arc=θ * DEGREES` and the block's `rate_func`; several glyphs
on a side make a group (a slice for a contiguous run),
and then the other side is a group too. Only the names follow the origin: the variable of a block
played in parts is `<name>_morph` (`<name>_morph_2`, … for the next ones), the timing comment says
`<name> morph`, and `export-glyph-count` speaks of "The Morph block of <name>". Both sides are on
one clip, so on one layer: nothing is raised to another `z_index`. The intro leaves the targets out
because they arrive (its `except`), not because they are hidden.

<a id="clip-animations"></a>
**Clip animations** follow the catalogue
([§6](06-07-catalogue-rendering.md#6-animation-catalogue-v1)) and these evaluator notes: an
intro/outro with a non-empty `except` runs on a sub-group of the animated glyphs (the preview scales
and centres about that group); GL `Write` needs the group colour set first (its outline uses it); GL
unwrite is (through the `_Unwrite` helper, see below)
`Write(reversed group, rate_func=lambda t: ease(1 - t), remover=True)`; a non-linear CE unwrite is
`Write(m, reverse=True, reverse_rate_function=True, rate_func=…, remover=True)`; tween rotation is a
true rotation, not `.animate.rotate`.

<a id="animation-blocks"></a>
**Animation blocks.** An appear block is played like an intro of its glyphs and a disappear
block like an outro of theirs: the glyphs `clipLifetimes` says really change, in a `VGroup`, in
`_Part` slices where blocks overlap. A glyph that a disappear block takes out and an appear block
brings back later in the clip is moved along with tweens while it is away, and gets its shape back
once it is off screen (see the restoring subclasses below). Glyphs that came on screen during the
outro leave at the clip end, as in the preview (`self.remove`). A part transform block
animates the part's glyphs on screen as one `.animate` chain — `scale(k, about_point=pivot)`,
`shift(v)`, `set_color`, `set_opacity`, where `pivot = VGroup(part).get_center()` is taken just
before the play, off-screen glyphs of the part included (but not those that have left for
good) — or, when it rotates, as a `_Tween` about that pivot (a true rotation, as the preview draws
it; each glyph fades from its own opacity); the part's glyphs off screen take the end state at
once (`.rotate(…, about_point=pivot)` and the rest of the chain). The colour or opacity a block leaves on a glyph is remembered: a later
tween that changes that glyph's colour or the clip opacity first puts it back to the clip's own
value (as the preview does), and a tween that leaves it alone colours glyph by glyph instead of
`set_color` on the formula. Once a part moved, the formula's box centre is no longer where its
placement puts the formula centre, so tweens pivot on explicit points (`about_point`, `shift`)
instead of `scale()` and `move_to()`.

<a id="emphasis-blocks"></a>
**Emphasis blocks** (D73) play on the group of their glyphs on screen: `Indicate(VGroup(...),
scale_factor=, color=, rate_func=)` (the pause easing as `there_and_back_with_pause`); the
`_Wiggle` helper for both libraries — ManimCE's Wiggle about a pivot fixed when it begins, since
Manim's own reads the centre again while it moves the glyphs one by one and ManimGL's
WiggleOutThenIn refuses an array pivot —; the `_Circumscribe` helper for both — ManimCE's
Circumscribe, a `ShowPassingFlash` over a `SurroundingRectangle` built where the play starts,
given the clip's layer (`z_index=`; ManimGL has none) —; each library's own `Flash` and `FocusOn`
aimed at `VGroup(...).get_center()`, a point, so that neither follows the glyphs afterwards (the
preview measures them once), the Flash's lines put on the clip's layer and the FocusOn's disc over
every track (`tracks.length`) by lines before the play, under a name the slices reuse. Manim's
defaults are left unwritten, the Flash takes no rate function (ManimGL would hand it to the
group), and nothing is restored afterwards: every effect leaves the glyphs as they were.

`CodegenResult.sceneName` is the name the class took, which the header names the file by: the one
asked for, unless the scene cannot be called that — no class name, or a name its camera uses
([§12](12-scene-camera.md)) —, so what downloads the file or asks for a render names it by what
comes back, not by what it asked for (`effectiveSceneName`).

`CodegenResult.issues` tells the user what the code cannot guarantee: formulas exported
through the helper (MathJax order), glyph counts that differ between MathJax and LaTeX,
packages MathJax does not support, hidden tracks (exported anyway), export to the other target,
sub-frame snapping that moved an event noticeably, formulas without a render of their current
LaTeX (`export-missing-render`) and an empty timeline (`export-empty`).

<a id="the-marks-of-the-slides-mode"></a>
**The marks of the Slides mode** ([§13](13-slides-mode.md#13-the-slides-mode)) are the user's words
for whoever works on the scene after the export, not the generator's explanation: each mark the
export carries (`exportedMarks`: one that stands where nothing animates, one pause per instant, a
comment before the pause of its instant) is a comment line of `construct` at its instant, written
whether the `comments` option is on or off. A comment is `# NOTE (5.00 s): its words`; a pause is
`# PAUSE 2 of 5 (3.20 s)`, numbered among the exported pauses, with `: its note` when it has one; a
pause that skips its wait (format 36, D202) says so before its note,
`, the exported page skips the 0.50 s wait after it` (the length of `skippedWait`), and keeps its
`self.wait`, which only the page skips ([§13](13-slides-mode.md#a-pause-that-skips-its-wait)). A
text of several lines goes on in comment lines of its own, indented under the first (`#   …`), and
every line goes through `pyComment` (`marks.ts`), so that no text can end its comment and go on as
code (finding F1 of the first audit). The marks written together stand apart, a blank line before
them and one after. `placeMarks` (`timeline.ts`) puts them among the steps at their frame
(`snapFrame`). One inside a wait splits it into two waits that add up to its frames. A pause at `t`
shows the scene as it is at `t`
([§13](13-slides-mode.md#where-the-scene-animates-and-where-it-rests)), so on a boundary a mark goes
after the instant steps of its frame (an add, a remove, a placement) and before what starts there:
at 0 s after what is there from the start and before the first play, at the end of the scene after
the last step. The marks and what is said of them are read from the project with its sound, before
`generatePython` takes the visual part (the Python dialog gives it the project with its sound): a
mark in the tail where only sound plays stands, and comes at the very end with its instant, no wait
added for it — the scene keeps its length. A mark out of place is left out, and the issues carry the
model's warnings for it (`slide-mark-busy`, `slide-mark-outside`). The pause zones never reach into
a play of the code (where a block changes nothing they are narrower than its wait), so a mark that
stands is inside a play only where the frame grid moved one over it (a sub-frame animation stretched
to one frame, or one it pushed later): such a mark is written at the nearer edge of that play, the
start on a tie, and `export-slide-mark` names it, the animation and the instant it is written at. A
project without marks gets the Python of before, byte for byte. Whatever the words, the file stays
sound: a comment never counts as reading a glyph list (`dropUnreadGlyphLists`), and a `construct` of
comments alone gets its `pass`. `self.next_slide()` of manim-slides is not written: the export
targets plain ManimCE and ManimGL, which do not have it. The export check renders `slide-marks` and
`slide-pauses-camera`, where a wait split wrongly would move every frame after it.

<a id="validation"></a>
**Validation** (`tests/export/`): every example project and a set of synthetic ones (each intro
and outro kind, every tween property, every relation style, 1→n and n→1 pairs, overlapping
events, hidden tracks, hidden glyphs, every appear and disappear block kind, glyphs that leave and
come back, blocks beside the intro and a relation, blocks that run at the same time on different
glyphs (two Writes at once with a part transform beside them, a Disappear with an Appear, two that
overlap in part), a glyph that leaves with its clip end, fraction bars written, created and morphed,
part transforms with every channel, before a tween, off screen and beside a relation, Morph blocks —
a derivation written row by row, with copies in a chain, one beside an Appear block, a relation from
another clip into a row and a part transform after, and a block that consumes, copies and fades
along an arc, played in parts (`multiline`) —, braces and their labels, shapes fitted to a formula
that moves, scales and turns, with every intro and outro and tweens of their own (`decorations`), a
formula without ink, the marks of the Slides mode (`slide-marks`, `slide-pauses-camera`: in the
middle of waits, on the edges of plays and of camera moves, after an instant, at 0 s and at the
end), every Emphasis effect with its defaults and its own settings, over a tween, beside one another
and across tracks (`emphasis`, whose frame mid-trace over the moving formula is also compared pixel
by pixel in both libraries) are exported for both targets and run in `manim_ce/venv` and
`manim_gl/venv`. A probe records, at sampled times, the bounding box, fill colour and opacity of
every drawn glyph and compares them with `evaluate(t)`; the frame count is checked with `ffprobe`;
and the mid-transform frame of `hello.mfe.json` is compared pixel-wise with the web render
(tolerance). The suite skips itself when a venv or LaTeX is missing.

<a id="implementation-notes"></a>
**Implementation notes** (`export/codegen/`). `index.ts` runs the passes over one `Codegen` context
(`context.ts`: the project and its renders, the options, the events, the names taken, the issues and
the lines emitted so far, and the per-formula and per-clip facts of the first pass, `FormulaCtx` and
`ClipCtx`). `prepare.ts` reports the project's issues and makes one mobject per clip (name, TeX
template, glyph layout, indexing mode, setup lines — the mobject itself through `emitters.ts`, the
class and constructor of each kind of object); `membership.ts` keeps which glyphs of each clip are
on screen and what the animations that ended left on them (`isWhole`, `applyEnd`); `steps.ts` turns
the events into operations, snaps and cuts them (`timeline.ts`) and emits the waits and plays;
`animations.ts` gives each operation its statements before, its animation(s) and its statements
after; `assemble.ts` writes the file. Around them: `glyphs.ts` glyph expressions, `python.ts`
literals and names (`pyComment` and `safeText` keep a name or free text inside its comment line or
literal; `pyHeadComment` writes the file's first line, where a name with `coding:` or `coding=`
would declare the file's encoding to Python — PEP 263 — and gets a space before the sign),
`helpers.ts` the Python helpers, `dialect.ts` what the two dialects call the same things,
`marks.ts` the lines of the marks of the Slides mode, `issues.ts`.

- *Helpers*, each included only when used: `_Part(anim, a0, a1)` (slices), `_Tween(glyphs, start,
  end, colors=…, opacity=…, stroke=…)` with `_pose` / `_mix` (tweens that change rotation or flips,
  or per-glyph colours of a partial or positional group; a placement is `(x, y, scale, degrees, sx,
  glyph colours of a partial or positional group; a placement is `(x, y, scale, degrees, sx, sy)`),
  `_glyphs(tex, layout)` (positional matching; `layout` is `(x, y, w, h)` per canonical glyph
  relative to the formula centre, divided by its height — by 1 for a flat mobject, on both sides —;
  never for a line, see above), `_spline_path(nodes)` (the `path_func` of
  a custom path: the same arc-length table as `geom/spline.ts`, 64 samples per segment, applied per
  submobject to the chord between the centres of its points at the start and at the end — the
  preview's chord too), `_route_paths(animation, pieces)` (a transform whose glyphs follow different
  paths: Manim hands a path function the points of one piece at a time and nothing that names it,
  and two glyphs drawn on one spot have the same points, so the helper replaces the animation's
  `interpolate_submobject` — which both libraries call with the piece, where it starts and where it
  ends — by one that hands each piece its own path. A piece is known by the mobject it is: the
  members with points of the animation's group, once Manim has aligned it, are the `pieces` of the
  call in order (D212; measured in both libraries by the export check's `route-paths` and
  `route-coincident`). Where their numbers differ — a glyph without points is no piece — each one
  takes the path of the route whose source and target glyphs, by their centres when the animation is
  made, are nearest to where it starts and ends),
  `_Wiggle(group, scale_value=, rotation_angle=, n_wiggles=)` and
  `_Circumscribe(group, buff=, color=, stroke_width=, time_width=, z_index=)` (Emphasis blocks,
  above), in ManimGL `_Unwrite(group, stroke_color=…, rate_func=…)`, and the restoring
  removers below (`_Uncreate`, `_ShrinkToCenter`, and in ManimCE `_Unwrite(group, rate_func=…)`). A CE formula with `{{ … }}` keeps
  literal indices through `f_g = f.family_members_with_points()`.
- *Restoring removers*. Manim's removers leave their mobject as the animation
  ended it — scaled to a point, cut to nothing, half unwritten — and a glyph that comes back
  through an appear block would start from that. FadeOut gives the glyph its look back by itself
  (ManimCE in `clean_up_from_scene`, ManimGL in `finish`, `final_alpha_value = 0`); for the other
  removers a disappear block whose glyphs come back uses a subclass that does it after the
  clean-up — `_Uncreate`, `_ShrinkToCenter` (`super().clean_up_from_scene(scene)` then
  `self.interpolate(0)`), and `_Unwrite`: in ManimCE a `Write(reverse=True,
  reverse_rate_function=True, remover=True)` whose clean-up reverses the group around
  `interpolate(0)` (`finish` puts the group back in order but its starting copy stays reversed),
  in ManimGL the helper above with the same clean-up appended. Blocks whose glyphs do not come
  back, and outros, keep Manim's own classes. `_Part` runs the clean-up in the slice that ends the
  animation, and glyphs away from the screen follow the tweens (*Membership*), so a glyph comes
  back where the preview shows it.
- *Strings.* `pyString` writes LaTeX as a raw string (`r"…"`); a text of several lines (a formula
  typed one row per line, a preamble) becomes `r"""…"""`, its continuation lines left unindented
  (`physicalLines` tells them from the lines of a multi-line call), so that it reads as typed. A
  text such a string cannot hold — with `"""` inside, ending in `"` or in an odd number of
  backslashes, or with a `\r` — keeps the escaped form.
- *Frame-exact durations.* Manim turns a duration into frames as `len(np.arange(0, t, 1/fps))`
  (every play, and ManimGL's wait) or `int(t / (1/fps))` (ManimCE's static wait,
  `freeze_current_frame`); `k / fps` in floating point often lands a hair off (23/60 s gives 24
  frames). `secondsLiteral` writes the plain value when it works and otherwise rounds to 6
  decimals in the safe direction (`run_time=0.383333`, CE `self.wait(0.383334)`).
- *Frame times.* ManimCE renders each play at `t = 0, 1/fps, …` (the start of every frame
  interval, like the web export); ManimGL at `1/fps, …, run_time` (the end). A GL video therefore
  shows each instant one frame later and ends on the final state.
- *Membership.* Formula mobjects are created up front and never added while some of their glyphs
  must not show: intros and outros with `except` animate `VGroup`s (a contiguous run uses a slice,
  `f[0][1:]`), `none` intros / outros are `self.add` / `self.remove` of the glyphs, tweens of a
  partly present clip animate the present glyphs about the formula centre
  (`.animate.scale(k, about_point=…).shift(…)`), and glyphs still to arrive through a relation are
  moved along off screen so the morph ends where the preview does (so are glyphs still to appear
  through a block, and those a disappear block took out that come back). Appear and disappear
  blocks animate `VGroup`s of their glyphs like intros and outros with `except`. Both libraries' `add` /
  `remove` restructure groups that hold the glyphs involved, and ReplacementTransform's clean-up
  replaces (CE) or removes and re-adds (GL) exactly the morphed glyphs, so no stale copy remains.
  Every glyph keeps its track layer as `z_index` (both libraries sort by it: CE camera
  `use_z_index`, GL `Renderer.resolve`); a morph onto a track in front raises the moving glyphs to
  that layer first, as the preview draws morphs on the front track (a Morph block stays on its
  clip's layer). In ManimGL every unwrite and write passes `stroke_color` (GL's Write traces
  outlines in `vmobject.get_color()`, which is white for a fresh `VGroup` and for a `Tex`).
- *Tweens.* `.animate` (`scale`, `move_to`, `set_color`, `set_opacity`) when the tween changes
  neither the rotation nor the flips: `scale()` / `move_to()` for the whole formula at rotation 0
  with no part moved, `scale(k, about_point=…)` / `shift()` otherwise (a rotated formula, the
  glyphs on screen of a partly present clip, after a part moved); `MoveToTarget` for per-glyph colours of the whole formula;
  `_Tween` otherwise (it takes its group's submobjects as the glyphs, in canonical order, so
  per-glyph colours stay aligned past `_glyphs` placeholders). Played in parts, `.animate` builders
  are `.build()`-ed. An easing that ends at 0 (`there_and_back`) is played as is: Manim and the
  evaluator both settle at the start state. A shape's opacity goes to its fill and its stroke, each
  scaled from its own (`set_opacity` would fill a stroked shape).
  What is not a shape takes a `_Tween`'s opacity on its stroke as well as on its fill (`opacity=`
  and `stroke=`, the same pairs: `tweenOpacityKw`), as `set_opacity` gives it in a plain `.animate`:
  the stroke is what an animation that traces the outline later draws — an Unwrite, a Write that
  brings glyphs back — and the editor draws that outline at the clip's opacity (the export check's
  `tween-outline`).
  A shape its clip repaints (`paint.ts`, `repainted`) is written from the paint of its states
  instead: built with the colour of its fill said (`.set_fill("#…")` after the constructor: a
  `Circle` built without one takes its library's default, and a fill that is invisible now keeps the
  colour a later tween fades in), its tweens naming what they change in
  `.set_stroke(color=, width=, opacity=)` and `.set_fill(color=, opacity=)` — `.set_color` while
  stroke and fill share their colour —, which `.animate` turns into the `Transform` to a copy that
  the editor's linear blend is; one that turns the shape gives `_Tween` the pairs `width=` and
  `fills=`, in a variant of the helper written only then. A tween with a `fit` builds the new shape
  on its target in the statements before the play it starts in — the constructor of the shape's
  kind, with the shape's gap, in the colours and the paint it arrives with: the lines an attached
  shape is built with (`fittedShapeCall`) — and plays `Transform(shape, new)`; the tweens after it
  start from the fit, as the states do. A target the scene has no mobject for gets the new shape at
  the size and the place the editor fitted it to.
- *Snapping on a clip.* Stretching a sub-frame animation to one frame never makes it overlap the
  next animation of the same clip (Manim cannot run two on one mobject): the later one starts at
  the stretched end, keeping its length and the order, and `export-snapping` says so.
- *Before the scene.* No event starts before 0 s. A project in error can hold one — a relation
  window left out of place, which `relation-window` reports —: `snapEvents` takes it from frame 0,
  so that every animation has a first frame to be written at, and `export-snapping` says it moved.
  Whatever else the generator throws at, the Python dialog says in itself (`export-python-failure`),
  with no code to copy: it runs the generator while it draws, and a failure there must not take the
  app to the crash screen.
- *Renders.* The dialog waits while a formula on the timeline is rendering, and turns Copy and
  Download off while a render failed or belongs to an earlier version of the formula (its key is
  not the one of the current LaTeX, packages, size, target and preamble).
- *Glyph counts.* When the LaTeX render for the export target lacks a counterpart of a canonical
  glyph (a MathJax snapshot with a glyph LaTeX does not make), `_glyphs` leaves an empty
  `VMobject` there, and a pair using it morphs from or into nothing; `export-glyph-count` names such
  relations and Morph blocks. With only a MathJax render the exporter cannot know Manim's count, and
  the gap stays silent until the scene runs (`_glyphs` prints a warning). A formula without ink
  (`\quad`) has no glyphs on either side: `_glyphs` returns its empty placeholders without matching,
  and its animations run on nothing.

<a id="manim-behaviours-this-relies-on"></a>
*Manim behaviours this relies on* (CE 0.22.1 / GL 1.7 sources in the workspace):

- CE `Scene.compile_animation_data` adds non-introducer mobjects before `begin`, and
  `Scene.begin_animations` calls `_setup_scene` + `begin` and only then splits moving and static
  mobjects (Cairo, once per play); `get_moving_mobjects` treats everything after the first moving
  family member (z-sorted) as moving.
- CE `-r W,H` does not recompute `frame_width`; the CE export sets it from the pixel aspect when
  the frame is not 16:9. GL derives the frame width from `-r`.
- GL `Tex(..., color=c)` leaves the glyphs white; the export colours with `.set_color(c)`.
- GL `DrawBorderThenFill` restyles a glyph as its outline only when it first crosses into the fill
  stage: played backwards (the reversed Write that stands for Unwrite) a glyph keeps the last fill
  it was drawn with while its outline is taken back. `_Unwrite` restores the outline style. It lists
  a glyph that holds others (an arrow's line) once, before its tips, which it reverses while it
  plays, as CE's Unwrite does: in a VGroup of the line and its tips, each tip would come twice in
  the family, and the later of its two places would draw it.
- CE `Unwrite` ignores `rate_func` ([§6](06-07-catalogue-rendering.md#6-animation-catalogue-v1)); CE
  `ShrinkToCenter` and GL's are not removers (the export passes `remover=True`, so nothing scaled to
  a point stays in the scene).
- Both `SVGMobject`s import a `<rect>` as `Rectangle(width, height)` moved to its centre — a
  `Polygon(UR, UL, DL, DR)`, four lines with handles at thirds (CE) or at midpoints (GL) — and
  flip the whole mobject afterwards (`flip(RIGHT)`), so a fraction bar's contour starts at its
  (maxX, maxY) corner in SVG space. GL's `SVGMobject.__init__` then calls
  `ensure_positive_orientation()`, which `reverse_points()` every imported glyph whose
  `get_area_vector()` points into the screen: rules run the other way round in GL than in CE,
  character outlines (counter-clockwise once flipped) stay
  ([§4](04-formula-engine.md#existing-producers-and-geometry-conventions)).
- CE `FadeOut.clean_up_from_scene` ends with `self.interpolate(0)`, and GL's `FadeOut` finishes at
  `final_alpha_value = 0`: a faded-out glyph is whole again. `Uncreate`, `ShrinkToCenter` and
  `Unwrite` (CE; GL's reversed Write) end at their final state in both libraries, and CE
  `Write(reverse=True)` inverts its group in `begin` and back in `finish` while its starting copy
  keeps the inverted order (restoring removers above).

<a id="validation-suite"></a>
*Validation suite* (`npm run export-check` in `app/`, Vitest with `vitest.export.config.ts`,
`tests/export/export.check.ts`; several minutes, not part of `npm run check`). Cases: the examples
(hello, one-to-many, animation-blocks, multiline) with exact (companion) snapshots and with MathJax
snapshots (positional helper; the evaluator keeps the exact LaTeX geometry, resolved through the
MathJax snapshot, so the comparison stays strict), the synthetic projects of
`tests/export/projects.ts`, an off-grid project (snapping; frames only), the font-text project once
more with the saved contour signature of one of its texts changed (what other fonts would make of
it: the scene must name that text on stderr, only that one, and render the same frames; no other
case may print the warning), and once with that text cut down to two letters while the scene still
names its fourth glyph (frames only: the scene must say how many glyphs it found and run to the
end), and once with nothing having shaped its texts (`pango-text-never-shaped`: counted by their
boxes; frames only: the scene must name the texts Manim builds with another number of glyphs, the
one whose font joins the letters of a ligature, and run to the end), the font texts shaped by the
other library (a project of one-line texts compared frame by
frame like the rest; the one with texts of several lines for its frames only, the libraries spacing
lines each its own way), the example whose file carries the geometry of its font texts
(`text-pango`: drawn from what the file holds, as on Open, and compared frame by frame for the
library that shaped it; when the machine shapes those texts differently now, the scene must name
them and the frames are not compared) and a project made for the other library (frames only; loose
bent lines and arrows made for it are compared frame by frame, `loose-arcs-from-other-target`).
Each case is
rendered by `probe.py` through the library's own command line (niced, one at a time), which records
every frame's drawn family members: geometric bounding box, path length and enclosed area (curves
sampled nine points each, on both sides alike; GL subpaths split as its renderer splits them, by the
structure a partial path keeps, leaving out a subpath collapsed onto one point: neither draws), fill
and stroke RGBA, stroke width, and the class for the failure reports. Each frame is compared with
`evaluate(t)` (CE `t = j / fps`, GL the left limit of `(j + 1) / fps`) as multisets by minimum-cost
assignment, with these tolerances (`compare.ts`): box 0.02 scene units (0.03 for GL), 0.08 for a
drawable the preview marks `partial` (an outline being traced, a glyph being created or uncreated:
the preview cuts the path as each library does, but ManimGL cuts the quadratics it stores, each an
approximation of a cubic of the glyph), whose length and area still have to match; length and area
within 3 % (ManimCE, which matches exactly) or 5 % (ManimGL: its quadratic approximations of the
glyphs and its own tie-breaking when it aligns a morph) plus a floor of 0.01 units and 0.002
(ManimCE) or 0.008 (ManimGL: a thin fraction bar being morphed takes an intermediate shape that
depends on which of its equal sides ManimGL splits) square units — 0.08 and 0.02 for a partial path,
where its cut lands —; colour 0.02 per component, opacity 0.03, stroke width 0.15; a traced outline
shorter than 0.15 units may stay unmatched (it starts one frame apart) and is counted separately
while something is being traced in the frame. The summary lists each case's worst deviation and the
worst of every channel. The probe also records the frame each frame was filmed through — the centre
and the height of the camera's frame —, which must be the scene camera's of that instant
(`cameraAt`; Manim's own still frame for every project without a camera) within 0.002 scene units
(`CAMERA_TOLERANCE`; measured on the camera cases: ManimCE within 2e-7, ManimGL within 2.3e-4):
`camera-moves` (a target camera, a frame of its own, there and back, the way back to the start),
`camera-cuts` (a frame of 0 s that is not Manim's, a move cut into `_Part` slices by a clip that
appears and one that goes, a FocusOn with the camera away) and `camera-portrait` (9:16). The video's
frame count (ffprobe) and the probe's must both be `round(duration · fps)`. The mid-transform frame
of `hello.mfe.json` (t = 2.5 s, 960×540) is drawn by the preview renderer in Chrome (Playwright
against a Vite dev server of `app/`) and compared with the decoded Manim frame: foreground-mask IoU
≥ 0.75 and 1-px coverage ≥ 0.97. Chrome draws that canvas in software
(`--disable-accelerated-2d-canvas`, as in the e2e suite): on the GPU, which it uses on a Mac, the
edges are anti-aliased thinner and the IoU falls below what the thresholds were measured with
(ManimGL: 0.72 where software gives 0.79). Results go to `tests/export/results/` (git-ignored). The
suite skips itself without ffmpeg/ffprobe, the companion or LaTeX; a missing venv skips its target
and a missing Chrome the pixel check (`MFE_CE_PYTHON`, `MFE_GL_PYTHON`, `MFE_EXPORT_ONLY=<case>`).
Off Linux the cases that need their font texts shaped skip too (every font-text case but the text
cut down to two letters and the example that carries its geometry), with what the companion says:
its text workers run on Linux only in version 1.0. On Linux a text worker that is not ready skips
nothing, and those cases fail. `summary.json` keeps each skipped case with its reason: a run without
failures prints nothing of them. The companion the suite starts is told the interpreters it renders
with (`--ce-python`, `--gl-python`): Pango text is measured by the Manim that will draw it. ManimCE
is run with `--silent`, so that no render asks PyPI for a newer release: the check needs no network.
