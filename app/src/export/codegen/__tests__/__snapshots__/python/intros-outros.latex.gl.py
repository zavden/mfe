# Intros and outros — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 198 frames, like the editor's video export.
from manimlib import *


class _Part(Animation):
    """Plays the stretch [a0, a1] of `anim` (fractions of its run time) inside one
    self.play, so that animations that overlap in time can start and end between plays.
    The animation begins in its part with a0 == 0 and finishes (and leaves or enters the
    scene) in its part with a1 == 1; it keeps its own rate function and lag throughout."""

    def __init__(self, anim, a0, a1):
        self.anim, self.a0, self.a1 = anim, a0, a1
        super().__init__(anim.mobject, rate_func=linear)

    def begin(self):
        if self.a0 == 0:
            self.anim.begin()

    def _setup_scene(self, scene):  # ManimCE: introducers add their mobject here
        if self.a0 == 0:
            self.anim._setup_scene(scene)

    def is_introducer(self):  # ManimCE
        return self.anim.is_introducer()

    def interpolate(self, alpha):
        self.anim.interpolate(self.a0 + (self.a1 - self.a0) * alpha)

    def update_mobjects(self, dt):  # ManimCE
        self.anim.update_mobjects(dt)

    def update_reference_mobjects(self, dt, **kwargs):  # ManimGL
        self.anim.update_reference_mobjects(dt, **kwargs)

    def finish(self):
        if self.a1 == 1:
            self.anim.finish()
        else:
            self.anim.interpolate(self.a1)

    def clean_up_from_scene(self, scene):
        if self.a1 == 1:
            self.anim.clean_up_from_scene(scene)


