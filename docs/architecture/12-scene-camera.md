# Architecture §12: The scene's camera

[Index](../ARCHITECTURE.md) · Previous: [§11 Media, packages, audio](11f-media-audio.md) · Next:
[§13 The Slides mode](13-slides-mode.md)

Holds §12 *The scene's camera* (the multicamera, D190): what a project keeps of it, where the camera
is at an instant, the locked region, how each part of the app looks through it, and what the editor
does to it.

See also: [docs/FORMAT.md, SceneCamera](../FORMAT.md#scenecamera) ·
[§7 Rendering](06-07-catalogue-rendering.md#7-rendering) ·
[Rules](05c-rules-blocks-events.md#rules-enforced-by-validateproject) ·
[§8 Python](08a-export-python.md#python-exportcodegen)

---

## 12. The scene's camera

Manim films a scene through a frame, `self.camera.frame`: about the origin and 8 units tall until
something moves it. A project whose **multicamera** is on keeps that frame's story in
`Project.camera` (`SceneCamera`, format 34): the frame at 0 s (`initial`), **target cameras** —
frames with a name, set aside for the camera to go to — and **camera moves**, each with a start, a
duration, an easing and a destination: a frame of its own, a target camera, or the initial frame
again. Without the field the multicamera is off and nothing of this section applies: the app, the
exported Python and the video are those of a project that never had a camera.

A frame is a centre and a **height** (`CameraFrame`). Its width is never kept: it is the height
times the project's aspect, so that the camera has the picture's shape at every instant by
construction — Manim's moves keep it too. The zoom the app shows is `FRAME_HEIGHT / height`. In the
code `Camera` is the renderer's view (`render/types.ts`); the scene's is `SceneCamera`.

### The camera in time

`scene/camera.ts` (pure) says where the camera is. `cameraLegs(camera)` walks the moves in the order
they run (`movesInOrder`) and gives each the frame it leaves (`from`: where the camera rested), the
frame it goes to (`to`, through `destinationFrame`: a move whose target camera does not exist goes
nowhere) and the frame the camera rests in after it (`rest`: `to`, or `from` again for an easing
that ends where it started, as a tween of a clip). `cameraStateAt(camera, t, target)` is the state
at an instant: on a leg — whose window is half-open — the frame `mixFrames(from, to, α)` with `α`
the move's rate function of the project's library at the fraction of the move gone, the centre and
the height in a straight line; resting, the frame last reached, and which leg reached it. That is
the law measured in both libraries for `cam.animate.replace(rect)` and `Restore(cam)`. `cameraAt` is
that frame alone, Manim's own frame for a project without a camera. `cameraActs` says whether the
camera changes the picture at all — its initial frame is not Manim's, or a move goes somewhere else
than where the camera is —: only then do the exports differ from those of a project without one.

**The camera is not in the evaluator.** It draws nothing and moves no object, so the evaluator and
the identity of the visual project know nothing of it, and a drag of the camera rebuilds neither.
What draws a scene asks for the frame of the instant and looks through it: `cameraThrough(frame,
aspect)` (`render/camera.ts`) is the renderer's camera whose frame is that one and fills the
surface, and `FrameStyle.unclipped` draws the world around the frame instead ([§7
Rendering](06-07-catalogue-rendering.md#7-rendering)).

### The locked region

**While the camera moves, nothing else animates** (the owner's rule): the editor exports a camera
move as a play of its own. `animationWindows(project)` (`model/camera.ts`) lists every window with a
time of its own — the intros and the outros that are animations, every block, every relation —; a
clip that is simply on screen is none, and one that starts or ends without an animation only appears
or goes, which a camera move allows. `cameraRegionClashes` pairs each of them with the moves it
overlaps (touching is not overlapping), and `cameraRegionIssues` (`model/validate.ts`) makes each an
error on the animation, `camera-region`, with an identity that names the move. `validateProject`
reports them and `timingIssues` (`model/conflicts.ts`) asks them of the clips an edit touches, so
that the planner of blocks refuses a position under a camera move as it refuses any other new error.
The region is never stored: it is the moves' own windows. The other rules of a camera are in
[Rules](05c-rules-blocks-events.md#rules-enforced-by-validateproject).

**How the editor keeps it**, in three steps (the owner's choice):

1. A camera move never goes where something animates: it is added, dragged and stretched inside the
   free gap among the animations and the other moves ([Editing the camera](#editing-the-camera)).
2. An animation that is dragged or stretched does not pass a camera move. `cameraGap(project,
   window)` (`model/camera.ts`) is the free time around a window among the moves, and the planners
   narrow their limits by it: `blockLimits` for a block (`ui/animations/blockRange.ts`),
   `clampWindow` for a relation's window (`ui/relations/windowRange.ts`), `phaseLimits` for the
   inner edge of an intro or an outro (`cameraPhaseRoom`, `ui/timeline/phaseDrag.ts`). A move the
   animation overlaps already does not bound it, so that it can be taken out. `cameraMoveEdges`
   gives the edges of the moves to what looks for a place or a length — `boundaryTimes` (a new
   block's slot, the exact edge a search lands on), the lengths `planPhase` offers for an intro
   given from a menu — and to what snaps (`blockSnapPoints`, the clips' `snapPoints`). Stopped
   there, a block says so with `cameraClashSentence` («The camera moves from 4.00 s to 5.00 s, and
   nothing else animates while it does.»), which is also what the menu of an intro or an outro asks
   with before it goes on.
3. What still comes to overlap a move — a whole clip dragged until its intro is under one, a file
   written by hand — is the error `camera-region`: the block, the relation or the clip wears it as
   any other error, the Python dialog lists it (the scene it writes then plays the two together in
   slices, `_Part`, which no check against Manim covers), and the band of that move is drawn in the
   danger colour.

**The band** (`timeline/CameraRegion.tsx`): under each move, across every track, a hatched band in
the camera's colour, over the clips and their blocks and under the track headers; it lets every
press through. `cameraRegionClashes` says which moves an animation runs into.

### Through the camera

What shows the scene as its video will look asks how the project is filmed: `sceneFraming(project)`
(`scene/camera.ts`) is null for a scene filmed through Manim's still frame — one without a camera,
or with a camera that does nothing (`cameraActs`) —, and whatever draws it then does exactly what it
did before there were cameras; otherwise it is a function from a time to the camera's frame, with
the legs worked out once.

- **The video of the browser and of ffmpeg** (`export/video/frames.ts`): `frameDrawer` draws each
  frame through `cameraThrough(framing(t), width / height)` when its output has a `framing`
  (`VideoOptions`, `CompanionVideoOptions`; `videoExportRun.ts` passes it only for a camera that
  acts), and through `exportCamera` as ever when it has none. The frame has the shape of the video,
  as the still frame has. Strokes are drawn in scene units, so they thicken as the camera closes in,
  as ManimCE's do.
- **The player of the web documentation** (`embed/`): `Scene.frameAt(t)` is the box of the frame
  filmed at `t` (`cameraBox`), `Scene.draw` fits it whole into the canvas and cuts at it
  (`fitView`'s `filmed`), and `Scene.view(canvas, options, t)` is the view of that instant.
  `Scene.frame` stays the project's own frame.
- **The previews of the dialogs** — a block's (`BlockPreview.tsx`), a relation's
  (`RelationPreview.tsx`) and Preview raw (`RawPreview.tsx`) — frame what they show by its own box,
  not by a camera. Without a scene camera they cut at Manim's frame, as the video does; with the
  multicamera on (`multicameraOn(project)`, whatever the camera does) they draw unclipped
  (`FrameStyle.unclipped`): the clip may be anywhere a camera can go. The stage of the text
  composition keeps showing Manim's own frame, the one a text's start position is given in.

### The Python of a camera

`export/codegen/camera.ts`. **A camera that does nothing exports nothing**: `cameraPlan` is null
without a camera or with one that does not act, no name is reserved, and the file is, byte for byte,
the one of a project without a camera — the pinned Python of every other project holds it. Otherwise
the scene calls Manim's frame `cam`:

- **The set-up** (`prepareCamera`, before the mobjects): `cam = self.camera.frame`; the frame of 0 s
  when it is not Manim's, `cam.replace(Rectangle(width=…, height=…).move_to([x, y, 0]))`;
  `cam.save_state()` when a move goes back to it; and a `Rectangle` of the picture's shape for each
  target camera a move goes to, under a name of its own (`camera_1`), never added to the scene —
  `replace` reads its centre and its width.
- **A move** is the one op without a clip (`Op` of kind `camera`, from `CameraPlan.legs`: the moves
  that go somewhere; one that goes nowhere is not written and its time is a wait). It is a play of
  its own: `cam.animate.replace(<rectangle>)` — the same text in ManimCE and in ManimGL, and the law
  of the preview — or `Restore(cam)` back to the frame of 0 s, with `rate_func=` when the easing is
  not `smooth`. The locked region keeps other animations out of its play; a clip that only appears
  or goes during it cuts it into `_Part` slices as it cuts any animation (`cam_move = ….build()`).
- **On the frame grid** every op of a scene with a camera shares one group (`CAMERA_GROUP`) when it
  is snapped, so that an animation shorter than a frame is never stretched into a camera move it
  only touched.
- **The class** is `MovingCameraScene` in ManimCE; ManimGL's `Scene` already moves its frame.
- **Names**: `cam`, `MovingCameraScene`, `Restore` and the two of the lines below are reserved in a
  scene with a camera alone (`CAMERA_SYMBOLS`), so an object called `cam` keeps its name everywhere
  else; a scene class called as one of them gets `Scene` after it (`effectiveSceneName`, the one
  rule of the name: the generator names the class and the file of its header by it and gives it
  back, `CodegenResult.sceneName`). The dialog starts its field at that name, with a note of why,
  refuses one of the camera's names written by hand (`isValidSceneName`) and downloads the file
  under the name given back; a render with Manim asks the companion for it too.
- **Strokes in ManimGL** (`GL_STROKES_WITH_ZOOM`): ManimGL keeps a stroke as wide on the screen
  however close the camera is, ManimCE draws it in scene units, and the preview follows ManimCE. A
  ManimGL scene whose camera is ever closer or farther than Manim's frame (`CameraPlan.zooms`)
  starts, right after its import, with six lines that make every vectorized mobject scale its stroke
  with the zoom from the moment it is made (`set_scale_stroke_with_zoom`, ManimGL 1.7.2 or later:
  the export says so, `export-camera`). Marking the scene's mobjects one by one would miss those an
  animation makes (a Circumscribe's frame, a Flash's lines), and a `Transform` interpolates the mark
  away. A camera that only pans needs none of it.
- **FocusOn** sizes its disc with the constants of Manim's own frame, whatever the camera sees: the
  preview draws that, and the export warns when one runs with the camera away from that frame
  (`reportFocusOn`, `export-camera`).

**Checked against real Manim** (`tests/export`, [§8 Validation
suite](08a-export-python.md#validation-suite)): the probe records the frame every frame of the video
was filmed through and the check holds it to `cameraAt`, for every case — a project without a camera
must be filmed through Manim's still frame all along —, and the pixel comparison draws the web frame
through `sceneFraming` as the editor's own video does. The camera cases (`camera-moves`,
`camera-cuts`, `camera-portrait`) match frame by frame in ManimCE and in ManimGL; the frame of
`camera-moves` with the camera resting on its target, closer than Manim's frame, matches pixel by
pixel in both (IoU 0.995 and 0.916, coverage 1.000): the stroke of its box is as thick in the two
libraries as in the preview.

### Editing the camera

What the editor does to a camera is a set of pure functions on a project (`ui/camera/cameraOps.ts`),
shared by the timeline's Camera row, the preview's camera gestures and the panel, so that the three
agree; none writes the store.

- **The multicamera** turns on by giving the project a camera in Manim's own frame
  (`turnMulticameraOn`) and off by taking it away (`turnMulticameraOff`) — only once every target
  camera and every move is deleted, the owner's rule (`turnOffBlocker` gives the sentence a disabled
  control shows). A frame of 0 s that was moved does not hold it on.
- **The time of a move** is the free gap between the other moves and every animation of the scene
  (`busyWindows`, `freeGap`, `moveLimits`): the locked region read from the camera's side. A dragged
  move keeps its length inside its gap and a stretched edge stops at the gap's edge and at the
  shortest a move is (`clampMoveTiming`, whose `stopped` tells the wish was not granted whole); a
  new move goes where it fits nearest to the time asked — there, shorter there, or at the start of
  the next gap worth it (`findMoveSlot`); a copy of a move goes to the first gap after it with room
  for its whole length (`duplicateCameraMove`). `busyThings` gives each busy window with what it is
  — another move, or an animation and its owner —, which is what a move that stops is told about
  (`moveStopReason`). What already overlaps a move (a project in error) does not bound it, so a move
  in the wrong place can be taken out.
- **Target cameras** are named "Camera N" after the first free number (`createTargetCamera`); one
  deleted leaves the moves that went to it going where it was, each to a frame of its own
  (`deleteTargetCamera`).
- **The frame a drag edits** is the one the camera rests in at the playhead (`restingFrameOwner`):
  the frame of 0 s, the own destination of the last move that ended, or its target camera — the same
  rectangle for every move that goes to it; a move that goes and comes back leaves the owner it
  found. While a move runs there is none: the camera is on its way. `writeFrame` writes a frame
  where its owner keeps it, within the bounds of a camera.
- **The frame a move goes to** is `moveFrameOwner`'s: the move's own, its target camera's, or the
  frame of 0 s — null for a move that is gone, or whose target camera is. It is the rectangle an
  isolated move leaves alone to answer the pointer (the world view, below); `sameOwner` tells two
  owners apart.
- **Words**: a move is called by where it goes (`moveLabel`: "→ Camera 1", "→ 200 %", "→ Start");
  the zoom the app shows is Manim's frame height over the frame's, in per cent (`zoomPercent`,
  `heightOfZoom`).

### The Camera row

While the multicamera is on, the timeline has a **Camera row** between the ruler and the tracks
(`timeline/CameraRow.tsx`, `cameraTimeline.css`). `toggleMulticamera` (`ui/camera/cameraActions.ts`;
View ▸ Multicamera, Alt+M) turns it on and off as one undo step; while a target camera or a move
holds it on, it changes nothing and a notice gives `turnOffBlocker`'s sentence — the menu item is
not disabled, so that the reason can be read.

- **Where it is.** The row is `position: sticky` under the ruler, so that the tracks scroll under
  the two (`fixedRowsHeight` is what they take of the view, for whoever brings a clip into it:
  `useTimelineKeyboard`). In the vertical timeline the ruler is the last row and the Camera row the
  one before it (CSS `order`; `.tl.has-camera` hands the ruler's `margin-top: auto` to the row), the
  two held at the end of the view. The playhead's line over the tracks passes under the row, which
  draws its own (`.tl-playhead-in-lane`).
- **Its header** is a track header's on one line (the icon alone for its name in the vertical
  timeline): its name, a button that selects the camera (`{ kind: 'camera' }`: its panel), the lock
  (`SceneCamera.locked`: the camera's moves are selected but nothing of it is edited) and «Add
  camera move». The row has no name to change and no place to trade.
- **Adding a move** (`addCameraMove`): at the playhead and a second long, or over the timeline's
  region when one is marked, where `findMoveSlot` finds room — a notice says when that is later or
  shorter than asked. The move goes to a frame of its own, a copy of the one the camera rests in
  then, so it does nothing until that frame is edited; the playhead is taken to its end, where the
  camera stands on that frame, and the move is selected.
- **Its blocks** are the animation blocks' (`.tl-block.is-camera`), so the rules of a block's icon,
  of a name that does not fit and of the vertical timeline are theirs: the icon of where the move
  goes (`cameraMoveIcon`: `camera-move`, or `camera-back` for one to the start) and `moveLabel`. The
  camera's colour is `--block-camera`, a sky blue of its own in each theme. The move that is
  isolated in the Preview wears a dashed ring of the target cameras' pink (`is-isolated`), and says
  so in its name for assistive technology.
- **Its blocks under the pointer** (`timeline/cameraMoveGestures.ts`, after `blockGestures.ts`): a
  press selects a move, its body moves it and an edge stretches it, read along the screen's axis of
  time (`axis.ts`). It snaps to `moveSnapPoints` — the playhead, the edges of what it cannot run
  alongside, the ends of the clips — and to the grid; Shift suspends that. `clampMoveTiming` keeps
  it inside the gap it started in (`moveLimits`), fixed for the whole drag: a move never passes an
  animation or another move. Held short of the pointer, `cameraDrag` (timeline store) carries
  `moveStopReason` — «The outro of "a" starts here, and nothing else animates while the camera
  moves.» — to the readout that hangs under the row (`CameraDragReadout`; beside the row, in short
  lines, in the vertical timeline), and the block is marked as a stopped animation block is. One
  drag is one undo step (`trackProjectPointer`); a locked row selects and edits nothing.
- **Menus** (`timeline/CameraMenus.tsx`): a move's own — «Isolate in the Preview»
  (`isolateCameraMove`; «Stop isolating» on the move that is isolated, `stopIsolating`), which
  changes nothing of the camera and so is a locked row's too; Duplicate (`duplicateCameraMove`: the
  first gap after it with room for its whole length, `findMoveSlot` with `whole`) and Delete,
  nothing asked — and the lane's, «Add camera move here» at the time clicked (`addCameraMove(at)`, a
  second long whatever the region).
- **The keyboard.** The moves have one Tab stop, after the header's buttons: the selected move, else
  the first to run (`timeline/cameraRowNav.ts`, pure). On a focused move the arrows along time
  (`arrowOf`: ↑/↓ in the vertical timeline), Home and End take the focus and the selection to
  another move, and Enter, the Menu key or Shift+F10 open its menu. Delete, Ctrl/⌘+D and Alt+←/→
  (Shift: five frames) are the timeline's keys for what is selected (`useTimelineKeys`):
  `deleteCameraMove`, `duplicateCameraMove` and `nudgeCameraMove`, which stays on the frames, stops
  at the edge of its gap and announces where the move went or what stands there (`moveStopReason`).
  Pressed on a focused move that is not the selected one — Tab reached it —, they act on that one:
  the row selects it first. While the focus is on a move it follows the selection (onto the copy
  Ctrl/⌘+D just made), and when the focused move goes it returns to the row's Tab stop, or to «Add
  camera move» when no move is left — also when the move was deleted from its own menu, into which
  the focus had gone.
- **Selection.** A move is selected as `{ kind: 'cameraMove' }`; `Selection` (`store/uiStore.ts`)
  also has `targetCamera` and `camera` — the scene's camera itself — for the preview and the panel.
  `pruneSelection` drops one whose move, target camera or camera is gone.

### The camera's panel

`ui/camera/CameraProperties.tsx` is what the Animations panel shows for a selection of the camera
(`isCameraSelection`), one view for each of its kinds, made of the panel's own fields and sections
(tones `camera` and `target`: the camera's sky blue and a target camera's pink, `--camera-target`):

- **A move** (`cameraMove`): Start and Duration, which `retimeCameraMove` keeps inside the free gap
  the move is in, as a drag is kept; the easing with its curve; and where it goes — a select of «A
  frame of its own», «Start» and every target camera. `setCameraMoveDestination` turns a destination
  into a frame of the move's own by copying the frame it went to, so that nothing jumps. A frame of
  its own is edited there (`FrameFields`: the centre's X and Y and the zoom in per cent). A field
  commits its own number alone (`setCameraFrameField`): the command gives a drag that is still held
  up, then reads the other two from the frame its owner keeps (`ownerFrame`) — what the panel shows
  of them may be where that drag, the wheel on the field beside it, had them. `setCameraFrame`
  writes a whole frame, for the drag of its rectangle in the Preview. A hint says when a move goes
  to the frame the camera is already in, and when its easing comes back.
- **The camera** (`camera`, selected by the name of the Camera row): the frame it rests in at the
  playhead, whose fields write where `restingFrameOwner` says that frame is kept — the same rule the
  preview's drag follows —, with a line that says which it is; while a move runs there is no frame
  to set, and a button takes the playhead to the move's end. Then the list of the target cameras and
  «+ Add» (`addTargetCamera`: named after the first free number, with the frame the camera is in).
- **A target camera** (`targetCamera`): its name, its frame, the moves that go to it and «Move
  camera here» (`addCameraMove(undefined, id)`). `deleteTargetCameraAsking` asks before deleting one
  that moves go to (the owner's answer: they stay, each with a frame of its own where it was).

A locked camera (`SceneCamera.locked`) is edited nowhere: the actions refuse (`editableCamera`) and
the views show their fields disabled, with the reason. The issues of a move, of the frame of 0 s and
of a target camera are listed at the foot of their view, as a block's are.

### The Preview's world view

While the multicamera is on the Preview shows the world around the camera
(`ui/preview/PreviewPanel.tsx`). The camera is read from the store on its own — it is not part of
the visual project, so that a drag of it builds no evaluator —, the frame the canvas fills is the
stage itself (`stageAspect`, `stageLayout.ts`) and the scene is drawn `unclipped`. The Preview's own
toolbar has the multicamera's button; held on by a target camera or a move, it says so
(`aria-disabled`, its tooltip) and a press gives the notice.

- **What is drawn.** `cameraSceneAt(project, time)` (`ui/camera/cameraScene.ts`, pure) is the
  camera's scene at the playhead, in scene units: Manim's own frame, the current camera with whose
  frame it rests in (`restingFrameOwner`), the frame of 0 s, the target cameras, the frames the
  moves go to on their own with the place of their move, and the route — a leg for each move that
  goes somewhere else. `drawCameraLayer` (`preview/cameraLayer.ts`) draws it over the overlay, in
  device pixels and over halos as the guides are: the current camera in sky blue with its dash («two
  long, two short»), viewfinder corners, the cross of its centre and its name (with the target
  camera's it rests on); target cameras and own destinations in pink; the frame of 0 s while the
  camera is elsewhere; the route and the veil, each of which a preference turns off (`cameraRoute`,
  `cameraVeil` in `ui/preferences.ts`: Preferences ▸ «Show the camera’s route», «Dim what the camera
  leaves out»). A rectangle the camera rests on is not drawn apart: it is the camera's.
- **What answers.** `preview/cameraGeometry.ts` (pure) has the geometry both sides share: the name's
  plate, the corners, and `hitCameraScene`, which says which rectangle — and which part — a point of
  the canvas is on: a corner of the selected one first, then each by its name or its edge (the
  camera by the cross of its centre too). Its inside is not the camera's, and not the objects'
  either: in the world view the pointer is the camera's alone. `pointerReach`
  (`preview/pointerReach.ts`, pure; D192) says what of the scene answers the pointer — `objects`,
  `camera` or `none` — and the panel gives it to both hooks: the camera's rectangles answer in the
  world view while no mode of the preview has the canvas (`camera`: `useCameraGestures` gets the
  model, `usePreviewGestures` takes no object — no hover, no press on one, no handles, no selection
  rectangle, no glyph picked with Alt, no menu of an object; a click beside the rectangles clears
  the selection, and the line `preview-world-hint` says how the objects are reached: F held, below,
  or the camera view); a mode reads the objects its own way (`objects`, the model null); and nothing
  answers while the scene plays or the fly key is held (`none`: `useUiStore.playing`, `useFlying` of
  `timeline/useFlyKey.ts`), in any view — the pan and the zoom are the designer's all along, and a
  right-click opens the scene's own menu. What the pointer was over goes as either hook stops
  answering. `useCameraGestures` is asked before the ordinary gestures, while Alt is not held: a
  press selects (`selectionOfPiece`: `camera`, `targetCamera`, or the `cameraMove` whose frame it
  is), a drag writes the frame `frameOfPiece` names through `setCameraFrame`, inside one history
  gesture. It reuses the drag's own rules (`dragTravel`: the axis held with Shift or Alt, the
  objects and the other rectangles as snap targets — `cameraSnapBoxes` —, the grid) and `snapSize`
  for a corner, which scales about the centre (`scaledHeight`). The end of a drag reads again what
  the pointer is over: one that ends off the canvas leaves nothing hovered (the leave came while it
  held the rectangle).
- **An isolated move** (`isolatedMove` in `preview/viewStore.ts`: a way of looking, as the camera
  view is — not saved, not undone). Moves that go to the same place, each to a frame of its own,
  leave rectangles one over another, of which `hitCameraScene` only ever gave the one on top.
  `isolateCameraMove` (a move's menu on the timeline) keeps the move's id, selects the move and
  shows the world view; the panel makes of it the rectangle of the frame the move goes to —
  `pieceOfOwner(model, moveFrameOwner(camera, id))`, the camera's own while the camera rests in that
  frame — and gives it to the gestures and to the layer: `hitCameraScene` with `only` lets that
  rectangle alone answer, a press on it selects the isolated move whatever the rectangle stands for,
  and `drawCameraLayer` draws it last, over the others and the route, which it draws at `FAINT`. It
  is the selected rectangle while something of the camera, or nothing, is selected — its corners and
  the arrows are its —; objects that are selected keep the arrows. `stopIsolating` ends it: the
  button in the corner of the Preview (`preview-isolation-done`, where a mode has its own), «Stop
  isolating» in the Preview's menus (`StopIsolatingItem`) and in the move's, and the free Escape of
  `timeline/useRegionKeys.ts`, before the region goes. The panel drops it once its move goes to no
  frame (`moveFrameOwner` null: deleted, undone away) and when a project is opened
  (`onProjectLoaded`: a copy of this one has moves of the same ids). `data-camera-isolated`
  says which move it is.
- **F held** (`preview/useObjectsKey.ts`; the owner asked for a key, and left it to choose). While
  the key is down in the world view `pointerReach` is `objects` (`objectsKey`): the ordinary
  gestures answer as in the camera view and the camera's rectangles are the ones left alone; while
  the scene plays, or the fly key is held, still nothing answers. A drag of an object goes on to its
  end after the key is let go, as any gesture that runs does when the objects stop answering. The
  hook listens only while the world view is shown (elsewhere F is nobody's), in the capture phase,
  outside fields, menus and dialogs and without Ctrl, ⌘ or Alt; held, it keeps its repeats from
  everyone — with Ctrl down for a drag without snapping they would be Ctrl+F, the search of formulas
  —, and the window losing the focus ends it, as does ⌘ let go: a Mac never tells of a letter
  released while ⌘ is down. F was chosen among the letters whose Ctrl/⌘, Alt and Shift chords are
  neither the app's nor a browser's that a page cannot prevent (W, N, T, Q). `preview-world-hint`
  names the key, and `preview-objects-key-hint` says what the pointer takes while it is held
  (`data-objects-key`).
- **The arrows** on the focused frame nudge the selected rectangle (`nudgeCameraFrame`), a run of
  presses one undo step, as a clip's.
- **The selected rectangle** is `pieceOfSelection(selection, model)`: the frame the camera rests in
  is the camera's own rectangle, so a selected target camera — or move — the camera is on names the
  camera, whose corners are the ones on screen. `cameraHint` is the line the Preview shows under the
  scene for it (`preview-camera-hint`): how it is moved and scaled, the axis a drag is held to, or
  why it does not move — a locked camera, a camera on its way.
- **The menus.** A right-click on a rectangle selects it and opens its menu (`useCameraGestures`'
  `onContextMenu`, asked before the ordinary one; `preview/CameraSceneMenu.tsx`). `pieceMenuOf`
  (`cameraGeometry.ts`, pure) says what it is about: its title, the frame the rectangle shows and
  the target camera it stands for — itself, or the one the current camera rests on, the same
  rectangle. A target camera's has «Move camera here» (`addCameraMove(undefined, id)`), «Rename…»
  (`renameTargetCameraAsking`, a prompt; `targetNameIssue`) and «Delete»
  (`deleteTargetCameraAsking`, which the Delete key runs too for a selected target camera,
  `useTimelineKeys.ts`); the others have «Add target camera here», a copy of that frame, and «Add
  camera move». The menu of the scene's empty space gets the same two entries (`CameraAddItems`):
  its target camera is centred where the click was and as tall as the camera is at the playhead. A
  locked camera's entries are disabled, with the reason as their tooltip (`CAMERA_LOCKED_REASON`).
- **Fit.** `viewFitting` (`viewStore.ts`, pure) is the view that shows a list of boxes whole on a
  canvas, a margin kept free: in the world view «Fit» sets it for `cameraSceneBoxes(model)` —
  Manim's frame, the frame of 0 s, the target cameras and the moves' own frames; not the current
  camera, which is always inside them, so that the fit is the same at every instant — with 28 px of
  room for the names, and is disabled while the view is that one (`nearView`). A camera that comes
  or goes (turned on or off, undone, another project's) puts the view of the scene back to the plain
  fit, and the plain fit in the world view — `FIT_VIEW` itself, a view nobody moved — becomes the
  fit of the world once the canvas has been laid out as the stage (`frameIn`): a multicamera turned
  on shows its camera whole, with its name above it.
- **For tests and tooling** the frame says where the rectangles are (`data-camera-scene`, CSS px),
  what the pointer is over (`data-camera-hover`) and the axis a drag is held to
  (`data-camera-axis`).

### The camera view

The world view shows the camera from outside; the **camera view** (`cameraView` in
`preview/viewStore.ts`; V, the Preview's viewfinder button, View ▸ Camera view — `toggleCameraView`,
which is nobody's without a camera) shows what it films. It is a view of the Preview, not a change
of the project: nothing is saved, nothing is undone. `PreviewPanel` then lays the canvas out by the
picture's shape again, draws the scene clipped, and looks through the frame of the instant: its
render camera is `cameraThrough(cameraAt(camera, time, target), aspect)`, as a frame of the video's
is (`export/video/frames.ts`), with the designer's zoom and pan on top. No camera scene is built
(`cameraScene` is null), so no rectangle is drawn and none answers; the ordinary gestures work as
ever (`pointerReach` is `objects` there), since they read the scene through the render camera: it is
where the objects of a scene with a camera are selected and moved by the pointer.

The camera view keeps a view of its own (`through`), apart from the world's (`view`): the world's
zoom is about the scene, this one about the picture. It is kept in frames of the picture —
`viewThrough(kept, frame)` gives the view of the scene it is through a frame, its pan in units of
Manim's own frame about the frame's centre, and `keptView` is its inverse —, so that it holds while
the camera moves and zooms under it. The panel hands the gestures a view of the scene and a
`setView` that converts back; through Manim's frame the two are the same, which is every view
without the camera view. `toggleMulticamera` turning the camera on sets `cameraView` off: a new
camera comes up in the world, where it is seen and put.

### The frame of a scene with a camera

What the editor calls the frame — «Align to frame», the edges and centre lines a dragged formula
snaps to — is, in a scene with a camera, the camera's frame at the playhead (the owner's answer):
what is seen then, in the world view and in the camera view alike. `sceneFrameBox(project, time)`
(`preview/boxes.ts`) is that box — Manim's own without a camera —; `alignSelection` reads it from
the stores, and `PreviewPanel` hands it to the gestures (`frame` of their context) for `dragSnapOf`.
The grid stays the world's: its lines are the multiples of its step in scene units, and in a scene
with a camera it is drawn over all the canvas shows (`canvasBox`, `preview/gridLayer.ts`) instead of
inside Manim's frame.
