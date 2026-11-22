"""Render an exported scene with its library's own command line and record what every frame
draws (tests/export, docs/ARCHITECTURE.md §8 "Validation").

    <python> probe.py ce|gl <scene.py> <SceneName> <out.json> <W> <H> <fps> <video_dir>

The scene runs exactly as `manim -r W,H --fps F` / `manimgl -w -r WxH --fps F` would run it; hooks
on the renderer record, for every frame written to the video, each drawn vectorized family member:
its geometric bounding box, path length and area (curves sampled, so cubic CE and quadratic GL
paths compare alike), fill and stroke RGBA, stroke width, z_index and class. With every frame goes
the frame it was filmed through (`cameras`: the centre and the height of the camera's frame), for
the scenes whose camera moves.

- ManimCE (Cairo): a frame is the static image painted when the play began plus the moving
  mobjects painted on top of it, so both are recorded as Cairo paints them (a mobject that
  changed without being "moving" shows up in its stale state, as it does in the video).
- ManimGL: a frame is every family member of `scene.mobjects`, duplicates included.

Run from a scratch directory (ManimCE writes `media/`).
"""
import json
import os
import sys

import numpy as np

lib, scene_file, scene_name, out_path, W, H, FPS, video_dir = sys.argv[1:9]
from geometry import geometry

frames = []
# The frame each frame of the video was filmed through: [centre x, centre y, height].
cameras = []

if lib == "ce":
    # --silent: no question to PyPI about a newer ManimCE after each render (the check needs no
    # network, and where the answer is slow to come every case waited for it).
    sys.argv = ["manim", "render", "-r", f"{W},{H}", "--fps", FPS, "--media_dir", video_dir,
                "--disable_caching", "-v", "WARNING", "--progress_bar", "none", "--silent",
                scene_file, scene_name]
    from manim import VMobject
    from manim.__main__ import main
    from manim.renderer.cairo_renderer import CairoRenderer
    from manim.utils.family import extract_mobject_family_members

    def record(mobjects):
        out = []
        for m in extract_mobject_family_members(mobjects, use_z_index=True, only_those_with_points=True):
            if not isinstance(m, VMobject):
                continue
            geo = geometry(m.get_subpaths(), 3)
            if geo is None:
                continue
            box, length, area = geo
            out.append({
                "box": box,
                "length": length,
                "area": area,
                "fill": [float(v) for v in m.get_fill_rgbas()[0]],
                "stroke": [float(v) for v in m.get_stroke_rgbas()[0]],
                "width": float(m.get_stroke_width()),
                "z": float(m.z_index),
                "id": id(m),
                "cls": type(m).__name__,
            })
        return out

    state = {"static": [], "last": []}
    original_save = CairoRenderer.save_static_frame_data
    original_update = CairoRenderer.update_frame
    original_add = CairoRenderer.add_frame

    def save_static_frame_data(self, scene, static_mobjects):
        result = original_save(self, scene, static_mobjects)
        state["static"] = state["last"] if self.static_image is not None else []
        return result

    def update_frame(self, scene, mobjects=None, *args, **kwargs):
        shown = mobjects if mobjects else [*scene.mobjects, *scene.foreground_mobjects]
        state["last"] = record(shown)
        return original_update(self, scene, mobjects, *args, **kwargs)

    def add_frame(self, frame, num_frames=1):
        if not self.skip_animations:
            # A MovingCamera reads these two off its frame; a plain Camera keeps them itself.
            center = self.camera.frame_center
            filmed = [float(center[0]), float(center[1]), float(self.camera.frame_height)]
            for _ in range(num_frames):
                frames.append(state["static"] + state["last"])
                cameras.append(filmed)
        return original_add(self, frame, num_frames)

    CairoRenderer.save_static_frame_data = save_static_frame_data
    CairoRenderer.update_frame = update_frame
    CairoRenderer.add_frame = add_frame
    try:
        main(standalone_mode=False)
    finally:
        pass
else:
    sys.argv = ["manimgl", scene_file, scene_name, "-w", "-r", f"{W}x{H}", "--fps", FPS,
                "--video_dir", video_dir]
    from manimlib.__main__ import main
    from manimlib.mobject.types.vectorized_mobject import VMobject
    from manimlib.scene.scene import Scene

    def gl_subpaths(m):
        # The subpaths as the renderer draws them: split by the structure noted in
        # data["subpath_range"], which pointwise_become_partial keeps, not recomputed from the
        # points — a cut jump between subpaths whose handle float32 nudges off its anchor would
        # otherwise pass for a drawn curve (get_subpaths), while the renderer never draws it.
        # A subpath collapsed onto one point (what pointwise_become_partial leaves of the curves
        # before and after the portion it keeps) draws nothing either, so it is left out: in a
        # box it would pass for a stroke reaching that point.
        pts = m.get_points()
        out, start = [], 0
        for end in m.get_subpath_end_indices():
            sub = pts[start:end + 1]
            start = end + 2
            if len(sub) > 0 and np.abs(sub - sub[0]).max() > 1e-6:
                out.append(sub)
        return out

    def record(scene):
        out = []
        for top in scene.mobjects:
            for m in top.get_family():
                if not isinstance(m, VMobject) or not m.has_points():
                    continue
                geo = geometry(gl_subpaths(m), 2)
                if geo is None:
                    continue
                box, length, area = geo
                stroke = m.data.rows_or_defaults["stroke_rgba"][0]
                out.append({
                    "box": box,
                    "length": length,
                    "area": area,
                    "fill": [float(v) for v in m.uniforms["fill_rgba"]],
                    "stroke": [float(v) for v in stroke],
                    "width": float(m.get_stroke_width()),
                    "z": float(m.z_index),
                    "id": id(m),
                    "cls": type(m).__name__,
                })
        return out

    original_emit = Scene.emit_frame

    def emit_frame(self):
        if not self.skip_animations:
            frames.append(record(self))
            center = self.camera.frame.get_center()
            cameras.append([float(center[0]), float(center[1]), float(self.camera.frame.get_height())])
        return original_emit(self)

    Scene.emit_frame = emit_frame
    main()

with open(out_path, "w") as f:
    json.dump({"lib": lib, "fps": float(FPS), "frames": frames, "cameras": cameras}, f,
              separators=(",", ":"))
print(f"probe: {len(frames)} frames", file=sys.stderr)
