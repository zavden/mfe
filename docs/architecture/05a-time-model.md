# Architecture §5 (1 of 3): Time model

[Index](../ARCHITECTURE.md) · Previous: [§4 Formula engine](04-formula-engine.md) · Next:
[§5 Attached objects](05b-attached-objects.md)

Holds the opening of §5 *Time model* (clips, intros, outros, actions, relations) and its subsections
*Relations in Manim*, *Glyph lifetime* and *Part transforms*. §5 goes on in
[05b](05b-attached-objects.md) (*Attached objects*) and [05c](05c-rules-blocks-events.md) (*Rules*,
*Editing blocks (UI)*, *Events*).

See also: [Rules](05c-rules-blocks-events.md#rules-enforced-by-validateproject) ·
[Events](05c-rules-blocks-events.md#events) ·
[§6 Animation catalogue](06-07-catalogue-rendering.md#6-animation-catalogue-v1) ·
[§8 Relations](08a-export-python.md#relations) ·
[§8 Morph blocks](08a-export-python.md#morph-blocks)

---

## 5. Time model

A **clip** places a formula on a track during `[start, end)`. Within a clip:

- the **intro** runs during `[start, start + intro.duration)`;
- the **outro** runs during `[end − outro.duration, end)`;
- **actions** — the animation blocks drawn on the clip — run inside it (a tween
  between the intro's end and the outro's start; the other blocks anywhere in the clip, beside the
  intro or the outro on other glyphs, see
  [Rules](05c-rules-blocks-events.md#rules-enforced-by-validateproject)):
  - a **tween** animates the whole formula (position, scale, rotation, flips, opacity, colours)
    from the current state to `to`;
  - an **appear** brings glyphs that are off screen onto it with an intro animation, a
    **disappear** takes glyphs that are on screen off it with an outro animation (both on chosen
    glyphs or `'all'`); a glyph whose first appear or disappear block is an appear skips the
    intro and waits for it, so an Appear block needs no hidden glyphs;
  - a **transform** moves and restyles some glyphs relative to where they are (shift; scale and
    rotation about their centre; colour; opacity).
  - a **morph** turns glyphs of the formula into other glyphs of the same formula — the next row of
    a derivation grows out of the previous one — with the pairs, styles and path arc of a relation
    (below): it is a glyph transfer from the clip to itself (["Glyph lifetime"](#glyph-lifetime)),
    so its targets arrive through it and skip the intro without being hidden.

A clip created from the Creator (a drop on the timeline, **Add to the timeline**) starts with the
intro its formula chose (`Formula.intro`, "Appears with" in the formula editor) or, when that is
`null`, the editor preference's — when the object takes it as it is, else none (`defaultIntroOf`,
`takesIntro`: a line is never grown, nor faded with a scale) —; the outro comes from the preference
(`ui/preferences.ts`, `newClipAnimations`). Changing a formula's intro (kind or duration) carries
along its clips that still had the previous one, same kind and duration, as one undo step
(`creator/formulaActions.ts`, `effectiveIntro`); clips retouched in Timing keep theirs. A clip
takes the new intro only as far as
it fits before its first animation block, the first window of a relation that leaves it and its
outro (`introRoom`: nothing else moves), or stays as it is when nothing fits; a clip on a locked
track stays, and a notice says so. While a region is marked on the timeline (D180) the new clip
takes the region whole instead of a default length at the playhead or under the pointer: dropped on
a track, on that track — which takes none when one of its clips is in the region (`regionFreeOn`),
and the drop says so —; added from a menu, on the first unlocked track that has the region free, or
on a new track on top (`addClipIn`).

A clip created from the Creator also starts where its object keeps its new clips
(`Formula.startPosition`, D124; `model/startPosition.ts`: `newClipState` gives the state, at the
centre of the frame for an object that keeps none). Only a new clip reads it, as it reads the intro:
the clips that exist keep their own position, a clip attached to another takes its place from its
target, and the export reads the clips alone. The text editors write it (["Text composition
workspace"](11d-templates-text-composition.md#text-composition-workspace)).

A **relation** moves glyphs from clip A into clip B during its window
`[B.start + offset, B.start + offset + duration)`. Each pair maps n source glyphs onto m target
glyphs with a style:

| style | Manim | Source glyphs |
|---|---|---|
| `transform` | `ReplacementTransform` | consumed |
| `copy` | `TransformFromCopy` (ManimGL semantics in both targets, see below) | stay in A |
| `fade` | `FadeTransform` | consumed |
| `fade_copy` | `FadeTransform` of a copy (format 33) | stay in A |

### Relations in Manim

The evaluator (preview, video) and the code generator agree on this mapping, so the preview of
a relation is what the exported scene does. A relation is one `self.play(...)` over its window
(`run_time = duration`, `rate_func = easing`) with one animation per pair:

| pair style | animation |
|---|---|
| `transform` | `ReplacementTransform(src, dst, path_arc=θ)` |
| `copy` | GL `TransformFromCopy(src, dst, path_arc=θ)`; CE `ReplacementTransform(src.copy(), dst, path_arc=θ)` |
| `fade` | `FadeTransform(src, dst, path_arc=θ)` |
| `fade_copy` | `FadeTransform(src.copy(), dst, path_arc=θ)` |

`src` is the glyph `A[i]` when the pair is one-to-one, otherwise `VGroup(A[i1], A[i2], …)`, and
`dst` likewise — with **both sides wrapped in a `VGroup`** whenever either side has more than one
glyph, so that Manim's `align_submobjects` / `add_n_more_submobjects` produces the split
(one-to-many) and merge (many-to-one) looks. Glyphs are listed in the pair's stored order, which
the editor keeps ascending. θ = `pathArc · DEGREES`. A pair with a custom path (`GlyphPair.path`,
D48) ignores θ: each submobject moves straight, shifted as a whole by where its path — the spline
laid on the chord between the submobject's centres at the start and at the end (`geom/spline.ts`) —
lies off that chord at the fraction α of its length, so the centre follows the curve at a uniform
speed while the shape interpolates as on a straight path (`interpolateAlongPath`); a chord of no
length plays straight. A submobject that stands for a **route** of the pair — one of its source
glyphs on its way to one of its target glyphs (`pairRoutes`, `model/transfers.ts`: every source
onto one target, one source to every target, several onto several as `add_n_more_submobjects`
aligns the two groups, `padFamily`; a `fade` only where each source plays on its own onto the one
target, since a group cross-fades whole) — follows the path of that route when it has one of its
own (`GlyphPair.routes`, D167) instead of the pair's (`routePath`).
The evaluator reproduces what each target library does for exactly these
calls (point alignment, padding with copies, path arcs, colour and opacity interpolation). A Morph
block is the same `self.play` in its own window, `A` and `B` being its one clip. A pair of several
sources and one target plays as one call per source, lowest index first and with bare names, unless
its `extras` is `merge`: `separate` repeats the style, `copies` uses the copy call for every source
but the principal, whatever the style (`sourceStyle`, D54). In CE every source but the first plays
as `Transform(…,
remover=True)` rather than a replacement: a second `Scene.replace` onto the same target would take
the target out of the source formula's submobject list and shift the indices of the glyphs after it.

How the evaluator reproduces those calls (`geom/morph.ts`, `scene/anim/morph.ts`; fixtures
sampled from both libraries on synthetic shapes and on real `MathTex` glyphs):

- Family alignment pads the smaller side with invisible copies (`add_n_more_submobjects`):
  one-to-many splits, many-to-one merges. Point alignment follows each library: CE matches
  subpaths, pads missing ones with null curves and cuts the shorter evenly; GL works on
  quadratics (cubic glyphs are converted with its own approximation), sorts subpaths by length
  and cuts the longest curves greedily (ties may differ from NumPy's `argpartition`).
- `FadeTransform` does no point alignment: each source glyph deforms onto the target group's box
  while fading out and each target glyph from the source group's box while fading in. In GL the
  ghosts also take the group's first-glyph colour. Under `fade_copy` (D185) what fades out is a copy
  of the sources, which stay, drawn by their clip: the copy's pieces take the source glyphs' keys
  with a `~`, as a padding copy does.
- Several sources onto one target (`GlyphPair.extras`, D54): `merge` is the alignment above;
  `separate` (the default) is one transform per source onto the same target, so every source
  arrives and they coincide; `copies` uses the pair's style for its stored principal (initialized
  to the lowest canonical source), while the others copy and stay. Rebases carry that identity;
  a lost principal requires manual repair (format v15). The evaluator builds each as a group of its
  own (`morphGroups`) and the exporter writes one animation per group in the same `self.play`.
- `copy` follows ManimGL in both targets: a forward transform of a copy of
  the source, so in the preview it moves exactly like `transform` while the source stays. CE's own
  `TransformFromCopy` is not used: it runs `Transform(dst, src)` backwards, which mirrors the
  easing (`1 − rate(1 − α)`) and bends a path arc to the opposite side. The CE export uses
  `ReplacementTransform(src.copy(), dst, …)` instead, and the CE fixtures are sampled from that.
- A morph is built from the source clip's pose at the window start and the target clip's pose at its
  end (validation keeps tweens out of the window); both are its clip's for a Morph block. Piece
  keys: see `Drawable.key`; they are unique at every instant, also between two transfers whose
  windows overlap — two that fade a copy of one source at a time (audit A3-02): each starts from
  the keys the ones before it in the events took, and one alone in its time keeps its own.
- Windows follow clip edits: the window is relative to B's start, so it moves with B; moving
  A or trimming either clip shifts, then shortens the window to fit
  `[max(A.start + A.intro, B.start), min(A.end, B.end − B.outro)]`; when the clips no longer
  overlap the window is left as is and validation reports it. A relation with a clip on a locked
  track (`relationLock`) is the exception: what plays on that track stays, its window in scene time
  and inside both clips — `fitRelationWindows` skips it, a move of its target counts its offset from
  the new start (`restoreLockedWindows`), and every edit of the other clip stops where the window
  would no longer fit in it, or is refused (`ui/relations/lockedRelations.ts`; deleting that clip,
  its track or its formula — `heldRelations` of `clipOps.ts`, said by `reportHeld` —, or splitting
  it so that the relation would go to its second half, too). A Morph block's window is
  the block's, relative to its clip like any block's.

### Glyph lifetime

A glyph can come on screen and leave it several times within its clip. `clipLifetimes(project)`
(`model/lifetime.ts`) simulates every clip once — the events, validation and the editor all read its
result, so they agree on which glyphs each animation touches. Relations and Morph blocks reach it as
**glyph transfers** (`glyphTransfers(project)`, `model/transfers.ts`): a derived description of what
moves glyphs — a keyed origin (`relation:<id>` or `morph:<actionId>`, `transferKey`; `isMorphKey`
tells them apart), the two clips (one clip twice for a morph), the absolute window (a morph's is its
block's), the pairs with their effective style, custom path (null for none) and the routes that
have a path of their own, the issue path of
the origin (`['relations', ri]` or `['clips', ci, 'actions', ai]`) — which lifetime (its `transfer`
causes), validation, the events (`TransferEvent`, whose id is the key), the evaluator and the
exporter consume instead of the stored records, so that both origins share one pipeline: the
relations come first, in their order, then the Morph blocks in clip and action order. Per clip it
walks the happenings in time order (ties: intro, transfer pairs — arrivals before departures, then
in transfer order, so relations before morphs —, actions, outro), keeping for each glyph g whether
it is on screen; g changes state when the animation that moves it starts:

| Happening | Glyphs it animates |
|---|---|
| intro (at `C.start`, instantly if `none`) | every glyph except the formula's `hiddenGlyphs` and the clip's own `startHidden` (every glyph, when the clip starts empty), the targets of incoming pairs and the glyphs waiting for an `appear` action (the first block naming them is an appear) |
| incoming pair (its window) | its targets |
| consuming pair (`transform`, `fade`) | its sources, which are gone afterwards for good |
| `appear` action | the targeted glyphs that are off screen — except glyphs consumed earlier (a relation or a Morph block made them part of other glyphs) and glyphs an incoming pair has still to bring |
| `disappear` action | the targeted glyphs that are on screen |
| `emphasis` action | the targeted glyphs that are on screen; an Indicate or a Wiggle keeps them busy, a Circumscribe, Flash or FocusOn only measures them when it starts (D73) |
| outro (ends at `C.end`, instantly if `none`) | the glyphs on screen when it starts, except those a later pair consumes |

A glyph that comes on screen during the outro leaves at `C.end`. Tweens, `transform` and `emphasis`
actions change no glyph's presence (an emphasis's glyphs are busy only when it animates them). The
result per clip: the glyphs of the intro, the outro and each action; per glyph its *stints* (what
brought it, what took it off); and per glyph its *busy* spans (intro, outro, transfer windows
including copied sources, actions — a tween is busy on every glyph) for
[the conflict rule below](05c-rules-blocks-events.md#rules-enforced-by-validateproject); and the
transfer pairs whose source is not on screen when their window starts (`absentSources`) or is still
arriving through another transfer then (`arrivingSources`). Between entering and leaving, a glyph is
drawn with C's state at that time, composed with its own part state when a `transform` action moved
it ([Part transforms](#part-transforms), below).

The evaluator draws from the stints alone (it re-derives no timing rule): at time t a glyph is
drawn iff one of its stints covers t (`enter.start ≤ t < exit.end`, and at the scene end also a
stint that lasts until then, unless a pair takes it —
[§7](06-07-catalogue-rendering.md#7-rendering)). It is animated by what takes it off once that has
started (outro, `disappear`), else by what brings it while that runs (intro, `appear`) — keeping
that animation's final look afterwards when its easing does not end at 1 — by the pair's morph
during a transfer window (a relation's or a Morph block's), and drawn plainly otherwise. A glyph
that comes back after a `disappear` is whole, in C's state at that time: the exporter restores what
a remover took ([§6](06-07-catalogue-rendering.md#6-animation-catalogue-v1)). Blocks on different
glyphs run at the same time independently.

So the intro animates "all glyphs except incoming targets, hidden glyphs and glyphs waiting for an
appear" and the outro, for a project without appear/disappear actions, "all glyphs except consumed
ones and hidden glyphs that never arrived" — exactly the `except` lists of `IntroEvent` /
`OutroEvent`. The waiting rule is what an Appear block means (the glyphs are not there before
it): placed at the start of a clip, or anywhere in it, it brings its glyphs in without the user
hiding them first; `ClipLifetime.waiting` lists them.

A **Morph block**'s pairs are incoming and outgoing pairs of its own clip: its targets skip the
intro and enter through their pair (nobody hides them by hand), its `transform` and `fade` sources
leave for good, and its `copy` sources stay, busy during the window. As an action,
`life.actions.get(morphId)` lists both sides of its pairs (ascending, nothing skipped) for the
timeline's lanes and dragging, the glyph picker and the preview's outline of a selected block; the
busy spans of those glyphs come from the transfer, not from the action. A consumed glyph never comes
back: a later pair that targets it is an error (`target-consumed`) and the lifetime leaves it off
screen. A consuming morph that starts during the outro keeps its source out of the outro, and its
target, on screen only from then on, leaves at the clip end.

**Hidden glyphs** (`Formula.hiddenGlyphs`, chosen in the formula editor, drawn in grey in its
glyph view) apply to every clip of the formula: they skip the intro, and appear when an incoming
pair or an `appear` action brings them — or never, which is what they are for now that an Appear
block hides its own glyphs until it runs. While
off screen a glyph still follows the clip's tweens, so it arrives in place. Used as a source when
it is not fully on screen, it appears out of nowhere when the relation or Morph block starts, as
Manim adds an animated mobject to the scene; validation warns (`source-hidden`).

**A clip that starts empty** (`Clip.startsEmpty`, format 31) treats every glyph of its formula so,
in that clip alone: `startHiddenGlyphs(clip, formula)` is the hidden glyphs of the formula or, for
such a clip, all of them (the simulation adds the indices the project names past the snapshot, as
it does for any clip). Its intro keeps its place in time
and animates no glyph (`IntroEvent.except` lists them all; the exporter writes no animation for
it), and only what a relation, a Morph block or an Appear block brings is ever drawn — what a Morph
block does within one clip, between two. Only a clip of a formula or a text takes it
(`starts-empty-kind`: a brace, a shape or a line is one piece); one that nothing ever fills gets a
warning (`starts-empty-unused`), and its idle intro none (`intro-empty` is about a leftover).

**Glyphs a clip leaves out itself** (`Clip.startHidden`, format 33) are the same for some glyphs of
one clip: `startHiddenGlyphs` joins them to the hidden glyphs of the formula, so they skip that
clip's intro — and only that clip's — and appear when an incoming pair or an `appear` action brings
them, or never. Nothing in the editor picks them by hand: a split writes the list on its first half
for the glyphs that only came on screen after the cut (Split at playhead, [§11](11a-ui-layer.md)),
which the second half — a clip of a copy that hides what is off screen at the cut — shows when their
time comes; the Timing tab says how many a clip leaves out and can take the list off. The list
follows its glyphs through a renumbering (`remapGlyphRefs`). Only a clip of a formula or a text
takes it (`start-hidden-kind`); glyphs of it that do not exist get a warning (`glyph-range`), and so
does a clip that, with it, has no glyph ever on screen (`start-hidden-unused`).

### Part transforms

A `transform` action moves, scales, rotates, recolours or fades some glyphs of a
clip *relative to where they are* when it starts: the shift in screen axes, the scale and the
rotation about the centre of those glyphs (the box of their points, Manim's `get_center()` of the
`VGroup`; glyphs of the block that have left for good — consumed by a relation, or taken out by a
disappear block they do not come back from — do not count, as in the exported scene). What it did
stays with them, so each glyph has, besides the clip's pose, a *part state*
(`scene/anim/part.ts`): a matrix in the formula-local frame — the scene operation conjugated by
the placement in force when the block ran, so that the glyph's scene matrix is `placement · part`
and a later tween of the whole formula carries the moved part along, as it carries Manim's
points — plus optional colour and opacity overrides. While the block runs its glyphs interpolate
with one eased progress (shift, scale and colour linearly, the rotation as a true rotation about
the part's centre, like a tween's); afterwards they keep what the block reached at `rate(1)`
(`there_and_back` leaves them where they were). Each override lasts until a tween of the whole
formula changes what it overrides — the colour override until a tween changes that glyph's
colour, the opacity override until a tween changes the clip opacity (`overridesEndedBy`, shared
with the exporter) — as `.set_color` / `.set_opacity` on the formula would; at that tween's
start the glyph takes the clip's own value. A
part transform changes nothing about what is on screen (glyphs off screen move along, so they
come back in place) and keeps its glyphs busy. The evaluator draws every glyph with its own
matrix — plain paths, the looks of intros / outros / blocks, the pivots of fade / grow / shrink,
and relation morphs, whose source is wherever the moved part ended up.
