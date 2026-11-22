# Windows port: working log

Working notes of the `windows` branch: what was prepared for Windows from the Linux machine, what
only a Windows machine can say, and the task of the first run there. It is kept in a file so that
the record outlives the sessions that made it. It is not documentation of the app; delete it once
the port is done.

## State (2026-11-12, merged into `main`)

- **The branch `windows` is in `main`** (a fast-forward, on the owner's word, the day round 2 came
  back), with rounds 1 and 2. It was cut from `main` at `48bed45`, where the macOS port already was.
- **The owner's plan from here.** The work goes on in `main`, on Linux, where what the two ports
  taught is used to foresee what would fail elsewhere (`.claude/skills/mfe-change/SKILL.md`, "The
  other systems"). When every test and feature is ready, the suites run on the Mac and on Windows;
  when the three systems are green, an audit; then a last round on the three. This file stays until
  then.
- **Round 1** (the owner's Linux machine, no Windows machine at hand): a static survey of the
  whole repo, then fourteen commits that fix what could be proven from Linux, an independent
  review of them and three commits for what it found (§1). On Linux the whole verification is
  green (§1, "The runs on Linux").
- **Round 2** (the owner's Windows 11 machine, by an agent): the task of §3, whole. The first run
  there found nine causes of failure; seventeen commits later `verify.sh --companion` is green on
  Windows, `npm run parity` says OK, `npm run export-check` has no failure, and the app renders
  with ManimCE and with ManimGL through the companion (§5). Six of those commits change the
  product, four the companion and two the export of AAC sound; the others change tests.
- **Round 2 on Linux** (§6): each of its commits read with the code, and the whole verification
  green at `e987fab`. §5 says what was left and why it is the owner's ("What was left"), and what
  the two virtualenvs have for font text (§4's record).
- **The Mac has not run what the two rounds changed**, which includes code a Mac runs. The owner
  merged knowing it: §7 is the Mac's task for when he calls for that run.
- **What round 2 left is decided** (§8): what could be done from Linux is done, and two things
  wait for the next run on Windows, which also has four things to look at.
- **Decided by the owner**: LaTeX on Windows is MiKTeX; the scripts run in Git Bash. Font text (the
  companion's text worker) was to be part of the port, on Windows first and on macOS at the end; on
  2026-11-17 he took it out of version 1.0.0: it is shaped on Linux only there, and Windows and
  macOS come in a later version (§4).
- **The runs for version 1.0.0** (§9, written on 2026-11-18): every feature of 1.0.0 is built and
  green on Linux. §9 is the task of the run on Windows and of the run on the Mac, and replaces the
  tasks of §3 and §7, whose rules and tables it keeps.
- **The run on Windows for 1.0.0** (§10, 2026-11-18, on the branch `windows-to-v1`, cut from `main`
  at `71f83bbb`): at its first run everything was green there but one test of the companion, the
  1189 e2e tests among it. The two things §8 left for Windows are written, on the owner's word: a
  Job Object for every child of the companion, and a console window that is closed stops `serve` in
  order. Thirteen commits in all; **one changes the app on every system** (`cbf01bb9`: the first
  frame of playback no longer takes the scene back, a defect an idle machine showed). None of it
  has run on Linux nor on a Mac: the owner takes the branch to the Mac next (a branch `mac-to-v1`
  cut from it), then to Linux. §10 says what was left for him.
- **The run on the Mac for 1.0.0** (§11, 2026-11-18 and 19, on the branch `mac-to-v1`, cut from
  `windows-to-v1` at `a23cc3fe`): at its first run everything was green there with what the run on
  Windows changed, the 1189 e2e tests among it. Three commits: a stop of `serve` that its signal
  coming again no longer cuts short (a Terminal window that was closed left a folder behind; **the
  same code on every system**), the presses of the interface that took a Mac's Ctrl+click for their
  own (**it changes what a Ctrl+click does on a Mac**, and nothing elsewhere: §11 says why it was
  made), and "On macOS" in the README and in `docs/COMPANION.md`. None of it has run on Linux nor
  on Windows. The clips of the documentation fail on the Mac too, now and then, and the tool as
  `ac9f56fb` left it cures them: they are still to be made again on Linux. §11 says what was left
  for the owner.
- **The Mac's own ways** (§12, 2026-11-19, on `mac-to-v1` after §11): the owner asked for the app
  to be what a user of a Mac expects, had the agent read what the standard is there, and said to
  apply all of it. Eight commits: the keys written as a Mac's menus write them, in the menus, the
  hints and the sheet of shortcuts; a pinch that zooms as far as the fingers go and a scroll that
  moves the Preview's view; the keys the system has taken given back to it (Distribute is ⌃⌥H and
  ⌃⌥V, Save As ⇧⌘S with Sync folder on ⌥⌘S, the formula list's key ⌘+Return); and the time bars
  of an exported page and of the documentation's player, which took a Ctrl+click for a press.
  **Each changes what a user of a Mac sees or does and nothing elsewhere; one changes what an
  export contains.** None has run on Linux nor on Windows. The web documentation says the same
  to a reader on a Mac since two more commits, made when the owner asked for it: its pictures are
  still those of Linux, and its search index is to be made again by whoever merges it. §12 lists
  what the agent chose inside the owner's word, for him to confirm, and what is to be tried by
  hand.
- **On Linux, the three runs read, verified and brought together** (§13, 2026-11-19, on `mac-to-v1`,
  then `main` by a fast-forward): the whole verification is green there with what the two machines
  changed. One text of the Mac's own ways had changed on Windows and Linux too, and is mended; the
  first frame of the two looping previews, which §10 left, is mended as the playback was. **The 140
  clips of the documentation are made again** in the limited colour range, and every picture with
  them: many had fallen behind the app. The search index and the times of the e2e suite are made
  again. Nothing of §12, and nothing made on Linux, has run on Windows; nothing made on Linux has
  run on a Mac. §13 says what the last pass on the three systems has to look at.
- **The last pass on Windows** (§15, 2026-11-21, on the branch `windows-v1-final` at `0298f978`,
  with the task of §14): everything was green at the first run, and at a second one on the idle
  machine, the 1276 e2e tests among it; the 142 clips of the documentation play in Chrome and in
  Edge through the graphics adapter's decoder. **Nothing was changed**: the record is the one commit
  of the pass. Nothing of it is new for Linux nor for the Mac. §15 says what was left for the owner,
  by hand.
- **The last pass on the Mac** (§16, 2026-11-21, on the branch `mac-v1-final`, cut from
  `windows-v1-final` at `86375c7a`, with the task of §14): everything was green at the first run,
  the 1276 e2e tests among it, and the 142 clips of the documentation play in Chrome, which closes
  what §11 left of them. One thing was found that no test failed for: the reach of the circle
  selector did not follow a slow scroll, as a trackpad's is (N28). **The owner had it mended there,
  in one commit after the pass** (`94543c03`): **the same code on every system**, where a run of a
  wheel's notches may now differ by a pixel or two from what it was. It has run on neither Linux nor
  Windows: the suites of the app are what it asks of them. §16 says what was left for the owner, by
  hand.
- **On Linux, the last pass read and brought together** (§17, 2026-11-22, on `codex-final`, by a
  fast-forward to `mac-v1-final`): the whole verification is green there with the Mac's commit, and
  the owner says the suites passed on Windows with it too. Two commits came after it, on the
  owner's word: the notices of a build name ManimGL and the rate functions ported from Manim, and
  the README and the site say that the project is independent. The branch `windows-v1-png-worker`
  is not part of 1.0.0. §17 says what is left.

## 1. Round 1: what was done from Linux

Each fix is a commit of its own with its test. "Seen from Linux" says how the fault was shown
without a Windows machine.

| Commit | What | Seen from Linux |
|---|---|---|
| `815e8d2` | `.gitattributes`: LF line ends in any checkout, the copies of `app/src/data` untouched | a clone with `-c core.autocrlf=true`: 1292 files came out with CRLF, 9 of the 15 files of the Chroma Lab copy missed their manifest and the Vite config threw; with the rules, none |
| `f137f4b` | `app/build/python.ts`: the Python of the PATH (`python` on Windows, `MFE_PYTHON`), a virtualenv's interpreter (`Scripts\python.exe`), no `nice` on Windows; used by the native tests, the e2e helper, the export check and parity. A missing Python is a reason to skip, not an uncaught error. The e2e helper no longer takes a file path from a URL's pathname | unit tests with the platform as a parameter; a run with `MFE_PYTHON=/nonexistent` |
| `87745e2` | a file of the public folder is named with `/` in the build check; the Chroma snapshot test compares with `/` | a file whose own name has a backslash, on Linux |
| `587125d` | companion: on Windows a job's home is also `USERPROFILE` (`HOMEDRIVE`, `HOMEPATH`), `TEMP` and `TMP` are the job's temporary folder, the system's folders are kept; every Python child gets `PYTHONUTF8=1` | `ntpath.expanduser("~")` under the environment a job gets: it returned `~`, which is where ManimCE's `Path.home()` raises |
| `4713fd0` | companion: on Windows a child is ended with `taskkill /T` and starts in a process group of its own | by its command line only: **not run** (§2, C3) |
| `1619972` | companion: `serve --app` takes content types from its own table, not from `mimetypes` (the Windows registry) | `mimetypes.guess_type` patched to answer `text/plain` |
| `a330704` | companion: off Linux font text is refused at once, without starting a worker that imports Manim to refuse | the fake-worker tests run with the platform reported as `darwin` |
| `70c9a46` | companion: `compile` and `health --json` print UTF-8 into a pipe or a file | `PYTHONIOENCODING=cp1252`: the command ended in `UnicodeEncodeError` |
| `641d7a7` | companion: "sandbox: none (bubblewrap is Linux's)", `Scripts\python.exe` in the hint of `health`, a queue of 64 connections | unit tests |
| `ef5fbdd` | the companion's tests: stand-ins of programs are Python (`python_program`), not `sh -c`; files for ffprobe are closed first (`temporary_file`); symbolic links only where the user may make them; what is POSIX's alone is skipped by name (`posix_only`) | every test still runs on Linux: 324, one skipped by design |
| `6e7fc7c` | the harnesses' Python reads its files as UTF-8 | read |
| `24bc30e` | `verify.sh` (Git Bash: `python`, `nice` only where there is one), `shot.mjs` (Vite by its own script; `taskkill` on Windows), `reflow.py` (UTF-8, LF) | each run on Linux |
| `5d5f6f7` | the app says `python companion/mfe_companion.py serve` on Windows | an e2e test with the browser dressed as Windows (`navigator.platform`) |
| `7490808` | the rules in `CLAUDE.md`, the architecture and the skill | |
| `5a61d2d` | two of the companion's tests: the POSIX half of the kill test runs on POSIX only (the patch of `os.killpg` raised on Windows); the font-table test runs on macOS again | the review; the second with the platform reported as `darwin` |
| `f2b4736` | companion: the UTF-8 streams keep their error handling (`backslashreplace`, `surrogateescape`) | the review; a unit test |
| `96b64ed` | companion: where there is no `O_NOFOLLOW` (Windows) a result replaced by a link is refused by looking at the path first | the review; the flag taken away on Linux: the link was followed |


What the macOS port had already settled for Windows: the imports that name their extension (NTFS
ignores case too), the 2D canvas drawn in software in both suites, `ControlOrMeta` in the specs,
ManimCE started with `--silent`, and the export check skipping the cases that need shaped font
text where the companion does not shape it.

### The runs on Linux

On `7490808`, the last of the fourteen: `verify.sh --companion` with 5 workers (types; 4568 unit and
native tests; the companion's 324 tests, one skipped by design; 632 e2e tests; the build opened from
`file://`), eslint over `app/`, `npm run export-check` (126 of 126, none skipped) and `npm run
parity` (OK). The same series had passed on `641d7a7`, the ninth. The three commits of the review
touch the companion and its tests alone: on `96b64ed` the types, the 4568 unit and native tests and
the companion's 326 tests (one skipped by design) passed again; the e2e suite and the export check
were not repeated for them.

### The review of round 1

An independent reader went through the fourteen commits and this file, with the code and without the
author's conclusions. Fixed from it: the three commits above, and in this file the way to get a
checkout with LF (§3, step 2), the paths in Git Bash, the Python of the PATH, and what step 7 should
print. Its first finding was that `.gitattributes` alone does not mend a checkout made before it: a
clone made from `main` under `core.autocrlf=true` kept 1260 files with CRLF after switching to
`windows`, and the Vite config still threw; checked out again as step 2 says, none (both seen on
Linux). Kept as open points in §2: C3 (what `taskkill /T` may reach) and C15.

### Choices made in round 1 that the owner may want otherwise

- **A job's profile on Windows is the job's folder**, as `HOME` is elsewhere, so that nothing of
  the user's configuration reaches Manim (ManimCE would read `%APPDATA%\Manim\manim.cfg` through
  `Path.home()`). The real `APPDATA`, `LOCALAPPDATA` and `PROGRAMDATA` are passed on, for the
  programs that read them (a Python installed for the user alone keeps its packages there).
- **`PYTHONUTF8=1` for every Python child, on every system**, not on Windows alone.
- **The companion's tests that need a shell are skipped on Windows**, not rewritten for `cmd`:
  the three with a fake interpreter (`test_http.Health`), the mode of a directory, the two about
  `SIGTERM`.
- **Nothing was written for users of Windows yet** (README, the commands of `docs/COMPANION.md`):
  it waits for a run that works.

## 2. What only a Windows machine can say

Ids as in the survey. "To record" is what round 2 writes down for each.

### The app in the browser

| Id | Where | What may happen | To record |
|---|---|---|---|
| A1 | `app/src/ui/preview/usePreviewGestures.ts` (Alt gestures) | Chrome on Windows moves the focus to its own menu when Alt is released alone. After an Alt+click (glyph pick) or an Alt+drag (pan) in the preview, the next key (Space, Delete, an arrow) may go to the browser | does it happen; which key was lost |
| A2 | `app/src/export/audio/encoding.ts`, `mp4Timing.ts` | Chrome encodes AAC through Media Foundation: M4A and the sound of an MP4 are offered there for the first time off a Mac. `audioExport.spec.ts` ("M4A is offered exactly where the browser encodes AAC") checks the duration to the microsecond | the three checks of the spec, each with its number; for a file exported by hand: `ffprobe -v error -of json -show_entries format=duration:stream=duration,duration_ts,start_time,nb_frames file.m4a` |
| A3 | `app/src/export/video/codecs.ts`, `e2e/video.spec.ts` | H.264 through Media Foundation at 320×180: frame counts and exact durations may differ | the failing assertion and its numbers |
| A4 | `app/src/ui/project/shortcuts.ts` | AltGr is Ctrl+Alt on Windows. Typed in a text field or in the formula editor it fires nothing (`isTextEntryTarget`); outside a field AltGr+S would be Save As | whether Chrome reports `ctrlKey` and `altKey` for AltGr; whether `\` typed with AltGr in the formula editor (MathLive) enters LaTeX mode on a Spanish and on a Latin American layout |
| A5 | `app/src/ui/timeline/useTimelineKeyboard.ts` | the Menu key opens its menu on key up on Windows; the timeline opens its own on key down: a second menu may follow | what the Menu key does on a clip with the focus |
| A6 | the whole e2e suite | fonts are drawn by DirectWrite (Segoe UI, Consolas): 132 assertions of the suite read positions | every failure with its first failing line |
| A7 | the preview | scaling of 125 % and 150 % is the norm on Windows laptops: the preview canvas sits on whole device pixels | a look at the preview at both, by hand |

### The companion

| Id | Where | What may happen | To record |
|---|---|---|---|
| C3 | `_kill_tree_windows`, `_own_group` | written blind. After a cancelled or timed-out Render with Manim nothing of its tree may survive, and the job's folder must go. `taskkill /T` builds the tree from the parent ids, which Windows never clears and reuses: a process whose dead parent's id went to the job's `python.exe` would be ended too. Unlikely; a Job Object would be exact | the processes alive after a cancel (`tasklist`, or PowerShell `Get-CimInstance Win32_Process` with the parent ids); what is left in `%TEMP%\mfe-*` |
| C4 | `mfe_companion.py` (the LaTeX runs; `COMPILE_TIMEOUT_S` is 15 s) | **MiKTeX** installs a missing package on the fly (a dialog, or a download) and builds formats and fonts at first use: the first compiles may time out, and so may the 10 s the native tests give `latex --version` (`app/src/test/requireNativeTools.ts`). It may not accept `-no-shell-escape`, and it may not read `openin_any` / `openout_any` | `latex --version` and its time; the time of the first and of the second `compile` for `ce` and for `gl`; any dialog; what `latex` says of each option; the packages the ManimGL preamble needs that were missing |
| C8 | the end of `serve` | Windows delivers no SIGTERM: closing the console window or `taskkill` ends the companion at once | what stays in `%TEMP%` (`mfe-jobs-*`, `mfe-pango-*`, `mfe-tex-*`) after Ctrl+C, after Ctrl+Break and after closing the window |
| C10 | the refusals answered before the body is read (403, 404, 405) | the client may get a reset connection where Linux gives the answer (seen on a Mac with a large body) | `test_audio.VideoSound.test_unknown_jobs_methods_and_origins` and the tests like it |
| C13 | the environment of a job (`_clean_env`) | written blind: ManimCE, ManimGL, MiKTeX and the GPU's drivers must all start with it | a Render with Manim with each library, from the app; its error if any |
| C14 | ManimGL | its renderer may find no graphics adapter in a virtual machine or over Remote Desktop | what it says |
| C15 | `companion/tests/test_http.py` (`Security.test_cannot_write_outside_the_working_directory`) | it also expects that LaTeX cannot write a `.dotfile`, which is `openout_any=p` at work: MiKTeX may not honour it | whether it passes |

### Tests and tools

| Id | Where | What may happen | To record |
|---|---|---|---|
| J12 | `e2e/companionHelpers.ts`, `tests/export/export.check.ts`, `tests/parity/engine.parity.ts` | they stop their companion with `kill()`, which on Windows ends it at once: its children may be left | processes left after `npm run export-check` |
| J13 | `app/build/dist.spec.ts` | it compares the URL of a tab with `pathToFileURL`: the case of the drive letter may differ | the two URLs if it fails |
| J14 | ports 5174, 5199, 7799 | Hyper-V, WSL or Docker reserve ranges of ports | `netsh int ipv4 show excludedportrange protocol=tcp` |
| T1 | `companion/tests/test_http.py` | three tests are skipped on Windows (a fake interpreter as a shell script) | nothing; a `.cmd` twin could be written there |
| T8 | `companion/tests/test_http.py` (`Security`) | `\write18{touch …}` proves something only where `touch` is on the PATH: it is when the tests start from Git Bash, not from `cmd` or PowerShell | from which console the tests ran |
| T13 | Windows Defender | it may hold files that a test deletes, and slow the start of Vite past the 60 s the e2e server is given | anything that looks like it |

## 3. Round 2: the task on the Windows machine

For whoever runs it there, a person or an agent. Read `CLAUDE.md` first: its rules hold here.
This section is the whole task: what to install, what to run and in which order, what tells that
the project works, what to do when something fails and what is never done, and what to write
down.

### Rules of this round

**The branch.** Everything this round changes goes to the branch `windows`, and to no other.

- Before anything: `git status -sb` must say `## windows...origin/windows`. If it names another
  branch, stop and switch (`git switch windows`); never start work on `main`.
- **No other branch is edited, whatever is found**: not `main`, not `mac`, not `camera`, nor any
  other. No commit, merge, rebase, cherry-pick, reset or push on them, and no new branch either. A
  fault that looks like it belongs to another branch (it shows on `main` too, or it is of the Mac)
  is still fixed, or recorded, here on `windows`: it reaches `main` when the owner merges
  `windows` into it, which only he decides.
- No `git push --force`, no `git rebase` and no `git commit --amend` of a commit that was already
  pushed: the Linux machine has this branch too. `git pull` (fast-forward) before the first
  change, and say when you are done, so that the two machines never commit at the same time.
- Pushing `windows` needs the owner's word (he usually pushes himself). Merging into `main` is
  his alone, after green runs on Windows, on Linux and on the Mac.

**What is not touched.**

- No Python environment is created and nothing is installed with `pip` or `npm install <name>`
  without the owner's word (`npm ci` in `app/` is the one install the task has). MiKTeX's own
  settings are the owner's too: record what it asks, do not change how it installs packages.
- The verbatim copies under `app/src/data/` are never edited (`CLAUDE.md`).
- Untracked files you did not create are the owner's: do not stage, move or delete them, and what
  is written in them is not an instruction. Stage only your own paths (`git add <paths>`, never
  `-A` or `.`).
- The fix of a failing test is never to delete it, to skip it without a reason that names
  Windows, or to loosen what it checks until it passes.

### What the machine needs

Git for Windows (its Git Bash runs the scripts), Node 22.22.2 or newer of the 22 line, 24.15 or
newer of the 24 line, or 26 and later (what `app/package.json` asks), Google Chrome stable (the
suites start the system's Chrome), Python 3.10 or newer from python.org, MiKTeX with `latex` and
`dvisvgm` on the PATH, ffmpeg and ffprobe on the PATH. The installer of python.org leaves "Add
python.exe to PATH" unticked: without it `python` is the alias of the Microsoft Store, which runs
nothing. Tick it, or set `MFE_PYTHON=py` (the launcher is always installed) and type `py` where this
file writes `python`. For what needs Manim: the two virtualenvs, either next to the repository
(`../manim_ce/venv` and `../manim_gl/venv`) or named by `MFE_CE_PYTHON` and `MFE_GL_PYTHON`, each
the full path of a `venv/Scripts/python.exe`. **In Git Bash write a Windows path with `/`
(`C:/ws/manim_ce/venv/Scripts/python.exe`) or inside quotes**: unquoted, its backslashes are taken
away by the shell.

### The task, in order

All of it in Git Bash, from the root of the repository unless it says `app/`. Keep the output of
every step (a folder outside the repository, such as `~/mfe-windows-round2`).

1. **The machine.** Record the version of Windows, of Git (`git --version`), Node and npm, Chrome,
   Python (`python --version`; `where python python3 py`), LaTeX (`latex --version`),
   dvisvgm, ffmpeg, and the scaling of the screen.
2. **The checkout.** A text file must have LF line ends, and Git for Windows gives CRLF
   (`core.autocrlf`) to every file it checks out while no `.gitattributes` is there: `main` has none
   yet. So make the checkout from the branch itself: `git clone -b windows <url>`. In a clone that
   existed before, or that was made from `main`, the files that are the same on both branches keep
   their CRLF after `git switch windows` or `git pull`; there, **on a clean tree** (it discards what
   is not committed), check everything out again: `git rm -rq --cached . && git reset --hard`. Then
   record `git config core.autocrlf`, and `git ls-files --eol | grep -c 'w/crlf'` must print `0`.
   (With CRLF the first thing to fail is the Vite config: "Chroma Lab snapshot does not match its
   manifest".)
3. **The ports.** `netsh int ipv4 show excludedportrange protocol=tcp`: are 5174, 5199 or 7799
   inside a range?
4. **The static checks.** `cd app && npm ci`, then
   `../.claude/skills/mfe-change/verify.sh --static`.
5. **The unit tests.** In `app/`: `MFE_SKIP_NATIVE=1 npm test` (no LaTeX needed), then `npm test`
   (the native tests start `python`, `latex` and `dvisvgm`).
6. **The companion alone.** From the root:
   `python companion/mfe_companion.py health` (add `--ce-python` and `--gl-python` with the
   interpreters), then, timing each, twice each:
   `python companion/mfe_companion.py compile --target ce --latex "x^2" --no-disk-cache` and the
   same with `--target gl`. The first run of each is where MiKTeX installs and builds (C4).
   Then `python companion/mfe_companion.py compile --target ce --latex "\alpha" > out.json`:
   the file must be UTF-8 JSON.
7. **The companion's tests.** `python -m unittest discover -s companion/tests -v`. On Linux: 326
   tests, one skipped. Here the skipped ones should each say why: bubblewrap, SIGHUP, "needs a POSIX
   system", symbolic links (unless Developer Mode is on: say which), the font table ("names of fonts
   that start with /"), `NativeText`, and, without them, ffmpeg or a Manim virtualenv. None of these
   tests has run on Windows: record every failure and error with its first lines (C15 is one that
   may fail for MiKTeX's sake).
8. **The e2e suite.** In `app/`: `npx playwright test --workers=2`. Record the time, and how hot
   the machine got if it can be read (`MFE_E2E_COOL_EVERY=200` makes the suite pause 120 s every
   200 tests, as it does on a Mac). Then, alone: `npx playwright test e2e/audioExport.spec.ts
   e2e/video.spec.ts` (A2, A3).
9. **The build.** In `app/`: `npm run dist-check`; then open `app\dist\index.html` with a double
   click: the app must start.
10. **With Manim.** In `app/`: `npm run parity`, then `npm run export-check` (about 13 minutes on
    the Mac). Off Linux the font-text cases skip themselves: `tests/export/results/summary.json`
    has a row for each with its reason.
11. **Render with Manim, from the app.** `python companion/mfe_companion.py serve
    --allow-manim-render --ce-python … --gl-python …` in one console and `npm run dev` (in `app/`)
    in another; open the app in Chrome, load `examples/hello.mfe.json`, Export → Video → Render
    with Manim, once with each library (C13). Start one more and cancel it half-way, then list
    the processes (C3). Stop the companion with Ctrl+C and look into `%TEMP%` (C8); say from
    which console it ran (Git Bash, `cmd`, PowerShell, Windows Terminal): Git Bash hands Ctrl+C to
    a Windows program in its own way.
12. **The whole, once.** `MFE_VERIFY_LOGS=~/mfe-windows-round2/verify
    .claude/skills/mfe-change/verify.sh --companion`, and its summary into the log.

Then fill "To record" for each row of §2 that the run touched.

### What a green run would print

On Linux, on this branch, `verify.sh --companion` prints:

```text
tsc       ok
eslint    skipped (no files)
prettier  skipped (no files)
vitest    ok (unit + native): 4568 passed (4568)
companion ok: 326 tests, OK (skipped=1)
e2e       ok: 632 passed
dist      ok (build, file://): 3 passed
```

The companion's line will name more skipped tests on Windows, and `verify.sh` adds how many e2e
workers it used when they are not 2. A first run on Windows is not expected to be green: what
matters is the list of what failed and why.

### What "it works" means

The round has shown that the project works on Windows when all of this holds; each line that does
not is a finding (see "If something fails").

- [ ] The checkout has no CRLF (step 2).
- [ ] `verify.sh --companion` ends with exit code 0: types, the unit and native tests, the
      companion's tests, the e2e suite and the build opened from `file://` (step 12).
- [ ] Every skipped test of the companion says why, and the reason is one of step 7's.
- [ ] `npm run parity` says `PARITY: OK`; `npm run export-check` has no failure, and the cases
      it skipped are the font-text ones, each with its reason in `summary.json` (step 10).
- [ ] The companion compiles a formula for `ce` and for `gl` within its time limit, also the
      first time (step 6).
- [ ] From the app, with the companion running: a formula is drawn with its exact LaTeX glyphs
      (the top bar says "Renderer: LaTeX"), a video is exported through the companion's ffmpeg,
      and Render with Manim gives a video with ManimCE and with ManimGL (step 11).
- [ ] A cancelled render leaves no process and no folder behind (step 11, C3).
- [ ] `app\dist\index.html` opens with a double click and the app starts (step 9).
- [ ] Each row of §2 has what its "To record" asks, or the reason it could not be seen.

### If something fails

In this order, for each failure:

1. **Record it first**, before changing anything: the command, the test (file and title), its
   first failing line or the first lines of the error, and whether it repeats (run it again
   alone: `npx playwright test e2e/<spec>.ts -g "<title>"`, `npx vitest run <file>`,
   `python -m unittest <module>.<Class>.<test>` from `companion/tests`). A failure that comes and
   goes is recorded as such, with how many times of how many.
2. **Find what it has in common with others.** On the Mac 86 e2e failures had four causes. Group
   by cause, not by test.
3. **Look at the table below**, then at §2: most of what can go wrong was foreseen there.
4. **Decide** (next section) whether it is yours to fix, and fix it or leave it recorded.

| What shows | Where to look first |
|---|---|
| `Chroma Lab snapshot does not match its manifest`, or every file fails `prettier --check` | the checkout has CRLF: step 2 |
| `python3` is not found, or a command exits with 9009 | something starts Python by a name of its own: it must ask `app/build/python.ts` (`__tests__/python.test.ts` finds such code); or `python` is the alias of the Microsoft Store: `MFE_PYTHON` |
| the native tests fail at once with "Native integration prerequisites failed" | `python`, `latex` or `dvisvgm` is not on the PATH of the console that runs them, or MiKTeX took more than 10 s to answer `latex --version` the first time (C4) |
| "the companion did not start", or the export check skips everything | run `python companion/mfe_companion.py serve --port 7811` by hand and read what it prints; a port in a reserved range (J14) |
| a LaTeX compile times out, the first one above all | MiKTeX installing or building (C4): run the same `compile` again and compare the times |
| Render with Manim fails for ManimCE with "Could not determine home directory", or for either library at once | the environment of a job (`_clean_env`, C13): run the job's command by hand with that environment and see what is missing |
| after a cancel `python.exe`, `latex.exe` or `ffmpeg.exe` stay alive, or a folder `mfe-jobs-*` stays | `_kill_tree_windows` (C3) |
| an e2e test that reads positions or sizes fails by a pixel or two | fonts and scaling (A6, A7): record both numbers; do not widen a tolerance without knowing why |
| an e2e test that reads the canvas fails | the flag `--disable-accelerated-2d-canvas` did not take: `chrome://gpu` must say "Canvas: Software only" |
| the tests of `audioExport.spec.ts` or `video.spec.ts` fail on a duration or a frame count | the encoders of Windows (A2, A3): record the numbers the test printed |
| a test cannot delete a file or a folder ("being used by another process", `EBUSY`, `EPERM`) | a child that was not ended (C3, J12), or Defender holding the file (T13) |
| `'\r': command not found` in `verify.sh` | CRLF again: step 2 |
| a path loses its backslashes, or a file is "not found" at a path that exists | a Windows path given to Git Bash without quotes; or a path built with `/` joined by hand in the code |

### How a fix is made here

You may fix what is **Windows's alone and clear**: a path, a name of a program, an encoding, a
process that must be ended another way, a test that asks POSIX for something. Each such fix:

- is one commit on `windows` with its test (`CLAUDE.md` and the `mfe-change` skill say how a
  change is made here; a bug fix starts with a test that fails for the right reason);
- **changes nothing on Linux and macOS.** Write it so that the other systems keep the code they
  had (`process.platform === 'win32'`, `os.name == "nt"`), and so that its test runs on any
  system: take the platform as a parameter, as `app/build/python.ts` and the companion's
  `_clean_env(…, windows=…)` do, instead of a test that only Windows can run. In the log, say
  what would show on Linux if the fix were not a no-op there;
- is followed by the checks of its area before the next one (the static checks, the unit tests
  of the file, the spec or the companion's test module), and by the whole of `verify.sh` once at
  the end of the round;
- has a message in English, `Area: what changed, as a sentence`, that says what failed on Windows
  and why.

**Record and ask the owner, do not fix**, when the fix would:

- change what a user sees or does on any system (a shortcut, a label, a default), the file format,
  the companion's protocol or what an exported scene contains;
- weaken something that protects the user (the companion's checks of origin, its limits, what
  it refuses to read or to serve);
- need a new dependency, a setting of the machine (MiKTeX, the registry, Defender, Developer
  Mode) or a change of the Manim virtualenvs;
- be a choice between two behaviours, either of which is defensible (the choices of §1 are of
  that kind: say what you saw, the owner decides);
- or when you are not sure the cause is the one you think: a failure understood half-way is
  recorded with what is known, not patched.

Font text (§4) is not fixed in this round: it is recorded.

### What to write in the log

A new section at the end of this file, "5. Round 2: the run on this machine", committed on
`windows` (`Docs: round 2 of the Windows port, the run on Windows`), with:

1. **The machine**: a table as in step 1, with the console the commands ran in.
2. **What `verify.sh` printed**, and its exit code; the time of each step.
3. **Every failure**, grouped by cause: the tests, the first failing line, whether it repeats.
4. **§2, row by row**: what "To record" asks, or why it could not be seen.
5. **What was fixed**: a table of the commits, each with what failed, why, and what shows on
   Linux that it is a no-op there. **What was left**, each with the reason it is the owner's.
6. **For the Linux machine**: what must be run there before these commits go further (every
   commit of this round is run on Linux, and on the Mac, before `main` moves).
7. **What is kept and where**: the logs, outside the repository.

### When the round is done

Say so to the owner, with: whether the list of "it works" holds, what was fixed and what waits
for him, and that the branch is ready to be pulled on Linux. Do not merge, and do not start
another round: the Linux machine reads the log, reviews each commit and runs the whole
verification there first.

### For the owner, by hand

No test presses the keys of the system: these are about what Windows does with them.

- In the raw LaTeX field and in the formula editor, with a Spanish and with a Latin American
  layout: type `\ @ # [ ] { } | ~` with AltGr. Nothing but the character must happen.
- Alt+click on a glyph of a formula in the preview, release Alt, then press Space: does the
  preview play, or does Chrome's menu take the key?
- The Menu key on a clip of the timeline with the focus: one menu, at the clip.
- Ctrl+wheel and a pinch on the touchpad over the preview: the view zooms, the page does not.
- The preview at 125 % and at 150 % scaling: sharp, with no seam at its edges.
- Export → Audio… → M4A: the file opens in the system's player and lasts what the range lasts.
- A project name such as `a:b?c` or `con`: Save and Export give a file the system accepts.

## 4. Font text on Windows, and then on macOS

**Postponed (the owner, 2026-11-17): font text on Windows and on macOS is not part of version
1.0.0.** There the companion refuses to shape a text at once, the editor draws it as placeholder
boxes, and the exported scene still draws it with Manim. Nothing of this section is built or to be
built in the runs of §9; what follows, and what round 2 recorded of the two virtualenvs (§5), is
kept for the version that takes it up.

The companion shapes font text (the object "Text", drawn by Pango) in a worker process per Manim
library, through the system's Pango with Fontconfig (`_PangoAPI` in `companion/mfe_companion.py`),
which is Linux's. Elsewhere a Text is its placeholder boxes in the editor, and the exported scene
says so when it runs. The owner wants it on Windows, then on macOS.

Nothing of it is written yet. Before anything can be, round 2 records, **for each of the two
virtualenvs** (read only: nothing is installed):

```bash
CE=../manim_ce/venv/Scripts/python.exe   # and then the same with the ManimGL one
"$CE" -c "import manimpango; print(manimpango.__version__)"
"$CE" -c "import manimpango, os; print(os.path.dirname(manimpango.__file__))"
```

and the list of the files of that folder and of any folder of libraries beside it (the `.dll`
files: which of Pango, PangoCairo, PangoWin32 or PangoFT2, Cairo, HarfBuzz, Fontconfig, FreeType,
GLib are there, with their exact names), and what this prints:

```bash
"$CE" -c "import manimpango; fonts = manimpango.list_fonts(); print(len(fonts), fonts[:8])"
```

With that the worker's way in for Windows can be designed on the Linux machine: which library it
loads, and which backend lists the fonts where there is no Fontconfig.

## 5. Round 2: the run on this machine

Run on 2026-11-12 by an agent on the owner's Windows machine, with the task of §3. Seventeen
commits, `7ef5815` to `e5b9ec4`, all on `windows` and none pushed. The tables below are the record
§3 asks for; "What was left" is what waits for the owner.

### The machine

| What | Here |
|---|---|
| Windows | Windows 11 Home 25H2 (10.0.26200); Developer Mode off; Defender's real-time protection on |
| Hardware | AMD Ryzen 7 9700X (8 cores, 16 threads), 31 GB, Radeon RX 9070 XT; two screens, both at 100 % (96 DPI) |
| The user's folder | its name has a space: Windows gives such a user TEMP in the short form (`C:\Users\LONGNA~1\AppData\Local\Temp`), which mattered (below) |
| Git | 2.56.0.windows.2; `core.autocrlf` is `true`; `git ls-files --eol \| grep -c 'w/crlf'` prints `0` |
| Node, npm | 26.13.1 and 11.20.0, installed by the owner at the start of the round (the machine had none) |
| Chrome | 157.0.8103.51 |
| Python | none of python.org: `python` and `python3` are the aliases of the Microsoft Store and `py` does not exist. The Pythons are uv's (3.13.17, 3.14.9, 3.15.1), on the PATH as `python3.14.exe`: every command ran with `MFE_PYTHON=python3.14` |
| LaTeX | MiKTeX 26.5 (`MiKTeX-pdfTeX 4.27`), dvisvgm 3.6 |
| ffmpeg | 9.0.2 (the full build of gyan.dev, from winget) |
| ManimCE | 0.22.0, in a virtualenv of uv (Python 3.14.9), named by `MFE_CE_PYTHON` |
| ManimGL | 1.7.2, an editable install in another, named by `MFE_GL_PYTHON` |
| Console | Git Bash (bash 5.3.15, MSYS 3.6.10) started by the agent's session, with no window: no key could be typed in it (C8 says how the keys were sent) |
| Ports | `netsh int ipv4 show excludedportrange protocol=tcp` lists no range |

### What `verify.sh` printed

On `e5b9ec4`, the last commit before this record, `verify.sh --companion` (with `MFE_PYTHON`,
`MFE_CE_PYTHON` and `MFE_GL_PYTHON` set as the table says) ended with exit code 0 after 19 minutes:

```text
tsc       ok
eslint    skipped (no files)
prettier  skipped (no files)
vitest    ok (unit + native): 4580 passed (4580)
companion ok: 331 tests, OK (skipped=20)
e2e       ok: 632 passed
dist      ok (build, file://): 3 passed
```

The types and Vitest took a minute, the companion's tests 8.5 minutes, the e2e suite 8.9 minutes
with 2 workers, the build opened from `file://` 18 s. The tools of the skill ran as round 1 left
them: `verify.sh`, `reflow.py` (two paragraphs of the docs) and `shot.mjs` (both themes in 4 s, its
server stopped afterwards). The companion's 20 skipped tests each say why, and every reason is one
of step 7's: bubblewrap (9), "needs a POSIX system" (5), symbolic links (2: Developer Mode is off),
"no SIGHUP here" (2), the font table (1) and `NativeText` (1).

With Manim, on the same commit: `npm run parity` says `PARITY: OK` (LaTeX against ManimCE and
against ManimGL 70 of 70 identical; 7 s with the caches of the first run, which took 158 s), and
`npm run export-check` has no failure in 814 s, 114 passed and 12 skipped: the 12 skipped are the
font-text cases, six for each library, each with its reason in `summary.json`
("the companion does not shape font text for ManimCE: Native text mapping currently requires the
Linux Pango/Fontconfig backend").

The first run of each step, before any fix: the static checks 17 s; Vitest 51 s, 4567 of 4568; the
companion's tests 642 s, 326 tests with 5 failed and 107 failed subtests; the e2e suite 9.1 minutes
with 2 workers, 630 of 632 (how hot the machine got could not be read; no pause was asked for);
`npm run dist-check` 18 s, 3 passed; `npm run parity` 158 s, OK; `npm run export-check` 948 s, 114
passed and 12 skipped.

### Every failure of the first run, by cause

| Cause | Tests | First failing line | Repeats |
|---|---|---|---|
| TEMP in the short form: ManimCE hands LaTeX each `.tex` with its whole path, and TeX reads the `~` of a file name as its active character | `test_fidelity.FidelityCE.test_documents_and_svg_identical`, 107 subtests of 107 | `AssertionError: True is not false : Manim failed (RuntimeError: latex failed but did not produce a log file. …) but the companion succeeded` | always |
| dvisvgm ends its lines with CR LF on Windows | the same 107 once the first cause was out (`SVG rendering content differs`: the reference read the file as text); `test_labels.AlignmentFallback.test_count_mismatch_gives_question_marks_and_warning` (`assertNotEqual(svg, result["svg"])`: its `replace` found no `\n`) | | always |
| a text stream ends its lines with CR LF | `test_cli.Utf8Output.test_the_streams_become_utf8_and_keep_how_they_treat_what_they_cannot_write` | `b'\xce\xb1 /tmp/caf\\udce9\r\n' != b'\xce\xb1 /tmp/caf\\udce9\n'` | always |
| Windows removes no file that is open | `test_audio.VideoSound.test_one_audio_request_at_a_time_and_cancel_in_the_middle` | `self.assertFalse(os.path.exists(directory))`: the soundtrack's folder, with `audio.wav` | always (3 of 3 alone) |
| the first answer of `/health` takes 0.6 s (it starts `latex`, `dvisvgm` and `ffmpeg`; 4 ms afterwards) | `test_pango.LazyStart.test_the_first_request_starts_the_worker_and_health_follows` | `{'ce': {'state': 'ready', …}} != {'ce': {'state': 'preparing'}, 'gl': {'state': 'unused'}}` | always (3 of 3 alone) |
| ending a process with what it started takes 50 ms (`taskkill /T`), and the manager's own thread reaps too | `test_jobs.VideoJobs.test_idle_job_is_cancelled_by_the_reaper` | `self.assertIsNotNone(job.proc.poll())`: `unexpectedly None` | 1 of 4 |
| Node has a `navigator` of its own, with the platform of the machine | `src/ui/__tests__/useCompanion.test.ts > companionTooltip > says how to start the companion when it is not running` | expected `… python3 companion/mfe_companion.py serve`, received `… python companion/mfe_companion.py serve` | always |
| Chrome's AAC encoder on Windows (Media Foundation) starts its stream with the sound: no priming | `e2e/audioExport.spec.ts:287` "the sound of an MP4 is AAC where the browser encodes it, and Opus elsewhere" | `expect(Math.abs(onset - reference.onsets[index]!)).toBeLessThanOrEqual(2)`: `Received: 497` | always |
| the system's font (Segoe UI) makes the Edit menu 205.9 px wide | `e2e/app.spec.ts:521` "a submenu that would leave the window opens on the other side of its entry" | `expect(submenu).toHaveClass(/is-flipped/)`: received `menu-popup menu-submenu` | always |

Found on the way, with no test failing for them at first: the two reference scripts of the fidelity
tests ended with status 1 and left their folder in TEMP (`57860ba`); a companion stopped in its
first seconds left the interpreter it was probing, its folder and a traceback (`a6666ef`);
Ctrl+Break ended the companion at once (`84186f5`).

### §2, row by row

| Id | What was seen |
|---|---|
| A1 | Not seen. It needs a key released on a Chrome with a window: a headless Chrome has no menu to take the focus, and a key sent by Playwright does not go through the system. For the owner, by hand |
| A2 | Chrome 157 on Windows does encode AAC (`mp4a.40.2`, through Media Foundation): M4A is offered, and an MP4 carries AAC. The three checks of "M4A is offered exactly where the browser encodes AAC" passed from the first run: the container says 1.000021 s for 48 001 samples (within 1e-6 of 48001/48000), Chrome presents 48 001 frames at 48 kHz in 2 channels, and ffmpeg decodes at least 48 001 and fewer than 49 025. What failed was the place of the sound in an MP4 (above), mended by `dd4f880`. Measured on the encoder itself: the first chunk is at 0, every chunk lasts 21 333 µs (1 024 samples) and is a key chunk, ceil(frames/1024) chunks, no priming, and nothing in `decoderConfig` speaks of one. `ffprobe` of the files exported after the fix: a 2 s M4A: `start_time` 0.000000, `duration_ts` 96000, `duration` 2.000000, `nb_frames` 95 (94 before; an edit list of 115200 at `media_time` 1024); a 1.000021 s M4A: `duration_ts` 48001, `nb_frames` 48; the MP4: AAC 96000 / 2.000000 s in 95 packets, H.264 20 frames, 2.000000 s |
| A3 | Nothing differs: the 11 tests of `e2e/video.spec.ts` pass, frame counts and durations exact (H.264 through Media Foundation at 320×180) |
| A4 | Not seen: it needs a keyboard and its layouts. For the owner, by hand |
| A5 | One menu, at the clip. On key down the timeline opens its add-animation menu and prevents the default; on key up Chrome sends a `contextmenu` event to what then has the focus, the first entry of that menu, and the app prevents it: no second menu, none of the browser's. Seen with a key sent by Playwright to a headless Chrome (which did send the event of the key up, as Windows has it); a real key is the owner's |
| A6 | 2 failures of 632, both in the table above; none of the 132 assertions on positions failed by a pixel |
| A7 | With Chrome drawing at 125 % and at 150 % (Playwright's `deviceScaleFactor`; the screens here are at 100 %): the canvas is 993×558 for 794.39×446.39 CSS px at device (386, 146), and 1191×669 at (463, 176): whole device pixels both times, and the screenshots show a sharp formula and an unbroken frame. A real screen at those scalings is the owner's |
| C3 | After a cancel from the app, 4 s into a 1920×1080 render at 60 fps with ManimCE ("frame 55 of 300"): half a second later neither the virtualenv's launcher nor the interpreter under it is alive, the job's folder is gone, and the next render starts and ends. The tree was `python3.14.exe` (uv's own launcher) → `python.exe` (the companion) → `Scripts\python.exe` (the virtualenv's launcher) → `python.exe` (Manim). `taskkill /T` reached nothing it should not have; that it builds the tree from parent ids is as open as it was |
| C4 | `latex --version` answers in 0.4 s. `compile`, first and second run: 1.22 s and 0.93 s for `ce`, 1.39 s and 1.27 s for `gl`. No dialog and no missing package: the machine had rendered with Manim before, so MiKTeX had them all. A MiKTeX that has to install on the fly was not seen. `-no-shell-escape` is accepted. MiKTeX does not know `openin_any` and `openout_any` (`kpsewhich -var-value=openout_any` prints nothing); its own settings decide. For writing they say what the companion asks: `[Core]AllowUnsafeOutputFiles` is `false`, and a `\openout` to `C:/Users/Public/…` (no space, no `~`) ends in "I can't write on file", with no file written. For reading they do not: `[Core]AllowUnsafeInputFiles` is `true`, so LaTeX reads what the user can, which is what the companion's warning says of TeX Live 2026 |
| C8 | With the companion in a console of its own (hidden), a video job and a render with ManimCE under it, and the key or the close sent by a helper attached to that console. **Ctrl+C**: status 0, no process of its tree left, nothing in TEMP. **Ctrl+Break**: status 0xC000013A at once, no process left (they get the key too), `mfe-jobs-*` left with the job's files: mended by `84186f5` (now status 0, nothing left). **Closing the window**: status 0xC000013A, no process left, an empty `mfe-jobs-*` left; not mended (below). The programs of the agent's session ignore Ctrl+C and a child inherits that: the companion was started through a line that asks the system to hear it again |
| C10 | `test_audio.VideoSound.test_unknown_jobs_methods_and_origins` passes: the refusals arrive as answers |
| C13 | From the app, with the companion on its own port and no route in between: the top bar says "Renderer: LaTeX" ("2 formulas exact (LaTeX)"), a video through the companion's ffmpeg (1 s), Render with Manim with ManimCE (2.1 s) and with ManimGL (4.7 s): each an H.264 MP4 of 50 frames, 5.000000 s, 320×180. The environment of a job starts all of them |
| C14 | ManimGL renders (a real adapter, no virtual machine and no Remote Desktop here) |
| C15 | It passes, with its sandbox-less twin: MiKTeX lets LaTeX write neither the file outside nor the `.dotfile`. On a machine like this one the first half proves little by itself (the marker is in TEMP, whose short name has a `~` that TeX garbles anyway): the probe of C4 is the proof |
| J12 | After `npm run export-check`: no process left. What is left is folders in TEMP, from every harness that ends its companion with `kill()` (`TerminateProcess` on Windows: no clean-up): after the day's runs 31 `mfe-jobs-*`, 86 `mfe-probe-*` and 11 `mfe-e2e-*`, with 12 small files in all of them (10 kB). Not mended (below) |
| J13 | It passes: `npm run dist-check`, 3 passed |
| J14 | No range is reserved |
| T1 | Nothing was written |
| T8 | The tests ran from Git Bash: `touch` is on the PATH |
| T13 | Nothing that looked like it: no test failed on a file it could not delete, and the e2e server came up within its time |

### What was fixed

Each row is one commit. "On Linux" is what shows there that the commit changes nothing, or what it
does change.

| Commit | What failed on Windows, and why | On Linux and macOS |
|---|---|---|
| `7ef5815` | the test of the UTF-8 streams compared bytes ending in `\n`; a stream ends its lines with CR LF there. The test's streams say `newline="\n"` | the same bytes as before |
| `e9bc982` | the ManimCE reference script worked in a folder named in the short form, where ManimCE's LaTeX fails (107 of 107). It resolves the folder's name first. Render with Manim was never touched by this: the companion gives Manim a relative media folder | the name of a temporary folder is its real one already (on a Mac, `/private/var` for `/var`) |
| `7d57df6` | the same script read dvisvgm's SVG as text, turning CR LF into LF, while the companion gives the file as it is. It reads the bytes: 107 of 107 byte-identical on Windows | nothing to turn where dvisvgm writes LF |
| `ca43c2f` | a test of the labels put its extra shape in with a `replace` on `\n` | the SVG it builds is the one it built |
| `57860ba` | the reference scripts removed their folder while it was their current one: `PermissionError`, status 1, a folder left at every run. They go back first | a folder can be removed while it is the current one: nothing changes |
| `1976d8c` | a test read `/health` during a start of 0.3 s; the first answer of `/health` takes 0.6 s there. It asks once beforehand | that first answer comes a little earlier |
| `105183a`, `facfb47` | a test read that a job's ffmpeg had ended right after the reaper; the manager's own thread may have taken the job first, its kill still under way. The first commit waited for the process, which the review showed was too lax (a kill that does nothing passed in 5.6 s); the second keeps that thread from reaping during the test and reads at once again | the test is as strict as it was |
| `7d4549a` | **the companion.** A job deleted while a request still wrote its soundtrack, or still sent its result, kept that file and its folder until the companion ended: up to 691 MB. A request that closes such a file now removes what is left | an open file is removed like any other: the second removal finds nothing. Two new tests play Windows with a removal that leaves a held folder alone; they fail without the change there too |
| `dd4f880`, `e5b9ec4` | **the app.** Every MP4 and M4A lost the start of its sound (640 samples or so decoded as silence rising to it): Chrome's AAC encoder there starts its stream with the sound. The export learns the encoder's lead-in from two frames of silence, once per page, and encodes before zero the silence that completes it to one frame; the edit list written for the Mac leaves it out. The second commit, from the review: a test with an encoder of its own that runs on any system, and an encoder that cannot be asked gets no silence, as before | Linux: Chrome has no AAC, nothing is asked. A Mac: one more encode of two frames of silence per page, into nothing; the lead-in of 2 112 gets no silence and the encoder the input it got. **To check on the Mac**: the two AAC tests of `audioExport.spec.ts`, and `ffprobe -v trace` of an exported M4A still saying `media_time` 2112 |
| `b7ce449` | a unit test expected `python3` in the tooltip; it runs in Node, whose `navigator.platform` is `Win32` there. The test states the platform, and checks both names | the same two assertions pass |
| `d7dc2d9` | the flipped-submenu test opened a window of 360 px, where with Segoe UI the submenu overflows less on the right (123.3 px against 126.5 px) and rightly stays. It opens 340 px | a system where the submenu flipped at 360 px flips at 340: it flips when the window is narrower than the sum of the entry's two edges |
| `a6666ef`, `08cca09` | **the companion.** Stopped in its first seconds, it left the interpreter it was asking for its Manim: its folder stayed (it is that process's current one) and its removal raised at the exit, a traceback that fills a pipe nobody reads. `shutdown()` ends the probes that still run. The second commit, from the review: the jobs end first, as before, and the test reads what happens instead of an attribute | **a change there too**: the interpreter was left to finish by itself, and now ends with the companion |
| `84186f5`, `741ef4b` | **the companion.** Ctrl+Break ended it at once, its jobs' files left in TEMP. `SIGBREAK` is taken like `SIGTERM` and `SIGHUP` | the name does not exist there. A test gives the companion a `signal` module with the names of Windows, on any system |

The review: an independent reader went through the first thirteen commits with the code and without
the author's conclusions, as in round 1. Its findings are the four commits `facfb47`, `08cca09`,
`741ef4b` and `e5b9ec4`, and one correction of a message that cannot be amended: `a6666ef` names
the `mfe-probe-*` folders the e2e suite leaves as one of its symptoms, and does not cure them (J12).

### What was left, and why it is the owner's

- **A console window that is closed** ends the companion before Python can clean up: the system
  ends the process as soon as its handler returns. An empty `mfe-jobs-*` stayed in the probe; a
  soundtrack could. A handler set with `SetConsoleCtrlHandler` (ctypes) that holds the 5 s Windows
  gives could remove the folders: a design choice, and code that only Windows can run.
  `docs/COMPANION.md` says for now that the directory stays.
- **J12: the harnesses end their companion with `kill()`**, which is `TerminateProcess` on Windows:
  the e2e helper, the export check, the parity harness and the tests of `serve` leave `mfe-jobs-*`
  and `mfe-probe-*` in TEMP. Node cannot send Ctrl+Break. An orderly stop needs either something
  the protocol does not have (a route that stops the server), or a temporary folder of their own
  for these companions (`TMPDIR`) that the harness removes: both are choices. The day's leftovers
  are still in TEMP on the Windows machine (128 folders, 10 kB): the agent's session was not
  allowed to remove them, and they are the owner's to delete (`mfe-jobs-*`, `mfe-probe-*`,
  `mfe-e2e-*` in `%TEMP%`, with no companion running).
- **`e2e/video.spec.ts` makes its `mfe-e2e-*` folder when the file is loaded**, in every process
  that loads it, and only the worker that runs the group removes its own: 11 empty folders after
  the day. Not a matter of Windows (Linux must leave them too), so not touched.
- **The companion's disk cache** is `.cache/mfe-companion` in the user's folder on Windows too
  (`XDG_CACHE_HOME`, else `~/.cache`): it works, 2.5 MB after the day. `%LOCALAPPDATA%` is where
  Windows expects such a folder: a choice.
- **C3**: `taskkill /T` by parent ids, as before. Nothing wrong was seen; a Job Object would be
  exact, and is a larger change than this round may make.
- **The priming of AAC (`dd4f880`) changes what an exported file contains on Windows**: one more
  packet and an edit list, as the files of a Mac have. A player that ignores edit lists plays 21 ms
  of silence first (44 ms on a Mac's files). It follows from a test that existed, but it is the
  owner's to confirm. No e2e test hears the start of an M4A (the range of the M4A test begins in
  silence): one could. And a cancel that comes while the encoder is being asked for its lead-in
  is heard once the two frames of silence are encoded, some tens of milliseconds later.
- **`python` on this machine is the alias of the Microsoft Store**, and the app tells a user of
  Windows to start the companion with `python companion/mfe_companion.py serve`. Here that runs
  nothing; `python3.14 …` or `uv run …` does. What the app and the README should say to a user
  whose Python is uv's is a text to choose.
- **What `serve` prints on Windows** still says "install bubblewrap on Linux for confinement" and
  speaks of TeX Live 2026 where the LaTeX is MiKTeX: wording, the owner's.
- **Nothing was written for users of Windows** (README, the commands of `docs/COMPANION.md`), as
  in round 1: it waited for a run that works, and this is one.
- **MiKTeX installing on the fly** (C4) was not seen: this MiKTeX had every package.
- **By hand** (§3, "For the owner, by hand"): everything there still stands, but three things that
  were seen as far as a headless Chrome shows them. The Menu key and the preview at 125 % and 150 %
  (A5, A7). And the names of files, where the app hands the file to the browser as a download: a
  project named `a:b?c` is saved as `a-b-c.mfe.json` and exported as `a-b-c.mp4` (the app replaces
  the characters), and one named `con`, `NUL`, `aux.` or `com1` as `_con.mfe.json` and `_con.mp4`
  (Chrome puts the `_` before a name Windows keeps for a device). The system's own "Save as"
  dialog, which the app uses where Chrome offers it, was not seen. Nor was `app\dist\index.html`
  opened with a double click: `npm run dist-check` opens it from `file://` in Chrome and passes.

### Font text (§4): what the two virtualenvs have

The same in both (uv links the files of one copy):

- `manimpango.__version__` is `0.7.0`, in `…\.venv\Lib\site-packages\manimpango`; Pango 1.58.2 and
  cairo 1.18.6 (`manimpango.pango_version()`, `cairo_version()`).
- The folder holds three extension modules and no library: `cmanimpango.cp314-win_amd64.pyd`
  (6.3 MB), `_register_font.cp314-win_amd64.pyd` (6.1 MB), `enums.cp314-win_amd64.pyd` (2.6 MB),
  with their `.pyx` and `.pxd` sources and `register_font.py`, `utils.py`, `_version.py`.
- **There is no DLL of Pango, PangoCairo, PangoWin32, PangoFT2, Cairo, HarfBuzz, Fontconfig,
  FreeType or GLib**, in that folder or beside it: no `manimpango.libs`. The `.libs` folders of
  `site-packages` are `av.libs` (FFmpeg's), `numpy.libs`, `scipy.libs` and, for ManimCE,
  `mapbox_earcut.libs`. Pango is linked into the `.pyd` files: their text names PangoWin32,
  DirectWrite (cairo's `cairo_dwrite_*`), Fontconfig (`FcConfig…`) and HarfBuzz (`hb_shape`); they
  import `DWrite.dll`, `USP10.dll` and `GDI32.dll`; and `cmanimpango` exports nothing of Pango
  (`PyInit_cmanimpango`, expat's `XML_*` and five `cairo_dwrite_font_face_*`).
- `manimpango.list_fonts()` gives 90 families; the first eight: `['Arial', 'Bahnschrift', 'Calibri',
  'Cambria', 'Cambria Math', 'Candara', 'Cascadia Code', 'Cascadia Mono']`.

So there is no library for `_PangoAPI` to load on Windows. What a worker can reach there is
ManimPango's own Python interface (`text2svg`, `MarkupUtils`, `list_fonts`, `register_font`,
`fc_register_font`), which is also what Manim itself draws a Text with.

### For the Linux machine

Before these commits go further, on Linux and then on the Mac:

- `verify.sh --companion`, `npm run parity` and `npm run export-check`. The tests that play Windows
  on any system must pass there: the two `test_a_job_deleted_while_…` (of `test_audio` and of
  `test_jobs`), `test_a_probe_still_running_ends_with_the_companion`,
  `test_it_takes_the_signals_the_system_has` and `encodingPriming.test.ts`.
- `a6666ef` and `08cca09` change what happens there: a probe that still runs is ended at
  `shutdown()`. `test_cli.Signals` (SIGTERM, SIGHUP) and the probe tests of `test_http.Health` are
  the ones to watch.
- On the Mac: the AAC tests of `e2e/audioExport.spec.ts` (`dd4f880`), and the edit list of an
  exported M4A (`media_time` 2112, as before).
- `d7dc2d9`: the submenu test at 340 px on both.

### What is kept and where

Outside the repository, in `~/mfe-windows-round2` on the Windows machine: the output of every step
(`04-…` to `12-…`), the logs of the last `verify.sh` (`verify/`), the record of §4
(`s4-font-text.txt`), the videos and reports of step 11 and of C8 (`11/`), the probes that were
written for the round (`probes/`: the app in Chrome with a real companion, the three ways of ending
a console, the stacks of a companion that would not end), and the patch of the AAC change as the
agent that measured it wrote it (`aac.patch`).

### Whether it works

By the list of §3:

- [x] The checkout has no CRLF.
- [x] `verify.sh --companion` ends with exit code 0.
- [x] Every skipped test of the companion says why, with a reason of step 7's.
- [x] `npm run parity` says `PARITY: OK`; `npm run export-check` has no failure, and skips the
      font-text cases alone.
- [x] The companion compiles a formula for `ce` and for `gl` within its time, the first time too.
- [x] From the app: exact LaTeX glyphs, a video through the companion's ffmpeg, Render with Manim
      with each library.
- [x] A cancelled render leaves no process and no folder.
- [ ] `app\dist\index.html` opens with a double click: opened from `file://` by the check, not by
      a click.
- [x] Each row of §2 has its record, or the reason it could not be seen (A1, A4).

## 6. Round 2 on Linux: the review and the runs

On 2026-11-12, on the owner's Linux machine, at `e987fab`, the last commit of round 2. The eighteen
commits of the round sit in one line on `d891230`, no other branch moved, and `main` (`48bed45`) is
an ancestor of the branch: `git merge --ff-only windows` is possible.

### The runs

| Step | Result |
|---|---|
| `verify.sh --companion` (5 e2e workers) | exit 0 in 661 s: types ok; 4580 unit and native tests; the companion's 331 tests, 2 skipped; 632 e2e tests; the build opened from `file://`, 3 |
| the companion's 2 skipped tests | `Signals.test_ctrl_break_stops_it_in_order` ("Ctrl+Break is a key of Windows") and the sandbox-less twin of the private-files test, as before |
| `npm run lint` | no error; the 9 standing warnings of `react-refresh`, none in a file of round 2 |
| Prettier on the files of `app/` round 2 changed | clean |
| `npm run export-check` | 126 passed of 126 in 701 s (on Linux the 12 font-text cases run) |
| `npm run parity` | `PARITY: OK` |

The whole took 23 minutes, one job at a time; the hottest the processor got was 81 °C.

### The tests that play Windows, without their fix

A test that plays Windows on another system is worth what it catches there. Each fix was taken out
of a copy of the companion, outside the repository, and its test run on Linux:

| The fix taken out | The test, and where it fails |
|---|---|
| `7d4549a`: `_released()` removes nothing | both `test_a_job_deleted_while_…` (`test_audio`, `test_jobs`): the soundtrack's folder, and the job's, are still there |
| `a6666ef`, `08cca09`: `shutdown()` leaves the probes | `test_a_probe_still_running_ends_with_the_companion`: the probe's thread is still alive (and the test ends the stand-in itself) |
| `84186f5`: no `SIGBREAK` | `test_it_takes_the_signals_the_system_has`: `[15] != [15, 21]` |

And with the platform reported as `darwin`, on Linux (`sys.platform = 'darwin'` before the tests are
loaded, as in round 1): `test_pango.LazyStart`, `test_cli.Utf8Output`, the signals test, the probe
test, `test_jobs.ChildEnvironment` and `test_jobs.ProcessTrees`, 36 tests, pass.
`encodingPriming.test.ts` was read, not undone: it asserts the silence the encoder is given and the
edit list of the file, for a lead-in of 0, 312, 1 024 and 2 112.

### The review

Every commit read with the code around it. Nothing to mend. What a reader of the other systems
should know:

- **The probes** (`a6666ef`, `08cca09`) are the one change of behaviour on Linux and macOS: an
  interpreter still importing its Manim is ended when the companion stops, where it was left to
  finish. `_closing` stays set afterwards: a `Companion` is not used again after `shutdown()`, and
  none is.
- **The second removal** (`7d4549a`): `_discard()` is called only where a job ends (it could not
  start, it failed and its process is gone, `cleanup()`), and nothing writes into the job's folders
  afterwards: the call a request makes when it closes its file finds nothing on a system that
  removes open files.
- **The priming of AAC** (`dd4f880`, `e5b9ec4`): Chrome on Linux has no AAC encoder and never asks.
  Chrome on a Mac does: once per page it encodes two frames of silence into nothing, reads a lead-in
  of 2 112 and adds no silence; an encoder that cannot be asked gets none either. What the real
  encoder of a Mac answers only a Mac can say (§7).
- **The submenu test** (`d7dc2d9`) passes at 340 px here: the submenu flips, as it did at 360.
- **Not of round 2**: `e2e/video.spec.ts` leaves an empty `mfe-e2e-*` folder in the temporary
  directory for each worker that loads the file without running its group, on Linux too (5 after a
  run with 5 workers), as §5 supposed. Left as it is, for the owner.

## 7. The run on the Mac, when the owner calls for it

For whoever runs it there, a person or an agent. Read `CLAUDE.md` first. The two rounds changed code
that a Mac runs, and none of it has run on one: the companion refuses font text at once off Linux
(`a330704`), gives every job `PYTHONUTF8=1` (`587125d`), writes UTF-8 whatever the terminal
(`70c9a46`), names the content types of the built app itself (`1619972`), ends its probes when it
stops (`a6666ef`), and the export of AAC, which Chrome encodes on a Mac, now asks the encoder for
its lead-in first (`dd4f880`). The harnesses start Python and `nice` through `app/build/python.ts`
(`f137f4b`).

### Rules

Those of §3, with "the Mac" read for "Windows" and, for `windows`, the branch the owner names for
that run: "Rules of this round" (everything on that branch, no other branch edited whatever is
found, nothing pushed or merged without the owner's word, nothing installed), "If something fails"
and "How a fix is made here" (a fix that is the Mac's alone and clear is one commit with its test,
which changes nothing on Linux and on Windows; anything else is recorded for the owner). `git pull`
first: the owner pushes the branch before the run, and no other machine commits to it meanwhile.

### The task, in order

1. **The checkout.** The branch the owner names, pulled; `git status -sb` says that it is level with
   its remote. Run `npm ci` in `app/` if `app/package-lock.json` changed since the last run there
   (`git diff --stat <the commit of that run> -- app/package-lock.json`).
2. **The whole verification.** `.claude/skills/mfe-change/verify.sh --companion`, with the Manim
   virtualenvs where they were for the Mac port. Linux prints the lines of §6; here the companion
   skips more (bubblewrap is Linux's): record every skipped test with its reason, and the time and
   the heat of each step as before.
3. **With Manim.** `npm run parity` and `npm run export-check` (from `app/`): no failure; the
   font-text cases are skipped off Linux, each with its reason in `summary.json`.
4. **The sound of an export.** The tests of `e2e/audioExport.spec.ts` pass (step 2 runs them: look
   at them by name). Then, from the app, export an M4A of 2 s and read its edit list and its
   length:

   ```bash
   ffprobe -v trace <file> 2>&1 | grep 'edit list'    # still "media time: 2112"
   ffprobe -v error -show_entries stream=duration_ts,nb_frames <file>    # duration_ts=96000
   ```

   Say whether the first export of a page takes visibly longer than the second (the lead-in is
   asked once per page).
5. **The companion from the app.** Start it (`python3 companion/mfe_companion.py serve`, with
   `--allow-manim-render` and the two interpreters as for the Mac port). A formula is drawn with its
   exact LaTeX glyphs ("Renderer: LaTeX"); a video is exported through the companion's ffmpeg;
   Render with Manim gives a video with ManimCE and with ManimGL (the environment of a job changed).
6. **Font text.** With the companion running, add a text with a font: the companion's answer
   ("Native text mapping currently requires the Linux Pango/Fontconfig backend.") now comes at once,
   without a worker starting (with ManimGL it took 13 s). Record what the app shows and how long it
   takes.
7. **A stop in the first seconds.** Start `serve` with the two interpreters and press Ctrl+C within
   two seconds, while it still asks them for their Manim: status 0, no traceback, no interpreter
   left importing Manim (`pgrep -fl manim`), and no `mfe-probe-*` in `$TMPDIR`.
8. **Font text, for the phase that follows** (§4): the same record for the two virtualenvs of the
   Mac, with `venv/bin/python` for `Scripts/python.exe`: ManimPango's version, what its folder holds
   (a `.dylibs` folder with Pango's libraries, or none), and `list_fonts()`.

### What to write

A new section at the end of this file, "The run on the Mac", committed on that branch with the
subject `Docs: the run on the Mac of what the Windows port changed`. It holds: the machine (macOS,
the chip, Node, Chrome, Python, the TeX distribution, ffmpeg, the two Manim versions); what
`verify.sh` printed, its exit code, the time of each step and the hottest it got; every failure
grouped by cause, with its first failing line and whether it repeats; what steps 4 to 8 showed; what
was fixed, one row per commit with what shows on Linux and on Windows that it is a no-op there, and
what was left for the owner. Then say so to the owner. Do not merge: the Linux machine reads the
record and runs whatever the Mac changed first.

## 8. After the merge: the owner's decisions on what was left

On 2026-11-12, by the list of §5 ("What was left"). "Done" names the commit, made on Linux; "On
Windows" is what the next run there has to look at, since none of it has run on that system.

| What | Decided | Done | On Windows |
|---|---|---|---|
| The command the app shows to start the companion (`python`, the alias of the Microsoft Store on a machine without a Python on the PATH) | It stays `python`; the documentation says what to use otherwise | `ea5c765`: README and `docs/COMPANION.md`, "On Windows" | read the two sections with the machine at hand |
| Nothing written for users of Windows | A short section now, adjusted at the last round | `ea5c765` | the same |
| The warnings of `serve` (bubblewrap, TeX Live 2026) | A text per system | `41b1418`: `confinement_notices()`, the system as a parameter; Linux's text is the one it was | what `serve` prints there, with and without `--allow-manim-render` and `--allow-file-origin` |
| J12: the harnesses leave folders in TEMP | A temporary folder of its own for each companion a harness starts, removed by the harness | `c9e5f6b`: `app/build/harnessCompanion.ts` (`taskkill /T`, then the folder), `serve_environment()` in the companion's tests | **TEMP before and after the suites**: no `mfe-jobs-*`, `mfe-probe-*` or `mfe-harness-*` left; that `taskkill` ends the companion's tree and the folder can then be removed |
| `e2e/video.spec.ts` leaves a folder per process | (no choice in it) | `50966fd`: made by the hook; a rule in `e2eConventions.test.ts` | no `mfe-e2e-*` left |
| The companion's disk cache | It stays in the user's `.cache` folder, one rule on the three systems | documented in `ea5c765` | nothing |
| The priming of AAC changes what a file of Windows contains | Accepted | nothing to do | nothing |
| A console window that is closed; `taskkill /T` by parent ids (C3) | Both at the next run on Windows, where they can be tried: a handler of the console's close that removes the folders, and a Job Object for the tree of a render | recorded here | **to write there**, each with its test and the system as a parameter (written in the run of §10: `a74fb7ea`, `ee9788fa`) |
| This file | It stays until the last round on the three systems | | |

Still the owner's by hand, as §3 lists them: the Alt key, AltGr and the keyboard layouts, a real
Menu key, real screens at 125 % and 150 %, the system's own "Save as" dialog, and
`app\dist\index.html` opened with a double click.

## 9. The runs for version 1.0.0: the task on Windows and on the Mac

Written on 2026-11-18 on the Linux machine, at `db0fcf91`, and brought up to `7ca80ae1` the same day
(four changes the owner asked for after it: rows N11 and N12 below), then to `dd689297` (the Slides
mode and Export → HTML, format 35, and the Export menu taken out of the bar: rows N13 to N16) and to
`b36e4826` (a pause that skips its wait and «Delete every pause», format 36: in row N13). For
whoever runs it on each machine, a person or an agent. Read `CLAUDE.md` first: its rules hold there.
This section replaces the task of §3 (Windows) and of §7 (the Mac); it keeps their rules and their
tables, named below where they apply.

### Where things stand

- Everything version 1.0.0 has is built, on `main`, and green on Linux (the numbers are under "What
  a green run prints"). The last run on Windows was at `e5b9ec4` and the last on the Mac at
  `7c39a7c`, both on 2026-11-12: **869 commits have run on neither since**, which is most of what
  the app does today.
- **Font text is not part of these runs** (§4): off Linux the companion refuses it at once and the
  editor draws boxes. A failure that is only "a font text is boxes" is not a finding. Nothing of it
  is fixed or built there.
- **What was prepared from Linux for these runs.** The whole e2e suite was run on Linux with the app
  told it is on a Mac and every spec pressing ⌘ where it presses Ctrl (the way of the Mac port, in a
  scratch copy): 1091 of its 1096 tests pass so. The five that do not are of the dressing, not of a
  Mac: four ask a text field for its own undo with ⌘Z, which Chrome on Linux does not do and a Mac's
  Chrome does (`files.spec.ts` "keyboard shortcuts…", `historyCommands.spec.ts` "Block dialog
  keyboard history…", `uiSessions.spec.ts` "…native undo survive…", `textComposition.spec.ts`
  "…native text undo…"), and one presses ⌘S in a browser context the spec makes itself, which the
  dressing did not reach (`textComposition.spec.ts` "a font text is saved inside the .mfe.json…").
  They are the first to look at if they fail on the Mac. The times the e2e order comes from were
  recorded again (`app/e2e/durations.json`), so the slowest specs run first and the pauses of a Mac
  fall where they should. The tests of the build that read the sources for what the two ports found
  (`e2eConventions`, `python`, `lineEndings`, `importCase`, `harnessCompanion`) pass.

### The rules

Those of §3, "Rules of this round", "What is not touched", "If something fails" and "How a fix is
made here", with the branch the owner names for the run read for `windows`: everything the run
changes goes to that branch and to no other, `git pull` first, nothing pushed or merged without the
owner's word, nothing installed but `npm ci` in `app/`, in a fresh clone. A fix that is the
machine's alone and clear is one commit with its test, which takes the system as a parameter so that
it runs on Linux; anything that changes what a user sees, the file format, the companion's protocol
or what an export contains is recorded for the owner, not fixed.

### What each machine needs

What §3 lists for Windows ("What the machine needs"), and for the Mac what the Mac port used: Node
of the versions `app/package.json` asks, Google Chrome stable, Python 3.10 or newer, LaTeX with
`dvisvgm` (MiKTeX, MacTeX), ffmpeg and ffprobe, and the two Manim virtualenvs next to the repository
or named by `MFE_CE_PYTHON` and `MFE_GL_PYTHON`. `app/package-lock.json` is the one of both runs:
`npm ci` in `app/` is needed in a fresh clone only.

One thing is new: **the disk of the system's temporary folder needs room**, 5 GiB free to be at
ease. The companion (1.7) begins no job when less than 1 GiB is free there, and its tests encode
real videos: on a disk nearly full the tests of `test_jobs.VideoJobs` and of `test_audio` fail with
"is nearly full". Record the free room (`python companion/mfe_companion.py health` prints it under
ffmpeg).

### The task, in order

On Windows in Git Bash; from the root of the repository unless it says `app/`. Keep the output of
every step in a folder outside the repository.

1. **The machine and the checkout.** Step 1 of §3 (versions, the scaling of the screen), and the
   branch the owner names, pulled. On Windows `git ls-files --eol | grep -c 'w/crlf'` must print `0`
   (`.gitattributes` is in `main` now: a fresh clone needs nothing else).
2. **The static checks.** In `app/` (after `npm ci` in a fresh clone):
   `../.claude/skills/mfe-change/verify.sh --static`.
3. **The companion alone.** `python companion/mfe_companion.py health --ce-python … --gl-python …`
   (`python3` on the Mac): record the whole report. New in it: under ffmpeg, the folder a video is
   written in, its free room and the limit of a video. Then the two timed compiles of step 6 of §3.
4. **The whole verification.** `MFE_VERIFY_LOGS=<folder>/verify .claude/skills/mfe-change/verify.sh
   --companion`. On Windows add `MFE_E2E_WORKERS` as round 2 did if 2 workers are too slow; on the
   Mac the suite pauses 120 s every 200 tests by itself (about five pauses now). Record the summary,
   the time of each step, every skipped test of the companion with its reason, and how hot the
   machine got if it can be read.
5. **With Manim.** In `app/`: `npm run parity`, then `npm run export-check` (202 cases on Linux,
   where the font-text ones run; off Linux those skip themselves, each with its reason in
   `tests/export/results/summary.json`). It is longer than at the last run: 18 minutes on Linux,
   where the 126 cases of round 2 took 12.
6. **From the app, with the companion running** (`serve --allow-manim-render --ce-python …
   --gl-python …`, and `npm run dev` in `app/`): a formula is drawn with its exact LaTeX glyphs
   ("Renderer: LaTeX"); a video through Companion · ffmpeg; Render with Manim with each library; a
   cancelled render leaves no process and no folder (C3 of §2).
7. **The companion's limit of a video (new, 1.7).**
   - `serve --max-video-gib 2`: it prints `Videos: up to 2 GiB each (--max-video-gib), written in
     <folder> while they are encoded.`, and Export → Video → Companion · ffmpeg says "Up to 2 GiB
     per video: the companion’s limit…" under Quality.
   - `serve --max-video-gib 65`: it refuses to start, with "a whole number from 1 to 64 is
     required".
   - With `TMPDIR` naming another folder (in Git Bash `TMPDIR=D:/tmp python
     companion/mfe_companion.py health`; in `cmd`, `set TMPDIR=D:\tmp` first): `health` names that
     folder. Python reads `TMPDIR` before `TEMP` and `TMP` on every system; record whether it does
     there.
   - `serve --max-video-gib 1`, then export a video that passes 1 GiB (MOV · ProRes at 3840 × 2160
     and 60 fps writes about 0.2 MB a frame of a formula on a flat background, measured with ffmpeg:
     some 95 s of scene; a picture of noise at 1920 × 1080, about 1 MB a frame): the export stops
     with "The video is larger than 1 GiB…", nothing is saved, ffmpeg is gone from the processes and
     the job's folder from the temporary folder within a couple of seconds. On Windows this is the
     first time `_kill_tree_windows` ends an ffmpeg in the middle of writing a large file.
8. **Windows only: what §8 left for this run.** The handler of the console's close that removes the
   companion's folders, and a Job Object for the tree of a render (C3). Each is written there with
   its test and the system as a parameter, as §8 says; ask the owner before starting them, and
   record whether they were done.
9. **The Mac only.** Steps 4, 6 and 7 of §7, none of which has run on a Mac yet: the edit list of an
   exported M4A, the companion's refusal of font text at once, and a stop of `serve` in its first
   seconds.

### What a green run prints

On Linux, at `b36e4826`, `verify.sh --companion` with 9 e2e workers:

```text
tsc       ok
eslint    skipped (no files)
prettier  skipped (no files)
vitest    ok (unit + native): 8508 passed | 1 skipped (8509)
companion ok: 363 tests, OK (skipped=2)
e2e       ok: 1189 passed, 9 workers
dist      ok (build, file://): 3 passed
```

`npm run export-check`: 208 passed of 208 in 1113 s, at `bb5fc5b3` (nothing of the app changed
between it and `b36e4826`). `npm run parity`: `PARITY: OK`, at `db0fcf91`: nothing of the glyph
engine or of the companion changed since.

On the other machines the companion's line names more skipped tests (bubblewrap, SIGHUP, symbolic
links, the font-text ones: the reasons of step 7 of §3), the e2e count is the same less the specs
that need a thing the machine lacks, each of which says so, and the font-text cases of the export
check skip themselves.

### What only those machines can say, since the last runs

The rows of §2 still stand. These are new, by what was built since:

| Id | What | What may happen | To record |
|---|---|---|---|
| N1 | The whole e2e suite: 1189 tests where there were 632 | most of the app is newer than the last run; fonts differ (Segoe UI, San Francisco), and so do the encoders | every failure, grouped by cause, with its first failing line |
| N2 | The vertical timeline of Zen mode (`app/src/ui/timeline/axis.ts`, turned a quarter by CSS) | the wheel and the touchpad: a Mac's two-finger scroll gives both axes at once. With Shift held macOS hands the page a wheel already turned sideways (the turn in `deltaX`), where Windows and Linux hand it as it was turned, with Shift beside it: Shift + wheel down shows the next tracks, away from the ruler, on Linux, and may go towards the ruler on a Mac (`useTimelineZoom.ts`; not seen, only read). The pinch | which way the timeline goes for each gesture, by hand (the list below); for Shift + wheel on the Mac, the `deltaX` and `deltaY` of the event |
| N3 | The fly key (T held, Shift+T) and the keys of the timeline's region (I, O, Esc), of the step of time (− and +), V, S and G | a key held repeats differently; − and + sit elsewhere on a Spanish or a Latin American layout; on a Mac Option composes other characters | what each does there, by hand |
| N4 | Ctrl/⌘+F (the search of formulas), Ctrl/⌘+D, Alt+arrows on the timeline | the browser's own find, bookmark and history may take the key first | whether the app gets each key |
| N5 | A Ctrl+click on a Mac is the secondary click | the Preview and the timeline open a menu there; in the world view of the camera and while the scene plays, the scene's own menu | what a Ctrl+click and a two-finger click do in each |
| N6 | The system's clipboard: Copy colour to clipboard (a picked glyph) and Copy in Export → Python | the app only writes it, and a page opened from a file may not be allowed to | that the text arrives in another program, from the dev server and from `app/dist/index.html` |
| N7 | The library of templates and its Sync folder (the File System Access API) | the system's own folder picker; a folder of iCloud or OneDrive | that the file is written and read back |
| N8 | The companion 1.7: the limit of a video and the room of the disk (`shutil.disk_usage`, `_room_problem`) | written on Linux alone: the temporary folder of Windows (`%TEMP%`) and of a Mac (`/var/folders/…`), `TMPDIR` on Windows, an ffmpeg ended while it writes | step 7 above |
| N9 | The camera in a video of the browser, of ffmpeg and of Manim | the encoders of each system at the sizes the tests use | the tests of `e2e/camera*.spec.ts` and the camera cases of the export check, by name |
| N10 | The documentation site (`docs/web/index.html`, opened from a file) | fonts, the players of the examples, the search | that it opens and a player plays, by hand |
| N11 | F held in the world view of a scene with a camera: the pointer takes the objects (`app/src/ui/preview/useObjectsKey.ts`) | written on Linux alone. A Mac does not tell a page of a letter released while ⌘ is down, so the hold ends when ⌘ is let go: the key may have to be pressed again after a drag made with ⌘. On Windows Alt+F opens Chrome's menu and Ctrl+F the browser's search: the key's repeats with Alt or Ctrl held are kept from everyone, which was seen on Linux only | by hand (the list below): what the hold does when ⌘ is let go, and that nothing of the browser opens |
| N12 | The compact face of a block of the Creator (a container query on the block, `:has()`; `app/src/ui/creator/blockFace.ts`) | the system's fonts are wider or narrower: a name may break otherwise, and a badge may no longer fit the ordinary face at 112 px; the face is glass, the tag's colour mixed over the panel (`color-mix()`), whose painted pixels a spec reads for the name's contrast | that the names read in a wide Creator on every tag in both themes, and what the pointer brings to a block's corners, by hand |
| N13 | The Slides mode (`app/src/ui/slides/`, `app/src/ui/timeline/SlideMarks.tsx`): the ruler tinted by zone, the marks, their keys (P, Shift+P; Tab, ←/→, Delete, Enter, Shift+F10 or the Menu key on a mark) | written on Linux alone. P sits elsewhere on no layout, but the Menu key does not exist on a Mac's keyboard, and a Ctrl+click on the ruler there moves the playhead instead of opening the menu; the tints are `color-mix` and a hatch | whether each key reaches a mark; what a Ctrl+click and a two-finger click on the ruler do on the Mac; that a pause set to skip its wait is told apart (violet, «‖▸», a line with an arrow on the ruler) and that the rehearsal jumps over the wait, with sound too; `e2e/slides.spec.ts`, `slideGuard.spec.ts` and `slidesRehearsal.spec.ts` by name |
| N14 | Export → HTML (`app/src/ui/export/htmlExportRun.ts`): the folder written through `showDirectoryPicker`, the zip elsewhere, the page as one file, the scene's sound (AAC from the browser's encoder, else WAV) | the system's folder picker; a folder of iCloud or OneDrive; a name of a scene that the file system does not take; the AAC encoder of each system (the Windows port found its priming differs) | that the folder is written, written again over itself keeping `custom.js`, `player.css` and `index.html`, and that its `index.html` opens with a double click; `e2e/htmlExport.spec.ts` by name; **with a project with sound, that the page plays it and stops it at a pause: no machine has heard it yet** |
| N15 | The exported page itself (`app/src/deck/`): an SVG stage drawn every frame, opened from `file://`, its controls, real full screen, its keys | never run in Safari nor in Firefox, nor on a real GPU: the prefixed full screen of Safari, `dvh`, container queries, `color-mix`, how fast a browser repaints a few hundred SVG paths | `e2e/deckPage.spec.ts`, `deckControls.spec.ts` and `deckParity.spec.ts` by name; by hand in Safari and in Firefox, the heaviest example (`completing-the-square`) played whole |
| N16 | `check.mjs` of an exported folder, run with the system's Node | written and run on Linux with Node 22; it prints `·` and `…`, and reads the files beside it by path | that `node check.mjs` says `OK` in an exported folder, in Git Bash and in PowerShell on Windows, and how its lines read in each console |

### For the owner, by hand

What §3 lists ("For the owner, by hand") still stands. New, on each machine:

- Zen mode (Preferences → Zen mode): scroll the vertical timeline with the wheel and with the
  touchpad, zoom it with Ctrl/⌘ + wheel and with a pinch, hold T and move the mouse, then Shift+T.
  The first track is beside the ruler, on the right.
- The keys with no modifier, on the layout you use: V (camera view), S (split at the playhead), I
  and O (the region), − and + (the step of time), G in align by symbol, Shift+C and Shift+V.
- Ctrl/⌘+F in the Creator: the app's search opens, not the browser's.
- With the multicamera on, in the world view: hold F and drag a formula, then again with Ctrl/⌘ held
  during the drag, and with Alt; nothing of the browser opens. A camera move's menu on the timeline,
  «Isolate in the Preview», and Esc to end it.
- The Creator in the block view, widened to four columns or more: each block a pane of glass tinted
  with its tag's colour, with its name, and its corners under the pointer.
- On the Mac: Ctrl+click and a two-finger click on a clip, on an object of the Preview and on the
  empty scene.
- Export → Video with each of the three encoders, a project with a camera move and with sound: the
  file plays in the system's own player.
- `docs/web/index.html` opened with a double click: the pages, the search and a player.
- The Slides mode (View → Slides): the ruler tinted by zone; right-click the ruler where it is
  blue-green and add a pause and a comment; P and Shift+P; Tab to a mark, the arrows, Delete; View →
  Add a pause after every animation; drag a clip over a pause and answer the question both ways;
  «Stop at pauses» in the transport and Play. Then a pause's menu: «Skip the wait after it», and
  Play again from that pause; View → Skip the wait at every pause, Keep the wait at every pause,
  Delete every pause.
- Export → HTML…: a folder (choose where; open its `index.html` with a double click, in the system's
  own browser too — Safari on the Mac, Edge on Windows), the same exported again over itself, one
  file, and a project with sound: the page plays the sound and stops it at each pause. In the page:
  the arrows and Space, F for full screen, S for the notes, B; `embed-example.html`.
- In a terminal, in the exported folder: `node check.mjs`.
- The bar has five menus (File, Edit, View, Preferences, Help) and the Export… button to their
  right: its arrow lists every export; reach it with Tab and open it with ↓.

### What to write

A new section at the end of this file for each machine, "The run on Windows for 1.0.0" and "The run
on the Mac for 1.0.0", committed on the branch of the run, with what §3 asks under "What to write in
the log": the machine, what `verify.sh` printed with its exit code and times, every failure grouped
by cause, the rows of §2 and of the table above with what each asks, what was fixed (one row per
commit, with what shows on the other systems that it is a no-op there), what was left for the owner,
and where the logs are kept. Then say so to the owner. Do not merge: the Linux machine reads the
record, reviews each commit and runs the whole verification before `main` moves.

## 10. The run on Windows for 1.0.0

Run on 2026-11-18 by an agent on the owner's Windows machine, with the task of §9, on the branch the
owner named for it: `windows-to-v1`, cut that day from `main` at `71f83bbb`. Nothing was pushed (the
owner pushes; the agent's session has no key for the remote, and `git fetch` was refused: the run
started from the `main` the owner had pulled). That day the owner said again that font text is not
for Windows nor for the Mac for now: what is about it is noted here and nothing of it was mended.

### The machine

The one of §5, with what changed: Chrome 157.0.8103.79; Windows 11 Home 25H2, 10.0.26200.9711; the
same Node (26.13.1), npm (11.20.0), Git (2.56.0.windows.2, `core.autocrlf` `true`, no file with CRLF
in the checkout), MiKTeX 26.5 with dvisvgm 3.6, ffmpeg 9.0.2, ManimCE 0.22.0 and ManimGL 1.7.2 in
their two virtualenvs of uv; the Python is still uv's (`MFE_PYTHON=python3.14`, 3.14.9), `python`
and `python3` the aliases of the Microsoft Store. Two screens at 100 %, Developer Mode off,
Defender's real-time protection on, no reserved range of ports. The temporary folder has 505 GiB
free. `npm ci` ran once (30 s). Every command ran in Git Bash, started by the agent's session.

### The first run, before any change

| Step | Result |
|---|---|
| `verify.sh --static` | types ok, 21 s |
| `health` with the two interpreters | everything `[ok]` but font text, `[!!]` for both libraries with the reason of §4; under ffmpeg: "a video is written in `C:\Users\ALEXAN~1\AppData\Local\Temp` (505.1 GiB free) while it is encoded, 4 GiB at most" |
| `compile` twice for each target | 0.96 s and 0.96 s for `ce`, 1.09 s and 1.19 s for `gl` (the compile itself 0.47 s and 0.60 s); `\alpha` into a file is UTF-8 JSON |
| `verify.sh --companion`, 4 e2e workers | **exit 1** in 1468 s: types ok; 8508 unit and native tests passed, 1 skipped (as on Linux); the companion's 363 tests with **1 failure** and 20 skipped; **1189 e2e tests of 1189**; the build opened from `file://`, 3 |
| the times | Vitest 76 s, the companion's tests 542 s, the e2e suite 13.3 minutes, the build 30 s |
| `npm run parity` | `PARITY: OK` (9 s: the companion's disk cache of round 2 was there) |
| `npm run export-check` | 196 passed and 12 skipped of 208 in 1392 s; the 12 are the font-text cases, six for each library, each with its reason in `summary.json` |
| TEMP after the suites | no `mfe-jobs-*`, `mfe-probe-*`, `mfe-harness-*` nor `mfe-e2e-*` left (`c9e5f6b` and `50966fd` do what §8 asked); one `mfe-test-*`, of the test that failed |

How hot the machine got could not be read. The 128 folders round 2 had left in TEMP were removed
before the run, on the owner's word.

### The one failure, and its cause

| Cause | Test | First failing line | Repeats |
|---|---|---|---|
| A server ended at once leaves the ffmpeg of its job to end by itself, with the job's folder as its own; Windows removes no folder a process holds, and the helper tried once | `test_cli.ServeEnvironment.test_a_server_ended_at_once_leaves_nothing_behind` | `self.assertFalse(os.path.exists(folder))`: `True is not false` | always when the server is ended right after the job is made (measured: `PermissionError`, error 32, for 0.2 s) |

No e2e test failed: none of the fonts, of the encoders, of the keys. The font of the system (Segoe
UI) moved nothing a spec reads.

### What was changed

Thirteen commits. The first four are the companion's: the failure, a thing asked of the owner, and
the two of §8. "Elsewhere" is what Linux and macOS get.

| Commit | What | Elsewhere |
|---|---|---|
| `ab40e5b1` | The tests' `serve_environment()` removes its folder with `remove_folder()`, which tries again for a few seconds: the failure above | the first removal succeeds, as it did; two tests play the folder that is held, on any system |
| `03505d6e` | `folder_as_said()`: on Windows a folder with a `~` in its name is said by its long name in `health`, in the notice of `serve --max-video-gib` and in the message of a disk that is nearly full. Asked of the owner, who said yes | every folder is said as it was given (a Mac's `/var/folders` is not resolved); the tests give the function its system |
| `a74fb7ea` | **A Job Object for every child** (§8, C3; the owner chose "every child", not the render alone). `_spawn()` is the one place a child starts: on Windows suspended, put in a job that ends what it holds when it is closed, then resumed; `_kill()` ends the job. `taskkill /T` stays for a child that could not be put in a job | `_spawn()` calls `subprocess.Popen` with what each of the five places gave it and `start_new_session=True`, as before; the calls of Windows sit behind an object made on Windows alone, which eight tests play on any system |
| `ee9788fa` | **A console window that is closed stops `serve` in order** (§8, C8): `_ConsoleClose`, a handler set with `SetConsoleCtrlHandler` that asks the server to stop as Ctrl+C does and returns once the clean-up is done, or after 4.5 s of Windows' 5 s | nothing is set and nothing imported; seven tests play Windows' console on any system against a real server and a real companion |

The two of §8 were written by two agents, each in a copy of the repository outside it (a worktree
with no branch), and read, applied and run by the agent of the run. **An independent reader** then
went through the four commits, without the author's conclusions, for what they do on Linux and on a
Mac: it found nothing that changes there or fails a test there, and gaps on the side of Windows,
mended in five commits more:

| Commit | What the reader found | Elsewhere |
|---|---|---|
| `bb33447c` | A job's process and a probe were ended only while they ran, so what a launcher that died by itself had left was not ended by a cancel, as the documentation said it was. `_has_to_end()`: on Windows a child with a job is ended with what it left, gone or not | a child has no job: one that has gone is left alone, as before (its id may be another process's) |
| `9e56c32f` | An exception between a child's creation and its resume (Ctrl+C in `health` or `compile`) left a process suspended for ever. It is ended, its job closed, and the exception goes on | `_spawn()` is one call of `subprocess.Popen` there |
| `32f255e6` | The test that reads the source no longer forbade a caller from telling `_spawn()` which system it is on. It reads the five calls: none gives `windows`, `api` or `popen` | a test of the source: the same on any system |
| `334ccbf2` | Two tests of `03505d6e` expected the resolved name of every folder on Windows, where the code resolves only one with a `~`; and the words said Windows gives a short name to a user with a space in the name, where a name of more than eight characters gets one too | the tests expect there what they did |
| `002bd691` | `ee9788fa` entered the console's block after the handlers of SIGTERM and SIGHUP were set: a few steps more between a signal and the `try` that cleans up, on every system. The block begins first, the signals are taken inside it | `serve` is step for step what it was before the block; a test plays the order on any system |

What the reader named and was left: `_kill()` waits for the child, not for what the child started,
before the job's folder is removed (never seen to matter: 0 of 15 there, 0 of 30 by the agent that
wrote it); a console that Windows Terminal hosts has no window to close, so the real test of
`ee9788fa` skips itself there, saying so (this machine has conhost: it ran); and MiKTeX installing a
package on the fly inside a job, which was not seen, as in round 2.

Then the whole verification on those four commits found **two e2e tests failing**, of the 1189 that
had passed three hours before. Neither is Windows': both are races that a machine with nothing else
to do loses, and this one had been busy during the first run (probes of the agent beside the suite).
Alone, with one worker: 5 of 5 and 12 of 12 failed.

| Commit | The test | The cause | Elsewhere |
|---|---|---|---|
| `437107e0` | `e2e/creator.spec.ts` "a formula with rows is shown in aligned rows; the raw LaTeX keeps them bare": `ML__mtable` not in the field | MathLive has its LaTeX 42 to 106 ms before it has drawn it, and the spec read the drawing once. It passed where its first look at the value came too early and the second, 100 ms later, found both. The spec waits for the drawing | a spec; nothing of the app |
| `cbf01bb9` | `e2e/line.spec.ts` "a selected line shows no handles at its ends while the scene plays": the handle does not come back after the pause | **A defect of the app, on every system**: the browser stamps a frame with the instant it began, playing may begin later in that frame, and the playback clock gave the first frame a negative time. The scene stood up to a frame before where it was played from (2 s became 1.995964 s), and a pause right then left the playhead before the start of the clip. A frame from before playing began now counts as no time passed (`playbackController.ts`). Asked of the owner, who chose the app over the spec | **the app changes there too**: the first frame of playback no longer goes back. A unit test with a clock of its own |

And two more. `ac9f56fb`, of the documentation's tools (N10, below): the capture tool encodes a clip
in the limited colour range; asked of the owner too. And `2d34f542`, a test of `ee9788fa` that
failed now and then: `test_cli.ConsoleClose.test_the_wait_is_bounded` asked that a wait of 0.5 s
took 0.5 s by the test's clock, and a wait of Windows ends on a tick of the system's, which may
fall a little before (0.49964 s and 0.49999 s were seen). It failed once early in the round, its
name not kept, and twice in 34 runs of its module beside the last export check, which is how it was
caught. The test allows one tick (1/64 s); the handler is what it was.

### The last run

On `ac9f56fb`, the twelfth commit, `verify.sh --companion` with 4 e2e workers ended with exit code 0
after 1416 s, with nothing else running beside it:

```text
tsc       ok
eslint    skipped (no files)
prettier  skipped (no files)
vitest    ok (unit + native): 8509 passed | 1 skipped (8510)
companion ok: 392 tests, OK (skipped=20)
e2e       ok: 1189 passed, 4 workers
dist      ok (build, file://): 3 passed
```

Vitest took 95 s, the companion's tests 515 s, the e2e suite 13.0 minutes, the build 25 s. One unit
test more than Linux's 8508 (the playback clock's) and 29 more tests of the companion than its 363.
The companion's 20 skipped tests each say why, the reasons of step 7 of §3: bubblewrap (9), "needs a
POSIX system" (5), symbolic links (2: Developer Mode is off), "no SIGHUP here" (2), the font table
(1) and `NativeText` (1). None of the new tests is among them: the ones that need Windows ran.
Nothing of the suites was left in TEMP.

With Manim, on the same commit: `npm run export-check` has no failure in 1336 s, 196 passed and 12
skipped, the font-text cases, each with its reason; `npm run parity` says `PARITY: OK`, in 7 s with
the companion's disk cache and in 87 s with an empty one (`XDG_CACHE_HOME` naming a new folder), so
that LaTeX really ran, each of its programs in a job.

The thirteenth commit, `2d34f542`, came after these runs and changes the bound of one test of the
companion, nothing else: `test_cli`, its module, then passed 14 times of 14 on it, the first of
them beside the export check.

The run before, on the four first commits (`ee9788fa`), is the one that lost the two races: exit 1
in 1431 s, 1187 of 1189.

What the Job Object changes on Windows, measured there: ending a child takes 1 ms where `taskkill`
took 50 (a cancelled render answers in 4 ms); a launcher that has died no longer hides its tree
(`taskkill /T` of a dead launcher: exit 128, the interpreter under it alive; the job ends it); and a
companion ended at once takes its children with it, where a render went on for as long as it had
to. A start costs half a millisecond more and a compile takes what it took. What closing the window
does now: with no job running the companion is gone in 0.1 s with nothing left in TEMP; with a video
being encoded, 5.5 s, because Windows asks the processes of the console one after the other, the
newest first, and ffmpeg waits out its 5 s for frames that will not come.

### From the app, and the limit of a video (steps 6 and 7)

With the companion started as the README says and the app in Chrome (headless: it cannot answer the
system's "Save as", so the files came as downloads):

- **Step 6.** "Renderer: LaTeX" ("2 formulas exact (LaTeX)"); a video through the companion's
  ffmpeg in 1.0 s; Render with Manim in 2.6 s with ManimCE and 5.2 s with ManimGL, each an H.264 MP4
  of 50 frames and 5.000000 s; a render cancelled and the next one through; the companion ended with
  Ctrl+Break: status 0, no process and nothing of it in TEMP. C3 was read with a slow scene asked of
  the companion itself: under it, while ManimCE renders, the virtualenv's launcher and the
  interpreter; 4 ms after the cancel neither is alive and the job's folder is gone; and with the
  companion ended at once in the middle of a second render, neither is alive 1.5 s later (its
  `mfe-jobs-*` stays, since nothing ran to remove it).
- **`serve --max-video-gib 2`** prints "Videos: up to 2 GiB each (--max-video-gib), written in
  C:\Users\…\AppData\Local\Temp while they are encoded." (the long name, after `03505d6e`) and the
  dialog says "Up to 2 GiB per video: the companion’s limit. Start it with --max-video-gib to give
  it another." **`--max-video-gib 65`** starts nothing: "a whole number from 1 to 64 is required,
  not '65'", status 2.
- **`TMPDIR`**: Python reads it first on Windows too. `health` names the folder it gives, written
  the way of Git Bash or of Windows, with a space in it. A `TMPDIR` that names no folder is passed
  over without a word, for `TEMP` (Python's own rule, on every system).
- **Over the limit.** With `--max-video-gib 1`, a MOV (ProRes) at 3840 × 2160 and 60 fps of the
  `hello` example made 260 s long: at frame 12 608 of 15 600, after 460 s, the dialog says "The
  video is larger than 1 GiB, the most this companion writes for one video, so it was stopped. …",
  nothing is saved, and at once ffmpeg is gone and the job's folder with it. (A formula on a flat
  background takes 0.085 MB a frame here, not 0.2: the 100 s §9 reckons give a file of 495 MB, which
  is saved.) It is the first time a Job Object, not `_kill_tree_windows`, ended an ffmpeg in the
  middle of a large file.
- **What `serve` prints** (§8): the texts of `41b1418` for a system with no sandbox, with and
  without `--allow-manim-render` and `--allow-file-origin`; nothing of bubblewrap or of TeX Live.
- **The two "On Windows" sections** (§8) say what is so here; `uv run
  companion/mfe_companion.py health` works as they say (with uv's default Python, 3.15.1). One
  bullet of the README had lost its indent, mended in `ee9788fa`.

### §2 and §9, row by row

| Id | What was seen |
|---|---|
| A1, A4, N2, N3, N4, N11 | Not seen: they need the keys and the gestures of a person. Every spec that presses those keys passes in a headless Chrome. For the owner, by hand |
| A2, N14 | The 16 tests of `e2e/audioExport.spec.ts` and the 5 of `htmlExport.spec.ts` pass. A project with sound and a pause, exported from the app as a zip and as one file: the folder has `audio.m4a` (AAC, 5.000000 s, 240 000 samples, an edit list with `media time: 1024`), and its `index.html` opened from the disk **in Chrome and in Edge** plays the sound with the scene (0.66 s of sound at 0.70 s of scene), stops both at the pause (1.5 s; the sound at 1.47 s, paused) and goes on with both. Read from the page's `<audio>`, not heard: a headless browser has no ears. The folder written through the system's picker was not seen (the spec writes it in the browser's own storage) |
| A3, N9 | The tests of `e2e/video*.spec.ts` (26), the 56 of `e2e/camera*.spec.ts` and the camera cases of the export check (`camera-cuts`, `camera-latex`, `camera-mathjax`, `camera-moves`, `camera-portrait`, `slide-pauses-camera`, with each library) pass |
| A6, N1 | 1189 of 1189 at the first run; no failure of a font or of an encoder. Two lost a race on the idle machine three hours later, neither of them Windows' (`437107e0`, `cbf01bb9`) |
| C3 | Done: `a74fb7ea`, above |
| C8 | Done for the window: `ee9788fa`. Ctrl+C and Ctrl+Break as round 2 left them (status 0, nothing left). A log-off and a shutdown could not be tried, and may not reach the handler at all: Windows does not send them to a process that loaded `user32.dll`, which OpenSSL (`hashlib`) does |
| C13, C14 | ManimCE and ManimGL render from the app, each child now started suspended in its job |
| C15, C10 | They pass |
| J12 | TEMP is clean after the suites (above). A companion ended by a harness now takes its children with it |
| J14, T13 | No reserved range; nothing that looked like Defender |
| N6 | Not seen: reading the system's clipboard back would have taken the owner's. `e2e/previewGlyphs.spec.ts` (14) passes |
| N7 | Not seen: the system's folder picker. By hand |
| N8 | Step 7, above: every part holds on Windows |
| N10 | `docs/web/index.html` opens from the disk in Chrome and in Edge with nothing in the console; the player of the first page plays, `/` takes the search, and a search leads to its page (`basics/slides.html#skip-wait`). **But 87 of its 140 clips do not play on this machine** (below) |
| N12 | Looked at in both themes at 1440 × 900 (`shot.mjs`): the names read. The rest by hand |
| N13 | The tests of `e2e/slides.spec.ts` (46), `slidesRehearsal.spec.ts` (5) and `slideGuard.spec.ts` (3) pass. The keys by hand |
| N15 | `e2e/deckPage.spec.ts` (5), `deckControls.spec.ts` (16) and `deckParity.spec.ts` (5) pass; the page was opened in Edge too (above). No Firefox and no Safari was tried |
| N16 | `node check.mjs` (Node 26) says `OK: "hello-sound" plays as written.` and ends with 0 from Git Bash, from PowerShell and from `cmd`, and from another folder with the scene's path. With a mistake in `scene.js` it ends with 1 and prints `scene.js:146 · clips[0].outro.easing: Invalid option: …`. The `·` is UTF-8: through a pipe of Windows PowerShell 5.1 (code page 850 here) it reads `┬À`; `cmd`'s redirection keeps the bytes. On a console window Node writes it as it is (not seen: there was no window) |

### What was left, and why it is the owner's

- **The clips of the documentation do not play on this machine.** Of the 140 `.webm` of
  `docs/web/media`, 87 end in "PIPELINE_ERROR_DECODE: video decode error!" at their first frames, in
  Chrome and in Edge, with a window or without one; with `--disable-accelerated-video-decode` the
  140 play to their end, and ffmpeg decodes them all. They are the ones 364 px high or more, which
  Chrome hands to the graphics adapter's decoder (a Radeon RX 9070 XT, driver 32.0.32015.7029). The
  cause is their **full colour range**: one of them encoded again with `-color_range tv` plays, and
  encoded again in full range, at its size or at a size that is a multiple of 16, it does not. The
  page then says "no light variant of …: showing the dark one", and the dark one fails too. The
  clips are made by `docs/web/tools/capture-kit/output.mjs` (`encodeClip`), from JPEG frames, which
  are in full range. **The tool is mended** (`ac9f56fb`, on the owner's word: `scale=out_range=tv`
  and `-color_range tv`; a clip it makes now plays through the adapter's decoder, with the picture
  it had). **The 140 clips of the site are still the old ones**: they are made again on Linux,
  whose fonts they show, with `ffprobe` saying `color_range=tv` of each afterwards. Other adapters
  may well decode the old ones. The probes and the variants are in `~/mfe-windows-v1/n10`.
- **The two looping previews take their time as the main playback did** before `cbf01bb9`
  (`ui/relations/useLoopClock.ts`, `ui/animations/BlockPreview.tsx`: the frame's timestamp less
  `performance.now()` at the start): their first frame may show the end of the loop. Not touched:
  the owner said yes to the main playback, and no test fails for these.
- **A spec that proves little**: `e2e/creator.spec.ts` "MathLive works: fonts load and macros of a
  package are previewed" reads the field once, right after it is filled, for the absence of
  `ML__error`. On a quick machine the field has drawn nothing yet (the race of `437107e0`, the
  other way round), and nothing has no error in it. It passes; it would pass with the macro broken.
- **`check.mjs` prints `·`**, which reads `┬À` through a pipe of Windows PowerShell 5.1 (N16). It is
  part of what an export contains: not touched.
- **A console window closed while a video is encoded** takes 5 s for each ffmpeg before the
  companion's turn. Children with no console (`CREATE_NO_WINDOW`) would not be asked; it would also
  change what Ctrl+Break reaches, and costs a `conhost` for each child: not done.
- **A log-off and a shutdown** would need a hidden window that answers `WM_ENDSESSION`: not done.
- **The e2e suite on an idle machine.** The two races above passed for as long as something ran
  beside the suite. There may be others of the kind that no run here has lost yet.
- **By hand**, as §3 and §9 list them: everything there still stands.

### For the Mac, and then for Linux

- `verify.sh --companion`, `npm run parity` and `npm run export-check`, as §9 says.
- The tests that play Windows on any system must pass there: `test_jobs.ProcessTrees` (the Job
  Object, with a played API), `test_cli.ConsoleClose` (all but the last, which closes a real
  window), `test_cli.ServeEnvironment`, `test_jobs.CommandLines`
  (`test_a_message_names_a_folder_of_windows_by_its_long_name`) and
  `test_cli.Health.test_the_report_names_the_temporary_folder_as_a_message_says_a_folder`.
- What to watch: every child of the companion now starts through `_spawn()` (LaTeX, dvisvgm, the
  two ffmpeg, Manim, the probes, and on Linux the font-text worker and what bubblewrap wraps), and
  `serve` runs its loop inside a `with` block. Neither should change anything there:
  `test_cli.Signals`, `test_pango` and the Manim and sandbox classes of `test_jobs` are the ones to
  read first.
- **`cbf01bb9` changes the app on every system** (the first frame of playback):
  `ui/transport/__tests__/playbackController.test.ts`, and the e2e specs that play the scene.
- `437107e0` is a spec that waits where it read at once: it should pass there as it did.
- On Linux, the clips of the documentation made again with the tool of `ac9f56fb`.

### What is kept and where

Outside the repository, in `~/mfe-windows-v1` on the Windows machine: the output of every step
(`01-…` to `17-…`), the logs of each `verify.sh` (`verify-1/`, the first run; `verify-2/`, the one
that lost the races; `verify-3/`, the last), the reports and files of steps 6 and 7 (`06-…`,
`07-…`), of the HTML export (`n14/`) and of the documentation site (`n10/`, with the clip the tool
makes before and after `ac9f56fb`), the screenshots (`shots/`), the runs of `test_cli` beside the
export check (`cli-load/`), the two patches as the agents handed them back (`job.patch`,
`close.patch`) and the probes written for the run (`probes/`).

## 11. The run on the Mac for 1.0.0

Run on 2026-11-18 and 2026-11-19 by an agent on the owner's Mac, with the task of §9, on the branch
the owner named for it: `mac-to-v1`, cut on the 18th from `windows-to-v1` at `a23cc3fe` (the record
of the run on Windows). Nothing was pushed: the owner pushes. Two words of the owner shaped the run.
The machine has no fan: **a heavy run works about six minutes and then rests two**, never two heavy
runs at once. And, said on the 18th: **the app is for Google Chrome**; Safari is not looked at, so
that nothing of Safari is tried, mended or listed by hand here.

### The machine

A MacBook Air with an M1 (8 cores, 8 GB, no fan), macOS 26.6.2 (25G83), its disk APFS, not sensitive
to case. Node 24.18.0, npm 12.2.2, Chrome 157.0.8103.79, Git 2.55.0; Python 3.14.7 of Homebrew as
`python3` (the one of the Command Line Tools, `/usr/bin/python3`, is 3.9.6); TeX Live 2026 of MacTeX
(pdfTeX 1.40.29, dvisvgm 3.6, in `/Library/TeX/texbin`); ffmpeg 9.0.1 of Homebrew; ManimCE 0.22.1
and ManimGL 1.7.2, each in a virtualenv outside the repository, on Python 3.14.7, named by
`MFE_CE_PYTHON` and `MFE_GL_PYTHON`. The temporary folder is `/var/folders/…/T` (`TMPDIR`), with 113
GiB free. `app/package-lock.json` is the one of the last run there (`7c39a7c`): no `npm ci`. Every
command ran in zsh, started by the agent's session; the browser of the suites and of the probes is
the system's Chrome, headless.

### How the suites were run

`verify.sh --companion` runs its steps one after the other with no rest: here its steps were run one
by one, with the commands it runs and two minutes between them when the load came near six. The
companion's tests ran module by module (the two classes of `test_fidelity` apart), which `python3 -m
unittest discover -s companion/tests -p <module>` does; the e2e suite rests by itself (120 s every
200 tests: stretches of 4 to 5 minutes); the export check ran in six groups of cases chosen by name
(`vitest run --config vitest.export.config.ts -t <names>`), 141 to 293 s each. So the lines below
are the ones `verify.sh` would print, put together from its steps, and the times are of each step
alone. The sensor of the battery, the only one that can be read without root, stayed between 30.1
and 31.2 °C over the first day and between 29.5 and 30.8 °C over the last run; `pmset -g therm`
named no limit of the processor's speed at any time.

### The first run, before any change

On `a23cc3fe`:

| Step | Result |
|---|---|
| `verify.sh --static` | types ok, 23 s |
| `health` with the two interpreters | everything `[ok]` but font text, `[!!]` for both libraries with the reason of §4; under ffmpeg: "a video is written in /var/folders/…/T (113.0 GiB free) while it is encoded, 4 GiB at most" |
| `compile` twice for each target | 0.51 s and 0.47 s for `ce`, 0.64 s and 0.62 s for `gl`; `\alpha` into a file is UTF-8 JSON |
| Vitest (`npm test`) | 8509 passed, 1 skipped, of 8510, in 69 s: the numbers of Windows |
| the companion's tests | 392 tests, OK, 18 skipped, in 442 s of tests |
| the e2e suite, 2 workers | **1189 of 1189** in 37.3 minutes, 27.3 of them of tests: 5 pauses, with stretches of 4:28, 4:28, 4:55, 4:54, 4:29 and 4:02 between them |
| `npm run dist-check` | 3 passed |
| `npm run parity` | `PARITY: OK` (6 s: the companion's disk cache of the Mac port was there) |
| `npm run export-check` | 196 passed and 12 skipped of 208, in 1337 s of its six groups; the 12 are the font-text cases, six for each library, each with its reason in `summary.json` |
| `TMPDIR` after the suites | nothing of them left (`mfe-jobs-*`, `mfe-probe-*`, `mfe-harness-*`, `mfe-e2e-*`, `mfe-test-*`) |

**Nothing failed**: there is no failure to group by cause. The five tests §9 named as the first to
look at pass: Chrome on a Mac gives a text field its own undo with ⌘Z. No test of a font (San
Francisco) or of an encoder failed.

The companion's 18 skipped tests, each with its reason: bubblewrap (9: seven "bubblewrap is not
usable here", two "bubblewrap is Linux's"), "a Job Object is a thing of Windows" (6), "a console
window and its closing are Windows'" (1), "Ctrl+Break is a key of Windows" (1) and `NativeText` (1:
"Native text mapping needs the Linux Pango/Fontconfig backend"). The tests that play Windows on any
system ran and pass (§10, "For the Mac"): `test_jobs.ProcessTrees`, `test_cli.ConsoleClose` but its
last, `test_cli.ServeEnvironment`, the two of the folder's long name.

For the Linux machine to compare, the IoU of `hello`, `emphasis`, `paint-channels` and
`camera-moves` is 0.947, 0.936, 0.876 and 0.995 with ManimCE and 0.790, 0.798, 0.874 and 0.917 with
ManimGL. The slowest case is `completing-the-square`: 30 s with ManimCE, 21 s with ManimGL.

### What was changed

Three commits before this record. Nothing failed, so none of them mends a failing test: two are
defects of the app and of the companion that only a Mac shows and that the task named (N5, N13, and
C8 for a Mac's terminal), the third is documentation. "Elsewhere" is what Linux and Windows get.

| Commit | What | Elsewhere |
|---|---|---|
| `34a68b65` | **A stop of `serve` is not cut short by its signal coming again.** A Terminal window that is closed hangs up twice, the system to the processes of the terminal and zsh to its jobs: the second SIGHUP came while `serve` cleaned up, the handler raised again, and the clean-up ended there. With no job: a traceback and nothing left; with a video being encoded: a traceback and `mfe-jobs-*` left, 2 times of 2. The handler now sets the signals `serve` took to be ignored before it raises; Ctrl+C still interrupts a clean-up that hangs. Closing the window afterwards: no traceback, nothing left | **The same code on every system, and not a no-op there**: a second SIGTERM or SIGHUP during the stop, and on Windows a second Ctrl+Break, is now ignored where it cut the clean-up short. Two tests send the signal again every millisecond for as long as the server lives (`test_cli.Signals`, on any POSIX system; without the fix: status -15 and `mfe-jobs-*` left), and `test_it_takes_the_signals_the_system_has` plays Windows' two on any system |
| `7da6ce2e` | **On a Mac a Ctrl+click presses nothing** (N5, N13). It is the secondary click there: Chrome sends the press of the main button with Ctrl held, then the menu's event, and no click. Every press of the interface that read `button === 0` took it for its own before the menu opened: the playhead went to the pointer on the ruler (and the ruler's menu of the Slides mode opened over it), a clip left the selection its menu was asked for, so that the menu of several clips could not be opened with a Ctrl+click; an object of the Preview was toggled; a camera rectangle began a drag and the scene's menu opened instead of the camera's; in Edit path the curve got an anchor; Hold to delete began its hold. The 37 presses of `app/src/ui` now ask `isMainClick` (`ui/pointer.ts`), as those of a line and of a slide mark already did. Seen with a real Ctrl+click in Chrome, before and after: after, every place answers as to the secondary button | `isMainClick(event)` is `event.button === 0 && !(event.ctrlKey && isMac())`: off a Mac it is the comparison it replaces, and Ctrl+click still adds to a selection there. `e2e/macSecondaryClick.spec.ts` dresses the browser as a Mac and sends the events as a Mac's Chrome does, on any system (5 tests, each compared with the click of the secondary button; all five fail without the fix); `app/build/__tests__/mainClick.test.ts` reads the sources of `ui/` for a press that reads the button itself (it lists each of them without the fix) |
| `5d4e11a8` | **"On macOS" in `README.md` and in `docs/COMPANION.md`**, beside "On Windows": what to install, that `python3` must not be the system's 3.9, where MacTeX is, that there is no sandbox and no font text there, where the temporary files are, and that Ctrl+C or closing the Terminal window stops the companion in order | documentation |

**The second one changes what a user does on a Mac**, which §9 keeps for the owner. It was made
because §9 itself names it as the thing to look at (N5, N13: "a Ctrl+click on the ruler there moves
the playhead instead of opening the menu"), because one of its effects writes to the project (the
anchor of Edit path) and another hides a menu (several clips), and because off a Mac it is the same
code: it is one commit, and reverting it restores what was. The owner was told the day it was made.
What it leaves as it was: a release (`preview/LineLayer.tsx`), and the exported page (below).

### The last run

On the tree of `7da6ce2e` and `5d4e11a8` together (they were verified as one tree and committed one
after the other; the second adds documentation alone), each step of `verify.sh --companion` with
exit code 0, on a machine with nothing else to do:

```text
tsc       ok
eslint    ok (28 files)
prettier  ok (28 files)
vitest    ok (unit + native): 8512 passed | 1 skipped (8513)
companion ok: 394 tests, OK (skipped=18)
e2e       ok: 1194 passed, 5 pause(s) to cool
dist      ok (build, file://): 3 passed
```

Vitest took 68 s, the companion's tests 430 s, the e2e suite 36.6 minutes with its five pauses
(stretches of 4:14, 4:19, 4:43, 4:48, 4:25 and 4:06), the build 27 s. Three unit tests more than the
first run (`mainClick.test.ts`), two more of the companion (`test_cli.Signals`) and five more e2e
tests (`macSecondaryClick.spec.ts`). The companion's 18 skipped tests are the 18 of the first run.
No race was lost: §10 found two on an idle machine, and this run was on one. Nothing of the suites
was left in `TMPDIR`.

With Manim, on the same tree: `npm run parity` says `PARITY: OK`, in 5 s with the companion's disk
cache and in 68 s with an empty one (`XDG_CACHE_HOME` naming a new folder), so that LaTeX really
ran; `npm run export-check` has no failure in the 1310 s of its six groups: 196 passed and 12
skipped of 208, the font-text cases, each with its reason.

### From the app (steps 6, 7 and 9)

With the companion started as the README says (`serve --allow-manim-render` with the two
interpreters) and the app in the system's Chrome (headless: the files came as downloads):

- **Step 6.** "Renderer: LaTeX" ("2 formulas exact (LaTeX)", Companion 1.7.0, tools latex, dvisvgm,
  ffmpeg, ManimCE 0.22.1 and ManimGL 1.7.2); a video through the companion's ffmpeg in 0.9 s; Render
  with Manim in 2.1 to 2.6 s with ManimCE and **16.2 to 16.7 s with ManimGL** (below), each an H.264
  MP4 of 50 frames and 5.000000 s. A render of `completing-the-square` at 1920 × 1080 and 60 fps
  (2250 frames) cancelled at frame 76 with ManimCE and at frame 183 with ManimGL: the companion
  answered in 76 and 71 ms, and at once no process of the render was alive (the interpreter, its
  ffmpeg, the resource tracker under it) and the job's folder was gone (C3); the next render went
  through. Ctrl+C afterwards: status 0, nothing left in `TMPDIR`.
- **`serve --max-video-gib 2`** prints "Videos: up to 2 GiB each (--max-video-gib), written in
  /var/folders/…/T while they are encoded." and the dialog says "Up to 2 GiB per video: the
  companion’s limit. Start it with --max-video-gib to give it another." **`--max-video-gib 65`**
  starts nothing: "a whole number from 1 to 64 is required, not '65'", status 2.
- **`TMPDIR`** naming another folder, with a space in its name: `health` names it. One that names no
  folder is passed over for `/tmp` (Python's own rule).
- **Over the limit.** With `--max-video-gib 1`, a MOV (ProRes) at 1920 × 1080 and 60 fps whose
  frames were replaced by noise on their way to the companion (0.97 MB a frame as ProRes): at frame
  1136, after 233 s, with 1 075 052 580 bytes written, the companion answered 507 and the dialog
  says "The video is larger than 1 GiB, the most this companion writes for one video, so it was
  stopped. Export a shorter range, a smaller size or a lower quality, or start the companion with a
  higher limit: serve --max-video-gib N (up to 64)."; nothing is saved, and at once ffmpeg is gone
  and the job's folder with it.
- **The sound of an export** (step 4 of §7). The 16 tests of `e2e/audioExport.spec.ts` pass. An M4A
  of 2 s exported from the app, three times from one page and once from another: each has the edit
  list "media time: 2112, duration: 96000", `duration_ts=96000`, 96 frames and 2.000000 s. The first
  export of a page took 203 ms and the next two 170 and 155 ms; the first of the other page 182 ms:
  the lead-in asked once per page costs 30 to 50 ms, which nobody sees.
- **Font text** (step 6 of §7). With the companion running, a text with a font: the workspace says
  "Rendering Pango…" for a quarter of a second and, 361 ms after it opened, "Placeholder boxes ·
  needs the companion", with "Font catalog unavailable: Native text mapping currently requires the
  Linux Pango/Fontconfig backend."; no worker process started, and `GET /health` gives `pango` as
  `failed` with that message for ManimCE. Applied, the object carries the badge "needs the
  companion" and the status bar says "Renderer: mixed". (With ManimGL it took 13 s before
  `a330704`.) The words say "needs the companion" with the companion running: below.
- **A stop in the first seconds** (step 7 of §7). Ctrl+C 0.3 s and 0.6 s after `serve` started,
  while it still asked an interpreter for its Manim: status 0 in 0.03 s, no traceback, no
  interpreter left, no `mfe-probe-*` in `TMPDIR`. From 1.0 s on the probes had ended.
- **Closing the Terminal window**: above (`34a68b65`).
- **The Python of the system** (`/usr/bin/python3`, 3.9.6) runs `health` to its end, with status 0.
  The companion asks for 3.10: what else of it runs on 3.9 was not tried.

### §2 and §9, row by row

| Id | What was seen |
|---|---|
| A1, A4, A5, C4, J14, T1, T8, T13 | Windows' own (Alt and Chrome's menu, AltGr, the Menu key, MiKTeX, the reserved ports, Defender): nothing of them on a Mac. LaTeX is MacTeX, which installs nothing on the fly: the first compile takes what the second does |
| A2 | The 16 tests of `e2e/audioExport.spec.ts` pass; an M4A exported from the app has the edit list and the length §7 asks (above) |
| A3, N9 | The tests of `e2e/video*.spec.ts` (26), the 56 of `e2e/camera.spec.ts` and the camera cases of the export check (`camera-cuts`, `camera-latex`, `camera-mathjax`, `camera-moves`, `camera-portrait`, `slide-pauses-camera`, with each library) pass |
| A6, N1 | 1189 of 1189 at the first run, and 1194 of 1194 at the last, with the five new tests. No failure of a font or of an encoder |
| A7 | The screen of the Mac is at 2 ×: the specs run at 1 ×, headless. A window moved to a screen of another density: not seen, by hand (below, "What was left") |
| C3 | A cancelled render leaves no process and no folder, with each library (above) |
| C8 | Ctrl+C, SIGTERM and SIGHUP stop `serve` in order (`test_cli.Signals`); closing the Terminal window did not, and does since `34a68b65` |
| C10 | `test_audio.VideoSound.test_unknown_jobs_methods_and_origins` and the tests like it pass |
| C13, C14 | ManimCE and ManimGL render from the app with the environment of a job; ManimGL finds the graphics of the M1 |
| C15 | `test_http.Security.test_cannot_write_outside_the_working_directory` passes, with and without the sandbox's class |
| J12, J13 | `TMPDIR` is clean after the suites; `dist.spec.ts` passes (3) |
| N2 | Not seen: read in the code that Shift + wheel goes the other way on a Mac (below). The gestures by hand |
| N3, N4, N11 | Not seen: they need the keys of a person. Read in the code, where nothing wrong for a Mac was found (the shortcuts, what Option composes, the keys that are held, the keys of a mark and of the exported page); every spec that presses them passes. By hand |
| N5, N13 | **Mended** (`7da6ce2e`): a Ctrl+click on a clip, on the ruler with the Slides mode on and off, on a mark, on an object of the Preview, on the empty scene, on a rectangle of the camera and in Edit path now does what the secondary button does. The tests of `e2e/slides.spec.ts` (46), `slidesRehearsal.spec.ts` (5) and `slideGuard.spec.ts` (3) pass. The Menu key does not exist on a Mac's keyboard: Shift+F10 opens a mark's menu there (a spec presses it). The tints and the rest by hand |
| N6 | Not seen: reading the system's clipboard back would have taken the owner's. `e2e/previewGlyphs.spec.ts` (14) passes |
| N7 | Not seen: the system's folder picker. By hand |
| N8 | Steps 6 and 7, above: every part holds on a Mac, with `/var/folders/…/T` as the folder |
| N10 | `docs/web/index.html` opens from the disk in Chrome with nothing in the console; its player plays, and so do those of two other pages; `/` takes the search, and a search leads to its page (`basics/slides.html#skip-wait`). **But the clips fail now and then on this machine too**, with the error of Windows (below): of the 71 a theme shows, 16 did not play in the light theme and 13 in the dark one |
| N12 | The tests of `e2e/creatorBlocks.spec.ts` pass with the system's font, the one that reads the painted pixels for the name's contrast among them. Looked at in both themes at 1700 × 950 (`shot.mjs`, the examples `lines` and `quadratic-formula`): three columns of compact blocks, each name readable on its tag. The corners under the pointer by hand |
| N14 | The 5 tests of `e2e/htmlExport.spec.ts` pass. A project with sound and a pause exported from the app as a zip and as one file: the dialog says the sound goes "as AAC (audio.m4a). It plays with the scene and stops at its pauses."; the folder has `audio.m4a` (AAC, 6.000000 s, 288 000 samples, an edit list with `media time: 2112`), and its `index.html` opened from the disk in Chrome plays the sound with the scene (0.60 s of sound at 0.67 s of scene), stops both at the pause (1.5 s; the sound at 1.44 s, paused), goes on with both and ends with both; the one file does the same with its sound inside it, and `embed-example.html` mounts its scene. The console says nothing. Read from the page's `<audio>`, not heard. The folder written through the system's picker was not seen (the spec writes it in the browser's own storage) |
| N15 | `e2e/deckPage.spec.ts` (5), `deckControls.spec.ts` (16) and `deckParity.spec.ts` (5) pass in Chrome. Safari is out of this run (the owner's word); Firefox was not tried |
| N16 | `node check.mjs` (Node 24) says `OK: "e2e" plays as written.` and ends with 0, in the exported folder and from another folder with the script's path. With a mistake in `scene.js` it ends with 1 and prints `scene.js:178 · clips[0].intro.easing: Invalid option: …` and `FAILED: 1 error, 0 warnings in "e2e".` The `·` is UTF-8, which a Mac's terminal reads as it is |

### What was left, and why it is the owner's

Read in the code by three agents that changed nothing (the companion and the harnesses; what a
browser on a Mac does; the keys and the pointer), then probed where a probe could say. None of it
fails a test.

- **The clips of the documentation fail on the Mac too, now and then** (N10). What §10 found on
  Windows, where the clips 364 px high or more never play ("PIPELINE_ERROR_DECODE: video decode
  error!" at their first frames), shows here for the same clips (88 of the 140; none of the other 52
  ever failed), but for some of them at each visit and not for the same ones: played one at a time
  in a page opened from disk, 30 to 34 fail (57 different ones over three passes, 8 of them every
  time); four at a time, 87. In their own pages, each clip scrolled into view in turn: in the light
  theme 16 of 71 do not play (the site says "no light variant of …: showing the dark one", and the
  dark one then stands still or fails too), in the dark theme 12 of 71 fail and stay as their
  picture. **The cure of `ac9f56fb` holds here**: the eight that failed every time, encoded again
  with the tool's arguments (the limited range), played 48 times of 48 alone and 48 of 48 four at a
  time, where the same eight as they are failed 30 and 31 times of 48, and encoded again in the full
  range, 33 and 35. So nothing is to be done on the Mac: the 140 clips are made again on Linux, as
  §10 says, and will play here.
- **Render with ManimGL through the companion takes 12 s more than it has to, on every render.**
  ManimGL imports Matplotlib, which builds its list of the system's fonts when it finds none in its
  folder of the home, and a job's home is the job's own folder, new each time: `import manimlib`
  takes 1.1 to 1.4 s with the user's home and 12.1 s (11.5 of them of the processor) with an empty
  one ("Matplotlib is building the font cache"). The 50 frames of `hello` take 16.2 to 16.7 s where
  ManimCE takes 2.1 to 2.6 s, and Windows 5.2 s. A folder for Matplotlib kept for the session
  (`MPLCONFIGDIR`) would spare it; it is part of what a job may read and write, which protects the
  user: not touched.
- **The exported page takes a Ctrl+click on its seek bar for a press** (`app/src/deck/timeline.ts`,
  which reads `button !== 0`; `embed/player.ts` and `embed/stripView.ts` of the documentation's
  players do too): on a Mac the scene is taken to the pointer and then Chrome's own menu opens. It
  is the defect of `7da6ce2e` in what an export contains: recorded, not touched.
- **Shift + wheel on the vertical timeline of Zen mode goes the other way on a Mac** (N2), read in
  the code and not seen: macOS hands the page the wheel already turned sideways (`deltaX`, with
  `deltaY` 0), and `wheelOf` (`ui/timeline/axis.ts`) then gives the turn its sign as a sideways
  scroll: towards the ruler, where Linux goes away from it. A wheel of the system cannot be played
  by a headless browser (the turn is made by macOS before Chrome). By hand; then the owner's choice
  of which way is right.
- **Where Chrome's own menu opens after a Ctrl+click, a press may never end**: on the ruler with the
  Slides mode off, an empty lane, a splitter, a dialog's title, the app opens no menu of its own, so
  the browser's opens and takes the release. Since `7da6ce2e` no press begins there, which is what
  could be mended from here; what the page does under Chrome's menu needs a window and a hand.
- **A window moved between a Retina screen and an ordinary one** changes `devicePixelRatio` with no
  `resize`: the Preview and the smaller previews size their bitmap on a resize, and nothing listens
  to the resolution. It could not be played: under the browser's emulation neither a `resize` nor a
  change of a `resolution` media query comes, and the bitmap stays as it was. By hand, with a second
  screen: whether the Preview is blurred after the move until the window is resized.
- **A colour field of the system** (`<input type="color">`) opens the Colors window of macOS, which
  is no dialog of the page: it stays open beside the app and sends its changes whenever they are
  made (`HexColorField.tsx`, `animations/fields.tsx`). By hand.
- **Keys macOS takes first**: ⌘⌥H (Distribute horizontally) is Hide Others; Ctrl+Space and ⌘+Space
  (the list of formulas) are the input sources and Spotlight; ⌘← and ⌘→ are Back and Forward in
  Chrome, and a sideways swipe of two fingers may leave the page where the app does not hold the
  scroll (only the timeline and the Creator's view of cards do). Known since the Mac port, open.
- **Texts that name a key the way of Linux**: the sheet of shortcuts says "Ctrl/⌘+click toggles",
  and some tooltips write "Alt" where the menus of a Mac write ⌥.
- **"needs the companion" with the companion running.** A font text on a Mac carries that badge and
  the status bar says "1 font text as placeholder boxes (needs the companion)", while the tooltip
  gives the true reason (the worker cannot start off Linux). Words of the app: the owner's.
- **A traceback of the server that harms nothing**: a client that closes its socket while the
  companion answers gives `EPROTOTYPE` on a Mac (error 41), which `_dispatch` does not take for a
  broken pipe as it does `BrokenPipeError` and `ConnectionError`. Read, not seen in any run.
- **The Python of the system is 3.9 and nothing says so**: `health` runs with it. A word at the
  start for a Python under 3.10 would be a choice of what the companion says.
- **The tools of the documentation are Linux's** (`docs/web/tools`): `menus.mjs` rewrites only
  `Ctrl+` in a key's name (a Mac gives ⌘), `lib/browser.mjs` finds its orphans by a `ps` whose names
  are whole paths on a Mac, `examples.mjs` does not read `MFE_CE_PYTHON`, the guard of the
  temperature reads nothing off Linux. The site is made on Linux: recorded for whoever makes it
  elsewhere.
- **Small things of the harnesses**: `verify.sh` asks `mktemp -d -t mfe-verify.XXXXXX`, and BSD's
  `mktemp` keeps the X's and adds its own suffix (`mfe-verify.XXXXXX.LwsmBF9xFh`: a name, nothing
  else); the export check had **two cases named `multiline-mathjax` for each library** (the example
  `multiline` with the MathJax snapshot, and a case made by hand), which `summary.json` could not
  tell apart and whose folders of results were one (since then the example's cases are
  `example-multiline-…`, and the check refuses two cases of one name); `MFE_CE_PYTHON` is read with
  `??` in one harness and with `||` in another, which differ for an empty value.
- **Safari**: out of this run, on the owner's word. What was read of it before he said so, for
  whenever it matters: the exported page needs Safari 16.2 (`color-mix`), and `player.css` has
  `user-select` without its `-webkit-` twin.
- **By hand**, as §3 and §9 list them, less what is Safari's: everything there still stands. The
  Ctrl+click of §9's list was seen with a real one in Chrome (above); the click with two fingers is
  the secondary button, which the specs press.

### Font text (§4): what the two virtualenvs have

Read only, for the version that takes it up (step 8 of §7); nothing of it was built.

- ManimPango is 0.7.1 beside ManimCE, with Pango 1.58.2 and cairo 1.18.6
  (`manimpango.pango_version()`, `cairo_version()`), and 0.6.1 beside ManimGL, with Pango 1.56.4 and
  cairo 1.18.4.
- Each folder holds three extension modules and no library: `cmanimpango.cpython-314-darwin.so` (8.3
  MB and 7.1 MB), `_register_font…so` and `enums…so`, with their sources. **There is no `.dylibs`
  folder.** `otool -L` of `cmanimpango` names only what macOS brings (CoreText, CoreGraphics,
  AppKit, Carbon, Foundation, ApplicationServices, `libiconv`, `libbz2`, `libresolv`): Pango, Cairo,
  HarfBuzz, Fontconfig, FreeType and GLib are linked into the module.
- **Unlike on Windows (§5), the module exports them**: `nm -gU` lists 606 `pango_*` (39 of
  `pango_cairo_*` and 14 of `pango_core_text_*` among them), 344 `cairo_*`, 501 `hb_*`, 486 `Fc*`,
  160 `FT_*` and 2079 `g_*` in ManimCE's, and nearly as many in ManimGL's. `ctypes.CDLL` of that
  file answers `pango_version_string()` with `1.58.2`, and its default font map is a
  `PangoCairoCoreTextFontMap`: **CoreText lists and shapes the fonts**, Fontconfig is inside but is
  not the backend.
- `manimpango.list_fonts()` gives 213 families in both; the first eight: `['.AppleSystemUIFont',
  'Academy Engraved LET', 'Al Bayan', 'Al Nile', 'Al Tarikh', 'American Typewriter', 'Andale Mono',
  'Apple Braille']`.
- Homebrew has a Pango of its own on this machine (1.58.0 with `libpangoft2`, cairo 1.18.4, HarfBuzz
  14.4.0, Fontconfig 2.18.3, under `/opt/homebrew`). It is not the one Manim draws with, and a Mac
  without Homebrew has none.

So on a Mac there is a Pango for a worker to load, the very one Manim draws with: ManimPango's own
module, by its path. What it lacks is PangoFT2 (it exports no `pango_ft2_*`): `_PangoAPI` loads
`pangoft2-1.0` and Fontconfig beside Pango for its fonts, and a Mac's Pango answers through
CoreText. ManimPango's Python interface (`text2svg`, `MarkupUtils`, `list_fonts`, `register_font`)
is there too, as on Windows.

### For Linux

- `verify.sh --companion`, `npm run parity` and `npm run export-check`, as §9 says.
- **`34a68b65` is not a no-op there**: a second SIGTERM or SIGHUP while `serve` stops is ignored.
  `test_cli.Signals` is the class to read first; its two new tests must pass, and
  `test_it_takes_the_signals_the_system_has` (the handlers of Windows, played).
- **`7da6ce2e`** changes no behaviour off a Mac, by reading: the whole e2e suite says so there, and
  `e2e/macSecondaryClick.spec.ts` must pass on Linux and on Windows as it does here, since it
  dresses the browser as a Mac itself. `app/build/__tests__/mainClick.test.ts` fails from now on for
  a press of `ui/` that reads `button === 0`: a line of `CLAUDE.md` and one of the skill say so.
- `5d4e11a8` is documentation: its words about a Mac are for the owner to read.
- `e2e/macSecondaryClick.spec.ts` has no time in `app/e2e/durations.json` yet, so it runs among the
  first; recording the times again (`MFE_E2E_RECORD=1`) is the owner's.
- Nothing of this run has run on Windows.

### What is kept and where

Outside the repository, in `~/mfe-mac-v1` on the Mac: the working notes with every number
(`NOTES.md`); the steps of the first run (`02-…`, `03-…`, `verify-1/` with a log for each step, the
e2e log with the time of every line, `manim-1/` with the parity and the six groups of the export
check and their summaries) and of the last (`verify-2/`, `manim-2/`); the temperature read every 20
s (`thermal.log`); the scripts that keep the six minutes and the two (`run-companion.sh`,
`run-e2e.sh`, `run-export.py`); the screenshots (`shots/`); and the probes (`probes/`: the specs,
the script that closes a pseudo-terminal under a login shell, and `out/` with a file for each thing
said above: `ctrlclick-before.json` and `ctrlclick.json`, `step6.json`, `cancel.json`,
`font-text.json`, `m4a.json`, `over-limit.json`, `early-stop.txt`, `window-close-*.txt`, `dpr.json`,
`deck.json`, `docs-site.json`, `clips.json`, `site-clips.json`, and `clips-range.json` with the
eight clips encoded again beside it).

## 12. The Mac's own ways (2026-11-19)

Made on 2026-11-19 by the agent of §11, on the same Mac and the same branch, `mac-to-v1`, after the
run of §11 was committed (`a24fc14a`). The owner asked whether the app was what a user of a Mac
expects of an app, and it was not asked of the run: §9 asks that the suites be green there. He had
the agent read first whether each thing it proposed is the standard on a Mac, then said to apply all
of it, and where a key could not be confirmed to take a natural and safe one and say which. Eight
commits change the app, each with its tests, and two more the web documentation, which he asked for
once the app was done; nothing was pushed. **Every one of them changes what a user of a Mac sees or
does, and nothing on Windows and Linux**, by reading and by the tests that dress the browser as each
system; one of them changes what an export contains (`8701ff2c`). The rule of §3 gives such changes
to the owner: here he gave the word for them, as a whole and before they were made, so each choice
the agent made inside that word is listed below for him to confirm or to change.

### What was read first

- **Apple's Human Interface Guidelines, "Keyboards".** An app does not give a standard shortcut of
  the system another use. The modifiers of a shortcut are written in one order, Control, Option,
  Shift, Command, with their symbols (⌃ ⌥ ⇧ ⌘) and then the key. Command is the main modifier,
  Option is for the less common form of a command, and Control is to be avoided. Its table of
  standard shortcuts has ⌘+Space (Spotlight), Ctrl+Space (the language of the keyboard), ⌥⌘H (hide
  the other apps), ⌥⌘V (apply a copied style) and ⇧⌘S (duplicate the document, or start a Save As).
- **The same guidelines, "Pointing devices".** The secondary click shows a context menu; a scroll
  moves the content of a view; a pinch zooms; and an app does not give the gestures of the system
  another meaning (which is why the "back" of two fingers swept sideways is not blocked here: the
  Preview takes the scroll for itself instead, as the timeline does).
- **Chrome on a Mac**: its page of shortcuts, and what is written of the keys it never hands to a
  page (⌘N, ⌘T, ⌘W, ⌘Q). Whether ⌥⌘H, ⌃⌥H and ⌃⌥V reach a page was not found anywhere: only a
  person pressing them can say (the list by hand, below).
- **How Chrome sends a pinch** (Chromium's `touchpad_pinch_event_queue.cc`, and what a library
  that zooms with it does: d3-zoom multiplies its rate by ten for it): a wheel event with `ctrlKey`
  set, no key being held, whose `deltaY` is 100 × ln of the gesture's scale, with the sign of a
  wheel that zooms, to be undone with exp(−deltaY / 100).
- **Figma on a Mac**: its align keys are the app's (⌥A, ⌥H, ⌥D, ⌥W, ⌥V, ⌥S), and it distributes
  with ⌃⌥H and ⌃⌥V, the Control key itself, which are Ctrl+Alt+H and V on Windows.

Two of the agent's first proposals did not survive the reading and were dropped: to keep the
browser from going "back" on a sideways swipe anywhere in the page (a gesture of the system, see
above), and to turn Shift + wheel on the vertical timeline (on a Mac the system itself turns a
wheel with Shift into a sideways scroll, which the timeline takes as one: it is Linux that
differs, and §11 has it for the owner).

### What was changed

| Commit | On a Mac | How it was shown |
| --- | --- | --- |
| `7046b365` | The menus and the tooltips write a shortcut's modifiers in the order of a Mac's menus: ⌥⌘N, ⇧⌘Z, ⌥⇧G (they were ⌘⌥N, ⌘⇧Z, ⇧⌥G). | `keyHint`, unit tests; the specs of the menus and tooltips, the browser dressed as each system. |
| `a4fadec4` | The texts that name keys and are written once for every system — the sheet of shortcuts, the hints of the Preview, some fifty tooltips, hints and notices — are written as a Mac's menus write keys: "⇧⌘Z", "⌥ + drag", "⇧: a range", "⌘+click", ↩ for Enter. The sheet draws the keys as caps with nothing between them, and has the rows a Mac has of its own: redo without Ctrl+Y, the rows that open a menu without the Menu key. A screen reader is given the names ("Shift-Command-Z"). | `keysText`, `keysSpoken`, `macLines` (unit tests, one of which compares the caps of every row with its text); `sheetRow` and the README's table under "On macOS", compared by the test that compares the sheet with the README; a spec of the sheet dressed as a Mac, and one as Windows. |
| `a25dfa6d` | A pinch on the trackpad zooms the Preview, the timeline and the stage of the text editor as far as the fingers go: twice as far apart, twice as large (it was 1.15 times: the rate of a notch of a wheel). ⌘ + wheel, and a wheel with the Control key held, zoom as before. | `zoomFactor`, `isPinch`, `startControlKey` (unit tests); `e2e/macTrackpad.spec.ts` sends the events of a pinch as Chrome sends them on a Mac, a frame apart, and reads the zoom: 2.000 for a pinch to twice the size, 1.149 for the same events dressed as Windows. |
| `e6bf2a63` | A scroll — two fingers on the trackpad, the wheel of a mouse — moves the Preview's view, the scene following the fingers; it did nothing there, and the view could be moved only with ⌥ + drag or with a middle button a trackpad lacks. Taken by the page, a sideways scroll over the Preview no longer starts the browser's "back". | `scrollPans` (unit tests); the same spec: the view moves by the pixels of the scroll, and an ⌥ + drag by the same pixels the other way puts it back; dressed as Windows the wheel is left alone and the view stays. |
| `9be4d724` | Distribute horizontally and vertically are ⌃⌥H and ⌃⌥V, with the Control key itself: Figma's keys there, and the same physical keys as on Windows and Linux. ⌥⌘H and ⌥⌘V, the system's, are no longer the app's. | `commandForKey` (unit tests); a spec dressed as a Mac: ⌥⌘H and ⌥⌘V move nothing and write no undo step, ⌃⌥H and ⌃⌥V distribute. |
| `a5f443ec` | Save As is ⇧⌘S, as in every app of a Mac, and Sync folder takes ⌥⌘S, the key Save As had: the two change places, in the File menu, the sheet and the Projects dialog. | `commandForKey`, `saveAsKeys`, `syncFolderKeys` (unit tests); a spec dressed as each system reads the two items of the File menu and presses the two keys: one saves a file, the other none. |
| `fbb92eb5` | The formula that has the focus in the list is added to the selection, or taken out, with ⌘+Return; it was Ctrl/⌘+Space, and ⌘+Space is Spotlight's and Ctrl+Space the keyboard's language. | `listKeyOf` (unit tests); a spec dressed as a Mac: ⌘↓ moves the focus alone, ⌘+Return adds the formula and takes it out, Return still opens it; dressed as Windows, Ctrl+Enter still opens it. |
| `8701ff2c` | A Ctrl+click on the time bar of an exported page, and on the scrub bar and the strip of a player of the web documentation, is the menu's: it seeks nothing (it sought, and began a drag under the browser's menu). **It changes what an export contains** (`mfe-runtime.js`). | `isMainPress` (unit tests of the three bars, with the platform stated); a spec of the exported page dressed as a Mac, with the events of a Ctrl+click as Chrome sends them there; `mainClick.test.ts` now reads `src/deck/` and `src/embed/` as it reads `src/ui/`. |

`7046b365` to `fbb92eb5` touch `app/src/ui/` and its tests; `8701ff2c` touches `app/src/deck/` and
`app/src/embed/`, and with it the two files of the web documentation that are built from them,
`docs/web/assets/player.js` and `docs/web/decks/mfe-runtime.js`, made again by their tools
(`build-player.mjs`, `build-deck.mjs`). Both tools gave the committed files byte for byte on this
Mac before the change (`--check`), so a build on a Mac is the build of Linux for these two.

### The web documentation

When the eight commits were done the pages of `docs/web` still gave a reader on a Mac the keys of
the other systems written with ⌘: Save As as ⌘⌥S, Distribute as ⌘⌥H, the key of the formula list as
⌘+Space, none of which is the app's there any more; they wrote a Mac's modifiers in the old order;
and they said nothing of a trackpad. The owner asked whether the documentation had these parts and,
if not, to write them. The README and `docs/architecture/` had them, from the commits above; the
site did not. Two commits, `Web docs: …` as its guide asks:

- **`856045c3`**: `assets/site.js` writes a Mac's modifiers in the order of its menus, ↩ for Enter
  and ⌃ for the Control key, and keeps the caps of a combination on one line there. A `kbd` may name
  the combination the app has on a Mac (`data-keys-mac`), and a few words may be for one system
  alone (`span.only-mac`, `span.not-mac`). The build checks the new attribute and the check of the
  components page tries all of it as a Mac and as Windows; `AUTHORING.md` and the components page
  say how to write them.
- **`f6fcee3f`**: the table of shortcuts has the rows a Mac has of its own. It is made from the
  app's sheet: the capture file now carries the `mac` of a row, the data was captured again (the
  data alone, `capture.mjs reference/shortcuts --only sheet`: what changed in `sheet.data.js` is
  those rows), and the tool writes such a row for each reader. The tables of the menus take four
  keys from a list written by hand. The pages that name those keys give the Mac's too, and the pages
  that teach the zoom and the pan say what a trackpad does.

How it was checked, on the Mac: `build.mjs --check` (55 pages, no error, no warning),
`reference-tables.mjs --check`, `build-player.mjs --check` and `build-deck.mjs --check` (up to
date), and `check.mjs` on the ten pages touched, which opens each from disk in both themes and at
two widths and found nothing in its 40 views; the tables were then looked at as a Mac and as Windows
show them (`?platform=`). The data of the sheet does not depend on the system that captures it; no
picture and no clip was made, since those would be a Mac's. For a reader on Windows or Linux the
pages read as before.

### What the agent chose, for the owner to confirm or change

- **Every modifier a converted text names is its symbol**, alone too: "⇧: a range", "hold ⌥",
  "⌘ too: no snapping", as a Mac's menus and the apps made for a Mac write them (Apple's own
  documents spell the names out in running text; an interface has less room). Enter is ↩ there, as
  `keyHint` already wrote it in a shortcut. The texts of `ui/` that name a key go through it where
  they are shown, those that name only Shift or Enter too, as the search of the sources found them
  (a text it missed still reads true on a Mac if it names neither Ctrl nor Alt). One is left in
  words on purpose: the key of the Creator's preview size ("Shift+click for smaller"), whose text
  is its accessible name.
- **⌘+Return for the formula list.** The agent first proposed ⌥+Space and withdrew it: it is the
  key of the launchers many users of a Mac run (Alfred, Raycast, the ChatGPT app). Space alone
  would follow the listbox pattern of ARIA, but a card that was clicked keeps the focus, and Space
  pressed there to play would empty the selection. Shift+Space would give Shift, which is the range
  in this list and in ARIA, another meaning. ⌘+Return is the click with ⌘ of the keyboard, is not
  in Apple's table of standard shortcuts, and is a key the app already has on a Mac (Apply, in the
  editors).
- **Save As changes its key on a Mac only.** Ctrl+Shift+S is the usual key of Save As on Windows
  and Linux too; there the app keeps Ctrl+Alt+S for Save As and Ctrl+Shift+S for Sync folder, as
  the owner made them. To give them the same change is one line of `commandForKey` and two of
  `saveAsKeys` and `syncFolderKeys`.
- **The rows of the sheet were not rewritten.** A row keeps the keys of every system
  ("Ctrl/⌘+Alt+H / Ctrl/⌘+Alt+V") and says what a Mac has in their place (`mac`); the README's
  table of shortcuts is as it was, and a second table, under "On macOS", lists the rows that are
  others there. So the table of the web documentation, which is made from the sheet, and the file
  that links each row to a page (`shortcut-links.mjs`) are still true as they are.
- **The pinch and the scroll are a Mac's alone.** A precision touchpad sends its pinch the same way
  on Windows, and the same rate would be right for it; a scroll over the Preview does nothing
  there either. Neither could be tried here, and the rule of this run is that nothing changes
  elsewhere: both are one condition away (`isPinch`, `scrollPans`).
- **Only the Preview takes the scroll.** The stage of the text editor zooms with the pinch but is
  not moved by a scroll: it sits in a dialog that may have to scroll itself.

### What was left, and why

- **Of the web documentation**, after the two commits below: its pictures are those of Linux, the
  screenshot of the sheet of shortcuts among them, which shows the keys of Linux to every reader;
  `assets/nav.js` and `assets/search-index.js` are made by the build and are for whoever merges the
  documentation to make again (its guide says so), so the search does not find the new words yet;
  and the keys the menus have on a Mac are written by hand in the tool (`MENU_MAC_KEYS`), because
  the capture reads the menus as Windows and Linux show them. To capture them dressed as a Mac would
  take that list away: a change of the capture, which is made on Linux.
- **The glyphs of the glyph views** (the chips and the drawing of a formula in the editors) are
  added to a selection from the keyboard with Ctrl/⌘+Space too, and ⌘+Return is Apply there. On a
  Mac they are left with the click with ⌘, and with Ctrl+Space where the system lets it through.
- **Words that are the other systems'**: the menu is "Preferences" (a Mac says Settings since
  macOS 13), F2 renames (a Mac renames with Return, which opens the formula here), the Edit menu
  writes "Del" beside Delete formula (the key is ⌫ on a Mac's keyboard, and both keys delete), and
  the sheet names Home and End, which a laptop has as Fn+← and Fn+→ (the README says so now).
- **Of what §11 left**, three items are closed here: the exported page that took a Ctrl+click for a
  press (`8701ff2c`), the texts that named a key the way of Linux (`a4fadec4`), and, of the keys
  macOS takes first, ⌥⌘H (`9be4d724`), Ctrl+Space and ⌘+Space in the list of formulas (`fbb92eb5`)
  and the sideways sweep over the Preview (`e6bf2a63`; over the rest of the page it is still the
  browser's "back", as the guidelines want it). The others are as they were: the clips of the
  documentation, the twelve seconds of ManimGL, Shift + wheel on the vertical timeline, the press
  that may never end under Chrome's menu, the window moved between two screens, the Colors window,
  and the smaller ones.

### For the owner, by hand

No test presses a key of the real keyboard or moves two fingers on the real trackpad: the specs
send the events. On the Mac, in Chrome:

- **Pinch** over the Preview, the timeline and the stage of the text editor: the view follows the
  fingers, about the pointer, neither slower nor faster.
- **Scroll with two fingers** over the Preview: the scene follows the fingers both ways and coasts
  as a page does; a sideways sweep there does not go "back". With a mouse: the wheel moves the view
  up and down, Shift + wheel sideways, ⌘ + wheel zooms a notch at a time.
- **⌃⌥H and ⌃⌥V** with three clips selected distribute them (the keys reach the page), and ⌥⌘H
  hides the other apps and moves nothing.
- **⇧⌘S** asks where to save a copy and **⌥⌘S** asks for the folder of the projects, from the
  editor and, the second, from the Projects dialog.
- **The formula list**: ⌘↓ and ⌘↑ move the focus and select nothing, ⌘+Return adds the formula or
  takes it out, Return opens it.
- **Fn+Shift+F10** opens the menu of the clip that has the focus; and whether Ctrl+Return does so
  too in Chrome: recent versions of macOS have it as their own key for a context menu, as the
  agent recalls it (not read for this, not tried, and not a key of the app).
- **The sheet** (Help ▸ Keyboard shortcuts…) read once as a user of a Mac reads it; and with
  VoiceOver, how a row's keys ("Shift-Command-Z") and a tooltip with symbols ("hold ⌘") are said.
- **An exported page**: a Ctrl+click on its time bar shows Chrome's menu and the time stays; a
  click seeks.

### The verification

Each commit was checked when it was made: `tsc -b`, eslint and Prettier on its files, the whole
Vitest suite, and the specs of what it touches. The suites as a whole ran once, on the last of
them, with the rule of §11 (about six minutes of work, then two of rest):

- **The tree `8701ff2c`.** `tsc -b`, eslint (the 74 `.ts` and `.tsx` files changed since
  `a24fc14a`: no error) and Prettier: ok. Vitest: **8553 passed and 1 skipped** of 8554, in 560
  files. The e2e suite: **1207 passed and 1 skipped** of 1208 in 39.4 minutes, with its six pauses
  of two minutes, the stretches between them from 4:20 to 4:55; the one skipped is the test that
  renders with Manim, which asks for `MFE_CE_PYTHON` and passed when run alone with it. They are
  the 1194 of §11 and fourteen new ones. `npm run dist-check`: 3 passed. The two files of the web
  documentation: `build-player.mjs --check` and `build-deck.mjs --check` say they are up to date.
- **Not run again**, since nothing they cover was touched: the tests of the companion (no file of
  `companion/`), `npm run parity` (nothing of the engine) and `npm run export-check` (nothing of
  `app/src/export/`: the Python the app writes is as it was, and its pins passed with Vitest). The
  exported page is the e2e suite's (`deckControls`, `deckPage`, `deckParity`, `htmlExport`) and
  Vitest's (`src/deck/`, `build/__tests__/deckRuntime.test.ts`).
- The battery's sensor stayed at 31 °C or under through the run, and the system set no limit on
  the speed.

### For Linux and Windows

- **Nothing of this changes what the app does there, by reading**: each change asks `isMac()` or
  takes the system as a parameter. The whole verification there says so; none of these commits
  has run on Linux nor on Windows.
- **Tests that state the system they mean** and so say the same anywhere: the unit tests of
  `keyHint`, `keysText`, `keysSpoken`, `macLines`, `sheetRow`, `isPinch`, `zoomFactor`,
  `scrollPans`, `commandForKey`, `listKeyOf`, `lineDrawHint`, `retargetHint` and `isMainPress`;
  and the specs that dress the browser, `e2e/macTrackpad.spec.ts` (new: seven tests) and the tests
  added to `app.spec.ts`, `tooltipKeys.spec.ts`, `previewAlign.spec.ts`, `files.spec.ts`,
  `formulaSelection.spec.ts` and `deckControls.spec.ts`. A spec dressed as a Mac presses `Meta`,
  and one dressed as Windows on a Mac presses the Control key itself, by its one name.
- **Specs that read a text or press a key that differs on a Mac** take both from
  `e2e/helpers.ts`: `onSystem(elsewhere, onMac)` for a text, `SAVE_AS_KEYS`, `SYNC_FOLDER_KEYS` and
  `LIST_TOGGLE_KEYS` for a key. On Linux and Windows they give what the specs had.
- **The check of the specs** (`e2eConventions.test.ts`) lets one name of the Control key through,
  `CONTROL_ITSELF` of `e2e/helpers.ts`, and still refuses any other press of Control.
  **`mainClick.test.ts`** now fails for a press of `src/deck/` or `src/embed/` that reads
  `button === 0` itself.
- **The test that compares the sheet with the README** also compares the README's table under
  "On macOS" with the rows of the sheet that have a `mac`: a row added to one is added to the
  other.
- `e2e/macTrackpad.spec.ts` has no time in `app/e2e/durations.json` yet, so it runs among the
  first; recording the times again (`MFE_E2E_RECORD=1`) is the owner's, as in §11.
- `docs/web/assets/player.js` and `docs/web/decks/mfe-runtime.js` were built on the Mac: the two
  `--check` there must say they are up to date, as they do here.
- `CLAUDE.md` and the skill (`mfe-change`, "The other systems") say what a change has to do from
  now on for a text that names a key and for a shortcut whose keys are others on a Mac.
- **The web documentation**: `build.mjs`, `check.mjs` and the three `--check` of its generated
  files, as its guide asks; `capture.mjs reference/shortcuts --only sheet` there must leave
  `sheet.data.js` as it is; and the build writes `assets/nav.js` and `assets/search-index.js`
  again, which were left as they were.

### What is kept and where

Outside the repository, in `~/mfe-mac-v1` on the Mac: what was read and the verdict on each
proposal (`MAC-UX-RESEARCH.md`), the notes (`NOTES.md`, its last sections), the log of the whole
e2e run with the time of every line (`ux-1/e2e.log`, `ux-1/e2e.times`) and the temperature
(`thermal.log`).

## 13. On Linux: the three runs read, verified and brought together (2026-11-19)

Done on 2026-11-19 by the agent of the Linux machine, on the branch as the owner had checked it out:
`mac-to-v1` at `e00e7024`, 31 commits over `main` (`71f83bbb`) in one line, 14 of the run on Windows
(§10) and 17 of the Mac's (§11, §12). The owner's word: to review all of it and bring it together on
Linux, for the final audit. Nothing was pushed: the owner pushes. The machine is the one of the
earlier rounds (Fedora, Chrome, TeX Live, ManimCE 0.22.1 and ManimGL 1.7.2 in their two virtualenvs,
Python 3.14.10); the heavy runs went one after the other, in a second checkout of the repository,
with the processor's temperature watched.

### What was read, and the one thing found

The three records, and every line of the 31 commits that is not a test or a generated file. The
companion: off Windows `_spawn()` is the call of `subprocess.Popen` each of the five places made
before, with its own group; `_has_to_end()` says what `proc.poll() is None` said; `_ConsoleClose`
sets and imports nothing; and `on_stop` ignores its own signals before it raises, which is the one
change of behaviour there (§11). The app: every change of §11 and §12 asks `isMac()` or takes the
system as a parameter, the wheel of the Preview and of the timeline zooms by the factor it had, and
the keys of `commandForKey` off a Mac are the ones they were.

**One text had changed on Windows and Linux too**, against what §12 says of `a4fadec4`: the line
under a field of several lines (the comment of a slide mark) read "Ctrl+Enter gives the text" there,
and read "Ctrl/⌘+Enter gives the text" since. It had been written with `keyHint`, which names the
command key of the system, and was moved to `keysText`, which leaves a text as it is off a Mac.
Mended (`149ce2b2`), with a test that states the text of each system. No other text and no behaviour
was found to differ off a Mac.

### The first run, before any change

On `e00e7024`, `verify.sh --companion` with 9 e2e workers, exit code 0:

```text
tsc       ok
vitest    ok (unit + native): 8553 passed | 1 skipped (8554)
companion ok: 394 tests, OK (skipped=9)
e2e       ok: 1208 passed, 9 workers
dist      ok (build, file://): 3 passed
```

The e2e suite took 10.0 minutes and the companion's tests 300 s; the processor reached 79.1 °C. The
numbers are the Mac's of §12 (8553 and 1208, where the one e2e test skipped there runs here, with
Manim) and the companion's 394 of §11. Of its 9 skipped tests, eight are Windows' own (six "a Job
Object is a thing of Windows", "a console window and its closing are Windows'", "Ctrl+Break is a key
of Windows"). The classes §10 and §11 named pass: `test_cli.Signals` with its two new tests,
`test_cli.ConsoleClose` but its last, `test_cli.ServeEnvironment`, `test_jobs.ProcessTrees`, the two
of a folder's long name, `e2e/macSecondaryClick.spec.ts` and `e2e/macTrackpad.spec.ts`.
`build-player.mjs --check`, `build-deck.mjs --check` and `reference-tables.mjs --check` say their
files are up to date: what the Mac built is what Linux builds.

### What was changed

| Commit | What | On Windows and on a Mac |
|---|---|---|
| `149ce2b2` | The line under a field of several lines names the command key as a menu does again: "Ctrl+Enter gives the text; Enter starts a new line." | a Mac reads "⌘↩ gives the text; ↩ starts a new line.", as since `a4fadec4`; a unit test states the three systems |
| `98b1d0ce` | The first frame of a looping preview (a block's, in its dialog; the relation editor's) never shows the loop's end: the defect of `cbf01bb9`, which §10 found in them and left. `playedSeconds` counts a frame stamped before the start as no time passed | **the app changes there too**, as with `cbf01bb9`; a unit test with times of its own |
| `c8109bda` | **The 140 clips of the documentation, made again** with the tool of `ac9f56fb`, each from its capture item (below) | they are what the reader's browser decodes: to be played there |
| `a12d0beb` | The capture of the Match colors dialog of the quadratic formula tutorial waits for the dialog's preview, as the captures of the Match colors page do: its picture of the light theme had been caught while it rendered | a tool of the documentation |
| `cbdd6b45` | Every still and tour of the documentation made again, and the 255 that show something else than before kept (below) | pictures of Linux, as before |
| `ccba9f47` | `docs/web/tools/CAPTURES.md`: the captures are made from a checkout with the committed files | documentation |
| `277c0f05` | `docs/web/assets/search-index.js`, made again by the build with the pages of `856045c3` and `f6fcee3f`; `nav.js` came out as it was | the search of the site finds the Mac's words |
| `d46bd366` | `app/e2e/durations.json`, recorded again on a whole run (9 workers): the two specs of §11 and §12 have their times | the order of the specs, on a Mac the stretches between its pauses |
| `f9fc7b01` | `docs/web/start/interface.html` names the Slides key of the timeline's toolbar, which its picture shows now | documentation |

### The clips, and the pictures with them

The clips were made again, not encoded again from the old ones: `capture.mjs <page> --only <its
clips>` for each of the 30 pages that have any, one run at a time, 70 items in both themes in 17
minutes; none failed. **`ffprobe` says `color_range=tv` of the 140** (it said `pc` of the old ones).
The site weighs 43.7 MB (it weighed 44.0).

Thirteen of the clips came out showing something else than before, by their posters: the timeline's
toolbar has the key of the Slides mode since D200, and a compact block of the Creator its glass face
since D199. So the stills were behind the app as well, and all of them were made again: 372 items of
49 pages (stills, tours and data), none failed. Each picture was compared with the one it replaced,
pixel by pixel: one whose largest difference is the encoder's rounding was put back, and **255
pictures of 40 pages** were kept, each looked at beside its old one, cropped to what differs. What
they show now: the Slides key and the rows of Slides in the View menu, the bar without its Export
menu (the pictures of the other menus had kept it), format 36 in About, and what moved with these.
`sheet.data.js` and the data of the menus came out as they were, as §12 asked.

Three pictures would have been wrong, and none is the app's doing. Two capture files read
`examples/quadratic-formula.mfe.json` (the upgrade notice of `reference/files`, the list of
`start/projects`), which the owner has changed in the tree of this machine: made there, the notice
named format 14 with a list of errors, and the list of projects already committed counted 16
formulas for the file's 15. Both pages were made again from a checkout with the committed file. And
the Match colors dialog of a tutorial was caught while its preview rendered (`a12d0beb`). `build.mjs
--strict`: 55 pages, no error and no warning; `check.mjs` on every page, both themes and both
widths: 220 views, 0 problems.

### The last run

On `f9fc7b01`, the last commit before this record, `verify.sh --companion` with 9 e2e workers, exit
code 0, with nothing else running beside it:

```text
tsc       ok
vitest    ok (unit + native): 8555 passed | 1 skipped (8556)
companion ok: 394 tests, OK (skipped=9)
e2e       ok: 1208 passed, 9 workers
dist      ok (build, file://): 3 passed
```

The processor reached 76.5 °C. Two unit tests more than the first run (the dialog's line, the
looping previews). With Manim, on `277c0f05`, which has the same app and the same companion: `npm
run export-check` has no failure in 1107 s: 208 passed of 208, the twelve font-text cases among
them, which Linux runs; `npm run parity` says `PARITY: OK`, with the companion's disk cache.

### What §10, §11 and §12 asked of Linux

| Asked | Seen |
|---|---|
| §10: the tests that play Windows on any system | They pass (above). `test_cli.ConsoleClose`'s last, which closes a real window, skips itself here, saying so |
| §10: `_spawn()` for every child, `serve` inside a `with` block | `test_cli.Signals`, `test_pango` and the Manim and sandbox classes of `test_jobs` pass, the sandbox's among them, which run here where bubblewrap is |
| §10: `cbf01bb9` on every system | `playbackController.test.ts` and the specs that play the scene pass; the two looping previews have the same cure now (`98b1d0ce`) |
| §10, §11: the clips of the documentation | Made again (`c8109bda`) |
| §11: `34a68b65` is not a no-op here | A second SIGTERM or SIGHUP while `serve` stops is ignored: the two tests that send it again every millisecond pass, and `test_it_takes_the_signals_the_system_has` |
| §11, §12: the specs that dress the browser | `macSecondaryClick.spec.ts` (5) and `macTrackpad.spec.ts` (7) pass on Linux, and the tests added to six other specs |
| §11, §12: the times of the e2e suite | Recorded again (`d46bd366`) |
| §12: `player.js` and `mfe-runtime.js` built on the Mac | Both `--check` say they are up to date |
| §12: the web documentation | `build.mjs`, `check.mjs` on every page and the three `--check`: nothing; the capture of the sheet leaves `sheet.data.js` as it is; `search-index.js` made again (`277c0f05`) |

### What is left for the last pass on the three systems

- **Nothing of §12 has run on Windows, and nothing made here has run on Windows or on a Mac**: the
  two commits of the app (`149ce2b2`, `98b1d0ce`) and the clips. The whole verification there says
  the first; for the clips, the pages are opened in the browser of each machine: §10 and §11
  measured that the tool's arguments cure eight of them, and the 140 made here have played only on
  Linux.
- What §10, §11 and §12 list as left stands, less what this section did: the two looping previews,
  the clips, the search index and the times of the e2e suite.
- The pictures of the documentation are Linux's, the screenshot of the sheet of shortcuts among
  them; the keys the menus have on a Mac are still written by hand in the tool (`MENU_MAC_KEYS`).
- By hand, what §9, §10, §11 and §12 list for the owner: no key of a real keyboard and no gesture of
  a real trackpad was pressed or made here either.

### After the record: two changes the owner asked for

The same day the owner answered a survey of what the three runs and the Slides mode had left for
him. Two answers change the app, on every system (`80e96694`, with the web documentation in
`09d908e2`): **«Delete every pause…» asks first**, with the question and the held button of the
other deletions that ask, and **«Skip the wait at every pause» and «Keep the wait at every pause»
are greyed out while the project has no pause**, as «Delete every pause…» was. The other answers
change nothing: Save As and Sync folder keep their keys on Windows and Linux (a Mac alone has them
the other way round), the pinch and the scroll stay a Mac's, what the agent of §12 chose is
confirmed but the way Shift + wheel goes on the vertical timeline (§11), which the owner tries on
the Mac at the last pass.

On `09d908e2`, `verify.sh --companion` with 9 e2e workers, exit code 0: types ok; 8558 unit and
native tests passed, 1 skipped; the companion's 394 tests, OK, 9 skipped; 1209 e2e tests; the build
opened from `file://`, 3. Three unit tests and one e2e test more than the last run above. Nothing of
`app/src/export/` nor of `companion/` changed: the export check and the parity stand as they were
run. **Neither change has run on Windows nor on a Mac.** The logs are in `tools/logs-d204-09d908e2`.

### What is kept and where

Outside the repository, beside it on the Linux machine: the logs of the two whole verifications
(`tools/logs-ports-e00e7024`, `tools/logs-unify-f9fc7b01`, each with its steps and the temperature),
of the export check (`tools/logs-unify-277c0f05`), of the clips (`tools/logs-clips-98b1d0ce`) and of
the stills (`tools/logs-stills-c8109bda`, with the list of the pictures that changed and the check
of the site), and the two scripts that made them page by page and put the unchanged pictures back
(`tools/recapture-clips.sh`, `tools/restore-poster-noise.py`).

## 14. The last pass for version 1.0.0: the task on Windows and on the Mac, brought up to date

Written on 2026-11-21 on the Linux machine, on the branch `codex-final` at `08d7408a`, for whoever
runs it on each machine, a person or an agent. Read `CLAUDE.md` first: its rules hold there. This
section brings the task of §9 up to date: its rules, what each machine needs and its nine steps
stand, and what is said here is added to them or replaces their numbers. It is the pass of step 5
of the freeze, the last before the tag: the code changes after it by fixes alone.

### Where things stand

- **Neither machine has run anything since its run for 1.0.0** (§10 on Windows, §11 and §12 on the
  Mac). Linux brought the three records together at `e00e7024` (§13), and 119 commits have
  come since, all made and run on Linux alone.
- What they are, in the order they were made:
  - **The two changes of §13, "After the record"**: «Delete every pause…» asks first, and «Skip the
    wait at every pause» and «Keep the wait at every pause» are greyed out without a pause.
  - **The seventeen fixes of the final audit, and one the owner found.** Losses of data and hangs
    (a file opened again and saved from the question about unsaved work; the grid of a camera
    centred very far; `node check.mjs` that did not end), the camera and the history, the Slides
    mode and Export → HTML, the exported Python (two glyphs drawn on one spot that go to one
    target; a project named as a name of the camera), the keys and presses of the modes of the
    Preview, and the companion (a JSON body that is `null`; the soundtrack of a job on a disk
    nearly full). Each has its regression test in the suites; none was made for one system.
  - **The drawing of the two pair editors** (the relation editor and the Morph editor): the two
    formulas stacked or side by side by their shapes, arcs with their labels, and a view of its
    own that zooms and pans.
  - **The formula keypad**: an on-screen keypad inside the formula editor, opened by the key
    beside **LaTeX**. MathLive's own keyboard, at the bottom of the window, is never shown.
  - **Export → Image…**: the frame at the playhead as a PNG, at the project's size or twice it,
    over the scene's background or over nothing.
  - **Try an example** in the empty Creator and **Help → Examples**: four of the repository's
    examples, carried inside the app.
  - **Before the cut**: the app says its version (1.0.0, **Help → About**); the Projects dialog
    names the projects of the folder that do not open, each with why, and a `.mfe` whose project
    is not read says that reason; the old example `quadratic-formula` is a file of the current
    format; a personal path is gone from a document of Chroma Lab.
  - **The fixes of the closing review**, a reading of all of the above by four reviewers who had
    not seen it. A project whose name has `coding:` or `coding=` no longer gives a Python file
    that Python refuses. The keypad's Apply applies a source typed by hand as it was typed. A
    dialog passes over a disabled control when it takes the focus: the pair editor of a Morph
    opened with the focus on the timeline behind it, where the keys went on acting. **Project
    settings…** and the name field of the menu bar write nothing into a document that opened
    while they were on screen. A `.mfe.json` whose text was cut short is named among the projects
    that do not open.
- **The folder `codex-final/` of the final audit is gone from the tree** (2 649 files; it stays in
  the history), and **the times of the e2e specs were recorded again**: the suite runs in a new
  order, and the pauses of a Mac fall elsewhere in it.
- **Two things changed in the tools of a run**, and neither asks anything of who runs it: Vitest's
  configuration is a file of its own (`app/vitest.config.ts`, laid over `vite.config.ts`: `npx
  vitest run` and `verify.sh` find it by themselves), and the mock engine and the ids in sequence
  of the tests live in `app/src/test/`.
- **Font text is still not part of these runs** (§4, §9).

### The task

The nine steps of §9, as they are written there, on the branch the owner names. Three things are
added:

10. **The build opened from disk has five tests** where it had three (`npm run dist-check`, the
    last step of `verify.sh`): the formula keypad opens, draws its keys and writes; an example
    opens and its frame is written as a PNG; besides the three of before. All five must pass.
11. **The documentation site**, opened from `docs/web/index.html` with a double click, in the
    browser of the machine: a page with clips plays them (`basics/timeline` and `basics/preview`
    have seven each). §10 and §11 measured that the tool's arguments cure eight clips that did not
    play; the 140 made on Linux since (§13) have played on Linux only. The new page
    `manim/without-companion` has two videos rendered by ManimCE beside their players: both play.
    The search finds a word of a page (its index was made again in §13 and at each change since).
12. **What the table below asks**, row by row.

### What a green run prints

On Linux, at `ee414d54`, `verify.sh --companion` with 9 e2e workers, exit code 0 in 1048 s:

```text
tsc       ok
eslint    skipped (no files)
prettier  skipped (no files)
vitest    ok (unit + native): 8808 passed | 1 skipped (8809)
companion ok: 399 tests, OK (skipped=9)
e2e       ok: 1276 passed, 9 workers
dist      ok (build, file://): 5 passed
```

(`npm run lint` and `npm run format:check`, of the whole tree, ran apart and were clean.) `npm run
export-check`: 212 passed of 212 in 1137 s, none skipped. `npm run parity`: `PARITY: OK`. The
processor reached 81 °C. The logs are in `tools/logs-fase5-ee414d54`, beside the repository on the
Linux machine. One commit came after that run, the times of the specs (`08d7408a`): the e2e suite
ran once more on it, in its new order, and 1276 passed of 1276.

On the other machines the lines differ as §9 says: more skipped tests of the companion, the e2e
count less the specs that need a thing the machine lacks, and the font-text cases of the export
check skipped, each with its reason. The freeze runs all of it once more on Linux, on the commit
that is tagged: those numbers, not these, are the ones the tag has.

### What only those machines can say, since §13

The rows of §2 and N1 to N16 of §9 stand. These are new:

| Id | What | What may happen | To record |
|---|---|---|---|
| N17 | The two changes of §13: «Delete every pause…» asks first; the two entries «… at every pause» greyed out without a pause | written on Linux alone; nothing of a system in them | `e2e/slides.spec.ts` by name |
| N18 | The clips of the documentation made on Linux (140, and the ones of the pages added since) | a browser that does not play a clip, as eight did before the cure of §10 and §11 | step 11 above: the pages that have a clip that does not play, by name |
| N19 | The two previews that loop — a block's, in its dialog, and the relation editor's — no longer show the loop's end for one frame when they start (`98b1d0ce`: `playedSeconds` counts a frame stamped before the start as no time passed) | the run on Windows recorded the flash and left it (§10); its cure was made and seen on Linux alone | by hand: open a block's dialog and the relation editor several times and watch the first frame of each preview; the unit tests of `playedSeconds` by name |
| N20 | In a mode of the Preview (Align by symbol and the five others), a key held with Ctrl, ⌘ or Alt is a shortcut's, not the mode's (`ui/preview/modeKeys.ts`): Ctrl/⌘+Enter, Ctrl/⌘+Escape and Alt+Escape leave the symbol chosen. One exception: Escape with Alt still held lets go the glyphs picked with Alt | **Windows keeps Alt+Esc (it goes to the next window) and Ctrl+Esc (the Start menu) for itself**: the page may never hear them. A Mac has neither | on Windows, what Alt+Esc and Ctrl+Esc do with a symbol chosen in Align by symbol: whether Chrome hears the key at all, and that the symbol is still chosen after it; `e2e/previewModeKeys.spec.ts` by name |
| N21 | Export → HTML into a folder that has an export already: the sound of the export before (`audio.m4a` or `audio.wav`) is removed when this export writes none, and only if it is the file the folder's `scene.js` registered, byte for byte (`writeExportFolder`) | written on Linux alone. On Windows a file that a player or the browser has open cannot be removed; the names of a folder are told apart without case; a folder of OneDrive or iCloud may hold a file that is not on the disk yet | export a scene with sound to a folder, then the same scene with its sound turned off to the same folder: `audio.*` is gone and the page plays silent; the same with the sound file open in a player: what the notice says, and that the export itself is whole; `e2e/htmlExport.spec.ts` by name |
| N22 | The companion stops the soundtrack of a video job or of a render when the disk is nearly full (`need_room` in `feed_audio`): it fails the job, reads the rest of the request away and answers 507 | on Windows a file that is still open cannot be removed: the piece of the track written so far may stay in the job's folder until the job is released | the four tests of `companion/tests/test_audio.py` named "nearly full", by name; after the whole of `test_audio`, that the system's temporary folder holds no folder of a job |
| N23 | The drawing of the pair editors has a view of its own (`ui/relations/pairView.ts`): Ctrl/⌘ + wheel zooms at the pointer, the middle button or Alt + drag pans; on a Mac the two-finger scroll pans and the pinch zooms; the keys −, the percentage, + and Fit in its corner | no trackpad has touched it: the Mac's scroll gives both axes at once, and its pinch arrives as a wheel with Ctrl. Alt + drag is taken by some window managers (the middle button stays) | by hand on the Mac: a scroll, a pinch and a Ctrl/⌘ + wheel inside the drawing of the relation editor and of the Morph editor, and that the page behind does not scroll; `e2e/pairCanvas.spec.ts` and `e2e/macTrackpad.spec.ts` by name |
| N24 | The formula keypad (`ui/creator/keypad/`): drawn with MathLive's fonts, which the build carries beside the page; its keys write into the field that has the caret; ⇧ for one capital | the fonts of a build opened from `file://` on each system; a key of the keypad pressed with a real touch screen or a pen | `e2e/formulaKeyboard.spec.ts` and the second test of `npm run dist-check` by name; by hand, that the keys read (no boxes in place of symbols) from `app/dist/index.html` |
| N25 | Export → Image…: the picker of the system for the PNG, a canvas of the project's size or twice it, a canvas with alpha for a transparent picture | the largest canvas a browser makes differs by system and by graphics card: a 2× picture of a large project may be refused there where Linux made it (the dialog then says the size and proposes 1×). The system's viewer shows a transparent PNG on its own background | `e2e/imageExport.spec.ts` by name; by hand, a picture at 2× and a transparent one, opened in the system's own viewer and dropped into a slide |
| N26 | **Try an example** and **Help → Examples**, from `app/dist/index.html` | the examples are inside the bundle: nothing is read from the disk. Written on Linux alone | `e2e/starterExamples.spec.ts` and the third test of `npm run dist-check` by name |
| N27 | The Projects dialog names the files that do not open (`ui/project/library.ts`); **Help → About** and the licence link compare with files read from the checkout (`LICENSE`, `app/package.json`) | a checkout whose `LICENSE` has other line ends than the repository's would fail the comparison: `.gitattributes` keeps them, and step 1 of §9 counts the files that do not | `e2e/library.spec.ts` and the two tests of `e2e/app.spec.ts` about Help, by name |
| N28 | The reach of the circle selector, Shift + wheel (`symbolRadiusAfterWheel`, `ui/preferences.ts`): each event of the wheel is rounded to a whole pixel from the radius that is kept | a trackpad sends many small events: each may round back to the same radius, and the circle would never change (read by the closing review, not measured: Linux had no trackpad). In the pair editors it is the only way to change the reach | by hand on the Mac: Shift + scroll with two fingers over the Preview with the circle selector, and over the drawing of the relation editor: whether the circle changes its size; if it does not, the `deltaY` of the events |

### For the owner, by hand

What §9 lists stands. New, on each machine:

- In a mode of the Preview (choose a symbol with **Align by symbol**): Ctrl/⌘+Enter, and on
  Windows Alt+Esc and Ctrl+Esc — what the system does with them, and that the symbol is still
  chosen when the window has the focus again.
- The relation editor and the Morph editor of two long formulas: zoom with Ctrl/⌘ + wheel and
  with a pinch, move the drawing with two fingers, with the middle button and with Alt + drag;
  **Fit** puts it back.
- The formula editor: the key beside **LaTeX** opens the keypad; write a fraction and a root with
  it; ⇧ and a letter.
- **Export → Image…** at the playhead of a scene with something on screen: 1×, 2× and
  **Transparent**; the file opens in the system's viewer.
- A project with nothing in it: **Try an example**; then **Help → Examples**, each of the four.
- **File → Projects…** on a folder that holds a project saved by a newer version (change the
  `version` of a copy to 99 in a text editor): it is named under the cards, with why.
- **Help → About**: the first row says **Version 1.0.0**.
- A Morph block of the timeline, its menu, **Edit pairs…**: with the editor open and before any
  click in it, the arrows, Delete and Enter do nothing to the timeline behind it.
- The formula keypad shown, a source typed by hand in **Raw LaTeX** with a comment (`x^2 %
  squared`), then the keypad's **Apply**: the formula has the source as it was typed.
- On the Mac: Shift + scroll with two fingers changes the reach of the circle selector, in the
  Preview and in the relation editor (row N28).
- **Export → HTML…** twice into the same folder, the second time with the sound turned off: the
  sound file of the first export is gone.

### What to write

As §9 says: a new section at the end of this file for each machine, committed on the branch of the
run, and nothing merged. The Linux machine reads the record, reviews each commit and runs the
whole verification before the tag.

## 15. The last pass on Windows for 1.0.0

Run on 2026-11-21 by an agent on the owner's Windows machine, with the task of §14 (the steps of §9
and the three it adds), on the branch the owner had checked out for it: `windows-v1-final`, which
follows `origin/codex-final`, at `0298f978`. Nothing was pushed: the owner pushes. **Everything was
green at the first run and nothing had to be changed: this record is the one commit of the pass**,
so Linux and the Mac get the code they had. Font text is still not part of the run (§4).

### The machine

The one of §10, with what changed: Windows 11 Home 25H2, 10.0.26200.9974; Edge 158.0.4370.33; the
driver of the graphics adapter (a Radeon RX 9070 XT) is 32.0.32029.2010, where it was
32.0.32015.7029. The same Chrome (157.0.8103.79), Node (26.13.1), npm (11.20.0), Git
(2.56.0.windows.2, `core.autocrlf` `true`), MiKTeX 26.5 with dvisvgm 3.6, ffmpeg 9.0.2, ManimCE
0.22.0 and ManimGL 1.7.2 in their two virtualenvs, and the Python of uv (`MFE_PYTHON=python3.14`,
3.14.9). No file of the checkout has CRLF (`git ls-files --eol | grep -c 'w/crlf'` prints `0`).
`app/package-lock.json` differs from the one of §10 by the number of the version alone: no `npm ci`.
The temporary folder has 492 GiB free. Every command ran in Git Bash, started by the agent's
session.

### The run

| Step | Result |
|---|---|
| `verify.sh --static` | types ok, 25 s |
| `health` with the two interpreters | everything `[ok]` but font text, `[!!]` for both libraries with the reason of §4; under ffmpeg: "a video is written in `C:\Users\…\AppData\Local\Temp` (492.1 GiB free) while it is encoded, 4 GiB at most" |
| `compile` twice for each target | 1.31 s and 0.93 s for `ce`, 1.27 s and 1.06 s for `gl` (the compile itself 0.81 s and 0.45 s, 0.80 s and 0.58 s); `\alpha` into a file is UTF-8 JSON |
| `verify.sh --companion`, 4 e2e workers | **exit 0** in 1516 s, the lines below |
| the times | Vitest 78 s, the companion's tests 538 s, the e2e suite 14.1 minutes |
| `npm run parity` | `PARITY: OK`, in 8 s with the companion's disk cache and in 83 s with an empty one (`XDG_CACHE_HOME` naming a new folder), so that LaTeX really ran |
| `npm run export-check` | 200 passed and 12 skipped of 212 in 1333 s; the 12 are the font-text cases, six for each library, each with its reason in `summary.json` |
| TEMP after the suites | nothing of the companion, of a harness nor of a test |

```text
tsc       ok
eslint    skipped (no files)
prettier  skipped (no files)
vitest    ok (unit + native): 8808 passed | 1 skipped (8809)
companion ok: 399 tests, OK (skipped=22)
e2e       ok: 1276 passed, 4 workers
dist      ok (build, file://): 5 passed
```

They are the lines of Linux in §14 but for the workers and the companion's skipped tests. The 22
each say why: bubblewrap (9), "needs a POSIX system" (6), "no SIGHUP here" (3), symbolic links (2:
Developer Mode is off), the font table (1) and `NativeText` (1). They are two more than in §10: the
two tests of §11 that send a signal again while `serve` stops. The tests that need Windows ran, none
skipped: the 6 of `test_jobs.JobObjectsOnWindows` and the 8 of `test_cli.ConsoleClose`, the one that
closes a real console window among them (this machine has conhost). Step 8 of §9 asks nothing more:
both things were written in §10.

**The whole verification ran a second time**, at the end of the pass and with nothing beside it,
since §10 lost two races that way: exit 0 in 1492 s, the same seven lines (the companion's tests 521
s, the e2e suite 13.9 minutes). The companion's tests ran a third time, alone, to read the reasons
above: 399, OK, in 514 s.

No test failed in any of these runs, so there is no failure to group by cause.

### From the app, and the limit of a video (steps 6 and 7 of §9)

As in §10: the companion started as the README says, the app in a headless Chrome, the files as
downloads.

- **Step 6.** "Renderer: LaTeX" ("2 formulas exact (LaTeX)"); a video through the companion's ffmpeg
  in 1.0 s; Render with Manim in 2.6 s with ManimCE and 4.7 s with ManimGL, each an H.264 MP4 of 50
  frames and 5.000000 s. A render of 2400 frames cancelled five seconds into it, once with each
  library: the app says "Export cancelled." 40 ms after the press with ManimCE and 117 ms after it
  with ManimGL, no process of the render is alive and the job's folder is empty; the next render
  goes through. The companion ended with Ctrl+Break: status 0, no process and nothing of it in TEMP.
  C3, asked of the companion itself with a slow scene: under it, while ManimCE renders, the
  virtualenv's launcher and the interpreter; neither is alive 14 ms after the cancel, nor 1.5 s
  after the companion was ended at once in the middle of a second render.
- **`serve --max-video-gib 2`** prints "Videos: up to 2 GiB each (--max-video-gib), written in
  C:\Users\…\AppData\Local\Temp while they are encoded." and the dialog says "Up to 2 GiB per video:
  the companion’s limit. Start it with --max-video-gib to give it another." **`--max-video-gib 65`**
  starts nothing: "a whole number from 1 to 64 is required, not '65'", status 2. **`TMPDIR`** is
  read first, written the way of Git Bash or of Windows, with a space in it; one that names no
  folder is passed over for `TEMP`.
- **Over the limit.** With `--max-video-gib 1`, the MOV (ProRes) at 3840 × 2160 and 60 fps of the
  `hello` example made 260 s long: at frame 12 587 of 15 600, after 452 s, the dialog says "The
  video is larger than 1 GiB, the most this companion writes for one video, so it was stopped. …",
  nothing is saved, and at once ffmpeg is gone and the job's folder is empty.

### The build opened from disk (step 10)

The five tests of `npm run dist-check` pass, in both runs of `verify.sh`: the app starts from disk
and renders a formula; the formula keypad opens, draws its keys and writes; an example opens and its
frame is written as a PNG; Chroma Lab loads in its frame; the licence links open the files that
travel with the build.

### The documentation site (step 11)

Opened from `docs/web/` as files, in Chrome 157 and in Edge 158, each with a window and without one
(four runs):

- **Every clip plays.** The 37 pages that have a clip or a video of Manim, in both themes (74 views
  a run): the 142 clips, each scrolled to as a reader does, play in the four runs. They are the 140
  of `media/` and the two samples of the authoring guide. A page in the light theme shows the light
  file: none fell back to the dark one, and no view wrote anything in the console. `basics/timeline`
  and `basics/preview` play their seven each. The 90 clips that are 364 px high or more are among
  them: the ones Chrome hands to the adapter's decoder, of which 87 failed in §10. `ffprobe` says
  `color_range=tv` of the 142. **The cure is the clips', not the new driver's**: the 87 files as
  they were before `c8109bda`, taken from the history, still end in "PIPELINE_ERROR_DECODE: video
  decode error!" in today's Chrome with today's driver, with a window and without one, and the 87
  play with `--disable-accelerated-video-decode`.
- **The videos rendered by Manim** (ten files, H.264) play to their end, the two of
  `manim/without-companion` among them, and the two players beside those move.
- **The search**: `/` takes it; "three dots" leads to `manim/without-companion.html#differ`,
  "keypad" to `basics/formulas.html#keyboard`, "Transparent" to `basics/export.html#image` and
  "pause that skips" to `basics/slides.html#skip-wait`, in both browsers.
- **What §12 asked of Windows.** `build-player.mjs --check`, `build-deck.mjs --check` and
  `reference-tables.mjs --check` say their files are up to date. `build.mjs --strict` reads 56 pages
  with no error and no warning, and what it writes (`assets/nav.js`, `assets/search-index.js`) is
  byte for byte what is committed. `check.mjs` on every page, both themes and both widths: 224
  views, 0 problems. `capture.mjs reference/shortcuts --only sheet` leaves `sheet.data.js` as it is.
  (These tools keep an empty folder of their own in TEMP, `mfe-docs-machine.queue`, as on any
  system.)

### §14, §9 and §2, row by row

| Id | What was seen |
|---|---|
| N17 | The 49 tests of `e2e/slides.spec.ts` pass |
| N18 | Step 11, above: no page has a clip that does not play, in Chrome nor in Edge |
| N19 | The unit test of `playedSeconds` passes (`ui/animations/__tests__/blockPreview.test.ts`, "has played no time at a frame stamped before it started"), and the one of the main playback beside it (`playbackController.test.ts`, "a frame that began before playing did does not take the scene back"). A block's preview and the relation editor's were opened 25 times each on the idle machine, and every instant each showed was written down: each begins at the start of its loop (0.70 s, 1.50 s) and goes on from there (0.71, 0.73, 0.74 s…); none showed the loop's end. A person's eye on the first frame is still the owner's |
| N20 | The 14 tests of `e2e/previewModeKeys.spec.ts` pass. **Alt+Esc and Ctrl+Esc were not pressed**: they are the system's own keys, and pressing them takes the focus of the owner's desktop. By hand |
| N21 | The 6 tests of `e2e/htmlExport.spec.ts` pass. No real folder was written: a script cannot answer the system's folder picker (the spec writes in the browser's own storage). By reading, a sound file that cannot be removed is left there and named in a notice, and the export is whole (`clearEarlierSound`). By hand |
| N22 | The four tests of `test_audio` named "nearly full" pass (`ManimSound.test_a_soundtrack_that_arrives_on_a_nearly_full_disk_fails_the_render`, and of `VideoSound`: `test_a_disk_that_gets_nearly_full_stops_a_soundtrack_half_sent`, `test_a_second_pass_is_stopped_when_the_disk_gets_nearly_full`, `test_a_soundtrack_that_arrives_on_a_nearly_full_disk_fails_the_job`), and the four of `test_jobs`. After each of the three runs of the companion's whole suite TEMP holds no folder of a job |
| N23, N28 | A Mac's: no trackpad here. `e2e/pairCanvas.spec.ts` (13) and `e2e/macTrackpad.spec.ts` (7) pass |
| N24 | The 13 tests of `e2e/formulaKeyboard.spec.ts` and the second of `dist-check` pass. From `app/dist/index.html`, looked at in both themes: the 41 keys read, with no box in place of a symbol, drawn with MathLive's fonts loaded from the files beside the page (KaTeX_Main, KaTeX_Math, KaTeX_AMS, KaTeX_Size1), and they write (a fraction, a root, `x+1` inside it). In the dark theme the faces look heavier than in the light one: the same font at the same weight (400), light on dark as Windows draws it. No touch screen and no pen here |
| N25 | The 8 tests of `e2e/imageExport.spec.ts` pass. From `app/dist/index.html`: 1× (1920 × 1080), 2× (3840 × 2160) and 2× transparent (a PNG with alpha, its corner empty), each read back. **This machine refuses no size**: the largest the app can ask for, a project of 7680 × 4320 at 2× (15 360 × 8640), is made in 0.7 s with a window and without one (the adapter's largest texture is 16 384 px), with the scene in it; so the dialog's words for a canvas that is refused were not seen here. The system's viewer and a slide: by hand |
| N26 | The 3 tests of `e2e/starterExamples.spec.ts` and the third of `dist-check` pass. From `app/dist/index.html`, the four of **Help → Examples** open, each with its formulas (8, 2, 2 and 4) |
| N27 | The 9 tests of `e2e/library.spec.ts`, the two of `e2e/app.spec.ts` ("Help → About gives the versions and leads to the shortcut sheet", "Help → Third-party licenses lists the components, and its links open the files") and the fifth of `dist-check` pass; no file of the checkout has CRLF |
| A1, A4, N2, N3, N4, N11 | Not seen, as in §10: they need the keys and the gestures of a person. Every spec that presses those keys passes |
| A2, N14, N15, N16 | `e2e/audioExport.spec.ts` (16), `htmlExport.spec.ts` (6), `deckPage.spec.ts` (5), `deckControls.spec.ts` (17) and `deckParity.spec.ts` (5) pass. The project of §10, with sound and a pause, exported as a zip and as one file: the folder has `audio.m4a` (AAC, 5.000000 s); its page opened from the disk in Chrome and in Edge plays the sound with the scene, stops both at the pause and goes on with both (read from the page's `<audio>`, not heard). `node check.mjs` says `OK: "hello-sound" plays as written.` and ends, with 0, from Git Bash, from PowerShell and from `cmd`, and from another folder |
| A3, N9 | The tests of `e2e/video*.spec.ts` (26), the 59 of `e2e/camera*.spec.ts` and the camera cases of the export check pass |
| A6, N1 | 1276 of 1276, twice. No failure of a font nor of an encoder, and no race lost |
| C3, C8 | Above: a cancelled render and a companion ended at once leave no process; Ctrl+Break stops `serve` in order; the test that closes a real console window passes |
| J12 | TEMP is clean after the suites and after the harnesses |
| N8 | Step 7, above: every part holds |
| N13 | The tests of `e2e/slides.spec.ts` (49), `slidesRehearsal.spec.ts` (6) and `slideGuard.spec.ts` (3) pass |
| §11, §12, §13 | The first run on Windows of what the Mac changed and of what Linux made since: `e2e/macSecondaryClick.spec.ts` (5), `macTrackpad.spec.ts` (7) and `tooltipKeys.spec.ts` (2) pass, with the rest of the suite |

### What was changed

Nothing in the repository but this record. The probes written for the pass are outside it.

### What was left, and why it is the owner's

- **By hand, on Windows**, what §14 lists: Alt+Esc and Ctrl+Esc with a symbol chosen in **Align by
  symbol** (N20); **Export → HTML…** twice into the same real folder, the second time with the sound
  turned off, once more with the sound file open in a player (N21); a picture of **Export → Image…**
  opened in the system's viewer and dropped into a slide (N25); the keypad's keys under a finger or
  a pen, where there is a touch screen (N24). And what §9 and §10 list, which stands.
- **The keypad's faces in the dark theme** look heavier than in the light one on Windows (N24):
  nothing of the app, for the owner's eye.
- **A canvas that the browser refuses** was not seen: this machine makes the largest picture (N25).
  The dialog's words for it are stated by its unit test alone (`imageExportRun.test.ts`).
- What §10 left stands: `check.mjs` prints `·`, which reads `┬À` through a pipe of Windows
  PowerShell 5.1; a console window closed while a video is encoded takes 5 s for each ffmpeg; a
  log-off and a shutdown may leave the companion's folder.

### For the Mac

- The branch is `0298f978` with this record on it: the code is the one Linux ran in §14, and nothing
  was made here for the Mac to check.
- N23 and N28 are a trackpad's, and the keys of N20 are Windows' own: the table of §14 says what
  each asks there.
- The clips play here in Chrome and in Edge; §11 saw them fail now and then on the Mac before they
  were made again, so step 11 is worth its whole there.

### What is kept and where

Outside the repository, in `~/mfe-windows-final` on the Windows machine: the output of every step
(`01-…` to `17-…`), the logs of the two runs of `verify.sh` (`verify-1/`, `verify-2/`), the reports
of steps 6 and 7 (`06-…`, `07-…`), of the documentation site (`n10/`, `n18/`: one file for each
browser, with what every clip did, and in `n18/old/` the 87 clips of before `c8109bda`), of the
build opened from disk (`dist/`, with the pictures of the keypad), of the pictures of a frame
(`n25/`), of the two looping previews (`n19-stdout.txt`) and of the HTML export (`n14/`), and the
probes written for the pass (`probes/`).

## 16. The last pass on the Mac for 1.0.0

Run on 2026-11-21 by an agent on the owner's Mac, with the task of §14 (the steps of §9 that are a
Mac's and the three it adds), on the branch the owner had checked out for it: `mac-v1-final`, cut
from `origin/windows-v1-final` at `86375c7a`, the record of the last pass on Windows (its code is
that of `0298f978`). Nothing was pushed: the owner pushes. **Everything was green at the first
run**, and the pass itself changed nothing of the repository but this record. One thing was found
that no test failed for: the reach of the circle selector did not follow a slow scroll (row N28).
The owner, told of it, had it mended the same night: **one commit after the pass** (`94543c03`,
under "What was changed"), with the suites of the app run again on it. Font text is still not part
of the run (§4), and Safari is not looked at (§11).

### The machine

The one of §11: a MacBook Air with an M1 (8 cores, 8 GB, no fan), macOS 26.6.2 (25G83), its disk
APFS, not sensitive to case, with the same Node (24.18.0), npm (12.2.2), Chrome (157.0.8103.79), Git
(2.55.0), Python (3.14.7 of Homebrew as `python3`), TeX Live 2026 (pdfTeX 1.40.29, dvisvgm 3.6),
ffmpeg (9.0.1), ManimCE 0.22.1 and ManimGL 1.7.2 in their two virtualenvs, named by `MFE_CE_PYTHON`
and `MFE_GL_PYTHON`. The temporary folder is `/var/folders/…/T`, with 113.6 GiB free. **The checkout
is a fresh clone** of that day, so `npm ci` ran in `app/` (259 packages in 36 s, status 0), the one
thing installed. `git ls-files --eol | grep -c 'w/crlf'` prints `0`, and the branch is level with
its remote. Every command ran in zsh, started by the agent's session; the browser of the suites and
of the probes is the system's Chrome, headless but where a window is named.

### How the suites were run

As in §11: the steps of `verify.sh --companion` one by one, with the commands it runs, about six
minutes of work and then two of rest, and never two heavy runs at once. The companion's tests ran
module by module (the two classes of `test_fidelity` apart); the e2e suite rests by itself (120 s
every 200 tests: six pauses, with stretches of 4:02 to 5:11 between them and one of 1:39 at the
end); the export check ran in six groups of cases chosen by name, 125 to 280 s each, 120 s apart. So
the lines below are the ones `verify.sh` would print, put together from its steps. The sensor of the
battery, the only one that can be read without root, stayed between 30.1 and 31.2 °C through the
pass, and `pmset -g therm` named no limit of the processor's speed at any time.

### The run

| Step | Result |
|---|---|
| `verify.sh --static` | types ok, 25 s |
| `health` with the two interpreters | everything `[ok]` but font text, `[!!]` for both libraries with the reason of §4; under ffmpeg: "a video is written in /var/folders/…/T (113.6 GiB free) while it is encoded, 4 GiB at most" |
| `compile` twice for each target | 0.51 s and 0.48 s for `ce`, 0.64 s and 0.61 s for `gl`; `\alpha` into a file is UTF-8 JSON |
| Vitest (`npm test`) | status 0: 8808 passed, 1 skipped, of 8809, in 75 s |
| the companion's tests | status 0 for each module: 399 tests, OK, 18 skipped, in 431 s of tests |
| the e2e suite, 2 workers | status 0: **1276 of 1276** in 42.2 minutes, 30.2 of them of tests; none failed and none ran twice |
| `npm run dist-check` | status 0: 5 passed |
| `npm run parity` | `PARITY: OK`, in 32 s with the companion's disk cache and in 68 s with an empty one (`XDG_CACHE_HOME` naming a new folder), so that LaTeX really ran |
| `npm run export-check` | 200 passed and 12 skipped of 212, in 1313 s of its six groups, each with status 0; the 12 are the font-text cases, six for each library, each with its reason in `summary.json` |
| `TMPDIR` after the suites | nothing of the companion, of a harness nor of a test (the folder of logs that `verify.sh --static` makes for itself aside) |

```text
tsc       ok
eslint    skipped (no files)
prettier  skipped (no files)
vitest    ok (unit + native): 8808 passed | 1 skipped (8809)
companion ok: 399 tests, OK (skipped=18)
e2e       ok: 1276 passed, 6 pause(s) to cool
dist      ok (build, file://): 5 passed
```

They are the lines of Linux in §14 but for the pauses and the companion's skipped tests. The 18 each
say why, and are the 18 of §11: bubblewrap (9: seven "bubblewrap is not usable here", two
"bubblewrap is Linux's"), "a Job Object is a thing of Windows" (6), "a console window and its
closing are Windows'" (1), "Ctrl+Break is a key of Windows" (1) and `NativeText` (1). The companion
has five tests more than at §11, and they pass.

**No test failed in any step**, so there is no failure to group by cause. The whole verification ran
once (Windows ran it twice, §15, for the races §10 had lost there: this machine lost none in §11, in
§12 nor here). For the Linux machine to compare, the IoU of `hello-latex`, `emphasis`,
`paint-channels` and `camera-moves` is 0.947, 0.936, 0.876 and 0.995 with ManimCE and 0.790, 0.798,
0.874 and 0.917 with ManimGL, the figures of §11 to the last digit. The slowest case is
`completing-the-square-mathjax`: 30 s with ManimCE, 21 s with ManimGL. The export check names no
case twice any more (§11): its 212 tests are 212 names, which is how the six groups were counted.

### From the app (steps 6, 7 and 9 of §9)

As in §11: the companion started as the README says (`serve --allow-manim-render` with the two
interpreters), the app in a headless Chrome, the files as downloads.

- **Step 6.** "Renderer: LaTeX" ("2 formulas exact (LaTeX)", Companion 1.7.0, tools latex, dvisvgm,
  ffmpeg, ManimCE 0.22.1 and ManimGL 1.7.2); a video through the companion's ffmpeg in 0.95 s;
  Render with Manim in 2.1 s with ManimCE and 16.7 s with ManimGL (the twelve seconds of §11, which
  stand), each an H.264 MP4 of 50 frames and 5.000000 s. A render of `completing-the-square` at 1920
  × 1080 and 60 fps (2250 frames) cancelled at frame 51 with ManimCE and at frame 1 with ManimGL:
  the companion answered in 84 and 77 ms, and at once no process of the render was alive (the
  interpreter, its ffmpeg, the process under it) and the job's folder was gone (C3); the next render
  went through, in 6.1 s. Ctrl+C afterwards: status 0, nothing left in `TMPDIR`.
- **`serve --max-video-gib 2`** prints "Videos: up to 2 GiB each (--max-video-gib), written in
  /var/folders/…/T while they are encoded." and the dialog says "Up to 2 GiB per video: the
  companion’s limit. Start it with --max-video-gib to give it another." **`--max-video-gib 65`**
  starts nothing: "a whole number from 1 to 64 is required, not '65'", status 2. **`TMPDIR`** naming
  another folder, with a space in its name: `health` names it. One that names no folder is passed
  over for `/tmp`.
- **Over the limit.** With `--max-video-gib 1`, a MOV (ProRes) at 1920 × 1080 and 60 fps whose
  frames were replaced by noise on their way to the companion, as in §11: at frame 1134, after 228
  s, the companion answered 507 and the dialog says "The video is larger than 1 GiB, the most this
  companion writes for one video, so it was stopped. …"; nothing is saved, and at once ffmpeg is
  gone and the job's folder is empty.
- **The sound of an export** (step 4 of §7). An M4A of 2 s exported from the app, three times from
  one page and once from another: each has the edit list "media time: 2112, duration: 96000",
  `duration_ts=96000`, 96 frames and 2.000000 s. The first export of a page took 334 ms and the next
  two 165 and 167 ms; the first of the other page 178 ms.
- **Font text** (step 6 of §7). With the companion running, a text with a font: the workspace says
  "Rendering Pango…" and, 382 ms after it opened, "Placeholder boxes · needs the companion", with
  "Font catalog unavailable: Native text mapping currently requires the Linux Pango/Fontconfig
  backend."; no worker process started, and `GET /health` then gives `pango` as `failed` with that
  message for ManimCE. Applied, the object carries the badge "needs the companion" and the status
  bar says "Renderer: mixed".
- **A stop in the first seconds** (step 7 of §7). Ctrl+C 0.3 s and 0.6 s after `serve` started,
  while it still asked an interpreter for its Manim: status 0 in 0.03 s, no traceback, no
  interpreter left, no `mfe-probe-*` in `TMPDIR`. From 1.0 s on the probes had ended.
- **Closing the terminal** (C8, §11). The terminal's side of a pseudo-terminal closed under a login
  shell that runs `serve`, as a terminal does when its window closes, with no job and with a video
  job begun (an ffmpeg waiting for frames, a folder in `TMPDIR`): the companion ended 0.06 s after
  the close both times, with no traceback, no process and no folder left.

### The build opened from disk (step 10)

The five tests of `npm run dist-check` pass: the app starts from disk and renders a formula; the
formula keypad opens, draws its keys and writes; an example opens and its frame is written as a PNG;
Chroma Lab loads in its frame; the licence links open the files that travel with the build. What
rows N24, N25 and N26 ask of that build is in the table below.

### The documentation site (step 11)

Opened from `docs/web/` as files, in Chrome 157:

- **Every clip plays.** The 31 pages that have clips, in both themes, each clip scrolled to as a
  reader does: the 71 a theme shows play in the light theme and in the dark one, 142 files, in each
  of four passes, three without a window and one with. A page in the light theme shows the light
  file: none fell back to the dark one, and no view wrote anything in the console. `basics/timeline`
  and `basics/preview` play their seven each; 45 of the 71 are 364 px high or more. `ffprobe` says
  `vp9`, `yuv420p` and `color_range=tv` of the 142. **This closes what §11 left**: there, 16 of the
  71 of the light theme and 12 of the dark one did not play on this machine.
- **The videos rendered by Manim** (ten files, H.264, 854 × 480) play to their end, the two of
  `manim/without-companion` among them, and the two players beside those play when they are pressed,
  in both themes.
- **The search**: `/` takes it; "three dots" leads to `manim/without-companion.html#differ`,
  "keypad" to `basics/formulas.html#keyboard`, "Transparent" to `basics/export.html#image`, "pause
  that skips" to `basics/slides.html#skip-wait` and "trackpad" to `basics/timeline.html#zooming`,
  from the first page and from another.
- **The tools of the site.** `build-player.mjs --check`, `build-deck.mjs --check` and
  `reference-tables.mjs --check` say their files are up to date. `build.mjs --strict` reads 56 pages
  with no error and no warning, and what it writes (`assets/nav.js`, `assets/search-index.js`) is
  byte for byte what is committed. `check.mjs` on every page, both themes and both widths: 224
  views, 0 problems. `capture.mjs reference/shortcuts --only sheet` leaves `sheet.data.js` as it is.
  (These tools keep an empty folder of their own in `TMPDIR`, `mfe-docs-machine.queue`, as on any
  system.)

### §14, §9 and §2, row by row

| Id | What was seen |
|---|---|
| N17 | The 49 tests of `e2e/slides.spec.ts` pass |
| N18 | Step 11, above: no page has a clip that does not play, in four passes |
| N19 | The unit test of `playedSeconds` passes with Vitest. A block's preview and the relation editor's were opened 25 times each, and every instant each showed was written down from the first: each begins at the start of its loop (0.70 s, 1.50 s) and goes on from there (0.71 or 0.72, 0.73… s; 1.51, 1.52, 1.54… s); none showed the loop's end. A person's eye on the first frame is still the owner's |
| N20 | The 14 tests of `e2e/previewModeKeys.spec.ts` pass, pressing ⌘ where they press Ctrl elsewhere. Alt+Esc and Ctrl+Esc are keys of Windows: a Mac keeps neither for itself |
| N21 | The 6 tests of `e2e/htmlExport.spec.ts` pass. No real folder was written: a script cannot answer the system's folder picker (the spec writes in the browser's own storage). By hand |
| N22 | The four tests of `test_audio` named "nearly full" pass (`ManimSound.test_a_soundtrack_that_arrives_on_a_nearly_full_disk_fails_the_render`, and of `VideoSound`: `test_a_disk_that_gets_nearly_full_stops_a_soundtrack_half_sent`, `test_a_second_pass_is_stopped_when_the_disk_gets_nearly_full`, `test_a_soundtrack_that_arrives_on_a_nearly_full_disk_fails_the_job`), and the four of `test_jobs`. After the companion's suite `TMPDIR` holds no folder of a job |
| N23 | `e2e/pairCanvas.spec.ts` (13) and `e2e/macTrackpad.spec.ts` (7) pass. **No finger was on the trackpad**: the events were sent through Chrome's own input on the Mac, shaped as a trackpad's. In the drawing of the Morph editor and of the relation editor alike: a pinch (twelve wheel events with Ctrl set and no key down, −100 × ln 2 in all) takes the drawing from 100% to 200%; a scroll with both axes at once (14 and 40 px in four events) moves the drawing by 14 and 40 px, the zoom as it was; every event is taken by the page and nothing behind the dialog scrolls; ⌘ + a wheel's notch gives 122%, three give 182%, and Fit 100%. The real gestures are the owner's |
| N24 | The 13 tests of `e2e/formulaKeyboard.spec.ts` and the second of `dist-check` pass. From `app/dist/index.html`, looked at in both themes: the 41 keys of each of the first three tabs and the 65 of the alphabet read, with no box in place of a symbol, drawn with MathLive's fonts loaded from the files beside the page (KaTeX_Main, KaTeX_Math, KaTeX_AMS, KaTeX_Size1, KaTeX_Size2), and they write (a root with `x+1` inside it, a fraction). No touch screen and no pen here |
| N25 | The 8 tests of `e2e/imageExport.spec.ts` pass. From `app/dist/index.html`, at 14.35 s of the example: 1× (1920 × 1080), 2× (3840 × 2160) and both transparent (a PNG with alpha, its corners empty and what is drawn opaque), each read back. **This machine refuses no size**: the largest the app can ask for, a project of 7680 × 4320 at 2× (15 360 × 8640), is made in 1.5 s (1.3 s transparent) with the scene in it (the adapter's largest texture is 16 384 px), so the dialog's words for a canvas that is refused were not seen here. The system's viewer and a slide: by hand |
| N26 | The 3 tests of `e2e/starterExamples.spec.ts` and the third of `dist-check` pass. From `app/dist/index.html`: **Try an example** opens `Completing the square`, and the four of **Help → Examples** open, each with its formulas (8, 2, 2 and 4) and asking nothing; the page asks for nothing off the disk but the companion's `/health` |
| N27 | The 9 tests of `e2e/library.spec.ts`, the two of `e2e/app.spec.ts` ("Help → About gives the versions and leads to the shortcut sheet", "Help → Third-party licenses lists the components, and its links open the files") and the fifth of `dist-check` pass; no file of the checkout has CRLF |
| N28 | **The reach did not change while the events were small, and is mended** (`94543c03`): below, under "What was changed". With a real trackpad: by hand |
| A2, N14, N15, N16 | `e2e/audioExport.spec.ts` (16), `htmlExport.spec.ts` (6), `deckPage.spec.ts` (5), `deckControls.spec.ts` (17) and `deckParity.spec.ts` (5) pass. The project of §11, with sound and a pause, exported as a zip and as one file: the folder has `audio.m4a` (AAC, 6.000000 s, the edit list of §7); its page opened from the disk in Chrome plays the sound with the scene (0.67 s of sound at 0.70 s of scene), stops both at the pause, goes on with both and ends with both, and so does the one file (read from the page's `<audio>`, not heard). `node check.mjs` (Node 24) says `OK: "e2e" plays as written.` and ends with 0, in the folder and from another; with a mistake in `scene.js` it ends with 1 and names the line |
| A3, N9 | The tests of `e2e/video*.spec.ts` (26), the 59 of `e2e/camera*.spec.ts` and the camera cases of the export check pass |
| A6, N1 | 1276 of 1276. No failure of a font nor of an encoder, and no race lost |
| C3, C8 | Above: a cancelled render leaves no process and no folder; Ctrl+C stops `serve` in order, in its first seconds too, and so does closing its terminal; the two tests of `test_cli.Signals` that send the signal again pass |
| J12 | `TMPDIR` is clean after the suites and after the harnesses |
| N8 | Step 7, above: every part holds |
| N13 | The tests of `e2e/slides.spec.ts` (49), `slidesRehearsal.spec.ts` (6) and `slideGuard.spec.ts` (3) pass |
| N2, N3, N4, N5, N11, N12 | Not seen again: they need the keys and the gestures of a person, and §11 and §12 say what was seen and mended of them. Every spec that presses those keys passes, `e2e/macSecondaryClick.spec.ts` (5) and `tooltipKeys.spec.ts` (2) among them |
| §13, §14 | The first run on a Mac of what Linux made since §12, 119 commits: nothing of it fails here |

### What was changed

The pass itself changed nothing in the repository but this record; the probes written for it are
outside it. One commit came after it, on the owner's word:

| Commit | What | Elsewhere |
|---|---|---|
| `94543c03` | **The reach of the circle selector follows a scroll of small events** (N28). Shift + wheel rounded each event to a whole pixel from the reach that was kept, so that an event too small to move it one pixel moved it nothing, however many came. The reach is now turned finer than the pixel it is shown and stored in, and each view that sizes it keeps the part of a pixel it has turned | **The same code on every system, and not a no-op there**: a precision touchpad of Windows or of Linux sends small events too, and a run of a wheel's notches may differ by a pixel or two from what it was (below). Its tests state no system |

**What was found.** What the closing review read was so: `symbolRadiusAfterWheel` rounded each event
of the wheel to a whole pixel from the radius that was kept. Sent to the app as macOS hands a scroll
with Shift held (the turn in `deltaX`, Shift set), over the Preview with the circle selector and
over the drawing of both pair editors, with the same result in the three, before the commit and
after it:

| The scroll | From 14, before | After | One event of the same turn |
|---|---|---|---|
| 60 events of 1 to 4 px (150 px in all), either way | 14, unchanged | 19, or 10 | 19, or 10 |
| 30 events of 8 to 15 px (339 px in all), either way | 14, unchanged | 28, or 7 | 28, or 7 |
| a flick, 12 to 60 px an event and its glide (289 px in all) | 24, or 9 | 25, or 8 | 25, or 8 |
| a notch of a wheel (100 px) | 17, or 11 | 17, or 11 | the same |

At the reach the app starts with an event had to bring 18 px to count (17.6 to grow, 18.2 to
shrink); at the smallest reach, 6, it had to bring 40, and only the flick grew it; at the largest,
60, 4.2 were enough. After the commit every stream gives what one event of its length gives, from
14, from 6 and from 60.

**The cure** (`app/src/ui/preferences.ts`). `symbolReachAfterWheel` turns the reach finer than the
whole pixel it is shown and stored in, and each of the two views that size it keeps the part of a
pixel it has turned so far (`turnSymbolReach`, with a ref of the view): a scroll takes the reach as
far as one event of its whole length, however it is cut into events, and the fingers back where they
were give the reach it was. What a view kept holds while the reach is the one it rounds to, and
nothing is kept past a limit. The preference is written when the pixel changes, not at every event.
Two simpler ways were tried first and left: adding the turns up and starting again at each pixel
went twice too fast on a slow scroll, and keeping the old rule for the events that move the reach by
themselves still gave another reach for another cut of the same scroll.

**For a wheel.** A notch from a whole reach gives what it gave (14 to 17, 14 to 11). A run of
notches goes on from what the one before it left, where it rounded at each: from 14 it reads 17, 21,
26, 31, 38, 46, 57 and 60 where it read 17, 21, 26, 32, 39, 48, 59 and 60, and four notches down and
four up come back to 14, where they gave 13.

**Its tests.** Seven unit tests more (`ui/__tests__/preferences.test.ts`: the streams above, the
same reach for every cut of a scroll, the way back, the limits, a notch after a scroll, the
preference written once a pixel); the values the test of a notch stated are stated still. Two tests
of the specs: "a slow scroll with Shift sizes the circle too: its small events add up"
(`e2e/previewCircleSelect.spec.ts`) and "a slow scroll with Shift sizes the circle of the drawing:
its small events add up" (`e2e/pairCanvas.spec.ts`), each with the scroll handed sideways too, as a
Mac hands it. Both fail without the cure: the reach stays 14 where 9 and 11 are asked.

**The verification**, on the tree of `94543c03`, with the six minutes and the two of this machine:
`tsc -b`, eslint and Prettier on its files, ok. Vitest: status 0, **8815 passed and 1 skipped** of
8816. The e2e suite: status 0, **1278 of 1278** in 42.4 minutes with its six pauses, none run twice.
`npm run dist-check`: 5 passed. (One of the two new tests was given a wider margin after that run,
and the four specs of the reach ran again with it: 47 of 47.) **Not run again**, since nothing they
cover was touched: the companion's tests, the parity, the export check, the steps from the app and
the documentation site, whose pages say "Shift + wheel", which is still so. **No finger was on the
trackpad**: the events were sent through Chrome's own input, and what a real trackpad sends in an
event was not measured.

### What was left, and why it is the owner's

- **By hand, on the Mac**, what §14 lists: Shift + scroll with two fingers over the Preview with the
  circle selector and in the relation editor (N28: since `94543c03` the circle should follow a slow
  scroll a pixel at a time, and a sweep as far as it goes); the pinch, the scroll and ⌘ + wheel in
  the drawing of both pair editors (N23); the first frame of the two previews that loop (N19);
  **Export → HTML…** twice into the same real folder, the second time with the sound turned off
  (N21); a picture of **Export → Image…** opened in Preview and dropped into a slide (N25); ⌘+Enter
  with a symbol chosen in **Align by symbol** (N20). And what §9, §11 and §12 list, which stands.
- **A canvas that the browser refuses** was not seen: this machine makes the largest picture (N25),
  as the Windows machine did. The dialog's words for it are stated by its unit test alone.
- **Of what §11 left, the clips are closed** (step 11). The rest is as it was: the twelve seconds a
  render with ManimGL takes more than it has to through the companion (16.7 s here for the 50 frames
  that ManimCE renders in 2.1 s), Shift + wheel on the vertical timeline of Zen mode, a press that
  may never end under Chrome's own menu, a window moved between two screens, the Colors window of
  the system, and the smaller ones; and of §12, the choices the owner has to confirm.

### For Linux

- The branch is `86375c7a` with this record and one commit on it, `94543c03`, which has run on
  neither Linux nor Windows. Before it, the code is the one Linux ran in §14 and Windows in §15.
- `94543c03` touches `app/src/ui/` and its tests, and nothing of the companion, of the engine nor of
  `app/src/export/`: `verify.sh` says all there is to say of it there (its unit tests, the whole e2e
  suite and the build opened from disk). Its two new tests have no time in `app/e2e/durations.json`
  yet: they are tests of specs that have one.
- To read first: what it changes for a wheel (above), which no test of before stated, and by hand
  there, Shift + wheel with a mouse in the Preview with the circle selector, and Shift + scroll with
  a touchpad where the machine has one.

### What is kept and where

Outside the repository, in `~/mfe-mac-final` on the Mac: the working notes with every number
(`NOTES.md`); the machine and the steps before the suites (`01-…`, `02-…`, `03-…`); a log for each
step of the verification (`verify-1/`, the e2e log with the time of every line; `verify-2/`, the
same on the tree of `94543c03`); the parity and the six groups of the export check with their
summaries and the list of their tests (`manim-1/`); the temperature read every 20 s (`thermal.log`);
the scripts that keep the six minutes and the two (`run-companion.sh`, `run-e2e.sh`,
`run-export.py`); what the tools of the site printed (`docs-tools/`); and the probes (`probes/`: the
specs, and `out/` with a file for each thing said above: `step6.json`, `cancel.json`,
`font-text.json`, `m4a.json`, `limit-notice.json`, `over-limit.json`, `early-stop.txt`,
`window-close-*.txt`, `deck.json`, `dist-keypad.json`, `dist-image.json`, `dist-examples.json` and
the pictures of `dist/`, `n19-previews.json`, `trackpad-before-the-fix.json`, `trackpad.json` (after
it) and `trackpad-command.json`, `docs-clips-*.json`, `docs-manim.json`, `docs-players.json`,
`docs-search.json`).

## 17. On Linux: the last pass read and brought together (2026-11-22)

By the agent on the Linux machine, once the owner had fetched the two branches. `windows-v1-final`
(`86375c7a`) is the record of §15 alone. `mac-v1-final` (`9d54cbd5`) follows it with the record of
§16 and one commit of code, `94543c03`. Each record and that commit were read, and `codex-final`
went to `9d54cbd5` by a fast-forward: nothing had been made on Linux since `0298f978`.

### `94543c03`, read

- The cure is one function and one step (`symbolReachAfterWheel` and `turnSymbolReach`,
  `ui/preferences.ts`); the two views that size the reach call the step, each with a ref of its
  own. What a view kept is passed over once the reach was changed elsewhere (the other view), and
  nothing is kept on a whole pixel nor at a limit.
- A run of a wheel's notches differs by a pixel or two from what it was, as §16 says. No test of
  before stated those values, and none had to change.
- Nothing names the function it replaces any more, but the records above.

### The run on Linux

At `9d54cbd5`, `verify.sh --companion` with 9 e2e workers, exit code 0 in 1051 s:

```text
tsc       ok
eslint    skipped (no files)
prettier  skipped (no files)
vitest    ok (unit + native): 8815 passed | 1 skipped (8816)
companion ok: 399 tests, OK (skipped=9)
e2e       ok: 1278 passed, 9 workers
dist      ok (build, file://): 5 passed
```

`npm run lint`, of the whole tree, ran apart and was clean. `npm run parity`: `PARITY: OK`. The
processor reached 79 °C. The export check did not run on this commit: nothing it covers was
touched since its run at `ee414d54` (§14). The logs are in `tools/logs-paso5-9d54cbd5`, beside the
repository on the Linux machine.

**On Windows**, the owner says, the suites passed with `94543c03` too. No record of that run is in
the repository: the figures of §15 are those of `0298f978`.

### What came after, on the owner's word

| Commit | What | Elsewhere |
|---|---|---|
| `196a6d84` | **The notices of a build name ManimGL and the rate functions of Manim.** The rate functions a project is played with (`scene/easing.ts`) are ports of the two libraries', and the notices named Manim for the outline of the brace alone. ManimGL 1.7.2 is a component now, with the licence text of its tag; the engine of an exported page and the player of the web documentation, which hold those functions, give the two notices; the companion names the two libraries above the TeX documents it ports | The same on every system. Of `docs/web/assets/player.js` and `docs/web/decks/mfe-runtime.js` the first line alone changes, which names what each contains |
| `277201a3` | **The project says it is independent**: a sentence under the first paragraph of the README and a note at the end of the front page of the web documentation (not affiliated with 3Blue1Brown or the Manim Community, nor endorsed by them) | Text alone |

Neither has run on Windows nor on a Mac. The verification that freezes the version runs on Linux,
on the commit of this record; its figures are kept beside the repository, not here.

### What is not part of 1.0.0

- **The branch `windows-v1-png-worker`** (`04c59cdc` and its record `62e1e10c`, cut from
  `86375c7a`): a worker makes the PNG of each frame sent to the companion, which on Windows made a
  video through the companion's ffmpeg two to six times as fast. It changes the app on every system
  and has run on Windows alone. The owner keeps it as a possible addition of a later version: it is
  not in `codex-final`.
- Beside it, that record names a test of `e2e/audioExport.spec.ts` ("where the browser has no AAC,
  one click goes to the companion’s ffmpeg, whose MP4 has it") that fails on Windows with 8 workers
  and passes with 4: the dialog is read before the app has found the companion. Not seen on Linux
  with 9 workers.

### What is left, and whose it is

- **The owner's**: the tag `v1.0.0`. By hand he did what was asked of him on the three systems but
  one thing, which he keeps for later: a video of 40 to 60 minutes with sound, from end to end (he
  made one of 20 minutes, which went well).
- **The links to the repository** in the web documentation (`start/install.html`,
  `reference/troubleshooting.html`, `reference/files.html`) name
  `github.com/zavden/manim-formula-editor`: the public repository has no name yet, and they stay as
  they are until it has one.
- What §15 and §16 left stands, and the list of the closing review for a later version.
