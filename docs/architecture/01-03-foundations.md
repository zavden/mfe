# Architecture §1–§3: fidelity levels, modules, conventions

[Index](../ARCHITECTURE.md) · Next: [§4 Formula engine](04-formula-engine.md)

Holds §1 *Two fidelity levels* (free and exact mode), §2 *Modules* (the folders of `app/src/`, the
direction of their dependencies, the entry files, `data/`) and §3 *Conventions* (units, time, ids),
with *Glyph index spaces* (render and canonical indices, the render store and its sync) and *Object
kinds* (`KINDS`).

See also: [§4 Formula engine](04-formula-engine.md#4-formula-engine) ·
[§5 Time model](05a-time-model.md#5-time-model) ·
[§10 Working rules](09-10-testing-working-rules.md#10-working-rules) ·
[docs/FORMAT.md](../FORMAT.md)

---

## 1. Two fidelity levels

| | Free mode | Exact mode |
|---|---|---|
| Needs | a browser | the companion (`companion/mfe_companion.py`) + TeX Live + dvisvgm |
| Formula renderer | MathJax 3.2.2 (SVG output, TeX font) | `latex` + `dvisvgm --no-fonts`, same templates as Manim |
| Glyph order | MathJax's own; differs from Manim in ~half of non-trivial formulas | identical to Manim's submobjects |
| Glyph shapes | MathJax TeX font (Computer Modern clone) | identical to Manim |
| Export indexing | positional-matching helper in the `.py` | literal indices |

Measured facts behind this design (`tests/parity/`, 70-formula corpus):

- ManimCE and ManimGL produce the same glyphs in the same order for 67/70 formulas. The
  exceptions come from GL's default template: `\DisableLigatures` (`\text{office}` is 6 glyphs
  in GL, 4 in CE) and `wasysym` (GL draws `\iint` as one glyph).
- At equal `font_size`, CE formulas are 1.031× the size of GL formulas.
- MathJax produces the same glyph count as LaTeX for 60/70 formulas (CE). The others differ in
  how pieces are built: tall delimiters, stretchy arrows and braces, `\neq` (TeX overlays `/` on
  `=`), ligatures. Among equal-count formulas, the order differs from LaTeX in 28.
- Hungarian assignment on glyph centres, normalised by the formula height, recovers the
  correct MathJax ↔ LaTeX correspondence in every equal-count case (all matched pairs carry the
  same label as the companion's DVI-derived label).
- Through the companion, the LaTeX backend reproduces ManimCE and ManimGL exactly: same
  glyphs, order, centres and sizes (within 1e-3 scene units) for 70/70 formulas per target.
- Glyph access in Manim: CE `MathTex(s)[0][i]`, GL `Tex(s)[i]`.

A wider measure of the same question, taken once outside the harness (2026-11-19, ManimCE, the
engine and the exported helper as they still are): 862 formulas a person would write — the 257
templates, the 338 distinct formulas of the author's own projects (the files of his `examples/`
folder, most of them outside the repository), and 267 written to cover the constructs — besides
2,160 nested ones made to stress the matching.

- MathJax and LaTeX split 777 of the 862 into the same number of glyphs (90.1 %) and 79 into
  different numbers (9.2 %); six compile in one of the two only. By origin: 20 of the templates
  differ (7.8 %), 18 of the author's formulas (5.3 %; 17 of them have `\cdots`).
- What makes the numbers differ is a short list: `\cdots`, `\ldots` and the other dots (one glyph
  in MathJax, three in LaTeX; 24 of the 79), `\left|…\right|`, `vmatrix` and `\middle|` around
  something tall (one bar against several pieces; 18), `\neq`, `\ne`, `\notin` and `\not=` (one
  glyph against two; 13), `\iint`, `\iiint` and `\oint` (8), the long arrows (`\Longrightarrow`,
  `\iff`, `\longmapsto`; 7), and a few of `\cancel`, `\boxed`, `\underbrace`, `\xrightarrow`,
  a tall `\sqrt`, a text ligature. A formula may be in two of them.
- With equal numbers, the pairing the exported `_glyphs` helper makes (distance on centre and size,
  no labels; replayed over the measured boxes with the venv's SciPy, not the exported file
  running) was right in 771 of the 777: of the other six, three are the same symbol under two
  names, two have a `\tag`, which MathJax and LaTeX place differently, and one a tall delimiter
  built of other pieces that happen to be as many.

So, in free mode, about one formula in ten of a real project is one whose export cannot address
every glyph of Manim's. [§8](08a-export-python.md#without-a-latex-render) says what the export
tells of it and what the rendered scene shows.

Known differences are listed with their reasons in `tests/parity/known-exceptions.json`.

## 2. Modules

```
app/src/
├── model/    Project types and object kinds, zod schema, factories, glyph lifetime, validation,
│             file I/O, LaTeX patterns
├── geom/     Vec2, Box, Mat2D, cubic contours, path splines, Manim's braces and shapes, helpers
├── engine/   Objects → glyphs: a glyph producer per kind, MathJax and companion backends, matching,
│             labels, the companion client
├── scene/    Events (shared timing truth), easing, the evaluator state(t)
├── render/   Canvas 2D drawing, hit-testing, camera
├── store/    Zustand stores: project (undoable), formula renders, UI state, the render and
│             attach syncs, the text preparation
├── audio/    Bounded source decoding, source-time volume plans, resampling, mixing and playback
├── media/    Immutable original bytes, ownership, streamed portable packages
├── export/   Python codegen (CE/GL), audio and video encoding
├── data/     Static data, verbatim copies of sources kept outside the repo: the formula template
│             library and the pinned Chroma Lab distribution
├── embed/    The player of the web documentation (docs/web/assets/player.js): an example's data,
│             its scene drawn by the evaluator and the renderer, the controls and the timeline strip
└── ui/       React components and their pure models (§11): menu bar, creator, preview,
              animations, relations, the Morph pair editor, timeline, transport, export
              dialogs, project (files, dialogs, autosave), the engine inspector
```

Dependency direction (no cycles): `model ← geom ← engine ← scene ← render ← export ← ui`. `audio`
and `media` depend on `model` alone; `store` depends on `model`, on `engine` (the render store holds
engine results), on `scene` (the attach sync) and on `media` (what the project owns of it); `export`
also depends on `audio`. Nothing outside `ui/` imports from it, except the three files that start
the app (`App.tsx`, `main.tsx`, `devtools.ts`): `app/build/__tests__/moduleBoundaries.test.ts` reads
the sources for it. A test may import from anywhere, and no source of the product imports what is
the tests' alone — their helpers in `src/test/` (the engine that draws boxes, the ids in sequence)
or a file of a `__tests__` folder —, which the same test reads: the product without its tests is
the same sources. `embed` depends on `model`, `geom`, `scene` and `render` alone, besides the types
of `engine` (no code of it reaches the player), and nothing of the app imports it:
`docs/web/tools/build-player.mjs` builds it into the documentation's player, one script of its own
([`docs/web/tools/EXAMPLES.md`](../web/tools/EXAMPLES.md)).

The app's version is the one of `app/package.json`: `src/version.ts` imports that field alone, so
nothing else of the file reaches the bundle, a unit test compares it with the two copies the
lockfile keeps, and Help → About shows it first.

Each module exposes a public API through its `index.ts`: import from the module folder
(`'../model'`), not from its internal files. `ui/` has no `index.ts` (its folders are imported file
by file, inside `ui/` and by the three files above), and `data/` is its files. These files are
entries of their own, beside the `index.ts` of their module (the player's imports are held to this
table by `embed/__tests__/contractEntries.test.ts`):

| Entry | Who imports it | Why it is an entry |
|---|---|---|
| `engine/connection.ts` | the settings of the video export (`ui/export/videoExportModel.ts`) | companion information without loading the glyph producers; it re-exports what the complete API uses |
| `export/metadata.ts` | the same | scene names and frame counts without loading the scene preparation or the encoders; it re-exports too |
| `export/audio/` (its `index.ts`) | the export dialogs and the video export run (`ui/export/`) | the audio encoders, an API of its own: `export/index.ts` is the Python, the video and the picture of a frame |
| `export/video/audioMuxer.ts`, `export/video/memoryFile.ts` | the video export run (`ui/export/videoExportRun.ts`) | the two pieces of a video with sound that the run puts together itself |
| `engine/correspondence.ts` | the render sync (`store/renderSync.ts`) and the text workspace (`ui/text/`) | the correspondence of glyphs across a change of the render request ([§3](#glyph-index-spaces)): the two that follow an object from one render to the next share it |
| `store/mediaOwnership.ts` | the document, the autosave and the text workspace (`ui/project/`, `ui/text/`) | a service the UI starts and reports for ([§11](11a-ui-layer.md#11-ui-layer-and-browser-state)), not a store |
| `store/textGeometryCommit.ts` | the text workspace (`ui/text/textCompositionStore.ts`) | the pure half of one text transaction, which only that workspace makes |
| `scene/evaluator.ts`, `scene/easing.ts`, `scene/lines.ts`, `scene/camera.ts` | the player of the web documentation (`embed/engine.ts`, `embed/index.ts`, `embed/lines.ts`) | the evaluator, the rate functions, the ends of a line and the frame the scene's camera films each instant through (§12) without the rest of `scene/index.ts`, whose attach tools import the engine's index and with it MathJax: a bundle of the player would carry it (`embed/__tests__/boundaries.test.ts` walks its imports) |
| `model/schema.ts` | the player of the web documentation (`embed/index.ts`) | the names of the easings it hands its widgets (`EasingSchema`): the index of `model` does not export the zod schemas |

Some imports name a file although the `index.ts` of its module exports the same: `engine/key.ts`,
`engine/pango.ts`, `engine/textMatch.ts` and `engine/types.ts` from `store/textGeometryCommit.ts`
and `ui/text/`; `media/textGeometry.ts` from `ui/text/`; `scene/placement.ts` from
`export/codegen/glyphs.ts`; `geom/color.ts` from `ui/colors/applyPalette.ts`; `audio/plan.ts` and
`audio/types.ts` from `export/audio/` and `export/video/`; and the types of `model/types.ts` from
`audio/` and `ui/colors/palette.ts`. They work and stay as they are (moving them to the folder is
how an import cycle is made); they are not entries, and a new import names the folder.

`data/` holds the formula template library, `templates.json` and `template-categories.json`:
verbatim copies of `formula-templates/` next to the repo (`templates.json` and `categories.json`
there), which stays the source of truth with its checks (the placeholders of each template against
the LaTeX it was, MathJax, LaTeX): after changing the library, copy both files over again. Prettier
leaves them alone. The Creator's Templates tab (`ui/creator/templates/`;
[§11, "Formula templates"](11d-templates-text-composition.md#formula-templates)) checks them against
a small zod schema on first use. The data is a static import: the build is a single bundle without
code splitting. `data/chroma-lab/` is the other verbatim copy, the pinned Chroma Lab distribution
the build checks file by file and emits beside the app ([§11, "Chroma Lab and editor
palettes"](11e-chroma-lab-palettes.md#chroma-lab-and-editor-palettes)).

```
 Creator ──edit──▶ store.project ──▶ engine.render(formula) ──▶ FormulaRender (cached by key)
                        │                                              │
                        ▼                                              ▼
                 scene.buildEvents ──────▶ evaluator(t) ◀── resolveFormula (canonical ↔ render)
                        │                       │
                        ▼                       ▼
                 export.codegen          render.draw(canvas) ──▶ Preview, video frames
```

## 3. Conventions

- **Space**: Manim scene units. Origin at the frame centre, +x right, **+y up**. The frame is
  8 units tall and `8 · width / height` wide (`frameWidth(meta)`).
- **Boxes** for display and selection include cubic control handles. Native size and critical
  measurements use the target's point representation in `scene/measure.ts`: CE critical points
  use anchors; GL uses quadratic points. Animation pivots use that native contract separately.
- **Time**: seconds; intervals are half-open `[start, end)`. Comparisons use `TIME_EPSILON`.
- **Angles**: degrees in the model, counter-clockwise; exported as `n * DEGREES`.
- **Colours**: `#RRGGBB` upper case.
- **Stroke widths**: Manim `stroke_width` units; 1 unit = 0.01 scene units.
- **Ids**: `<kind>_<8 chars>` (`f_`, `t_`, `c_`, `r_`, `a_`); never parsed.
- **Language**: code, UI and docs in English.

### Glyph index spaces

- A **render index** is a position in `FormulaRender.glyphs`; it depends on the backend.
- A **canonical index** is a position in `Formula.snapshot.glyphs`. Every glyph reference in a
  project (glyph colours, hidden glyphs, the glyphs of blocks, the pairs of relations and Morph
  blocks) is canonical.
- `resolveFormula(formula, render)` returns `canonToRender`: the identity when
  `snapshot.key === render.key`, otherwise a positional match (`matchGlyphs(…, 'position')`).
- When a formula is first rendered, its snapshot is taken from that render (`toSnapshot`).
  When a higher-fidelity render becomes available (companion comes online), the app re-bases
  the snapshot on it, remapping references through a verified correspondence. Source edits are
  matched in comparable backend order; `engine/correspondence.ts` composes conversion, edit and
  layout steps rather than comparing incompatible backend sequences directly. Text reflow keeps
  occurrence identity through sequence matching, with uncertainty when glyph composition changes.
  `remapGlyphRefs(project, formulaId, map)` (model) rewrites every reference — formula and clip
  glyph colours, hidden glyphs, block glyphs, both sides of the pairs of relations and Morph blocks,
  the authored copies principal and glyphs of attached objects — through such a map. A glyph that
  lands on both sides of a Morph pair is dropped from both. A copies pair whose principal is lost
  stays invalid for manual repair, even with no source left; other empty pairs are dropped, and an
  attached object left without a glyph is detached.
- The **render store** (`store/renderStore.ts`) holds the current render of every formula
  (`resolved: ResolvedFormulas`) and the last **transition** of each formula's snapshot
  (`transitions`: old index → new index between two snapshot keys), which the sync publishes
  whenever it re-bases one, for whoever holds glyph indices of the old snapshot — an open pair
  editor (the relation editor and the Morph pair editor share the session,
  `ui/relations/pairSession.ts` + `usePairSession.ts`) re-bases its draft, its baseline, its
  selections and its pending suggestion through it, or holds Save back when the step is not the
  published one, until the snapshot comes back; a re-base also closes an open pair menu and drops
  a deletion confirmed after it, saying so, since both named pairs by their place in the draft
  before. Revision keys, draft, baseline, selections and suggestion form one authoritative
  synchronous session snapshot; publication precedes React notification, so batched rebases compose.
  Every Save route, including Edit path, reads that current session and checks document identity,
  current track locks and candidate validation. The sync service
  (`startRenderSync`, `store/renderSync.ts`) fills it and maintains the snapshots with
  `useProjectStore.amend`, which changes the project without creating an undo step: snapshots are
  derived data, and undoing a source edit restores its snapshot. Successful request provenance
  distinguishes authored content, layout, backend and target changes. A failed intermediate render
  retains canonical data with uncertainty. Lower-fidelity output alone does not replace an exact
  snapshot; authored source/package edits can, while a preamble-only change retains exact indices.
  Reusing a render fills a missing snapshot after same-ID reopen and verifies the selected backend.
  Ordinary reuse preserves an externally published non-null canonical snapshot;
  `resolveFormulaTransition` follows its verified map or inverse. A copy of a formula (Duplicate,
  Unlink formula) has its original's snapshot, and starts with its original's render, resolved
  for it (`seedCopies`, before the copy reaches the project): nothing that draws it waits for the
  sync, which keeps that entry as the copy's previous render while it renders the copy itself.

  `loadProject` resets formula trackers, pending generations and transitions. At most 500 immutable
  verified snapshot-key/request facts survive independently of formula IDs, allowing known pending
  reflow saves to recover their provenance. Unknown legacy snapshots retain the geometric fallback;
  no request provenance was added to the file format. Uncertain or dropped references warn in the
  Creator. `amend` tells `onProjectAmended` listeners, so that the document layer ignores derived
  changes when tracking "unsaved".

Preview glyph picks bind document, formula and snapshot identities; verified transitions rebase
them, and unknown replacements invalidate them before actions run (`pickRebase`,
`preview/glyphPickStore.ts`). The document is the count of projects loaded (`projectLoads`), which
changes before the store shows the new project: what a pick kept is known to be another document's
at the first change it hears of, so a file with the same ids and other renders ends it without the
notice of a formula that changed. The two symbols of align by symbol are bound the same way
(`PickedGlyph.revision`): each follows its glyph through a transition, and the mode ends, saying so,
when its glyph is gone or nothing tells where it went. A click takes a glyph only of the render that
is drawn and that the snapshot numbers (`shownRevision`, `drawsSnapshot`). Path mode binds the
actual pair and node topology, with guards after undo, lock changes and document replacement. A
stale context menu or pointer press cannot silently select another pair or glyph.

### Object kinds

Every visual object of the Creator is a `Formula` (`model/types.ts`): a union discriminated by
`kind`,
whose `source` text the kind interprets — `math` (LaTeX in math mode, with `packages`), `tex` (LaTeX
in text mode, with a `layout`: width, alignment, line spacing), `brace` (no source: a brace fitted
to glyphs of another clip, with ManimCE's `sharpness` and the `width` it was fitted to; D66) and
`shape` (no source either: a box, circle, underline, cross or cross line fitted to glyphs of another
clip, with its `style` — fill opacity, stroke width and opacity —, a box's `cornerRadius`, a cross
line's `diagonal` and the `width` and `height` it was fitted to; D71, D128), `line` (no source: a
line, a dashed line, an arrow or a double arrow along a `vector`, with its stroke width, its tip's
length and its dashes', its `curve` and the shapes of its tips; D137, D145, D146), and `text`
(literal Unicode, whole-object `font` attributes and an optional owned `geometry` reference). The
timeline, relations, blocks and the export see every kind alike, through its `snapshot` and
canonical indices. What a kind can do is one row of `KINDS` (`model/kinds.ts`): its label and the
mark its cards wear, the prefix of its default names (`f1`, `t1`…, one counter per prefix; D63),
whether it has a source at all (`isBlank` tells an empty object — one with a source and none written
— to the render sync, the exports and the Creator; a brace or a shape is never empty), whether its
glyphs are coloured one by one, whether its source is LaTeX, whether it takes part in glyph
transfers, the intros and outros its clips may use, whether the Creator lists it (an unlisted object
lives with its clips and goes with the last of them; the «+ New ▸» menu of the Creator offers the
listed kinds, then the announced ones greyed out, `ui/creator/newObject.ts`; every card of its list,
row or block, wears the mark of its kind), and the attach rule that fits its objects to their target
(`fitted`: a brace's, a shape's, a line's by its ends; nothing else attaches with such a rule,
`isFittedRule`); `packagesOf` gives the packages of any object (a text has none of its own),
`createFormulaOfKind` makes one. The UI and the validation read that table instead of asking for
mathematical fields, and `validateProject` dispatches on `kind` for the rules of each one. A new
kind adds its interface and schema (`formulaOfKind`), its row, its `validate.ts` branch and a
migration step, its glyph producer in the engine (`engine/producers.ts`,
[§4](04-formula-engine.md#existing-producers-and-geometry-conventions)), its emitter in the codegen
(`export/codegen/emitters.ts`, [§8](08a-export-python.md#mobjects)) and its source panel in the
formula editor (`ui/creator/sources/`, [§11](11a-ui-layer.md#ui-modules)), or, for a text, its form
in the composition workspace (`ui/text/`,
[§11](11d-templates-text-composition.md#text-composition-workspace)).
