# Line blocks — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 108 frames, like the editor's video export.
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


class _TraceArrow(Animation):
    """A bent arrow drawn along its own way, from its start (Manim's GrowArrow scales the
    arrow about that point): its tip leads the stroke and turns with it, grown out of the
    start over the first quarter of the way; the tip at the start of a double arrow grows
    where it is."""

    def along(self, alpha):
        """The point of the shaft at that part of its curves, and the way it runs there."""
        points = self.starting_mobject.get_points()
        index, t = integer_interpolate(0, len(points) // 2, alpha)
        curve = points[2 * index:2 * index + 3]
        return bezier(curve)(t), bezier(curve[1:] - curve[:-1])(t)

    def interpolate_submobject(self, submob, start, alpha):
        if submob is self.mobject:
            submob.pointwise_become_partial(start, 0, alpha)
            return
        base = start.get_base()
        submob.match_points(start)
        if submob is self.mobject.tip:
            (at, way), (_, ahead) = self.along(alpha), self.along(1)
            if min(np.linalg.norm(way), np.linalg.norm(ahead)) > 1e-8:
                submob.rotate(angle_of_vector(way) - angle_of_vector(ahead), about_point=base)
            submob.shift(at - base)
            base = at
        submob.scale(min(1, 4 * alpha), about_point=base)


class _Circumscribe(ShowPassingFlash):
    """ManimCE's Circumscribe for both libraries: a rectangle around the mobject as it is when the
    animation is made, traced and untraced in one pass, on the layer `z_index` names."""

    def __init__(self, mobject, buff=0.1, color="#FFFF00", stroke_width=4, time_width=0.3,
                 z_index=0, **kwargs):
        frame = SurroundingRectangle(mobject, buff=buff, color=color, stroke_width=stroke_width)
        frame.set_z_index(z_index)
        super().__init__(frame, time_width=time_width, **kwargs)


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


class _Uncreate(Uncreate):
    """Uncreate that gives the glyphs back their shape once they are off screen, so that
    they can come back later."""

    def clean_up_from_scene(self, scene):
        super().clean_up_from_scene(scene)
        self.interpolate(0)


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # arrow: arrow
        arrow = Line([-4, 1.207556, 0], [-2, 1.707556, 0], stroke_width=6, color="#FFFF00").add_tip(length=0.35, width=0.35)
        arrow.set_z_index(5)

        # dashes: dashed
        dashes = DashedLine([1.500641, 1.5, 0], [3.500641, 1.5, 0], color="#58C4DD")
        dashes.set_z_index(4)

        # both: double arrow
        both = _arrow(Line([-0.75, -1.75, 0], [0.75, -2.25, 0], stroke_width=4.405694, color="#FFFFFF"), tip=0.35, start="triangle")
        both.set_z_index(3)

        # plain: line
        plain = Line([2, -2, 0], [4, -1, 0], color="#FC6255")
        plain.set_z_index(2)

        # bent: arrow
        bent = Line([-4, -2.043877, 0], [-2, -1.743877, 0], path_arc=60 * DEGREES, stroke_width=6, color="#83C167").add_tip(length=0.35, width=0.35)
        bent.set_z_index(1)

        # notched: arrow
        notched = _arrow(Line([-0.75, 2.8, 0], [0.75, 2.8, 0], stroke_width=6, color="#FFFFFF"), tip=0.35, end="stealth")

        self.add(plain)
        arrow_in = ShowCreation(arrow)
        dashes_in = Write(dashes, stroke_color="#58C4DD")
        both_in = FadeIn(both)
        bent_in = _TraceArrow(bent)
        notched_in = Write(notched, stroke_color="#FFFFFF")
        # 0 s – 0.3 s: arrow create, dashes write, both fade_in, bent grow_arrow, notched write
        self.play(
            _Part(arrow_in, 0, 0.6),
            _Part(dashes_in, 0, 0.5),
            _Part(both_in, 0, 0.6),
            _Part(bent_in, 0, 0.375),
            _Part(notched_in, 0, 0.5),
            run_time=0.3,
        )
        plain_circumscribe = _Circumscribe(plain, z_index=2)
        # 0.3 s – 0.5 s: arrow create, dashes write, both fade_in, bent grow_arrow, notched write, plain circumscribe
        self.play(
            _Part(arrow_in, 0.6, 1),
            _Part(dashes_in, 0.5, 5 / 6),
            _Part(both_in, 0.6, 1),
            _Part(bent_in, 0.375, 0.625),
            _Part(notched_in, 0.5, 5 / 6),
            _Part(plain_circumscribe, 0, 0.2),
            run_time=0.2,
        )
        # 0.5 s – 0.6 s: dashes write, bent grow_arrow, notched write, plain circumscribe
        self.play(
            _Part(dashes_in, 5 / 6, 1),
            _Part(bent_in, 0.625, 0.75),
            _Part(notched_in, 5 / 6, 1),
            _Part(plain_circumscribe, 0.2, 0.3),
            run_time=0.1,
        )
        # 0.6 s – 0.7 s: bent grow_arrow, plain circumscribe
        self.play(_Part(bent_in, 0.75, 0.875), _Part(plain_circumscribe, 0.3, 0.4), run_time=0.1)
        arrow_disappear = _Uncreate(arrow)
        # 0.7 s – 0.8 s: bent grow_arrow, plain circumscribe, arrow uncreate
        self.play(
            _Part(bent_in, 0.875, 1),
            _Part(plain_circumscribe, 0.4, 0.5),
            _Part(arrow_disappear, 0, 0.2),
            run_time=0.1,
        )
        notched_disappear = _Unwrite(notched, stroke_color="#FFFFFF")
        # 0.8 s – 0.9 s: plain circumscribe, arrow uncreate, notched unwrite
        self.play(
            _Part(plain_circumscribe, 0.5, 0.6),
            _Part(arrow_disappear, 0.2, 0.4),
            _Part(notched_disappear, 0, 0.2),
            run_time=0.1,
        )
        dashes_disappear = _Unwrite(dashes, stroke_color="#58C4DD")
        # 0.9 s – 1 s: plain circumscribe, arrow uncreate, notched unwrite, dashes unwrite
        self.play(
            _Part(plain_circumscribe, 0.6, 0.7),
            _Part(arrow_disappear, 0.4, 0.6),
            _Part(notched_disappear, 0.2, 0.4),
            _Part(dashes_disappear, 0, 1 / 6),
            run_time=0.1,
        )
        both_disappear = FadeOut(both)
        # 1 s – 1.1 s: plain circumscribe, arrow uncreate, notched unwrite, dashes unwrite, both fade_out
        self.play(
            _Part(plain_circumscribe, 0.7, 0.8),
            _Part(arrow_disappear, 0.6, 0.8),
            _Part(notched_disappear, 0.4, 0.6),
            _Part(dashes_disappear, 1 / 6, 1 / 3),
            _Part(both_disappear, 0, 0.2),
            run_time=0.1,
        )
        bent_disappear = _Uncreate(bent)
        # 1.1 s – 1.2 s: plain circumscribe, arrow uncreate, notched unwrite, dashes unwrite, both fade_out, bent uncreate
        self.play(
            _Part(plain_circumscribe, 0.8, 0.9),
            _Part(arrow_disappear, 0.8, 1),
            _Part(notched_disappear, 0.6, 0.8),
            _Part(dashes_disappear, 1 / 3, 0.5),
            _Part(both_disappear, 0.2, 0.4),
            _Part(bent_disappear, 0, 1 / 6),
            run_time=0.1,
        )
        # 1.2 s – 1.3 s: plain circumscribe, notched unwrite, dashes unwrite, both fade_out, bent uncreate
        self.play(
            _Part(plain_circumscribe, 0.9, 1),
            _Part(notched_disappear, 0.8, 1),
            _Part(dashes_disappear, 0.5, 2 / 3),
            _Part(both_disappear, 0.4, 0.6),
            _Part(bent_disappear, 1 / 6, 1 / 3),
            run_time=0.1,
        )
        arrow.shift(DOWN)
        VGroup(arrow, arrow.submobjects[0]).set_color("#83C167")
        # 1.3 s – 1.5 s: dashes unwrite, both fade_out, bent uncreate, arrow tween
        self.play(
            _Part(dashes_disappear, 2 / 3, 1),
            _Part(both_disappear, 0.6, 1),
            _Part(bent_disappear, 1 / 3, 2 / 3),
            run_time=0.2,
        )
        plain_flash = Flash(plain.get_center())
        plain_flash.lines.set_z_index(2)
        # 1.5 s – 1.6 s: bent uncreate, arrow tween, plain flash
        self.play(_Part(bent_disappear, 2 / 3, 5 / 6), _Part(plain_flash, 0, 0.1), run_time=0.1)
        notched_appear = FadeIn(notched)
        # 1.6 s – 1.7 s: bent uncreate, plain flash, notched fade_in
        self.play(
            _Part(bent_disappear, 5 / 6, 1),
            _Part(plain_flash, 0.1, 0.2),
            _Part(notched_appear, 0, 0.2),
            run_time=0.1,
        )
        # 1.7 s – 1.8 s: plain flash, notched fade_in
        self.play(_Part(plain_flash, 0.2, 0.3), _Part(notched_appear, 0.2, 0.4), run_time=0.1)
        arrow_appear = ShowCreation(arrow)
        # 1.8 s – 2 s: plain flash, notched fade_in, arrow create
        self.play(
            _Part(plain_flash, 0.3, 0.5),
            _Part(notched_appear, 0.4, 0.8),
            _Part(arrow_appear, 0, 0.4),
            run_time=0.2,
        )
        dashes_appear = Write(dashes, stroke_color="#58C4DD")
        both_appear = GrowArrow(both)
        # 2 s – 2.1 s: plain flash, notched fade_in, arrow create, dashes write, both grow_arrow
        self.play(
            _Part(plain_flash, 0.5, 0.6),
            _Part(notched_appear, 0.8, 1),
            _Part(arrow_appear, 0.4, 0.6),
            _Part(dashes_appear, 0, 1 / 6),
            _Part(both_appear, 0, 1 / 6),
            run_time=0.1,
        )
        bent_appear = _TraceArrow(bent)
        # 2.1 s – 2.3 s: plain flash, arrow create, dashes write, both grow_arrow, bent grow_arrow
        self.play(
            _Part(plain_flash, 0.6, 0.8),
            _Part(arrow_appear, 0.6, 1),
            _Part(dashes_appear, 1 / 6, 0.5),
            _Part(both_appear, 1 / 6, 0.5),
            _Part(bent_appear, 0, 0.25),
            run_time=0.2,
        )
        # 2.3 s – 2.4 s: plain flash, dashes write, both grow_arrow, bent grow_arrow
        self.play(
            _Part(plain_flash, 0.8, 0.9),
            _Part(dashes_appear, 0.5, 2 / 3),
            _Part(both_appear, 0.5, 2 / 3),
            _Part(bent_appear, 0.25, 0.375),
            run_time=0.1,
        )
        plain_focus = FocusOn(plain.get_center())
        plain_focus.mobject.set_z_index(6)
        # 2.4 s – 2.5 s: plain flash, dashes write, both grow_arrow, bent grow_arrow, plain focus on
        self.play(
            _Part(plain_flash, 0.9, 1),
            _Part(dashes_appear, 2 / 3, 5 / 6),
            _Part(both_appear, 2 / 3, 5 / 6),
            _Part(bent_appear, 0.375, 0.5),
            _Part(plain_focus, 0, 0.1),
            run_time=0.1,
        )
        # 2.5 s – 2.6 s: dashes write, both grow_arrow, bent grow_arrow, plain focus on
        self.play(
            _Part(dashes_appear, 5 / 6, 1),
            _Part(both_appear, 5 / 6, 1),
            _Part(bent_appear, 0.5, 0.625),
            _Part(plain_focus, 0.1, 0.2),
            run_time=0.1,
        )
        # 2.6 s – 2.9 s: bent grow_arrow, plain focus on
        self.play(_Part(bent_appear, 0.625, 1), _Part(plain_focus, 0.2, 0.5), run_time=0.3)
        # 2.9 s – 3.1 s: plain focus on
        self.play(_Part(plain_focus, 0.5, 0.7), run_time=0.2)
        notched_out = Uncreate(notched)
        # 3.1 s – 3.4 s: plain focus on, notched uncreate
        self.play(_Part(plain_focus, 0.7, 1), _Part(notched_out, 0, 0.6), run_time=0.3)
        # 3.4 s – 3.6 s: notched uncreate
        self.play(_Part(notched_out, 0.6, 1), run_time=0.2)
