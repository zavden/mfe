# Camera portrait — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 270×480, 10 fps:
#     manim -r 270,480 --fps 10 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 10 fps, so the video has
# exactly 40 frames, like the editor's video export.
from manim import *

# The frame is 8 units tall; its width follows the pixel aspect ratio.
config.frame_width = config.frame_height * config.pixel_width / config.pixel_height


class Pinned(MovingCameraScene):
    def construct(self):
        self.camera.background_color = "#000000"

        # The camera: the frame the scene is filmed through.
        cam = self.camera.frame
        cam.save_state()
        # target camera: Top
        top = Rectangle(width=1.6875, height=3).move_to([0, 2, 0])

        # short: x=1
        short = MathTex(r"x=1")
        short.move_to([0, 2, 0])

        # 0 s – 0.6 s: short fade_in
        self.play(FadeIn(short), run_time=0.6)
        # 0.6 s – 1 s
        self.wait(0.4)
        # 1 s – 2 s: camera → Top
        self.play(cam.animate.replace(top), run_time=1)
        # 2 s – 2.6 s
        self.wait(0.600001)
        # 2.6 s – 3.6 s: camera → start
        self.play(Restore(cam, rate_func=double_smooth), run_time=1)
        # 3.6 s – 4 s
        self.wait(0.4)
