# LaTeX text — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 150 frames, like the editor's video export.
from manimlib import *


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # title: Completing the square: start from $x^2+bx+c$
        title = TexText(r"\parbox{124.2pt}{\centering Completing the square: start from $x^2+bx+c$\par}")
        title[13:19].set_color("#FFFF00")
        title.move_to([0, 1.2, 0])
        title.set_z_index(1)

        # sum: x^2+bx+c
        sum = Tex(r"x^2+bx+c", font_size=72)
        sum.move_to([0, -0.8, 0])

        # 0 s – 1.5 s: title write
        self.play(Write(title, stroke_color="#FFFFFF"), run_time=1.5)
        # 1.5 s – 2 s
        self.wait(0.5)
        # 2 s – 3 s: title → sum
        self.play(
            TransformFromCopy(title[29], sum[0]),
            TransformFromCopy(title[30], sum[1]),
            TransformFromCopy(title[31], sum[2]),
            TransformFromCopy(title[32], sum[3]),
            TransformFromCopy(title[33], sum[4]),
            TransformFromCopy(title[34], sum[5]),
            TransformFromCopy(title[35], sum[6]),
            run_time=1,
        )
        # 3 s – 4 s
        self.wait(1)
        # 4 s – 5 s: title fade_out, sum fade_out
        self.play(FadeOut(title), FadeOut(sum), run_time=1)
