# The widgets of the documentation

A widget is a small interactive piece of a page that makes an idea click: the reader plays with
the idea itself, outside the app — links glyphs, drags the window of a relation, switches a
palette. Widgets draw with the app's own code: the player's engine (`assets/player.js`,
`MFEPlayer.engine`) gives them the real glyphs of an example, the scene evaluator and renderer of
the app's Preview, and copies of the app's own rules held to the originals by unit tests
(`app/src/embed/`). They look like the app (its Mint style, both themes) and work with the mouse,
touch and the keyboard, at phone widths, and nothing moves by itself when the reader asks for
reduced motion.

Every widget is live, with its markup, on [authoring/widgets.html](../authoring/widgets.html).

| Widget | What the reader does |
|---|---|
| `link-glyphs` | Links glyphs of two formulas, and previews the transformation. |
| `relation-window` | Drags the window of a relation, and plays the scene with that timing. |
| `rate-functions` | Watches each rate function as a curve and a moving glyph, CE or GL. |
| `line-anchors` | Puts the ends of a line at the anchors of the glyphs they are on. |
| `style-compare` | Plays one relation with each style of a pair, side by side. |
| `palette-roles` | Switches between the app's palettes and reads the role of each glyph. |

## 1. Embedding a widget

```html
<head>
  …
  <link rel="stylesheet" href="../widgets/widgets.css">
  <script src="../assets/player.js" defer></script>
  <script src="../examples/widget-link.data.js" defer></script>
  <script src="../widgets/link-glyphs.js" defer></script>
</head>
…
<div class="mfe-widget" data-mfe-widget="link-glyphs"
     data-options='{"example": "widget-link", "start": "empty"}'></div>
```

- `data-mfe-widget` names the widget; `data-options` holds its options as JSON, in single quotes
  (the build reports options that are not valid JSON).
- The page's head loads `widgets/widgets.css`, `assets/player.js`, the data of every example a
  widget names (`examples/<slug>.data.js`, after the player), and the script of each widget it
  uses (`widgets/<name>.js`). Two widgets of one kind need its script once.
- When the head lacks the stylesheet, the player or an example's data, the widget loads them
  itself, a moment later, with a line in its place meanwhile: a page with only the widget's script
  works. List them in the head all the same, so that the widget shows at once.
- `rate-functions` needs no example: it moves an italic x of its own (it still draws with the
  player's engine).
- A widget that cannot show — an option it cannot read, an example without data
  (`node docs/web/tools/build.mjs` reports that one first), a relation the example has not —
  shows a notice in its place that says what is wrong; the console says it too, and the rest of
  the page goes on. `node docs/web/tools/check.mjs --page <id>` reports such a notice as a
  failure.
- Any example can be given to a widget, an author's own included: `link-glyphs`,
  `relation-window` and `style-compare` need a relation, `line-anchors` a line with an end on
  glyphs, `palette-roles` any scene. The `widget-…` examples of `examples/` were made for them.

A relation is named by its id (`r_…`), by `"from:to"` — the names of its two formulas, as the
examples tool takes them (`"step1:step2"`) — or by its number in the file (`1` for the first).
Without the option, a widget takes the first relation.

## 2. The widgets and their options

### `link-glyphs`

The relation editor's drawing: the source formula above, the target below, with the example's
real glyphs and the pairs drawn as coloured links. A click on a glyph of the source and then on
one of the target links them; Shift, Ctrl or ⌘ adds glyphs to the selection of a side, and
**Link** makes one pair of them — several glyphs onto one, or one onto several —, as the editor
does (its rules and its messages, a refused link included). **Delete link** (or the Delete key)
removes the pairs of the selected glyphs, a click on a pair under the drawing selects its glyphs,
**Suggest links by label** offers the pairs the editor suggests (Accept all, Dismiss), and
**Reset** goes back to the start (**Clear**, which removes every pair, with `"start": "empty"`).
The line under the drawing says which glyphs no pair takes and
what takes them (the source's outro, the target's intro). **Preview** plays the transformation
with the reader's pairs: the example's scene with the relation's pairs replaced, the two clips
alone, looping from half a second before the window to half a second after it, the window marked
on the time bar — the editor's own Preview. Pairs the app would refuse (it validates the project
first) show the app's message instead.

Keys: the arrows move between glyphs (← → along a formula, ↓ ↑ to the other), Enter or Space
clicks (with Shift: adds), Delete deletes the links, Escape clears the selection.

| Option | Value | Default | What it does |
|---|---|---|---|
| `example` | a slug | — (required) | The example. |
| `relation` | id, `"from:to"` or a number | the first | The relation. |
| `start` | `"app"`, `"empty"` | `"app"` | Start from the example's pairs, or from none (then **Reset** reads **Clear**). |

