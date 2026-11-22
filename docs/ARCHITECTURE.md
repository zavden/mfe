# Architecture

Manim Formula Editor is a browser app with an optional local helper. This document is the
contract between the modules and between the people (and agents) building them. Types in
`app/src/*/types.ts` are the normative version of everything described here.

This page is the document's entry point. Its text is in [`docs/architecture/`](architecture/), cut
along its sections and subjects into files of a few hundred lines that can be read alone: find what
you are about to touch in [Where to look](#where-to-look), or a section that a comment or another
document cites (ARCHITECTURE §5, "Glyph lifetime") in [Sections and files](#sections-and-files), and
open that file. Each file starts with a header that says what it holds and links back here, to the
files before and after it and to the parts it leans on most. A reference to another part inside the
text is a link to the file and the heading where that part is. The sections keep their numbers, §1
to §12, and their headings, and the files in the order of their names are the whole document.

## Files

| File | Holds |
|---|---|
| [01-03-foundations.md](architecture/01-03-foundations.md) | §1 Two fidelity levels · §2 Modules · §3 Conventions (Glyph index spaces, Object kinds) |
| [04-formula-engine.md](architecture/04-formula-engine.md) | §4 Formula engine: Pango text, placeholder boxes, the glyph producers |
| [05a-time-model.md](architecture/05a-time-model.md) | §5 Time model: its opening, Relations in Manim, Glyph lifetime, Part transforms |
| [05b-attached-objects.md](architecture/05b-attached-objects.md) | §5 Attached objects: braces, shapes, labels, lines and arrows |
| [05c-rules-blocks-events.md](architecture/05c-rules-blocks-events.md) | §5 Rules, Editing blocks (UI), Events |
| [06-07-catalogue-rendering.md](architecture/06-07-catalogue-rendering.md) | §6 Animation catalogue (v1) · §7 Rendering |
| [08a-export-python.md](architecture/08a-export-python.md) | §8 Export: its opening and Python (`export/codegen`) |
| [08b-export-video.md](architecture/08b-export-video.md) | §8 Video (`export/video`) · The frame as an image (`export/image`) |
| [09-10-testing-working-rules.md](architecture/09-10-testing-working-rules.md) | §9 Testing · §10 Working rules |
| [11a-ui-layer.md](architecture/11a-ui-layer.md) | §11 UI layer and browser state: its opening (a clip's menus, playback, the modules of `ui/`, the Creator's list, the Preview's modes) |
| [11b-ui-history-state.md](architecture/11b-ui-history-state.md) | §11 continued: gestures and the undo history, stores, services, what the browser keeps |
| [11c-ui-look-views.md](architecture/11c-ui-look-views.md) | §11 continued: the look, the list of glyphs, the drawing that links glyphs, the relation editor's views, the timeline's slider, clips locked in the preview |
| [11d-templates-text-composition.md](architecture/11d-templates-text-composition.md) | §11 Formula templates · Text composition workspace |
| [11e-chroma-lab-palettes.md](architecture/11e-chroma-lab-palettes.md) | §11 Chroma Lab and editor palettes |
| [11f-media-audio.md](architecture/11f-media-audio.md) | §11 Durable original media and portable projects · Audio plan, clocks and exports |
| [12-scene-camera.md](architecture/12-scene-camera.md) | §12 The scene's camera: the camera in time, the locked region, what looks through it, its Python, the editor's operations on it, the timeline's Camera row, its views in the Animations panel, the Preview's world view |
| [13-slides-mode.md](architecture/13-slides-mode.md) | §13 The Slides mode and the exported page: where the scene animates and where it rests, a mark out of place, the guard, the mode in the editor, the ruler by zone, the marks on the ruler, the rehearsal, a pause that skips its wait, the marks in the Python; the exported page, how the runtime reaches the app, the forms of the export, the controls and the look of the page, what its folder tells an agent |

## Where to look

| You are about to touch | Read | Then, as needed |
|---|---|---|
| Free and exact mode: MathJax, the companion, how close the preview is to Manim | §1 [Two fidelity levels](architecture/01-03-foundations.md#1-two-fidelity-levels) | §4 [Formula engine](architecture/04-formula-engine.md#4-formula-engine) |
| A module's boundary, an import, an entry file; `embed/`, `data/` | §2 [Modules](architecture/01-03-foundations.md#2-modules) | §10 [Working rules](architecture/09-10-testing-working-rules.md#10-working-rules) |
| `model/`: a type, a field, the schema, a migration | §3 [Conventions](architecture/01-03-foundations.md#3-conventions), [Object kinds](architecture/01-03-foundations.md#object-kinds) | [docs/FORMAT.md](FORMAT.md); the section of the feature |
| A new kind of object, or a variant of one | §3 [Object kinds](architecture/01-03-foundations.md#object-kinds) | §4 [producers](architecture/04-formula-engine.md#existing-producers-and-geometry-conventions), §8 [Mobjects](architecture/08a-export-python.md#mobjects), the [`mfe-add-object-kind`](../.claude/skills/mfe-add-object-kind/SKILL.md) skill |
| Glyph indices and snapshots: the render store, the render sync, `remapGlyphRefs` | §3 [Glyph index spaces](architecture/01-03-foundations.md#glyph-index-spaces) | §4 [Placeholder boxes](architecture/04-formula-engine.md#placeholder-boxes-a-font-text-nothing-has-shaped) (texts) |
| `engine/`: glyph producers, MathJax and LaTeX, render keys, packages, labelled renders | §4 [Formula engine](architecture/04-formula-engine.md#4-formula-engine) | §1, §3 [Glyph index spaces](architecture/01-03-foundations.md#glyph-index-spaces) |
| Font text (Pango): its saved geometry, placeholder boxes | §4 [Pango text and durable appearance](architecture/04-formula-engine.md#pango-text-and-durable-appearance), [Placeholder boxes](architecture/04-formula-engine.md#placeholder-boxes-a-font-text-nothing-has-shaped) | §8 [Font text](architecture/08a-export-python.md#font-text), §11 [Text composition workspace](architecture/11d-templates-text-composition.md#text-composition-workspace), [Durable original media](architecture/11f-media-audio.md#durable-original-media-and-portable-projects) |
| Clips, intros, outros, blocks and relations: what plays when | §5 [Time model](architecture/05a-time-model.md#5-time-model) | [Events](architecture/05c-rules-blocks-events.md#events) |
| `model/lifetime.ts`, `model/transfers.ts`: which glyphs are on screen, and why | §5 [Glyph lifetime](architecture/05a-time-model.md#glyph-lifetime) | [Rules](architecture/05c-rules-blocks-events.md#rules-enforced-by-validateproject) |
| Relations and Morph blocks as Manim plays them (`geom/morph.ts`, `scene/anim/morph.ts`) | §5 [Relations in Manim](architecture/05a-time-model.md#relations-in-manim) | §8 [Relations](architecture/08a-export-python.md#relations), [Morph blocks](architecture/08a-export-python.md#morph-blocks) |
| Part transforms (`scene/anim/part.ts`) | §5 [Part transforms](architecture/05a-time-model.md#part-transforms) | §8 [Animation blocks](architecture/08a-export-python.md#animation-blocks) |
| Labels, braces and shapes on glyphs (`scene/attach.ts`, `store/attachSync.ts`, `model/placementRefs.ts`, `geom/brace.ts`, `geom/shapes.ts`) | §5 [Attached objects](architecture/05b-attached-objects.md#attached-objects) | §8 [Glyph membership](architecture/08a-export-python.md#glyph-membership) |
| Lines and arrows (`geom/lines.ts`, `scene/lines.ts`, `scene/lineStates.ts`) | §5 [Lines and arrows](architecture/05b-attached-objects.md#lines-and-arrows), [Curved lines and tips](architecture/05b-attached-objects.md#curved-lines-and-tips), [A tween that carries the ends of a line](architecture/05b-attached-objects.md#a-tween-that-carries-the-ends-of-a-line) | §11 [Drawing a line](architecture/11a-ui-layer.md#drawing-a-line) |
| Validation (`model/validate.ts`), the planner of blocks (`model/conflicts.ts`) | §5 [Rules](architecture/05c-rules-blocks-events.md#rules-enforced-by-validateproject), [Blocks that run at the same time](architecture/05c-rules-blocks-events.md#blocks-that-run-at-the-same-time) | [Glyph lifetime](architecture/05a-time-model.md#glyph-lifetime) |
| The scene's camera: `Project.camera`, `model/camera.ts`, `scene/camera.ts`, the locked region, `ui/camera/cameraOps.ts` | §12 [The scene's camera](architecture/12-scene-camera.md#12-the-scenes-camera) | [docs/FORMAT.md](FORMAT.md#scenecamera), §7 [Rendering](architecture/06-07-catalogue-rendering.md#7-rendering) |
| The Slides mode: `Project.slides`, `model/slides.ts`, the marks and where one may stand, the guard (`ui/slides/slideGuard.ts`) | §13 [The Slides mode](architecture/13-slides-mode.md#13-the-slides-mode) | [docs/FORMAT.md](FORMAT.md#slides), §12 [The locked region](architecture/12-scene-camera.md#the-locked-region), §8 [The marks of the Slides mode](architecture/08a-export-python.md#the-marks-of-the-slides-mode) |
| The Slides mode in the editor: its toggle, the ruler by zone, the marks on the ruler, their menus, drags and keys (`ui/slides/slideOps.ts`, `slideActions.ts`, `timeline/SlideMarks.tsx`) | §13 [The mode in the editor](architecture/13-slides-mode.md#the-mode-in-the-editor), [The ruler by zone](architecture/13-slides-mode.md#the-ruler-by-zone), [Marks on the ruler](architecture/13-slides-mode.md#marks-on-the-ruler) | §12 [The Camera row](architecture/12-scene-camera.md#the-camera-row), §11 [The modules of `ui/`](architecture/11a-ui-layer.md#ui-modules) |
| The exported page (Export ▸ HTML): the runtime `src/deck/` (the SVG stage, the deck, its clock), `build/deckRuntime.ts`, `export/html/` (the folder, the zip, the single file), the dialog (`ui/export/HtmlExportDialog.tsx`), the rehearsal in the transport | §13 [The exported page](architecture/13-slides-mode.md#the-exported-page), [How the runtime reaches the app](architecture/13-slides-mode.md#how-the-runtime-reaches-the-app), [The forms of the export](architecture/13-slides-mode.md#the-forms-of-the-export), [The rehearsal](architecture/13-slides-mode.md#the-rehearsal) | §7 [Rendering](architecture/06-07-catalogue-rendering.md#7-rendering), §11 [The transport](architecture/11a-ui-layer.md#ui-modules) |
| The controls of the exported page (`deck/controls.ts`, `timeline.ts`, `keys.ts`, `notes.ts`, `fullscreen.ts`, `icons.ts`) and its look (`deck/player.css`: the classes and custom properties a host page relies on) | §13 [The controls and the look of the exported page](architecture/13-slides-mode.md#the-controls-and-the-look-of-the-exported-page) | §13 [The Slides mode](architecture/13-slides-mode.md#13-the-slides-mode) |
| Blocks on the timeline: allowed ranges, drags, timing copy, groups, Morph blocks and the pair editor (`ui/animations/`, `ui/timeline/`, `ui/morph/`) | §5 [Editing blocks (UI)](architecture/05c-rules-blocks-events.md#editing-blocks-ui) | §11 [The modules of `ui/`](architecture/11a-ui-layer.md#ui-modules) |
| `buildEvents` | §5 [Events](architecture/05c-rules-blocks-events.md#events) |  |
| The evaluator (`scene/`): Manim's intros and outros, easing, staggering | §6 [Animation catalogue](architecture/06-07-catalogue-rendering.md#6-animation-catalogue-v1) | §5 [Glyph lifetime](architecture/05a-time-model.md#glyph-lifetime) |
| `render/`: drawing, picking, the editor's overlays | §7 [Rendering](architecture/06-07-catalogue-rendering.md#7-rendering) | §11 [The modules of `ui/`](architecture/11a-ui-layer.md#ui-modules) |
| `export/codegen`: the generated Python | §8 [Python](architecture/08a-export-python.md#python-exportcodegen) and its [Implementation notes](architecture/08a-export-python.md#implementation-notes) | §6, §5 [Relations in Manim](architecture/05a-time-model.md#relations-in-manim), the pins (§9 [Testing](architecture/09-10-testing-working-rules.md#9-testing)) |
| The export check (`tests/export/`) | §8 [Validation suite](architecture/08a-export-python.md#validation-suite) | §9 [Testing](architecture/09-10-testing-working-rules.md#9-testing) |
| `export/video`: the video dialog, the browser's encoder, ffmpeg, Render with Manim | §8 [Video](architecture/08b-export-video.md#video-exportvideo) | §11 [Audio plan, clocks and exports](architecture/11f-media-audio.md#audio-plan-clocks-and-exports), [docs/COMPANION.md](COMPANION.md) |
| `export/image`: the frame at the playhead as a PNG picture, its dialog (`ui/export/ImageExportDialog.tsx`, `imageExportModel.ts`, `imageExportRun.ts`) | §8 [The frame as an image](architecture/08b-export-video.md#the-frame-as-an-image-exportimage) | §8 [Video](architecture/08b-export-video.md#video-exportvideo), §12 [Through the camera](architecture/12-scene-camera.md#through-the-camera) |
| What Export ▸ HTML's folder tells an agent: `AGENTS.md`, the timeline in words of `scene.js`, the type files, `check.mjs`, `embed-example.html` (`export/html/agentGuide.ts`, `guideExamples.ts`, `timelineWords.ts`, `checkScript.ts`, `embedExample.ts`, `build/deckTypes.ts`) | §13 [What the exported folder tells an agent](architecture/13-slides-mode.md#what-the-exported-folder-tells-an-agent) | §13 [The marks in the Python](architecture/13-slides-mode.md#the-marks-in-the-python) |
| Tests: the layers, the native gate, the end-to-end plan, the examples | §9 [Testing](architecture/09-10-testing-working-rules.md#9-testing) |  |
| Contracts, imports on a disk that ignores case, builds from `file://`, licences | §10 [Working rules](architecture/09-10-testing-working-rules.md#10-working-rules) | [CLAUDE.md](../CLAUDE.md) |
| A clip's own menu entries, Unlink formula, creating braces and shapes, playback (`ui/transport/`) | §11 [UI layer and browser state](architecture/11a-ui-layer.md#11-ui-layer-and-browser-state) | [Main playback](architecture/11a-ui-layer.md#main-playback) |
| A module of `ui/`: animations, preview, colors, relations, morph, timeline, menus, focus, the Creator's cards and sources | §11 [The modules of `ui/`](architecture/11a-ui-layer.md#ui-modules) | the rows below, by subject |
| The on-screen keypad of the formula editor (`ui/creator/keypad/`) | §11 [The on-screen keypad of the formula editor](architecture/11a-ui-layer.md#the-on-screen-keypad-of-the-formula-editor) |  |
| The Creator's list: groups of formulas, the search of formulas | §11 [Groups of formulas](architecture/11a-ui-layer.md#groups-of-formulas), [The search of formulas](architecture/11a-ui-layer.md#the-search-of-formulas) |  |
| The Preview's modes and their keys, drawing a line | §11 [The keys of the Preview's modes](architecture/11a-ui-layer.md#the-keys-of-the-previews-modes), [One mode of the Preview at a time](architecture/11a-ui-layer.md#one-mode-of-the-preview-at-a-time), [Drawing a line](architecture/11a-ui-layer.md#drawing-a-line) | §7 [Rendering](architecture/06-07-catalogue-rendering.md#7-rendering) |
| Undo and redo, drags, edits made click by click (`store/projectStore.ts`) | §11 [Owned gestures](architecture/11b-ui-history-state.md#owned-gestures), [A step made of several writes](architecture/11b-ui-history-state.md#a-step-made-of-several-writes) | [History routing](architecture/11b-ui-history-state.md#history-routing) |
| Stores, services and listeners (`ui/project/useAppServices.ts`) | §11 [Stores besides the project](architecture/11b-ui-history-state.md#stores-besides-the-project), [Services](architecture/11b-ui-history-state.md#services) | [CLAUDE.md](../CLAUDE.md) |
| What the browser keeps: `localStorage`, autosave, file handles, the project library; the examples the app carries (`ui/project/starterExamples.ts`) | §11 [What the browser keeps](architecture/11b-ui-history-state.md#what-the-browser-keeps), [The alive mark](architecture/11b-ui-history-state.md#the-alive-mark) | [Durable original media](architecture/11f-media-audio.md#durable-original-media-and-portable-projects) |
| The look: theme tokens (`ui/styles.css`), forced colours, the narrow layout | §11 [The look](architecture/11c-ui-look-views.md#the-look), [Zen mode](architecture/11c-ui-look-views.md#zen-mode), [what red means](architecture/11c-ui-look-views.md#reds), [Identification colours](architecture/11c-ui-look-views.md#identification-colours) |  |
| The relation editor (`ui/relations/`) | §11 [The modules of `ui/`](architecture/11a-ui-layer.md#ui-modules), [the drawing that links glyphs](architecture/11c-ui-look-views.md#the-drawing-that-links-glyphs), [its own preview](architecture/11c-ui-look-views.md#the-relation-editors-own-preview), [the raw preview](architecture/11c-ui-look-views.md#the-raw-preview), [its side column](architecture/11c-ui-look-views.md#the-relation-editors-side-column) | §5 [Relations in Manim](architecture/05a-time-model.md#relations-in-manim) |
| The list of glyphs, the timeline's slider, clips locked in the preview | §11 [The list of glyphs](architecture/11c-ui-look-views.md#the-list-of-glyphs), [The timeline's slider](architecture/11c-ui-look-views.md#the-timelines-slider), [Clips locked in the preview](architecture/11c-ui-look-views.md#clips-locked-in-the-preview) |  |
| Formula templates (`ui/creator/templates/`, `data/`) | §11 [Formula templates](architecture/11d-templates-text-composition.md#formula-templates) | §2 [Modules](architecture/01-03-foundations.md#2-modules) |
| The text workspace (`ui/text/`) | §11 [Text composition workspace](architecture/11d-templates-text-composition.md#text-composition-workspace) | §4 [Pango text and durable appearance](architecture/04-formula-engine.md#pango-text-and-durable-appearance) |
| Palettes and Chroma Lab (`ui/colors/`, `ui/chroma/`) | §11 [Chroma Lab and editor palettes](architecture/11e-chroma-lab-palettes.md#chroma-lab-and-editor-palettes) | [The modules of `ui/`](architecture/11a-ui-layer.md#ui-modules) (`colors/`) |
| `media/`: originals and their owners, packages, Save, missing media | §11 [Durable original media and portable projects](architecture/11f-media-audio.md#durable-original-media-and-portable-projects) | [docs/FORMAT.md, the portable package](FORMAT.md#portable-package-mfe-container-version-1) |
| `audio/`, `export/audio`, the sound of a video | §11 [Audio plan, clocks and exports](architecture/11f-media-audio.md#audio-plan-clocks-and-exports) | §8 [Video](architecture/08b-export-video.md#video-exportvideo) |
| The file format | [docs/FORMAT.md](FORMAT.md) | §3 [Object kinds](architecture/01-03-foundations.md#object-kinds) |
| The companion's protocol | [docs/COMPANION.md](COMPANION.md) | §4 [Pango text](architecture/04-formula-engine.md#pango-text-and-durable-appearance), §8 [Video](architecture/08b-export-video.md#video-exportvideo) |

## Sections and files

Every heading of the document, and the paragraphs with a name of their own that a link or a comment
names, with the file that holds it. `›` marks a subsection (`###`); a name in *italics* is a
paragraph, which has an anchor of its own.

| § | Heading or paragraph | File |
|---|---|---|
| §1 | Two fidelity levels | [01-03-foundations.md](architecture/01-03-foundations.md#1-two-fidelity-levels) |
| §2 | Modules | [01-03-foundations.md](architecture/01-03-foundations.md#2-modules) |
| §3 | Conventions | [01-03-foundations.md](architecture/01-03-foundations.md#3-conventions) |
| §3 | › Glyph index spaces | [01-03-foundations.md](architecture/01-03-foundations.md#glyph-index-spaces) |
| §3 | › Object kinds | [01-03-foundations.md](architecture/01-03-foundations.md#object-kinds) |
| §4 | Formula engine | [04-formula-engine.md](architecture/04-formula-engine.md#4-formula-engine) |
| §4 | › Pango text and durable appearance | [04-formula-engine.md](architecture/04-formula-engine.md#pango-text-and-durable-appearance) |
| §4 | › Placeholder boxes: a font text nothing has shaped | [04-formula-engine.md](architecture/04-formula-engine.md#placeholder-boxes-a-font-text-nothing-has-shaped) |
| §4 | › *Geometry not at hand* | [04-formula-engine.md](architecture/04-formula-engine.md#geometry-not-at-hand) |
| §4 | › Existing producers and geometry conventions | [04-formula-engine.md](architecture/04-formula-engine.md#existing-producers-and-geometry-conventions) |
| §4 | › *Labelled renders* | [04-formula-engine.md](architecture/04-formula-engine.md#labelled-renders) |
| §5 | Time model | [05a-time-model.md](architecture/05a-time-model.md#5-time-model) |
| §5 | › Relations in Manim | [05a-time-model.md](architecture/05a-time-model.md#relations-in-manim) |
| §5 | › Glyph lifetime | [05a-time-model.md](architecture/05a-time-model.md#glyph-lifetime) |
| §5 | › Part transforms | [05a-time-model.md](architecture/05a-time-model.md#part-transforms) |
| §5 | › Attached objects | [05b-attached-objects.md](architecture/05b-attached-objects.md#attached-objects) |
| §5 | › *A shape's paint* | [05b-attached-objects.md](architecture/05b-attached-objects.md#a-shapes-paint) |
| §5 | › *A tween that carries a shape to other glyphs* | [05b-attached-objects.md](architecture/05b-attached-objects.md#a-tween-that-carries-a-shape-to-other-glyphs) |
| §5 | › *Lines and arrows* | [05b-attached-objects.md](architecture/05b-attached-objects.md#lines-and-arrows) |
| §5 | › *Curved lines and tips* | [05b-attached-objects.md](architecture/05b-attached-objects.md#curved-lines-and-tips) |
| §5 | › *A tween that carries the ends of a line* | [05b-attached-objects.md](architecture/05b-attached-objects.md#a-tween-that-carries-the-ends-of-a-line) |
| §5 | › Rules (enforced by `validateProject`) | [05c-rules-blocks-events.md](architecture/05c-rules-blocks-events.md#rules-enforced-by-validateproject) |
| §5 | › *Blocks that run at the same time* | [05c-rules-blocks-events.md](architecture/05c-rules-blocks-events.md#blocks-that-run-at-the-same-time) |
| §5 | › Editing blocks (UI) | [05c-rules-blocks-events.md](architecture/05c-rules-blocks-events.md#editing-blocks-ui) |
| §5 | › *Groups of animation blocks* | [05c-rules-blocks-events.md](architecture/05c-rules-blocks-events.md#groups-of-animation-blocks) |
| §5 | › *A Morph block* | [05c-rules-blocks-events.md](architecture/05c-rules-blocks-events.md#a-morph-block) |
| §5 | › *The pair editor* | [05c-rules-blocks-events.md](architecture/05c-rules-blocks-events.md#the-pair-editor) |
| §5 | › *Braces and shapes* | [05c-rules-blocks-events.md](architecture/05c-rules-blocks-events.md#braces-and-shapes) |
| §5 | › Events | [05c-rules-blocks-events.md](architecture/05c-rules-blocks-events.md#events) |
| §6 | Animation catalogue (v1) | [06-07-catalogue-rendering.md](architecture/06-07-catalogue-rendering.md#6-animation-catalogue-v1) |
| §7 | Rendering | [06-07-catalogue-rendering.md](architecture/06-07-catalogue-rendering.md#7-rendering) |
| §8 | Export | [08a-export-python.md](architecture/08a-export-python.md#8-export) |
| §8 | › Python (`export/codegen`) | [08a-export-python.md](architecture/08a-export-python.md#python-exportcodegen) |
| §8 | › *Mobjects* | [08a-export-python.md](architecture/08a-export-python.md#mobjects) |
| §8 | › *Font text* | [08a-export-python.md](architecture/08a-export-python.md#font-text) |
| §8 | › *Timing: frame grid, then slices* | [08a-export-python.md](architecture/08a-export-python.md#timing-frame-grid-then-slices) |
| §8 | › *Glyph membership* | [08a-export-python.md](architecture/08a-export-python.md#glyph-membership) |
| §8 | › *Tweens* | [08a-export-python.md](architecture/08a-export-python.md#tweens) |
| §8 | › *Relations* | [08a-export-python.md](architecture/08a-export-python.md#relations) |
| §8 | › *Morph blocks* | [08a-export-python.md](architecture/08a-export-python.md#morph-blocks) |
| §8 | › *Clip animations* | [08a-export-python.md](architecture/08a-export-python.md#clip-animations) |
| §8 | › *Animation blocks* | [08a-export-python.md](architecture/08a-export-python.md#animation-blocks) |
| §8 | › *Emphasis blocks* | [08a-export-python.md](architecture/08a-export-python.md#emphasis-blocks) |
| §8 | › *The marks of the Slides mode* | [08a-export-python.md](architecture/08a-export-python.md#the-marks-of-the-slides-mode) |
| §8 | › *Validation* | [08a-export-python.md](architecture/08a-export-python.md#validation) |
| §8 | › *Implementation notes* (helpers, restoring removers, strings, frame-exact durations, membership, tweens, snapping, renders, glyph counts) | [08a-export-python.md](architecture/08a-export-python.md#implementation-notes) |
| §8 | › *Manim behaviours this relies on* | [08a-export-python.md](architecture/08a-export-python.md#manim-behaviours-this-relies-on) |
| §8 | › *Validation suite* | [08a-export-python.md](architecture/08a-export-python.md#validation-suite) |
| §8 | › Video (`export/video`) | [08b-export-video.md](architecture/08b-export-video.md#video-exportvideo) |
| §8 | › The frame as an image (`export/image`) | [08b-export-video.md](architecture/08b-export-video.md#the-frame-as-an-image-exportimage) |
| §9 | Testing | [09-10-testing-working-rules.md](architecture/09-10-testing-working-rules.md#9-testing) |
| §10 | Working rules | [09-10-testing-working-rules.md](architecture/09-10-testing-working-rules.md#10-working-rules) |
| §11 | UI layer and browser state: a clip's own menu entries, Unlink formula, the creation of braces, labels and shapes | [11a-ui-layer.md](architecture/11a-ui-layer.md#11-ui-layer-and-browser-state) |
| §11 | › *Main playback* | [11a-ui-layer.md](architecture/11a-ui-layer.md#main-playback) |
| §11 | › *The modules of `ui/`* | [11a-ui-layer.md](architecture/11a-ui-layer.md#ui-modules) |
| §11 | › *Groups of formulas* | [11a-ui-layer.md](architecture/11a-ui-layer.md#groups-of-formulas) |
| §11 | › *The search of formulas* | [11a-ui-layer.md](architecture/11a-ui-layer.md#the-search-of-formulas) |
| §11 | › *The keys of the Preview's modes* | [11a-ui-layer.md](architecture/11a-ui-layer.md#the-keys-of-the-previews-modes) |
| §11 | › *Drawing a line* | [11a-ui-layer.md](architecture/11a-ui-layer.md#drawing-a-line) |
| §11 | › *One mode of the Preview at a time* | [11a-ui-layer.md](architecture/11a-ui-layer.md#one-mode-of-the-preview-at-a-time) |
| §11 | › *Owned gestures* | [11b-ui-history-state.md](architecture/11b-ui-history-state.md#owned-gestures) |
| §11 | › *A step made of several writes* | [11b-ui-history-state.md](architecture/11b-ui-history-state.md#a-step-made-of-several-writes) |
| §11 | › *History routing*; Duplicate and Unlink formula make the same copies | [11b-ui-history-state.md](architecture/11b-ui-history-state.md#history-routing) |
| §11 | › *Stores besides the project* | [11b-ui-history-state.md](architecture/11b-ui-history-state.md#stores-besides-the-project) |
| §11 | › *Services* | [11b-ui-history-state.md](architecture/11b-ui-history-state.md#services) |
| §11 | › *The menu key* | [11b-ui-history-state.md](architecture/11b-ui-history-state.md#the-menu-key) |
| §11 | › *The Renderer label* | [11b-ui-history-state.md](architecture/11b-ui-history-state.md#the-renderer-label) |
| §11 | › *What the browser keeps* (`localStorage`, panel sizes, autosave, IndexedDB, the project library, the examples the app carries) | [11b-ui-history-state.md](architecture/11b-ui-history-state.md#what-the-browser-keeps) |
| §11 | › *The alive mark* (autosave records of other pages, pruning) | [11b-ui-history-state.md](architecture/11b-ui-history-state.md#the-alive-mark) |
| §11 | › *The look* | [11c-ui-look-views.md](architecture/11c-ui-look-views.md#the-look) |
| §11 | › *Identification colours* (forced colours, the narrow layout) | [11c-ui-look-views.md](architecture/11c-ui-look-views.md#identification-colours) |
| §11 | › *The list of glyphs* | [11c-ui-look-views.md](architecture/11c-ui-look-views.md#the-list-of-glyphs) |
| §11 | › *The drawing that links glyphs* (both pair editors: the selector, the layouts, the view) | [11c-ui-look-views.md](architecture/11c-ui-look-views.md#the-drawing-that-links-glyphs) |
| §11 | › *The relation editor's own preview* | [11c-ui-look-views.md](architecture/11c-ui-look-views.md#the-relation-editors-own-preview) |
| §11 | › *The raw preview* | [11c-ui-look-views.md](architecture/11c-ui-look-views.md#the-raw-preview) |
| §11 | › *The relation editor's side column* | [11c-ui-look-views.md](architecture/11c-ui-look-views.md#the-relation-editors-side-column) |
| §11 | › *The timeline's slider* | [11c-ui-look-views.md](architecture/11c-ui-look-views.md#the-timelines-slider) |
| §11 | › *Clips locked in the preview* | [11c-ui-look-views.md](architecture/11c-ui-look-views.md#clips-locked-in-the-preview) |
| §11 | › Formula templates | [11d-templates-text-composition.md](architecture/11d-templates-text-composition.md#formula-templates) |
| §11 | › Text composition workspace | [11d-templates-text-composition.md](architecture/11d-templates-text-composition.md#text-composition-workspace) |
| §11 | › Chroma Lab and editor palettes | [11e-chroma-lab-palettes.md](architecture/11e-chroma-lab-palettes.md#chroma-lab-and-editor-palettes) |
| §11 | › Durable original media and portable projects | [11f-media-audio.md](architecture/11f-media-audio.md#durable-original-media-and-portable-projects) |
| §11 | › *A project without recordings is one `.mfe.json`* | [11f-media-audio.md](architecture/11f-media-audio.md#a-project-without-recordings-is-one-mfejson) |
| §11 | › *Saving without missing media* | [11f-media-audio.md](architecture/11f-media-audio.md#saving-without-missing-media) |
| §11 | › *Who owns what, and for how long* | [11f-media-audio.md](architecture/11f-media-audio.md#who-owns-what-and-for-how-long) |
| §11 | › *Collection* | [11f-media-audio.md](architecture/11f-media-audio.md#collection) |
| §11 | › *Where the browser has no database* | [11f-media-audio.md](architecture/11f-media-audio.md#where-the-browser-has-no-database) |
| §11 | › Audio plan, clocks and exports | [11f-media-audio.md](architecture/11f-media-audio.md#audio-plan-clocks-and-exports) |
| §12 | The scene's camera | [12-scene-camera.md](architecture/12-scene-camera.md#12-the-scenes-camera) |
| §12 | › The camera in time | [12-scene-camera.md](architecture/12-scene-camera.md#the-camera-in-time) |
| §12 | › The locked region | [12-scene-camera.md](architecture/12-scene-camera.md#the-locked-region) |
| §12 | › Through the camera | [12-scene-camera.md](architecture/12-scene-camera.md#through-the-camera) |
| §12 | › The Python of a camera | [12-scene-camera.md](architecture/12-scene-camera.md#the-python-of-a-camera) |
| §12 | › Editing the camera | [12-scene-camera.md](architecture/12-scene-camera.md#editing-the-camera) |
| §12 | › The Camera row | [12-scene-camera.md](architecture/12-scene-camera.md#the-camera-row) |
| §12 | › The camera's panel | [12-scene-camera.md](architecture/12-scene-camera.md#the-cameras-panel) |
| §12 | › The Preview's world view | [12-scene-camera.md](architecture/12-scene-camera.md#the-previews-world-view) |
| §13 | The Slides mode | [13-slides-mode.md](architecture/13-slides-mode.md#13-the-slides-mode) |
| §13 | › Where the scene animates and where it rests | [13-slides-mode.md](architecture/13-slides-mode.md#where-the-scene-animates-and-where-it-rests) |
| §13 | › A mark out of place | [13-slides-mode.md](architecture/13-slides-mode.md#a-mark-out-of-place) |
| §13 | › The guard | [13-slides-mode.md](architecture/13-slides-mode.md#the-guard) |
| §13 | › The mode in the editor | [13-slides-mode.md](architecture/13-slides-mode.md#the-mode-in-the-editor) |
| §13 | › The ruler by zone | [13-slides-mode.md](architecture/13-slides-mode.md#the-ruler-by-zone) |
| §13 | › Marks on the ruler | [13-slides-mode.md](architecture/13-slides-mode.md#marks-on-the-ruler) |
| §13 | › The rehearsal | [13-slides-mode.md](architecture/13-slides-mode.md#the-rehearsal) |
| §13 | › A pause that skips its wait | [13-slides-mode.md](architecture/13-slides-mode.md#a-pause-that-skips-its-wait) |
| §13 | › The marks in the Python | [13-slides-mode.md](architecture/13-slides-mode.md#the-marks-in-the-python) |
| §13 | › The exported page | [13-slides-mode.md](architecture/13-slides-mode.md#the-exported-page) |
| §13 | › How the runtime reaches the app | [13-slides-mode.md](architecture/13-slides-mode.md#how-the-runtime-reaches-the-app) |
| §13 | › The forms of the export | [13-slides-mode.md](architecture/13-slides-mode.md#the-forms-of-the-export) |
| §13 | › The controls and the look of the exported page | [13-slides-mode.md](architecture/13-slides-mode.md#the-controls-and-the-look-of-the-exported-page) |
| §13 | › What the exported folder tells an agent | [13-slides-mode.md](architecture/13-slides-mode.md#what-the-exported-folder-tells-an-agent) |

## Adding to the document

- A paragraph goes into the file that holds its section or subsection (the table above), next to
  what it extends. A new `###` subsection goes into the file of its section, and a new section takes
  the next number (§12) and a file of its own named like the others (`12-<subject>.md`); either gets
  a row in the tables of this page, and a new file a place in the headers of the files before and
  after it.
- The section numbers and the headings are cited by code comments and by the other documents
  (ARCHITECTURE §8, "Mobjects"): never renumber a section, and rename a heading or a named paragraph
  only together with what cites it.
- Refer to another part as `§N` or `(§N, "Heading")` and make the reference a relative link to the
  file and the anchor of the heading: GitHub's (lower case, punctuation dropped, spaces as hyphens:
  `05c-rules-blocks-events.md#rules-enforced-by-validateproject`), or, for a paragraph without a
  heading, an explicit `<a id="…"></a>` on the line before it, as the paragraphs in *italics* above
  have. A link from this page starts with `architecture/`; one between two files of
  `docs/architecture/` is the file's name alone.
- Every file starts with the same header: what it holds, this index, the files before and after it
  and "See also". A file that grows past about 1,200 lines is cut along its `###` subsections or its
  subjects: then the tables of this page, the headers around it and the links into it change with it
  (`grep -rn '<file>.md' docs .claude CLAUDE.md README.md tests`).
- The files are hard-wrapped at 100 columns with hand-made tables, like the other documents: never
  run Prettier on them; `.claude/skills/mfe-change/reflow.py` changes words inside a paragraph.
