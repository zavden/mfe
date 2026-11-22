# Loose arcs — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 60 frames, like the editor's video export.
from manim import *


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # wide: line
        wide = Line([-4.5, 2.433013, 0], [-1.5, 2.433013, 0], path_arc=120 * DEGREES, color="#FFFF00")
        wide.set_z_index(3)

        # arrow: arrow
        arrow = Arrow([1.75, 1.840602, 0], [4.25, 2.340602, 0], buff=0, path_arc=60 * DEGREES, color="#83C167")
        arrow.set_z_index(2)

        # both: double arrow
        both = DoubleArrow([-4.466952, -0.844461, 0], [-1.466952, -1.344461, 0], buff=0, path_arc=120 * DEGREES, color="#58C4DD", tip_shape_end=StealthTip)
        both.set_z_index(1)

        # hook: arrow
        hook = Arrow([2.00611, -2.258856, 0], [4.00611, -1.258856, 0], buff=0, path_arc=-150 * DEGREES, color="#FC6255", tip_shape=ArrowCircleFilledTip)

        # 0 s – 0.4 s: wide fade_in, arrow fade_in, both fade_in, hook fade_in
        self.play(
            FadeIn(wide, rate_func=linear),
            FadeIn(arrow, rate_func=linear),
            FadeIn(both, rate_func=linear),
            FadeIn(hook, rate_func=linear),
            run_time=0.4,
        )
        # 0.4 s – 0.6 s
        self.wait(0.2)
        # 0.6 s – 1.2 s: arrow tween
        self.play(arrow.animate(rate_func=linear).move_to([3.5, 1.5, 0]), run_time=0.6)
        # 1.2 s – 1.6 s
        self.wait(0.4)
        # 1.6 s – 2 s: wide fade_out, arrow fade_out, both fade_out, hook fade_out
        self.play(
            FadeOut(wide, rate_func=linear),
            FadeOut(arrow, rate_func=linear),
            FadeOut(both, rate_func=linear),
            FadeOut(hook, rate_func=linear),
            run_time=0.4,
        )
