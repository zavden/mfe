# Curves — exported by Manim Formula Editor for ManimGL 1.7.
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

        # poly: x^2+bx+c
        poly = Tex(r"x^2+bx+c")
        poly[3].set_color("#FFFF00")
        poly.move_to([-3.5, 1.5, 0])
        poly.set_z_index(1)

        # slope: y=mx
        slope = Tex(r"y=mx", font_size=60)
        slope.set_color("#58C4DD")
        slope.move_to([3, -0.5, 0])

        # free: line
        free = Line([-5.7432, -0.767028, 0], [-3.2432, -1.517028, 0], path_arc=150 * DEGREES, color="#FFFFFF", stroke_width=8)
        free.set_z_index(10)

        # bow: double arrow
        bow = _arrow(_spline(Line([-2.433109, -3.585689, 0], [0.566891, -3.085689, 0], stroke_width=6, color="#FFFFFF"), [((0.25, 0.5), (0.75, 0.166667), (1, 0))]), tip=0.35, end="stealth", start="dot")
        bow.set_z_index(8)

        # corner: line
        corner = _spline(Line([4, 1.309613, 0], [6, 2.309613, 0], color="#58C4DD"), [((0.116667, 0.1), (0.233333, 0.2), (0.35, 0.3)), ((0.5, 0.45), (0.9, 0.35), (1, 0))])
        corner.set_z_index(6)

        # dot: arrow
        dot = Line([-6.25, -3.5, 0], [-4.75, -3.5, 0], stroke_width=6, color="#FFFFFF").add_tip(length=0.7, tip_style=2)
        dot.set_z_index(5)

        # notched: double arrow
        notched = _arrow(Line([6.3, -2.75, 0], [6.3, -1.25, 0], stroke_width=5.3125, color="#FFFFFF"), tip=0.35, end="stealth", start="stealth")
        notched.set_z_index(4)

        # short: arrow
        short = Line([5.174618, -3.120909, 0], [5.774618, -2.820909, 0], path_arc=80 * DEGREES, stroke_width=3.354102, color="#FFFFFF").add_tip(length=0.33541, tip_style=2)
        short.set_z_index(3)

        # twice: arrow
        twice = Line([-6.451782, 0.012904, 0], [-4.957691, -0.983156, 0], buff=0.245472, path_arc=100 * DEGREES, stroke_width=6, color="#FFFFFF").add_tip(length=0.25, width=0.25)
        twice.set_z_index(2)

        # arc: arrow, built on poly and slope where its clip starts

        # both: double arrow, built on poly where its clip starts

        # dashes: dashed, built on slope where its clip starts

        # clockwise: line, built on poly and slope where its clip starts

        # beads: dashed, built on poly where its clip starts

        # wave: arrow, built on poly and slope where its clip starts

        # tiny: double arrow
        tiny = _arrow(_spline(Line([5.275818, -3.310335, 0], [5.775818, -3.210335, 0], stroke_width=1.966915, color="#FFFF00"), [((0.25, 0.5), (0.75, 0.166667), (1, 0))]), tip=0.127475, start="stealth")
        tiny.set_opacity(0.5).set_fill(opacity=0, recurse=False)
        tiny.set_z_index(3)

        # twice: arrow
        twice_2 = Line([-6.451782, -0.987096, 0], [-4.957691, -1.983156, 0], buff=0.245472, path_arc=100 * DEGREES, stroke_width=6, color="#FFFFFF").add_tip(length=0.25, width=0.25)
        twice_2.set_z_index(2)

        # pair: line, built on slope where its clip starts

        # pair: line, built on slope where its clip starts

        poly_in = Write(poly, stroke_color="#FFFFFF")
        slope_in = FadeIn(slope)
        # 0 s – 0.3 s: poly write, slope fade_in
        self.play(_Part(poly_in, 0, 0.375), _Part(slope_in, 0, 0.6), run_time=0.3)
        free_in = Write(free, stroke_color="#FFFFFF")
        # 0.3 s – 0.5 s: poly write, slope fade_in, free write
        self.play(
            _Part(poly_in, 0.375, 0.625),
            _Part(slope_in, 0.6, 1),
            _Part(free_in, 0, 0.4),
            run_time=0.2,
        )
        self.add(corner)
        self.add(notched)
        self.add(short)
        self.add(twice)
        bow_in = FadeIn(bow)
        dot_in = GrowArrow(dot)
        # 0.5 s – 0.8 s: poly write, free write, bow fade_in, dot grow_arrow
        self.play(
            _Part(poly_in, 0.625, 1),
            _Part(free_in, 0.4, 1),
            _Part(bow_in, 0, 0.6),
            _Part(dot_in, 0, 0.3),
            run_time=0.3,
        )
        # 0.8 s – 1 s: bow fade_in, dot grow_arrow
        self.play(_Part(bow_in, 0.6, 1), _Part(dot_in, 0.3, 0.5), run_time=0.2)
        arc = _arrow(Line(poly[6], slope[0], buff=0.25, path_arc=30 * DEGREES, stroke_width=6, color="#83C167"), tip=0.35, end="stealth")
        arc.set_z_index(14)
        arc_in = ShowCreation(arc)
        # 1 s – 1.3 s: dot grow_arrow, arc create
        self.play(_Part(dot_in, 0.5, 0.8), _Part(arc_in, 0, 0.375), run_time=0.3)
        free_move = free.animate.move_to([-4, -2.25, 0]).set_stroke(opacity=0.4).build()
        # 1.3 s – 1.5 s: dot grow_arrow, arc create, free tween
        self.play(
            _Part(dot_in, 0.8, 1),
            _Part(arc_in, 0.375, 0.625),
            _Part(free_move, 0, 0.2),
            run_time=0.2,
        )
        both = _arrow(Line(poly.get_corner(DL), [1, -3, 0], buff=0.25, path_arc=-60 * DEGREES, stroke_width=6, color="#FFFF00"), tip=0.35, end="dot", start="triangle")
        both.set_z_index(13)
        dashes = DashedLine([5.5, 3, 0], slope, buff=0.1, path_arc=90 * DEGREES, dash_length=0.1, color="#FFFFFF")
        dashes.set_z_index(12)
        both_in = _TraceArrow(both)
        dashes_in = ShowCreation(dashes)
        # 1.5 s – 1.8 s: arc create, free tween, both grow_arrow, dashes create
        self.play(
            _Part(arc_in, 0.625, 1),
            _Part(free_move, 0.2, 0.5),
            _Part(both_in, 0, 0.375),
            _Part(dashes_in, 0, 0.3),
            run_time=0.3,
        )
        # 1.8 s – 2 s: free tween, both grow_arrow, dashes create
        self.play(
            _Part(free_move, 0.5, 0.7),
            _Part(both_in, 0.375, 0.625),
            _Part(dashes_in, 0.3, 0.5),
            run_time=0.2,
        )
        clockwise = Line(poly[:2], slope.get_top(), buff=0.3, path_arc=-120 * DEGREES, color="#58C4DD")
        clockwise.set_z_index(11)
        clockwise_in = Write(clockwise, stroke_color="#58C4DD")
        # 2 s – 2.3 s: free tween, both grow_arrow, dashes create, clockwise write
        self.play(
            _Part(free_move, 0.7, 1),
            _Part(both_in, 0.625, 1),
            _Part(dashes_in, 0.5, 0.8),
            _Part(clockwise_in, 0, 0.6),
            run_time=0.3,
        )
        # 2.3 s – 2.5 s: dashes create, clockwise write
        self.play(_Part(dashes_in, 0.8, 1), _Part(clockwise_in, 0.6, 1), run_time=0.2)
        beads = _dashed(_spline(Line([-6, 3.5, 0], poly.get_corner(UL), buff=0.1, color="#83C167"), [((0.3, 0.4), (0.7, -0.4), (1, 0))]), dash_length=0.15)
        beads.set_z_index(7)
        beads_in = ShowCreation(beads)
        # 2.5 s – 3 s: beads create
        self.play(_Part(beads_in, 0, 0.625), run_time=0.5)
        wave = _spline(Line(poly[2].get_bottom(), slope[3], buff=0.25, stroke_width=6, color="#FFFF00"), [((0.3, 0.4), (0.7, -0.4), (1, 0))]).add_tip(length=0.35, width=0.35)
        wave.set_z_index(9)
        wave_in = _TraceArrow(wave, rate_func=linear)
        # 3 s – 3.3 s: beads create, wave grow_arrow
        self.play(_Part(beads_in, 0.625, 1), _Part(wave_in, 0, 0.375), run_time=0.3)
        # 3.3 s – 3.5 s: wave grow_arrow
        self.play(_Part(wave_in, 0.375, 0.625), run_time=0.2)
        free_out = _Unwrite(free, stroke_color="#FFFFFF")
        # 3.5 s – 3.8 s: wave grow_arrow, free unwrite
        self.play(_Part(wave_in, 0.625, 1), _Part(free_out, 0, 0.6), run_time=0.3)
        # 3.8 s – 4 s: free unwrite
        self.play(_Part(free_out, 0.6, 1), run_time=0.2)
        self.remove(short)
        self.remove(twice)
        self.add(twice_2)
        # 4 s – 4.5 s: tiny create
        self.play(ShowCreation(tiny), run_time=0.5)
        pair = Line([2.825, -0.7, 0], [4, -3.5, 0], buff=0.2, path_arc=60 * DEGREES, color="#83C167")
        pair.set_z_index(10)
        self.add(pair)
        # 4.5 s – 5.5 s: corner tween
        self.play(corner.animate.move_to([5, 1.5, 0]).set_color("#FFFF00"), run_time=1)
        # 5.5 s – 6.5 s
        self.wait(1)
        pair_2 = Line([3.183917, -0.700678, 0], [4.358917, -3.500678, 0], buff=0.2, path_arc=60 * DEGREES, color="#83C167")
        pair_2.set_z_index(10)
        self.remove(pair)
        self.add(pair_2)
        # 6.5 s – 7.2 s
        self.wait(0.7)
        # 7.2 s – 8 s: dashes uncreate
        self.play(Uncreate(dashes), run_time=0.8)
        # 8 s – 9 s
        self.wait(1)
