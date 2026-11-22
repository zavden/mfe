---
name: mfe-add-object-kind
description: Add a kind of object (a `FormulaKind`) or a variant of one (a `ShapeKind`) to the Manim Formula Editor — its model and file format, its glyphs, its scene measured against real Manim, its ManimCE and ManimGL export with an export-check case, its UI and its docs. Use for a new thing the Creator or a clip can hold (a line, an arrow, a dot); not for a new animation of a kind that exists.
---

# A new kind of object

An object is drawn four times: by the browser, by ManimCE, by ManimGL and by the file that keeps
it. A kind is done when the four agree, and the layers below are the order in which that is
reached. Every commit of it follows `.claude/skills/mfe-change/SKILL.md`; paths here are relative
to the repo root.

## 1. Before writing code

- Read `docs/ARCHITECTURE.md`: "Object kinds", "Existing producers and geometry conventions",
  "Attached objects" and "Python (`export/codegen`)" (in
  [§3](../../../docs/architecture/01-03-foundations.md#object-kinds),
  [§4](../../../docs/architecture/04-formula-engine.md#existing-producers-and-geometry-conventions),
  [§5](../../../docs/architecture/05b-attached-objects.md#attached-objects) and
  [§8](../../../docs/architecture/08a-export-python.md#python-exportcodegen)), and the fields of the
  kinds that exist in `docs/FORMAT.md`.
- Ask the owner for the plan and the decisions of this kind. Which Manim class it becomes in each
  library, its defaults (stroke width, colour, tip size), its intro, the name of its export-check
  case and the example it goes into are the owner's choices, and they are usually made already,
  in notes kept outside the repo. What they leave open is asked, not chosen.
- Read the two changes of this type the history has, each with `git show --stat <commit>`:

  | What was added | Commits, in order |
  |---|---|
  | A kind, `shape` | `8c645714` (model, format 13), `8fa008e8` (scene, measured in Manim), `bcc30c8e` (codegen and the case `decorations`), `fc370a56` (UI and e2e) |
  | A variant, the cross line | `7151450b` (every layer but the menus, format 25), `65b40987` (menus, panel, e2e), `12c3cc67` (docs) |

## 2. A kind or a variant

A **variant** is another value of a field of a kind that exists (`ShapeKind`: `box`, `circle`,
`underline`, `cross`, `cross_line`): it is fitted to its target by the same attach rule, lives and
dies as that kind does, and shares its panel. A **kind** is another member of `FormulaKind`, with a
row of its own in `KINDS`: needed when the object has a source of its own, another way to be
placed (two ends instead of one target), or other capabilities. An object with two ends is not a
box fitted to a target: do not make it a `ShapeKind` to save the row. A variant can have a field
of its own (a box's `cornerRadius`, a cross line's `diagonal`); when the field is a size, say in
the model what the attach sync derives from the target and what stays the user's.

Either way the compiler finds most of the places. `KINDS`, `PRODUCERS`, `EMITTERS` and
`SOURCE_PANELS` are records over `FormulaKind`, and the tables of shapes are records over
`ShapeKind`: add the member to the union first and let `npx tsc -b` list what is missing. It does
not find the lists written out as arrays (`SHAPE_KINDS`, `SHAPE_CHOICES`) nor the questions that
name some members (`hasInside`, `overCorners`, a `shape === '…'` in a condition):
`grep -rn "shape === '\|SHAPE_KINDS\|SHAPE_CHOICES" app/src`, and read each.

## 3. The layers, one commit each

Each commit is green alone (`verify.sh`), and the next one builds on it. The records above are in
every layer, so the first commit cannot stay in the model: it adds the member and gives each
record its entry — a producer, an emitter, a panel, a palette role — as little as makes the kind
exist. For a kind that was the model, the producer, the emitter and the panel (`8c645714`); for a
variant, every layer but the menus (`7151450b`). The commits after it make each layer right.

### Model and format

- `app/src/model/types.ts` (the member of `Formula`, its fields), `schema.ts` (`formulaOfKind`),
  `defaults.ts` (its `create…Formula`, `createFormulaOfKind`).
- `app/src/model/kinds.ts`: the row of `KINDS` says what the kind can do (a source or not, glyph
  colours, transfers, its intros and outros, whether the Creator lists it, the attach rule that
  fits it). Ask the row, never `kind === '…'`, and add a capability to `KindInfo` when the kind
  needs a new question. `glyphMembers` says how each library holds its glyphs (the mobject itself,
  its submobjects, a `Tex`), which the stagger of an animation depends on as well as the indices.
- `app/src/model/validate.ts` (`attachIssues` and the rules of the kind) and `remap.ts`
  (`remapGlyphRefs`) when the object refers to glyphs of another clip. An unlisted kind lives with
  its clips: the object goes when its last clip does (`ui/timeline/clipOps.ts`).
- `app/src/engine/types.ts` (its `RenderRequest`) and `engine/producers.ts` (its `GlyphProducer` in
  `PRODUCERS`, `renderRequestFor`). A field added to a request enters the producer's `identity`
  only for the objects that have it, as a cross line's `diagonal` does: the render key of every
  object saved before stays what it was. A producer of geometry (`local`: a brace, a shape) is
  exact in every engine, the tests' one too (`src/test/mockEngine.ts`), and has nothing to do with
  `npm run parity`; a kind with a source needs its drawing in the mock engine.
- The file format changes, even for one optional field or one more value of an enum: follow "A
  format bump" in `mfe-change`.

### Geometry and scene, measured in Manim

- `app/src/geom/` builds the outline from the request (`geom/shapes.ts`, `geom/brace.ts`), in
  scene units, y up, centred as Manim centres it; `app/src/scene/` fits it to its target
  (`scene/shapes.ts`, `scene/attach.ts`, `scene/anim/fit.ts`) and the evaluator draws it.
- **What Manim does is measured, not read.** Write
  `app/src/scene/__tests__/fixtures/manim/gen_<name>.py` beside the others (its header says what
  it samples and how to run it), run it from a scratch directory with the Python of each venv
  (`../manim_ce/venv`, `../manim_gl/venv`) and keep the two results as
  `app/src/scene/__tests__/fixtures/manim-<name>-ce.json` and `-gl.json`. A unit test then holds
  the scene to them (`decorations.test.ts`). Sample the object as the export will write it, on
  real LaTeX glyphs, plain and also scaled and rotated; the two libraries differ in defaults
  (tapered strokes, tips, buffers) and the fixture is where each difference is found.

### Codegen and its export-check case

- `app/src/export/codegen/emitters.ts`: the `Emitter` of the kind in `EMITTERS` (the class per
  library, the constructor lines), or the class and the constructor of a variant (`SHAPE_CLASSES`,
  `detachedShapeCall`). `attach.ts` builds an object on its target (`shapeLines`,
  `fittedShapeCall`, `braceLines`), and `attachmentPlan` says which targets must exist by then;
  `glyphs.ts` and `membership.ts` are how its glyphs are named.
- The name of a Manim class the scene now uses is reserved in `EMITTED_SYMBOLS` (`symbols.ts`), so
  that no object of the user's can take it (`namespace.test.ts` asks for it);
  `tests/export/namespaceCases.ts` keeps a list of its own.
- A helper the generated Python needs is registered in four places: the `Helper` union
  (`context.ts`), its source (`helpers.ts`), its inclusion (`assemble.ts`) and its name in
  `EMITTED_SYMBOLS`.
- A case in `tests/export/projects.ts`, **added last** in the list `syntheticCases` returns (not
  in a list it spreads from another file): the case is at once a pinned Python (`pinned.test.ts`
  builds every case under one sequence of ids, so a case in the middle renames the ones after it)
  and a scene `npm run export-check` renders with both libraries. Make it cover what the unit
  tests cannot: a target built later than the object, the object scaled and rotated, every
  variant.
- `npx vitest run -u` writes the new pins; read them as Python before committing them.
  `MFE_EXPORT_ONLY=<case> npm run export-check` renders the one case in seconds; the whole
  export-check runs once, at the end.

### UI and e2e

- A listed kind: its row in `KINDS` puts it in «+ New» (`ui/creator/newObject.ts`) and its panel
  goes in `ui/creator/sources/` (`SOURCE_PANELS`, `<Kind>Source.tsx`).
- An object made on a clip: its plan in `ui/animations/attachmentCreation.ts`, its commands beside
  `shapeActions.ts` and `braceActions.ts` (a command that plans with the project calls
  `history.cancelForeignGesture()` first), its entries in `BlockMenus.tsx` and
  `ui/preview/PreviewMenu.tsx`, its section in `AttachmentSection.tsx`, and what an attached
  object refuses in the preview (`ui/preview/usePreviewGestures.ts`).
- Its colour when a palette is applied: `paletteRoleForKind` (`ui/colors/palette.ts`).
- An e2e spec that makes one through the UI, edits it, undoes it and exports it
  (`app/e2e/shape.spec.ts` is the model; duplicating clips is in `timelineClipsMenu.spec.ts`, a
  locked track in `previewLock.spec.ts`), and screenshots in both themes.

### Docs and example

`docs/FORMAT.md` (the fields and the row of *Versioning*, with the model commit), the architecture
(the kind, its geometry and attach rule, its export and the CE/GL differences found, each in the
file of `docs/architecture/` that `docs/ARCHITECTURE.md` names for it), `README.md` (what the user
does with it) and `docs/ROADMAP.md`.

An example carries the exact snapshots of its objects, so it is made in the app with the companion
running and saved, not written by hand. The kind goes into an example that exists, or a new file
joins three lists: `EXAMPLES` in `app/src/test/examples.ts` (it must open as a file of the current
format), `EXAMPLES` in `pinned.test.ts` (its Python is pinned) and `examples` in
`tests/export/export.check.ts` (real Manim renders it); FORMAT and ROADMAP list the examples too.

## 4. Ends, targets and identity

- A reference to glyphs holds canonical snapshot indices, never positions in a render: it goes
  through `remapGlyphRefs` when the source of its host changes.
- An object with two ends, each on the scene or on glyphs, has four cases (scene/scene,
  scene/glyph, glyph/scene, glyph/glyph), with the two hosts on one clip or on two. Walk each
  through creation, editing, remapping, copying, the deletion of one host only, validation,
  settling and the generated Python.
- Decide what coincident or very short ends draw, and measure it in both libraries: a tip and a
  buffer do not shrink the same way.
- A target may be built later than the object in the generated scene. A valid project does not
  prove the order of construction: the export-check case does.
- Fill and stroke are written out in the export. The libraries' defaults differ, and
  `set_opacity` fills a shape that only had a stroke.

## 5. Done when

- `verify.sh` is green on each commit, the pins show the Python meant, and the whole
  `npm run export-check` is green at the end.
- The fixture test holds the scene to both libraries, plain and transformed.
- The e2e spec covers create, edit, attach and detach, duplicate, delete with undo and redo, a
  locked track and the export.
- A file of the format before opens unchanged, and the examples were rewritten.
- The kind is in FORMAT, ARCHITECTURE, README and ROADMAP.

Stay inside the kind asked for: one kind does not bring the rest of the roadmap with it.