### `relation-window`

The two clips of a relation on a small timeline (the player's strip): their intros and outros,
the relation's window on both, and the room the clips leave it, dashed. The window's body moves it
in time and its two edges change its length, by dragging or with the arrow keys (0.05 s a step,
Shift: 0.25 s). Every edit goes through the app's own clamp: the window stays after the source's
intro and the target's start, before the source's end and the target's outro, is never shorter
than 0.05 s, and stops where it would give the project an error. A drag snaps to 0.05 s; Shift
lets it go free. The scene above plays with that timing, by itself while the widget is on screen
(never with reduced motion), with the transport bar under it; a press on the timeline moves the
time. **Reset** puts the example's window back.

| Option | Value | Default | What it does |
|---|---|---|---|
| `example` | a slug | — (required) | The example. |
| `relation` | id, `"from:to"` or a number | the first | The relation. |

### `rate-functions`

A card for each rate function: its curve (the progress of an animation over its time, as the
block dialog draws it), a dot on the curve, and a glyph crossing a lane by that progress — every
card on one clock, which plays by itself while the widget is on screen. A click on a curve shows
that moment. The switch shows ManimCE's or ManimGL's curves: the two libraries mean other curves
by `smooth` and the functions made of it. The functions that come back to where they started
(the only ones an Indicate takes) are marked.

| Option | Value | Default | What it does |
|---|---|---|---|
| `functions` | a list of names | all eight | The functions shown, in that order (below). |
| `target` | `"ce"`, `"gl"` | `"ce"` | The library it starts with. |
| `duration` | seconds | 2 | How long one run lasts. |
| `example`, `formula` | slug; id or name | an italic x | The glyph that moves: the formula's first. |

The app offers `smooth`, `linear`, `rush_into`, `rush_from`, `slow_into`, `double_smooth`,
`there_and_back` and `there_and_back_with_pause`.

### `line-anchors`

A scene with a line whose ends are on glyphs. Over each formula an end is on, the nine points of
the compass are drawn where Manim reads them (`get_corner(UL)`, `get_left()` … `get_center()`:
the box of the anchors in ManimCE, of every point in ManimGL); the current one is filled. A click
on a dot, or on a key of the compass under the scene (the Preview's compass, with **Auto** under
it), puts that end there, and the line is placed and built again at once, as the app's attach sync
places it. An end at Auto shows, with an amber mark, the edge Manim found towards the other end.
**Reset** goes back to the example's anchors.

| Option | Value | Default | What it does |
|---|---|---|---|
| `example` | a slug | — (required) | The example. |
| `formula` | an id or a name | the first line on glyphs | The line. |
| `time` | seconds | once the line is drawn | The instant shown. |

### `style-compare`

One relation played with each style of a pair side by side, on one clock: **Transform** turns the
source's glyphs into the target's, **Copy (source stays)** leaves them and sends a copy, **Fade
transform** fades them into the target while they move, **Fade copy (source stays)** leaves them
and fades a copy into the target. Each panel names what Manim plays for it in the example's
library. With `pair`, only that pair takes each style; with `pair` and `extras`,
the panels compare the ways the sources of a pair of several glyphs onto one arrive (Separate,
Merge, Copies), with the app's own words for each.

| Option | Value | Default | What it does |
|---|---|---|---|
| `example` | a slug | — (required) | The example. |
| `relation` | id, `"from:to"` or a number | the first | The relation. |
| `styles` | some of `"transform"`, `"copy"`, `"fade"`, `"fade_copy"` | all four | The panels, in that order. |
| `pair` | a number (1 for the first) | the whole relation | The pair that takes each style. |
| `extras` | some of `"separate"`, `"merge"`, `"copies"` | — | Compared instead of styles, for `pair`. |

### `palette-roles`

An example's scene made with each palette the app comes with: the editor's own colours (what it
uses without a palette) and the themes of Chroma Lab (Midnight chalkboard, Ink & paper, Orbital
violet, Light laboratory). Each object takes the colour of its kind's role — a formula `formula`,
a text `text`, a brace `muted`, a box or an underline `rectangle`, a circle `circle`, a cross or a
line `arrow` —, each glyph with a role takes that role's colour, and the background takes
`background`: the scene as it is made with that palette active. Hovering a glyph (or focusing the
scene and moving with the arrows) shows its role and colour; hovering a role of the legend lights
its glyphs and dims the rest.

The role of a glyph is read from the example: a glyph coloured with a role's colour of the
editor's own palette has that role — `#58C4DD` a variable, `#F0AC5F` a constant, `#83C167` a
result, and `#FFFFFF`, set as the glyph's own colour, an operator —; any other colour of its own is
kept in every palette, as a project keeps literal colours; a glyph without a colour of its own
has its object's role. `roles` gives roles by hand.

| Option | Value | Default | What it does |
|---|---|---|---|
| `example` | a slug | — (required) | The example. |
| `palettes` | ids | all | The palettes offered (below). |
| `roles` | `{"f1": {"variable": [2, 6]}}` | — | Roles of glyphs by hand (formula: id or name). |
| `time` | seconds | the end | The instant shown. |

The palettes' ids: `editor`, `midnight-chalkboard`, `ink-and-paper`, `orbital-violet`,
`light-laboratory`.

## 3. The examples of the widgets

`examples/widget-link`, `widget-window`, `widget-styles`, `widget-anchors` and `widget-palette` are
made for the widgets (`tools/EXAMPLES.md` says how examples are made; they are projects of the
app, built by `tools/examples.mjs`). A page may use them, or its own.

## 4. How a widget is made

The sources are in `widgets/src/`: `kit.js`, what every widget shares, and one file per widget.
`tools/build-widgets.mjs` writes each `widgets/<name>.js` from the kit and the widget's source,
inside one closure (a widget is one classic script; two on a page share nothing but
`window.MFE_WIDGETS` and the loads of what the page lacks, `window.MFE_WIDGET_LOADS`). The
written files are generated: never edit them, build again and commit them with their sources.

```sh
node docs/web/tools/build-widgets.mjs            # write widgets/<name>.js
node docs/web/tools/build-widgets.mjs --check    # fail if one is not what its sources make
node docs/web/tools/check-widgets.mjs            # drive every widget in Chrome, both themes
node docs/web/tools/check-widgets.mjs --shots <dir>
```

A new widget:

1. Write `widgets/src/<name>.js`. It ends with its registration, as the site mounts it
   (`AUTHORING.md`, "Widgets"):

   ```js
   function mountMyWidget(element, options, context) {
     const example = exampleOf(options.example);   // a notice when the page lacks it
     const root = card(element, 'my-widget', 'What it shows, for screen readers');
     …
   }

   (window.MFE_WIDGETS ||= {})['my-widget'] = {
     mount(element, options, context) {
       const given = options || {};
       const build = () => mountMyWidget(element, given, context);
       return start(element, context, [given.example], build);   // [the examples it names]
     },
   };
   ```

2. Build on the kit (`widgets/src/kit.js`): `start` mounts the widget once the page has what it
   needs (it loads the player, the examples' data and the stylesheet the head lacks); `el` and `svg`
   make elements; `exampleOf`, `relationOf` and `clipAndFormula` find what the options name, and
   throw a `WidgetProblem` that `guard` turns into the site's notice; `card` makes the widget's
   panel (a `.mfe-player`, so that the player's stylesheet gives it its look, its transport bar and
   its strip); `segmented` is the app's switch; `transport` is the player's bar on a clock of the
   widget's (Play, Loop, a time bar with a band, the time; the keys; a pause off screen; autoplay
   never with reduced motion); `sceneCanvas` sizes a canvas and draws a scene on it; `contoursPath`
   makes an SVG path of a glyph's outline; `toneOf` tells a light scene background from a dark one.
3. Draw with the engine (`tools/EXAMPLES.md`, "The engine, for widgets"): `example.glyphs`,
   `example.scene(project)` of a modified copy (`example.cloneProject()`), `scene.draw` with a
   `region` and an `adjust`, and the app's rules in `engine.relations`, `engine.lines`,
   `engine.palettes` and `engine.rates`. When a widget needs a rule of the app the engine has not,
   add it to `app/src/embed/` — a copy of the app's function with a unit test that holds it to the
   original, as the others are —, build `assets/player.js` again and document it in EXAMPLES.md.
   Never write the app's logic into a widget.
4. Style it in `widgets/widgets.css` with the site's tokens (`--doc-*`), both themes. What is drawn
   over a scene takes the colours of the scene's background (`data-scene="dark|light"` on the
   stage, `toneOf`), not the page's.
5. Let the card say how it stands in data attributes (`transport` writes `data-time` and
   `data-playing`; `link-glyphs` adds `data-pairs` and `data-view`, `relation-window`
   `data-offset` and `data-duration`…): `tools/check-widgets.mjs` reads them.
6. Add it to `authoring/widgets.html` with its options, and to the checks of
   `tools/check-widgets.mjs`. Build, check, and look at the screenshots, dark and light, 1280 and
   375 pixels wide.
