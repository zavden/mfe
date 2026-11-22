# Hello: one-to-one — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 300 frames, like the editor's video export.
from manim import *


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # a1: mx+y=0
        a1 = MathTex(r"mx+y=0")
        a1[0][2].set_color("#FFFF00")
        a1.set_z_index(1)

        # f2: mx=-y
        f2 = MathTex(r"mx=-y")
        f2[0][3].set_color("#FFFF00")

        # 0 s – 1 s: a1 write
        self.play(Write(a1), run_time=1)
        # 1 s – 2 s
        self.wait(1)
        # 2 s – 3 s: a1 fade_out, a1 → f2
        self.play(
            FadeOut(a1[0][5]),
            ReplacementTransform(a1[0][:2], f2[0][:2]),
            ReplacementTransform(a1[0][4], f2[0][2]),
            ReplacementTransform(a1[0][2], f2[0][3]),
            ReplacementTransform(a1[0][3], f2[0][4]),
            run_time=1,
        )
        # 3 s – 3.2 s
        self.wait(0.2)
        # 3.2 s – 3.8 s: f2 tween
        self.play(f2.animate.move_to([0, 1.5, 0]), run_time=0.6)
        # 3.8 s – 4 s
        self.wait(0.2)
        # 4 s – 5 s: f2 fade_out
        self.play(FadeOut(f2), run_time=1)
