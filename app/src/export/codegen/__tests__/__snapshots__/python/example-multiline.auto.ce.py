# Multi-line derivation — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 480 frames, like the editor's video export.
from manim import *


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # rows: A &= x_1 \\ &= x_2 \\ &= x_3
        rows = MathTex(r"""A &= x_1 \\
  &= x_2 \\
  &= x_3""")
        rows.scale(1.5)

        # 0 s – 1 s: rows fade_in
        self.play(FadeIn(rows[0][:4]), run_time=1)
        # 1 s – 2 s
        self.wait(1)
        # 2 s – 3 s: rows morph
        self.play(
            ReplacementTransform(rows[0][1].copy(), rows[0][4]),
            ReplacementTransform(rows[0][2].copy(), rows[0][5]),
            run_time=1,
        )
        # 3 s – 3.6 s: rows write
        self.play(Write(rows[0][6]), run_time=0.6)
        # 3.6 s – 4 s
        self.wait(0.4)
        # 4 s – 5 s: rows morph
        self.play(
            ReplacementTransform(rows[0][4].copy(), rows[0][7]),
            ReplacementTransform(rows[0][5].copy(), rows[0][8]),
            run_time=1,
        )
        # 5 s – 5.6 s: rows write
        self.play(Write(rows[0][9]), run_time=0.6)
        # 5.6 s – 6 s
        self.wait(0.4)
        rows_pivot = rows[0][8:].get_center()
        # 6 s – 6.8 s: rows part
        self.play(
            rows[0][8:].animate.scale(1.2, about_point=rows_pivot).set_color("#FFFF00"),
            run_time=0.8,
        )
        # 6.8 s – 7.4 s
        self.wait(0.6)
        # 7.4 s – 8 s: rows fade_out
        self.play(FadeOut(rows), run_time=0.6)
