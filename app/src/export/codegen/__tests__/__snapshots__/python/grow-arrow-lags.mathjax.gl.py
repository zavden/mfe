# Grow arrow lags — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 75 frames, like the editor's video export.
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


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # arrow: arrow
        arrow = Line([-4.5, 1.760545, 0], [-1.5, 2.560545, 0], stroke_width=6, color="#FFFF00").add_tip(length=0.35, width=0.35)
        arrow.set_z_index(4)

        # bow: arrow
        bow = Line([-4.5, -1.508349, 0], [-1.5, -1.508349, 0], path_arc=70 * DEGREES, stroke_width=6, color="#58C4DD").add_tip(length=0.35, width=0.35)
        bow.set_z_index(2)

        # back: double arrow
        back = _arrow(Line([1.75, -1.9, 0], [4.25, -1.3, 0], stroke_width=6, color="#FFFF00"), tip=0.35, start="triangle")

        # both: double arrow
        both = _arrow(Line([-4.5, 0.6, 0], [-1.5, 0, 0], stroke_width=6, color="#83C167"), tip=0.35, end="stealth", start="stealth")
        both.set_z_index(3)

        # hook: double arrow
        hook = _arrow(Line([1.733757, 1.582017, 0], [4.233757, 1.082017, 0], path_arc=-100 * DEGREES, stroke_width=6, color="#FC6255"), tip=0.35, end="stealth", start="triangle")
        hook.set_z_index(1)

        self.add(back)
        arrow_in = GrowArrow(arrow, rate_func=linear, lag_ratio=0.5)
        bow_in = _TraceArrow(bow, rate_func=linear, lag_ratio=0.5)
        # 0 s – 0.2 s: arrow grow_arrow, bow grow_arrow
        self.play(_Part(arrow_in, 0, 0.2), _Part(bow_in, 0, 0.2), run_time=0.2)
        back_disappear = FadeOut(back)
        both_in = GrowArrow(both, lag_ratio=0.3)
        # 0.2 s – 0.3 s: arrow grow_arrow, bow grow_arrow, back fade_out, both grow_arrow
        self.play(
            _Part(arrow_in, 0.2, 0.3),
            _Part(bow_in, 0.2, 0.3),
            _Part(back_disappear, 0, 1 / 3),
            _Part(both_in, 0, 1 / 12),
            run_time=0.1,
        )
        hook_in = _TraceArrow(hook, rate_func=linear, lag_ratio=0.25)
        # 0.3 s – 0.5 s: arrow grow_arrow, bow grow_arrow, back fade_out, both grow_arrow, hook grow_arrow
        self.play(
            _Part(arrow_in, 0.3, 0.5),
            _Part(bow_in, 0.3, 0.5),
            _Part(back_disappear, 1 / 3, 1),
            _Part(both_in, 1 / 12, 0.25),
            _Part(hook_in, 0, 2 / 9),
            run_time=0.2,
        )
        # 0.5 s – 0.9 s: arrow grow_arrow, bow grow_arrow, both grow_arrow, hook grow_arrow
        self.play(
            _Part(arrow_in, 0.5, 0.9),
            _Part(bow_in, 0.5, 0.9),
            _Part(both_in, 0.25, 7 / 12),
            _Part(hook_in, 2 / 9, 2 / 3),
            run_time=0.4,
        )
        back_appear = GrowArrow(back, rate_func=linear, lag_ratio=0.6)
        # 0.9 s – 1 s: arrow grow_arrow, bow grow_arrow, both grow_arrow, hook grow_arrow, back grow_arrow
        self.play(
            _Part(arrow_in, 0.9, 1),
            _Part(bow_in, 0.9, 1),
            _Part(both_in, 7 / 12, 2 / 3),
            _Part(hook_in, 2 / 3, 7 / 9),
            _Part(back_appear, 0, 0.1),
            run_time=0.1,
        )
        # 1 s – 1.2 s: both grow_arrow, hook grow_arrow, back grow_arrow
        self.play(
            _Part(both_in, 2 / 3, 5 / 6),
            _Part(hook_in, 7 / 9, 1),
            _Part(back_appear, 0.1, 0.3),
            run_time=0.2,
        )
        # 1.2 s – 1.4 s: both grow_arrow, back grow_arrow
        self.play(_Part(both_in, 5 / 6, 1), _Part(back_appear, 0.3, 0.5), run_time=0.2)
        # 1.4 s – 1.9 s: back grow_arrow
        self.play(_Part(back_appear, 0.5, 1), run_time=0.5)
        # 1.9 s – 2.5 s
        self.wait(0.6)
