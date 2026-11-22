# Zero glyphs — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 75 frames, like the editor's video export.
from manim import *


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # spacer: \quad
        spacer = MathTex(r"\quad")
        spacer.set_z_index(1)

        # sum: a+b
        sum = MathTex(r"a+b")

        # 0 s – 0.5 s
        self.wait(0.5)
        # 0.5 s – 1 s: sum fade_in
        self.play(FadeIn(sum), run_time=0.5)
        # 1 s – 2 s
        self.wait(1)
        # 2 s – 2.5 s: sum fade_out
        self.play(FadeOut(sum), run_time=0.5)
