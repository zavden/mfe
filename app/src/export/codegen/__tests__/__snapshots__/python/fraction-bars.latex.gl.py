# Fraction bars — exported by Manim Formula Editor for ManimGL 1.7.
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

    def clean_up_from_scene(self, scene):
        # Off screen, the glyphs get their shape back: some come back later.
        super().clean_up_from_scene(scene)
        self.interpolate(0)


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # ratio: \frac{a}{b}+c
        ratio = Tex(r"\frac{a}{b}+c")
        ratio.move_to([-2, 1, 0])
        ratio.set_z_index(2)

        # flipped: c=\frac{b}{a}+d
        flipped = Tex(r"c=\frac{b}{a}+d")
        flipped.set_color("#58C4DD")
        flipped.move_to([0, -0.5, 0])
        flipped.set_z_index(1)

        # xy: \frac{x}{y}=z
        xy = Tex(r"\frac{x}{y}=z")
        xy.move_to([2.5, 1, 0])

        # 0 s – 1 s: ratio write
        self.play(Write(ratio, stroke_color="#FFFFFF"), run_time=1)
        flipped_in = FadeIn(flipped[5:])
        # 1 s – 1.2 s: flipped fade_in
        self.play(_Part(flipped_in, 0, 0.4), run_time=0.2)
        ratio_to_flipped = [
            TransformFromCopy(ratio[0], flipped[4]),
            TransformFromCopy(ratio[1], flipped[3]),
            TransformFromCopy(ratio[2], flipped[2]),
            TransformFromCopy(ratio[3], flipped[1]),
            TransformFromCopy(ratio[4], flipped[0]),
        ]
        # 1.2 s – 1.5 s: flipped fade_in, ratio → flipped
        self.play(
            _Part(flipped_in, 0.4, 1),
            *(_Part(a, 0, 0.3) for a in ratio_to_flipped),
            run_time=0.3,
        )
        # 1.5 s – 2.2 s: ratio → flipped
        self.play(*(_Part(a, 0.3, 1) for a in ratio_to_flipped), run_time=0.7)
        # 2.2 s – 2.4 s
        self.wait(0.2)
        ratio_out = _Unwrite(ratio, stroke_color="#FFFFFF")
        # 2.4 s – 2.5 s: ratio unwrite
        self.play(_Part(ratio_out, 0, 1 / 6), run_time=0.1)
        flipped_to_xy = [
            ReplacementTransform(flipped[0], xy[1]),
            ReplacementTransform(flipped[4], xy[0]),
            ReplacementTransform(flipped[2], xy[2]),
        ]
        xy_in = ShowCreation(xy[3:])
        # 2.5 s – 3 s: ratio unwrite, flipped → xy, xy create
        self.play(
            _Part(ratio_out, 1 / 6, 1),
            *(_Part(a, 0, 0.5) for a in flipped_to_xy),
            _Part(xy_in, 0, 5 / 6),
            run_time=0.5,
        )
        # 3 s – 3.1 s: flipped → xy, xy create
        self.play(
            *(_Part(a, 0.5, 0.6) for a in flipped_to_xy),
            _Part(xy_in, 5 / 6, 1),
            run_time=0.1,
        )
        # 3.1 s – 3.5 s: flipped → xy
        self.play(*(_Part(a, 0.6, 1) for a in flipped_to_xy), run_time=0.4)
        # 3.5 s – 3.7 s
        self.wait(0.2)
        xy_disappear = _Unwrite(VGroup(xy[1]), stroke_color="#FFFFFF")
        # 3.7 s – 3.9 s: xy unwrite
        self.play(_Part(xy_disappear, 0, 0.4), run_time=0.2)
        flipped_out = Uncreate(VGroup(flipped[1], flipped[3], flipped[5], flipped[6]))
        # 3.9 s – 4.2 s: xy unwrite, flipped uncreate
        self.play(_Part(xy_disappear, 0.4, 1), _Part(flipped_out, 0, 0.5), run_time=0.3)
        # 4.2 s – 4.3 s: flipped uncreate
        self.play(_Part(flipped_out, 0.5, 2 / 3), run_time=0.1)
        xy_appear = Write(VGroup(xy[1]), stroke_color="#FFFFFF")
        # 4.3 s – 4.5 s: flipped uncreate, xy write
        self.play(_Part(flipped_out, 2 / 3, 1), _Part(xy_appear, 0, 0.5), run_time=0.2)
        # 4.5 s – 4.7 s: xy write
        self.play(_Part(xy_appear, 0.5, 1), run_time=0.2)
        # 4.7 s – 5 s: xy shrink_to_center
        self.play(ShrinkToCenter(xy, remover=True), run_time=0.3)
