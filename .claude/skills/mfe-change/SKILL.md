---
name: mfe-change
description: Make one atomic, verified change to the Manim Formula Editor (feature, fix, refactor or docs) — implement it, add its unit and e2e tests, look at screenshots in both themes, run the full suites and commit only the files you touched. Use for every change in this repo, and whenever you need screenshots of the app or to re-wrap a paragraph in the docs.
---

# One change, one commit

Each change is small, does one thing and lands as its own commit with its tests, so that the
history can be followed and any step reverted alone. Paths below are relative to the repo root;
the app lives in `app/`.

## 1. Before writing code

- Read the area first and follow its pattern: logic in a pure `.ts` module with a unit test
  (`ui/animations/transformEdit.ts`, `ui/timeline/trackLayout.ts`, `ui/engineStatus.ts`), thin
  React components, store updates through the existing action helpers.
- Check `docs/ARCHITECTURE.md` (the contract: an index that names the file of `docs/architecture/`
  to read for each module and subject) and `docs/FORMAT.md` (the file format) for what the change
  touches. A change to the project format needs a version bump and a migration in
  `app/src/model/io.ts`: "A format bump", below, lists what that touches.
- A design or behaviour choice that is not obvious is the owner's call: ask before building it.
- A new kind of object, or a variant of one, has a skill of its own:
  `.claude/skills/mfe-add-object-kind/SKILL.md`.

### A format bump

Anything new a file holds is a new version of the format, an optional field and one more value of
an enum too: the schema strips the keys it does not know, so the app of the version before would
lose them without a word. The last bump shows every place it touches
(`git log -1 -S'FORMAT_VERSION = ' -- app/src/model/defaults.ts`, then `git show --stat` of it):

- `FORMAT_VERSION` (`app/src/model/defaults.ts`), the literal `version` of `Project`
  (`model/types.ts`) and of its schema (`z.literal`, `model/schema.ts`), and a step in `MIGRATIONS`
  (`model/io.ts`) from the version before: one that changes nothing when the new field is optional.
- A test of that step next to the model's (`app/src/model/__tests__/crossLine.test.ts` is the
  pattern): a file of the version before opens, says where it came from (`migratedFrom`) and is
  written as a file of the current one. A step that transforms starts from a file written out by
  hand, not from one today's builders made.
- **Every example of `EXAMPLE_FILES`** (`app/src/test/examples.ts`) is rewritten in the new
  version: `io.test.ts` asks each to be a file of the current format that is written back
  unchanged. A file of `examples/` that is not in that list is the owner's, and stays as it is.
