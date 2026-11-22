# Architecture §4: Formula engine

[Index](../ARCHITECTURE.md) · Previous:
[§1–§3 Fidelity levels, modules, conventions](01-03-foundations.md) · Next:
[§5 Time model](05a-time-model.md)

Holds §4 *Formula engine*: *Pango text and durable appearance* (font text shaped by the companion,
its saved geometry), *Placeholder boxes: a font text nothing has shaped* and *Existing producers and
geometry conventions* (the glyph producers, text objects, SVG import, render keys, size calibration,
packages, labelled renders).

See also: [§1 Two fidelity levels](01-03-foundations.md#1-two-fidelity-levels) ·
[Glyph index spaces](01-03-foundations.md#glyph-index-spaces) ·
[§8 Font text](08a-export-python.md#font-text) ·
[Text composition workspace](11d-templates-text-composition.md#text-composition-workspace) ·
[docs/COMPANION.md](../COMPANION.md)

---

## 4. Formula engine

### Pango text and durable appearance

The `text` producer builds a `TextRenderRequest` with literal source, family/weight/slant,
font size and target. Its backend is `pango`, independently of the TeX glyph-source preference;
no browser font stands in for it: where nothing shapes a text it is drawn as placeholder boxes
([next section](#placeholder-boxes-a-font-text-nothing-has-shaped)). Existing MathJax/LaTeX request
identities and generated Python for older kinds retain their prior behavior. Preamble, TeX brace
splitting and TeX size conversion apply only to TeX kinds.

The companion keeps bounded native workers for the configured CE/GL interpreters, each started by
the first request that names its library and never with the companion
([docs/COMPANION.md](../COMPANION.md)). A worker uses
actual `Text(..., disable_ligatures=False)` contours and checks its SVG against the same Pango
layout used to derive source clusters. GL uses explicit left alignment; CE pins its text surface
to 1920×1080 independently of export resolution. Unsupported implicit line wrapping or non-outline
output is reported. Catalogs, shaping and native video rendering share the sandbox's font view.
Font hashes, native versions, adapter configuration and actual geometry signatures accompany each
result. The first adapter uses Linux Pango/Fontconfig's checked public ABI in isolated workers.

`FormulaRender.text` contains the validated artifact, including authored basis, ordered cubic
contours, UTF-16 source ranges, ink/logical bounds, baselines and native provenance. The
request-only `basisKey` identifies authored freshness; `key` also identifies the native environment.
Browser readiness compares the saved basis to current source/options/target. A native export never
waits for the companion over a text (D82). The dialogs ask how the running companion stands to the
environment the text was shaped in (`textEnvironment`: the same, changed, or unknown when there is
none to ask) and list, as one more issue, the texts they cannot vouch for (`textVerification`,
`ui/export/readiness.ts`); Export → Python holds back only a text with neither a saved shape of its
current source nor boxes that count its glyphs (`pythonReadiness`). The generated scene checks each
text it builds, before paint or
placement (`_mfe_verify_text`, `export/codegen/textHelper.ts`): the number of its glyphs and, when
the saved shape is this library's, their contour signature. A text that Manim draws differently,
with other fonts or other versions of the libraries, is named in a warning on stderr and the scene
renders all the same (D82): whatever fails inside the check counts as a difference, never as an
error, and when Manim builds fewer glyphs than the editor saved the check adds empty ones, so that
every glyph the scene names exists (the glyphs it builds beyond them are never named). An offline
companion or a different font environment cannot replace an otherwise current saved appearance. The
author must explicitly refresh it or change its source/style; "Refresh appearance" waits for a
result the companion vouches for (`isVerifiedText`).

`engine/textMatch.ts` maps proven source clusters rather than inferring source order from visual
path order. Unchanged source ranges survive typography/layout changes when membership is
unambiguous. Changed or ambiguous repeated clusters become explicit repair cases. A split ligature
cannot silently donate a replacement many-to-one principal. Colors are applied after construction;
colored substring shaping is never used as a glyph-label mechanism. It works on layouts
(`matchTextLayouts`): the glyphs of a render with the pieces of source they stand for, which a
render of placeholder boxes has as well as a geometry.

Only committed results enter `media/textGeometry.ts`. It validates and stores immutable bytes under
a SHA-256 content hash and a temporary durable lease. Render sync rechecks document/request
identity, publishes the reference with canonical snapshot maintenance, awaits document/history
ownership and then releases that lease. Superseded completions discard only their own touched
payload. Draft rendering creates no project artifact or canonical remap.
Document/history/recovery/Save payload enumeration has explicit audio-source and text-geometry
roles: a package carries both as payloads, and a `.mfe.json` the text geometry in its own section.
Save freezes its manifest and payload set before the first asynchronous destination step. A late
text artifact makes completeness dirty without creating an authored Undo step.

A stored payload is the compact JSON of its geometry, and `readTextGeometryBlob` refuses any other
form: its hash is then the same wherever the geometry travels. In a `.mfe` package it is a payload.
In a `.mfe.json` it is a member of the file's `textGeometry` section, which `model/io.ts` reads and
writes beside the project: `parseProject` returns the members that texts of the project name, as
they were read (`ParseResult.textGeometry`), and `serializeProject(project, textGeometry)` writes
them as the file's last section, one per line. The project itself holds references only, in memory
and in the autosave ([FORMAT.md](../FORMAT.md#text-geometry-in-the-project-file)).

File → Open brings the geometry a `.mfe.json` carries into the repository before the project is
shown (`importEmbeddedTextGeometry`, `media/embeddedGeometry.ts`): each member that a text names is
checked as a payload is and stored under a `text-geometry` owner (a task with its bar and Cancel
when it lasts, `withProgress`, as the opening of a package), and after the project is shown the
history owner takes it over, as it does for the payloads of a package. If the opening is given up
(the user keeps the project that was open), what was stored is let go. A member that fails its
checks is left out: the file opens, the notice names the texts and the reason, and each is a text
whose geometry is missing, drawn as boxes where its glyphs were
([next section](#placeholder-boxes-a-font-text-nothing-has-shaped)).

The browser Pango adapter admits two active requests and four queued requests, with subscriber-owned
cancellation, a 32 MiB geometry cache budget and explicit busy retries. Committed rendering uses one
retry timer; composition retains only its latest pending draft. Response bytes, including error
responses, are bounded before JSON parsing. A result cannot enter a cache namespace for a different
font environment. Reopening validates declared payload hashes even if a previous same-ID render
is still available in memory.

### Placeholder boxes: a font text nothing has shaped

Pango shapes with the fonts of the machine the companion runs on, which a browser cannot read: with
no companion, or none that shapes text for the project's library, there are no contours. The text
is then drawn as **placeholder boxes** (D50(4), D82), one per grapheme that draws something, so
that it is an object like any other: it can be placed, coloured and animated, and it says "needs
the companion" wherever its state is shown (`formulaStatus`, the text editor, the top bar's
tooltip).

`engine/textBoxes.ts` is the layout, pure: the lines the author broke, left-aligned, the pen moved
by each grapheme's own advance (no kerning, no ligatures, left to right), the whole centred like a
new `Text`. A measurer is injected: `engine/textMeasure.ts` measures with a canvas and the font the
browser has under the family's name (its sans-serif when it has none), and a tool without a canvas
uses fixed metrics. Three constants take the layout to scene units, checked on real Manim by
`tests/parity/text_boxes.py` (within 0.006 % in four fonts): an em is `font_size / 72` units in
ManimCE and that divided by `TEXT_CE_GL_SIZE_RATIO` in ManimGL; baselines are 0.975 em apart in
ManimCE and 0.96 of the font's ascent plus descent in ManimGL; a tab is four spaces in ManimCE and
the next of ManimGL's stops, one every eight spaces. **Which graphemes get a box depends on the
source alone** (`textBoxRanges`: every grapheme but spaces and the characters that only steer the
layout), never on the measurer nor on the browser: the text is cut into graphemes by a rule of the
module's own (a code point with the marks that follow it, what a joiner ties to it, an emoji
modifier, the two halves of a flag) and not by the browser's segmenter, which follows the Unicode
library of each browser and version. Box *k* is then the same piece of text on every machine, and
the key of a render of boxes (`textBoxesKey`: the request, with `TEXT_BOXES_VERSION` where a
backend's version goes) says so. A snapshot with that key counts the boxes of the text as it
stands, whoever laid them out. (The rule still reads three character classes off the engine, the
marks, the emoji modifiers and the regional indicators, so a character of a Unicode version only
one engine knows can be cut two ways. A snapshot with the key of the boxes and another number of
glyphs is therefore never trusted: the sync leaves its references alone, and no export counts by
it.)

The text producer's free mode is the boxes, and the engine falls back on it when Pango is
`unavailable`: no companion, a worker that is not ready, a companion that went away under the
request. What the companion says of the text itself (a font it does not have, a glyph it cannot
outline) stays an error. A render of boxes is Pango's by name, `exact: false`, without `text`, and
carries the piece of source of each glyph (`FormulaRender.boxes`).

The render sync treats boxes as the lesser render of a text, as MathJax is of a formula
(`planSnapshot` and `renderText`, `store/renderSync.ts`):

- **Never shaped.** The snapshot is the boxes', and the project's glyph references count by them.
- **Shaped at last.** `matchTextLayouts` carries the references from boxes to glyphs by source
  range. The units differ (a ligature is one glyph and several boxes), so a glyph goes to the first
  free one whose piece of source holds its own or lies inside it: the ligature takes the references
  of its first letter's box, what was made on its other letters is dropped and reported, and
  nothing else is in doubt. Of the several outlines a cluster may have (a letter and a mark drawn
  apart) the largest stands for it. What a snapshot of boxes counted is taken, in this order, from
  a render at hand with its key, from its key being the one of the boxes of the text as it stands
  (after a reload nothing is in memory), from the request it was taken for earlier in the session
  (an undo or a redo can bring it back while another render is on its way), or from its glyphs
  being, label by label, the characters of the text; never from anything with another number of
  glyphs than it has, and never by its labels where something of the text is set right to left
  (shaped glyphs come in the order they are drawn, so a word that reads the same both ways has
  those labels with its letters the other way round). When nothing says it, a shaped text takes
  its place and the references go, with a warning.
- **Edited where nothing shapes it.** The source changed: boxes take the place of the shaped
  snapshot, the references follow the edit, and the geometry reference, which is of the earlier
  source, is dropped. A new font or size alone leaves the shaped snapshot in place and draws the
  boxes through a map, as a MathJax render is drawn through a LaTeX snapshot.
- **Shaped by the other library.** The project changed library where nothing shapes the text for
  the new one: the geometry it has stays on screen (the same glyphs in the same order, at the other
  library's size), and the export converts the size from it
  ([§8, "Font text"](08a-export-python.md#font-text)).
- <a id="geometry-not-at-hand"></a>**Geometry not at hand.** The reference names bytes the browser
  does not hold, or holds damaged. When the project's references count by that geometry, the text is
  drawn as boxes where its glyphs were (the snapshot keeps the centre and the size of each:
  `savedBoxesRender`), with the reason and the remedy as its note. It is never counted again behind
  the author's back: what a companion shapes takes the place of a missing geometry only when it is
  that very geometry (the same key: the same fonts and versions drew the same outlines), and then
  nothing of the project moves; the sync announces that it came back (`onMediaReturned`), because
  the document's file may be without it ([§11, "Durable original media and portable
  projects"](11f-media-audio.md#durable-original-media-and-portable-projects)). Otherwise the file
  that carries the geometry, or "Refresh appearance", brings one. A text edited meanwhile keeps its
  references, unsure, under the boxes of the text as it stands. One whose font or size alone changed
  has no shape to keep: where its snapshot is one glyph per character of a text set left to right,
  the boxes take its place and the references follow; otherwise they stay, unsure.

`textDrawing` (`engine/engine.ts`) names these states for the UI and the exports: `exact`,
`borrowed`, `saved-boxes`, `boxes`, or `stale` (something of an earlier source). `formulaReadiness`
lists the texts settled without their real glyphs as `unshaped`: nothing is on its way for them, so
no export waits. Export → Python writes a text that has no shape as it stands when its glyphs are
counted by its boxes (`textCountedByBoxes`: its snapshot is the boxes', or an earlier shape of the
same source that the sync carried over to them), and says so ([§8](08a-export-python.md#font-text)).
Boxes drawn over a snapshot nothing could carry over (the geometry the references count by is not at
hand and the source moved on: the sync says it is unsure, `confidence` 0) count nothing, and the
generator would leave that text out: the Python dialog holds Copy and Download back for it, and
Render with Manim is off, until "Refresh appearance" shapes it. Browser and ffmpeg videos film what
the preview shows, boxes and all, and the dialog says it.

The app asks the companion for the text worker of the project's library when the project has a
font text (`store/textPreparation.ts`, through the font list, which is the request that starts a
worker) and from the text editor. Until the worker is ready a text nothing has shaped is drawn as
boxes; the sync asks again when the companion's state changes.

### Existing producers and geometry conventions

`FormulaEngine.render(request) → RenderResult` (see `engine/types.ts`).

- **Glyph producers** (`engine/producers.ts`): one per kind of object (`PRODUCERS`, `producerOf`). A
  `RenderRequest` is a union by `kind` too (`MathRenderRequest`: `latex`, `packages`;
  `TexRenderRequest`: `source`, `layout`; with the preamble, target, size and backend preference
  every kind has). The producer builds the request of a formula of its kind
  (`renderRequestFor(formula, meta, prefer)`: the render sync, the formula editor's live preview,
  Match colors, the thumbnails), says what identifies a render of it (`identity`: what `renderKey`
  hashes together with the backend and its version — for `math` the list every file format has
  hashed, so the snapshot keys of saved projects stay current; the kinds that came later put their
  kind first) and what its content is (`content`: a formula's source and packages, a text's source
  alone, with a declared sequence policy for text reflow; the sync composes verified content,
  layout and backend correspondences), renders it in free mode (`free`: MathJax through a
  `MathJaxJob` with the TeX to typeset), writes the exact-mode input (`texRequest`) and
  makes the request of a labelled render (`labelled`, for Match colors: the source with its colour
  groups, the colour package loaded). The engine, the keys and the sync go through the registry; a
  kind's own fields are read nowhere else. A producer marked **`local`** (the brace, the shape)
  renders in the browser in either mode, from the object's own fields — `geom/brace.ts` builds the
  pieces Manim builds, ManimCE's path or the six of ManimGL's `\underbrace`, for the `width` and
  `sharpness` of the request; `geom/shapes.ts` the box, circle, underline, cross (two lines) or
  cross line (one of them) of the request's size, corner radius, diagonal and style, which its
  glyphs carry (`Glyph.style`) — so its
  render is exact and carries the exact backend's name (`latex`) and key whatever the companion's
  state, which is never asked (the tests' engine builds it the same way). **Text objects**
  (`engine/textSource.ts`): a `tex` object is LaTeX in text mode — `$…$` for maths, `\\` for a line
  break, a blank line for a paragraph — and the app writes the wrapper its layout needs, the same
  for the companion and for the export: a width is a `\parbox` of P TeX points, P = W · 960 /
  (0.99626 · font_size) for ManimCE and P = W · 144 · h₀ / (0.99626 · font_size) for ManimGL
  (`calibration.ts`; measured in PLAN-RUTA §3.3), so that it comes out W scene units wide, with
  `\centering`, `\raggedright` or `\raggedleft` for the alignment and `\linespread` for the line
  spacing; without a width the source goes as it is, each `\\` line centred as Manim sets it. The
  companion compiles it with `mode: "text"` (CE `Tex`, GL `TexText`;
  [docs/COMPANION.md](../COMPANION.md)). MathJax typesets the rows the user broke, each inside
  `\text{…}`, in a `gathered` (centred) or an `array` column; inside a width it breaks the lines
  itself (`textWrap.ts`: each row the user wrote into words — spaces outside `$…$` and braces — each
  word measured as MathJax sets it, the lines filled greedily with a third of an em between words)
  and the render warns that the breaks are approximate; accented letters, which MathJax has no
  glyphs for, are set as their base letters (`plainLetters`: é as e, one glyph each, as T1 fonts set
  them) with a warning. A text with non-ASCII letters for ManimCE gets the hint to load
  `[T1]{fontenc}` in the preamble (`hints`, which the engine adds to the warnings of any render;
  CE's OT1 fonts set an accented letter as two glyphs, PLAN-RUTA Q10).
- Output glyphs are cubic contours in formula-local scene units at the requested `fontSize`,
  with the union box centred on the origin (like a freshly created `MathTex`).
- SVG shapes are imported as Manim's `SVGMobject` imports them (`engine/svg.ts`, `geom/index.ts`,
  `engine/glyphs.ts`): a `<rect>` (a TeX rule: fraction bar, radical overline) is a closed contour
  traced from its (maxX, maxY) corner through (minX, maxY) and (minX, minY), as `Rectangle =
  Polygon(UR, UL, DL, DR)` is before the y flip; its sides are cubics with handles at thirds for
  both targets (ManimGL's own sides are quadratics with mid handles, the same shape and points
  per side, which `toPointPath` recovers from the cubics as they are, see
  [§6](06-07-catalogue-rendering.md#6-animation-catalogue-v1) on partial paths). For the GL target,
  a glyph whose anchors wind clockwise after the flip (negative signed area — a rule, not a Type 1
  character outline) is reversed, contours in reverse order and each traced backwards from the same
  start, as `ensure_positive_orientation()` does at GL import; CE keeps every glyph as flipped.
  Where a contour starts and which way it runs decide how a morph pairs its points and where Write
  begins to trace it, so they must match Manim's, not just the shape.
- `renderKey(request, backend, engineVersion)` identifies a render: the producer's identity of the
  request, the backend and its version; equal keys ⇒ equal glyphs in the same order.
  Each uncached MathJax render gets a fresh TeX/document context, so source-local definitions,
  environments and failed parses cannot leak into another render. Engine output caching remains.
- Size calibration follows the target: CE `font_size / 960` scene units per SVG unit; GL
  `font_size / (144 · h₀)` where h₀ is the exact height of ManimGL's calibration glyph, a
  text-mode "0" (compiled as `\text{0}` through the companion). MathJax output is scaled by a
  constant fitted on the parity corpus per target (median size error ≈ 0.75 %).
- The companion compiles with the target's template plus the formula packages and
  `meta.preamble`: CE `\documentclass[preview]{standalone}` + babel/amsmath/amssymb +
  `align*`; GL the `default` template of `manimlib/tex_templates.yml` + `align*`.
- `createEngine()` combines both backends: `prefer: 'auto'` uses LaTeX while the companion is online
  with latex and dvisvgm (`canRenderLatex`) and MathJax otherwise; renders are cached by key.
  Failures of the companion itself are not cached (unreachable, or a LaTeX error without a log: no
  latex or dvisvgm, a timeout), and cached LaTeX errors are dropped when the companion comes back
  online. `getEngine()` (`engine/instance.ts`) is the app-wide instance. The tests have an engine
  of their own, `createMockEngine()` (`src/test/mockEngine.ts`, among their helpers and not in the
  product: one glyph per visible token, none for a line break `\\`, so a formula of several rows
  has as many glyphs as under LaTeX).
- `isCurrentRender(render, formula, meta)` says whether a render still matches the formula (the
  Python export flags stale ones).
- **Packages in free mode** (`engine/packages.ts`): MathJax starts from what the target's Manim
  template loads (CE: amsmath, amssymb; GL's `default` template adds physics, xcolor, dsfont,
  textcomp…). A requested package maps to a MathJax extension when there is one (physics,
  mathtools, cancel…) or to macro approximations (bm, esvect, siunitx…); packages that only
  affect text are accepted silently; an unknown one renders anyway with a warning. As in LaTeX,
  extensions are opt-in: `\cancel` fails unless `cancel` is requested. Exact mode loads the real
  packages. The formula editor's live preview (MathLive) gets the same approximations
  (`ui/creator/packageMacros.ts`).
- <a id="labelled-renders"></a>**Labelled renders** (`model/texPattern.ts`, `engine/labelled.ts`):
the match colours (Edit → Match colors, D55) colour the glyphs of every occurrence of a LaTeX
pattern. A pattern is matched on tokens — ManimGL's (`Tex.get_command_matches`: a command, a brace,
`&`, `\\`, any other character), so spaces do not count and `x` is not inside `\xi`; `\left(`,
`\right)`, `\big(`… are one token each, since a delimiter cannot be coloured apart from its command,
and a pattern takes a `\left` with its `\right` or neither — leftmost first, never crossing a row or
column break; where patterns overlap the later entry wins (an occurrence inside a later pattern's is
dropped, a partial overlap is dropped and reported). Which glyphs an occurrence covers is what
ManimGL's `Tex(t2c=…)` finds out: the source is rendered once more with every occurrence wrapped in
`{\color[RGB]{1,0,k}…}` (k the pattern's number; a single brace that never touches a brace of the
source, so that neither ManimCE's `{{ }}` splitting, which would let the colour leak out, nor
ManimGL's labelling reacts; the red component keeps the labels apart from the `{0,0,k}` ManimGL
gives its `{{ }}` groups in every render), and the fill of each glyph of that render (`Glyph.fill`,
from the `fill` attributes of the SVG) says which pattern it belongs to, when the plain render lacks
that fill (`labelGlyphs`); both backends keep the glyph count and order (the spacing may shift a
little, `{+}` being an Ord atom), so the labels map to the plain render by index, by position when
the counts or labels differ. ManimCE's own `tex_to_color_map` is not emitted on export: it splits
the `MathTex` into parts and would break the `f[0][i]` indexing; the colours it writes export as
per-glyph colours.
- **Rows in the formula editor** (`ui/creator/alignedWrap.ts`): MathJax and Manim typeset inside
  `align*`, so `&` and `\\` outside any environment are column and row breaks; MathLive typesets
  the formula bare and would mark them as errors. `toFieldLatex` gives the visual field such a
  formula wrapped in `aligned` (the same rows) and `fromFieldLatex` removes the wrapper from what
  the field reports, so the raw LaTeX, the store and the engine only ever see the user's text.
