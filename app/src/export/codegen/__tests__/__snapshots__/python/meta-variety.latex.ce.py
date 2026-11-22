# Meta variety — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 400×300, 24 fps:
#     manim -r 400,300 --fps 24 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 24 fps, so the video has
# exactly 96 frames, like the editor's video export.
from manim import *

# The frame is 8 units tall; its width follows the pixel aspect ratio.
config.frame_width = config.frame_height * config.pixel_width / config.pixel_height


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#1E1E2E"
        template = TexTemplate()
        template.add_to_preamble(r"\usepackage{cancel}")
        template.add_to_preamble(r"\newcommand{\R}{\mathbb{R}}")

        # cancel: \cancel{x}+\R
        cancel = MathTex(r"\cancel{x}+\R", color="#FFFF00", tex_template=template)
        cancel.scale(1.5).move_to([0, 0.5, 0])

        # 0 s – 0.5 s
        self.wait(0.5)
        # 0.5 s – 1.5 s: cancel write
        self.play(Write(cancel), run_time=1)
        # 1.5 s – 2.5 s
        self.wait(1)
        # 2.5 s – 3.5 s: cancel fade_out
        self.play(FadeOut(cancel), run_time=1)
        # 3.5 s – 4 s
        self.wait(0.5)
