# Project file format (manifest version 36)

A project is one UTF-8 `.mfe.json` file, which also carries the geometry of its font texts. A
project with imported audio is a portable `.mfe` package containing the manifest and every declared
payload, recordings and text geometry alike. The normative manifest definition is
`app/src/model/types.ts` and its zod mirror `app/src/model/schema.ts`; `app/src/model/validate.ts`
defines the semantic rules. The container is specified below and implemented in
`app/src/media/package.ts`; its version is independent of the manifest version. Units and
conventions are those of [ARCHITECTURE.md](architecture/01-03-foundations.md#3-conventions) (scene
units with y up, seconds, degrees, `#RRGGBB`).

Editor palette libraries are browser preferences, not project fields. Palette selection and Apply
palette copy literal hex into the existing color fields below; no palette IDs, role references or
source metadata enter this format. A project opened or recovered on a machine without its palette
library retains its saved appearance.

## Top level

| Field | Type | Notes |
|---|---|---|
| `format` | `"manim-formula-editor"` | Identifies the file type. |
| `version` | `36` | Manifest version (see *Versioning*). |
| `meta` | ProjectMeta | Scene settings. |
| `formulas` | Formula[] | The Creator list. |
| `tracks` | Track[] | Timeline rows, top to bottom; the first visual row is drawn in front. Audio rows do not affect visual stacking. |
| `clips` | Clip[] | Formula appearances on the timeline. |
| `audioAssets` | AudioAsset[] | Project-owned original sources, including unused imports. |
| `audioClips` | AudioClip[] | Independent instances of those sources on audio rows. |
| `relations` | Relation[] | Glyph transformations between clips. |
| `colorMatches` | ColorMatch[] | Match colours (Edit → Match colors): named lists of LaTeX pattern → colour. |
| `formulaGroups` | FormulaGroup[] | Optional, after the fields every project has: the groups of formulas of the Creator list. Absent while the project has none. |
| `camera` | SceneCamera | Optional (format 34): the scene's camera. Absent while the multicamera is off: the frame is then Manim's all along. |
| `slides` | Slides | Optional, the last field (format 35): the marks of the Slides mode — pauses and comments at instants of the scene. Absent while the mode is off. |
| `textGeometry` | `{ "<contentHash>": payload }` | Optional, a `.mfe.json` file only, and not a field of the project: the geometry payloads of its font texts (see *Text geometry in the project file*). |

## ProjectMeta

| Field | Type | Default | Notes |
|---|---|---|---|
| `name` | string | `"Untitled"` | |
| `target` | `"ce"` \| `"gl"` | `"ce"` | Manim flavour for exact rendering, easing curves and export. |
| `width`, `height` | int | 1920, 1080 | Output pixels, 16–7680 × 16–4320; fix the frame aspect ratio. |
| `fps` | int | 60 | 1–240. |
| `background` | colour | `#000000` | |
| `preamble` | string | `""` | Extra LaTeX after the packages of every formula. |
| `duration` | number \| null | null | Scene length; null = last visual or audio end for browser playback/export, last visual end for Manim. An explicit value applies to both. A scene is 24 hours (86400 s) long at most: past it — this value, or the `end` of a clip or of a sound — the project opens with the error `scene-length`. |

## Formula

