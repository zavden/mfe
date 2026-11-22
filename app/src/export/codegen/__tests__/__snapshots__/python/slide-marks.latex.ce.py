# Slide marks — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 180 frames, like the editor's video export.
from manim import *


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # eq: a+b=c
        eq = MathTex(r"a+b=c")
        eq.set_z_index(2)

        # label: x^2
        label = MathTex(r"x^2")
        label.move_to([-2, -1.5, 0])
        label.set_z_index(1)

        # answer: y
        answer = MathTex(r"y")
        answer.move_to([2, -1.5, 0])

        # PAUSE 1 of 5 (0.00 s): Before anything

        # 0 s – 1 s: eq write
        self.play(Write(eq), run_time=1)

        # NOTE (1.00 s): Written

        # 1 s – 1.5 s
        self.wait(0.5)

        # NOTE (1.50 s): Say what a, b and c are
        #   then go on
        # PAUSE 2 of 5 (1.50 s), the exported page skips the 0.50 s wait after it

        # 1.5 s – 2 s
        self.wait(0.5)
        # 2 s – 3 s: eq tween
        self.play(eq.animate.scale(1.2).move_to([0, 1, 0]), run_time=1)

        # PAUSE 3 of 5 (3.00 s)

        # 3 s – 3.6 s: eq indicate
        self.play(Indicate(eq), run_time=0.6)
        self.add(label)

        # PAUSE 4 of 5 (3.60 s): The label is there

        # 3.6 s – 4.2 s: answer fade_in
        self.play(FadeIn(answer), run_time=0.6)
        # 4.2 s – 4.5 s
        self.wait(0.3)

        # NOTE (4.50 s): A box here
        #   self.remove(eq)  # "not code"

        # 4.5 s – 5 s
        self.wait(0.5)
        # 5 s – 6 s: eq fade_out
        self.play(FadeOut(eq), run_time=1)

        # PAUSE 5 of 5 (6.00 s)
