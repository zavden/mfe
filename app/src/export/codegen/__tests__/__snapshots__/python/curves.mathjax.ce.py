# Curves — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 270 frames, like the editor's video export.
from manim import *


def _glyphs(tex, layout):
    """The glyphs of `tex` in the editor's order. That order (MathJax's, or another
    template's) can differ from Manim's, so the glyphs are matched by position: `layout`
    holds each glyph's (x, y, width, height) relative to the formula centre, divided by the
    formula height, and every real glyph is assigned to one entry with the least total
    distance. Entries without a counterpart get an empty VMobject."""
    from scipy.optimize import linear_sum_assignment

    real = tex.family_members_with_points()
    glyphs = [VMobject() for _ in layout]
    if len(real) != len(layout):
        print(f"Warning: Manim made {len(real)} glyphs of a formula the editor split into "
              f"{len(layout)}; unmatched glyphs are not animated.")
    if not real or not layout:
        return glyphs  # nothing to match (a formula without ink, such as \quad)
    centre, height = tex.get_center(), tex.get_height()
    if height < 1e-6:
        height = 1.0  # a flat mobject (a rule): the editor's layout is divided by 1 then too
    have = np.array([
        [*((g.get_center() - centre)[:2] / height), g.get_width() / height, g.get_height() / height]
        for g in real
    ])
    want = np.array(layout, dtype=float)
    cost = np.linalg.norm(want[:, None, :] - have[None, :, :], axis=2)
    for i, j in zip(*linear_sum_assignment(cost)):
        glyphs[i] = real[j]
    return glyphs


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
    An arrow keeps its tips, put on the curve."""
    tips = [type(tip) for tip in line.pop_tips()] if isinstance(line, Arrow) else []
    start, end = line.get_start(), line.get_end()
    along = end - start
    across = np.array([-along[1], along[0], 0.0])
    points = [start]
    for stretch in curves:
        points += [points[-1], *(start + u * along + v * across for u, v in stretch)]
    line.set_points(np.array(points[1:]))
    for shape, at_start in zip(tips, (False, True)):
        line.add_tip(tip_shape=shape, at_start=at_start)
        if not at_start:
            width = line.max_stroke_width_to_length_ratio * line.get_length()
            line.set_stroke(width=min(line.initial_stroke_width, width), family=False)
    return line


def _dashed(line, dash_length=0.05):
    """A curve cut into dashes about `dash_length` long, counted by its own length."""
    count = max(2, int(np.ceil(line.get_arc_length() / dash_length / 2)))
    return DashedVMobject(line, num_dashes=count)


class _TraceArrow(Animation):
    """A bent arrow drawn along its own way, from its start (Manim's GrowArrow scales the
    arrow about that point): its tip leads the stroke and turns with it, grown out of the
    start over the first quarter of the way; the tip at the start of a double arrow grows
    where it is."""

    def __init__(self, arrow, **kwargs):
        super().__init__(arrow, introducer=True, **kwargs)

    def along(self, alpha):
        """The point of the shaft at that part of its curves, and the way it runs there."""
        points = self.starting_mobject.points
        index, t = integer_interpolate(0, len(points) // 4, alpha)
        curve = points[4 * index:4 * index + 4]
        return bezier(curve)(t), bezier(curve[1:] - curve[:-1])(t)

    def interpolate_submobject(self, submob, start, alpha):
        if submob is self.mobject:
            submob.pointwise_become_partial(start, 0, alpha)
            return
        base = start.base
        submob.set_points(start.points)
        if submob is self.mobject.tip:
            (at, way), (_, ahead) = self.along(alpha), self.along(1)
            if min(np.linalg.norm(way), np.linalg.norm(ahead)) > 1e-8:
                submob.rotate(angle_of_vector(way) - angle_of_vector(ahead), about_point=base)
            submob.shift(at - base)
            base = at
        submob.scale(min(1, 4 * alpha), about_point=base)


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # poly: x^2+bx+c
        poly = MathTex(r"x^2+bx+c")
        poly_g = _glyphs(poly, [
            (-2.625, 0, 0.6875, 1), (-1.75, 0, 0.6875, 1), (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1),
            (0.875, 0, 0.6875, 1), (1.75, 0, 0.6875, 1), (2.625, 0, 0.6875, 1),
        ])
        poly_g[3].set_color("#FFFF00")
        poly.move_to([-3.5, 1.5, 0])
        poly.set_z_index(1)

        # slope: y=mx
        slope = MathTex(r"y=mx", font_size=60, color="#58C4DD")
        slope_g = _glyphs(slope, [
            (-1.3125, 0, 0.6875, 1), (-0.4375, 0, 0.6875, 1), (0.4375, 0, 0.6875, 1), (1.3125, 0, 0.6875, 1),
        ])
        slope.move_to([3, -0.5, 0])

        # free: line
        free = Line([-5.75, -0.804863, 0], [-3.25, -1.554863, 0], path_arc=150 * DEGREES, stroke_width=8)
        free.set_z_index(10)

        # bow: double arrow
        bow = _spline(DoubleArrow([-2.437517, -3.414243, 0], [0.562483, -2.914243, 0], buff=0, tip_shape_end=StealthTip, tip_shape_start=ArrowCircleFilledTip), [((0.25, 0.5), (0.75, 0.166667), (1, 0))])
        bow.set_z_index(8)

        # corner: line
        corner = _spline(Line([4, 1.5, 0], [6, 2.5, 0], color="#58C4DD"), [((0.116667, 0.1), (0.233333, 0.2), (0.35, 0.3)), ((0.5, 0.45), (0.9, 0.35), (1, 0))])
        corner.set_z_index(6)

        # dot: arrow
        dot = Arrow([-6.25, -3.5, 0], [-4.75, -3.5, 0], buff=0, tip_shape=ArrowCircleFilledTip)
        dot.set_z_index(5)

        # notched: double arrow
        notched = DoubleArrow([6.3, -2.75, 0], [6.3, -1.25, 0], buff=0, tip_shape_end=StealthTip, tip_shape_start=StealthTip)
        notched.set_z_index(4)

        # short: arrow
        short = Arrow([5.177683, -3.1316, 0], [5.777683, -2.8316, 0], buff=0, path_arc=80 * DEGREES, tip_shape=ArrowCircleFilledTip)
        short.set_z_index(3)

        # twice: arrow
        twice = Arrow([-6.452202, 0.010941, 0], [-4.959101, -0.984459, 0], buff=0.245303, path_arc=100 * DEGREES, tip_length=0.25)
        twice.set_z_index(2)

        # arc: arrow, built on poly and slope where its clip starts

        # both: double arrow, built on poly where its clip starts

        # dashes: dashed, built on slope where its clip starts

        # clockwise: line, built on poly and slope where its clip starts

        # beads: dashed, built on poly where its clip starts

        # wave: arrow, built on poly and slope where its clip starts

        # tiny: double arrow
        tiny = _spline(DoubleArrow([5.275818, -3.310335, 0], [5.775818, -3.210335, 0], buff=0, color="#FFFF00", tip_shape_start=StealthTip), [((0.25, 0.5), (0.75, 0.166667), (1, 0))])
        tiny.set_opacity(0.5).set_fill(opacity=0, family=False)
        tiny.set_z_index(3)

        # twice: arrow
        twice_2 = Arrow([-6.452202, -0.989059, 0], [-4.959101, -1.984459, 0], buff=0.245303, path_arc=100 * DEGREES, tip_length=0.25)
        twice_2.set_z_index(2)

        # pair: line, built on slope where its clip starts

        # pair: line, built on slope where its clip starts

        poly_in = Write(VGroup(*poly_g[:]))
        slope_in = FadeIn(slope)
        # 0 s – 0.3 s: poly write, slope fade_in
        self.play(_Part(poly_in, 0, 0.375), _Part(slope_in, 0, 0.6), run_time=0.3)
        free_in = Write(free)
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
        arc = Arrow(poly_g[6], slope_g[0], path_arc=30 * DEGREES, color="#83C167", tip_shape=StealthTip)
        arc.set_z_index(14)
        arc_in = Create(arc)
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
        both = DoubleArrow(poly.get_corner(DL), [1, -3, 0], path_arc=-60 * DEGREES, color="#FFFF00", tip_shape_end=ArrowCircleFilledTip)
        both.set_z_index(13)
        dashes = DashedLine([5.5, 3, 0], slope, buff=0.1, path_arc=90 * DEGREES, dash_length=0.1)
        dashes.set_z_index(12)
        both_in = _TraceArrow(both)
        dashes_in = Create(dashes)
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
        clockwise = Line(VGroup(poly_g[0], poly_g[1]), slope.get_top(), buff=0.3, path_arc=-120 * DEGREES, color="#58C4DD")
        clockwise.set_z_index(11)
        clockwise_in = Write(clockwise)
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
        beads_in = Create(beads)
        # 2.5 s – 3 s: beads create
        self.play(_Part(beads_in, 0, 0.625), run_time=0.5)
        wave = _spline(Arrow(poly_g[2].get_bottom(), slope_g[3], color="#FFFF00"), [((0.3, 0.4), (0.7, -0.4), (1, 0))])
        wave.set_z_index(9)
        wave_in = _TraceArrow(wave, rate_func=linear)
        # 3 s – 3.3 s: beads create, wave grow_arrow
        self.play(_Part(beads_in, 0.625, 1), _Part(wave_in, 0, 0.375), run_time=0.3)
        # 3.3 s – 3.5 s: wave grow_arrow
        self.play(_Part(wave_in, 0.375, 0.625), run_time=0.2)
        free_out = Unwrite(VGroup(free))
        # 3.5 s – 3.8 s: wave grow_arrow, free unwrite
        self.play(_Part(wave_in, 0.625, 1), _Part(free_out, 0, 0.6), run_time=0.3)
        # 3.8 s – 4 s: free unwrite
        self.play(_Part(free_out, 0.6, 1), run_time=0.2)
        self.remove(short)
        self.remove(twice)
        self.add(twice_2)
        # 4 s – 4.5 s: tiny create
        self.play(Create(tiny), run_time=0.5)
        pair = Line([2.825, -0.7, 0], [4, -3.5, 0], buff=0.2, path_arc=60 * DEGREES, color="#83C167")
        pair.set_z_index(10)
        self.add(pair)
        # 4.5 s – 5.5 s: corner tween
        self.play(corner.animate.move_to([5, 1.5, 0]).set_color("#FFFF00"), run_time=1)
        # 5.5 s – 6.5 s
        self.wait(1)
        pair_2 = Line([3.183779, -0.700629, 0], [4.358779, -3.500629, 0], buff=0.2, path_arc=60 * DEGREES, color="#83C167")
        pair_2.set_z_index(10)
        self.remove(pair)
        self.add(pair_2)
        # 6.5 s – 7.2 s
        self.wait(0.7)
        # 7.2 s – 8 s: dashes uncreate
        self.play(Uncreate(dashes), run_time=0.8)
        # 8 s – 9 s
        self.wait(1)
