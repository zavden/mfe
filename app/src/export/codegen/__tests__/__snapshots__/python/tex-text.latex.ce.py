# LaTeX text — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 150 frames, like the editor's video export.
from manim import *


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # title: Completing the square: start from $x^2+bx+c$
        title = Tex(r"\parbox{120.45pt}{\centering Completing the square: start from $x^2+bx+c$\par}")
        title[0][13:19].set_color("#FFFF00")
        title.move_to([0, 1.2, 0])
        title.set_z_index(1)

        # sum: x^2+bx+c
        sum = MathTex(r"x^2+bx+c", font_size=72)
        sum.move_to([0, -0.8, 0])

        # 0 s – 1.5 s: title write
        self.play(Write(title), run_time=1.5)
        # 1.5 s – 2 s
        self.wait(0.5)
        # 2 s – 3 s: title → sum
        self.play(
            ReplacementTransform(title[0][29].copy(), sum[0][0]),
            ReplacementTransform(title[0][30].copy(), sum[0][1]),
            ReplacementTransform(title[0][31].copy(), sum[0][2]),
            ReplacementTransform(title[0][32].copy(), sum[0][3]),
            ReplacementTransform(title[0][33].copy(), sum[0][4]),
            ReplacementTransform(title[0][34].copy(), sum[0][5]),
            ReplacementTransform(title[0][35].copy(), sum[0][6]),
            run_time=1,
        )
        # 3 s – 4 s
        self.wait(1)
        # 4 s – 5 s: title fade_out, sum fade_out
        self.play(FadeOut(title), FadeOut(sum), run_time=1)
