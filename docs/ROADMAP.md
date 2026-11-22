# Roadmap

Phases 0–5 built the app; each ended with a demo and the owner's approval before the next one
started. Since then the work goes in small verified changes, one commit each (see `CLAUDE.md`),
grouped into steps the owner approves the same way.

| Phase | Scope | Status |
|---|---|---|
| 0 | Foundations: tooling, app shell, contracts, parity harness, examples | done |
| 1 | Formula engine: MathJax + companion backends, matching, calibration | done |
| 2 | Creator, static preview, project files, undo/redo | done |
| 3 | Timeline, evaluator, intro/outro/tween animations, playback | done |
| 4 | Relations: popup editor, Animations diagrams, morphing | done |
| 5 | Export: Python (CE/GL), video, companion encoding and Manim rendering | done |
| 6 | Polish, documentation, packaging, full end-to-end coverage | in progress |

## Since phase 5

| Work | Status |
|---|---|
| Animation blocks on clips: Appear, Disappear, Transform of the whole formula or of a part (format 3) | done |
| "Edit together" for several formulas; the Templates tab (257 formulas) | done |
| "Trazo" design, steps 1 and 2: identification colours, focus halo, overlay halo, the renderer, document and context lines | done |
| "Trazo" design, step 3: optional interactions | paused |
| The Mint theme over the whole interface (the owner's style guide): glass panels, mint primary buttons, panel and tab icons, a light counterpart | done |
| Refactor and documentation pass: the `mfe-change` skill, the pinned Python, shared modules | done |
| Morph blocks within a formula (format 5): a derivation written row by row, the pair editor with Suggest | done |
| Custom paths for transfer pairs (format 8): a spline per pair shaped in the preview's Edit-path mode, played by the evaluator and by a `path_func` helper in the export | done |
| Objects of other kinds: the LaTeX text (format 9), objects attached to glyphs of another clip (format 10), braces fitted to glyphs (format 11) and labels at their tip (format 12), exact against both libraries | done |
| Shapes fitted to glyphs — box, circle, underline, cross, highlight (format 13) — and Emphasis blocks on glyphs — Indicate, Wiggle, Circumscribe, Flash, FocusOn (format 14) —, exact against both libraries | done |
| A pair that sends copies remembers which of its sources is the one consumed when a render renumbers the glyphs (`principal`, format 15) | done |
| Sound: recordings on audio tracks, trimmed and split, with volume curves (format 16), mixed in playback and into the videos of the browser, of the companion's ffmpeg and of Render with Manim; a project with recordings travels as a `.mfe` package | done |
| Font text: text in any font of the machine, shaped by Pango through the companion (format 17), its geometry carried by the `.mfe.json` (format 18), placeholder boxes where nothing can shape it, and text workers the companion starts with their first use | done |
| Chroma Lab, the colour studio, with the editor's palette library and Apply palette | done |
| Templates with placeholders: the 257 templates name their variables `#1`, `#2`…, Use asks for their values and draws the formula before it is made, and the user keeps templates of their own and favorites (the browser, the synced folder's `templates/templates.json`, export and import) | done |
| Groups of formulas in the Creator's list (format 22): several formulas as one row that opens onto them | done |
| Shapes that change (format 23): a fill colour of their own, a Transform that repaints them (stroke width, opacities, fill colour), and one that carries a shape to surround another formula or other glyphs; a brace on a shape and over several selected clips; exact against both libraries | done |
| Texts that keep their place (format 24): where a text is put in its editor is where its new clips start, unless **New clips start here** is unticked | done |
| Cross line (format 25): one line of a cross over a diagonal of its target, DL-UR or UL-DR, exact against both libraries | done |
| Lines and arrows (format 26): a line, a dashed line, an arrow and a double arrow between two ends, each on glyphs of a clip or at a point, drawn in the preview and moved by handles at their ends; an end on glyphs at the point of them a compass asks for (format 27: a corner, an edge, the centre, or Manim's own edge); exact against both libraries | done |
| Curved lines and other tips (format 28): a line bent into an arc (Manim's `path_arc`, by a field and by a handle in the preview) or into a spline shaped in the mode Edit curve; a stealth tip and a dot beside the triangle, one shape at each end of a double arrow; exact against both libraries | done |
| GrowArrow (format 29): an arrow or a double arrow grows from its start, as each library grows it; a bent one is drawn along its own way instead, its tip on the end of what is drawn (an animation of the editor's own, a helper in the Python) | done |
| Become ›: a line's menu makes it another of the four kinds of line | done |
| A Transform that carries the ends of a line (format 30): onto glyphs or to points, with another stroke width, colour and opacity, an arc with other degrees; an arrow built anew, a line and a dashed line carried as Manim's `put_start_and_end_on` carries them; the handles of the ends move them in the Transform in effect; exact against both libraries | done |
| Reverse points: the start and the end of a line change places where they are | done |
| Copy path shape / Paste path shape: the shape of a line's path (straight, an arc, a spline) given to other lines of any kind, which keep their ends, tips and kind | done |
| Timing › in the menus of the timeline's clips: copy a clip's start, end, duration and the time of its intro and outro, and paste one of them onto other clips (aligned on an edge, as long, an intro as long); a paste that does not fit leaves the clip and says why | done |
| The Projects dialog: resizable and maximizable, its projects as cards in as many columns as it has room for, a search by project name and file name, and favorites (a star on a card, All / Favorites), kept in the browser | done |
| Palette roles by name: the Roles pop-up of a color field shows each role as a block with its name; a palette holds roles of the user's (a name and a color, `customRoles`, exported with it and left out by Chroma Lab); Apply match colors shows the colors of each list | done |
| The Split… dialog of a block resizable and maximizable; Standard scale's «Apply to all formulas» and «Apply to all texts» (the scale typed, on every object of the kind, one undo step); «Edit path…» beside a relation in the Relations list, and a dot on each pair with an edited path wherever pairs are listed beside an «Edit path…» | done |
| A key left of «+ New» (∑, with a menu of the kinds; three keys until D183) that adds every formula, LaTeX text or font text of the project to the selection (chosen with its kind all selected, a row takes it out); a region dragged over the results of the search selects the cards it touches (Shift adds, Ctrl/⌘ takes out, Esc gives the selection back); «Edit together…» gives all its formulas one Scale ("mixed" while theirs differ) and applies a list of Match colors to all of them | done |
| The relation editor previews the transformation of its draft: a switch Link / Preview over the drawing, the relation's two formulas looping as they would be saved now, with play and pause, a bar for the instant that marks the window, the time and the share of the transformation; each pair in the list of pairs of the pair editors has its «Edit path…» and the mark of an edited path | done |
| «Preview raw» in the relation editor: the last key of the drawing's toolbar animates the drawing that links the glyphs, the source on top and the target below, the glyphs going straight from one to the other as their pairs say (no path arc, no custom paths), the target as a ghost at half its opacity and the glyphs that are not on screen outlined, dashed; the bar of the loop takes the toolbar's place, and its key or Esc ends it | done |
| Moving in the preview by keyboard and along one axis: Alt pressed once a drag runs holds it to one axis, the way the pointer has gone further, still snapping along it (Ctrl/⌘ too: no snapping), for one clip or several; after a click on the scene the arrow keys move the selected clips by 0.01 (Shift: 0.1) at the playhead, as a drag would move them, a run of presses one undo step | done |
| The timeline's toolbar says, beside the zoom, the time between two small ticks of the ruler («dt 0.5 s»: the step the timeline snaps to; «1/60 s» on every frame) | done |
| Unlink formula (make a copy): in the menu of a clip whose formula has other clips — on the timeline and in the preview —, the clip takes a copy of its formula of its own, the one Duplicate makes (after the original in the Creator and in its group), with everything it had, so that editing one formula no longer changes the clips of the other; the selected clips of each formula share one copy; off, saying why, for a formula's only clip | done |

## Phase 6 checklist

Chroma Lab integration (historical R7) is implemented. Preferences opens the complete offline
studio and an editor palette library; role choices, creation defaults, explicit Apply and Match
templates store literal colors and need no change to the project format. The lock and background
policies of Apply palette are in [ARCHITECTURE §11, "Chroma Lab and editor
palettes"](architecture/11e-chroma-lab-palettes.md#chroma-lab-and-editor-palettes).

- [x] User README with the keyboard shortcuts; `docs/COMPANION.md`.
- [x] Example projects: `hello`, `one-to-many`, `animation-blocks`, `multiline`,
  `quadratic-formula`, `completing-the-square`, `match-colors`, `custom-paths`, `text-title`,
  `braces`, `emphasis`, `text-pango`, `shapes`, `lines`, `camera`.
- [x] Static build that opens from `file://`.
- [x] The companion as one standard-library Python file (no package to install).
- [x] Light theme.
- [x] A shortcut sheet in the app (Help → Keyboard shortcuts…, or `?`).
- [x] Error messages reviewed end to end (invalid LaTeX, companion offline, failed exports): ten
  bugs fixed, the key messages rewritten, and an error screen instead of a blank page.
- [x] Performance: a render cache. Rendering in a worker is not needed: a MathJax render takes a
  few milliseconds, and the `file://` build could only use an inline worker.
- [x] An accessibility pass: Space, focus and contrast, names, keyboard ways to add clips, select
  formulas and pick glyphs, announcements, hold-to-delete for assistive technology. Done since: a
  keyboard model for the timeline itself, the full menu-bar keyboard pattern, forced-colours mode,
  reflow at 400 % zoom, align by symbol from the keyboard, and a System theme.
- [x] One end-to-end spec for the whole flow: create → animate → relate → export
  (`app/e2e/fullFlow.spec.ts`, through the UI only).
- [x] The companion serving the built app (`serve --app app/dist`, at `/app/` on its own origin;
  `docs/COMPANION.md`, security notes).
- [x] UI polish left from the design review: action bars that show up when several formulas or
  clips are selected, panels that fold to their title bar, and an Export… button beside the menus.

## Acceptance criteria

**Phase 0** — `npm run check`, `npm run e2e` and `npm run parity` pass; the app opens with the
five areas and the theme toggle; the examples load without schema or semantic issues.

**Phase 1** — Parity report green on a corpus of ≥ 60 formulas: companion glyph count and
order equal ManimCE and ManimGL; MathJax ↔ LaTeX matching correct for every equal-count case.
In the app, `\frac{a}{b}` shows 3 labelled glyphs; with the companion running the badge reads
"exact" and indices equal `MathTex(...)[0]`.

**Phase 2** — Create three formulas, colour glyphs, save, reload the page, reopen the file and
get everything back; `examples/hello.mfe.json` renders as expected in the preview.

**Phase 3** — Two formulas on different tracks, one with a 1 s Write and another with a
move + rotate tween; playback and scrubbing agree (same t ⇒ same image).

**Phase 4** — `mx+y=0 → mx=-y` and `a+b=c → a:3, b:1, c:4` play as intended (the examples
`hello` and `one-to-many`), including scrubbing inside a transformation.

**Phase 5** — The examples export to CE and GL and render without errors in both venvs; the
web video lasts exactly the timeline length; the middle frame of a transformation resembles
Manim's.

**Phase 6** — The full flow (create → animate → relate → export) works in Chrome without
touching code; `npm run check` passes.
