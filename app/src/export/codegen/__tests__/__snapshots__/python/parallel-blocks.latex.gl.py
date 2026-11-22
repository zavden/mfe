# Parallel blocks — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 150 frames, like the editor's video export.
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

        # sides: a+b=c+d
        sides = Tex(r"a+b=c+d")
        sides.set_color("#58C4DD")
        sides.move_to([0, 1, 0])
        sides.set_z_index(1)

        # pair: x=y+1
        pair = Tex(r"x=y+1")
        pair.move_to([0, -1.5, 0])

        sides_in = Write(VGroup(sides[3]), stroke_color="#58C4DD")
        # 0 s – 0.5 s: sides write
        self.play(_Part(sides_in, 0, 5 / 6), run_time=0.5)
        pair_in = FadeIn(pair[:4])
        # 0.5 s – 0.6 s: sides write, pair fade_in
        self.play(_Part(sides_in, 5 / 6, 1), _Part(pair_in, 0, 0.2), run_time=0.1)
        # 0.6 s – 1 s: pair fade_in
        self.play(_Part(pair_in, 0.2, 1), run_time=0.4)
        sides_part = sides[3].animate.shift(0.4 * UP).set_color("#FFFF00").build()
        sides_appear = Write(sides[:3], stroke_color="#58C4DD")
        sides_appear_2 = Write(sides[4:], stroke_color="#58C4DD", lag_ratio=0.4)
        # 1 s – 1.5 s: sides part, sides write, sides write
        self.play(
            _Part(sides_part, 0, 0.5),
            _Part(sides_appear, 0, 0.5),
            _Part(sides_appear_2, 0, 0.5),
            run_time=0.5,
        )
        pair_disappear = FadeOut(VGroup(pair[0]))
        pair_appear = Write(VGroup(pair[4]), stroke_color="#FFFFFF")
        # 1.5 s – 2 s: sides part, sides write, sides write, pair fade_out, pair write
        self.play(
            _Part(sides_part, 0.5, 1),
            _Part(sides_appear, 0.5, 1),
            _Part(sides_appear_2, 0.5, 1),
            _Part(pair_disappear, 0, 5 / 7),
            _Part(pair_appear, 0, 5 / 7),
            run_time=0.5,
        )
        # 2 s – 2.2 s: pair fade_out, pair write
        self.play(_Part(pair_disappear, 5 / 7, 1), _Part(pair_appear, 5 / 7, 1), run_time=0.2)
        # 2.2 s – 2.7 s
        self.wait(0.5)
        pair_disappear_2 = Uncreate(VGroup(pair[2]))
        # 2.7 s – 3 s: pair uncreate
        self.play(_Part(pair_disappear_2, 0, 0.375), run_time=0.3)
        sides_disappear = _Unwrite(sides[:3], stroke_color="#58C4DD")
        sides_disappear_2 = FadeOut(sides[4:], shift=0.5 * RIGHT)
        # 3 s – 3.1 s: pair uncreate, sides unwrite, sides fade_out
        self.play(
            _Part(pair_disappear_2, 0.375, 0.5),
            _Part(sides_disappear, 0, 0.125),
            _Part(sides_disappear_2, 0, 0.125),
            run_time=0.1,
        )
        pair_appear_2 = FadeIn(VGroup(pair[0]), shift=0.5 * LEFT)
        # 3.1 s – 3.5 s: pair uncreate, sides unwrite, sides fade_out, pair fade_in
        self.play(
            _Part(pair_disappear_2, 0.5, 1),
            _Part(sides_disappear, 0.125, 0.625),
            _Part(sides_disappear_2, 0.125, 0.625),
            _Part(pair_appear_2, 0, 2 / 3),
            run_time=0.4,
        )
        # 3.5 s – 3.7 s: sides unwrite, sides fade_out, pair fade_in
        self.play(
            _Part(sides_disappear, 0.625, 0.875),
            _Part(sides_disappear_2, 0.625, 0.875),
            _Part(pair_appear_2, 2 / 3, 1),
            run_time=0.2,
        )
        # 3.7 s – 3.8 s: sides unwrite, sides fade_out
        self.play(
            _Part(sides_disappear, 0.875, 1),
            _Part(sides_disappear_2, 0.875, 1),
            run_time=0.1,
        )
        # 3.8 s – 4 s
        self.wait(0.2)
        # 4 s – 4.5 s: pair fade_out
        self.play(FadeOut(VGroup(pair[0], pair[1], pair[3], pair[4])), run_time=0.5)
        # 4.5 s – 5 s: sides fade_out
        self.play(FadeOut(VGroup(sides[3])), run_time=0.5)
