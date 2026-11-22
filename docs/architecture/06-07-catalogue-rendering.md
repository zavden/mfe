# Architecture §6–§7: Animation catalogue, rendering

[Index](../ARCHITECTURE.md) · Previous:
[§5 Rules, editing blocks, events](05c-rules-blocks-events.md) · Next:
[§8 Export: Python](08a-export-python.md)

Holds §6 *Animation catalogue (v1)* (each intro and outro in ManimCE and ManimGL, and how the
evaluator reproduces both libraries) and §7 *Rendering* (the evaluator, the renderer, picking, the
editor overlays).

See also: [Glyph lifetime](05a-time-model.md#glyph-lifetime) ·
[Events](05c-rules-blocks-events.md#events) ·
[§8 Clip animations](08a-export-python.md#clip-animations) ·
[§11 The modules of `ui/`](11a-ui-layer.md#ui-modules)

---

## 6. Animation catalogue (v1)

| Model kind | ManimCE | ManimGL | Default duration · easing · lag_ratio |
|---|---|---|---|
| intro `write` | `Write` | `Write` | 1 s · linear · CE `min(4/max(1,n), 0.2)`, GL `min(4/(n+1), 0.2)` |
| intro `fade_in` | `FadeIn(shift, scale)` | `FadeIn(shift, scale)` | 1 s · smooth · 0 |
| intro `grow_from_center` | `GrowFromCenter` | `GrowFromCenter` | 1 s · smooth · 0 |
| intro `draw_border_then_fill` | `DrawBorderThenFill` | `DrawBorderThenFill` | 2 s · double_smooth · 0 |
| intro `create` | `Create` | `ShowCreation` | 1 s · smooth · 1 |
| outro `unwrite` | `Unwrite` | (none) reversed `Write`, `remover=True` | 1 s · linear · as write |
| outro `fade_out` | `FadeOut(shift, scale)` | `FadeOut(shift, scale)` | 1 s · smooth · 0 |
| outro `shrink_to_center` | `ShrinkToCenter` | `ShrinkToCenter` | 1 s · smooth · 0 |
| outro `uncreate` | `Uncreate` | `Uncreate` | 1 s · smooth · 1 |

Write/Unwrite run 1 s below 15 glyphs and 2 s otherwise in Manim; the model always stores an
explicit duration. Easing curves differ between CE and GL (`smooth` is a sigmoid in CE and a
quintic in GL); `rateFunction(easing, target)` implements both and is tested against values
computed with both libraries. `lagWindow` implements Manim's staggering. Morph blocks have no row
here: their pairs play the relation calls of
[§5 ("Relations in Manim")](05a-time-model.md#relations-in-manim) within one clip.

The evaluator (`scene/evaluator.ts`, `scene/anim/`) reproduces both libraries and is tested
against fixtures sampled from them (`scene/__tests__/fixtures/`, generators in `manim/`):

- The rate function applies **per glyph after lagging** (`rate(sub_alpha)`), not to the global
  alpha. Reversed animations use `rate(1 − sub_alpha)`.
- GL animates `get_family()`, which includes the group itself: the group takes stagger slot 0, so n
  glyphs stagger over n + 1 slots (the default lag ratio still uses n); a mobject that is its one
  glyph itself (a box, a circle, an underline, a cross line, ManimCE's brace: `glyphMembers`) has a
  family of one and no slot, except under Unwrite, whose `_Unwrite` helper wraps the glyphs in a
  VGroup of their own. CE staggers the glyphs only.
- Write = DrawBorderThenFill with outline width 2: the first half traces the outline as a partial
  path (with the glyph's stroke opacity: a box with no stroke at all shows no outline), the second
  half interpolates from that outline to the glyph's own style — a text glyph fills in as its
  outline fades, a stroked shape's outline grows to its own width and colour. The outline colour is
  per glyph, except in **GL `Write`**, which uses the group colour for every glyph.
- `Create`/`ShowCreation`/`Uncreate` cut paths by curve count (`pointwise_become_partial`),
  not by arc length, and keep the fill. GL stores quadratics, one per line and two per cubic, and
  cuts by that count: the preview converts the glyph as GL does (`toPointPath`) and cuts the
  quadratics (`partialQuadraticPoints`), so a glyph that mixes lines and curves is cut where GL cuts
  it; what remains is the quadratic approximation of each cubic, a few hundredths at most.
- `FadeIn(scale=s)` starts at scale `s` in CE but at `1/s` in GL; the model's `scale` is passed
  to Manim as is, and the preview mirrors each library. The fades and grows scale the fill and
  stroke opacities of the glyph's own style together (`set_opacity(0)`), Create paints the cut
  path as the glyph is; a transfer pair's morph interpolates the stroke width and opacity as it
  does the fill (`interpolate_color`), and ManimGL's FadeTransform ghosts take the fill colour of
  what they replace but keep their stroke colour (fixtures `manim-strokes-{ce,gl}.json`,
  `gen_strokes.py`: a stroked circle, a filled glyph, a rectangle painted both ways, a thick line,
  a dot and a box with no stroke under every intro, outro and transform).
- CE `Unwrite` reverses the glyph order and ignores its `rate_func` argument (always linear);
  GL has no `Unwrite` (reversed `Write`, `remover=True`). Unwrite inverts every list of submobjects,
  and a mobject stays before its own: an arrow's shaft goes first, then its tips from the last
  (`unwriteOrder`, audit A4-01), the order GL's `_Unwrite` takes too.
- Tweens interpolate parametrically with one eased alpha: position, scale, opacity linearly,
  rotation as a true rotation about the formula centre, flips as a scale passing from +1 to
  −1, colours linearly in RGB (what `Transform` does in both libraries).
- An easing that ends at 0 (`there_and_back`) leaves the start state, as Manim's `finish()`: a
  tween with it is a pulse, and the next tween starts from the state before it (`endsAtStart`,
  `ActionStates.after`).
- `appear` / `disappear` blocks are drawn as the intro / outro of the same kind on their glyphs
  only, i.e. as `K(VGroup(*G))` (what the exporter writes): the same looks, the default lag ratio for
  |G| glyphs, the glyphs staggered in ascending order (reversed for Unwrite), GL's extra family
  slot for the VGroup, and the centre of G's box at the current pose for fades, grows and
  shrinks. Fixtures sampled from real Scenes (`manim-blocks-{ce,gl}.json`, `gen_blocks.py`) cover
  subgroups brought in next to glyphs on screen, glyphs taken off and brought back, and plays that
  bring some glyphs while others leave.
- Emphasis blocks (D73; fixtures `manim-emphasis-{ce,gl}.json`, `gen_emphasis.py`, which also
  measures the export's helpers against the libraries' own classes): an **Indicate** is a part
  motion (anim/part.ts, `emphasisMotion` in anim/emphasis.ts) that scales its glyphs by `scale`
  about the centre of their box and turns them `color`, fill and stroke, driven by its pulse easing
  — Manim's `Transform` to the scaled, recoloured copy; a **Wiggle** scales them by
  `there_and_back` of the eased progress and turns them by `wiggle(s, n) · angle` about that centre
  (`PartProfile`), what the export's `_Wiggle` helper does: Manim's own Wiggle reads the centre
  again while it moves the glyphs one by one, which drifts it by a hundredth, and ManimGL's refuses
  an array pivot. The other three draw a temporary mobject (`role: 'temp'`, `glyph` −1, on the
  clip's layer after its glyphs, as Manim adds it; no click selects it) built from what Manim
  measures of the glyphs when the block starts (`measure`, the box rules of
  [§5](05b-attached-objects.md#attached-objects)): a **Circumscribe**'s frame, the
  `SurroundingRectangle` of the `fitShape` box rule, traced and untraced in one pass as
  `ShowPassingFlash` cuts it — the stretch `[α(1 + w) − w, α(1 + w)]` of the path, clamped to [0,
  1], of the eased progress α and `timeWidth` w, cut by curve count as each library cuts
  (`partial`); a **Flash**'s twelve lines from 0.1 to 0.3 away from the glyphs' centre (both
  libraries' defaults), each cut the same way with the library's own time width (1 in ManimCE, 2 in
  ManimGL, whose `ShowCreationThenDestruction` it is); a **FocusOn**'s disc,
  `Dot(radius=frame_x_radius + frame_y_radius)` at the origin interpolated to a point at the glyphs'
  centre, so that it shrinks and slides there while its fill rises to `opacity`, drawn over every
  track.
- Bringing back a glyph a remover took: CE's `FadeOut` restores its mobject in
  `clean_up_from_scene`, and GL's (1.7.2) in `finish()` (`final_alpha_value=0`), so neither needs a
  subclass; `Uncreate`, `ShrinkToCenter` and Unwrite leave degenerate glyphs in both libraries and
  need the restoring `clean_up_from_scene` (`super()` + `self.interpolate(0)`). In CE, Unwrite
  (`Write(reverse=True)`) inverts its group back in `finish()` while its starting copy keeps the
  inverted order, so a plain `interpolate(0)` after it would give each glyph its mirror's start
  state: invert around it (`reverse_submobjects(); interpolate(0); reverse_submobjects()`). GL's
  `Write` on a fresh VGroup traces outlines in the first glyph's fill colour unless
  `stroke_color` is passed; the preview uses the formula colour, as for intros.

## 7. Rendering

`createEvaluator(project, resolvedFormulas)` (scene) returns a `SceneEvaluator` whose `evaluate(t)`
is pure (`geometry(t)`, beside it, gives the editing tools the box of every glyph of each clip on
screen, drawn or not: [§11](11a-ui-layer.md#ui-modules), `preview/geometry.ts`). It reads formula
colours from the project and geometry from the render store; `placementMatrix` and `glyphColor`
(scene) define how a clip state places and colours a formula, for the evaluator and the exporter
alike; `stateAt(clip, t, target)` gives the clip state as shown at `t` — a running tween blends the
numbers, the rest comes from the nearer keyframe — and `placementAt` its placement, for the editor
overlays (selection box, the Shift transform handles, which edit the keyframe in effect at the
playhead through `keyframeAt` / `patchKeyframe`) and the property clipboard. Clip intervals are
half-open except at the **end of the scene, which is inclusive**: `evaluate(duration)` shows the
final state (what playback shows when it stops) — a stint that lasts until the end is drawn at the
end of whatever takes it off (an outro or a disappear that ends there leaves nothing, an outro of
kind `none` leaves the glyph), except one a transfer pair ends; video frames are `k / fps` for
`k < round(duration · fps)`. `exportEvaluator(project, resolvedFormulas)` is the same evaluator with
hidden tracks drawn: hiding a track is a preview toggle, the video exporters use it and the Python
export includes those clips by construction. Its third argument, the option `frame` of
`createEvaluator`, is the size of the video when that is not the project's: the frame of the scene
is the picture's then, as in the Manim that renders that size, and what reads the frame reads that
one (a FocusOn's disc starts at `frame_x_radius + frame_y_radius`).
The evaluator returns `Drawable`s: final cubic paths in scene units with an optional fill
(null while Write draws outlines, or for a stroked shape) and an optional stroke, both from the
glyph's own style (`GlyphStyle`: the render's, `TEXT_STYLE` for text) scaled by the clip's opacity;
`role` says whether it is an object of the project (what a click selects) or a temporary effect,
and `partial` whether its path is a cut of the glyph's (an outline being traced, a glyph being
created), which the export check compares loosely. Paths may be shared between frames and must
not be mutated. `Renderer.draw` only maps scene units to pixels (y flipped) and paints; it holds no
animation logic (`FrameStyle.underlay`, an optional callback drawn over the frame's background and
under the drawables, is the preview's grid; exports pass none). The frame it cuts at is the
camera's: `frameWidth` by `frameHeight` about `frameCenter` — the origin when absent, where Manim's
frame is until a scene camera moves it —, and `cameraThrough(frame, aspect)` is the camera that
looks through a frame of the scene, which then fills the surface as it fills the video.
`FrameStyle.unclipped` draws the world around the frame instead: the background over the whole
surface and nothing cut (the multicamera's view, which draws the frame itself). The same renderer
draws the preview and every frame of a video export. Draw order: ascending `z` (front-most track
last), then array order. `Renderer.pick` finds the topmost drawable under a scene point: one whose
fill contains it, or whose stroke passes within half its width plus the slack the preview adds
(`STROKE_SLACK`, a few CSS pixels, so that a thin line can be clicked) — a stroke is hit along its
line only, so what sits inside a hollow shape stays under the pointer; temporary drawables are never
picked. Where no ink is under the point, the preview takes the clip it is beside (`pickClip`,
`ui/preview/interaction.ts`): one with filled glyphs whose padded box holds the point, before an
open stroke that passes within the padding (a line, the shaft of an arrow, the lines of a cross: the
box of a line is mostly empty space, and is nobody's), before a hollow outline whose box holds it —
so the gap between two glyphs of a formula is the formula's, not the box's drawn around it in front
—, the front-most of each.

Editor overlays (`ui/preview/overlay.ts`: the hover, selection and related boxes, the outlines of
the selected block's glyphs, the glyphs picked with Alt, the transform handles, the snap guides, the
selection rectangle) are UI and never reach an export. The scene's background is the author's
choice, so each overlay line is drawn over a halo that contrasts with its colour (`haloOf`: dark
under light colours, light under dark ones) and reads on any background. The snap guides do not
follow the theme: their colour and width are editor preferences (`guideColor`, `guideWidth` in
`ui/preferences.ts`) and their halo is only a pixel wider than the line. Nor do the glyphs picked
with Alt and the rectangle that picks them (`glyphMarquee`; the rectangle that selects clips keeps
the accent): their colour is the preference `pickColor`, the yellow of the guides until another is
chosen in the Preferences menu. The frame itself is laid out by the panel, not by CSS
(`ui/preview/stageLayout.ts`, `alignedFrame`): the largest box of the project's aspect inside the
stage, with its sides and its viewport position on whole device pixels, so the canvas bitmap (CSS
size × dpr) reaches the screen 1:1 and nothing is resampled.