- The tests with the number written in them: the About dialog (`app/e2e/app.spec.ts`),
  `app/e2e/paletteLibrary.spec.ts`, `app/e2e/principalAndColorIds.spec.ts`,
  `app/src/ui/project/__tests__/paletteDocuments.test.ts` and the migration tests of the bumps
  before (`grep -rn 'version.*\b<old>\b' app/src app/e2e` finds all but the About dialog's).
- `docs/FORMAT.md` in four places: its title, the `version` row of *Top level*, the manifest
  version of the portable package, and a new row of *Versioning* (what was added; what the
  migration does); `app/src/model/__tests__/formatDoc.test.ts` reads all four.
- Not `PACKAGE_VERSION` (`app/src/media/package.ts`): it is the package's own, and moves when the
  layout of the package does.

## 2. Implement and test

- Unit tests sit next to the code in `__tests__/` (Vitest; Node for pure logic, jsdom for DOM).
  The default run includes required `*.native.test.ts` integration and fails for missing tools.
  `npm run test:unit` is an explicit development selection, not the full verification gate.
  End-to-end specs are in
  `app/e2e/*.spec.ts` (Playwright on the system Chrome); reuse the helpers in `app/e2e/*Helpers.ts`
  and the dev handle `window.__mfe` (`app/src/devtools.ts`) to load projects and read state.
  A spec takes `test` and `expect` from `./test` (not from `@playwright/test`) and presses
  `ControlOrMeta`, never `Control`: the suite runs on macOS too, where the command key is ⌘ and a
  Ctrl+click opens a menu. A unit test reads the specs for both.
- Anything a user sees or does gets an e2e test; pure logic gets unit tests.
- A bug fix starts with a test that fails for the right reason; then fix it.
- The whole generated Python is pinned in `app/src/export/codegen/__tests__/__snapshots__/python/`
  (`pinned.test.ts`): a refactor leaves it unchanged; a change meant to alter it updates the files
  with `npx vitest run -u` and the diff goes in the commit; `npm test` never writes one (a new case
  fails until its file is written that way, and so does a pinned file that went missing). The
  real-Manim check is `npm run export-check` (slow, needs the venvs: run it when codegen changes).
- New interactive elements get a `data-testid`, and keep the existing ones: e2e specs rely on them.

### What an e2e test asserts

A spec proves what it reads back, so what it reads must not come from the code under test:

- **The action goes through the control**: a click, a drag, a key with the focus where the user
  would have it. A state set through `window.__mfe` is a fixture, not the action. When the spec
  needs to read something the handle does not give, extend the handle (`app/src/devtools.ts`) and
  its type (`MfeHandle`, `app/e2e/helpers.ts`).
- **The result is the project, and what is on screen**: the field that was written, and beside it
  what must not have moved. Then Undo and Redo, when "one step" is part of the claim.
- **A glyph is named by where it is in the source** (a fixed occurrence, a known box), not by an
  index that the helper under test worked out: that would compare the code with itself.
- **A file is proved by opening it again**: a notice or a download event says that something was
  written, not what. Parse the bytes, or load them back, and compare.
- **Who takes a key is proved with a real competitor**: focus the field, the menu or the timeline
  that could take it too and press the key there. A test of the function that maps keys does not
  see the order of the listeners.
- **A command fired during a drag** is compared with the same command with no drag held: the drag
  is given up, and what is left is what the command leaves alone (`e2e/historyCommands.spec.ts`).

A new spec has no time in `app/e2e/durations.json` and runs in the first band until a whole run
records one.

### A change to the generated Python

- A helper the scene needs (`_cross_line`, `_Tween`…) is registered in four places of
  `app/src/export/codegen/`: the `Helper` union (`context.ts`), its Python (`helpers.ts`), its
  inclusion (`assemble.ts`) and its name in `EMITTED_SYMBOLS` (`symbols.ts`), which keeps the names
  of the user's objects off it.
- A new case goes in `tests/export/projects.ts` (`syntheticCases`), **last**. One case is two
  things: a pinned Python (`pinned.test.ts`) and a scene `npm run export-check` renders with real
  ManimCE and ManimGL. The pins build every case under one sequence of ids, so a case added in the
  middle renames the objects of all the cases after it.
- Read the new pins as Python before committing them. `MFE_EXPORT_ONLY=<part of a case's name>
  npm run export-check` renders one case in seconds while iterating; the whole check runs once.

## 3. Look at it

For anything visible, take screenshots and look at them, in both themes:

```bash
node .claude/skills/mfe-change/shot.mjs --project examples/hello.mfe.json \
  --target panel-timeline --size 1440x900,1280x800 --out <dir>
```

It starts a dev server on port 5199 when none is running (and stops it), loads the project
through `window.__mfe`, switches the theme and writes `<name>-<theme>-<W>x<H>.png`. For
interactions before the capture (select a clip, open a dialog, hover), pass `--steps steps.mjs`
with `export default async (page, { theme }) => { … }`; the file header lists every option. Check
narrow (1280×800) and wide (1920×1080) sizes when the layout is tight.

## 4. Verify

```bash
.claude/skills/mfe-change/verify.sh            # everything (about 8 minutes; more on a laptop)
.claude/skills/mfe-change/verify.sh --static   # tsc + eslint + prettier only, while iterating
```

It runs `tsc -b` (which also type-checks the e2e specs; Playwright does not), eslint and Prettier on
the changed files, the full Vitest suite and the full Playwright suite (under `nice`, 2 workers, or
`MFE_E2E_WORKERS` of them: faster and hotter), then builds the app and opens `dist/index.html` from
`file://` (`npm run dist-check`), and prints one line per step. The e2e suite runs its slowest
specs first (`app/e2e/durations.json`: `MFE_E2E_RECORD=1 npx playwright test` on a whole run records
the times again, worth doing when specs were added or changed much) and, on a Mac, waits 120 s
every 200 tests so that a machine without a fan cools (`MFE_E2E_COOL_EVERY=0` for none; the summary
counts the pauses). A MacBook Air M1 took 17 minutes for the e2e suite alone, with 2 workers and
before its pauses. When something under `companion/` changed since the last commit it also runs the
companion's own tests, after Vitest (several minutes more; `--companion` runs them anyway). Every
step must be green before committing; a flaky e2e test is re-run alone and reported, not ignored. On
Windows the script runs in Git Bash (the companion's tests then start with `python`, or with the
Python `MFE_PYTHON` names), and where this file writes `python3` the command there is `python`.

### What else to run, by what changed

`verify.sh` covers the web app (types, lint, unit, e2e and the build opened from disk) and, when
`companion/` changed, the companion's tests. It does not render with Manim or run the parity
harness, so a green `verify.sh` says nothing about those. Add what the change touches:

| The change touches | Besides `verify.sh` |
|---|---|
| UI, stores, model, engine (`app/src/`) | nothing more (screenshots, §3) |
| `app/src/export/codegen/` (`index.ts`, `helpers.ts`, `python.ts`, …) | the pins (`pinned.test.ts`; `npx vitest run -u` when the Python is meant to change, with the diff in the commit) and `npm run export-check` (real ManimCE and ManimGL, about 5 minutes) |
| glyph matching, MathJax, the LaTeX backend (`app/src/engine/`), `tests/parity/` | `npm run parity` (needs both venvs; `PARITY: INCOMPLETE` is not green) |
| `companion/` | nothing more while the change is uncommitted: `verify.sh` then runs `python3 -m unittest discover -s companion/tests` itself (once committed, `verify.sh --companion`); read how many tests its line says were skipped. `docs/COMPANION.md` for a protocol change |
| the Vite config, `index.html`, anything the single-file build relies on | nothing more: the last step of `verify.sh` builds the app and opens `app/dist/index.html` from `file://` (the e2e suite drives the dev server, not the bundle) |
| the harnesses themselves (`tests/export/`, `tests/parity/`, `verify.sh`) | the harness once, with a deliberate failure when the change is about failing |

## 5. Documentation

- User-visible behaviour → `README.md`; module contracts and data flow → the file of
  `docs/architecture/` that `docs/ARCHITECTURE.md`, the index, names for them (a new subsection or
  file gets its row there); file format → `docs/FORMAT.md`; companion protocol →
  `docs/COMPANION.md`.
- The docs are hard-wrapped at 100 columns with hand-made tables: **never run Prettier on them**.
  To change words inside a wrapped paragraph without re-wrapping all of it:

  ```bash
  python3 .claude/skills/mfe-change/reflow.py docs/architecture/05a-time-model.md \
    'old words' 'new words'
  ```

  Then check `git diff`.

## 6. Commit

- Stage only the files you changed: `git add <paths>`. Never `git add -A` or `git add .`: the
  owner edits files in this tree too, and untracked files you did not create are not yours.
- Subject `Area: what changed, as a sentence` (look at `git log --oneline`), at most about 72
  characters; a body when the reason is not obvious. End with the attribution lines the session
  asks for.
- Documentation of a feature can be its own `Docs: …` commit right after it.

## The other systems

The app and its suites run on Linux, macOS and Windows. A change is made on Linux; the other two run
it later, and a fault found there costs a round on another machine. What the two ports found, to
foresee while writing a change (`CLAUDE.md` has the rules the tests of the build enforce):

- **Code for one system takes the system as a parameter** (`app/build/python.ts`, the companion's
  `_clean_env(…, windows=…)`), so that its test runs on Linux. A test that plays another system is
  worth what it catches: take the fix out and see it fail.
- **Programs.** Windows has no `python3`, no `nice`, no process groups, no `SIGHUP` and no
  `O_NOFOLLOW`; `kill()` ends one process there, at once, its children alive and nothing cleaned up.
  Starting a program takes tenths of a second there: a test does not race a real start with a short
  sleep, it waits for what it reads.
- **Files.** Windows removes no file that is open and no folder that is the current one of a
  process: close the file, leave the folder and end the children first. Its temporary folder can
  have a short name with a `~` in it (`os.path.realpath`), and a symbolic link needs a privilege. A
  Mac's disk does not tell two names that differ by case.
- **Text.** On Windows a tool ends its lines with CR LF (dvisvgm, any text stream): bytes are
  compared on streams opened with `newline="\n"`, a pattern accepts `\r?\n`, a file a tool wrote is
  read as bytes. Python reads and writes in the code page of the system unless it is told
  `encoding="utf-8"`.
- **Paths.** From `fileURLToPath` and `path.join`, never from the pathname of a URL; `\` is turned
  into `/` before a path is compared or shown.
- **The browser.** The system's font differs (Segoe UI, San Francisco): a test does not depend on
  the width of a text or of a menu. Chrome encodes AAC on macOS and on Windows and not on Linux,
  each encoder with a lead-in of its own: a test of sound holds on the three. The command key is ⌘
  on a Mac (`ControlOrMeta`), where a Ctrl+click is the secondary click: its press is of the main
  button with Ctrl held, so a press asks `isMainClick` (`ui/pointer.ts`), and a spec shows it with
  the browser dressed as a Mac and the events sent as a Mac sends them
  (`e2e/macSecondaryClick.spec.ts`). Node has a `navigator` too, with the platform of the machine: a
  unit test states the platform it means.
- **The keys of a Mac.** A text of the interface that names a key is written once, as the README
  writes keys ("Ctrl/⌘+Shift+Z", "Alt + drag", "Shift: a range"), and shown through `keysText`
  (`ui/platform.ts`), which writes it as a Mac's menus do there ("⇧⌘Z", "⌥ + drag"); of its own
  words only: a builder that puts a name of the user's in its text takes the system as a parameter
  (`lineDrawHint`). What a screen reader is given goes through `keysSpoken`. A spec that reads such
  a text writes both out (`onSystem`, `e2e/helpers.ts`). A shortcut whose keys are others on a Mac
  (the system has taken them: ⌘+Space, ⌥⌘H; or every app there has another: ⇧⌘S is Save As) is
  read in `commandForKey` by its `mac`, says so in its row of the sheet (`mac`,
  `ui/help/shortcutSheet.ts`) and in the README's table under "On macOS", which a unit test
  compares; a spec presses the keys of the system it runs on (`SAVE_AS_KEYS`, `LIST_TOGGLE_KEYS`),
  and the Control key itself, for a key that is Control on a Mac too, by its one name
  (`CONTROL_ITSELF`). A Mac's trackpad zooms with a pinch, a wheel with Ctrl and no Control key
  down, and moves a view with a scroll, a wheel alone (`ui/pinch.ts`, `e2e/macTrackpad.spec.ts`).
- **A spec while it is loaded** is run by the runner and by every worker: it writes nothing to the
  disk there (`e2eConventions.test.ts`).

## Known traps

- zsh: quote globs (`grep -rn --include='*.ts'`); a "no matches found" error looks like an
  empty search.
- Stopping a dev server by pattern: `pkill -f "[v]ite --port 5199"`. Without the brackets the
  pattern matches the shell running pkill and kills it.
- Python string edits after Prettier ran: re-read the file first, Prettier reflows code.
- jsdom reports colours as `rgb(…)`, not hex.
- `model/__tests__/fixtures.ts` contains pure builders usable in Node or jsdom. The example-file
  reader is separate in `test/examples.ts`; files using it must run in Node
  (`// @vitest-environment node`) to avoid denied file URL imports under jsdom.
- Synthetic projects get random ids, and events at the same time are ordered by id: when the
  output must be stable (snapshots), build them under `setIdGenerator(sequentialIds())`
  (`sequentialIds` is a helper of the tests, `app/src/test/sequentialIds.ts`).
- Playwright `click()` scrolls the element into view; to test that something is reachable
  without scrolling, use `document.elementFromPoint` and `page.mouse`.
- Full suites heat the machine: run them once per change, not in parallel with other heavy jobs.
- Don't edit files while `verify.sh` runs: the dev server under the e2e suite reloads the page
  and a spec fails with "Execution context was destroyed".
- `:focus-visible` cannot tell "reached with Tab" from "clicked, then a key": Chrome turns it on
  at the first key press on the focused element. Use `ui/focusOrigin.ts` instead.
- React's StrictMode runs `useState` initializers twice in development: something they report
  (a notice) must be reported once.
- `pkill -f "[v]itest …"` also kills the shell running it when the same text appears later in
  that command line (the brackets only hide the pkill itself): run the pkill in a command of its
  own.
- A synchronous endless loop in a unit test ignores `--testTimeout` (it only interrupts awaits)
  and hangs the Vitest worker: fix first, then add the regression test.
- `reflow.py` wraps again from the line it changed until the words fall on the old line breaks,
  which may be at the end of the paragraph, and it breaks lines at spaces, inside a code span too:
  read the diff. For a few words in a long paragraph, edit by hand and wrap only the lines that
  grew.
- A test of a panel's field with a drag held: type the value, begin the gesture and write through
  it, then press Enter. `history.beginGesture()` gives the handle; the field reads the project the
  gesture shows, which is the case to cover.
