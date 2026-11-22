# Hidden glyphs — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 120 frames, like the editor's video export.
from manim import *


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # sum: a+b=c
        sum = MathTex(r"a+b=c")
        sum.move_to([0, 1.5, 0])
        sum.set_z_index(1)

        # swap: c=a+b
        swap = MathTex(r"c=a+b", color="#83C167")
        swap.move_to([0, -1, 0])

        # 0 s – 1 s: sum write
        self.play(Write(sum[0][:3]), run_time=1)
        sum[0][3:].shift(np.array([-1, -0.5, 0]))
        # 1 s – 1.5 s: sum tween, swap fade_in
        self.play(
            sum[0][:3].animate.shift(np.array([-1, -0.5, 0])),
            FadeIn(swap[0][3]),
            run_time=0.5,
        )
        # 1.5 s – 2 s
        self.wait(0.5)
        # 2 s – 3 s: sum → swap
        self.play(
            ReplacementTransform(sum[0][0].copy(), swap[0][2]),
            ReplacementTransform(sum[0][4], swap[0][0]),
            run_time=1,
        )
        # 3 s – 3.5 s
        self.wait(0.5)
        # 3.5 s – 4 s: sum fade_out, swap fade_out
        self.play(
            FadeOut(sum[0][:3]),
            FadeOut(VGroup(swap[0][0], swap[0][2], swap[0][3])),
            run_time=0.5,
        )
