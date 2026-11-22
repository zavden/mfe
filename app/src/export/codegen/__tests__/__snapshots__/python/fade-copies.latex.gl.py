# Fade copies — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 180 frames, like the editor's video export.
from manimlib import *


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # sum: a+b=c
        sum = Tex(r"a+b=c")
        sum.move_to([0, 2, 0])
        sum.set_z_index(1)

        # swap: c=a+b
        swap = Tex(r"c=a+b")
        swap.set_color("#83C167")
        swap.set_z_index(2)

        # x: x
        x = Tex(r"x")
        x.set_color("#FC6255")
        x.scale(2).move_to([-3, -2, 0])
        x.set_z_index(3)

        # y: y
        y = Tex(r"y")
        y.set_color("#FFFF00")
        y.scale(2).move_to([3, -2, 0])

        # 0 s – 1 s: sum write
        self.play(Write(sum, stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 1.5 s
        self.wait(0.5)
        sum[3].set_z_index(2)
        # 1.5 s – 2.5 s: sum → swap
        self.play(
            FadeTransform(sum[0].copy().set_z_index(2), swap[2], path_arc=90 * DEGREES),
            FadeTransform(sum[1:3].copy().set_z_index(2), swap[3:], path_arc=90 * DEGREES),
            ReplacementTransform(sum[4].copy().set_z_index(2), swap[0], path_arc=90 * DEGREES),
            FadeTransform(sum[3], swap[1], path_arc=90 * DEGREES),
            run_time=1,
        )
        # 2.5 s – 3.5 s
        self.wait(1)
        # 3.5 s – 4.3 s: sum → x
        self.play(
            FadeTransform(sum[0].copy().set_z_index(3), x[0]),
            FadeTransform(sum[2].copy().set_z_index(3), x[0]),
            run_time=0.8,
        )
        # 4.3 s – 4.5 s
        self.wait(0.2)
        # 4.5 s – 5.3 s: sum → y
        self.play(
            TransformFromCopy(sum[0], y[0], rate_func=linear),
            FadeTransform(sum[4].copy(), y[0], rate_func=linear),
            run_time=0.8,
        )
        # 5.3 s – 5.5 s
        self.wait(0.2)
        # 5.5 s – 6 s: sum fade_out, swap fade_out, x fade_out, y fade_out
        self.play(
            FadeOut(VGroup(*sum[:3], sum[4])),
            FadeOut(swap),
            FadeOut(x),
            FadeOut(y),
            run_time=0.5,
        )
