# Camera portrait — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 270×480, 10 fps:
#     manimgl Pinned.py Pinned -w -r 270x480 --fps 10
# Every play and wait lasts a whole number of frames at 10 fps, so the video has
# exactly 40 frames, like the editor's video export.
from manimlib import *


# Strokes thicken when the camera zooms in, as in ManimCE (ManimGL 1.7.2 or later).
_VMobject_init = VMobject.__init__


def _VMobject_init_scaled(self, *args, **kwargs):
    _VMobject_init(self, *args, **kwargs)
    self.set_scale_stroke_with_zoom(True, recurse=False)


VMobject.__init__ = _VMobject_init_scaled


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # The camera: the frame the scene is filmed through.
        cam = self.camera.frame
        cam.save_state()
        # target camera: Top
        top = Rectangle(width=1.6875, height=3).move_to([0, 2, 0])

        # short: x=1
        short = Tex(r"x=1")
        short.move_to([0, 2, 0])

        # 0 s – 0.6 s: short fade_in
        self.play(FadeIn(short), run_time=0.6)
        # 0.6 s – 1 s
        self.wait(0.4)
        # 1 s – 2 s: camera → Top
        self.play(cam.animate.replace(top), run_time=1)
        # 2 s – 2.6 s
        self.wait(0.6)
        # 2.6 s – 3.6 s: camera → start
        self.play(Restore(cam, rate_func=double_smooth), run_time=1)
        # 3.6 s – 4 s
        self.wait(0.4)
