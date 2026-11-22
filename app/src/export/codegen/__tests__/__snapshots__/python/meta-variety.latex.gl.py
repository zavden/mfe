# Meta variety — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 400×300, 24 fps:
#     manimgl Pinned.py Pinned -w -r 400x300 --fps 24
# Every play and wait lasts a whole number of frames at 24 fps, so the video has
# exactly 96 frames, like the editor's video export.
from manimlib import *


class Pinned(Scene):
    default_camera_config = dict(background_color="#1E1E2E")

    def construct(self):
        preamble = "\n".join([r"\usepackage{cancel}", r"\newcommand{\R}{\mathbb{R}}"])

        # cancel: \cancel{x}+\R
        cancel = Tex(r"\cancel{x}+\R", additional_preamble=preamble)
        cancel.set_color("#FFFF00")
        cancel.scale(1.5).move_to([0, 0.5, 0])

        # 0 s – 0.5 s
        self.wait(0.5)
        # 0.5 s – 1.5 s: cancel write
        self.play(Write(cancel, stroke_color="#FFFF00"), run_time=1)
        # 1.5 s – 2.5 s
        self.wait(1)
        # 2.5 s – 3.5 s: cancel fade_out
        self.play(FadeOut(cancel), run_time=1)
        # 3.5 s – 4 s
        self.wait(0.5)
