# Quadratic blocks — exported by Manim Formula Editor for ManimGL 1.7.
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

        # general: ax^2+bx+c=0
        general = Tex(r"ax^2+bx+c=0")
        general.move_to([0, 1.5, 0])
        general.set_z_index(1)

        # moved: ax^2+bx=-c
        moved = Tex(r"ax^2+bx=-c")
        moved.set_color("#FFFF00")
        moved.move_to([0, -1, 0])

        # 0 s – 1 s: general write
        self.play(
            Write(VGroup(*general[:6], general[8], general[9]), stroke_color="#FFFFFF"),
            run_time=1,
        )
        # 1 s – 1.2 s
        self.wait(0.2)
        # 1.2 s – 1.8 s: general write
        self.play(Write(general[6:8], stroke_color="#FFFFFF"), run_time=0.6)
        # 1.8 s – 2 s
        self.wait(0.2)
        # 2 s – 2.5 s: general unwrite
        self.play(_Unwrite(general[8:], stroke_color="#FFFFFF"), run_time=0.5)
        # 2.5 s – 2.6 s
        self.wait(0.1)
        general_to_moved = [
            ReplacementTransform(general[:6], moved[:6]),
            ReplacementTransform(general[7], moved[8]),
        ]
        # 2.6 s – 3.5 s: general → moved
        self.play(*(_Part(a, 0, 0.75) for a in general_to_moved), run_time=0.9)
        general_out = FadeOut(VGroup(general[6]))
        # 3.5 s – 3.8 s: general → moved, general fade_out
        self.play(
            *(_Part(a, 0.75, 1) for a in general_to_moved),
            _Part(general_out, 0, 0.6),
            run_time=0.3,
        )
        # 3.8 s – 3.9 s: general fade_out
        self.play(_Part(general_out, 0.6, 0.8), run_time=0.1)
        moved_appear = Write(moved[6:8], stroke_color="#FFFF00")
        # 3.9 s – 4 s: general fade_out, moved write
        self.play(_Part(general_out, 0.8, 1), _Part(moved_appear, 0, 1 / 6), run_time=0.1)
        # 4 s – 4.5 s: moved write
        self.play(_Part(moved_appear, 1 / 6, 1), run_time=0.5)
        # 4.5 s – 5 s: moved fade_out
        self.play(FadeOut(moved), run_time=0.5)