class _Unwrite(Write):
    """ManimGL's missing Unwrite: Write over the glyphs in reverse order, played backwards.
    Write restyles a glyph as its outline only when it first crosses into the fill stage, so
    going backwards a glyph would keep the last fill it was drawn with while its outline is
    taken back; here it goes back to the outline style. A glyph that holds others (an arrow's
    line, its tips) goes before them, and they go from the last, as in ManimCE's Unwrite."""

    def __init__(self, vmobject, rate_func=linear, **kwargs):
        glyphs = vmobject.family_members_with_points()
        held = [g for g in glyphs if not any(p in glyphs for p in g.parents)]
        self.holders = [g for g in held if g.submobjects]
        super().__init__(VGroup(*reversed(held)), rate_func=lambda t: rate_func(1 - t), remover=True, **kwargs)

    def begin(self):
        for holder in self.holders:
            holder.reverse_submobjects()
        super().begin()

    def finish(self):
        super().finish()
        for holder in self.holders:
            holder.reverse_submobjects()

    def interpolate_submobject(self, submob, start, outline, alpha):
        super().interpolate_submobject(submob, start, outline, alpha)
        if alpha < 0.5:
            submob.match_style(outline)


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # circle: x^2+y^2=r^2
        circle = Tex(r"x^2+y^2=r^2")
        circle.set_color("#58C4DD")
        circle[0].set_color("#FFFF00")
        circle.set_z_index(1)

        # sum: a+b
        sum = Tex(r"a+b", font_size=60)
        sum.move_to([0, -2, 0])

        # half: \frac{1}{2}
        half = Tex(r"\frac{1}{2}")
        half.move_to([-3, 1, 0])
        half.set_z_index(1)

        # euler: e^{i\pi}
        euler = Tex(r"e^{i\pi}")
        euler.set_color("#83C167")
        euler.move_to([2, 1, 0])

        # series: \sum_{k=1}^n k
        series = Tex(r"\sum_{k=1}^n k")
        series.set_z_index(1)

        # sum: a+b
        sum_2 = Tex(r"a+b", font_size=60)
        sum_2.set_color("#FC6255")
        sum_2[1].set_color("#FFFF00")
        sum_2.move_to([3, -2, 0])

        circle_in = Write(circle, stroke_color="#58C4DD")
        # 0 s – 0.5 s: circle write
        self.play(_Part(circle_in, 0, 0.5), run_time=0.5)
        sum_in = FadeIn(sum, shift=np.array([0.5, -1, 0]), scale=1.5)
        # 0.5 s – 1 s: circle write, sum fade_in
        self.play(_Part(circle_in, 0.5, 1), _Part(sum_in, 0, 0.5), run_time=0.5)
        # 1 s – 1.4 s: sum fade_in
        self.play(_Part(sum_in, 0.5, 0.9), run_time=0.4)
        circle_out = _Unwrite(circle, stroke_color="#58C4DD")
        # 1.4 s – 1.5 s: sum fade_in, circle unwrite
        self.play(_Part(sum_in, 0.9, 1), _Part(circle_out, 0, 1 / 6), run_time=0.1)
        # 1.5 s – 1.7 s: circle unwrite
        self.play(_Part(circle_out, 1 / 6, 0.5), run_time=0.2)
        sum_out = FadeOut(sum, shift=np.array([-0.4, 0.7, 0]), scale=0.5)
        # 1.7 s – 2 s: circle unwrite, sum fade_out
        self.play(_Part(circle_out, 0.5, 1), _Part(sum_out, 0, 0.375), run_time=0.3)
        # 2 s – 2.2 s: sum fade_out
        self.play(_Part(sum_out, 0.375, 0.625), run_time=0.2)
        half_in = GrowFromCenter(half)
        # 2.2 s – 2.5 s: sum fade_out, half grow_from_center
        self.play(_Part(sum_out, 0.625, 1), _Part(half_in, 0, 0.375), run_time=0.3)
        # 2.5 s – 2.8 s: half grow_from_center
        self.play(_Part(half_in, 0.375, 0.75), run_time=0.3)
        euler_in = DrawBorderThenFill(euler, rate_func=rush_into, lag_ratio=0.25)
        # 2.8 s – 3 s: half grow_from_center, euler draw_border_then_fill
        self.play(_Part(half_in, 0.75, 1), _Part(euler_in, 0, 1 / 6), run_time=0.2)
        # 3 s – 3.3 s: euler draw_border_then_fill
        self.play(_Part(euler_in, 1 / 6, 5 / 12), run_time=0.3)
        # 3.3 s – 4 s: euler draw_border_then_fill, half shrink_to_center
        self.play(_Part(euler_in, 5 / 12, 1), ShrinkToCenter(half, remover=True), run_time=0.7)
        # 4 s – 4.1 s
        self.wait(0.1)
        euler_out = _Unwrite(euler, stroke_color="#83C167", rate_func=smooth, lag_ratio=0.3)
        # 4.1 s – 4.2 s: euler unwrite
        self.play(_Part(euler_out, 0, 0.125), run_time=0.1)
        series_in = ShowCreation(series)
        # 4.2 s – 4.9 s: euler unwrite, series create
        self.play(_Part(euler_out, 0.125, 1), _Part(series_in, 0, 0.7), run_time=0.7)
        # 4.9 s – 5 s: series create
        self.play(_Part(series_in, 0.7, 0.8), run_time=0.1)
        sum_2_in = Write(sum_2, stroke_color="#FC6255", rate_func=smooth, lag_ratio=0.3)
        # 5 s – 5.2 s: series create, sum_2 write
        self.play(_Part(series_in, 0.8, 1), _Part(sum_2_in, 0, 2 / 9), run_time=0.2)
        # 5.2 s – 5.3 s: sum_2 write
        self.play(_Part(sum_2_in, 2 / 9, 1 / 3), run_time=0.1)
        series_out = Uncreate(series, rate_func=lambda t: rush_into(1 - t))
        # 5.3 s – 5.9 s: sum_2 write, series uncreate
        self.play(_Part(sum_2_in, 1 / 3, 1), _Part(series_out, 0, 2 / 3), run_time=0.6)
        # 5.9 s – 6 s: series uncreate
        self.play(_Part(series_out, 2 / 3, 7 / 9), run_time=0.1)
        sum_2_out = Uncreate(sum_2)
        # 6 s – 6.2 s: series uncreate, sum_2 uncreate
        self.play(_Part(series_out, 7 / 9, 1), _Part(sum_2_out, 0, 1 / 3), run_time=0.2)
        # 6.2 s – 6.6 s: sum_2 uncreate
        self.play(_Part(sum_2_out, 1 / 3, 1), run_time=0.4)
