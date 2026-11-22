# Architecture §9–§10: Testing, working rules

[Index](../ARCHITECTURE.md) · Previous: [§8 Export: video](08b-export-video.md) · Next:
[§11 UI layer](11a-ui-layer.md)

Holds §9 *Testing* (the layers, the native gate, the plan of the end-to-end suite and its
conventions on every system, the examples, how Morph blocks are covered) and §10 *Working rules*
(contracts, imports on a disk that ignores case, builds from `file://`, what a build distributes).

See also: [§8 Validation suite](08a-export-python.md#validation-suite) ·
[CLAUDE.md](../../CLAUDE.md) · [the `mfe-change` skill](../../.claude/skills/mfe-change/SKILL.md)

---

## 9. Testing

| Layer | Tool | Where |
|---|---|---|
| Unit | Vitest (jsdom; `// @vitest-environment node` for pure modules) | `app/src/**/__tests__`, `*.test.ts(x)` |
| Native integration | Vitest `native` project, mandatory Python/LaTeX/dvisvgm | `*.native.test.ts` |
| End-to-end | Playwright on the system Chrome | `app/e2e/` |
| Glyph parity | Node + ManimCE/ManimGL venvs | `tests/parity/` (`npm run parity`) |
| Export validity | generated `.py` executed in both venvs, probed against the evaluator | `tests/export/` (`npm run export-check`) |
| Paint and membership | current-source artifact generator and CE/GL native probes | `tests/export/generate-paint.mjs`, `paint_native.py` |
| Generated Python | the whole output for the export-check projects and the examples, pinned | `app/src/export/codegen/__tests__/__snapshots__/python/` |
| Companion | `unittest` (standard library) | `companion/tests/` (`python3 -m unittest discover -s companion/tests`) |

The fixtures that compare the evaluator with what Manim drew (`scene/__tests__/fixtures/*.json`)
are written by the generators in `scene/__tests__/fixtures/manim/` (`gen_*.py`, run with the
venv's Python; each says how in its docstring). `npm run check` (typecheck, lint, unit tests,
build) must pass before every commit. `npm test` and `npx vitest run` include both the isolated
`unit` and required `native` projects. The latter runs after unit tests and fails clearly when
`python3`, `latex` or `dvisvgm` is unavailable. `npm run test:unit` and `test:watch:unit` select
developer runs, not replacements for the full gate; `test:native` selects native cases.
`MFE_SKIP_NATIVE=1` is the one way to leave the native project out of `npm test` on purpose, for a
machine without TeX (`build/nativeGate.ts`, read by `vitest.config.ts`): the project is not defined
for that run, a banner naming the skipped files is printed before the tests and again after the
summary, `verify.sh` marks its `vitest` line and adds a `WARNING` line, and a run that also asks for
`--project native` fails at once. Only the value `1` skips, and such a run is not the gate.

How the tests run is a file of its own, `app/vitest.config.ts`, laid over the product's
configuration (`app/vite.config.ts`: the development server and the build), so the tests see the
app through the same plugins and the build imports nothing of Vitest (`nativeGate.test.ts` reads
the two files for it). `npm run export-check` has a configuration of its own
(`vitest.export.config.ts`).

The unit setup awaits DOM-only setup when a document exists. Node files do not load React Testing
Library, jest-dom or DOM shims; jsdom retains React cleanup, storage/theme reset, ResizeObserver
and scrollIntoView. File isolation remains enabled. Pure builders in
`model/__tests__/fixtures.ts` can be used by either environment; `test/examples.ts` owns Node-only
file loading. Shared native geometry inputs are read-only, while projects, renders and transformed
geometry remain fresh per case. Every test vector keeps its own assertion owner even when setup
or comparison helpers are shared.

The end-to-end suite is one Playwright run of every spec of `app/e2e/`, planned by
`build/e2ePlan.ts` (pure, with its unit tests) and applied by `playwright.config.ts`:

- **The order: the slowest specs first.** Playwright runs the files of a project in alphabetical
  order and the projects in the order the config lists them, so the order comes from the projects.
  The specs, sorted by what their tests took (`e2e/durations.json`), are cut into bands, one
  project each (`order-01` runs first). A band and not a spec, because a worker serves one project:
  every project costs each worker a new process and a new browser, 0.44 s a spec with two workers.
  A band is closed once it holds a minute of tests, so the slow specs get one each, in their exact
  order, and the quick ones share theirs. A spec without a recorded time runs in the first band.
  `MFE_E2E_RECORD=1 npx playwright test`, on a run of the whole suite, rewrites the times
  (`e2e/durationsReporter.ts`); a spec with a failure keeps the time it had.
- **The pauses.** On a Mac the run waits 120 s every 200 tests, for a machine without a fan to
  cool. `e2e/cooldownReporter.ts` counts the tests as they end and writes until when to wait; every
  test waits for that moment before it starts, in a fixture of `e2e/test.ts` that has a time of its
  own, so that the wait is neither charged to the test nor part of the time it reports.
  `MFE_E2E_COOL_EVERY` asks for pauses on another system, or with `0` for none;
  `MFE_E2E_COOL_SECONDS` sets their length. `verify.sh` says how many a run made.
- **The same on every system.** A spec takes `test` and `expect` from `e2e/test.ts` and presses
  `ControlOrMeta`, never `Control`: the app takes ⌘ on a Mac, where a Ctrl+click is the secondary
  click (`build/__tests__/e2eConventions.test.ts` reads the specs for both, so that a slip fails on
  any machine). Chrome is started with `--disable-accelerated-2d-canvas`: where it draws a canvas
  on the GPU (a Mac), reading the canvas moves it to software, and the same picture drawn before
  and after a read is not the same pixels. Git for Windows would check every text file out with CRLF
  line ends (`core.autocrlf`), which no check that compares a file byte by byte survives, the
  manifest of the pinned Chroma Lab copy first: the Vite config reads it before anything else, so
  nothing would start. `.gitattributes` gives every text file LF in any checkout and leaves the
  copies of `app/src/data` alone (`build/__tests__/lineEndings.test.ts`). And what starts a Python
  (the native tests, the e2e helpers, the export check, the parity run) asks `build/python.ts` for
  its name: `python3` and `venv/bin/python` are `python` and `venv\Scripts\python.exe` on Windows,
  which has no `nice` either (`build/__tests__/python.test.ts` reads the sources, so that none
  writes a name of its own). And a harness that starts a companion (the e2e helpers, the export
  check, the parity run) cannot leave the clean-up to it: on Windows `kill()` ends the process at
  once, and its temporary folders are left behind (what it had started ends with it, by the Job
  Object of each child, and lets go of those folders a moment later).
  `build/harnessCompanion.ts` gives such a companion a temporary folder of its own, through the
  variables Python's `tempfile` reads, ends it with everything it started (`taskkill /T` on Windows,
  SIGTERM elsewhere) and removes the folder; `build/__tests__/harnessCompanion.test.ts` reads the
  sources, so that every start of a companion goes through it. The companion's own tests do the same
  with `serve_environment()` (`companion/tests/support.py`).

