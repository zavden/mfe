# One-to-many — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 360 frames, like the editor's video export.
from manim import *


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # f1: a+b=c
        f1 = MathTex(r"a+b=c")
        f1.move_to([0, 2, 0])
        f1.set_z_index(3)

        # f2: a: 3
        f2 = MathTex(r"a: 3")
        f2.move_to([-4, -1, 0])
        f2.set_z_index(2)

        # f3: b: 1
        f3 = MathTex(r"b: 1")
        f3.move_to([0, -1, 0])
        f3.set_z_index(1)

        # f4: c: 4
        f4 = MathTex(r"c: 4")
        f4.move_to([4, -1, 0])

        # 0 s – 1 s: f1 write
        self.play(Write(f1), run_time=1)
        # 1 s – 1.5 s
        self.wait(0.5)
        # 1.5 s – 2.5 s: f1 → f2, f2 fade_in
        self.play(ReplacementTransform(f1[0][0].copy(), f2[0][0]), FadeIn(f2[0][1:]), run_time=1)
        # 2.5 s – 3.5 s: f1 → f3, f3 fade_in
        self.play(ReplacementTransform(f1[0][2].copy(), f3[0][0]), FadeIn(f3[0][1:]), run_time=1)
        # 3.5 s – 4.5 s: f1 → f4, f4 fade_in
        self.play(ReplacementTransform(f1[0][4].copy(), f4[0][0]), FadeIn(f4[0][1:]), run_time=1)
        # 4.5 s – 5 s
        self.wait(0.5)
        # 5 s – 6 s: f1 fade_out, f2 fade_out, f3 fade_out, f4 fade_out
        self.play(FadeOut(f1), FadeOut(f2), FadeOut(f3), FadeOut(f4), run_time=1)
