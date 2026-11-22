# Arrows regrown — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 66 frames, like the editor's video export.
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

        # away: arrow
        away = Line([-5, 2.680866, 0], [-3, 2.680866, 0], path_arc=60 * DEGREES, stroke_width=6, color="#FC6255").add_tip(length=0.35, width=0.35)
        away.set_z_index(4)

        # shown: arrow
        shown = Line([-1, 2.680866, 0], [1, 2.680866, 0], path_arc=60 * DEGREES, stroke_width=6, color="#83C167").add_tip(length=0.35, width=0.35)
        shown.set_z_index(3)

        # turned: arrow
        turned = Line([2.75, 2.714359, 0], [5.25, 2.714359, 0], path_arc=60 * DEGREES, stroke_width=6, color="#58C4DD").add_tip(length=0.35, width=0.35)
        turned.set_z_index(2)

        # both: double arrow
        both = _arrow(Line([-4.75, -2.468176, 0], [-2.25, -1.968176, 0], path_arc=-80 * DEGREES, stroke_width=6, color="#FFFF00"), tip=0.35, end="stealth", start="triangle")
        both.set_z_index(1)

        # plain: arrow
        plain = Line([1.75, -2.30148, 0], [4.25, -1.80148, 0], stroke_width=6, color="#FFFFFF").add_tip(length=0.35, width=0.35)

        self.add(away)
        self.add(shown)
        self.add(turned)
        self.add(both)
        self.add(plain)
        # 0 s – 0.1 s
        self.wait(0.1)
        shown_to = Line([-1, 0.3, 0], [2, 1.4, 0], path_arc=60 * DEGREES, stroke_width=6, color="#83C167").add_tip(length=0.35, width=0.35)
        shown_move = Transform(shown, shown_to)
        # 0.1 s – 0.2 s: shown tween
        self.play(_Part(shown_move, 0, 0.25), run_time=0.1)
        # 0.2 s – 0.5 s: shown tween, away fade_out, turned fade_out, both fade_out, plain fade_out
        self.play(
            _Part(shown_move, 0.25, 1),
            FadeOut(away),
            FadeOut(turned),
            FadeOut(both),
            FadeOut(plain),
            run_time=0.3,
        )
        # 0.5 s – 0.6 s
        self.wait(0.1)
        away_to = Line([-6, 0.5, 0], [-2.5, 1.5, 0], path_arc=60 * DEGREES, stroke_width=6, color="#FC6255").add_tip(length=0.35, width=0.35)
        away.become(away_to)
        turned_to = Line([3, -0.5, 0], [6, 0.8, 0], path_arc=120 * DEGREES, stroke_width=6, color="#58C4DD").add_tip(length=0.35, width=0.35)
        turned.become(turned_to)
        both_to = _arrow(Line([-6, -3.5, 0], [-2.5, -1.5, 0], path_arc=-80 * DEGREES, stroke_width=6, color="#FFFF00"), tip=0.35, end="stealth", start="triangle")
        both.become(both_to)
        plain_to = Line([1, -3.5, 0], [4.5, -1.2, 0], stroke_width=6, color="#FFFFFF").add_tip(length=0.35, width=0.35)
        plain.become(plain_to)
        # 0.6 s – 0.9 s: shown fade_out, away tween, turned tween, both tween, plain tween
        self.play(FadeOut(shown), run_time=0.3)
        # 0.9 s – 1 s
        self.wait(0.1)
        # 1 s – 1.8 s: away grow_arrow, shown grow_arrow, turned grow_arrow, both grow_arrow, plain grow_arrow
        self.play(
            _TraceArrow(away, rate_func=linear),
            _TraceArrow(shown, rate_func=linear),
            _TraceArrow(turned, rate_func=linear),
            _TraceArrow(both, rate_func=linear),
            GrowArrow(plain, rate_func=linear),
            run_time=0.8,
        )
        # 1.8 s – 2.2 s
        self.wait(0.4)
