# Arrow unwrites — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 90 frames, like the editor's video export.
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


def _arrow(line, tip=0.35, end="triangle", start=None):
    """Put a tip `tip` long at the end of a line, and one at its start when `start` names
    its shape, as ManimCE's Arrow and DoubleArrow put theirs: each with its point on the end of
    the line and along the line there, the line then running between their bases. The shapes:
    "triangle", "stealth" (ManimCE's StealthTip) and "dot"."""
    if tip <= 0:
        return line

    def make(shape, at_start=False):
        if shape == "dot":  # ManimGL makes its dot half as wide as it is asked
            return line.create_tip(at_start, length=2 * tip, tip_style=2)
        mob = line.create_tip(at_start, length=tip, width=tip)
        if shape == "stealth":
            corners = [[2, 0, 0], [-1.2, 1.6, 0], [0, 0, 0], [-1.2, -1.6, 0], [2, 0, 0]]
            mob.set_points_as_corners(tip / 3.2 * np.array(corners))
            mob.set_stroke(width=3.0)
            line.position_tip(mob, at_start)
        return mob

    first, last = line.get_start(), line.get_end()
    front = make(end)
    line.put_start_and_end_on(first, front.get_base())
    tips = [front]
    if start:
        # ManimCE makes the second tip on the line the first one has shortened, and turns
        # the first one with the line when the second shortens it.
        back = make(start, True)
        turn = angle_of_vector(last - back.get_base()) - angle_of_vector(last - first)
        front.rotate(turn, about_point=last)
        line.put_start_and_end_on(back.get_base(), front.get_base())
        line.start_tip = back
        tips.append(back)
    line.tip = front
    for mob in tips:
        mob.set_color(line.get_stroke_color())
        line.add(mob)
    return line


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

        # arrow: arrow
        arrow = Line([-4.5, 1.89246, 0], [-1.5, 2.39246, 0], stroke_width=6, color="#FFFF00").add_tip(length=0.35, width=0.35)
        arrow.set_z_index(4)

        # both: double arrow
        both = _arrow(Line([-4.5, 0.95, 0], [-1.5, 0.45, 0], stroke_width=6, color="#83C167"), tip=0.35, start="triangle")
        both.set_z_index(3)

        # bow: double arrow
        bow = _arrow(Line([-4.5, -1.324006, 0], [-1.5, -1.324006, 0], path_arc=70 * DEGREES, stroke_width=6, color="#58C4DD"), tip=0.35, end="stealth", start="stealth")
        bow.set_z_index(2)

        # back: arrow
        back = _arrow(Line([1.75, 1.283752, 0], [4.25, 2.283752, 0], stroke_width=6, color="#FC6255"), tip=0.35, end="stealth")
        back.set_z_index(1)

        # hook: arrow
        hook = _arrow(Line([1.75, -1.163389, 0], [4.25, -1.663389, 0], path_arc=-90 * DEGREES, stroke_width=6, color="#FFFF00"), tip=0.35, end="stealth")

        self.add(bow)
        self.add(back)
        self.add(hook)
        arrow_in = Write(arrow, stroke_color="#FFFF00")
        both_in = ShowCreation(both)
        # 0 s – 0.3 s: arrow write, both create
        self.play(_Part(arrow_in, 0, 0.5), _Part(both_in, 0, 0.5), run_time=0.3)
        back_disappear = _Unwrite(back, stroke_color="#FC6255")
        # 0.3 s – 0.5 s: arrow write, both create, back unwrite
        self.play(
            _Part(arrow_in, 0.5, 5 / 6),
            _Part(both_in, 0.5, 5 / 6),
            _Part(back_disappear, 0, 2 / 9),
            run_time=0.2,
        )
        hook_disappear = _Unwrite(hook, stroke_color="#FFFF00")
        # 0.5 s – 0.6 s: arrow write, both create, back unwrite, hook unwrite
        self.play(
            _Part(arrow_in, 5 / 6, 1),
            _Part(both_in, 5 / 6, 1),
            _Part(back_disappear, 2 / 9, 1 / 3),
            _Part(hook_disappear, 0, 0.1),
            run_time=0.1,
        )
        # 0.6 s – 1.2 s: back unwrite, hook unwrite
        self.play(_Part(back_disappear, 1 / 3, 1), _Part(hook_disappear, 0.1, 0.7), run_time=0.6)
        # 1.2 s – 1.3 s: hook unwrite
        self.play(_Part(hook_disappear, 0.7, 0.8), run_time=0.1)
        arrow_out = _Unwrite(arrow, stroke_color="#FFFF00")
        both_out = _Unwrite(both, stroke_color="#83C167")
        bow_out = _Unwrite(bow, stroke_color="#58C4DD", rate_func=smooth)
        # 1.3 s – 1.5 s: hook unwrite, arrow unwrite, both unwrite, bow unwrite
        self.play(
            _Part(hook_disappear, 0.8, 1),
            _Part(arrow_out, 0, 1 / 6),
            _Part(both_out, 0, 1 / 6),
            _Part(bow_out, 0, 1 / 6),
            run_time=0.2,
        )
        # 1.5 s – 1.6 s: arrow unwrite, both unwrite, bow unwrite
        self.play(
            _Part(arrow_out, 1 / 6, 0.25),
            _Part(both_out, 1 / 6, 0.25),
            _Part(bow_out, 1 / 6, 0.25),
            run_time=0.1,
        )
        back_appear = FadeIn(back)
        # 1.6 s – 2 s: arrow unwrite, both unwrite, bow unwrite, back fade_in
        self.play(
            _Part(arrow_out, 0.25, 7 / 12),
            _Part(both_out, 0.25, 7 / 12),
            _Part(bow_out, 0.25, 7 / 12),
            _Part(back_appear, 0, 0.8),
            run_time=0.4,
        )
        hook_appear = Write(hook, stroke_color="#FFFF00")
        # 2 s – 2.1 s: arrow unwrite, both unwrite, bow unwrite, back fade_in, hook write
        self.play(
            _Part(arrow_out, 7 / 12, 2 / 3),
            _Part(both_out, 7 / 12, 2 / 3),
            _Part(bow_out, 7 / 12, 2 / 3),
            _Part(back_appear, 0.8, 1),
            _Part(hook_appear, 0, 1 / 6),
            run_time=0.1,
        )
        # 2.1 s – 2.5 s: arrow unwrite, both unwrite, bow unwrite, hook write
        self.play(
            _Part(arrow_out, 2 / 3, 1),
            _Part(both_out, 2 / 3, 1),
            _Part(bow_out, 2 / 3, 1),
            _Part(hook_appear, 1 / 6, 5 / 6),
            run_time=0.4,
        )
        # 2.5 s – 2.6 s: hook write
        self.play(_Part(hook_appear, 5 / 6, 1), run_time=0.1)
        # 2.6 s – 3 s
        self.wait(0.4)
