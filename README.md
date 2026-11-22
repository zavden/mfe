# Manim Formula Editor

A web-based, video-editor-style tool for animating formula manipulations, built as a companion
for [Manim](https://www.manim.community/) (ManimCE and ManimGL).

It is an independent project: it is not affiliated with 3Blue1Brown or the Manim Community, nor
endorsed by them. It writes scenes for their libraries.

- **Creator** — write LaTeX formulas (single-string), pick LaTeX packages, tag and color them.
- **Font text** — compose Unicode text with Pango and position its actual contours on a scene stage.
- **Timeline** — place formulas on layered tracks and control when they appear, move and disappear.
- **Animations** — relate glyphs between formulas (one-to-one, one-to-many, many-to-one) to build
  formula transformations, or morph glyphs within one formula to write a derivation line by line.
- **Audio** — import recordings, trim and split them, edit volume curves and mix dedicated tracks.
- **Preview** — scrub and play the synchronized result in the browser.
- **Export** — ManimCE / ManimGL Python, video with audio (encoded in the browser or by the
  companion's ffmpeg), WAV/WebM audio (M4A where the browser encodes AAC), a web page that plays
  the scene live, stops at its pauses and is made to be embedded and extended, by hand or by an
  agent (HTML), and portable projects (`.mfe.json`, or a `.mfe` package when the project has
  recordings).
- **Slides** — mark the pauses of a talk and leave comments on the scene's time, for the page.
- **Colors** — palettes by role, made and edited in the editor or designed in Chroma Lab, its
  color studio, and applied to new objects or to a whole project.

The app runs entirely in the browser (formulas rendered with MathJax). An optional local
_companion_ (Python, standard library only) adds exact Manim glyph order through LaTeX + dvisvgm,
native Pango text, fast video encoding through ffmpeg, and rendering with a local Manim install.

Two parts add to the editor, and neither is required ([Optional parts](#optional-parts)): **Chroma
Lab**, the color studio, which comes inside every build and is the recommended way to design a
palette, and the companion.

**Documentation.** A guide that goes from the first formula to the last detail — pages with live
examples that play in the browser, captures of every panel, five step-by-step tutorials and a
reference of every shortcut, menu and preference — is in [`docs/web/`](docs/web/index.html). It
needs no server and no network: clone the repository and open `docs/web/index.html` in a browser.
This README stays the complete reference of what the app does.

**The website.** `docs/` is the project's website as it is, with no build: its `index.html` is the
project's page, which plays examples of the documentation and links into it. GitHub Pages serves it
from the folder `/docs` of the branch (`docs/.nojekyll` keeps every file as it is), and Netlify by
`netlify.toml`. `node docs/web/tools/check-landing.mjs` checks the page.

> Status: the roadmap phases 0–5 are done, and so is what [docs/ROADMAP.md](docs/ROADMAP.md) lists
> since: animation and Morph blocks, custom paths, LaTeX texts, braces, shapes and Emphasis blocks,
> sound, font text and the Chroma Lab palettes, besides the formula template library and the
> interface's Mint theme.

## Using the app

### Text composition

Choose **Creator → New → Text (font)** or **Text (LaTeX)**: both kinds of text are edited in the
composition editor, which has an ordinary multiline text field and a separate stage with the
Preview's output frame, aspect ratio and scene coordinates. For a font text, choose the whole
object's font, size, bold/italic style and color. Enter creates a manual line; the field does not
invent line breaks when its panel becomes smaller. Move the rendered text with drag, grid/snapping
guides, X/Y fields or the horizontal and vertical centering buttons. Fit, zoom and pan change the
editor view without changing scene placement. A dot beside the line over the stage tells what the
render of the draft is doing: amber while it is rendered again (the last appearance stays on the
stage meanwhile), green when what is drawn is current, red when it was refused. What the renderer
says, and why Apply waits, is listed in a strip of a fixed height under the stage, so nothing moves
the stage while you type. Maximized or resized, the dialog gives its room to the stage, which stays
whole at the frame's aspect, and to the text field.

**Apply** creates a library object; **Add to the timeline** remains a separate action. Opened from
the Creator — a new text, or one of the list — the stage places no clip: it shows where the **new
clips** of the text start. **New clips start here**, ticked whenever the editor opens, makes Apply
keep that position in the text: every clip of it dropped on the timeline or added from a menu
afterwards starts there instead of at the centre of the frame, while the clips already on the
timeline stay where they are. Unticked, the position is not saved and the text keeps the one it had.
Edit an existing text through Creator, its clip menu, or a Preview double-click. A clip-specific
editor identifies the initial state or selected transformation end state being placed, and has no
such box: its stage places that clip. Source and typography are shared by every use; the position of
a clip belongs to that occurrence. Attached objects retain their attachment and require an explicit
detach before free positioning. A locked shared use prevents source changes of a font text, whose
uses share one saved appearance (a LaTeX text is rendered again, and is not locked by its other
uses); **Make independent on Apply** edits just the selected unlocked occurrence.

Typing and positioning stay in a local draft. **Apply** commits the eligible changes as one Undo
step; **Cancel** discards them. Ctrl/⌘+Enter applies from the keyboard, and a click outside the
dialog neither applies nor closes it. Native text Undo stays inside the source field. Playback,
including audio, pauses when composition starts and does not resume automatically. Apply or Cancel
before Save, Open or Export, then invoke that command again. Unapplied source has bounded per-tab
recovery.

A **LaTeX text** has its own form beside the stage: the text in LaTeX's text mode (`$…$` for maths,
`\\` for a line break, a blank line for a paragraph), its size (the scale and Manim's font size, one
value: 1.5 × 48 = 72), its colour, its layout (the width in scene units, the alignment of the lines
and their spacing) and what it has as an object: its name, its tag and **Appears with**, the intro
its new clips start with. All of it is the draft: nothing reaches the project, not even a new text,
until **Apply**. The draft is rendered as you type, by LaTeX when the companion runs and by MathJax
otherwise; the line over the stage says how many glyphs it has and who drew them, a text that does
not compile shows what LaTeX said with its log while the stage keeps its last appearance, and what
the render warns of (approximate line breaks, the `fontenc` line for accented letters) is listed
under the stage.

The switch over the stage shows **Glyphs** in place of **Placement**: the glyphs of the draft, with
their index and label, to colour or to hide at the start as in the formula editor (click one,
Shift+click a range, Ctrl/⌘+click to toggle, drag a box over several, or use the right-click
menu; the key after the switch lists the glyphs under the drawing, as in the formula editor). What
you colour stays with its glyphs while you go on typing or change the
layout, and shows on the stage; Apply writes it with the text, in the same undo step, and carries
the pairs, blocks and attachments that name glyphs of the text along. Colours you set need a text
that renders: while it does not, Apply waits and a line says why. Where a change cannot be followed
glyph by glyph, the view says so and the text keeps the colours it had.

Fresh contours need the companion with a configured Manim interpreter and its Pango fonts. In
version 1.0 the companion shapes font text on Linux only (Pango with Fontconfig); on macOS and
Windows that comes in a later version. Without one, a text is drawn as **placeholder boxes**, one
per character, laid out with the font the browser has under that name, and wears the badge **needs
the companion**: it can still be composed, placed, coloured and animated, and a project with such
texts saves, opens and exports (Export → Python writes the text and counts its glyphs one per
character, saying so; a Browser or ffmpeg video shows the boxes, as the preview does). When a
companion shapes the text, its real glyphs take the place of the boxes and keep what was made on
them; a ligature takes what its first letter had. The companion starts its text worker for a library
the first time a project with font text, or the text editor, needs it: that takes about a second,
and nothing of it runs in a session without font text. Browser font availability otherwise does not
control the stage. A text is shaped for the Manim target of Project settings; an export for the
other library writes the same text at a converted size and says what may differ (the size by a few
percent, the spacing of lines and tabs). Rendering is asynchronous; stale geometry is identified and
its snapping/centering is disabled. Glyph colors apply after shaping, so they do not alter kerning
or ligatures. Edits that cannot preserve glyph identity require reference repair. Bitmap/color
glyphs and missing fonts produce explicit errors while retaining the source; so does a text the
companion cannot shape within five seconds, which it then leaves alone for ten minutes (a shorter
text, or the same text in several objects, takes less). CE expands tabs to four
spaces; GL uses its native Pango tabs. Paragraph reflow, mixed typography within one object and font
embedding are outside this release.

Verified contours are owned project data, and the project file carries them: a project with text
and no recordings saves as one `.mfe.json`, and reopening it keeps the appearance without fonts or
companion (`examples/text-pango.mfe.json` is one: two texts, and an equation that takes two of their
glyphs). Source-only drafts can still save while rendering is unavailable. New geometry arriving
after a Save requires another Save. Browser video uses the current saved appearance. Export → Python
and Render with Manim never wait for the companion over a text: they list the texts the editor
cannot vouch for (no companion to compare the fonts of this machine with, or fonts or versions that
changed since the text was shaped) and go on. Generated Python checks the actual text contours
before animation: a text that Manim draws differently (other fonts, other versions) is named in a
warning on stderr, and the scene renders all the same (if the text comes out with fewer glyphs
there, the missing ones draw nothing). **Refresh appearance** explicitly accepts a fresh native
result after changing fonts or native versions; reconnecting the companion never replaces saved text
by itself.

### Audio workflow

Open **Creator → Audio → Import audio…**, or drag audio files from the desktop onto that tab, to
import MP3, WAV or another format this browser can actually decode. A file that comes in under the
name of another recording asks for a name of its own first (the first free numbered name is
proposed; **Don’t import** leaves the file out), and a file the project already has is not imported
twice: a notice names its recording. The original recording is reusable: choose a source interval
and **Add to timeline**, or drag the button onto an unlocked audio row. **Add to timeline** places
the clip at the playhead, on the first unlocked audio row with room there, and adds a row when none
has room; a drop on a full row is refused, never shortened. Each placement has its own trim and
volume curve. A recording is renamed in its row of the tab: type the new name and press Enter or
leave the field (Escape takes the edit back). Audio rows mix together; clips within one row cannot
overlap. Reordering audio rows does not change the visual stacking order.

Drag a clip from anywhere on it to move it, or its upper edge handles to trim or restore source
content. Select audio and press **S** to split at the playhead; duplicate with Ctrl/⌘+D, delete with
Delete/Backspace. A split preserves the sound, including a cut inside a ramp, and deleting a section
leaves a gap. Mixed visual/audio selections move together in time; vertical moves require
compatible tracks. The key that shows the whole timeline can show an entire 60-minute project.

The waveform shows the recording; the overlaid percentage line is the clip's volume. On the clip it
is a drawing until the button beside **Volume…** is turned on (one per clip): then the line and its
points are the handles described next, and the clip moves by its caption only, so a drag meant for
the clip never changes its volume. Drag a flat line to change its constant level, or drag an
automated segment vertically to move its two bounding levels together without changing its slope.
Double-click the line to insert a point without changing its current level, then drag points to draw
ramps. Arrow keys move a focused point (Shift makes a larger step), Delete removes it, and Enter
opens numeric controls. Each drag is one Undo step; Escape restores the previous curve. **Volume…**
also has a source-time field and **Add point** button (Enter inserts the point), so insertion is
available from the keyboard. The Audio properties panel and **Volume…** offer source bounds,
constant volume, **Fade In**, **Fade Out**, and **Reset volume**. Fades edit ordinary curve points
at the current trimmed edges. Defaults use at most half the clip, up to 0.5 seconds; an untouched
default follows later trims, while an explicitly typed duration stays. Later trimming preserves
the authored points' source positions. Reapplying a fade
replaces points in its interval. Points outside it remain available when a trim is restored.

100% means the original amplitude, 0% means silence, and 400% is the maximum amplification. On the
timeline the 100% line sits at mid-height: fades and reductions get the lower half of the graph,
amplification the upper half. Changing Constant volume replaces automation. Track **Mute** affects
playback and exports; a **locked** track still plays but its clips cannot be edited (the track
itself can be deleted, like a locked visual one, after the same question). Playback follows the
audio device's clock and applies live curve edits. The peak meter marks levels above 100%; lower
volumes when a mix clips.

**Export → Audio…** writes stereo 48 kHz WAV (16-bit PCM) or WebM/Opus, without rendering formulas,
and M4A/AAC where the browser can encode AAC. **Export → Video… → Browser** includes audio by
default and offers **Include audio** to turn it off. WebM uses Opus. MP4 uses AAC where the browser
has an AAC encoder (Chrome and Edge on Windows and macOS). Where it has none (Chrome on Linux) the
MP4 carries Opus and the dialog says so before exporting: browsers and players such as VLC play it,
some players and video editors do not. With a companion whose ffmpeg encodes AAC, a button under
that warning switches to **Companion · ffmpeg** with MP4 in one click. The app has no AAC encoder
of its own, and everything is encoded locally, including when the app opens from disk.

**Export → Video… → Companion · ffmpeg** offers **Include audio** too: the app sends the mix with
the frames and the companion's ffmpeg encodes it into the file, AAC in MP4 and MOV, Opus in WebM (a
GIF has no sound). This is the way to an MP4 with AAC on Linux. **Render with Manim** offers it as
well: the companion's ffmpeg adds the mix, as AAC, to the video Manim renders. That video ends with
the last animation, so sound that goes on after it is cut there, and the dialog says how much. Both
need companion 1.5 and an ffmpeg with the encoder; the dialog says what is missing. The exported
Python remains visual only: its header gives the frames of the scene, and says so when the editor's
own video, which goes on until the sound ends, is longer. Importing MP3 is supported; encoding new
MP3 files is outside this release.

Audio projects save as **`.mfe` portable packages**, containing every original, including unused and
muted recordings. Old JSON projects still open, and projects without recordings save as JSON (but
for one whose font texts hold more than 64 MiB of geometry, which is a package too).
Opening a package checks every recording and copies it into the browser's storage: with a large file
a dialog shows how far it is, and **Cancel** leaves the open project as it was. Recovery keeps
metadata and durable original bytes separately. The browser keeps an original while an open tab, its
Undo history, a pending save or an autosave that can still be recovered needs it;
what nothing needs any more is freed later, when the app is opened again, and a recording that an
autosave can still recover stays as long as that autosave (up to a week). A saved package is the
portable backup: browser storage alone can be cleared or evicted, although the app asks the browser
to keep it when the first recording is imported.

When the browser no longer holds an original, its clips stay in place, hatched and marked **missing
media**: playback skips them, a notice names the files, and importing the same file again in the
Audio tab repairs them. **Save** first looks for the missing originals in the file it is about to
replace (the project file you opened still has them) and brings them back; if that file has them and
they cannot be read back, or the file cannot be read at all, it is left as it is and an error points
to Save As. For what is still missing it asks: **Save without the missing media** writes a file
whose clips stay marked, and Cancel writes nothing. After such a save, importing the recording again
leaves the project unsaved, so that the next Save writes the complete file. Audio and video exports
need the originals of their unmuted clips: one that lacks a recording stops before it starts and
names it. Large exports use a writable file destination where the browser offers one (Chrome, Edge):
the file is written as it is encoded. Elsewhere it is assembled in memory and downloaded at the end,
with no size limit of the app's own: the video dialog shows the estimated size and warns above 1 GB,
and an export the browser cannot hold ends with an error that says so.

The ordinary target is under 15 minutes, with 40–60-minute projects supported through bounded
source windows and mixing blocks. Longer recordings can supply selected intervals; a placement must
end within 60 minutes. The scene itself can be longer: it plays whole, with its audio, and a video
of more than 60 minutes is exported without its sound (the dialog says so) unless you export a
shorter range. This duration target is separate from the time needed to render video frames.
Recording, noise reduction, equalizers, time stretching and automatic crossfades are not part of
this version.

### Formula and visual workflow

- **Starting from an example.** While a project has no formula, the Creator offers **Try an
  example** beside the way to your own projects: it opens *Completing the square*, the quadratic
  formula derived step by step, to play, take apart and change. **Help → Examples** has it and three
  short scenes, each for one thing: *Hello: one-to-one* (two formulas and the relation between
  them), *Camera* (the scene's camera and its moves) and *Braces*. An example opens as a file does —
  it asks first about unsaved work — and becomes a project of yours that has no file yet: **Save**
  asks where it goes. They are files of `examples/` that the app carries in itself, so they open
  with no server, no folder and no companion.
- **Creator** (left): press **+ New** to write a formula, or open its arrow for the other kinds of
  object: **Text (LaTeX)** is a text in LaTeX's text mode (`$…$` for maths, `\\` for a line break, a
  blank line for a paragraph, as Manim's `Tex` / `TexText` typeset it) with a width in scene units,
  the alignment of its lines and their spacing — leave the width empty and the text comes as wide as
  it is; with a width, LaTeX breaks the lines inside it when the companion renders, and MathJax
  breaks them approximately and says so —; MathJax shows accented letters without their accents (the
  companion draws them), and with accented letters for ManimCE the editor suggests the `fontenc`
  line for the preamble. `examples/text-title.mfe.json` is a two-line LaTeX title handing its inline
  formula to a bigger one. **Text (LaTeX)** and **Text (font)** both open the composition workspace
  described above; the formula editor that follows is the editor of formulas.
  Each card wears its kind's mark (∑ a formula, T a LaTeX text, P a font text). The list shows a
  row per formula with its rendering or, with the view key of its toolbar (an editor preference; the
  key shows the icon of the other view, and a press switches to it), a grid of **blocks**: a square
  with the tag, the name, how many clips use it, its kind and its render status, and the rendering
  in a tooltip beside the block the pointer is on, there at once, with what a double-click and F2
  do; a block is selected, dragged onto the timeline, edited (double-click), renamed (F2),
  right-clicked and walked with the arrows (←/→ a block, ↑/↓ a row) like a row, and its edit,
  duplicate and delete buttons show while the pointer or the focus is on it. A block narrower than
  112 px — as they always are in a Creator wide enough for four columns or more, and often in a
  narrower one — shows a **compact face**, so that its name can be read: the whole block a pane of
  glass tinted with its tag’s colour, the name alone on it, and the rest in its corners, there at
  once while the pointer is on the block (or the keyboard has put the focus on it): the buttons at
  the top, its kind and a letter for its render at the bottom left — **M** MathJax, **e** exact,
  **?** a font text that needs the companion, **…** not rendered yet —, its clips and its tag’s icon
  at the bottom right; a warning (⚠) and a render that failed (**!**) show all along. A formula on
  the timeline more than once is one object that all its clips show: editing it changes every one of
  them, until **Unlink formula (make a copy)**, in the menu of a clip, gives that clip a copy of its
  own (Timeline, below). One key of the toolbar, left of **+ New**, wears ∑ and a small arrow: point
  at it (or click it, or press Enter or ↓ on it) and a menu drops under it with a row per kind — **∑
  Formulas**, **T LaTeX texts**, **P Font texts**. A row adds every object of its kind in the
  project to the selection — those in a closed group too, whatever the search shows — and the menu
  stays open, so two rows select both kinds; chosen while all of its kind is selected (the row is
  ticked then, and the key lit), a row takes that kind out and leaves the rest. A row is off while
  the project has none of its kind, and braces, shapes and lines are of none of the three. The menu
  closes once the pointer has left it and the key, and on Escape or a click elsewhere; from the
  keyboard ↑ and ↓ walk its rows, Enter and Space choose. After it, the key **+/−** makes the
  previews of the view that is shown larger with a click and smaller with a right-click (or
  Shift+click; ↑ and ↓ with the focus on it), 1×, 1.5×, 2× or 3×: in the list view the rendering of
  each row (52 px tall at 1×), in the block view the tooltip beside a block, its rendering as many
  times wider and taller; each view keeps its own size, an editor preference, and the key's tooltip
  tells it. In a Creator too narrow for the whole toolbar on one line (as it starts in a window of
  1280, not of 1440 or 1920), these two keys take a line of their own under the magnifier.
  **Group**, in the menu of two or more selected formulas, makes one row of them where the first
  was: a group, named `grp1` until you rename it (F2, a double-click on its name, or **Rename
  group**), with the renderings of its first three formulas and how many it has.
  Its arrow opens it onto its formulas and closes it again (so do a double-click on the row, Enter,
  → and ←). A group is selected as its formulas: click it and their menu acts on all of them — **Add
  to the timeline** puts a clip of each at the playhead, **Edit together…**, **Apply match colors
  ▸**, **Duplicate**, **Delete N formulas…** — and on a group it also has **Ungroup**, which leaves
  them on their own again. **Add to group ▸** and **Remove from group**, in the menu of formulas,
  change what is in a group without undoing it, and so does dropping a formula from the list on the
  row of a group; the copy of a formula of a group stays in it, deleting a formula takes it out, and
  a group left without formulas goes. In the block view a group is a block, its formulas' blocks
  coming after it while it is open, and its tooltip has the renderings. Groups are saved with the
  project and change nothing of the scene. The **magnifier** at the start of that toolbar (Ctrl/⌘+F
  from anywhere) opens the **search**: a panel that comes up in the place of the Preview — which
  stays as it was underneath — with a field, a tab per kind of object, **Formulas**, **Texts
  (LaTeX)** and **Fonts**, each saying how many it finds, and the results as cards: the rendering,
  the name, a line of the source, how many clips use the object and the group it is in. What is
  typed is looked for in the names, the sources and the names of the groups, in the three tabs at
  once; with nothing typed each tab lists every object of its kind. A result is a card of the list
  in what it does: a click selects it (Ctrl/⌘ and Shift for several), a double-click or Enter opens
  its editor, a right-click the menu of the selected formulas, and it is dragged onto the timeline —
  the search stays open, so several can go one after another. It is not a dialog: the Creator, the
  Animations panel and the timeline stay in use beside it. Its close button, the magnifier or Esc
  take it away, and the tab and the text are there the next time. While it covers the Preview, the
  keys that act on the scene (align, the grid, the circle selector, align by symbol, colours in
  order) wait, and a mode that was on stays as it was. The list of the Creator itself is not
  filtered, and its groups are not folders in the search: the formulas of a group are results like
  any other. A rectangle dragged from the empty space of the results (between the cards, or around
  them) selects the cards it touches: with no key, they become the selection — the selected objects
  the tab or the text hide leave it, as on a plain click on a card —; with Shift they are added;
  with Ctrl/⌘ they are taken out. The list may scroll under it, and the rectangle stays on the cards
  it was drawn over; Esc gives the selection back. A press on a card is still the card's: its click,
  and its drag onto the timeline.
  The Creator's own list takes the same rectangle, in the list and in the block view alike: dragged
  from its empty space (its margins, the gaps between the rows or the blocks, the room under the
  last one) it selects the rows or blocks of formulas it touches, with the same keys, Esc and
  scrolling. With **Alt** held it may start on a row or a block too, whose click and drag onto the
  timeline it then takes over (Alt and a click that does not move is still a click). The row of a
  group is not selected by it, nor are the formulas of a closed group.
  The formula editor has a visual math field ([MathLive](https://mathlive.io)) and a _Raw
  LaTeX_ field that stay in sync (a formula with rows, `&` and `\\` as Manim's `align*` reads them,
  is shown by the visual field inside `aligned`; the raw LaTeX keeps what you typed); pick LaTeX
  packages, a size (the scale and Manim's font size, one value: 1.5 × 48 = 72; editing it resizes
  every clip of the formula in its place), a tag, a colour and **Appears with**, the intro every new
  clip of the formula starts with, and its duration (_Default_ follows the Edit menu preference
  when the object takes that intro, else it is none: a line is never grown, nor faded with a scale,
  and an arrow also offers GrowArrow;
  hidden glyphs and glyphs that arrive by relation stay out of it; changing it also updates the
  clips that still had the previous intro — as far as each one's blocks, relations and outro leave
  room; clips on a locked track stay — while clips retouched in Timing keep theirs). **Apply** (or
  Ctrl/⌘+Enter) commits LaTeX and packages as one undo step. Unapplied source, package and
  text-layout edits survive resizing between stacked and panel layouts.
  The **⌨ Keyboard** key beside the **LaTeX** title shows an on-screen keyboard that writes in the
  visual field, for whoever would rather press a fraction than type `\frac`: four tabs — _Algebra_,
  _Trigonometry_, _Calculus_ and _Alphabet_, which has the digits, the letters and two rows of Greek
  ones — of keys that write a structure with its holes (a fraction, a root, a power, an absolute
  value, a limit, an integral, a sum), a function, a digit or an operator, and a last row that moves
  the caret, deletes backward, clears the field (**AC**) and applies (**Apply**, the same as the
  editor's button). A hole not filled yet is an empty group in the raw LaTeX (`\frac{}{}`), which
  renders as it is. The capitals key (⇧) holds for one letter. The keypad is in the dialog, under
  the visual field: a press leaves the focus in the field, so what you type next goes on in the
  formula; from the physical keyboard the keypad is one stop of Tab, the arrows move among its keys,
  Enter or Space presses one, and Ctrl/⌘+Z on a key undoes what the keys wrote, not the project.
  Left shown, the keypad is there the next time the editor opens, until its key hides it. A brace's
  label, which is written in this editor, has the keypad too.
  The glyph view draws every
  glyph, with its index under the pointer: click one, Shift+click a range, Ctrl/⌘+click to toggle or
  drag a box over several (Ctrl/⌘ adds), then choose a colour or hide them at the start (or
  right-click the selection for the same actions). The key beside the **Glyphs**
  title lists the glyphs under the drawing, a key each with its index and label, which is also how
  to pick them from the keyboard; the list is left out until asked for, and the browser remembers
  the choice. Ctrl/⌘+click or Shift+click
  several formulas in the list, and their right-click menu offers **Add
  to the timeline** and **Edit together…**: their glyphs in a grid or as big cards (the wheel moves
  from one to the next), to colour, hide or show glyphs of all of them at once (the selection and
  the tools stay at the top while the formulas scroll), or for **Delete N formulas…**, which removes
  them with their clips after one held confirmation, as one undo step — a box dragged over the grid
  selects glyphs of every formula it touches. Each formula also has keyboard glyph buttons: Tab to
  a glyph, Enter or Space to select it, Ctrl/⌘+Space to toggle it while keeping other picks. The
  buttons announce index, label and selection in Grid and Cards views. Two tools of **Edit
  together…** act on the whole formulas, each as one undo step: **Scale** gives all of them one
  scale, as the formula editor's Scale does (it is empty, _mixed_, while theirs differ; opened from
  the timeline on braces, shapes or lines too, it leaves them out and says how many), and **Match
  colors** lists the project's lists, each with its colours, to apply one to all of them (off when
  one of them takes no match colours, a font text or a brace; with no list yet, **Create match
  colors…** closes the dialog and opens the one of the lists). **Apply match colors ▸**
  colours the selected formulas
  by the LaTeX patterns of a list (Edit → Match colors): every occurrence of each pattern takes its
  colour, as Manim's `tex_to_color_map` would, and the formula's per-glyph colours become exactly
  those, one undo step for all of them (a notice says how many glyphs took a colour and which
  formulas were left alone); the preview's right-click menu has it too, for the selected clips'
  formulas. Double-click a name (or press F2) to rename it (it becomes a Python variable),
  double-click the rest of the card (or press Enter) to edit the formula, and drag it onto the
  timeline to place it (or choose **Add to the timeline** in its menu or in the Animations panel: it
  goes on the first unlocked track, at the playhead). A text starts where its editor put it (**New
  clips start here**, "Text composition" above); anything else, at the centre of the frame.
- **Templates** (a tab of the Creator): formulas to start from. Its four entries open pop-ups.
  **Default templates** has 257 ready-made formulas (high school to university, in 15 categories),
  each drawn on a card: search them, filter them by category and level, and press **Use** (or
  double-click a card). A template names its variable parts as **placeholders** — the *a*, *m* and
  *n* of the product of powers —, so **Use** shows a LaTeX field for each, with the template's own
  value in it, and draws the formula they make as you type; **Create formula** adds it to the
  project with its LaTeX already final, named after the template or as you say, so that its glyphs
  are made once, of what it is, and nothing has to be matched again afterwards. A template without
  placeholders is added at once. **My templates** holds your own: **New template** (or the **Create
  template** entry) opens a form where you write the LaTeX with `#1`, `#2`… where a value goes, as
  in `{#1}+{#2}={#2}+{#1}`; every number gets a row for its default value and, if you like, what to
  call it ("base", "exponent"), and the formula those values make is drawn as you write. The braces
  around a number are yours, as in a LaTeX macro: `x^{#2}` takes `m+1` whole (`\#` is the hash to
  print). **Save a copy** on a default template puts it among yours, where **Edit**, **Duplicate**
  and **Delete** work; the default ones cannot be changed. The star on any template keeps it in
  **Favorites**. Your templates and stars are kept in this browser and, with a synced folder
  (Chrome, Edge), also in its `templates/templates.json`: the browser asks once for leave to write
  the folder, and the file is read again whenever the folder is listed (of a template changed in two
  places the one changed last stays; one deleted in one place and still in the other comes back). A
  library holds 500 templates: when the folder's file and the browser's together have more, or the
  file has entries that are not templates, the file is left as it is and the editor says so, instead
  of writing it again with less. **Export** downloads them — all, or the ticked ones — as a file,
  and **Import…** reads such a file, asking first about the templates of yours it would change. The
  two dialogs where a template is read and written — the values of **Use** and the form — are 30 %
  larger than the rest of the interface, and can be resized by their corner or maximized: the room
  gained goes to the drawing of the formula.
- **Preview** (centre): the scene at the playhead. Click selects a clip, hovering outlines a glyph,
  dragging moves the selected clip (a keyframe edit at the playhead; Esc cancels). **While the scene
  plays nothing of it answers the pointer** — no outline, no click, no drag, no handles: what was
  under the pointer was passing by —, nor while T is held (the vertical timeline, below), nor the
  objects in the world view of the multicamera, where the pointer is the camera’s unless F is held;
  the view is panned and zoomed all the same. A clip with transformations is **locked after the
  first one** (padlock next to its name on the timeline): there the preview only edits a
  transformation through its block's end icon (below), so its end state never changes by accident;
  before it, the clip's initial state is free to edit. Unlocking (with a warning) brings back
  editing at the playhead. Hold **Shift** over the selected clip to show transform handles (a hint
  in the corner says so; the handles button next to the magnet, in the view's toolbar at the end of
  the Preview panel's title bar, keeps them on without Shift): drag a corner to scale (uniformly, in
  the steps chosen in Preferences → Scale step, 0.05 by default), the circle above to rotate (in 15°
  steps); hold Ctrl/⌘ for free values; with several clips selected the handles frame them all and
  scale or turn them as a group about its centre. A dragged formula **snaps** to the edges and
  centres of the other formulas and of the frame, and, on an axis none of those takes, to the spot
  as far from two formulas as they are from it, or at the gap two neighbours keep (yellow guides,
  whose colour and width are in the Preferences menu, show what it aligns with, equal gaps as bars
  with ticks; hold Ctrl/⌘ after pressing to drag freely; the magnet button of the toolbar turns it
  off); a corner drag sticks to the width or height of another formula in the same way, the two
  equal sizes as bars. Pressed once a drag runs, **Alt** holds it to one axis — only horizontally or
  only vertically, the way the pointer has gone further from where the drag began, chosen again as
  it moves —, still snapping along that axis to the other formulas and to the grid; with Ctrl/⌘ too
  it goes along the axis freely, and letting Alt go frees the drag again (Alt held already at the
  press picks glyphs or pans, as below). After a click on the scene the **arrow keys** move the
  selected clips by 0.01, with Shift by 0.1, at the playhead and as a drag would move them — a clip
  that a drag would leave stays, and a notice names it —; a run of presses is one undo step, and
  with nothing selected ←/→ step the playhead as anywhere else. Zoom with Ctrl/⌘ + wheel or the
  buttons, pan with the middle button or Alt + drag on empty space, **Fit** resets. A **grid** (the
  # button in the middle of the transport bar, or Ctrl/⌘+': show it, − / + or Alt+↑/↓ for 2 down to
  0.1 Manim units, and whether it holds the formula's centre — a dot in a box — or its edges — four
  corners) is drawn under the formulas, never in an export, and a dragged formula lands on its
  nearest node (Ctrl/⌘ held frees it; a guide to another formula wins on its axis). A thin symbol —
  a minus, a dot, the bars of an equals sign — is hard to hit: the **circle selector** (its switch
  in the view's toolbar, or **S**) makes the pointer a circle that outlines the symbol nearest to it
  within its reach, and that is what a click takes: a plain click its formula (to select it, to drag
  it, for its menu), Alt+click the symbol itself. It is the circle of Align by symbol, with the same
  reach (Shift+wheel sets it, and with a trackpad Shift and a scroll of two fingers, a pixel at a
  time), drawn dashed and in the accent so that the two read apart; S again
  gives the pointer back, and the choice is kept. **Alt+click** a glyph of a formula to select it
  (again takes it out; Alt+Shift+click a range), or **Alt+drag** from a formula for a rectangle that
  selects the glyphs it touches (Shift adds them; Esc puts the previous selection back): the
  selected glyphs are highlighted in yellow, and so is the rectangle (**Preferences → Glyph
  selection colour** has other colours), a bar in the corner names them and offers **Colour ▾** (the
  Manim palette, Clear colour, Hide / Show at the start), **Brace ▾** and **Shape ▾** on them; so
  does a right-click on the ink of one of them (in the hole of a letter the clip's menu opens
  instead), and the clip's own menu puts its brace or shape on them while they are selected («On
  some glyphs…» opens the dialog with them picked); Esc clears them, and so does selecting something
  else. The glyphs can be **of several formulas at once**: Alt+click on a glyph of another formula
  adds it to the ones selected (a range is taken within one formula), and the rectangle takes the
  glyphs it touches in every formula; the formulas with selected glyphs are the selected clips
  meanwhile. For glyphs of several formulas the bar and the menu offer a colour, or Clear colour,
  for all of them as one undo step, and **one brace or one shape over them all** — what
  `Brace(VGroup(…))` is in Manim: it is fitted to the group when its clip starts and follows each of
  the formulas, and deleting one of them does not delete it but leaves it where it is, detached.
  Hiding, the colour sequence and «On some glyphs…» are for the glyphs of one formula. To select in
  another formula alone, clear the selection first (Esc), or draw the rectangle there. **Copy colour
  sequence**, in Colour ▾ and in that right-click menu, takes the own colours of the selected
  glyphs, and **Paste colour sequence** puts them on another selection of the same symbols, in this
  object or another (the «x²+bx+c» of a formula onto the «$x^2+bx+c$» of a text), as one undo step:
  each glyph takes the colour of the copied glyph that is its symbol — of several equal symbols, in
  glyph order — and loses its own where that one had none. The two selections may have their glyphs
  in another order (Manim puts the upper limit of a sum before the ∑ in a formula, and after it
  inside a text), but they must be the same symbols, each as many times: the line under Paste says
  what would be pasted, or why it cannot be. It also says what the symbols do not tell: two or more
  glyphs without a known symbol (a font the companion has no table for) are paired in glyph order,
  and equal symbols may be paired in another order when one object was rendered by MathJax and the
  other by LaTeX. Two limits, measured on 2,160 nested expressions: an operator inside the upper
  limit of the same operator (a ∑ in the upper limit of a ∑) has its two glyphs swapped between a
  formula and a text; and where a formula builds a tall delimiter or a radical from more pieces than
  a text does, the two selections have another number of glyphs and nothing is pasted.
  **Colours in order** (Shift+C; also Edit ▸ Colours in order, and the right-click menu of a clip
  in the preview) is for when the symbols differ — the b, the 2 and the a of one fraction
  onto the b, the 4 and the a of another. It is a mode of the preview in two steps. First click, one
  by one, the glyphs whose colours to copy, of any formula or text on screen: each adds the colour
  it is seen in — its own, or its object's when it has none — to a list, shown at the top of the
  Animations panel as the glyphs in their colours, left to right in the order of the clicks (a glyph
  clicked again is added again; Backspace takes the last one off). Enter goes on to paste: now each
  click gives a glyph the first colour left in the list, as a colour of its own, and that colour
  leaves the strip, where the next one is marked; Backspace takes the last one back, and the mode
  ends with the last colour, or with Esc, which keeps what was pasted. The whole paste is one undo
  step. The list is kept: Shift+V («Paste colours in order») pastes it again from its first colour,
  on other glyphs. While the mode is on only clicks answer in the preview — no Alt selection, no
  rectangle, no drag — and the playhead may be moved between two clicks, to copy at one time and
  paste at another. The colours are the object's, as the Creator's: a pasted colour shows in every
  clip of that formula, and what a clip adds of its own (a tint, a colour animation) is not copied.
  With a single glyph selected, **Copy colour to clipboard** — in Colour ▾ and in the right-click
  menu — puts the colour that glyph is seen in on the system clipboard, as `#RRGGBB`. And every
  «Colour» of a right-click menu takes a colour typed by hand: the **Hex** field under the swatches
  (`#RRGGBB` or `#RGB`, with or without the `#`), applied with Enter or with Apply.
- **Timeline** (bottom): tracks (rename, hide, lock, reorder), clips you move, trim, duplicate
  (Ctrl/⌘+D) and delete (Shift or Ctrl/⌘ + click selects several; a drag on an empty stretch of a
  lane draws a rectangle that selects the clips it touches, Shift or Ctrl/⌘ adds them, Esc cancels;
  with several selected, right-click one of them, or Shift+F10, for what the Creator offers their
  formulas — Edit together…, Apply match colors —, Unlink formula (below: one copy per formula,
  which its selected clips share) and Duplicate or Delete the clips; and an edge of one of them,
  dragged, moves that edge of every selected clip by the same time, sounds included, as far as
  all of them allow: when one meets its neighbour on the track, its shortest length, the end of its
  recording or the window of a relation with a clip on a locked track, they all stop); **S** cuts
  the selected clips in two at the playhead (**Split at playhead**, below); the ruler
  scrubs, Space plays/pauses, Home/End and ←/→ step (Shift: a second); the wheel scrolls the view (a
  trackpad or a touch mouse, both ways at once), Ctrl/⌘ + wheel zooms about the pointer, and the
  middle button, held, drags the view both ways at once (Esc puts it back); the slider in the
  middle of the toolbar moves the view along the timeline: its thumb is to its bar what the stretch
  in view is to the whole timeline, so it fills the bar while everything is in view and gets
  shorter as you zoom in — drag it, or press beside it to bring it under the pointer (Esc puts the
  view back; reached with Tab, the arrows, Page Up, Page Down, Home and End move the view); the
  zoom is around it: − and + before it, and after it the key that shows the **whole timeline** —
  it zooms out, or in, to where nothing is left to scroll and the thumb fills the bar (a long
  timeline never stops short of that, and − stops there) — with the zoom's readout beside it
  ("80 px/s") and, next to that, **dt**: the time between two small ticks of the ruler at that
  zoom, which is also the step the timeline snaps to ("dt 0.5 s"; "1/60 s" on every frame) — and the
  step of the playhead while it is dragged on the ruler with Ctrl/⌘ held: it then goes from tick to
  tick, whatever the Snap key says, and frame by frame again once the key is let go; the − and +
  around dt set a dt of your own instead, a tenth of a second shorter or longer at each press (down
  to 0.1 s, up to an hour) and without zooming — the small ticks, the snapping and the playhead with
  Ctrl/⌘ go by it, the readout shows it in the accent, and a zoom of yours (its keys, Ctrl/⌘ +
  wheel, the whole timeline) gives back the zoom's own — not one the timeline makes itself when a
  wider window or a shorter scene raises its lowest zoom; **Shift dragged on the ruler marks a
  region**, as in an audio editor — a green «[»
  where it starts and a red «]» where it ends, the ruler and the tracks tinted between them —, and
  what is created next takes it, wherever the playhead is: a new animation block (a clip's menu, or
  **Add animation** in the Animations panel, whose header then says "region 1.00–3.00 s") starts
  where the region starts and lasts until it ends, the window of a new relation is the region, and
  so is the clip of a formula brought to the timeline (dropped on a track, on that track; with **Add
  to the timeline**, on the first unlocked track that has it free, or on a new track on top); what
  does not fit there is not made, and a notice says why — the clip does not hold the region, other
  animations of its glyphs are in it, the two clips allow no window all along it, the track has a
  clip in it; **I** and **O** put its start and its end at the playhead (alone, I marks to the end
  of the scene and O from its start), its two marks are dragged by their upper part — snapping as a
  clip's edge does, freely with Shift, tick by tick with Ctrl/⌘ —, and it stays, for whatever comes
  next, until **Esc** removes it (once the key has nothing else to cancel or close) — while a
  shorter scene ends the timeline before it, it is shown cut there, or not at all, and when the
  timeline grows again (the edit given up with Esc, undone, or any other) it is back whole; it is
  a view of the timeline like its zoom, not part of the project, and braces, shapes and lines made
  from the menus do not look at it, nor does what the Preview makes at the playhead; the keys in the
  corner over the track headers make every track lower or taller (from the standard height, 100 %,
  to three times it; the percentage between them puts every track back), and all a track draws grows
  with it — its clips, their animation blocks, the relation windows, the graph of an audio clip; the
  − and + beside a track's name make that track alone a step lower or taller (down to the standard
  height, up to four times it), and so do the top and bottom edges of its header (drag one — the
  track an edge resizes lights up under the pointer, since the edges of two tracks meet; a
  double-click gives the track the height of the others again, Esc during the drag puts it back);
  those heights are a view of the timeline, like its zoom, not part of the project;
  the menu of a clip (right-click it on the timeline or in the preview) has the clip's own
  entries: **Intro ▸** and **Outro ▸** give it the animation it starts and ends with (None among
  them; the current one is ticked) — when that would run into what the clip has already (a
  Transform of the whole formula it would cut, a transformation of glyphs, a block or an attached
  object that needs the same glyphs) a dialog says what, and you add it anyway, shorten it to
  what fits or leave it; a new intro is also what **Appears with** of the formula says from then
  on, its other clips staying as they are —, **Remove animations** takes off its intro, its outro
  and its blocks but the Morph ones, **Remove relations**, on a formula or a text, takes off
  its transformations of glyphs: its relations with other clips and its Morph blocks, and
  **Unlink formula (make a copy)**, on a formula or a text, gives the clip a copy of its formula
  of its own, as **Duplicate** in the Creator makes it — under the next free name, right after
  the original in the list and in its group —, so that editing either no longer changes the
  clips of the other: the clip keeps all it had (blocks, colours, relations, what hangs on it,
  the glyphs picked on it), and one Undo takes the copy back; with several clips selected, the
  selected clips of each formula share one copy. It is off, its tooltip saying why, for a
  formula's only clip, for all the clips of a formula selected together and on a locked track
  (a selected clip on a locked track keeps its formula), and braces, shapes and lines have none;
  on the timeline the menu has **Timing ▸** as well, one entry that opens beside it: **Copy
  timing** takes when the clip starts and ends and how long its intro and its outro are, and on
  another clip — or on several selected ones, and on sounds too — **Paste start** and **Paste end**
  move it to start, or to end, when the copied clip does (two clips aligned on their left or
  right edge), **Paste duration** makes it last as long from where it starts, and **Paste intro
  time** and **Paste outro time** give its intro or its outro that length. A paste does what it
  says or nothing: when another clip of the track is in the way, the track is locked, or an
  animation block or a relation would be cut, the clip stays and a notice says why; on a locked
  track the menu opens too, with what would change the clip off, so that its timing can be copied;
  that menu on the timeline (Shift+F10 opens it too) ends with **Lock in the preview**: the
  preview then draws that formula or text and leaves it alone — a press goes through it to what
  is under it, a selection rectangle and Ctrl/⌘+A leave it out, and nothing done in the preview
  moves it, though other formulas still snap to it — which is how a formula under another is
  reached when they overlap; a locked formula is drawn faded, at 40 % of its opacity unless
  Preferences → Locked formulas says otherwise (the preview only: nothing exported is faded), and
  Shift+Alt+G aligns another formula to one of its symbols (Align by symbol with the reference
  on a locked formula, which stays put); the timeline and the panels edit it as before, the clip
  shows a mark
  (a pointer struck out) that unlocks it with a press, the menu of several selected clips locks
  or unlocks them together, and the lock is saved with the project;
  hold Alt and only the edges answer the pointer, those of the clips and the inner edge of their
  intro and of their outro — an animation block or a relation window that ends where its clip does
  lies over the clip's edge, and a window lies over where an outro starts: with Alt the edge trims
  the clip, or makes the intro or the outro longer or shorter, through them (the handles light up,
  and nothing else in the lanes can be pressed); double-click a clip to edit its formula,
  double-click an animation block for its dialog (below), and rest the pointer on
  a clip for a moment to see its formula in a tooltip. From the keyboard, Tab reaches the clips: ←/→
  walk a track (Shift extends the selection), ↑/↓ change track or climb into a clip's block lanes,
  Enter opens the clip's formula or a block's menu, Shift+F10 the Add animation menu, Alt+arrows
  move the clip a frame or a track, Delete deletes; what happens is announced to screen readers.
  A clip's **intro and outro** are the hatched ends of the clip, each with the icon of its animation
  and its name (the icon alone on an end too short for the name): drag the inner
  edge of one, in the lower part of the clip, to make that animation longer or shorter, as an
  edge of a block — it snaps (Shift frees it), a readout shows how long it lasts, it stops at a
  Transform of the whole formula, and Esc cancels; the Animations panel sets it in numbers.
  Related clips are joined by arrows; click one to select the relation, and drag its window band to
  move it or its edges to resize it (a readout shows its start, end and duration meanwhile; it stays
  where the clips and their blocks allow); right-click the band for its menu: **Edit pairs…**,
  **Edit path…** on each of its pairs (from six pairs on, behind **Choose a pair…**, a dialog with
  the relation's diagram and a picture of each pair's path), and **Delete relation**. A relation
  with a clip on a locked track cannot be made, edited or deleted, and it plays where it does
  whatever is done to its other clip: a move, a trim, Alt+arrows, the clip's fields and its intro
  and outro stop where the window would no longer fit in it, a paste of a timing or an intro from
  its menu that would need more is not made, and that clip is not deleted — nor its track, nor its
  formula in the Creator —, nor split so that the relation would go to its second half: a notice
  says why and names the track. Hold **Shift** to show a link port in the lower half of every clip
  (clear of its blocks): click a clip's port and then another clip (or drag from the port onto it)
  to open the relation editor on a new relation between them directly — or, when the two are related
  already, a menu that asks which of their relations to edit, or to add another (below). Esc gives
  up a link that waits for its second clip; while a dialog or a menu is open over it, or in a field
  you are typing in, Esc is theirs first and the link goes on waiting.
  **Animation blocks** sit in the top half of a clip, each with the icon of its animation before its
  name — a block too short for the name shows the icon alone, and its tooltip the name —:
  right-click a clip to add one at the playhead when the playhead is on the clip, else where you
  clicked — the menu's header says which, and when the block cannot start at the playhead (its
  glyphs busy then, or the clip ending) it goes to the nearest free time and a notice says so —,
  from the submenu of its kind (**Appear**: Write, Create, FadeIn, GrowFromCenter,
  DrawBorderThenFill — its glyphs stay off screen until it runs, at the start of the clip or later,
  and a glyph a Disappear took out comes back with it; **Disappear**: FadeOut, Unwrite, Uncreate,
  ShrinkToCenter; **Transform**: a keyframe of the whole formula, or a part of it — chosen glyphs
  shifted, scaled and rotated about their centre, relative to where they are, with a colour and an
  opacity when you tick them; a part follows the formula if the whole formula moves later; a brace
  and a shape, one piece each, have the Transform of the whole object alone, and no Morph;
  **Morph**: glyphs of the formula turn into other glyphs of it, see below; **Emphasis**: Indicate,
  Wiggle, Circumscribe, Flash or FocusOn on the glyphs on screen for a moment, leaving them as they
  were — Indicate and Wiggle move the glyphs, the other three draw a frame, twelve lines or a disc
  where the glyphs are when the block starts and may run while a tween moves them;
  `examples/animation-blocks.mfe.json` has the first three kinds, `examples/emphasis.mfe.json` the
  five effects). Drag a block to move it and its edges to change its duration (it snaps, and stops
  where it would animate a glyph something else animates: a readout under the block gives its time,
  the blocks it runs in parallel with and, when it is held back, why); blocks on different glyphs
  may run at the same time and stack in sub-lanes, making the track taller, and the block you drag
  lies on top of the others. **Split into runs** (in the block's menu and in the Glyphs section of
  the panel) turns a block into one block per run of consecutive glyphs, all at its time and in
  parallel — the two sides of an equation written at once; **Split…** moves the glyphs you choose to
  new blocks — one, or several at once: choose the glyphs of a block, press **Another block** and
  choose those of the next (its dialog can be resized from its corner or maximized, the formula
  taking the room); **Duplicate for the other glyphs** puts a copy of the block alongside it for the
  glyphs it does not animate. Blocks made that way are a **group**, like the animations of Manim's
  `AnimationGroup`: they start together and last the same, each with its own animation, glyphs and
  options, and the timeline draws them as one block on one lane ("Write ×3", or "Group ×3" when the
  animations differ), so a block split in ten is not ten lanes. Moving or stretching the group moves
  all of it; its arrow (or a double-click) unfolds it into its blocks, and the arrow on the first of
  them folds it back; the Animations panel lists its members, each with its own settings, and takes
  one out or ungroups them; its menu also copies or deletes it whole. Any blocks that start together
  and last the same can be grouped by hand: right-click one, **Group with the blocks that run with
  it**. A group changes nothing of what plays or of the exported Python. An Appear or Disappear
  added where another block runs names the glyphs left for it, so that moving either block later
  changes nothing. Right-click a block to change, duplicate, split or delete it; Delete (held to
  confirm) and Ctrl/⌘+D work on the selected block, and Alt+←/→ nudge it by a frame (Alt+Shift: five
  frames). A selected **Transform** block has two round icons on its top corners: the left one shows
  where it starts (moves the playhead there), the right one where it ends, and lets you move, scale
  or rotate the formula — or, for a part, just those glyphs — in the preview to set that end state,
  with the start state drawn faintly beneath (for an easing that comes back, `there_and_back`, that
  is the middle of the block, where the target is reached). Esc, clicking the icon again, moving the
  playhead or selecting something else finishes.
- **Split at playhead**: put the playhead inside a clip and press **S** with the clip selected, or
  choose **Split at playhead (S)** in its menu (right-click it on the timeline or in the preview;
  the menu of several selected clips has it too, and splits those the playhead is inside). The clip
  becomes two that touch there. The first half is still a clip of its formula and keeps the intro;
  the second is a clip of a **copy** of the formula — a new formula in the Creator, named after it
  with a suffix: `f1_s`, then `f1_s1`, `f1_s2`… when the name is taken (Preferences → **Split
  suffix…** changes the suffix) — so that editing either no longer changes the other. That second
  half has no intro: it starts exactly as the formula is at that instant — where it is, its size,
  its turn, its colours and opacity, with the glyphs that are on screen then (the copy hides the
  others; a block or a relation after the cut still brings them) — and keeps the outro. Those glyphs
  — the ones that only come on screen after the cut — stay out of the first half too: it leaves them
  out of its intro itself, and its **Timing** tab says so under **Starts empty** («2 glyphs stay out
  of the intro») with **Bring them back**, which gives them to its intro again. What lies whole on
  one side goes with its half: the animation blocks, the relations (one whose window comes after the
  cut leaves from, or arrives at, the second half) and the objects attached to the clip. A brace, a
  shape or a line is split the same way: its second half is another object, equal to it.
  The split is one Undo step, and the two halves are left selected. **What crosses the playhead
  refuses the split**, and a notice names it (one notice names all the clips that stay whole): an
  intro or an outro still running, a block, the
  window of a relation, or the clip of an object attached to the clip — select that one too, and S
  splits both, each second half hanging on the other's. So does a relation with a clip on a locked
  track whose window comes after the playhead: it would go to the second half, and it is not
  edited. It is refused as well when a clip could not
  start as the object is then, the notice saying which: glyphs a Transform block moved or made
  fainter (a colour it gave them is kept), a shape a Transform carried to other glyphs, a line whose
  ends a Transform moved, an attached object whose target has moved since it was placed, or that a
  Transform of its own moved (**Detach** it first, to split it where it is), a formula the preview
  has not drawn yet, or a brace, a shape or a line that only comes on screen after the playhead
  (split it once it has appeared). A sound selected with the clips is cut at the playhead too, in
  the same step. S is also the Preview's circle selector: with the keyboard in the Preview — after a
  click on the scene — the key stays the selector's, and the menu splits.
- **Braces**: right-click a clip on the timeline or in the preview and choose **Add brace ▸ Below**,
  **Above**, **Left** or **Right** — or **On some glyphs…** to pick the glyphs — and a brace object
  (`b1`, `b2`…) hangs on those glyphs, as Manim's `Brace` does: its clip runs from the playhead to
  the end of the clip it hangs on (from the end of that clip's intro when the playhead is inside
  it), on the nearest free track in front of it — a new track right above its target's when none in
  front has room, never one behind —, with no animation: it is there when its clip starts. It is
  fitted to the glyphs as they are when it appears — move, scale or turn the formula before then
  and the brace follows — and stays put afterwards, like the Python's. Its clip's **Brace** section
  in the Animations panel sets the direction (a side, or degrees counter-clockwise from below), the
  gap, the sharpness (ManimCE's; ManimGL draws its brace from a font) and the colour, and
  **Detach** frees it where it is, to move like any clip; until then it does not drag in the
  preview. **Its own menu** — right-click the brace in the preview, or its clip on the timeline —
  has the quick ones: **Colour ▸**, **Direction ▸** (Below, Above, Left, Right), **Intro ▸** and
  **Outro ▸** (the animation its clip starts and ends with: GrowFromCenter, FadeIn,
  ShrinkToCenter…, or None; the current one is ticked), **Remove animations** (its intro, its
  outro and every block, as one undo step) and **Detach**; a shape's menu has the same entries
  but the direction. **Labels**: right-click a brace's clip
  (or the brace in the preview) and choose **Add label ▸ Formula** or **Text (LaTeX)** — or **Add
  label** in its Brace section, which lists its labels — and an empty formula or text hangs at the
  brace's tip, opened in the editor to be typed: it comes in with the brace (from the playhead when
  that is past the brace's intro), fading in, and goes where Manim's `brace.put_at_tip(label)` puts
  it, following the brace when you point it or space it. Its **Label** section sets the gap, or
  **Manim's gap** (the one `get_tex` leaves: 0.25 in ManimCE, 0.1 in ManimGL); otherwise it is a
  formula like any other, with its intros, colours, relations and morphs (`examples/braces.mfe.json`
  is a sum with three labelled braces, the top label made of copies of the other two). New labels
  use the Standard scale preference for their kind; existing labels keep their size, unless
  **Apply to all** of that preference gives every formula or text its scale. The Creator
  does not list braces: a brace lives with its clip, and goes with it — its labels too —, or with
  the clip it hangs on. **A shape takes a brace too**, on the whole of it (**Add brace ▸** on the
  shape or on its clip), and with **several clips selected** — formulas, texts and shapes, mixed or
  not — the menu of those clips, and the preview's on one of them, add one brace over them all, as
  Manim's `Brace(VGroup(…))`; the entry is greyed out, saying why, when those clips are never on
  screen together. A brace is never braced.
- **Shapes**: right-click a clip on the timeline or in the preview and choose **Add shape ▸ Box**,
  **Circle**, **Underline**, **Cross**, **Cross line** or **Highlight** — or **On some glyphs…** to
  pick the glyphs — and a shape object (`s1`, `s2`…) is fitted to those glyphs as Manim fits its
  own: a box is their box with a gap all round (`SurroundingRectangle`), a circle runs through the
  corners of that box, an underline hangs below them (`Underline`), a cross stretches over them
  (`Cross`), a cross line is one line of that cross — over the **Diagonal** chosen for it, **DL-UR**
  (from the lower left corner to the upper right one, the default) or **UL-DR**, and drawn from
  the first corner to the second —, and a highlight is a box filled with no stroke, at no gap, on
  a track behind the glyphs. Its clip
  runs from the playhead to the end of the clip it hangs on, on the nearest free track on its side
  (in front of the glyphs, or behind them for a highlight; a new track right beside its target's
  when that side has no room), with no animation, as a brace's: its menu's **Intro ▸** gives it one
  (Create is Manim's for a box). Like a brace, it is fitted to the glyphs as they are when it
  appears and stays put afterwards. With **several clips selected** — formulas and texts — the
  menu of those clips, and the preview's on one of them (**Add shape · on the N selected clips**),
  add one shape around them all, as Manim fits one to a `VGroup`; the entry is greyed out, saying
  why, when those clips are never on screen together. Its clip's **Shape** section in
  the Animations panel sets the shape, the gap, a box's corner radius, a cross line's diagonal, the
  colour and the style —
  stroke width and opacity, fill opacity and, ticked, a **Fill colour** of its own for a box or a
  circle (else the fill is the stroke's colour, as in Manim) — and **Detach** frees it where it is;
  until then it does not drag in the preview. The **Transform** of a shape's clip can repaint it as
  well as move it: **Stroke width**, **Stroke opacity**, **Fill opacity** and **Fill colour**, each
  behind its tick, go linearly to what the block says, as Manim interpolates a style. **Transform ▸
  To another formula or glyphs…** — on the shape's clip, in **Add animation**, or on the shape
  itself in the preview — carries the shape to surround something else: choose it in the preview as
  you select anything there (a click takes a formula, Ctrl/⌘ adds more, Alt picks symbols of one or
  several formulas), and **Enter** or **Transform here** makes the block at the playhead; Esc leaves
  it. It is Manim's `Transform(shape, SurroundingRectangle(other))`: the target is measured when the
  block starts and every point of the shape goes from where it is to the new fit, at the shape's own
  gap; from then on the shape is that fit, which a later Transform can move on, and nothing follows
  it there. The block reads **Transform → f2** on the timeline; its panel says what the shape goes
  to, with **Pick again…** for another target, and the preview outlines it
  (`examples/shapes.mfe.json`: a frame that goes from `1+2+3` to `4+5+6`, then around the whole sum,
  where a brace is made under it). Without an active editor palette, shapes use Manim's colours and
  styles (a yellow box, a white underline, a red circle or cross, stroke 4 or 6) and export in hex
  (ManimCE's `YELLOW` is not #FFFF00); the Creator does not list them: a shape lives with its clip.
  Negative gaps are valid insets while the fitted size remains finite and nonnegative, including the
  exact zero boundary. An unsupported fit keeps the last valid size and position and shows a problem
  until the gap or its target is repaired, so the project remains saveable and reopenable.
- **Lines and arrows**: right-click a clip on the timeline or in the preview and choose **Add line ▸
  Line**, **Dashed line**, **Arrow** or **Double arrow** — Manim's `Line`, `DashedLine`, `Arrow` and
  `DoubleArrow`. The line **starts on that clip** (on its picked symbols, when the menu opened on
  them), and a small **compass** asks where on it: one of the nine points of its box — a corner, the
  middle of an edge, the centre, Manim's `get_corner(DR)`, `get_left()`, `get_center()`… — or
  **Auto**, the edge Manim finds towards the other end (`Arrow(a, b)`). Then click where it ends: on
  a formula or a text for the whole of it, with **Alt** held on the symbols the preview picks, and
  the compass asks again; or on empty space for a free end at that point. A start on symbols follows
  them if their formula is edited before the end is put; if they are gone, the drawing ends and a
  notice says so. The formula the end would
  go on is marked in the colour of the picks while you choose. To start a line at a free point,
  right-click the **empty space** of the preview: **Add line** there takes two clicks, the start and
  the end. **Esc** gives up the end being chosen, and then leaves the mode. While a line is drawn,
  or shaped in **Edit curve**, **Ctrl/⌘ + wheel** zooms the view and the **middle button** pans it
  as always, and a **right-click** opens the preview's menu: an entry chosen there ends the mode
  first (Edit curve keeps its curve), while **Esc** closes the menu and leaves the mode on. A line
  object (`l1`,
  `l2`…) appears, white, with Manim's stroke for its kind (4, an arrow's 6 with a tip of 0.35) and
  no animation, on a track in front of what it runs between; with two free ends it is a free object
  from the playhead to the end of the scene. An end on glyphs follows them: it is measured when its
  clip starts — move the formula before then and the line follows —, stops a gap short of them (an
  arrow's 0.25; a line's 0) and stays put afterwards. With Auto the two libraries find the edge
  differently (ManimCE the farthest point of the glyphs that way, ManimGL where the direction leaves
  their box), and the preview follows the one the project exports to. A free end is exactly where
  you put it. Two ends at one place make no line, and are refused: two free ends at one spot, or
  both on one formula at Auto, where Manim finds no direction between them. The selected line shows
  a **handle at each end**, the start's in the accent colour and the end's in red. **Drag a handle
  and its end is left free** where you drop it — it goes on
  nothing by itself, even over a formula; hold **Alt** to put it on the symbol under the pointer, or
  **Alt+Shift** on the whole formula there, and the compass asks its point; hold **Ctrl/⌘** and the
  end stays on the line's own direction, so that the line only gets longer or shorter. **Right-click
  a handle** to **Detach** that end (free, where it is) or to change its point; the clip's menu has
  **Detach ▸ Detach start**, **Detach end** — each marked with its colour — and **Detach all**,
  which frees both in one step. The menu of a line's clip offers only what a line takes: Appear and
  Disappear with Create, Write and a fade, one **Transform** (move, opacity, colour) and the
  Emphasis effects that do not scale it; so do the menu of one of its blocks and the block's
  Animations panel, when its animation or its effect is changed.
  A line with both ends free is dragged by its body, and one
  with an end on glyphs is moved by its handles. Its clip's **Line** section in the Animations panel
  sets the kind, the colour, the stroke width, an arrow's tip and a dashed line's dashes, the gap,
  and has for each end its **Point** (each with the arrow the compass shows for it) and a
  **Detach**. A line has no scale, turn or flip of its own — its two ends say where it is —: it
  comes in with Create, Write or a fade, and a Transform moves it and changes its opacity and
  colour. Deleting the clip an end is on deletes the line with it, unless its other end is on
  another clip: then the line stays, free, where it was. In the Python it is built on the mobjects
  themselves, `l1 = Arrow(f1[0][0:2], f2[0])`, or on the points read off them, `l1 =
  Arrow(f1.get_corner(DR), f2.get_left())`; ManimGL, whose own `Arrow` is another
  object, gets a `Line` with a tip of ManimCE's size.
  A line can be **bent**, and stays bent (the way back is Undo): the clip's menu has **Curve ▸ Arc**
  and **Curve ▸ Spline**, and the Line section the same two buttons. An **arc** is Manim's
  `path_arc`, thirty degrees to begin with: its **Arc** field sets the degrees — positive ones bulge
  to the right of the line's way, up to 300 either way —, and in the preview the selected line shows
  a **stem along the arc where it leaves its start**, with a handle at its tip: drag it to bend the
  line more, less or the other way (**Shift**: every 15°), the degrees are read beside it. A
  **spline** is a curve through points, shaped in the mode **Edit curve** as a custom path is: drag
  its points and their handles (a smooth point's two handles mirror each other, as in Edit path;
  **Shift**: the other one turns but keeps its own length; **Ctrl/⌘**: one handle alone, the point
  becomes a corner), click the curve to add a point, double-click one to make it smooth or a corner,
  **Delete** to remove it; **Enter** or **Done** keeps the curve, **Esc** puts back the one the mode
  started with — with the playhead off the line's clip as well, where its points are not shown: the
  mode opens with the playback paused and the playhead on that clip. It does not open on a clip on a
  locked track or locked in the preview, and ends, saying so, when its clip is locked while it is
  on. An arc can be made a spline (the same curve, as points), not the other way round.
  The curve stretches and turns with the two ends of the line, which are moved as always. The gap an
  arrow leaves at a formula is left **along an arc**, as Manim leaves it. An arrow's **Tip shape** —
  and a double arrow's **Start tip shape** — is Manim's triangle, a **stealth** tip (ManimCE's
  notched arrowhead) or a **dot**, the same in both libraries. In the Python an arc is the
  `path_arc=` of its class, a tip `tip_shape=StealthTip`, and a spline the line bent by a small
  `_spline` helper; ManimGL gets the tips ManimCE draws from an `_arrow` helper. An **arrow or a
  double arrow** can also come in with **GrowArrow**. A straight one takes Manim's own: it grows
  from its start, tips and all (in ManimCE the stroke of its shaft grows with it, in ManimGL it does
  not, and the preview does as the project's library). A **bent** one — an arc, a spline — is
  **drawn along its own way** instead, as Create draws a line, with **its tip on the end of what is
  drawn**, turning with the curve; the tip grows out of the start over the first quarter of the way,
  and the tip at the start of a double arrow grows where it is. Manim has no such animation: the
  Python carries it as a small `_TraceArrow` helper, the same in both libraries. GrowArrow is among
  the arrow's intros and in **Appear** of its menu; a line without a tip has none. A block of an
  arrow animates **all of it**, its shaft and its tips together, as Manim does: its panel has no
  glyph picker and no split, and a block that names a part of one, as a file may have it, is an
  error that **All glyphs**, in its panel, mends. **Become ›** in a
  line's menu (or the field **Kind**) makes it another of the four kinds, keeping its ends, its
  curve and its tips; an arrow that grew with GrowArrow and is left without a tip is drawn in with
  Create. **Reverse points**, in the same menu and in the Line section, swaps the start and the end
  of a line where they are: an arrow points the other way, and what draws the line starts from its
  other end; Edit curve on the line ends first, keeping its curve, as it does before a paste of a
  path shape. **Curve ▸ Copy path shape** takes the shape of a line's path — straight, an arc's
  degrees or a spline's points — and **Curve ▸ Paste path shape** gives it to another line of any of
  the four kinds (or, from the menu of several selected clips, to every line among them): the path
  stretches and turns with the ends of the line that takes it, which keeps its ends, its kind, its
  tips and its stroke. Besides Undo, it is the one way a bent line is made straight again. A
  **Transform** of a line **carries its two ends**: it starts with the ends the line has, and with
  the playhead on it — or after it — the handles at the ends move *its* ends, as they move the
  clip's own before it (free where dropped, **Alt** onto a symbol, **Alt+Shift** onto a formula,
  **Ctrl/⌘** along the line); its panel says where each end goes, the gap, an arc's degrees, and the
  **stroke width**, colour and opacity the line arrives with. An arrow is drawn anew between its new
  ends — its tip and its stroke as an arrow of that length has them — and Manim plays
  `Transform(arrow, new_arrow)`; a line and a dashed line keep their shape and their dashes,
  stretched and turned, as Manim's `line.animate.put_start_and_end_on(a, b)` does. An end on glyphs
  is measured when the Transform starts. `examples/lines.mfe.json` has the four kinds, ends on the
  points of two formulas, arcs and a spline, the three tips, GrowArrow and a Transform of the ends.
- **Animations** (right): for the selected clip, a **Relations** tab (its relations as a diagram; a
  selected relation shows just its two formulas, and **All related…** opens every relation connected
  to it as one chain; its pairs are listed with their style and what their glyphs follow — the
  relation's **Path arc**, straight, or a **custom path** — each with **Edit path…**; a formula's
  or a text's only: a brace, a shape or a line is one piece, and is not offered to relate with) and
  a **Timing** tab (timing, intro — with **Starts empty**, a box that leaves every glyph of the
  clip out of the intro until a relation, a Morph or an Appear block brings it; the intro keeps its
  time and animates nothing, and a notice says so when an edit leaves such a clip with nothing to
  show; under it, how many glyphs the first half of a split leaves out of its intro, with **Bring
  them back** —, initial state, its animation blocks with **Add animation** (at the playhead, saying
  so when the block has to start elsewhere) and **Add keyframe at playhead**, outro; each section
  wears a colour on its left edge and its title — Intro and Outro the green and salmon of the
  Appear and Disappear blocks of the timeline,
  Animations the block violet, Timing the orange of the time readouts, Initial state a pink of its
  own — and the buttons that make something, Add animation, Add keyframe at playhead, Create
  relation…, Edit pairs…, Add label, wear the accent). The issues of a clip, a block or a relation
  close its panel: under **Problems**, in red and the errors first, as soon as one of them is an
  error, which needs an edit; under **Warnings**, in amber, when they are all warnings, which only
  tell. The timeline draws a relation in the same colour, the edges of its bands and its arrow, and
  the relation editor a pair. A selected block shows its animation (its
  section in the colour of its category), timing (easing, lag ratio, fade shift and scale) and the
  glyphs it animates: pick them in the glyph view (click, Shift for a range, Ctrl/⌘, drag a box;
  picking by hand turns **All** into an explicit list) or with **All**, **Not on screen**, **On
  screen**, **Hidden at start**; glyphs not on screen when the block starts are drawn faint.
  Double-click a block on the timeline for its **dialog**: the same fields with more room and,
  beside them, the formula in large to pick the block's glyphs. The dialog is wide by default and
  the formula has most of it, so that the glyphs of a long formula are picked at a readable size
  (a keyframe or a morph names no glyphs: its dialog is its fields alone). **Preview**, in the
  dialog's title bar, opens the block alone looping in a dialog of its own (play, pause, a
  playhead to scrub) with its easing curve, a point on it following the loop; close it to go on
  with the block. A button of the dialog that works in the preview — **Edit path…** of a Morph pair,
  **Pick again…** of a shape's Transform — closes the dialog, which would cover it. Both dialogs can
  be maximized or resized from their corner, and the panel keeps showing the block — the panel and
  the dialog edit it, one undo step each. A Transform block switches between **Whole formula** and
  **Part of the formula**, keeping its time and easing (the other kind's settings start from their
  defaults; it moves if the other kind does not fit there). **Two clips can have several
  relations**: a formula can turn into the same formula more than once — some glyphs at 2 s,
  others at 5 s —, in windows that may even overlap, as long as each glyph is brought in by one
  pair and consumed by one. Between two clips that are related already, the button reads **Edit or
  add a relation…** and opens a menu: **Edit relation 1…**, **Edit relation 2…** (in the order of
  their windows, each with its window and its pairs) and **Add another relation…**. Such
  relations are numbered by when they play — the first on the timeline is 1 —, where the app
  names one: the editor's title ("Relation 2 of 3: f1 → f2"), the panel's list and its line over
  a selected relation, the band's tooltip and menu on the timeline, the path picker. The bands of
  a clip whose windows overlap share its lane in stripes, so two relations with the same window
  can both be seen, dragged and opened. In
  the editor of one of them, the glyphs another relation or a Morph block has taken are dimmed,
  with the reason in their tooltip (a target brought in already or taken while it would arrive, a
  source consumed earlier or still arriving); a source that can still be copied — consumed or copied
  later, or not on screen yet — says so instead. **A source that a transform consumes is outlined in
  red dashes**: a pair of the relation you are editing with the style Transform or Fade transform
  (of several sources that send copies, the one that transforms), or another relation or Morph block
  that takes it later; Copy and Fade copy leave their sources, and no outline. Such a glyph is gone
  once that transform plays, so another pair can only
  **copy** it — its tooltip says which pair consumes it; give the pair the style Copy and the
  outline goes. **A new relation starts where the playhead is**: its window begins at the yellow
  line of the timeline when one fits there (a second long, or what the two clips leave after it),
  whether it is made from the button, from a link port or with **Add another relation…**. When none
  fits — the playhead is outside the time the two clips share — the window starts with the target
  clip, or after the last relation of the two clips, and the editor's Animation tab says so.
  **Create relation…** opens the relation
  editor: click a glyph on each side to link them, Shift+click several glyphs on a side (or drag a
  box over them; Shift or Ctrl/⌘ adds) and press **Link** for one-to-many or many-to-one pairs
  (right-click the selected glyphs to restyle or delete their links, or, for one link, **Edit
  path…** to shape the curve its glyphs follow — see *Custom paths* below); linking onto a glyph
  that is already a target adds the source to that pair, so that two glyphs become one (such a pair
  has a second menu: the extra sources arrive **separately** — each its own transform, all arrive —,
  **merge** as Manim fuses them, the others fading into the target, or send **copies** and stay); or
  **Suggest links by label**. Such a pair has one style; **Split into separate pairs**, in its
  menu, makes a pair of each source onto the same target, so that each can have its own style
  and its own path, and **Join into one pair** puts the pairs that bring one target back into one
  (pairs can share a target only inside one relation, or one Morph block; pairs that one pair could
  not play the same — other styles, or one that merges its sources — are not joined, and the menu
  says why).
  A link made by a click has the relation's style; to choose it while
  linking, select the glyphs of one side and **right-click** a glyph of the other (or right-click
  the selection, once it holds glyphs of both sides): **Link as Transform**, **Copy**, **Fade
  transform** or **Fade copy**. A style those glyphs cannot take — a source that another pair or
  another relation consumes can only be copied — is greyed out over its reason, and onto a glyph
  that is already a target the menu offers **Join pair N**, and under it **Separate pair as
  Transform**, **Copy**, **Fade transform** or **Fade copy**, a pair of its own onto that target.
  The side column has two tabs: **Pairs**, which counts them and lists
  them with the style of each — and, beside a pair's **Edit** (which takes it apart to choose its
  glyphs again), its **Edit path…**, which saves and opens the Edit-path mode on it —, and
  **Animation**, to set the window, easing, style (transform / copy / fade / fade copy) and how
  unpaired glyphs leave and enter — with **Starts empty** for the target clip: checked, the glyphs
  of the target that no pair brings stay out instead of entering with the intro, so that only what
  is transformed shows, as in a Morph block (an Appear block of the clip can bring others in
  later) —; a press on the drawing brings the pairs back, with the row of the
  pressed glyph's pair in view. A line on top sums it up (pairs, glyphs that leave, glyphs that
  arrive or stay out), and each link's
  badge gives its pair number and style letter (`2 T`; `I:` when inherited from the relation). Three
  keys end its toolbar: one lists the glyphs of both formulas under the drawing, a key each, which
  is how to link them from the keyboard (the lists are left out until asked for; the browser
  remembers the choice), the eye after it hides the links, and the last is **Preview raw** (below).
  **Save relation** is one undo step.
  The drawing takes glyphs as the Preview's circle selector does, always: a click takes the glyph
  with ink under the pointer, else the nearest within the circle drawn at the pointer, so that a
  minus sign or a dot is easy to hit (Shift+wheel sets its reach, the Preview's own). It is spaced
  by the size of its text, a glyph is marked by its own box, and the badges keep their size on
  screen: a formula of several lines is drawn as large as the dialog allows. Ctrl/⌘ + wheel zooms
  about the pointer and the middle button or Alt + drag moves the view (on a Mac a scroll moves it
  and a pinch zooms); the keys over its corner zoom in steps, and **Fit** shows all of it. It opens
  framed on the glyphs that can take part and those already linked, in the layout that draws them
  larger: **stacked**, the source over the target and the links between them, for wide formulas,
  or **side by side**, the links as arcs over the two, for tall ones — there each line is beside
  its own. A short formula, large either way, opens stacked. The first key of that corner changes
  the layout while the editor is open.
  Over the drawing, the switch **Link | Preview** puts the transformation in its place, so that
  there is no need to save, close and play to see it: the two formulas alone, as the editor would
  animate them now (nothing is saved for it), looping from a little before the relation's window
  to a little after it. Under the picture, play and pause, a bar to choose the instant — the band
  under it marks the window —, the time and how far through the transformation it is. The side
  column stays: a style, the window or what the unpaired glyphs do, changed there, shows at once.
  Back on **Link** and on **Preview** again, the instant is the one it was left on.
  The last key of the drawing's toolbar, **Preview raw**, animates the drawing itself instead: the
  source and the target stay where the drawing has them, in its layout and both whole whatever
  its view shows, and the glyphs go from one
  to the other as their pairs and styles say, in straight lines — the path arc and the custom
  paths are the scene's, and show in **Preview**. The target is there all along as a ghost, at
  half its opacity, and a glyph that is not on screen while the transformation runs (hidden, and
  not shown by then) is outlined, dashed. The bar of the loop takes the toolbar's place, with
  **End preview** at its end; Esc ends it too, and only a second Esc closes the editor.
  **Copies** remembers its initially lowest-index principal when rendering renumbers glyphs.
  If that glyph disappears, the pair is marked for manual repair; another source is never silently
  promoted. Edit its source set or arrival mode to repair it. Format 15 stores this choice, and
  older files migrate on opening. Save and Edit path apply the same current validation and locks.
- **Morph blocks** turn glyphs of a formula into other glyphs of the same formula, the way a
  derivation is written line by line (`examples/multiline.mfe.json`). Type `A &= x_1 \\`, `&= x_2
  \\` and `&= x_3` on three lines of the _Raw LaTeX_ field and place the formula on the timeline as
  it is: nothing needs hiding. A dropped clip lasts 3 s: drag its right edge (or set its end in the
  Timing tab) to about 7 s so that the blocks below fit. Right-click the clip at 2 s, choose **Add
  animation → Morph within the formula**, then **Edit pairs…** in the block's menu (or in the
  Animations panel): the pair editor draws the formula twice, the glyphs on screen when the block
  starts and the glyphs it can bring in: one over the other or, for a derivation taller than wide,
  side by side — the drawing is the relation editor's, with its circle selector, its zoom, its two
  layouts and the key that lists the glyphs. Link them as in the relation editor (click a source,
  then a target; Shift+click several glyphs on a side, or drag a box over them, and press **Link**;
  right-click the target instead to choose the pair's style, **Link as…**), or press **Suggest pairs
  by label**: each target takes the nearest glyph before it with the same label, so this block gets
  row 1's `=` and `x` → row 2's, drawn dashed until you **Accept all**. Glyphs that cannot take part
  are dimmed, and their tooltip says why; **Save pairs** is one undo step. Add **Appear → Write** at
  3 s and pick the subscript `2` as its glyph (it waits off screen for the block), then a second
  morph at 4 s, where Suggest takes row 2 → row 3, and an Appear for the `3`. The targets of a morph
  skip the intro by themselves and arrive through the block, and they are ordinary glyphs
  afterwards: part transforms, keyframes and colours work on them, and a glyph of a row can also
  come from another formula by a relation. Keep `{{ }}` groups inside one cell of an aligned line:
  ManimGL cannot compile a group that spans `&`, and the formula gets a warning.
  `examples/completing-the-square.mfe.json` puts it all together: the quadratic formula derived by
  completing the square, with relations of the three styles, Morph blocks, blocks of every kind, and
  intros and outros of every kind.

  In the panel a selected Morph block has a **Default style** for its pairs (a pair can have its own
  in the editor): **Copy (source stays)**, the default, keeps the glyphs it starts from, like
  Manim's `TransformFromCopy`; **Transform** turns them into the targets, and they are gone
  afterwards (`ReplacementTransform`); **Fade transform** fades them into the targets
  (`FadeTransform`); **Fade copy (source stays)** fades a copy of them into the targets and keeps
  them, as Copy does (`FadeTransform` of a copy). A relation and each pair have the same four
  styles. Below come its **Path arc** in degrees, its pairs (read-only, each with what
  its glyphs follow and **Edit path…**), its start, duration and easing, and its **Problems**
  (**Warnings** when it has only warnings): a
  glyph on both sides of the block, a target that a relation or another Morph block already brings
  in or that was consumed earlier, a source consumed twice or copied after it was consumed, a source
  not on screen yet or still arriving when the block starts, or the block running while something
  else animates one of its glyphs (dragged on the timeline, a morph stops before that). **Duplicate
  without pairs** copies a block's settings, as a glyph arrives through one pair only. With **Edit →
  Suggest morph pairs** on (off by default), a new Morph block starts with the pairs Suggest finds.
  Moving/resizing blocks and relation windows preserves attached objects' measurement instants.
  Circumscribe, Flash and FocusOn may extend across later transfers when their starting instant
  is measurable; they measure once rather than owning the glyphs for their whole duration.
- **Custom paths**: a pair's glyphs follow the relation's (or the Morph block's) **Path arc** unless
  the pair has a path of its own. **Edit path…** — in the Animations panel's pair list, or in a
  link's menu in the pair editor, which saves first — opens the preview's Edit-path mode on that
  pair; beside a relation in a clip's **Relations** list it opens the mode on the relation's one
  pair, or the pair chooser when it has several (disabled, saying why, on a locked track or with
  no pairs). In the mode the playhead jumps to the middle of the window, so the glyph is seen on
  its curve, with its start and end drawn faintly; the chord from one to the other is dashed. The
  curve starts as the
  pair's path or, when it has none, as the **Path arc** it follows turned into anchors and handles
  (the plain chord at 0°). Click the curve to add an anchor, drag anchors and handles (a smooth
  anchor's two handles mirror each other: the other one turns and takes the same length;
  Shift+drag turns it but keeps its own length, Ctrl/⌘+drag moves the handle alone and makes the
  anchor a corner — the key counts at each move of the drag —, and a double-click makes an anchor
  smooth or a corner), Delete removes the selected anchor or retracts the handle, the arrows nudge
  by a pixel (Shift: ten; a nudged handle mirrors the other too), Enter, Esc or **Done** finish, and
  so does an entry chosen in the preview's right-click menu (the path is kept; **Esc** closes that
  menu and leaves the mode on); every change is one undo step, and a path left as the plain chord or
  as the arc it started from is dropped (**Straight path** in the link's menu drops it too). The
  path is kept in the chord's own frame, so it follows the formulas when they move or scale; the
  export plays it through a small `path_func` helper that moves the glyph along the curve at a
  uniform speed, the same in ManimCE and ManimGL. A pair with a path of its own wears a dot (*Edited
  path*, says its tooltip) wherever pairs are listed beside an **Edit path…** — the pair chooser,
  the menu of a relation's band, the link menu and the list of pairs of the pair editors, the
  panels of a relation and of a Morph block —, and a relation's row in the **Relations** list says
  how many of its paths were edited ("2 paths edited").
  `examples/custom-paths.mfe.json` has seven pairs, four of them with a path of their own.
  **A path for one glyph of a pair**: a pair of several glyphs has several *routes*, each one
  source glyph on its way to one target glyph (two glyphs that become one, one that becomes two,
  several onto several as Manim pairs them up). The pair's path is common to them all, and the
  mode edits it as one: the curve is drawn once, on the first route, and a bar at the top left
  says that it is the path of all the glyphs. **Path per glyph** in that bar — on when the mode
  opens on a pair one of whose routes has a path of its own — draws every route and says what is
  edited, starting on **All together** (the common path); click a route's curve, or the faint
  glyph at its start or end, or step with the bar's arrows, and the curve with the anchors is
  that route's alone: its first change gives the route a path of its own, which **Remove own
  path** takes away. The padlock beside the option locks the other routes: still drawn, they and
  their glyphs no longer answer a click, and the arrows choose the route. Turned off, **Path per
  glyph** goes back to the common path and deletes nothing: the routes keep their paths, and the
  bar counts them. Editing the common path moves the routes that have none of their own. A **Fade
  transform** of a group has no routes (the group cross-fades whole); its sources have one each
  when they arrive separately or as copies. In the export, one transform whose glyphs follow
  different paths gets a helper that gives each glyph the path of its route.
- **Multicamera** (**View → Multicamera**, or Alt+M) gives the scene a camera: Manim's frame, which
  can then move and zoom over the scene as the video plays. It is part of the project (saved with
  it, one undo step). On, the timeline has a **Camera** row, held under the ruler as the tracks
  scroll (beside the ruler in the vertical timeline of Zen mode), with the camera's **moves** as
  blocks. A block says where its move goes: «→ 200 %» to a frame of its own, by its zoom (100 % is
  Manim's frame), «→ Camera 1» to a target camera, «→ Start» back to the frame of 0 s; too short for
  its name, it shows its icon alone. The **+** of the row's header adds a move at the playhead, a
  second long — over the region, when one is marked — and takes the playhead to its end, where the
  camera is then put where the move should arrive. **Nothing else animates while the camera moves**:
  a move asked for where an animation runs (an intro, an outro, a block, a relation) starts after
  it, and one with less room than it wants is as long as the room; a notice says so. A move is
  dragged along the time by its body and stretched by its edges, snapping as an animation block does
  (to the playhead, the grid, the edges of the animations and of the other moves, the ends of the
  clips; Shift suspends it); it never leaves the free time it is in — it stops against the
  animation, or the move, before it and after it, and the readout under it says which one.
  Right-click a move to **Isolate** it **in the Preview** (below, for frames that lie one over
  another), to **Duplicate** it (the copy goes to the first place after it with room for
  its whole length) or to **Delete** it; right-click the row to add a move where you clicked. Under
  each move a hatched band crosses every track, the **locked region**: an animation block, the
  window of a relation and the edge of an intro or an outro dragged towards it stop at its edge (a
  block says why, «Stops here: the camera moves from 4.00 s to 5.00 s…»), snap to it, and do not
  pass it; a new block asked for under a move goes beside it, and an intro or an outro given from a
  clip’s menu that would run during a move is asked about first, with the length that fits. What
  still ends up under a move — a whole clip dragged there — is an error of the project: its band
  turns red, the animation wears the error, and the Python is not exported until one of the two is
  moved. From the keyboard, Tab reaches the row’s moves after its two buttons; ←/→, Home and End go
  from move to move (↑/↓ in the vertical timeline), Enter or the Menu key opens the menu of the
  focused one, Delete removes it, Ctrl/⌘+D copies it and Alt+←/→ nudges it a frame (Shift: five) —
  as far as what it cannot run alongside, which is then told to a screen reader. With a move
  selected, the **Animations** panel shows its **Start**, **Duration** and **Easing** with its
  curve, and where it **Goes to**: a frame of its own, with its **X**, **Y** (the centre, in units
  of the scene) and **Zoom** (100 % is Manim’s frame); a target camera; or the start. A click on the
  row’s name, **Camera**, shows the camera itself: the frame it rests in at the playhead — the frame
  of 0 s, the destination of the last move that ended, or a target camera, and the panel says which
  — and the **target cameras**, frames with a name set aside for moves to go to: several moves can
  share one, and editing it changes them all. A target camera has its own view (name, X, Y, Zoom,
  the moves that go to it, **Move camera here**); deleting one that moves go to asks first, and
  those moves keep going where it was, each to a frame of its own. The padlock of the row locks the
  camera: its moves can still be selected, and the panel shows its fields disabled. Turning the
  multicamera off takes the camera away; it stays on while the camera has target cameras or moves,
  and a notice says so: delete them first. With the multicamera on — the **camera** button of the
  Preview’s toolbar turns it on and off too — the **Preview shows the world**: its canvas takes the
  whole panel and nothing is cut at Manim’s frame, which is drawn as a dotted line. **Fit** shows
  everything of the camera there — Manim’s frame, the frame of 0 s, the target cameras and the
  frames the moves go to, with room for their names —, and a multicamera turned on starts so; turned
  off, the frame fits its canvas again. The camera at the playhead is a sky-blue rectangle with a
  dash of its own, the corners of a viewfinder and its name; what it leaves out is dimmed. Target
  cameras are pink rectangles with their names, the frames that moves go to on their own are pink
  too, with the number of their move, and a line with arrowheads joins the frames in the order the
  moves run (**Preferences → Show the camera’s route** and **Dim what the camera leaves out** hide
  the line and the dimming). A rectangle is taken by its edge, by its name or, the camera, by the
  cross of its centre. **The pointer takes the camera’s rectangles alone there**: the objects are
  drawn and left alone — no outline, no click or drag on one, no handles, no selection rectangle —,
  so that a press meant for the camera takes no formula under it. A click beside the rectangles
  clears the selection, the view is panned and zoomed as ever, a mode started there (align by
  symbol, a line drawn, Edit path) reads the objects its own way, and a line under the scene says
  how the objects are reached: **hold F**, and the pointer takes them there as it does in the camera
  view — a click selects, a drag moves, Shift shows the handles, Alt picks glyphs, a right-click
  opens an object’s menu — until the key is let go (a drag goes on to its end), though not while the
  scene plays; or select them in the camera view, or on the timeline. Frames that lie one over
  another — the camera going to the same place again and again, each move to a frame of its own —
  are taken one at a time: **Isolate in the Preview**, in a move’s menu on the timeline, leaves the
  rectangle of the frame that move goes to (its own, its target camera’s or the frame of 0 s) as the
  only one that answers the pointer, drawn over the others, which are drawn faint; a press on it
  selects that move, its corners and the arrow keys are its, and its block on the timeline wears a
  dashed ring. **Stop isolating** — the button in the corner of the Preview, the last entry of its
  right-click menus and of the move’s own, or Escape — brings them all back; isolating changes
  nothing of the project, and ends with its move. Dragging a rectangle moves the frame it stands
  for: the camera’s is the one it rests in at the playhead (the frame of 0 s, the destination of the
  last move, or the target camera it is on); while a move runs the camera is on its way and a notice
  says to go to the move’s end. A corner of the selected rectangle scales it about its centre, the
  picture’s shape kept. Shift or Alt keep a drag to one axis; the rectangle sticks to the objects,
  to the other rectangles and to Manim’s frame, to the grid when it is shown, and a scaled one to
  the sizes of the others (Ctrl/⌘ suspends it). The arrow keys nudge the selected rectangle 0.01
  (Shift: 0.1), a run of presses one undo step; a line under the scene says how the selected
  rectangle is moved, or why it is not (a locked camera, a camera on its way). Right-click the empty
  scene to **Add target camera here** — centred on the click, as large as the camera is then — or to
  **Add camera move**; right-click a target camera to **Move camera here** (a move to it at the
  playhead), to **Rename…** it or to **Delete** it, which the Delete key does too for the selected
  one; the menu of the camera’s own rectangle, and of a move’s, adds a target camera in that frame.
  The **camera view** (V, the viewfinder button beside the camera’s, or **View → Camera view**)
  looks through the camera at the playhead, as the video does: the canvas is the picture again, the
  rectangles and the world around them are left out, and playing shows the moves. The objects are
  selected, moved and edited there as ever. It keeps a zoom and a pan of its own, apart from the
  world’s, and a multicamera turned on comes up in the world. In both views **the frame is the
  camera’s at the playhead**: Align to frame and the guides of a dragged formula refer to what is
  seen then, while the grid stays the world’s and is drawn wherever the view looks. The exported
  Python and the video are filmed through the camera: a ManimCE scene becomes a `MovingCameraScene`,
  each move a `self.play(cam.animate.replace(…))` of its own (`Restore(cam)` back to the start), and
  a ManimGL scene whose camera zooms starts with a few lines that make strokes scale with the zoom
  as ManimCE draws them (ManimGL 1.7.2 or later). `examples/camera.mfe.json` has the three kinds of
  move: to a frame of its own, to two target cameras and back to the start.
- **Slides mode** (**View → Slides**, or the button with a screen after **Snap** in the timeline's
  toolbar) is for the end of the work, when the scene is to be shown: it puts **pauses** and
  **comments** on the scene's time, for the exports that stop or carry words — the exported page
  stops at each pause until its reader goes on, and a comment is a note for whoever works on the
  scene after the export (the Python carries it as a comment). The video is the same with the mode
  and without it. The mode is part of the project (saved with it, one undo step) and stays on while
  it has a pause or a comment: delete them to turn it off, and a notice says so. On, the **ruler is
  tinted by zone**: blue-green where nothing animates, where a pause may stand — edges included, so
  just where an animation ends is one —, and a hatched red-orange where something animates (an
  intro, an outro, a block, a relation, a camera move); a thin notch of blue-green is an instant
  between two animations that touch, or the start or the end of a scene that begins or ends with
  one. The zones follow every edit as it is made. **Right-click the ruler** to **Add pause here** or
  **Add comment here…** — at the time clicked, on a frame and, with Snap on, pulled onto the
  playhead or the edge of the zone; where something animates the two entries are greyed out and the
  menu says what runs there. A pause is a small tag with «‖» in the upper part of the ruler, with a
  thin line down the tracks; a comment, a speech bubble. Hovering one shows its words at once; a
  click puts the playhead on it; a drag moves it inside its zone (Shift: no snapping; Esc cancels);
  a double click writes its words — a comment's, which it cannot be without, or a pause's note —
  in a dialog of several lines, where Enter starts a new line and Ctrl/⌘+Enter saves. Its
  right-click menu has the same and **Delete**. A second pause on a frame that has one is not
  added. From the keyboard, Tab reaches the marks one by one; ←/→ (↑/↓ in Zen mode) move the
  focused one a frame, Delete removes it, Enter writes its words and the Menu key opens its menu;
  **P** adds a pause at the playhead and **Shift+P** a comment, as **View → Add pause at the
  playhead** and **Add comment at the playhead…** do. For a long scene, **View → Add a pause after
  every animation** (in the menu of the ruler too) puts a pause wherever an animation ends and
  another follows — the instant between two that touch included, a rest that has a pause left alone
  — in one undo step; then delete the ones you do not want, one by one: after Delete the focus is on
  the next mark. **View → Delete every pause…** (in the menu of the ruler too) asks first, saying
  how many go, then deletes them all and leaves the comments: one undo step brings them back, as the
  notice says. A pause can **skip its wait**: tick **Skip the wait after it** in its menu, and where
  the exported page or the rehearsal stops at it, going on starts where the next animation does,
  without the rest in which nothing happens — the wait of a video, of no use to a talk that has just
  stopped. Played through its pauses, in the Python and in the video, the rest stays. Such a pause
  is violet, its tag «‖▸», and a violet line runs along the ruler over the stretch it skips: to
  where the next animation starts, or to the next pause of that rest, where the scene stops again.
  Its tooltip says how long it skips. Where a pause has nothing to skip — the instant between two
  animations, the rest after the last one — the entry is greyed out and a line says why. **View →
  Skip the wait at every pause** and **Keep the wait at every pause** (in the menu of the ruler too)
  set or clear it on every pause at once, in one undo step; a notice says how many changed, and how
  many have no wait to skip. The three are greyed out while the scene has no pause. An edit that
  covers a pause or a comment — a clip moved over it, a scene made shorter — is asked about at once:
  delete the mark and keep the edit, or take the edit back. A mark out of place that a file brings
  is drawn in amber and says why, and can be dragged to where one may stand. With the mode on, the
  transport has **Stop at pauses**: on, Play stops the Preview at each pause, exactly as the
  exported page will, and Play again goes on from it — from where the next animation starts, after a
  pause that skips its wait (with the sound too) — the rehearsal of the talk. It is a way of
  playing, not part of the project: it is not saved.
- **File**: New (Ctrl/⌘+Alt+N: the browser keeps Ctrl/⌘+N for a window of its own); **Open…**
  (Ctrl+O) is the Projects dialog: the projects of your synced folder, with
  thumbnails and the file name (less its `.mfe`), a click opens one (**Other file…** is the
  browser's own picker). The projects are cards in as many columns as the dialog has room for, and
  the dialog can be resized from its corner or maximized. The search above them keeps the projects
  whose name or file name has every word you type (case and accents apart; it has the focus when
  the dialog opens, and Esc empties it before closing the dialog). The star of a card makes the
  project a favorite, and **All | Favorites** lists every project or the starred ones alone; the
  stars are kept in this browser, by the names of the folder and of the file, and nothing is
  written in your folder (a renamed file loses its star). A file of the folder that is a project
  and does not open — one saved by a newer version of the app, one with a field out of place, a
  `.mfe` that is damaged, a `.mfe.json` whose text was cut short — is named under the cards with
  the reason, the one **Open** gives for that file; another `.json` file that is no project is only
  counted. Opening a `.mfe` whose project the app does not read says that reason too, and calls
  damaged only a file that is.
  **Sync folder…** (Ctrl+Shift+S, ⌥⌘S on a Mac; also offered by an empty project) picks
  that folder once: Chrome/Edge keep it and list it afresh every time, a project opened from it
  saves in place and Save As starts there, while other browsers keep a snapshot of its files until
  you sync again; Save and Save As (a real file through the File System Access API in Chrome/Edge, a
  download otherwise), and **Project settings** (target, resolution, frame rate, background, LaTeX
  preamble, duration); click the project name in the menu bar to rename the project in place (Enter
  keeps the new name, Esc takes it back, and either leaves the focus on the name). Save captures the
  current revision before opening a picker or asking permission. Later edits remain unsaved;
  overlapping saves to the same file finish in command order. Open asks about unsaved work once the
  file is chosen: after **Save** in that question, the file that opens is read again, so choosing
  the very file that is open shows what was just saved (in Chrome/Edge: elsewhere Save is a
  download, and the chosen file opens as it was). Replacing the document cancels a pending
  save before it opens a writer for the old document's destination, unless you had already chosen
  that destination in the file picker: then the project you were saving is written
  there as a copy, a notice says so, and the project that is open stays as it was. The project is
  also autosaved in the browser, one autosave per tab: reloading a tab brings its work back, also
  when its page had crashed; a new tab takes over the work of a tab you closed (or that crashed, a
  minute later), and **Recover autosave** lists the work of other closed tabs for a week, the five
  most recent. When the browser itself closed unexpectedly and restores its tabs, each tab gets its
  work back within a minute: by itself if you have not used the tab yet, otherwise through a notice
  with a **Recover** button. Work that another tab took over stays available to its own tab for a
  week (the five most recent), in case the browser had only put that tab to sleep. The title shows
  `•` while there are unsaved changes, and
  the menu bar says "Unsaved changes", "Saved" or "Not saved yet" next to the project name and the
  file name ("Recovered, not saved" when the unsaved work came back from the autosave: save it to
  keep it). Windows opened or duplicated from another tab keep independent autosaves. If browser
  storage is blocked or full, recovery preserves the original copy and retries; save to a file to
  keep new work. Import also repairs conflicting match-color list IDs while keeping every list and
  entry, with a warning explaining the repair. A browser without the File System Access API
  (Firefox, Safari) works on copies of your files — Open reads a copy, Save downloads a new file
  each time, the synced folder is a snapshot and nothing is written into it —, and the app says so
  once per session, when it opens, in a notice that stays until you close it.
- **Edit**: Undo / Redo (Ctrl/⌘+Z, Ctrl/⌘+Shift+Z, and Ctrl+Y on Windows and Linux; they also
  work inside the formula editor, outside its text fields, and in dialogs whose edits immediately
  change the project). During a
  live drag, Undo or Redo first cancels that gesture and preserves the committed history; another
  history command then behaves normally. A command that changes or saves the project gives a live
  drag up as well: Ctrl/⌘+S saves the project without the move. Ctrl/⌘+D duplicates the selected
  timeline clips or block; a formula has no such key: it is duplicated with the button of its card,
  or from the right-click menu of the selected formulas. **Always add intro / outro** (off by
  default: new clips appear and disappear at their start and end) and **Default intro & outro…**
  choose what new clips get unless their formula says otherwise (**Appears with** in the formula
  editor); **Suggest morph pairs** (off by default) gives a new Morph block the pairs Suggest finds;
  these are editor preferences kept in the browser, not in the project. **Match colors ▸** keeps the
  project's lists of LaTeX patterns and colours: **Create match colors…** opens a new one in the
  Match colors dialog (the lists on the left; a list's name and its patterns — LaTeX as typed, `$…$`
  around it ignored, matched token by token so that spaces do not count and `x` is not found inside
  `\xi` — each with a colour from the Manim palette under its chip or typed as hex, ▲▼ to order
  them, since the lower entry wins where patterns overlap, × to remove, **+ Add pattern**, Duplicate
  and a held Delete; every edit is one undo step and Ctrl/⌘+Z works inside), a preview draws a
  formula of the project with the colours before anything is applied, and **Apply to N formulas**
  colours the selected formulas or the selected clips' formulas; a Text (font) among them keeps the
  colours it has, since the patterns are LaTeX, and the notice says so. Pending colour calculations
  are discarded for formulas edited meanwhile, superseded colour commands, changed lists, or a
  replaced document; undoing an edit does not revive an obsolete calculation. **Copy properties**
  takes the state of one selected clip as shown at the playhead — position, scale, rotation, flips,
  opacity, colour and per-glyph colours — and **Paste properties ▸** gives it to the selected clips
  (several by Ctrl/⌘+click or with the selection rectangle): all of it but the position, or one
  group — Transformation (scale, rotation, flips), Appearance (opacity, colour), Glyph colours (onto
  clips of the same formula only, since they go by glyph) or Position (which stacks several clips on
  one point); each entry shows what it would paste, and a paste is one undo step. **Align** (left,
  centre, right, top, middle, bottom) lines the selected clips up on the outermost edge, or the
  middle, of them all (a lone clip, or Shift held while choosing, aligns to the frame) and
  **Distribute** (horizontally, vertically; three or more clips) spaces them evenly — an attached
  object (a brace, a shape, a label beside a formula) is neither measured nor moved by them: it goes
  where what it hangs on goes, and stays when that is not among the clips aligned; **Align by
  symbol…** (also the button next to the magnet, and Alt+G) is a two-click mode: click the symbol to
  move, of one formula, then the reference symbol, of another (a halo around the pointer takes the
  nearest symbol within its reach, so thin ones are easy to hit; Shift+wheel sets the reach), and a
  compass on the reference asks on which of its sides, corners or its centre the first symbol lands
  (Manim's UL … DR), moving the whole formula of that first symbol. Two formulas that are never on
  screen together — a line that comes in as the one before it leaves — are aligned with **G**:
  pressed after the first click, it keeps that symbol as it is at the playhead (its formula stays in
  view, faint, and the ruler marks the instant; G again lets it go), the reference is then
  clicked at any other time, and the move changes the keyframe in effect at the kept instant and
  nothing else of the timeline; a notice says what was done and what moves beyond it (a later
  transformation with a position of its own, a reference that is elsewhere by then), and G keeps
  nothing where the alignment would not hold (the formula is moving at that instant, is locked
  after a transformation, or hangs on another one). A formula edited while the mode is on keeps its
  symbol: the mode follows the glyph into the new render, and ends, saying so, when the symbol is no
  longer there. The modes of the preview — align by symbol, Edit path, Edit curve, drawing a line
  (**Add line ▸**), colours in order and a shape's **To another formula or glyphs…** — are on one at
  a time: turning one on ends the
  one that was on, and while one is on its keys are its own wherever the focus is, except in an open
  menu, a dialog or a field. Align, Distribute and Align by symbol are also in the preview's
  right-click menu on a clip (Copy takes the clip under the pointer; each section of that menu —
  Paste properties, Align, Distribute, Add brace, Add shape, Apply match colors — is a submenu that
  opens beside its entry on hover or with →, as in the other long menus) and, with two or more clips
  selected, in an action bar in the preview's top-left corner (align and distribute as icons, Paste
  properties ▾ and Match colors ▾ as menus), align and distribute on keys too (see the table below),
  and a clip that is locked after its transformations, on a locked track or off screen stays as it
  is. **View → Glyph source** forces MathJax or the companion's LaTeX renders instead of the
  automatic choice. **View → Theme** picks dark, light or the system's (followed as it changes); the
  half-filled circle at the right end of the bar flips between dark and light. Both are one design,
  the Mint theme: the panels float as rounded cards of glass with a gap between them (the gap is the
  handle that resizes them), the main action of each place is a mint button (Export…, + New, Play,
  Apply), and what is selected is teal. **View → Panels** folds the Creator, Animations and Timeline
  panels to their title bar and back (so does the chevron in each panel's header, or a double-click
  on the header); a fold is remembered with the panel sizes. The keys **C** and **A**, alone and
  outside fields, menus and dialogs, do it for the Creator and for the Animations panel.
- **Zen mode** (**Preferences → Zen mode**), for small windows — it was designed at 1366×768. The
  timeline becomes a column on the left, drawn **vertical**: time runs down the screen and the
  tracks stand side by side with their headers on top. It is the timeline that lies, turned a
  quarter: the ruler runs down the column's right edge, beside the Preview, the first track is next
  to it and the others follow to the left, and the scrollbar of time runs down the left edge.
  The Preview takes all the rest. A thin strip along the top of the Preview has a button for the
  **Creator** and one for the **Animations** panel: each opens and closes its panel as a half of a
  **drawer** over the Preview — the Creator on the left, the Animations panel on the right, side by
  side when both are open, and the Preview seen through the half that is closed. A half stays open
  while you work on the timeline; a press on the Preview's scene closes the drawer (and does what it
  does there), and so does **Esc** (in a field you are typing in, Esc is the field's). Drag the grip
  on the drawer's free edge to make it taller or shorter and the line where the halves meet to give
  one more room (focused, the arrows do both), and press the arrow at the far end of the strip to
  move the strip to the bottom of the Preview, from where the drawer then rises. The strip also has
  what one reaches for most with the Creator closed: the search of formulas, **+ New** with the menu
  of its kinds, **My templates** and **Favorites**, and Undo and Redo. Everything in the timeline
  works as in the usual layout, along the other axis of the screen: drag a clip down to move it
  later and sideways to another track, its ends are its top and its bottom, the wheel goes along
  time (Shift + wheel across the tracks, Ctrl/⌘ + wheel zooms about the time under the pointer), and
  the arrow keys follow the screen — ↑/↓ along time, ←/→ across the tracks, Alt+↑/↓ nudges by a
  frame. The names of clips and tracks are written across their track and cut with «…» where they do
  not fit; the name of an animation — on a block, an intro, an outro — runs down what it names,
  under its icon, and reads downward; the tracks start wider than in the usual layout, and each
  layout keeps the track sizes you give it. It only rearranges: the menus, the panels' title bars
  and the transport are the same, **View → Panels** opens and closes each half and folds the
  timeline to a strip on the left, and the search of formulas covers the Preview with its drawer.
  The mode, the side of the strip, and the drawer's halves, height and split are remembered in the
  browser; a window under 760 px keeps its stacked layout. **C** opens and closes the Creator's half
  of the drawer and **A** the Animations panel's. In any layout, hold **T** and move the mouse to
  move the timeline's view along time, wherever the pointer is; hold **Shift+T** and the playhead
  follows the pointer instead — it goes at once to the time the pointer is level with along that
  axis and on with every move, and stays there when the keys are released (Shift pressed or let go
  while T is held changes between the two). While the key is held the mouse is the timeline’s: the
  Preview outlines and takes nothing of the scene under the pointer.
- **Preferences**: Snap to objects; the colour (yellow, orange, magenta, cyan, green, white) and
  width (thin, regular, thick) of the snap guides; **Glyph selection colour**, one of the same six
  for the glyphs selected with Alt in the preview and the rectangle that selects them (yellow, like
  the guides, until you choose another); whether the transform handles stay shown without
  Shift, and their scale step (0.05, 0.1, 0.15, 0.2, or a number or fraction of your own, like 1/3
  or 0.3/0.2); the grid (shown, its spacing, and whether it holds the centre or the edges); and
  **Standard scale…**, the size new formulas and new texts are born with — 1 is Manim's font size
  48, 1.5 is 72, a number or a fraction each. Saving it never changes the objects that exist;
  **Apply to all formulas** and **Apply to all texts**, beside its fields, give the scale typed
  there to every formula, or every LaTeX text, of the project, whatever scale each had (their clips
  keep their own scale and animations), after a question that says how many change — one undo
  step, whether the dialog is then saved or cancelled. **Split suffix…** is what names the copy a
  split makes: a clip cut at the playhead (S) gives its second half a copy of its formula, named
  after it with the suffix — `f1_s` by default (letters, digits and "_", at most 16).
  Like the intro
  and outro defaults, these preferences are kept in the browser, not in the project.
- **Preferences → Chroma Lab…** opens the complete local color studio in a resizable, maximizable
  dialog. Its scenes, videos, extraction worker and local help work offline. **Send to Manim Formula
  Editor**, beside the JSON export in Exploration and in Seeds & themes, puts the theme in the
  editor's palettes and opens **Editor palettes** on it, ready to activate, with no file in between.
  A role theme saved with **JSON** is imported with **Import palette…**, in the dialog's title bar
  (the **ⓘ** button beside the window buttons tells all this in the dialog): it asks for that file
  and opens Editor palettes the same way. The file can also be dragged onto the Chroma
  Lab dialog or onto Editor palettes, one file at a time. Over Chroma Lab the drop area appears only
  for a file the browser reports as JSON, so a picture still reaches the studio's image extractor. A
  file dropped anywhere else in the editor does nothing, instead of opening in its place. The
  general "Export palette" JSON has no named roles and cannot be imported into the editor. Send or
  export your Chroma theme before closing if you need to keep it: browser storage may be
  unavailable. **Editor palettes…** imports, previews, renames, exports, activates and deletes up to
  24 themes, and makes and edits them: **New palette** starts one from the colors the editor uses
  without a palette, **Duplicate** copies the selected one, and each of the eleven colors of a
  palette has a color field, under a sample that shows them at work on the palette's background. A
  color is saved when its field is accepted, with no draft and no undo: duplicate a palette to keep
  it as it is. A palette made or changed here is exported under the name it has in the editor, and
  that file is the same palette when it is imported again. Importing or making a palette does not
  activate it; activation changes future defaults and color choices, without recoloring the current
  project or adding an undo step, and so does a color changed in the active palette. Exact duplicate
  imports reuse an entry. If storage fails, the library remains usable in this tab and offers export
  and retry; a change that waited for a save and no longer applies by then (its palette was removed
  meanwhile) is dropped with a notice, and the rest is saved. A stored library whose data is damaged
  offers **Reset library**, which replaces it with the palettes of the tab; one written by another
  version of the editor is left untouched. Under the eleven colors, **Your roles** holds roles of
  your own: a name and a color each, added with **Add role** (or Enter in the name), renamed and
  recolored in place, deleted with **Delete**, up to 24 in a palette. Nothing takes such a role by
  itself: it is a named color of the palette, offered wherever a role is chosen. It travels in the
  exported file, in a `customRoles` field of its own beside the eleven `colors`; Chroma Lab opens
  that file as any other and works with the eleven, so a palette generated there is a place to
  start from, and its extra roles are added here. Color controls offer the active palette's eleven
  named roles, and the roles you added to it, alongside their existing choices; each choice copies
  a hex value. The **Roles** button of a color field, and the color menu of Match colors, show
  every role as a block with its name beside its color, your own under **Your roles**; the rows of
  swatches in the menus keep the names in their tooltips. In **Apply match colors**, each list
  shows its colors after its name. New formulas use `formula`, text uses `text`, braces use `muted`,
  boxes/highlights/underlines use `rectangle`, circles use `circle`, and lines, arrows, crosses and
  cross lines use `arrow`. Scale and shape styles keep their existing defaults. New projects use
  `background`; Open and recovery preserve saved backgrounds. Duplicates keep their authored colors.
- **Edit → Apply palette…** previews changes to existing objects and applies them in one undo
  step. An object used by any locked-track clip is skipped completely, even if it also has an
  unlocked use. A formula or a text (LaTeX or Pango) with per-glyph colors is skipped too. The
  preview reports these omissions. Clip, animation and glyph overrides, tags and styles stay intact;
  they may still make a clip look different. Applying the background is optional and affects the
  whole scene, including behind locked objects. A changed project or palette requires reviewing a
  fresh preview. **Match colors → New from active palette…** creates four ordinary rows for
  variable, constant, operator and result colors, with empty patterns for you to fill; it does not
  recolor any glyphs automatically. Projects and Python exports contain only literal colors, so they
  work without the palette library on another machine. In a color or right-click menu, Tab closes
  the menu and moves on to the control after the one that opened it (Shift+Tab: to the one before);
  Esc closes it and stays there. A menu opened with the mouse over something that cannot take the
  focus, like the preview, has no such control: Tab then goes on from the end of the page. While a
  menu is open its keys are its own: no shortcut acts under it (an arrow does not move the
  playhead, Delete deletes nothing, S and Shift+C start nothing) until it is closed.
- **Export** is the mint button to the right of the menus: a click opens the last Python target used
  — ManimCE at first — and its arrow lists every export, written here as **Export → Python —
  ManimCE… / ManimGL…**, **Export → Video…** and so on. **Export → Python** writes the scene as
  a Manim script: one `MathTex` / `Tex` per clip, plain `self.play(...)` / `self.wait(...)` calls in
  whole frames (the video has exactly the timeline's length), and small helpers only where the
  timeline needs them. The header comment has the command that renders it at the project's size and
  frame rate (`manim -r 1920,1080 --fps 60 Scene.py Scene`, `manimgl Scene.py Scene -w -r 1920x1080
  --fps 60`). It targets ManimCE 0.22 and ManimGL 1.7. Formulas rendered with the companion use
  exact glyph indices; MathJax-only formulas (or all of them, with **Always use the positional
  helper**) find their glyphs by position when the scene runs (needs scipy, which both Manim
  installs have; [Without the companion](#without-the-companion) says which formulas that does not
  reach). Appear and disappear blocks become the same Manim animations on just their glyphs;
  when a glyph leaves and comes back later, the script adds a tiny subclass of the remover
  (`_Uncreate`, `_ShrinkToCenter`, `_Unwrite`) that gives the glyph its shape back, and only then. A
  transform of a part becomes `.animate` on those glyphs (scale about their centre, shift, colour,
  opacity), or the small tween helper when it rotates. A Morph block plays like a relation, one
  animation per pair: `TransformFromCopy` (ManimGL) or `ReplacementTransform` of a copy (ManimCE)
  for **Copy**, `ReplacementTransform` for **Transform**, `FadeTransform` for **Fade transform** and
  `FadeTransform` of a copy of the sources for **Fade copy**;
  a formula of several lines is written as a raw `r"""…"""` string, its lines as you typed them. The
  dialog lists what the script cannot guarantee; **Copy** and **Download** take the code. A font
  text is written as `Text(...)` with its font, from its saved shape, or by its placeholder boxes
  when nothing has shaped it: the companion does not have to be running. Imported/generated Python
  symbols are reserved for scene-class names — and, in a scene whose camera does something, the few
  names the camera uses (`Restore`, `cam`) —; the dialog suggests a safe spelling when necessary. A
  project called as one of them gets `Scene` after its name: the field shows that name, with a note,
  and the class, the file downloaded, the command in its header and a render with Manim all use it.
  Saved project and formula names are unchanged.

  The marks of the **Slides** mode go into the script as comments at their instants, there for
  whoever goes on with the scene: a comment as `# NOTE (5.00 s): its words`, a line of Python for
  each line of its text, and a pause as `# PAUSE 2 of 5 (3.20 s)`, with its note when it has one; a
  pause that skips its wait says so,
  `# PAUSE 2 of 5 (3.20 s), the exported page skips the 0.50 s wait after it`, and keeps its
  `self.wait(...)`: only the page skips it. They are written with **Comments** off too: they are
  your words, not the editor's. A mark in the middle of a wait splits the `self.wait(...)` in two
  that add up to the same frames; a pause shows the scene as it is at its instant, so its line comes
  after what appears or goes then without an animation and before what starts then. Marks in the
  tail where only sound plays come at the end of the script, which keeps the length of the scene. A
  mark under an animation or past the end of the scene is left out, and the dialog lists it; it says
  so too when the frame grid puts an animation over a mark, which is then written just before or
  just after that animation.
- **Export → Video…**: choose the size, frame rate and range (the whole scene by default) and how
  to encode it. **Browser** encodes with WebCodecs (MP4 with H.264 or AV1, WebM with VP9) and needs
  nothing else; **Companion · ffmpeg** sends the same frames to the companion's ffmpeg (MP4, WebM,
  ProRes, GIF); **Render with Manim** exports the Python scene and has the companion render it
  with your own ManimCE or ManimGL (the companion must be started with `--allow-manim-render`: it
  runs that code, in a sandbox on Linux). Chrome's own H.264 encoder can leave a few pixels of a
  moving object behind it, small dots that stay until the next keyframe (one every 2 s): for an MP4
  without them choose **Companion · ffmpeg**, which encodes H.264 with x264; without a companion,
  **WebM · VP9** leaves far fewer. A project with audio gets **Include audio** with each of the
  three (see *Audio workflow*). With **Companion · ffmpeg** the dialog says how large a video that
  companion writes, 4 GiB unless it was started with `--max-video-gib`: a larger one fails and says
  so, and so does one the disk of the companion has no room for. The file is named after the project
  and lasts exactly frames / fps. In Chrome and Edge the dialog asks where to save it first and
  writes it as it is encoded, with bounded pending file writes; elsewhere the encoded file is
  assembled in memory and downloaded at the end, and the dialog says about how large it will be.
  Cancel or Close before **Saving** prevents publication, including during final cleanup. Once file
  close begins, Saving cannot be cancelled; Close then only dismisses the dialog.
- **Export → Image…** writes the frame the playhead is at as a PNG picture. It is the frame a video
  shows at that instant: through the scene's camera when it has one, and with the tracks hidden in
  the Preview, which only the Preview hides. **Size** is the project's (**1×**) or twice it each way
  (**2×**; the scene is curves, so the larger picture is sharper, not stretched), and
  **Transparent** leaves the scene's background out: what is drawn, over nothing, to lay over
  another picture. Opening the dialog stops the playback, and the dialog says the instant it draws.
  **Export** waits while a formula is rendering and, as the Video dialog does, the dialog tells of
  the formulas on screen at that instant that it cannot draw as they are written: one whose LaTeX
  fails is drawn as its last good render, or left out when it never had one; a font text nothing has
  shaped is drawn as its placeholder boxes; one with nothing to draw it holds the picture back. The
  file is named after the project and the instant (`My project 2.50s.png`), so the pictures of
  several frames have each their name. In Chrome and Edge the dialog asks where to save it;
  elsewhere it is downloaded. The picture is the one of the click on **Export**, whatever changes
  while the browser asks where it goes. The size and the background are kept from one picture to
  the next while the page is open: a page loaded again starts from 1×, with the background.
- **Export → HTML…** writes the scene as a web page that **is the animation** — drawn as it plays by
  the engine of the Preview, sharp at any size —, not a video of it. It opens from disk with a
  double click: no server, no internet, nothing to install. **A folder** is the form to work on and
  to embed: `index.html`; the scene as data one can read and edit (`scene.js`, whose head comment
  tells its clips by name, the glyphs of its formulas by index and its timeline in words); the
  outlines of its formulas (`glyphs.js`); `custom.js`, for code of your own; its look (`player.css`,
  restyled through its `--mfe-…` custom properties); the engine (`mfe-runtime.js`) with its
  licences; and what tells the folder to whoever goes on with it — `AGENTS.md`, a guide written for
  a coding agent, which opens with your comments of the Slides mode as its tasks (`CLAUDE.md` points
  to it), a `README.md` for a person, the types of the page's API and of the scene (`types/`),
  `check.mjs` (`node check.mjs` says what is wrong with an edited scene, without a browser, and
  `node check.mjs <folder>` of a copy of its files elsewhere) and
  `embed-example.html`, a page with the scene in it. In Chrome and Edge the folder is written, under
  the scene's name, inside one you choose, and exported again over it, `custom.js`, `player.css` and
  `index.html` are kept as they are: your work on the scene is in them. The sound an earlier export
  wrote there is removed when the new one does not use it (the scene is exported without its sound,
  or the browser writes the other kind of file); an `audio.m4a` or `audio.wav` that is not the file
  the app wrote may be yours: it is left, and the notice warns of it. Elsewhere the folder is
  downloaded as a zip. **One file** is the same page with everything inside it, to send to someone
  or to present from. A scene with sound gets **The scene's sound** (AAC, or uncompressed where the
  browser does not encode AAC): it plays with the scene and stops at its pauses. The dialog says how
  many pauses and comments the page carries, how many of the pauses skip the wait after them, and
  lists the marks it leaves out because they are under an animation or past the end. The page stops
  at each pause of the Slides mode until its reader goes on; from a pause that skips its wait it
  goes on where the next animation starts — its notch is violet and the wait it jumps over dashed on
  the timeline —, while played through the pauses it keeps the wait. Its bar has previous, play and
  next, the timeline with a notch at each pause, the slide and the time, a switch to play through
  the pauses, mute, the notes and full screen. Its keys are the ones of a presentation, so a
  presenter's remote works: → ↓ Space PageDown N Enter go on; ← ↑ PageUp P Backspace go back; Home
  and End; K plays or pauses; F is full screen; S shows the notes — the note of the pause and the
  comments of the stretch —; B or `.` blacks the stage out; M mutes. Put in another page — a `<div
  class="mfe-deck" data-scene="…">` with the stylesheet and three scripts (`custom.js` a fourth), or
  an `<iframe>` —, it takes the width it is given, reads its options from `data-` attributes
  (`data-controls`, `data-notes="off"` — no notes, which show your comments, on a page for readers
  —, `data-autoplay`, `data-loop`, `data-background="transparent"`, `data-theme`…), hears its keys
  only while the focus is in it, and shares the page with other scenes: nothing in it has an `id`,
  and its rules stay under `.mfe-deck`.
- **Help → Keyboard shortcuts…** (or `?`) shows the table below; **Examples** opens one of the
  example projects the app carries (see *Starting from an example*); **Engine inspector…** shows how
  a formula splits into glyphs with each renderer; **Third-party licenses…** lists the open-source
  components the app contains and opens their notices; **About** gives the app's version, the
  project format, the MathJax and companion versions and the license.
- **Narrow windows and high contrast:** below about 760 px (a phone, or the desktop at 400 % zoom)
  the four panels stack, each as tall as most of the window, and the area under the menu bar, which
  stays at the top, scrolls down, never sideways; under forced colours (Windows high contrast) every
  state keeps a ring, a border or an underline, and the formula previews keep their colours.

### Keyboard shortcuts

On a keyboard of another script (Russian, Greek, Hebrew…), the letter of a shortcut is the key where
a Latin keyboard has it: Ctrl/⌘+Z is the key of Я on a Russian layout. A Latin layout that puts the
letters elsewhere (Dvorak, AZERTY) keeps its own: the shortcut is the key that types the letter.

| Keys | Where | What |
| --- | --- | --- |
| Ctrl/⌘+Alt+N, Ctrl/⌘+O | outside text fields and dialogs | New project, open a project (the Projects dialog) |
| Ctrl/⌘+S, Ctrl/⌘+Alt+S | outside text fields and dialogs | Save, Save As |
| Ctrl/⌘+Shift+S | outside text fields and dialogs; anywhere in the Projects dialog | Sync folder (the project library) |
| Ctrl/⌘+Z; Ctrl/⌘+Shift+Z or Ctrl+Y | anywhere but text fields | Undo; redo (Ctrl+Y on Windows and Linux only; also in immediate-edit dialogs); cancel an active gesture first |
| Space | outside fields, checkboxes, menus and dialogs | Play / pause (a button reached with Tab takes Space itself) |
| Home, End; ←/→ (Shift: 1 s) | outside fields and dialogs | Playhead to the start or the end; step a frame |
| Ctrl/⌘ (held while dragging on the ruler) | timeline | Move the playhead tick by tick: in steps of dt, the time between two small ticks of the ruler (the timeline’s toolbar shows it, and its − and + set one of your own) |
| Ctrl/⌘+A | outside text fields and dialogs | Select every clip on screen at the playhead |
| Ctrl/⌘+F; Esc | anywhere but dialogs | Search formulas: a panel in the place of the Preview lists the formulas, LaTeX texts and font texts whose name or source has what is typed (pressed again, back to its field); Esc closes it |
| Alt+A / Alt+H / Alt+D (Shift: to the frame) | preview selection | Align left / centre / right |
| Alt+W / Alt+V / Alt+S (Shift: to the frame) | preview selection | Align top / middle / bottom |
| Ctrl/⌘+Alt+H / Ctrl/⌘+Alt+V | preview selection | Distribute horizontally / vertically (3+ clips) |
| ←/→, ↑/↓ (Shift: 0.1) | preview, after a click on it, with clips selected | Move the selected clips 0.01 (Shift: 0.1) at the playhead, as a drag would move them; a run of presses is one undo step. With nothing selected, ←/→ step the playhead |
| Alt+G | preview | Align by symbol: click the symbol to move, then the reference symbol (or ←/→, ↑/↓ and Enter); a compass picks the side; Shift+wheel sets the reach |
| Shift+Alt+G | preview | Align by symbol, the reference symbol on a formula locked in the preview: it stays, and the formula of the first symbol moves to it |
| S | outside fields and dialogs | Circle selector of the preview on or off: a click takes the symbol nearest to the pointer within a circle (Shift+wheel sets its reach); with a selected clip under the playhead and the keyboard out of the preview, or with a sound selected, S splits the selected clips at the playhead instead — the second half of a formula’s clip becomes a clip of a copy of it (Preferences → Split suffix names it) |
| G | preview, aligning by symbol | Keep the symbol to move as it is at the playhead, to click its reference at another time (its formula stays in view, faint, and the ruler marks the instant); G again lets it go |
| Shift+C | outside fields and dialogs | Copy colours in order: click, one by one, the glyphs of the preview whose colours to copy (the Animations panel lists them); Enter then pastes them, in that order, on the glyphs clicked next; Shift+C again leaves |
| Shift+V | outside fields and dialogs | Paste the colours last copied in order once more, from the first one |
| Enter; Backspace; Esc | preview, colours in order | Go on from the copy to the paste; take the last click back; leave, keeping what was pasted |
| Delete / Backspace | Creator, timeline | Delete the selected formula (held to confirm), clips, relation, block, camera move or target camera |
| F2; Enter | formula card | Rename; edit the formula |
| F2; Enter (→/← too in the list view) | group of formulas | Rename the group; open or close it |
| ↑/↓, Home, End; Shift+↑/↓; Ctrl/⌘+Space (←/→ too in the block view) | formula list | Move and select; extend the selection; add or remove a formula |
| Ctrl/⌘+D | timeline | Duplicate the selected clips, block or camera move (a formula: Duplicate in its menu) |
| Tab; ←/→, ↑/↓, Home, End; Shift+←/→ | timeline | Into the clips; between the clips of a track, the tracks and a clip's block lanes; extend the selection along the track |
| Enter; Shift+F10 or Menu | timeline clip or block | Open the clip's formula or the block's menu; the clip's Add animation menu (at the playhead), the menu of the selected clips when there are several, or the block's menu |
| Alt+←/→ (Shift: 5 frames); Alt+↑/↓ | timeline clip | Move the clip a frame; to the track above or below |
| Alt+←/→ (Shift: 5 frames) | timeline block, camera move | Nudge the selected block or camera move a frame; it stops against what it cannot run alongside |
| Tab; ←/→, Home, End; Enter, Shift+F10 or Menu | timeline, Camera row | Into the camera's moves; between them, in the order they run; the menu of a move |
| P; Shift+P | outside fields, menus and dialogs, with the Slides mode on | Add a pause at the playhead; add a comment there, its words asked for first — where the scene rests (elsewhere a notice says what runs there; a second pause on a frame is not added) |
| Tab; ←/→; Delete / Backspace; Enter; Shift+F10 or Menu | a pause or a comment on the ruler (Slides mode) | Reach the marks one by one; move the focused mark a frame inside its zone (↑/↓ in Zen mode); delete it; write its words; its menu |
| Shift (held) | preview, timeline | Transform handles on the selected clips (a group when several); link ports on every clip |
| Alt (held) | timeline | Only the edges answer the pointer — of the clips, and of their intros and outros: trim a clip, or make an intro or an outro longer or shorter, where a block or a relation window covers the edge |
| Ctrl/⌘ (held while dragging) | preview | Free scale and rotation (no scale step — Preferences → Scale step — nor 15° steps); no snapping to other formulas |
| Alt; Ctrl/⌘+Alt (pressed while dragging) | preview | Move only horizontally or only vertically — the way the pointer has gone further from where the drag began —, still snapping along that axis to other formulas and to the grid; with Ctrl/⌘ too, without snapping. Let go of Alt and the drag is free again |
| Ctrl/⌘ + wheel; Alt + drag on empty space, or the middle button | preview | Zoom about the pointer; pan |
| Ctrl/⌘ + wheel; middle button (held) | timeline | Zoom about the pointer; drag the view both ways at once (Esc puts it back) |
| T (held while moving the mouse) | outside fields, menus and dialogs | Move the timeline’s view along time as dragging its scrollbar would, wherever the pointer is: sideways, or up and down in Zen mode; the view stays where it is when T is released |
| Shift+T (held while moving the mouse) | outside fields, menus and dialogs | Move the playhead to the time the pointer is at, at once and as it moves, wherever the pointer is: its place sideways, or up and down in Zen mode; the playhead stays where it is when the keys are released, and Shift pressed or let go while T is held changes between the playhead and the view |
| ↑/↓, ←/→ (in Zen mode) | timeline | The timeline is vertical there and the arrows follow the screen: ↑/↓ go along time and ←/→ across the tracks, → towards the ruler, where the first track is; Alt+↑/↓ moves the clip a frame, Alt+←/→ to the track on that side |
| Shift (held while dragging on the ruler) | timeline | Mark a region, its start in green and its end in red: what is created next (an animation block, a relation, a formula brought to the timeline) takes it, from its start to its end, or is not made when it does not fit there |
| I, O; Esc | outside fields, menus and dialogs | Put the start, the end of the timeline’s region at the playhead; remove the region (when Esc has nothing else to cancel or close) |
| Ctrl/⌘; Alt; Alt+Shift (held while dragging an end of a line) | preview | Along the line: longer or shorter, in the direction it had; onto the symbol under the pointer; onto the whole formula there (a compass asks the point of them). With none, the end is left free where it is dropped |
| ↑/↓ (Shift: ×10); wheel with the mouse button held on the number (Shift: ×10, Alt: ×0.1) | number boxes of the Animations and Relations panels | Nudge the value by the field's own step, up for more. The wheel writes as it turns — the preview follows —, its turns are one undo step when the button is let go, and Esc takes them back; without the button held the wheel scrolls the panel as always |
| Alt + click; Alt + drag from a formula | preview | Select a glyph of a formula, with those selected in other formulas (again: take it out; Shift: a range within the formula); a rectangle that selects the glyphs it touches, of every formula (Shift adds) |
| Enter / Esc | preview, while the new target of a shape is chosen | Make the Transform that carries the shape to what is chosen, at the playhead; leave without making it |
| ←/→, ↑/↓ (Shift: 10 px); Delete / Backspace; Enter, Esc | preview, Edit path | Move the selected anchor or handle a pixel (Shift: ten); remove the selected anchor, or bring the selected handle back to it; finish, as Done does |
| Delete / Backspace; Enter; Esc | preview, Edit curve | Remove the selected point of the line; keep the curve, as Done does; put back the curve the mode started with |
| Alt + click; Esc | preview, Add line | Put an end of the line on the symbols the preview picks, not on the whole formula; give up the end being chosen, then leave the mode |
| Ctrl/⌘+' | outside text fields and dialogs | Show or hide the grid |
| Alt+↑ / Alt+↓ | while the grid is shown | Denser / sparser grid |
| ↓ / ↑, Enter; ←/→; Home, End; a letter; Tab | menu bar | Open a menu on its first / last item; the previous or next menu; the first or last item; the next item with that initial; leave the menu |
| Ctrl/⌘+Enter | formula editor, text editor | Apply: the formula's source as typed, or the text's draft (one undo step) |
| Esc | while dragging, in dialogs and menus | Cancel the drag; close the dialog (a field's own edit first) or one level of menu |
| C; A | outside fields, menus and dialogs | Show or fold the Creator; the Animations panel — in Zen mode, open or close its half of the drawer over the Preview |
| Alt+M | outside fields, menus and dialogs | Multicamera on or off: the scene gets a camera (the Camera row of the timeline) or loses it — off only once every target camera and every camera move is deleted |
| V | outside fields, menus and dialogs, with the multicamera on | Camera view on or off: the Preview looks through the scene’s camera at the playhead, as the video does, or shows the world with the camera’s rectangles |
| F (held) | the Preview with the multicamera on, in the world view | The pointer takes the objects of the scene, as in the camera view, instead of the camera’s rectangles: they are selected, moved and transformed while the key is down, and the scene does not play |
| ? | outside text fields and dialogs | Show the keyboard shortcuts |

Clicks: Shift+click selects a range, Ctrl/⌘+click toggles, a box dragged over glyphs selects them
(Ctrl/⌘ adds); a double-click on a formula card or on a clip opens the formula editor, and on an
animation block its dialog. In the preview, Ctrl/⌘+click or Shift+click adds a clip to the selection
or takes it out, and a drag on empty space draws a rectangle that selects the clips it touches (with
Ctrl/⌘ or Shift, it adds them; Esc cancels).

## Layout

| Path | Contents |
| --- | --- |
| `app/` | The web app (Vite + React + TypeScript) |
| `app/build/` | What a build declares and checks: third-party notices, forbidden content |
| `companion/` | Optional local helper (`mfe_companion.py`) and its tests (`companion/tests/`) |
| `docs/` | Architecture (`ARCHITECTURE.md`, the index of its files in `docs/architecture/`), file format, companion protocol, roadmap |
| `examples/` | Example projects (`*.mfe.json`); four of them are part of the app (**Help → Examples**) |
| `tests/parity/` | Glyph-parity harness against ManimCE / ManimGL / MathJax |
| `tests/export/` | Export check: renders exported scenes with real Manim and compares them |
| `.claude/skills/` | The workflows of a coding agent: `mfe-change` for every change (verify, screenshots, doc reflow) and `mfe-add-object-kind` for a new kind of object |
| `CLAUDE.md`, `AGENTS.md` | The rules of the repo for a coding agent; the second points to the first |

## Optional parts

The editor works alone, in a browser. Two parts add to it. Neither is required. Chroma Lab is
recommended to everyone who installs the editor.

| Part | What it adds | How it is installed |
| --- | --- | --- |
| **Chroma Lab** (recommended) | The editor's color studio: harmonies, linked roles, contrast against the scene background, seeds, extraction from an image and animated scenes to try a palette on. A theme goes to the editor's palettes on one click. Without it, a palette is still made and edited in **Preferences → Editor palettes**. | It comes inside every build (`dist/chroma-lab/`), as a pinned and verified copy of [its own repository](https://github.com/zavden/chromalab), and opens from **Preferences → Chroma Lab…**. There is nothing else to install. |
| **Companion** | Exact Manim glyphs through LaTeX, font text, fast video encoding, rendering with a local Manim. [Without the companion](#without-the-companion) says what there is without it. | One Python file, started by hand: [Exact mode](#exact-mode-optional-companion). |

Chroma Lab was written for this editor and is kept in a repository of its own only so that both
code bases stay manageable. It also opens alone (`index.html` of its repository).

### Without the companion

The build opens with a double click on `app/dist/index.html`: no server, no companion and no
network. Keep the whole `dist/` folder together: the fonts, Chroma Lab and the license files are
beside the page. Opened so, the editor does all of its own work: formulas drawn by MathJax, the
timeline with every block, relation and path, the camera, braces, shapes and lines, projects opened
and saved in place (Chrome and Edge), the autosave, the templates, the palettes and Chroma Lab, the
examples of **Help → Examples**, and every export the browser makes by itself: Python for ManimCE
and ManimGL, video (MP4 and WebM), the frame as a PNG image, audio and the scene as a web page.

What the companion adds, and what there is without it:

| | Without the companion | With it |
| --- | --- | --- |
| The glyphs of a formula | MathJax's: the same formula, at times split into other glyphs than Manim's (below). The menu bar says `Renderer: MathJax`. | LaTeX's, which are Manim's own: `Renderer: LaTeX`. |
| Accented letters in a LaTeX text | Drawn without their accents. | Drawn; for ManimCE the editor suggests the `fontenc` line. |
| A LaTeX text with a width | Its lines are broken about where LaTeX would break them, and the text says so. | LaTeX breaks them. |
| Font text | Placeholder boxes, one a character, composed, placed, colored and animated all the same. | The outlines of the font (shaped on Linux in version 1.0). |
| Video | The browser's encoders: MP4 (H.264, AV1) and WebM (VP9). | ffmpeg too: x264, ProRes, GIF. |
| AAC sound in an MP4 | Only where the browser encodes AAC (not Chrome on Linux): WebM with Opus otherwise. | ffmpeg encodes it. |
| Render with Manim | Not offered. | The exported scene, rendered by your own Manim. |

**Where it shows in the result: Export → Python.** Inside the editor a formula drawn by MathJax is
as good as one drawn by LaTeX: it is colored, animated and saved the same. The exported scene is
another matter, because there the glyphs are Manim's, and the script has to find, when it runs,
which glyph of Manim is each glyph of the editor. It finds them by where they are (the positional
helper). That works when MathJax and LaTeX split the formula into the same number of glyphs, in
whatever order: measured on 862 formulas (the 257 templates, the 338 formulas of the author's own
projects and 267 written to cover the cases), 9 in 10 are split into the same number, and among
those the helper's pairing, replayed on each formula, was right in 771 of 777. It does not work for
the rest, and those are a short list of things:

| In the formula | MathJax draws | LaTeX (and Manim) draws |
| --- | --- | --- |
| `\cdots`, `\ldots`, `\dots`, `\vdots`, `\ddots` | one glyph | three dots |
| `\left\|…\right\|`, `vmatrix`, `\middle\|` around something tall | one bar | several pieces, stacked |
| `\iint`, `\iiint`, `\oint` | one glyph | two or three (ManimGL draws `\iint` as one) |
| `\neq`, `\ne`, `\notin`, `\not=` | one glyph | a stroke over `=` or `∈`: two |
| `\Longrightarrow`, `\iff`, `\longmapsto` | one long arrow | pieces |
| A tall `\sqrt`; `\cancel`, `\boxed`, `\underbrace`, `\xrightarrow`, `\overrightarrow` | other pieces | other pieces |

Of the formulas measured that differ, `\cdots` and its kin are the most common (24 of 79), then the
tall bars (18) and `\neq` and `\notin` (13).

What you see then, in a scene rendered by Manim (`1+2+\cdots+n` turning into
`1+2+\cdots+n=\frac{n(n+1)}{2}`, exported with no companion; ManimCE 0.22.1 and ManimGL 1.7.2): the
script reaches seven of the nine glyphs Manim made, and **the two dots it does not reach are left
out of every animation of glyphs**. A formula that comes in glyph by glyph (Write, Create, any
intro with a lag) is drawn without them: one dot of three, from the first frame to the last. A
formula that comes in whole (no intro, a fade) has its three dots, and when its glyphs go to the
next formula two of the dots stay where they were. The scene says so when it runs, once for each
such formula:

```text
Warning: Manim made 9 glyphs of a formula the editor split into 7; unmatched glyphs are not animated.
```

The export dialog cannot say it sooner. With no companion it has no LaTeX render to count against,
so every formula drawn by MathJax gets the same note there ("matched by position when the scene
runs"), the ones that will come out right and the others alike. The way out is the companion:
with it online the formulas are rendered by LaTeX, the script addresses Manim's glyphs by their
index, with no helper, and all of them are drawn ([Exact mode](#exact-mode-optional-companion)).

**Opened from disk.** Chrome gives every page opened from a file the same storage: the autosave,
your templates, your palettes and the recordings you imported live in that browser profile, shared
with any other page opened from disk, and clearing the site's data clears them. A project saved to
a file is what keeps the work. A companion started later is found by itself, but it refuses a page
opened from a file unless it was started with `--allow-file-origin` (the app shows the command), or
serves the build itself (`serve --app app/dist`).

## Development

Requirements: Node.js 22.22+, 24.15+ or 26+ (what the test tools need; `engines` in
`app/package.json`), and Google Chrome for the end-to-end tests (Playwright uses the system Chrome;
no browsers are downloaded).

```bash
cd app
npm install
npm run dev            # Vite dev server
npm run check          # typecheck + lint + unit/native tests + build (fail-fast)
```

| Command (from `app/`) | What it does | Needs |
| --- | --- | --- |
| `npm run typecheck` | `tsc -b`, the e2e specs included (Playwright does not type-check them) | |
| `npm run lint`, `npm run format:check` | ESLint, Prettier (`npm run format` writes) | |
| `npm test` | Complete isolated Vitest unit + native integration gate | Python, LaTeX, dvisvgm |
| `npm run test:unit`, `npm run test:watch:unit` | Developer unit selection, without native compilation | |
| `npm run test:native` | Required native SVG/reflow integration cases | Python, LaTeX, dvisvgm |
| `MFE_SKIP_NATIVE=1 npm test` | The unit tests alone, on purpose (a machine without LaTeX): a banner before and after the summary names the native files left out; not the full gate | |
| `npm run e2e` | Playwright on its own dev server, port 5174 (`E2E_PORT` changes it) | Chrome |
| `npm run export-check` | Exports every example and test project, renders it with ManimCE and ManimGL, compares frames with the editor (slow) | venvs, LaTeX, ffmpeg |
| `npm run parity` | Glyph-parity harness ([tests/parity/README.md](tests/parity/README.md)) | venvs, LaTeX |
| `npm run build` | Type-check and build `dist/` | |
| `npm run dist-check` | Build, then open `dist/index.html` from `file://`: the app starts, Chroma Lab loads, the license links open | Chrome |

- The e2e specs drive the app through `window.__mfe` (`src/devtools.ts`), which only the dev server
  has: they cannot run against a build. The build has its own short check
  (`app/build/dist.spec.ts`), which goes through the interface.
- The e2e suite runs its slowest specs first (`app/e2e/durations.json`; `MFE_E2E_RECORD=1 npx
  playwright test`, on a run of the whole suite, records the times again) and, on a Mac, waits
  120 s every 200 tests for a machine without a fan to cool: `MFE_E2E_COOL_EVERY=0` runs it without
  pauses, a number asks for them on another system too, and `MFE_E2E_COOL_SECONDS` sets their
  length. A spec presses `ControlOrMeta`, which is ⌘ on a Mac, and takes `test` from `e2e/test.ts`;
  a unit test reads the specs for both.
- Pure unit tests use Node; DOM tests retain jsdom and React cleanup. The native project is part of
  `npm test` and fails if its prerequisites are missing; `MFE_SKIP_NATIVE=1` leaves it out on
  purpose, and the run says so before and after its summary. Unit-only selection is useful while
  developing a feature but does not replace complete verification.
- The whole generated Python is pinned in `src/export/codegen/__tests__/__snapshots__/python/`:
  after a deliberate change to the exporter's output, `npx vitest run -u` updates the files and
  `git diff` shows what moved.
- The export check and the parity harness look for Pythons with Manim in `manim_ce/venv` and
  `manim_gl/venv` next to the repository, or in `MFE_CE_PYTHON` / `MFE_GL_PYTHON`;
  `MFE_EXPORT_ONLY=<part of a case name>` narrows the export check. They skip themselves, saying
  why, when something is missing.

The production build (`npm run build`) uses relative URLs and a classic (non-module) script, so
`app/dist/index.html` also opens from `file://` and in webviews.

### Exact mode (optional companion)

```bash
python3 companion/mfe_companion.py serve      # http://127.0.0.1:7799, needs latex + dvisvgm
python3 companion/mfe_companion.py serve --app app/dist   # … and the built app at /app/
python3 companion/mfe_companion.py health     # what this machine gives it, and how to get the rest
python3 -m unittest discover -s companion/tests
```

Font text also needs the existing Manim interpreter for each enabled target. For example, with
the neighboring checkouts used by this workspace:

```bash
python3 companion/mfe_companion.py serve --app app/dist \
  --ce-python ../manim_ce/venv/bin/python \
  --gl-python ../manim_gl/venv/bin/python
```

The fixed Pango text endpoints do not require `--allow-manim-render`. Add `--allow-file-origin`
when opening the build directly from disk.

The app detects it automatically (the menu bar then says `Renderer: LaTeX`, or `mixed` while some
formulas still use MathJax; its tooltip shows the companion's state). It accepts pages served from
`localhost` / `127.0.0.1`; for the build opened from `file://` start it with `--allow-file-origin`,
or let the companion serve the build itself with `--app app/dist` and open
`http://127.0.0.1:7799/app/` (the app then talks to the companion on its own origin, whatever the
port).
With ffmpeg installed it also encodes videos for Export → Video…: a video is written in the
temporary folder of the system while it is encoded and may take 4 GiB there, `serve --max-video-gib
N` gives another limit (a whole number from 1 to 64), and a job stops when less than 1 GiB is left
free on that disk (`TMPDIR` names another folder). "Render with Manim" is off unless you add
`--allow-manim-render` together with `--ce-python` and/or `--gl-python` (paths to Pythons with
ManimCE / ManimGL; it runs the exported code, in a bubblewrap sandbox on Linux). When something of
it is missing or fails, `health` says what this machine has (LaTeX, ffmpeg and its encoders;
Manim interpreters, font text) and, for what it lacks, the command that installs it or the option to
add. See [docs/COMPANION.md](docs/COMPANION.md), including the security notes.

### On Windows

The app, the companion and the test suites also run on Windows (checked on Windows 11 with MiKTeX).
What differs from the commands above:

| For | Install | Note |
| --- | --- | --- |
| The app and its tests | Git for Windows, Node.js, Google Chrome | The scripts (`.claude/skills/mfe-change/verify.sh`) run in Git Bash. |
| The companion | Python 3.10 or newer | The command is `python`, which is what the app shows there. |
| Exact mode | MiKTeX | It brings `latex` and `dvisvgm`. |
| Video through the companion, and the sound of Render with Manim | ffmpeg, with ffprobe, on the PATH | |
| Render with Manim, the export check | Pythons with ManimCE / ManimGL | `--ce-python` / `--gl-python`, or `MFE_CE_PYTHON` / `MFE_GL_PYTHON`. |

```bash
python companion/mfe_companion.py serve
python companion/mfe_companion.py health      # what this machine gives it, and where to get the rest
```

- `python` has to be a real interpreter. Where no Python is on the PATH, Windows answers that name
  with the alias of the Microsoft Store, which runs nothing: use the launcher of python.org
  (`py companion/mfe_companion.py serve`), `uv run companion/mfe_companion.py serve`, or the full
  name of an interpreter. The scripts and the suites take the interpreter `MFE_PYTHON` names
  (`MFE_PYTHON=py`).
- The interpreter of a virtualenv is `venv\Scripts\python.exe`. In Git Bash a Windows path is
  written with `/` or in quotes (`--ce-python C:/manim/ce/venv/Scripts/python.exe`): unquoted, the
  shell takes its backslashes away.
- There is no sandbox there (bubblewrap is Linux's): LaTeX and Render with Manim run with the
  permissions of the user, and `serve` says so when it starts. Use the companion with pages you
  trust.
- Font text is not shaped there in version 1.0 (the companion shapes it on Linux only, as above): a
  text with a font keeps its placeholder boxes.
- Stop the companion with Ctrl+C (or Ctrl+Break), or close its console window: either way it stops
  in order, and its temporary directory (`mfe-jobs-*` in `%TEMP%`) goes with it. A window closed
  while a video is encoded takes 5 s more for each such video (Windows asks ffmpeg first). A log-off
  or a shutdown with the companion still running may leave the directory.

### On macOS

The app, the companion and the test suites also run on macOS (checked on macOS 26 on Apple silicon,
with MacTeX and Homebrew). What differs from the commands above:

| For | Install | Note |
| --- | --- | --- |
| The app and its tests | Node.js, Google Chrome | |
| The companion | Python 3.10 or newer | The command is `python3`; the one macOS itself brings (the Command Line Tools') is 3.9. |
| Exact mode | MacTeX | It brings `latex` and `dvisvgm`, in `/Library/TeX/texbin`. |
| Video through the companion, and the sound of Render with Manim | ffmpeg, with ffprobe (`brew install ffmpeg`) | |
| Render with Manim, the export check | Pythons with ManimCE / ManimGL | `--ce-python` / `--gl-python`, or `MFE_CE_PYTHON` / `MFE_GL_PYTHON`. |

- The command key is ⌘ wherever this file writes Ctrl/⌘, and Alt is ⌥ (Option). The app writes the
  keys as a Mac's menus do, in its menus, tooltips and hints and in **Help → Keyboard shortcuts…**:
  ⌃, ⌥, ⇧ and ⌘ for Control, Option, Shift and Command, in that order and joined to their key
  (⇧⌘Z), and ↩ for Enter. A Ctrl+click is the secondary click there, as a click with two fingers
  is: it opens the menu of what is under it and selects, moves or writes nothing; ⌘+click is the
  click that adds to a selection.
- A laptop's keyboard has no Home and End keys, and its F keys are those of the brightness and the
  sound unless Fn is held: Fn+← and Fn+→ are Home and End, Fn+F2 is F2 and Fn+Shift+F10 is
  Shift+F10.
- A pinch on the trackpad zooms the Preview, the timeline and the stage of the text editor about
  the pointer, as far as the fingers go: twice as far apart, twice as large. ⌘ + wheel zooms them
  too, a notch at a time. A scroll — two fingers on the trackpad, the wheel of a mouse — moves the
  Preview's view, the scene following the fingers, as Alt + drag on empty space does everywhere.
- `python3` has to be 3.10 or newer: Homebrew's or python.org's. `health` says which one answered,
  on its second line.
- MacTeX puts `/Library/TeX/texbin` on the PATH of the terminals opened after it is installed; in
  one that was open before, `health` says that `latex` is not found.
- There is no sandbox there (bubblewrap is Linux's): LaTeX and Render with Manim run with the
  permissions of the user, and `serve` says so when it starts. Use the companion with pages you
  trust.
- Font text is not shaped there in version 1.0 (the companion shapes it on Linux only, as above): a
  text with a font keeps its placeholder boxes.
- Chrome encodes AAC on macOS: M4A is offered, and the MP4 of the browser carries AAC.
- Stop the companion with Ctrl+C, or close its Terminal window: either way it stops in order, and
  its temporary directory (`mfe-jobs-*` in the folder `$TMPDIR` names, under `/var/folders`) goes
  with it.

The keys of [the table above](#keyboard-shortcuts) that are others on a Mac, as **Help → Keyboard
shortcuts…** shows them there:

| Elsewhere | On a Mac | Why |
| --- | --- | --- |
| Ctrl/⌘+S, Ctrl/⌘+Alt+S | ⌘S, ⇧⌘S | Save As is ⇧⌘S there, as in every app of a Mac. |
| Ctrl/⌘+Shift+S | ⌥⌘S | Sync folder takes the key Save As leaves. |
| Ctrl/⌘+Z; Ctrl/⌘+Shift+Z or Ctrl+Y | ⌘Z; ⇧⌘Z | ⌘Y is not redo there. |
| Ctrl/⌘+Alt+H / Ctrl/⌘+Alt+V | ⌃⌥H / ⌃⌥V | With the Control key, as elsewhere: ⌥⌘H hides the other apps and ⌥⌘V pastes a style. |
| ↑/↓, Home, End; Shift+↑/↓; Ctrl/⌘+Space (←/→ too in the block view) | ↑/↓, Home, End; ⇧↑/↓; ⌘↩ (←/→ too in the block view) | ⌘+Space is Spotlight's, and Ctrl+Space changes the keyboard's language: ⌘↩ is the ⌘+click of the keyboard. |
| Enter; Shift+F10 or Menu | ↩; ⇧F10 | A Mac's keyboard has no Menu key. |
| Tab; ←/→, Home, End; Enter, Shift+F10 or Menu | Tab; ←/→, Home, End; ↩, ⇧F10 | The same. |
| Tab; ←/→; Delete / Backspace; Enter; Shift+F10 or Menu | Tab; ←/→; Delete / Backspace; ↩; ⇧F10 | The same. |
| Ctrl/⌘ + wheel; Alt + drag on empty space, or the middle button | pinch or ⌘ + wheel; scroll, ⌥ + drag on empty space, or the middle button | A pinch on the trackpad zooms, and a scroll moves the view. |
| Ctrl/⌘ + wheel; middle button (held) | pinch or ⌘ + wheel; middle button (held) | The same. |

## License

MIT: see [LICENSE](LICENSE).

### Third-party components

A build (`app/dist/`) contains open-source components under their own licenses: MIT, Apache-2.0,
BSD-3-Clause, MPL-2.0 (Mediabunny) and the SIL Open Font License 1.1 (the KaTeX fonts that MathLive
carries). `npm run build` writes their notices and license texts to
`dist/licenses/THIRD-PARTY-NOTICES.txt`, next to a copy of this project's license, and **Help →
Third-party licenses…** lists the components and opens both files. Keep the `licenses/` folder with
every copy of a build you hand over. Chroma Lab, the color studio under **Preferences**, is by the
same author and is distributed with the app under the same MIT license.

The list comes from `app/package-lock.json` and `app/build/thirdParty.ts`. A new runtime dependency
fails `npm test` until it is declared there. A build fails when a package or a font file it contains
has no notice, when a declared package is missing from it, and when its scripts carry the
identifying strings of FFmpeg, which is LGPL: that is why the app has no AAC encoder of its own.
What comes inside a package, or inside the app's own code, is listed in that file by hand.
