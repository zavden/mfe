# Slide pauses camera — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 960×540, 10 fps:
#     manimgl Pinned.py Pinned -w -r 960x540 --fps 10
# Every play and wait lasts a whole number of frames at 10 fps, so the video has
# exactly 60 frames, like the editor's video export.
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

        # sum: x+y=z
        sum = Tex(r"x+y=z")
        sum.move_to([-1, 0.5, 0])
        sum.set_z_index(1)

        # box: box
        box = Rectangle(width=1.2, height=0.8, color="#58C4DD")
        box.move_to([2, -1, 0])

        # 0 s – 1 s: sum fade_in
        self.play(FadeIn(sum), run_time=1)

        # PAUSE 1 of 6 (1.00 s)

        # 1 s – 1.2 s
        self.wait(0.2)

        # NOTE (1.20 s): Point at x

        # 1.2 s – 1.5 s
        self.wait(0.3)

        # PAUSE 2 of 6 (1.50 s)

        # 1.5 s – 3 s: camera → (1, 0), 160 %
        self.play(
            cam.animate.replace(Rectangle(width=8.888889, height=5).move_to([1, 0, 0])),
            run_time=1.5,
        )
        self.add(box)

        # PAUSE 3 of 6 (3.00 s): The box is there

        # 3 s – 3.5 s
        self.wait(0.5)

        # NOTE (3.50 s): Zoom on the box later

        # 3.5 s – 4 s
        self.wait(0.5)

        # PAUSE 4 of 6 (4.00 s)

        # 4 s – 5 s: camera → start
        self.play(Restore(cam, rate_func=linear), run_time=1)
        # 5 s – 5.5 s
        self.wait(0.5)

        # PAUSE 5 of 6 (5.50 s)

        # 5.5 s – 6 s
        self.wait(0.5)

        # PAUSE 6 of 6 (6.00 s)