An object of the Creator. `kind` says what it is and how its `source` is read: a formula (`math`), a
LaTeX text (`tex`), literal font text (`text`), a brace (`brace`), a shape (`shape`: a box,
circle, underline or cross) or a line (`line`: a line, a dashed line, an arrow or a double arrow).
The last three have no source; their geometry is Manim's — a brace's and a shape's fitted to the
glyphs their clip hangs on, a line's run between its two ends. Every field below belongs to every
kind unless its row names one.

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `kind` | `"math"` \| `"tex"` \| `"text"` \| `"brace"` \| `"shape"` \| `"line"` | Formula, LaTeX text (`Tex` / `TexText`), literal Pango text (`Text`), brace, fitted shape, or line (format 26). |
| `name` | string | Display name; base of the Python variable. Unique (warning otherwise). |
| `source` | string | The source text. `math`: a single string of LaTeX in math mode (rendered like `MathTex(source)`). `tex`: LaTeX in text mode (`$…$` for maths, `\\` for a line break, a blank line for a paragraph), rendered like `Tex(…)` (ManimCE) / `TexText(…)` (ManimGL) with the wrapper its `layout` needs. `brace`, `shape`, `line`: empty (nothing is typeset: [ARCHITECTURE §4](architecture/04-formula-engine.md#existing-producers-and-geometry-conventions)). |
| `packages` | string[] | `math` only. `\usepackage{…}` names: letters, digits, `_` and `-`. |
| `font` | `{ family, weight, slant }` | `text` only. Explicit family name (1–256 characters), `weight: "normal" \| "bold"`, `slant: "normal" \| "italic"`; these are authored requests, not resolved fallback faces. |
| `geometry` | TextGeometryRef \| null | `text` only. Last durable geometry payload, possibly stale while a new render is pending. Null means no saved geometry; authored source remains saveable. |
| `layout` | TextLayout | `tex` only. `{ width, align, lineSpacing }`: `width` in scene units (`null` = as wide as the text comes, each `\\` line centred; a number = a `\parbox` that wide, where LaTeX breaks the lines), `align` `"left"` \| `"center"` \| `"right"` of the lines inside the width, `lineSpacing` a factor of LaTeX's distance between lines (1 = as it comes). The app writes the LaTeX wrapper ([ARCHITECTURE §4](architecture/04-formula-engine.md#existing-producers-and-geometry-conventions)). |
| `sharpness` | number | `brace` only, > 0. ManimCE's `sharpness` (2): how long the straight runs of the brace are for its width. ManimGL draws its brace from a font and ignores it. |
| `width` | number | `brace` and `shape`, ≥ 0. The width of the target the brace or the shape was fitted to, in scene units: derived from the target while the object's clip is attached (like the placement), kept when it is detached. |
| `shape` | `"box"` \| `"circle"` \| `"underline"` \| `"cross"` \| `"cross_line"` | `shape` only. Which shape: a rectangle around the glyphs (Manim's `SurroundingRectangle`; filled with no stroke, it is a highlight behind them), a circle through the corners of their box, a line under them (`Underline`), a cross over them (`Cross`) or a cross line (format 25), one line over a diagonal of their box as each line of a cross is. |
| `style` | `{ fillOpacity, strokeWidth, strokeOpacity }` | `shape` only. How it paints its path: the opacity of its fill (0–1), the width of its stroke (Manim `stroke_width` units, ≥ 0) and the opacity of that stroke (0–1); `color` colours the stroke, and the fill too unless there is a `fillColor`. Manim's defaults: no fill, stroke 4 (a cross's 6), opacity 1. |
| `fillColor` | colour, optional | `shape` only (format 23). The colour of its fill, Manim's `fill_color`, when it is not the stroke's. Absent, the fill takes `color` — and the colour a clip overrides it with — as the stroke does. An underline and a cross have no fill to colour. |
| `diagonal` | `"dl_ur"` \| `"ul_dr"`, optional | A cross line only (format 25). The diagonal it runs along, from its first corner to its second: from the lower left corner of the box up to the upper right one, or from the upper left one down to the lower right one. Absent, `"dl_ur"`. |
| `cornerRadius` | number | `shape` only, ≥ 0. A box's corner radius in scene units (0 = square corners; ManimCE's `corner_radius`, ManimGL's `round_corners`). |
| `height` | number | `shape` only, ≥ 0. The height of the fitted box, as `width` (a circle's diameter is its `width`; an underline's height is 0). |
| `line` | `"line"` \| `"dashed"` \| `"arrow"` \| `"double_arrow"` | `line` only (format 26). Which line: Manim's `Line`, `DashedLine`, `Arrow` (a tip at its end) or `DoubleArrow` (a tip at each end). |
| `vector` | `[x, y]`, finite | `line` only. From where the line is drawn to where it ends, in scene units: the user's while the line is free (its clip's position is the centre of what is drawn), derived from its ends while the object's clip is attached (like the placement), kept when it is detached. A line has no scale of its own. |
| `strokeWidth` | number | `line` only, ≥ 0. Manim's `stroke_width` (4 is a line's default, 6 an arrow's). A short arrow is drawn thinner, as Manim caps it: at five times its length, or five times what its two tips leave of it for a double arrow. |
| `tipLength` | number | `line` only, > 0. An arrow's `tip_length`, the length and width of its tips in scene units (Manim's 0.35), capped at a quarter of the arrow's length. Kept by a line that has no tip. |
| `dashLength` | number | `line` only, > 0. A dashed line's `dash_length` in scene units (Manim's 0.05); half of the line is painted. Kept by a line that has no dashes. A dashed line's is at least 0.01: a shorter one opens with the error `line-dash`, and is drawn with 10,000 dashes at most. |
| `curve` | `null` \| `{ shape: "arc", degrees, trim }` \| `{ shape: "spline", nodes }` | `line` only (format 28). How the line is bent between its two ends; `null` is a straight line. An arc is Manim's `path_arc`: `degrees` of a circle, from −300 to 300, counter-clockwise from the start for a positive value (the line bulges to the right of its way); `trim`, from 0 to 0.5, is the part of that arc the gap at each end takes (`attach.buff`, which Manim leaves along the arc), derived with `vector` while the line is attached and kept when it is detached. A spline is cubic curves through `nodes`, at least two, each `{ at, in, out, smooth }` as a custom path's (see `path` of a pair), in the frame of the line's two ends: the first at `[0, 0]`, the last at `[1, 0]` (validation refuses any other, `line-curve`), so the curve stretches and turns with them. A handle that is `null` sits a third of the way to the next control point of its stretch. |
| `tip` | `"triangle"` \| `"stealth"` \| `"dot"` | `line` only (format 28). The shape of an arrow's tip: Manim's triangle, ManimCE's `StealthTip` (a notched arrowhead with a stroke of its own) or a dot as wide as the tip is long. Kept by a line that has no tip. |
| `startTip` | `"triangle"` \| `"stealth"` \| `"dot"` | `line` only (format 28). The shape of the tip at the start of a double arrow. Kept by a line that has none there. |
| `tag` | `{ color, icon }` | Identification colour and optional short icon (emoji / ≤ 8 chars); `icon: null` = the name stands in. |
| `fontSize` | number | Manim `font_size` (48), > 0. |
| `color` | colour | Default glyph colour (`#FFFFFF`). |
| `glyphColors` | `{ "<index>": colour }` | Per-glyph colours, canonical indices. |
| `hiddenGlyphs` | number[] | Canonical indices (written ascending, without repeats): glyphs every clip of the formula leaves out of its intro. Such a glyph appears when an incoming relation, a Morph block or an `appear` action brings it in ([ARCHITECTURE §5, "Glyph lifetime"](architecture/05a-time-model.md#glyph-lifetime)). |
| `intro` | IntroSpec \| null | The intro every new clip of the formula starts with (its hidden glyphs and the targets of relations and Morph blocks stay out, as of any intro); `null` = the editor's preference (Edit → Always add intro), when the object takes it as it is, else none (a line takes no intro that grows it, nor a fade with a scale). Changing it also updates the clips of the formula that still had the previous intro (same kind and duration); clips retouched in Timing keep theirs. |
| `startPosition` | `[x, y]`, optional | Where every new clip of the object starts (format 24): the centre of its box in scene units, both numbers finite. Absent = the centre of the frame; the app never writes `[0, 0]`. Read once, when a clip is made: the clips that exist keep their own `initial.position`, and the exported Python reads only the clips. The text editors write it; any kind may carry it. |
| `snapshot` | FormulaSnapshot \| null | Defines the canonical index space. |

**FormulaSnapshot**:
`{ backend: "mathjax" | "latex" | "pango", key, glyphs: [{ label, center, size }] }`.
`center` and `size` are in formula-local scene units at `fontSize`, with the formula's box
centred on the origin. The snapshot lets references survive re-rendering with another
backend or an edited formula (see
[ARCHITECTURE §3](architecture/01-03-foundations.md#glyph-index-spaces)). A font text has the
`pango` backend whatever drew it: the glyphs of its geometry when its `key` is the geometry
reference's, or, for a text nothing has shaped, its placeholder boxes, one per character that draws
something, in the order of the source ([ARCHITECTURE §4, "Placeholder
boxes"](architecture/04-formula-engine.md#placeholder-boxes-a-font-text-nothing-has-shaped)). Such a
text has no `geometry`, or one of an earlier source.

Literal `text.source` contains plain Unicode, never LaTeX or user-supplied markup. Input line
endings become LF; source is not trimmed or normalized to NFC/NFD. It is limited to 32 KiB of
UTF-8 and 512 lines, with no NUL or unpaired surrogate. Manual newlines, left alignment and
the target adapter's native default spacing define its first layout contract. Typography applies
to the whole object; `glyphColors` remains post-shaping paint on canonical drawable indices.

### Owned text geometry

`TextGeometryRef` is `{ contentHash, byteLength, key, basisKey }`. Its SHA-256 hash is 64 lowercase
hexadecimal characters; `byteLength` is positive and at most 16 MiB. `key` identifies the actual
render, including native/font provenance; `basisKey` identifies the authored request independently
of the currently available native environment. Both keys are nonempty and at most 1,024 characters.
The payload MIME type is `application/vnd.manim-formula-editor.text-geometry+json`.

The payload is strict UTF-8 JSON in its compact form: the bytes of `JSON.stringify(value)` for the
value it holds. The test is that `JSON.stringify(JSON.parse(payload))` gives the payload back, byte
for byte. That asks for more than no whitespace: no byte order mark, numbers and string escapes as
JavaScript writes them (`1e+21`, no `\/`), no member twice, and the members of an object in the
order JavaScript keeps them (those with integer names first, ascending). `contentHash` and
`byteLength` are those of these bytes, so a geometry has the same identity as a payload of a package
and as a member of a `.mfe.json` file, which holds the value and not the bytes. A payload written in
any other form is refused as damaged. Its value has `format: "mfe-text-geometry"`, `version: 1`, and
these fields:

| Field | Meaning |
|---|---|
| `basis` | `{ source, font, fontSize, target }`, the exact authored request that produced the geometry. It remains unchanged when a newer source makes the artifact stale. |
| `basisKey`, `key` | The identities repeated by the manifest reference; mismatches are rejected. |
| `glyphs` | Ordered `{ index, label, kind, contours, bbox, sourceRanges }` entries. `kind` is `"char"` or `"rule"`. A glyph is the child of the same index in Manim's `Text`, whose children all draw. A `nativeIndex` field, once reserved for a child index of its own and never written, is ignored when read. |
| `bbox`, `logicalBBox` | `{ minX, minY, maxX, maxY }` in formula-local scene coordinates: drawable ink/control-point bounds and independent logical layout bounds. |
| `lines` | `{ start, end, baseline, bbox }` records in the same coordinates. |
| `provenance` | `{ environmentKey, adapterVersion, versions, calibration, resolvedFonts, geometrySignature? }`. Version names map to strings; calibration is positive. Each face has `family`, `face`, `weight`, `slant`, nullable `fontHash` and `faceIndex`, and source `ranges`. The optional signature is 64 lowercase hexadecimal characters for native contour verification. No machine paths are stored. |
| `diagnostics`, `warnings` | Structured `{ code, message, ranges }` diagnostics and ordinary warning strings. |

Every source range is half-open `{ start, end }` in UTF-16 code units of `basis.source`; neither
boundary may split a surrogate pair. A source range may map to several drawable glyphs, or none.
Contours follow `geom.Contour`: flat coordinates of length `2 + 6k`, with cubic control points.
The schema accepts at most 8,192 glyphs and 500,000 points, finite coordinates bounded in magnitude
by 1e9, ordered glyph indices, and bounds enclosing their points/glyphs.
The schema and validator are `model/text.ts`; font bytes and native debug serialization are absent.

Geometry matching the current authored basis remains usable for browser rendering offline.
Reproducing it with a native constructor additionally requires a compatible font/adapter
environment. A source edit where a companion shapes the text replaces the artifact; where none
does, the snapshot becomes the one of the text's placeholder boxes and `geometry` is `null` until
the text is shaped. A change of font or size alone where nothing shapes it keeps the older artifact,
with its old basis and canonical snapshot, until a verified render can carry the references over
(where the artifact's bytes are at hand; [ARCHITECTURE §4, "Geometry not at
hand"](architecture/04-formula-engine.md#geometry-not-at-hand), for when they are not).
A failed render never replaces authored source.
Draft renders are transient; only a result of a committed source becomes an owned artifact.

### Text geometry in the project file

A `.mfe.json` file can carry the geometry payloads of its font texts in a top-level `textGeometry`
object, beside the fields of the project: `{ "<contentHash>": value, … }`. Each member is the value
of one payload, an object with the fields above, under the hash by which a `TextGeometryRef` names
it. The hash and the byte length of a member are those of `JSON.stringify(value)` in UTF-8, whatever
whitespace the file has around its tokens and however it spells its numbers and escapes. The order
of the members of each object is part of those bytes: a program that writes the file again with its
keys sorted changes the hashes, and the members are then refused. The app writes the section last,
its members sorted by hash and each on one line that holds exactly those bytes: a text that is
shaped again changes one line of the file, and `sha256sum` of a line's value gives the hash that
names it.

The section belongs to the file, not to the project. In memory, in the browser's autosave and in the
`project` of a package the texts only name their geometry by reference; a `textGeometry` member
inside a package's `project` is ignored. A member that no text of the project names is ignored when
the file is read and is not written back. A reference without a member is a payload the file was
written without, like one that a package lists under `missing`: the text stays in the project. A
`textGeometry` that is not an object carries nothing: the project opens without it, with a warning.

## Track

`{ id, kind, name, hidden, muted, locked }`. `kind` is `"visual"` or `"audio"`. A visual track has
`muted: false`; its `hidden` affects preview only, so hidden visuals still export. An audio track
has `hidden: false`; its `muted` silences both preview and audio-bearing exports. `locked` prevents
authored edits while still allowing playback and selection. Visual clips require visual tracks;
audio clips require audio tracks. Audio rows may be reordered without changing visual stacking.

## AudioAsset

An imported original belongs to the project even before it is placed on the timeline. Instances
share its immutable bytes by content identity; editing an instance never changes the original.
Names are ordinary display names, with no Python-identifier restriction. No bytes, decoded PCM,
waveforms, Blob URLs or browser database keys are embedded in this model.

| Field | Type | Notes |
|---|---|---|
| `id` | string | Global entity ID, separate from the shared content identity. |
| `name`, `originalName` | string | Display name and imported file name. |
| `mimeType` | string | Original media type; portable package entries permit at most 256 characters. |
| `byteLength` | integer | Original byte length, from 0 through `Number.MAX_SAFE_INTEGER`; imported originals are nonempty. |
| `contentHash` | string | SHA-256 of the original bytes, exactly 64 lowercase hexadecimal characters. |
| `duration` | seconds | Actual original duration, finite and positive. It may exceed the placed source window. |
| `sampleRate` | integer | Positive source sample rate in Hz. |
| `channels` | integer | Positive source channel count. |

## AudioClip

| Field | Type | Notes |
|---|---|---|
| `id`, `assetId`, `trackId` | string | Instance ID, reusable source ID and audio-row ID. |
| `start`, `end` | seconds | Finite, nonnegative timeline bounds; `end > start`. The interval is half-open. |
| `sourceStart` | seconds | Finite, nonnegative source time at timeline `start`, at playback rate 1. |
| `volume` | AudioVolumePoint[] | Instance-owned source-time amplitude curve, including points outside the visible source window. |

There is one independent source-window definition:

```text
sourceTime = sourceStart + timelineTime - start
sourceEnd  = sourceStart + end - start
sourceFrame(t) = round(t * sourceSampleRate)
```

Both ends of a half-open source window use the same absolute sample-rounding rule, so adjacent
split pieces share one boundary without repeating or skipping a frame. Move leaves the source
window and curve unchanged. Left trim changes timeline start and source start together; right
trim changes the visible end. Trim retains all curve points, so extending an edge restores its
hidden automation. Split and Duplicate share the asset and copy editable point records into
independent instances. Split invents no fade or extra boundary point: the same source-time curve
is evaluated on each side.

An `AudioVolumePoint` is `{ id, time, gain }`: `time` is a finite, nonnegative source time, and
`gain` is finite linear amplitude in `[0,4]` (0–400%). Points must have unique, increasing times
within the original duration. Empty `volume` means constant gain 1. Between points the gain is
linear; outside them the nearest value is held. Fade In and Fade Out replace ordinary points
within their selected interval, preserving outside point records. No hidden fade multiplier or
automatic normalization is stored. Changing a boundary can change interpolation beyond it.

Audio clips may mix across rows, but cannot overlap on the same row. Their source windows must
fit the asset duration. The editor places audio within the first 60 minutes of the project, and an
export mixes at most 60 minutes of sound. The format sets no such bound: the scene can be longer, a
file may hold later clips (they play), and longer originals remain reusable through bounded source
windows.

## Clip

| Field | Type | Notes |
|---|---|---|
| `id`, `formulaId`, `trackId` | string | |
| `start`, `end` | seconds | Intro starts at `start`, outro ends at `end`. |
| `initial` | ClipState | State at `start`. |
| `intro` | AnimationSpec | Kinds: `none`, `write`, `fade_in`, `grow_from_center`, `draw_border_then_fill`, `create`; and `grow_arrow` (format 29), for a clip of an arrow or a double arrow alone: Manim's `GrowArrow` — it grows from its start — for a straight one, and for a bent one (it has a `curve`) the editor's own, which draws it along its way with its tip on the end of what is drawn. |
| `outro` | AnimationSpec | Kinds: `none`, `unwrite`, `fade_out`, `shrink_to_center`, `uncreate`. |
| `actions` | ClipAction[] | The animation blocks on the clip, sorted by start. Things that animate the same glyph cannot overlap in time; a tween animates every glyph and stays between intro end and outro start ([ARCHITECTURE §5, "Rules"](architecture/05c-rules-blocks-events.md#rules-enforced-by-validateproject)). |
| `attach` | ClipAttach \| null | An object pegged to glyphs of another clip (R4): its placement at its start is derived from them, as Manim measures them then. `null` = placed freely. |
| `previewLocked` | boolean, optional | Locked in the preview (format 20): the editor's preview draws the clip and leaves it alone — a press goes through it to what is under it, and nothing done in the preview selects or moves it. The timeline and the panels edit it as any other clip, and the scene, the export and the video are the same with or without it. Absent when the clip is not locked. |
| `startsEmpty` | boolean, optional | The clip starts empty (format 31): none of its glyphs comes in with the intro, as the hidden glyphs of its formula do not (`hiddenGlyphs`). Each glyph appears when an incoming relation, a Morph block or an `appear` action brings it in, and a glyph nothing brings never shows. The intro keeps its place in time and animates nothing. Only a clip of a formula or a text can carry it. Absent when the clip does not start empty. |
| `startHidden` | number[], optional | Glyphs of the clip that stay out of its intro (format 33), besides the hidden glyphs of its formula (`hiddenGlyphs`) and in this clip alone: canonical glyph indices (written ascending, without repeats). Each appears when an incoming relation, a Morph block or an `appear` action brings it in, and one nothing brings never shows in this clip — what `startsEmpty` says of every glyph. Splitting a clip writes it on the first half, for the glyphs that only came on screen after the cut — also those the formula hides, or of a clip that starts empty, so that showing them again does not bring them into the first half; the app shows how many it keeps out and can bring them back. Only a clip of a formula or a text can carry it. Absent when the clip leaves none out. |

**ClipState**: `position` [x, y] (centre of the formula box), `scale`, `rotation` (degrees),
`flipX`, `flipY`, `opacity` (0–1), `color` (colour or null), `glyphColors` (per glyph).
Glyph colour precedence: clip `glyphColors` > clip `color` > formula `glyphColors` > formula `color`.
A state can also carry the paint of a shape (format 23), each field optional: `strokeWidth` (≥ 0),
`strokeOpacity` and `fillOpacity` (0–1, before `opacity`) and `fillColor` (colour). They are read
on the clip of a shape only, where one that is absent means the object's own (`style`,
`fillColor`): a tween sets the ones its `to` names, and the tweens after it keep them. Between
two states every one of them goes linearly, as Manim's `Transform` interpolates a style — the
opacities with the clip's `opacity` in them, the colours component by component in RGB, the fill's
from the stroke's colour when it had none of its own.

**AnimationSpec**: `{ kind, duration, easing, lagRatio, shift, scale }` — `lagRatio: null` means
Manim's default; `shift` and `scale` are used by `fade_in` / `fade_out` only.

**ClipAction** — every kind has `{ id, kind, start, duration, easing }`; `start` is relative to
the clip start, `duration` is positive.

| `kind` | Extra fields | Meaning |
|---|---|---|
| `"tween"` | `to`, `fit` (optional), `ends` (optional) | Moves the whole object to a state: `to` is a partial ClipState (`glyphColors` merges into the current colours); on a shape it can repaint it too (the paint fields of a ClipState). With `fit` (a shape only, format 23) it carries the shape to surround other glyphs: see *TweenFit* below. With `ends` (a line only, format 30) it carries the two ends of the line elsewhere: see *TweenEnds* below. |
| `"appear"` | `anim`, `glyphs`, `lagRatio`, `shift`, `scale` | Brings glyphs that are off screen onto it; a glyph it names before any `disappear` does skips the intro and waits for it. `anim`: an intro kind other than `none`. |
| `"disappear"` | `anim`, `glyphs`, `lagRatio`, `shift`, `scale` | Takes glyphs that are on screen off it. `anim`: an outro kind other than `none`. |
| `"transform"` | `glyphs`, `shift`, `scale`, `rotation`, `color`, `opacity` | Moves or restyles some glyphs relative to where they are: `shift` [x, y] in scene units, `scale` (> 0) and `rotation` (degrees) about the centre of those glyphs, `color` and `opacity` (0–1) set on them, `null` = unchanged. |
| `"emphasis"` | `effect`, `glyphs`, `color`, `scale`, `angle`, `wiggles`, `buff`, `strokeWidth`, `timeWidth`, `opacity` | Draws attention to `glyphs` (as in `"appear"`; those on screen when the block starts) for the block's duration and leaves them as they were. `effect`: `"indicate"` (the glyphs swell by `scale` and turn `color` and back — a pulse, so `easing` is `there_and_back` or `there_and_back_with_pause`), `"wiggle"` (they swell by `scale` and rock by `angle` degrees `wiggles` times), `"circumscribe"` (a rectangle `buff` around them in `color` with `strokeWidth`, traced and untraced in one pass, `timeWidth` of it visible at a time), `"flash"` (twelve lines of `color` out of their centre) or `"focus_on"` (a disc of `color` and `opacity` shrinking from the whole frame onto their centre, over everything). The fields an effect does not use keep Manim's defaults. |
| `"morph"` | `style`, `pathArc`, `pairs` | Moves glyphs of the formula onto other glyphs of the same formula (the next line of a derivation grows out of the previous one): `pairs` as in a relation (`{ from, to, style }`, canonical indices of this formula on both sides, a glyph never on both sides of one block), `style` the pairs' default (`copy` for a new block), `pathArc` in degrees (between −360 and 360, as a relation's). Its pairs play like a relation's during the block ([ARCHITECTURE §5, "Glyph lifetime"](architecture/05a-time-model.md#glyph-lifetime)): targets arrive through them and skip the intro; `transform` and `fade` sources are consumed, `copy` sources stay. |

**TweenFit** (format 23) — `{ clipId, glyphs, also?, fitted }`, the `fit` of a tween on a shape's
clip: the tween carries the shape to surround `glyphs` of the clip `clipId` — and those of the
clips of `also`, as an attachment's `also` —, as Manim's `Transform(shape,
SurroundingRectangle(other))`. The glyphs are measured when the tween starts and the shape is
fitted to them as its Manim class fits it, with the gap of the shape's own attachment (0.1, a
cross's 0, for a shape that hangs on nothing). `fitted` is `{ center: [x, y], width, height }`,
what that fit gave, or `null` until it was measured: derived data, as the size of an attached
shape is, written by the app and written again whenever the target changes. While the tween runs
the shape goes point by point from where it is to that fit; once it ends it is that fit — on
`center`, unturned, at scale 1, `width` × `height` —, so the placement fields of `to` (`position`,
`scale`, `rotation`, `flipX`, `flipY`) are not read: `to` gives the appearance it arrives with.
The tweens after it start from there. A tween with an easing that returns leaves the shape as it
was. The targets follow the rules of an attachment's ([ARCHITECTURE §5, "Attached
objects"](architecture/05b-attached-objects.md#attached-objects)), at the instant the tween starts;
deleting the clip of one of them removes the tween.

**TweenEnds** (format 30) — `{ start, end, buff, degrees, drawn }`, the `ends` of a tween on a
line's clip: the tween carries the two ends of the line elsewhere. `start` and `end` are ends as an
attachment's are — `{ clipId, glyphs, anchor }`, on glyphs of a clip, or `{ point: [x, y] }`, free
—; `buff` is the gap left at them while one is on glyphs (two free ends are the two points
themselves); `degrees` gives an arc other degrees (`null`: the ones it has; only an arc that is not
dashed takes any). The glyphs are measured when the tween starts. `drawn` is `{ start: [x, y], end:
[x, y], trim, center: [x, y] }` — from where to where the line is drawn then, the part of an arc its
gap took, and the centre Manim reads of the line once it is there —, or `null` until it was
measured: derived data, written by the app and written again whenever a target changes. What the
line is once carried follows its kind, as the Python that plays it does: an **arrow** and a **double
arrow** are built anew between the new ends, their tip and their stroke capped by their new length
(`Transform(arrow, new_arrow)`); a **line** and a **dashed line** keep their points — the same
dashes, however long the line is now —, moved, turned and stretched
(`line.animate.put_start_and_end_on(a, b)`); a line whose arc takes other degrees is built anew, as
an arrow is. `to` gives the appearance the line arrives with: `color`, `opacity`, and `strokeWidth`,
its stroke width. While the tween runs the line goes point by point from what it is to what it
becomes. Once it has ended the clip is at `drawn.center`, so the placement fields of `to` are not
read; a plain tween after it moves the line as it is then. A tween with an easing that returns
leaves the line as it was. The ends on glyphs follow the rules of an attachment's ([ARCHITECTURE §5,
"Attached objects"](architecture/05b-attached-objects.md#attached-objects)), at the instant the
tween starts; deleting the clip of one of them, or a new render that loses its glyphs, leaves that
end free at the point it was drawn at: beside an end still on glyphs, the point its gap further out,
which Manim is given for the line drawn to end there, as for an end put there by hand; beside a free
end, the two points the line was drawn between, since two free ends have no gap.

`glyphs` is `"all"` (every glyph of the formula, also after a LaTeX edit) or canonical indices,
written ascending (`transform` always lists them). `lagRatio`, `shift` and `scale` mean what they
mean in an AnimationSpec. A block of an arrow or a double arrow names all of it, its shaft and its
tips (`"all"`, or every glyph listed): Manim's arrow is its shaft, with its tips as its
submobjects, and the Python cannot name the shaft without them. A list that names a part of one
is an error (`arrow-part`).

The four kinds that name glyphs (`appear`, `disappear`, `transform`, `emphasis`) can also carry
`group`, a non-empty string: the blocks of a clip with the same `group` are one group, like the
animations of Manim's `AnimationGroup`. They have the same `start` and the same `duration`, and
there are two or more of them; each keeps its own animation, glyphs, easing and options, and what
they may animate at the same time is the rule of any two blocks. A block on its own has no
`group` (the field is left out, never `null`), and a name means nothing outside its clip. The
group changes nothing of what plays or of the exported Python, where blocks that run together are
one `self.play` already: the timeline draws a group as one block and moves it as one. A file whose
group breaks the rule still opens: the blocks that do not run with the others, or a lone one, are
left on their own, with a warning (`animation-group-repaired`).

In the app, a **Transform** block is either a `tween` ("Whole formula") or a `transform` ("Part of
the formula"). A relation's `transform` style (below) is a different thing: a Manim
`ReplacementTransform` between two clips; a **Morph** block does the same within one clip.

**ClipAttach**: `{ clipId, glyphs, rule, …, buff }` — the target clip, the canonical glyphs of its
formula the object hangs on (`"all"` or indices, ascending), how it is placed from their box and
`buff`, the gap in scene units. `rule: "next_to"` puts the object beside them like Manim's
`next_to`, on a `side` (`"down"` | `"up"` | `"left"` | `"right"`: Manim's DOWN, UP, LEFT, RIGHT);
`rule: "brace"` fits a brace to them like Manim's `Brace(target, direction, buff)`, pointing in
`direction`, degrees counter-clockwise from DOWN (0 below the glyphs, 180 above, −90 on their left,
90 on their right, anything else at an angle), and also sets the clip's rotation and the brace's
`width`; `rule: "tip"` hangs a label at the tip of a brace like Manim's `brace.put_at_tip(label,
buff=…)`: `clipId` is the brace's clip, `glyphs` is always `"all"`, and `buff` may be `null`, the
gap `Brace.get_tex` leaves in the project's library (0.25 in ManimCE, 0.1 in ManimGL); `rule:
"shape"` fits a shape to them as Manim fits its own — a box is their box `buff` wider on every side
(`SurroundingRectangle(target, buff=…)`), a circle runs through the corners of their box `buff`
further out, an underline is as wide as they are and hangs `buff` below them (`Underline(target,
buff=…)`), a cross stretches over their box (`Cross(target)`; `buff` does not apply) — and also sets
the shape's `width` and `height`, the clip unturned. `rule: "ends"` (format 26) is a line's, and has
another shape: `{ rule, start, end, buff }`, where each of `start` and `end` is the glyphs an end of
the line is on, and where on them (`{ clipId, glyphs, anchor }`, the anchor since format 27), or a
point of the scene it is free at (`{ point: [x, y] }`), at least one of them on glyphs. The line
runs between them as Manim's `Line(start, end, buff=…)` runs between two mobjects, or a mobject and
a point. An end whose `anchor` is `"auto"` is where the line leaves the glyphs towards its other end
— the point of them farthest that way in ManimCE, where that direction leaves their bounding box in
ManimGL —; with any other anchor — `"ul"`, `"up"`, `"ur"`, `"left"`, `"center"`, `"right"`, `"dl"`,
`"down"`, `"dr"` — it is that point of the glyphs' box, what Manim's `get_corner(UL)`, `get_top()` …
`get_center()` read, and the line is given the point. The line is `buff` shorter at each end, a free
one too; the rule also sets the line's `vector`, the clip unturned. A line with two free ends
has no attachment (`attach: null`). A `brace` object attaches with the brace rule, a `shape` object
with the shape rule, a `line` object by its ends, nothing else does with any of them, only a brace's
clip takes a label, and the end of a line goes on a formula or a text, not on a brace, a shape or
another line (`attach-rule`). The placement is derived when the attached clip starts, from the
target glyphs as they are at that instant — the target's state, tweens and part transforms —
measured with the box rule of the project's library (ManimCE reads corners and centres from the
anchors of the curves, ManimGL from every point), and is static afterwards, as in Manim: the app
writes it into the clip's `initial` position (no undo step, like a snapshot), and the Python places
the mobject the same way when the clip starts ([ARCHITECTURE §5, "Attached
objects"](architecture/05b-attached-objects.md#attached-objects)). Validation refuses an attached
clip that starts while the target glyphs are still being drawn, animated by an Appear or Disappear
block or moved by a relation or a Morph block (`attach-target-busy`), or after they left
(`attach-target-gone`); a chain of attachments must not go round (`attach-cycle`). Deleting the
target deletes what is attached to it — a line with one end or both on it, too — unless the object
also hangs on glyphs of another clip (a line with its other end there, or a brace or a shape with
`also`, below): that one is detached (`attach: null`) and stays where it is.

The attachment of a brace or of a shape can carry one more field, `also`, an array of `{ clipId,
glyphs }` (format 21): the glyphs of other clips that the object spans as well. The object is then
fitted to the glyphs of `clipId` and of those clips together — to the box of them all, as Manim's
`Brace(VGroup(…), direction, buff)` and `SurroundingRectangle(VGroup(…), buff=…)` are to a group —
and what is said above of the target holds for each of them: its glyphs are measured when the
object's clip starts, and must be quiet and still there then. `also` is the last field of the
attachment and is left out when the object hangs on one clip; the `next_to` and `tip` rules do not
take it. When a new render leaves one of the targets without any of the glyphs named, the object is
detached (`attach: null`) and stays where it is, as an object that hangs on one clip is. Deleting
the clip of one of the targets does the same, in the app: the object is not deleted with the clip,
as one that hangs on that clip alone is, but stays where it is, detached.

Shape gaps remain signed. A fit that would produce negative or nonfinite stored dimensions is
reported as `attach-shape-fit` and leaves the last valid dimensions and placement intact. Valid
negative insets and exact zero dimensions remain supported; the existing nonnegative geometry
contract is unchanged. This applies again when the target changes size.

A line whose two ends Manim finds no line between — two ends at one place with glyphs among them,
both ends on one formula with the anchor `"auto"` for instance, where there is no direction to look
for an edge in — is reported as `attach-line-ends` (an error), whether the ends are its
attachment's, measured when its clip starts, or those a tween carries it to, measured when the
tween starts: ManimCE draws nothing there and ManimGL stops the scene, and the line keeps the
geometry it had.

**Easing**: `smooth`, `linear`, `rush_into`, `rush_from`, `slow_into`, `double_smooth`, `there_and_back`,
`there_and_back_with_pause` (the last two come back to where they started: pulses).

## Relation

| Field | Type | Notes |
|---|---|---|
| `id`, `fromClipId`, `toClipId` | string | The source clip and the target clip, two different clips. Two clips can have several relations (format 31; before, one per ordered pair of clips), in either direction, with windows that may overlap: what keeps them apart is what each glyph may do, whatever relation it does it through — a target glyph arrives through one relation or Morph block of the whole project, a source glyph is consumed once and copied only before that ([ARCHITECTURE §5](architecture/05c-rules-blocks-events.md#rules-enforced-by-validateproject)). |
| `offset` | seconds | Window start relative to the target clip start (default 0). |
| `duration` | seconds | Window length, > 0 (default 1). |
| `easing` | Easing | Default `smooth`. |
| `style` | `"transform"` \| `"copy"` \| `"fade"` \| `"fade_copy"` | Default style of the pairs: the sources become the targets and are gone (`transform`), a copy of them does and they stay (`copy`), they cross-fade into the targets and are gone (`fade`), or a copy of them cross-fades and they stay (`fade_copy`, format 33). |
| `pathArc` | degrees | Manim `path_arc` (0 = straight), between −360 and 360: past a full turn the project opens with the error `path-arc`. |
| `pairs` | GlyphPair[] | `{ from: number[], to: number[], style: style \| null, extras?: "separate" \| "merge" \| "copies", principal?: number \| null, path?: PathSpline, routes?: { from: number, to: number, path: PathSpline }[] }` — canonical indices. `separate` (default) gives each source its own transform; `merge` uses Manim's family alignment; `copies` uses the authored principal for the pair's style while the other sources send a plain copy, whatever that style. These arrival modes apply to several sources and one target. `path` is a custom spline; absent = `pathArc`. `routes` (format 32) gives a path of its own to a route of the pair, one of its source glyphs on its way to one of its target glyphs, which that glyph follows instead of `path`; see *Routes* below. Pairs of one relation may bring the same target glyphs when they bring exactly the same ones (format 32): a join taken apart, the first of them brings the glyphs and the others arrive onto them, each with its own `style` and `path`. |

Copies initially chooses the lowest canonical source index and stores it as `principal`, for both
relations and Morph blocks. Rebasing remaps this reference with its glyph; source-array order or a
new backend's indices never choose a different consuming source. Deliberately editing/recreating
the source set initializes its minimum again and checks the resulting ownership conflicts.

If the principal disappears, `principal: null` keeps the pair for manual repair, even when no source
survives. It reports `pair-principal` (and `pair-empty` when applicable); no survivor is promoted or
consumed by that invalid pair. The loss remains an error while the stored mode is `copies`,
including one remaining source or a copy-style override. Edit the sources or arrival mode to repair
it. Saving/loading preserves explicit null. Empty sides remain semantically invalid but loadable.

A relation is between formulas and texts. A brace, a shape or a line is one piece, whose glyphs no
relation sends or receives (`KINDS`, `transfers`): the app makes no relation with one, and a file
that has one opens with a warning (`relation-kind`), the relation still played and exported as it
is — it cannot be edited, and is deleted from the menu of its band on the timeline.

**Routes.** A route of a pair is one of its source glyphs on its way to one of its target glyphs,
as the pair plays it: onto one target, every source goes to it; out of one source, it goes to
every target; several onto several, the glyphs go as Manim aligns the two groups (glyph i to glyph
i with as many on both sides; with fewer on one side, some of its glyphs cover two of the other,
by `repeat_indices = arange(n + k) · n // (n + k)`). A `fade` has routes only where each source
plays on its own onto the one target (`separate`, `copies`, or one source): a group cross-fades
whole and none of its glyphs goes to a glyph. `routes` holds, at most once per route, the custom
path that route follows instead of the pair's `path` (or of `pathArc`), laid on the chord of that
glyph alone. An entry for a route the pair does not play — after its style or its arrival mode
changed — is kept and ignored; one that names a glyph the pair no longer holds is dropped when the
glyphs are renumbered.

## PathSpline

The curve the centre of each glyph of a pair follows from its place at the start of the transfer
to its place at the end (D48), the glyph's shape interpolated along the way; a pair with a path
ignores the `pathArc`. `{ nodes: SplineNode[] }`, at least two nodes, each
`{ at: [u, v], in: [u, v] | null, out: [u, v] | null, smooth: boolean }`: cubic Béziers between
consecutive anchors (`at`), with `out` the handle leaving the anchor and `in` the handle arriving
at the next (null = the handle sits on its anchor; a segment without handles is a straight line);
`smooth` nodes keep their handles collinear in the editor. Coordinates are in the chord's frame: u
along the chord from the centre of the glyph at the start (0) to its centre at the end (1), v
across it to the left, both as fractions of the chord's length — so the path deforms with the
formulas, and the first node must be at `[0, 0]` and the last at `[1, 0]` (validation). The glyph
travels the path at a uniform speed by arc length (`geom/spline.ts`). Each glyph of a pair of
several follows the path along its own chord.

## ColorMatch

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `name` | string | Shown in the menus. |
| `entries` | `{ pattern, color }[]` | `pattern`: LaTeX as typed (`x`, `\frac{a}{b}`; `$…$` around it is ignored), `color`: colour. Applying the list to a formula colours the glyphs of every occurrence of each pattern — occurrences are matched token by token, so spaces do not count and `x` is not found inside `\xi` — and writes the formula's `glyphColors` (replacing them); where patterns overlap, the later entry wins ([ARCHITECTURE §4, "Labelled renders"](architecture/04-formula-engine.md#labelled-renders)). |

## FormulaGroup

A group of formulas of the Creator list (`model/formulaGroups.ts`): one row that opens onto its
formulas. It keeps the list in order and nothing else: the scene, the timeline, the Python export
and the video are the same with or without groups.

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `name` | string | What the Creator calls it (`grp1` until renamed): any text but an empty one. |
| `formulaIds` | string[] | Its formulas, in the order they have inside it; at least one. The group sits in the list where the first of them would (the list follows `formulas`), and the others come under it. |

A formula is in one group at most, and only the kinds the Creator lists are in one (`math`, `tex`,
`text`: a brace or a shape lives with its clip). There are no groups inside groups. Deleting a
formula takes it out of its group, and a group left without formulas goes.

## SceneCamera

The camera of the scene (format 34, `model/camera.ts`, `scene/camera.ts`): Manim's
`self.camera.frame`. A project has one while its multicamera is on; without the field the frame is
Manim's from the first second to the last — about the origin, 8 units tall — and the app, the
exported Python and the video are those of a project that never had one.

| Field | Type | Notes |
|---|---|---|
| `initial` | CameraFrame | The frame at 0 s. Manim's own is `{ "center": [0, 0], "height": 8 }`. |
| `targets` | TargetCamera[] | The target cameras: frames with a name, drawn in the preview, which any number of moves can go to. |
| `moves` | CameraMove[] | The camera moves, in no order of their own. No two overlap in time (they may touch). |
| `locked` | boolean, optional | The lock of the timeline's Camera row. Absent when it is not locked. |

**CameraFrame**: `center` [x, y], the scene point at its middle, and `height`, in scene units,
between 0.125 and 80 (Manim's frame of 8 at a zoom of 6400 % and of 10 %). Its width is not stored:
it is the height times the project's aspect (`meta.width / meta.height`), so a camera has the shape
of the picture at every instant. The zoom the app shows is `8 / height`.

**TargetCamera**: `id`, `name` (what the app calls it, "Camera 1" until renamed: any text but an
empty one) and the `center` and `height` of a CameraFrame.

**CameraMove**:

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `start` | number | Seconds of the scene: the camera belongs to no clip. |
| `duration` | number | Seconds, more than 0. |
| `easing` | Easing | As a block's. With one that ends where it started (`there_and_back`, `there_and_back_with_pause`) the camera goes to `to` and comes back. |
| `to` | object | Where the camera goes: `{ "kind": "frame", "frame": CameraFrame }`, a frame of the move's own; `{ "kind": "target", "target": id }`, a target camera, which the move follows when it is moved; or `{ "kind": "start" }`, back to `initial`. |

A move interpolates the centre and the height in a straight line under its easing, as Manim does;
between moves the camera rests in the frame the last one reached. The scene lasts until its last
camera move ends, as it lasts until its last clip does.

## Slides

The Slides mode (format 35, `model/slides.ts`): marks at instants of the scene, for the exports
that can stop or carry words. A project has the field while the mode is on, with marks or without;
the scene, the preview and the video are the same with it and without it.

| Field | Type | Notes |
|---|---|---|
| `marks` | SlideMark[] | The marks, in no order of their own (the app writes them by time). |

**SlideMark**:

| Field | Type | Notes |
|---|---|---|
| `id` | string | |
| `time` | number | Seconds of the scene, 0 or more: a mark belongs to no clip, and stays at its instant when clips move. |
| `kind` | `"pause"` \| `"comment"` | A pause: the page of Export ▸ HTML stops there until its reader goes on, and the Python has a `# PAUSE` line. A comment: words for whoever works on the scene after the export — a `# NOTE` in the Python, a task of the guide in the page's folder and a note of the page. |
| `text` | string, optional | A comment's words, or the note of a pause; any number of lines. Absent when there are none. |
| `skipWait` | boolean, optional | A pause only (format 36): when the exported page, or the rehearsal of the Preview, goes on from this pause, the scene jumps to where the next animation starts — or to the next pause of the same rest —, over the stretch in which nothing happens. Only where the scene really stopped: played through, in the Python and in a video the wait is the timeline's. Nothing is skipped after the last animation. Absent on a pause that keeps its wait. |

A mark stands where nothing animates. The scene **animates** during every intro and outro that is
an animation (kind `none` takes no time), every block, every relation and every camera move, and
the animations that overlap make one stretch; the rest of the scene, up to its end — the tail in
which only sound plays too —, is where it **rests**. The edges count as rest: a mark may stand just
where an animation ends or starts, at the instant between two that only touch, at 0 s and at the
end of the scene. These are the waits of the exported Python, and a little more is counted as
animation than the Python plays: a block that changes nothing is one here.

A mark elsewhere is not an error of the project, which is whole without its marks: it is a warning,
and every export leaves that mark out — one under an animation (`slide-mark-busy`) or past the end
of the scene (`slide-mark-outside`). So are a comment without words (`slide-mark-empty`) and a
second pause at an instant, of which the exports keep one (`slide-mark-twice`). The editor asks
about a mark an edit has just covered: delete it and keep the edit, or take the edit back.

## Example

[`examples/hello.mfe.json`](../examples/hello.mfe.json) — `mx+y=0` becomes `mx=-y`: the pair
`m x → m x` moves as a group, `+` turns into `−`, `=` and `y` swap places, and the leftover `0`
leaves through the source clip's fade-out, which runs during the same second as the morph.
[`examples/one-to-many.mfe.json`](../examples/one-to-many.mfe.json) — `a+b=c` lends copies of
`a`, `b` and `c` to three new formulas, one after another.
[`examples/animation-blocks.mfe.json`](../examples/animation-blocks.mfe.json) — animation blocks
(`clips[].actions`) of every kind but `morph`: `x^2+5x+6=0` writes its hidden `=0` later, lights up
`5x` and `6` at the same time (two part transforms, a group), takes `+5x` out and brings it back,
then moves up with a keyframe; `(x+2)(x+3)=0` spreads its two factors apart (a group too) and
follows.
[`examples/multiline.mfe.json`](../examples/multiline.mfe.json) — a derivation written row by row
with Morph blocks (actions of kind `morph`): `A &= x_1 \\ &= x_2 \\ &= x_3`, typed one row per line,
fades in its first row (the other rows arrive through the blocks, nothing is hidden), copies row 1's
`=` and `x` into row 2, writes the subscript 2, copies row 2's into row 3, writes the 3 and lights
up `x_3` with a part transform.
[`examples/completing-the-square.mfe.json`](../examples/completing-the-square.mfe.json) — the
quadratic formula derived by completing the square: eight formulas on five tracks, relations of the
three styles (one-to-many and many-to-one pairs among them), five Morph blocks, blocks of every
kind, hidden glyphs, per-glyph colours and intros and outros of every kind.
[`examples/match-colors.mfe.json`](../examples/match-colors.mfe.json) — three formulas coloured by
the match colour list "Course colours" (`x`, `y` and `\frac{dy}{dx}`, the last one winning inside
the derivative), with a second list, "Only x", to apply from their right-click menu.
[`examples/custom-paths.mfe.json`](../examples/custom-paths.mfe.json) — `a+b+c=d` becomes `d=c+b+a`:
every glyph crosses to the other side through a relation of seven pairs, four of them with a custom
path (`pairs[].path`: a bump, a wave through a smooth node, a corner and a dip), the others on the
relation's arc of 30° — enough pairs for the band menu's chooser.
[`examples/text-title.mfe.json`](../examples/text-title.mfe.json) — a LaTeX text (`kind: "tex"`):
a title that LaTeX breaks into two lines inside a width of 6 scene units, with the word `square`
coloured, written in 1.5 s; its inline formula `$x^2+bx+c$` is copied into a bigger `math` formula
below through a relation of seven pairs (the glyphs of a text and of a formula pair alike).
[`examples/braces.mfe.json`](../examples/braces.mfe.json) — braces and their labels (`kind:
"brace"`, attachments `brace` and `tip`): `1+2+3+4+5+6` written in 1.5 s, a blue brace under `1+2+3`
and a green one under `4+5+6`, each coming in with its sum at its tip (`6`, `15`) at Manim's gap,
and a yellow brace over the whole whose label `6+15=21`, 0.3 from its tip, gets its `6` and `15` as
copies of the other two labels' glyphs, through two relations.
[`examples/emphasis.mfe.json`](../examples/emphasis.mfe.json) — Emphasis blocks (`kind:
"emphasis"`): the square of a sum, written, then an Indicate of its left side, a Circumscribe of
`2ab`, a Flash at the equals sign, a Wiggle of `b^2` and a FocusOn of `a^2`; the whole formula
pulsed in green with `there_and_back_with_pause` and framed slowly in red with a thick stroke; a
LaTeX title above that wiggles last.
[`examples/shapes.mfe.json`](../examples/shapes.mfe.json) — a shape that changes target and paint
(`kind: "shape"`, tweens with `fit`): `1+2+3+4+5+6` written in 1.5 s, a rounded yellow frame created
around `1+2+3`, carried over a second to surround `4+5+6` while its stroke turns green and thickens
and a yellow fill of its own comes in (`to.fillColor`), then carried around the whole sum, white and
empty again; and a blue brace grown under the frame once it is there (an attachment on a shape).
[`examples/lines.mfe.json`](../examples/lines.mfe.json) — lines and arrows (`kind: "line"`), in
three parts of one scene: the four kinds (a line, an arrow, a double arrow, a dashed line), each
drawn in under its label; ends put on points of two formulas, with two arcs (`curve.shape: "arc"`)
bending either way; and the three tip shapes (`tip`, `startTip`), a spline (`curve.shape:
"spline"`), an arrow that comes in with GrowArrow and one whose ends a Transform carries to other
symbols.
[`examples/camera.mfe.json`](../examples/camera.mfe.json) — the scene's camera (`camera`):
Pythagoras' theorem up on the left and its square root far to the right and lower, outside Manim's
frame. The camera closes in on `c^2` (a move to a frame of its own), which is indicated while it
rests there; pans to the target camera «Result», where the root is written; pulls back to the target
camera «Wide», which shows both; and goes back to the frame of 0 s (`to.kind: "start"`). Nothing
animates while it moves.
[`examples/text-pango.mfe.json`](../examples/text-pango.mfe.json) — font text (`kind: "text"`), with
the geometry of its two texts in the file's `textGeometry` section: a bold title with one word
coloured and a note of two lines in italics, both in DejaVu Sans and shaped for ManimCE, the note
turning its `a ≠ 0` yellow; and the equation `ax^2+bx+c=0`, which gets its `a` and its `0` as copies
of glyphs of the note (the glyphs of a font text pair like any others). It opens and draws the same
with no companion and without the font.
[`examples/quadratic-formula.mfe.json`](../examples/quadratic-formula.mfe.json) — formulas alone,
with no scene yet: the fifteen lines of the derivation of the quadratic formula, from
`ax^2+bx+c=0` to the formula itself, in the Creator and on no track. A project to start a scene
from.

The examples are files of the current format, with the snapshots the current backends give:
opening one upgrades nothing. `custom-paths` and `match-colors` carry MathJax snapshots (they were
made without the companion), the others the exact ones of LaTeX, and the two texts of `text-pango`
the ones of their geometry.

## Loading

A file is checked in two steps (`model/io.ts`). The schema (types, ranges, the fields above) must
pass, or the file is refused as malformed, with the failing paths. The semantic rules of
`model/validate.ts` (overlaps, glyph indices that do not exist, duplicate names…) never stop a file
from opening: what they find is shown where it applies (the Animations panel, the timeline, the
Python export dialog).

The global ID inventory includes match-color lists. On import, a colliding list gets a fresh ID and
an explicit `color-match-id-repaired` warning; every list and all its entries remain. Other entity
IDs and their references are unchanged. Ordinary unique IDs round-trip unchanged.

A group of formulas that breaks its rule is put right on import, with one `formula-group-repaired`
warning: a formula that does not exist, that the Creator does not list or that a group already holds
leaves the group; a group left without formulas goes; one without a name gets the next `grpN`, and
one whose `id` another group has, an `id` of its own. No formula changes.

The geometry a `.mfe.json` carries enters the browser's storage before the project is shown
(`media/embeddedGeometry.ts`), so its texts draw as they were saved, with no companion and whatever
fonts the machine has. Each member that a text names is checked as a payload: its byte length
against the reference, the schema and its limits, the render identity the reference states, and the
hash — against every reference to it, when several texts name one geometry and do not say the same
of it. A member that fails a check does not stop the file from opening either: the project opens
without it, a notice names the texts and the reason, and each of them is then a text whose geometry
is missing.

## Portable package (`.mfe`, container version 1)

The package is an uncompressed, sequential container, not ZIP. It has no archive paths, central
directory or ZIP64 dependency. Its MIME type is `application/vnd.manim-formula-editor`.

| Byte offset | Size | Meaning |
|---|---|---|
| 0 | 8 bytes | ASCII `MFEPACK` followed by LF (`4d 46 45 50 41 43 4b 0a`). |
| 8 | 4 bytes | Unsigned little-endian container version, currently 1. |
| 12 | 4 bytes | Unsigned little-endian UTF-8 manifest byte length. |
| 16 | Declared length | Strict UTF-8 JSON package manifest. |
| After manifest | Remaining bytes | Owned payloads concatenated in media-index order. |

The package manifest is `{ format, version, project, media, missing? }`, with `format`
`"manim-formula-editor-package"` and `version` 1. `project` is the full project object described
above, with manifest version 36 and no `textGeometry` section. `media` is an array of
`{ contentHash, byteLength, offset, mimeType }`. Entries are strictly sorted by their lowercase
SHA-256 hash, each hash appears once, byte lengths are positive safe integers and MIME strings have
at most 256 characters. Offsets are relative to the first payload byte: the first is zero and each
later offset equals its predecessor's offset plus byte length. Every sum must be a safe integer, and
the final declared payload end must exactly equal the file length. Gaps, overlap, duplicates,
truncation, trailing bytes and unsupported versions are rejected. `media` and `missing` together
hold at most 4,096 entries; a package that declares more is rejected before its project is read.

The UTF-8 manifest is limited to 32 MiB. Package byte offsets and totals are bounded by
`Number.MAX_SAFE_INTEGER` (9,007,199,254,740,991), with lower practical limits imposed by browser
storage, available disk and the chosen destination. This numeric representation is not a promise
that every browser can publish a file of that size. Sources and output are read in at most 1 MiB
chunks. The download fallback composes existing Blob references instead of gathering all source
bytes in one JavaScript buffer; browser backing-store costs remain relevant for large downloads.

Every project-owned audio asset and text geometry reference must match an index entry by hash and
byte length, including unused/muted audio and stale geometry retained by a text object, or be listed
in `missing`. The project declares payload roles through `audioAssets` and `text.geometry`; the
container-v1 framing is unchanged. No undeclared payload entries are allowed. Hashes are verified
incrementally on import, text artifact schemas/identities are checked, and all payloads become
durable before the new project is published. Listings inspect only the bounded manifest; opening
imports the payload.

`missing` is optional and absent from a complete package. It is a strictly sorted array of lowercase
SHA-256 hashes: the declared payloads the package was written without, because the browser no longer
held them and the user chose to save without them. Each hash must belong to a payload the project
declares and must not appear in `media`; a declared payload that is neither carried nor listed, and
a list that breaks these rules, make the package invalid. Opening such a package keeps the whole
project: what uses a missing payload stays in place, marked, until its original is back (a recording
is imported again, a text is rendered again). A version of the app that predates `missing` rejects
these packages as incomplete; the container version and the project version do not change.

`.mfe.json` files of every version open through the normal manifest migrations. Save As suggests
`.mfe.json` for a project without audio, with the geometry of its texts inside. An explicitly chosen
`.mfe` destination receives a valid package even when it has no payload, and a document that is a
package stays one until Save As. Adding audio to a JSON document requires a new `.mfe` destination.
A `.mfe.json` carries at most 64 MiB of geometry, all its texts together; a project beyond that is
saved as a package: Save and Save As take it to a `.mfe` destination. Browser autosave keeps
separate metadata and durable payload ownership; it never embeds sources as base64 or rebuilds a
file on every edit. A Save freezes its manifest and payload set before opening a picker. A later
artifact requires another Save and cannot enter the active Save's payload list or claim that its
bytes were already written. Source-only Save remains available while shaping is pending. When
declared payloads are missing, Save first looks for them in the file it is about to replace, a
package or a `.mfe.json`, and then asks before writing a file without them: a package lists them
under `missing`, and a `.mfe.json` has no member for them.

## Versioning

- `version` increases on any change that an older app could misread. Additive optional fields
  also bump the version (the schema strips unknown keys).
- Older files are upgraded on load by the migrations in `model/io.ts` (one function per step,
  `n → n + 1`); files from a newer version are rejected with a clear message.
- The app always saves the current version.

| Version | Change | Upgrade of older files |
|---|---|---|
| 1 | First format. | — |
| 2 | Formulas gain `hiddenGlyphs`. | Every formula gets `hiddenGlyphs: []`. |
| 3 | Clip actions gain the kinds `appear`, `disappear` and `transform`. | None: a version 2 file is a valid version 3 file. |
| 4 | Formulas gain `intro`, the intro of their new clips. | Every formula gets `intro: null` (the editor's preference, as before). |
| 5 | Clip actions gain the kind `morph` (glyph pairs within the formula). | None: a version 4 file is a valid version 5 file. |
| 6 | Glyph pairs gain `extras` (how several sources reach one target). | None: a version 5 file is a valid version 6 file; its pairs of several sources now arrive separately instead of fusing (set `merge` for the old look). |
| 7 | Projects gain `colorMatches` (the match colour lists of the Edit menu). | Every project gets `colorMatches: []`. |
| 8 | Glyph pairs gain `path`, a custom spline for their glyphs to follow. | None: a version 7 file is a valid version 8 file. |
| 9 | Formulas become objects of a `kind` (`math`; the LaTeX text `tex` joined within the version); `latex` is renamed `source`, and `snapshot.source` `snapshot.backend`. | Every formula gets `kind: "math"` after its `id`; the two fields are renamed in place. |
| 10 | Clips gain `attach`, an object pegged to glyphs of another clip. | Every clip gets `attach: null` after its `actions`. |
| 11 | Formulas gain the kind `brace` and attachments the rule `brace` (a brace fitted to glyphs of another clip). | None: a version 10 file is a valid version 11 file. |
| 12 | Attachments gain the rule `tip` (a label at the tip of a brace). | None: a version 11 file is a valid version 12 file. |
| 13 | Formulas gain the kind `shape` and attachments the rule `shape` (a box, circle, underline or cross fitted to glyphs of another clip). | None: a version 12 file is a valid version 13 file. |
| 14 | Clip actions gain the kind `emphasis` (Indicate, Wiggle, Circumscribe, Flash and FocusOn on some glyphs) and the easing `there_and_back_with_pause`. | None: a version 13 file is a valid version 14 file. |
| 15 | Copies pairs persist their authored `principal`, shared by relation and Morph semantics. | Existing copies pairs receive their lowest canonical source index; source-array order is ignored. Empty source sets receive null and remain repairable. |
| 16 | Typed visual/audio tracks, reusable `audioAssets` and independent `audioClips` with source-time volume curves. | Existing tracks gain `kind: "visual"` and `muted: false`; audio collections start empty. Existing visual content, IDs, hidden flags and timing remain unchanged. |
| 17 | Literal `text` objects with whole-object font attributes, the `pango` snapshot backend, and owned text-geometry payload references. | Version 16 is already valid: existing objects, audio, snapshots, render keys and IDs remain unchanged. |
| 18 | A `.mfe.json` file can carry the geometry payloads of its font texts in a `textGeometry` section, by content hash. A geometry payload must be the compact JSON of its value, which is how the app always wrote it. | None: a version 17 file is a valid version 18 file. |
| 19 | The clip actions that name glyphs (`appear`, `disappear`, `transform`, `emphasis`) can carry `group`: the blocks of a clip with the same one start together, last the same and are one block on the timeline. | None: a version 18 file has no groups and is a valid version 19 file. |
| 20 | A clip can carry `previewLocked`: the editor's preview leaves the clip alone (it cannot be selected or moved there), a state of the editor that changes nothing of the scene. | None: a version 19 file has no locked clips and is a valid version 20 file. |
| 21 | The attachment of a brace or of a shape can carry `also`, the glyphs of other clips the object spans as well: it is fitted to the glyphs of all of them, as Manim fits a brace or a shape to a group. | None: a version 20 file has no such attachment and is a valid version 21 file. |
| 22 | A project can carry `formulaGroups`, the groups of formulas of the Creator list: a name and formulas each. | None: a version 21 file has no groups and is a valid version 22 file. |
| 23 | A shape can carry `fillColor`, a colour for its fill other than its stroke's, and a clip state the paint of a shape that a tween sets: `strokeWidth`, `strokeOpacity`, `fillOpacity`, `fillColor`. A tween on a shape's clip can carry `fit`, the glyphs it carries the shape to surround. | None: a version 22 file has none of them and is a valid version 23 file. |
| 24 | An object can carry `startPosition`, where its new clips start. | None: a version 23 file has none and is a valid version 24 file. |
| 25 | A shape can be a `cross_line`, one line over a diagonal of its target's box, with `diagonal` to say which. | None: a version 24 file has none and is a valid version 25 file. |
| 26 | Formulas gain the kind `line` (a line, a dashed line, an arrow or a double arrow along a `vector`) and attachments the rule `ends` (a line with an end, or both, on glyphs of another clip). | None: a version 25 file has none and is a valid version 26 file. |
| 27 | An end of a line that is on glyphs gains `anchor`: where on them it is, `auto` (the edge Manim finds towards the other end) or one of the nine points of their box. | Every end on glyphs of a version 26 file gets `anchor: "auto"`, which is what it meant. |
| 28 | A line gains `curve` — an arc or a spline between its two ends, or `null` — and the shapes of its tips, `tip` and `startTip`. | Every line of a version 27 file gets `curve: null`, `tip: "triangle"` and `startTip: "triangle"`: a straight line with Manim's triangle at each tip. |
| 29 | An intro and an Appear block can be `grow_arrow`, Manim's `GrowArrow`, on a clip of an arrow or a double arrow. | None: a version 28 file has none and is a valid version 29 file. |
| 30 | A tween of a line's clip can carry `ends`: the two ends of the line once it has ended, each on glyphs of a clip or at a point, the gap, an arc's new degrees and what the app measures of them (`drawn`); `strokeWidth` in its `to` is the stroke width the line arrives with. | None: a version 29 file has none and is a valid version 30 file; its tweens of lines move them as they are. |
| 31 | A clip can carry `startsEmpty`: none of its glyphs comes in with the intro; each appears when a relation, a Morph block or an Appear block brings it. Two clips can have more than one relation (the same source and the same target); until version 30 a second one was reported as an error of the project. | None: a version 30 file has neither and is a valid version 31 file. |
| 32 | A pair can carry `routes`: a custom path of its own for one of its source glyphs on its way to one of its target glyphs. Pairs of one relation, or of one Morph block, can bring the same target glyphs when they bring exactly the same ones; until version 31 any second pair onto a target was reported as an error of the project. | None: a version 31 file has neither and is a valid version 32 file. |
| 33 | A clip can carry `startHidden`: glyphs of its own that stay out of its intro, besides the hidden glyphs of its formula. A split gives it to its first half for the glyphs that only came on screen after the cut. A relation, a Morph block and a pair can have the style `fade_copy`: a copy of the sources cross-fades into the targets, and the sources stay. | None: a version 32 file has neither and is a valid version 33 file. |
| 34 | A project can carry `camera`, the scene's camera: its frame at 0 s, target cameras with a name, and moves in time, each to a frame of its own, to a target camera or back to the start. | None: a version 33 file has none — its multicamera is off — and is a valid version 34 file. |
| 35 | A project can carry `slides`, the marks of the Slides mode: pauses and comments, each at an instant of the scene where nothing animates. | None: a version 34 file has none — its Slides mode is off — and is a valid version 35 file. |
| 36 | A pause of the Slides mode can skip its wait (`skipWait`): the exported page goes on from it straight to the next animation. | None: a version 35 file has no such pause and is a valid version 36 file. |
