# Line ends — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 270 frames, like the editor's video export.
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


def _spline(line, curves):
    """Bend a straight line into a curve: `curves` gives, for each stretch of it, its two
    handles and the point it ends at, in the frame of the line's two ends — u along the line
    from its start (0) to its end (1), v across it to the left, as fractions of its length.
    ManimGL draws quadratic curves: each stretch, a cubic one, is made of eight."""
    start, end = line.get_start(), line.get_end()
    along = end - start
    across = np.array([-along[1], along[0], 0.0])
    t = np.linspace(0, 1, 9)[:, None]
    points = [start]
    for stretch in curves:
        p0 = points[-1]
        p1, p2, p3 = (start + u * along + v * across for u, v in stretch)
        at = ((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1
              + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3)
        way = (1 - t) ** 2 * (p1 - p0) + 2 * (1 - t) * t * (p2 - p1) + t ** 2 * (p3 - p2)
        for a, b, da, db in zip(at, at[1:], way, way[1:]):
            # The handle of each eighth: where the tangents at its two ends meet, when they
            # meet between them; else — the curve runs straight there, or turns its bend —
            # the handle of the quadratic nearest to the eighth.
            handle = (a + b) / 2 + 3 * (da - db) / 32
            turn = da[0] * db[1] - da[1] * db[0]
            if abs(turn) > 1e-4 * get_norm(da) * get_norm(db):
                gap = b - a
                s = (gap[0] * db[1] - gap[1] * db[0]) / turn
                u = (da[0] * gap[1] - da[1] * gap[0]) / turn
                met = a + s * da
                if s > 0 and u > 0 and get_norm(met - (a + b) / 2) <= get_norm(gap):
                    handle = met
            points += [handle, b]
    line.set_points(np.array(points))
    return line


def _dashed(line, dash_length=0.05):
    """A curve cut into dashes about `dash_length` long, counted by its own length, as
    ManimCE's DashedVMobject cuts it: dashes of one length, the first at the start of the
    curve and the last at its end."""
    alphas = np.linspace(0, 1, 9 * line.get_num_curves() + 1)
    points = np.array([line.quick_point_from_proportion(a) for a in alphas])
    lengths = np.append(0, np.cumsum(np.linalg.norm(np.diff(points, axis=0), axis=1)))
    count = max(2, int(np.ceil(lengths[-1] / dash_length / 2)))
    period = 0.5 / count + 0.5 / (count - 1)
    dashes = [
        line.get_subcurve(*np.interp(
            np.array([i * period, i * period + 0.5 / count]) * lengths[-1], lengths, alphas
        ))
        for i in range(count)
    ]
    line.clear_points()
    line.add(*dashes)
    return line


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


def _carried(line, start, end):
    """A copy of a line cut into dashes, carried to run from `start` to `end` as
    put_start_and_end_on carries a line: the dashes of a curve have no points of their own for
    it to read the two ends from."""
    carried = line.copy()
    first = carried.submobjects[0].get_start()
    was = carried.submobjects[-1].get_end() - first
    now = np.array(end) - np.array(start)
    carried.scale(np.linalg.norm(now) / np.linalg.norm(was), about_point=first)
    carried.rotate(angle_of_vector(now) - angle_of_vector(was), about_point=first)
    return carried.shift(np.array(start) - first)


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

        # poly: x^2+bx+c
        poly = Tex(r"x^2+bx+c")
        poly[3].set_color("#FFFF00")
        poly.move_to([-3.5, 2.5, 0])
        poly.set_z_index(1)

        # slope: y=mx
        slope = Tex(r"y=mx", font_size=60)
        slope.set_color("#58C4DD")
        slope.move_to([3, 1, 0])

        # arrow: arrow
        arrow = Line([-6, -1, 0], [-4, -1, 0], stroke_width=6, color="#FFFF00").add_tip(length=0.35, width=0.35)
        arrow.set_z_index(10)

        # both: double arrow
        both = _arrow(Line([-5.994245, -2.632736, 0], [-3.994245, -2.132736, 0], path_arc=60 * DEGREES, stroke_width=6, color="#FFFFFF"), tip=0.35, end="stealth", start="dot")
        both.set_z_index(9)

        # line: line
        line = Line([-0.75, 2.5, 0], [0.75, 3.5, 0], color="#FFFFFF")
        line.set_z_index(8)

        # bow: line
        bow = Line([4.5, 3.133975, 0], [6.5, 3.133975, 0], path_arc=60 * DEGREES, color="#83C167")
        bow.set_z_index(7)

        # dashes: dashed
        dashes = DashedLine([-6.494505, 0.8, 0], [-4.494505, 0.8, 0], dash_length=0.15, color="#FFFFFF")
        dashes.set_z_index(6)

        # beads: dashed
        beads = DashedLine([0.253453, -2.488709, 0], [1.753453, -2.988709, 0], path_arc=90 * DEGREES, dash_length=0.1, color="#FFFFFF")
        beads.set_z_index(5)

        # pearls: dashed
        pearls = _dashed(_spline(Line([4, -2, 0], [6, -1.6, 0], color="#58C4DD"), [((0.3, 0.4), (0.7, -0.4), (1, 0))]), dash_length=0.12)
        pearls.set_z_index(4)

        # wave: line
        wave = _spline(Line([-4.5, 0.3, 0], [-2.5, 0.3, 0], color="#FFFFFF"), [((0.3, 0.4), (0.7, -0.4), (1, 0))])
        wave.set_z_index(3)

        # swirl: arrow
        swirl = _arrow(_spline(Line([-4.112733, -1.889222, 0], [-2.512733, -1.489222, 0], stroke_width=6, color="#FC6255"), [((0.3, 0.4), (0.7, -0.4), (1, 0))]), tip=0.35, end="stealth")
        swirl.set_z_index(2)

        self.add(poly)
        self.add(slope)
        # 0 s – 0.5 s
        self.wait(0.5)
        self.add(arrow)
        self.add(both)
        self.add(line)
        self.add(bow)
        self.add(dashes)
        self.add(beads)
        self.add(pearls)
        self.add(wave)
        # 0.5 s – 1 s: swirl grow_arrow
        self.play(_TraceArrow(swirl), run_time=0.5)
        # 1 s – 1.5 s
        self.wait(0.5)
        arrow_to = Line(poly[0].get_bottom(), slope[0], buff=0.25, stroke_width=6, color="#FFFF00").add_tip(length=0.35, width=0.35)
        arrow_move = Transform(arrow, arrow_to)
        bow_move = bow.animate.put_start_and_end_on(np.array([4.5, 2.2, 0]), np.array([6.5, 3.4, 0])).build()
        # 1.5 s – 1.6 s: arrow tween, bow tween
        self.play(_Part(arrow_move, 0, 0.125), _Part(bow_move, 0, 0.2), run_time=0.1)
        dashes_move = dashes.animate.put_start_and_end_on(np.array([-6.6, 1.6, 0]), np.array([-6.2, 0.2, 0])).set_stroke(width=8).set_color("#FFFF00").build()
        # 1.6 s – 1.7 s: arrow tween, bow tween, dashes tween
        self.play(
            _Part(arrow_move, 0.125, 0.25),
            _Part(bow_move, 0.2, 0.4),
            _Part(dashes_move, 0, 1 / 7),
            run_time=0.1,
        )
        wave_move = wave.animate.put_start_and_end_on(np.array([-4.5, 0.9, 0]), np.array([-2.2, -0.4, 0])).set_stroke(width=7).build()
        # 1.7 s – 1.8 s: arrow tween, bow tween, dashes tween, wave tween
        self.play(
            _Part(arrow_move, 0.25, 0.375),
            _Part(bow_move, 0.4, 0.6),
            _Part(dashes_move, 1 / 7, 2 / 7),
            _Part(wave_move, 0, 1 / 9),
            run_time=0.1,
        )
        both_to = _arrow(Line([-6.5, 0, 0], [-4.5, -1.2, 0], path_arc=150 * DEGREES, stroke_width=3, color="#FFFFFF"), tip=0.35, end="stealth", start="dot")
        both_to.set_opacity(0.5).set_fill(opacity=0, recurse=False)
        both_move = Transform(both, both_to)
        # 1.8 s – 1.9 s: arrow tween, bow tween, dashes tween, wave tween, both tween
        self.play(
            _Part(arrow_move, 0.375, 0.5),
            _Part(bow_move, 0.6, 0.8),
            _Part(dashes_move, 2 / 7, 3 / 7),
            _Part(wave_move, 1 / 9, 2 / 9),
            _Part(both_move, 0, 1 / 7),
            run_time=0.1,
        )
        pearls_to = _carried(pearls, np.array([3.5, -2, 0]), np.array([6.8, -3.4, 0])).set_stroke(width=6).set_stroke(opacity=0.6)
        pearls_move = Transform(pearls, pearls_to)
        # 1.9 s – 2 s: arrow tween, bow tween, dashes tween, wave tween, both tween, pearls tween
        self.play(
            _Part(arrow_move, 0.5, 0.625),
            _Part(bow_move, 0.8, 1),
            _Part(dashes_move, 3 / 7, 4 / 7),
            _Part(wave_move, 2 / 9, 1 / 3),
            _Part(both_move, 1 / 7, 2 / 7),
            _Part(pearls_move, 0, 1 / 6),
            run_time=0.1,
        )
        # 2 s – 2.1 s: arrow tween, dashes tween, wave tween, both tween, pearls tween
        self.play(
            _Part(arrow_move, 0.625, 0.75),
            _Part(dashes_move, 4 / 7, 5 / 7),
            _Part(wave_move, 1 / 3, 4 / 9),
            _Part(both_move, 2 / 7, 3 / 7),
            _Part(pearls_move, 1 / 6, 1 / 3),
            run_time=0.1,
        )
        line_at = Line(poly[3].get_top(), [-1, 3.6, 0], buff=0.1, color="#FFFFFF")
        line_move = line.animate.put_start_and_end_on(line_at.get_start(), line_at.get_end()).set_stroke(width=2).build()
        # 2.1 s – 2.3 s: arrow tween, dashes tween, wave tween, both tween, pearls tween, line tween
        self.play(
            _Part(arrow_move, 0.75, 1),
            _Part(dashes_move, 5 / 7, 1),
            _Part(wave_move, 4 / 9, 2 / 3),
            _Part(both_move, 3 / 7, 5 / 7),
            _Part(pearls_move, 1 / 3, 2 / 3),
            _Part(line_move, 0, 1 / 3),
            run_time=0.2,
        )
        # 2.3 s – 2.5 s: wave tween, both tween, pearls tween, line tween
        self.play(
            _Part(wave_move, 2 / 3, 8 / 9),
            _Part(both_move, 5 / 7, 1),
            _Part(pearls_move, 2 / 3, 1),
            _Part(line_move, 1 / 3, 2 / 3),
            run_time=0.2,
        )
        beads_at = Line(slope[1].get_bottom(), [4.5, -3, 0], buff=0.2, path_arc=90 * DEGREES, color="#FFFFFF")
        beads_move = beads.animate.put_start_and_end_on(beads_at.get_start(), beads_at.get_end()).build()
        # 2.5 s – 2.6 s: wave tween, line tween, beads tween
        self.play(
            _Part(wave_move, 8 / 9, 1),
            _Part(line_move, 2 / 3, 5 / 6),
            _Part(beads_move, 0, 0.125),
            run_time=0.1,
        )
        # 2.6 s – 2.7 s: line tween, beads tween
        self.play(_Part(line_move, 5 / 6, 1), _Part(beads_move, 0.125, 0.25), run_time=0.1)
        swirl_to = _arrow(_spline(Line(poly[5:].get_bottom(), [0.5, 0.3, 0], buff=0.2, stroke_width=6, color="#FC6255"), [((0.3, 0.4), (0.7, -0.4), (1, 0))]), tip=0.35, end="stealth")
        swirl_move = Transform(swirl, swirl_to)
        # 2.7 s – 3 s: beads tween, swirl tween
        self.play(_Part(beads_move, 0.25, 0.625), _Part(swirl_move, 0, 3 / 7), run_time=0.3)
        arrow_to_2 = Line([-2, -3.6, 0], [-2, -3, 0], stroke_width=3, color="#FC6255").add_tip(length=0.15, width=0.15)
        arrow_move_2 = Transform(arrow, arrow_to_2)
        # 3 s – 3.1 s: beads tween, swirl tween, arrow tween
        self.play(
            _Part(beads_move, 0.625, 0.75),
            _Part(swirl_move, 3 / 7, 4 / 7),
            _Part(arrow_move_2, 0, 1 / 6),
            run_time=0.1,
        )
        bow_to = Line(slope[3].get_right(), [6.5, -0.5, 0], buff=0.15, path_arc=-45 * DEGREES, color="#FC6255")
        bow_move_2 = Transform(bow, bow_to)
        # 3.1 s – 3.3 s: beads tween, swirl tween, arrow tween, bow tween
        self.play(
            _Part(beads_move, 0.75, 1),
            _Part(swirl_move, 4 / 7, 6 / 7),
            _Part(arrow_move_2, 1 / 6, 0.5),
            _Part(bow_move_2, 0, 0.25),
            run_time=0.2,
        )
        # 3.3 s – 3.4 s: swirl tween, arrow tween, bow tween
        self.play(
            _Part(swirl_move, 6 / 7, 1),
            _Part(arrow_move_2, 0.5, 2 / 3),
            _Part(bow_move_2, 0.25, 0.375),
            run_time=0.1,
        )
        # 3.4 s – 3.5 s: arrow tween, bow tween
        self.play(_Part(arrow_move_2, 2 / 3, 5 / 6), _Part(bow_move_2, 0.375, 0.5), run_time=0.1)
        both_to_2 = _arrow(Line([0, -1, 0], slope.get_bottom(), buff=0.2, path_arc=-45 * DEGREES, stroke_width=3, color="#FFFFFF"), tip=0.35, end="stealth", start="dot")
        both_move_2 = Transform(both, both_to_2, rate_func=linear)
        pearls_at = Line([6.8, -3.4, 0], slope.get_corner(DR), buff=0.1, color="#FFFFFF")
        pearls_to_2 = _carried(pearls, pearls_at.get_start(), pearls_at.get_end())
        pearls_move_2 = Transform(pearls, pearls_to_2)
        # 3.5 s – 3.6 s: arrow tween, bow tween, both tween, pearls tween
        self.play(
            _Part(arrow_move_2, 5 / 6, 1),
            _Part(bow_move_2, 0.5, 0.625),
            _Part(both_move_2, 0, 0.125),
            _Part(pearls_move_2, 0, 0.2),
            run_time=0.1,
        )
        # 3.6 s – 3.9 s: bow tween, both tween, pearls tween
        self.play(
            _Part(bow_move_2, 0.625, 1),
            _Part(both_move_2, 0.125, 0.5),
            _Part(pearls_move_2, 0.2, 0.8),
            run_time=0.3,
        )
        # 3.9 s – 4 s: both tween, pearls tween
        self.play(_Part(both_move_2, 0.5, 0.625), _Part(pearls_move_2, 0.8, 1), run_time=0.1)
        line_move_2 = line.animate(rate_func=there_and_back).put_start_and_end_on(np.array([0, 3.7, 0]), np.array([2, 3.2, 0])).set_color("#83C167").build()
        # 4 s – 4.3 s: both tween, line tween
        self.play(_Part(both_move_2, 0.625, 1), _Part(line_move_2, 0, 0.3), run_time=0.3)
        # 4.3 s – 4.5 s: line tween
        self.play(_Part(line_move_2, 0.3, 0.5), run_time=0.2)
        # 4.5 s – 5 s: line tween, arrow tween
        self.play(_Part(line_move_2, 0.5, 1), arrow.animate.move_to([-1, -3.3, 0]), run_time=0.5)
        bow_to_2 = Line([5, 0, 0], [6.8, 1.5, 0], path_arc=200 * DEGREES, color="#FC6255")
        # 5 s – 5.6 s: bow tween
        self.play(Transform(bow, bow_to_2), run_time=0.6)
        # 5.6 s – 7.4 s
        self.wait(1.8)
        # 7.4 s – 8 s: bow uncreate
        self.play(Uncreate(bow), run_time=0.6)
        # 8 s – 8.5 s
        self.wait(0.5)
        # 8.5 s – 9 s: both fade_out
        self.play(FadeOut(both), run_time=0.5)