Paint and namespace unit cases retain every configured evaluator sample. Native artifacts are
generated independently with `node tests/export/generate-paint.mjs <directory>` from the repository
root, then checked with `tests/export/paint_native.py ce|gl <directory>` under each engine's Python.
Generation writes a completeness manifest; the probe refuses missing, extra or incomplete cases.
This route is separate from `npm run export-check` and runs when its fixture or probe contracts
change. Unit tests do not write artifacts through environment-variable side effects.

The examples (`examples/*.mfe.json`, listed in `test/examples.ts`: `EXAMPLE_FILES` is all of them,
`EXAMPLES` the ones with a scene, which other tests play, draw and export) are files of the current
format as the app writes them. `model/__tests__/io.test.ts` holds each to that (nothing to migrate,
and read and written again it is the same text) and `engine/__tests__/producers.test.ts` holds every
snapshot to the key its backend gives now: a format bump or a new backend revision asks for the
examples to be written again, each formula rendered by the backend its snapshot names and its glyphs
found to be the ones the snapshot counted.

Morph blocks are covered at every layer: the model (`model/__tests__/transfers.test.ts`,
`lifetime.test.ts`, `validate.test.ts`, `remap.test.ts`), the evaluator with same-clip transfers
(`scene/__tests__/morphBlocks.test.ts`), the generated Python (`codegen.test.ts`; the `multiline`
pins and `example-multiline`), the timeline and the panel (`ui/animations/__tests__/blockRange`,
`blockOps`, `blockActions` (the "Suggest morph pairs" preference), `blockGlyphs`,
`BlockProperties`), the pair editor (`ui/morph/__tests__/morphDraft.test.ts`,
`MorphEditor.test.tsx`, and the shared pieces in `ui/relations/__tests__/pairGestures`,
`pairHolder`, `GlyphLinkCanvas`, `PairMenu`, and of the drawing `pairPick`, `linkLayout`,
`linkRoutes` and `pairView`), the end-to-end specs `pairCanvas.spec.ts` (the drawing on the 80
glyphs of the example's derivation: the centre of each glyph takes that glyph, the circle and its
reach, marks and badges at their size on screen, zoom and pan, the opening view, the two layouts),
`morphBlocks.spec.ts` (menus, block colours, panel, dragging, preview outline) and
`morphEditor.spec.ts` (the pair editor on the owner's derivation: linking, Suggest on both steps,
Save as one undo step, closing) and `morphFlow.spec.ts` (the preference, the panel → editor path and
the owner's derivation through the UI alone, with scrubbing and the export), and real ManimCE and
ManimGL through the `multiline` export case and example.

## 10. Working rules

- One atomic change per commit, with its tests and the full suites green: the steps are in
  [`.claude/skills/mfe-change/SKILL.md`](../../.claude/skills/mfe-change/SKILL.md), the fixed rules
  in [`CLAUDE.md`](../../CLAUDE.md) at the repository root.
- Contracts — `model/`, every `*/types.ts`, and the exported signatures of `index.ts` files —
  change deliberately, with [this document](../ARCHITECTURE.md) and [`docs/FORMAT.md`](../FORMAT.md)
  in the same change.
- New behaviour comes with tests. Required native integration fails when prerequisites are missing,
  unless `MFE_SKIP_NATIVE=1` left it out on purpose and the run says so. Separate export/parity
  harnesses must report unavailable tools; incomplete runs are not evidence of successful
  verification.
- The sources work on a disk that does not tell `Foo` from `foo` (macOS and Windows as they come).
  There an import without its extension reaches the first name that answers, `.ts` before `.tsx`:
  `./EasingCurve` would be `easingCurve.ts`, and the app would stop at that import on an empty
  page. A component that sits over a module of its own name (`EasingCurve.tsx` over
  `easingCurve.ts`) is therefore imported with its extension, `./EasingCurve.tsx`.
  `app/build/__tests__/importCase.test.ts` resolves every relative import both ways from the names
  of the files alone, the same on any disk, and fails on one that differs; it also refuses two
  files whose names differ only by case.
- Builds must keep working from `file://` (see `app/vite.config.ts`): no module scripts, and Web
  Workers must be inlined (`?worker&inline`) or avoided. `npm run dist-check` builds and opens
  `dist/index.html` from disk (`app/build/dist.spec.ts`): the app starts and renders a formula,
  Chroma Lab loads in its frame and the licence links open their files.
- A build declares what it distributes. `app/build/thirdParty.ts` writes
  `licenses/THIRD-PARTY-NOTICES.txt` and `licenses/LICENSE.txt` into it (and serves them in
  development): the bundled packages come from `package-lock.json` and their licence texts from the
  installed tree. What no package declares comes from a hand-kept list: the KaTeX fonts and code
  inside MathLive, the brace outline the app's geometry takes from ManimCE and the rate functions
  the scene ports from ManimCE and from ManimGL (`scene/easing.ts`), with their texts in
  `app/build/licenses/`, and the two libraries inside Chroma Lab, with their texts in its own
  `vendor/` folder. What is inside the app's own modules goes with whatever carries the module: the
  engine of an exported page and the player of the web documentation name the modules of each
  (`APP_EMBEDDED_MODULES`). The brace pieces drawn with the CMEX10 font are acknowledged there, not
  licensed: a drawing made with a font is not the font. The same list reaches the app as the module
  `virtual:third-party` (typed in `src/vite-env.d.ts`) for Help → Third-party licenses. The licence
  of the app itself is named in one module, `app/build/projectLicense.ts`: its short name, its name
  in a sentence, and the sentences that say what is under it — the first paragraph of that dialog
  and the first paragraphs of the notices. The notices take them from there and the app gets them
  through `virtual:third-party` (Help → About shows the short name), so neither the dialogs nor
  the notices write the licence's name, and an app under other terms changes that module and
  `LICENSE` alone (`projectLicense.test.ts` pins the words of today and reads the dialogs and
  `thirdParty.ts` for it; the tests of the dialogs and the specs compare with the module and with
  the file `LICENSE`, whatever they say). The engine of an exported page says its own licence, in
  the text that travels with every page (`build/deckRuntime.ts`): it is not read from that module. A
  unit test accounts for every runtime package of the lockfile, a notice or the reason it is not
  bundled, and pins the components and the allowed licences. The build fails when a package in its
  output (a module or an asset) has no notice, when a declared package is not in the output and when
  a font file belongs to no component; the hand-kept list is as complete as its last review.
  `app/build/distributionCheck.ts` fails the build when a script or WebAssembly module, emitted or
  in `public/`, carries FFmpeg's marks (LGPL). A new runtime dependency therefore starts in
  `thirdParty.ts`.
