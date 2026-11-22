# Hidden glyphs — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 120 frames, like the editor's video export.
from manimlib import *


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # sum: a+b=c
        sum = Tex(r"a+b=c")
        sum.move_to([0, 1.5, 0])
        sum.set_z_index(1)

        # swap: c=a+b
        swap = Tex(r"c=a+b")
        swap.set_color("#83C167")
        swap.move_to([0, -1, 0])

        # 0 s – 1 s: sum write
        self.play(Write(sum[:3], stroke_color="#FFFFFF"), run_time=1)
        sum[3:].shift(np.array([-1, -0.5, 0]))
        # 1 s – 1.5 s: sum tween, swap fade_in
        self.play(
            sum[:3].animate.shift(np.array([-1, -0.5, 0])),
            FadeIn(VGroup(swap[3])),
            run_time=0.5,
        )
        # 1.5 s – 2 s
        self.wait(0.5)
        # 2 s – 3 s: sum → swap
        self.play(
            TransformFromCopy(sum[0], swap[2]),
            ReplacementTransform(sum[4], swap[0]),
            run_time=1,
        )
        # 3 s – 3.5 s
        self.wait(0.5)
        # 3.5 s – 4 s: sum fade_out, swap fade_out
        self.play(FadeOut(sum[:3]), FadeOut(VGroup(swap[0], swap[2], swap[3])), run_time=0.5)
