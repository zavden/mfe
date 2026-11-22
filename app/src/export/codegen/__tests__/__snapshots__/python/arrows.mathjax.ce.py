# Arrows — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 294 frames, like the editor's video export.
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


def _pose(start, end, t):
    """Matrix and centre of a formula placement blended from `start` to `end` at t, as
    the editor does it: position, scale and flips linearly (a flip passes through zero),
    the rotation as a true rotation. A placement is (x, y, scale, degrees, sx, sy) with
    sx, sy = -1 for a flipped axis."""
    x, y, s, deg, sx, sy = (a + (b - a) * t for a, b in zip(start, end))
    c, si = np.cos(deg * DEGREES), np.sin(deg * DEGREES)
    return np.array([[c, -si], [si, c]]) @ np.diag([s * sx, s * sy]), np.array([x, y, 0.0])


def _mix(a, b, t):
    """Blend two '#RRGGBB' colours component-wise in RGB, as a Transform does."""
    a, b = (np.array([int(c[i:i + 2], 16) for i in (1, 3, 5)]) for c in (a, b))
    return "#%02X%02X%02X" % tuple(int(v) for v in np.round(a + (b - a) * t))


class _Tween(Animation):
    """Moves `glyphs` from one placement of their formula to another (see _pose): the
    rotation turns about the formula centre instead of cutting across. The submobjects of
    `glyphs` are the glyphs; `colors` holds a (from, to) pair or None for each of them, in
    that order, `opacity` a (from, to) pair of fill opacities, one such pair per glyph, or
    None, and `stroke` a (from, to) pair of stroke opacities (a stroked shape) or None."""

    def __init__(self, glyphs, start, end, colors=None, opacity=None, stroke=None, **kwargs):
        super().__init__(glyphs, **kwargs)
        self.start, self.end, self.colors = start, end, colors
        self.opacity, self.stroke = opacity, stroke

    def begin(self):
        self.glyphs = list(self.mobject.submobjects)
        self.origins = [g.copy() for g in self.glyphs]
        matrix, centre = _pose(self.start, self.start, 0)
        self.inverse, self.centre = np.linalg.inv(matrix), centre
        super().begin()

    def interpolate_mobject(self, alpha):
        t = self.rate_func(min(max(alpha, 0), 1))
        matrix, centre = _pose(self.start, self.end, t)
        for i, (glyph, origin) in enumerate(zip(self.glyphs, self.origins)):
            glyph.match_points(origin)
            glyph.apply_matrix(matrix @ self.inverse, about_point=self.centre)
            glyph.shift(centre - self.centre)
            pair = self.colors[i] if self.colors else None
            fill = _mix(*pair, t) if pair else None
            fade = self.opacity[i] if isinstance(self.opacity, list) else self.opacity
            o = fade[0] + (fade[1] - fade[0]) * t if fade else None
            if fill or o is not None:
                glyph.set_fill(fill, o)
            if self.stroke:
                glyph.set_stroke(fill, opacity=self.stroke[0] + (self.stroke[1] - self.stroke[0]) * t)


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
        poly.set_z_index(2)

        # slope: y=mx
        slope = MathTex(r"y=mx", font_size=60, color="#58C4DD")
        slope_g = _glyphs(slope, [
            (-1.3125, 0, 0.6875, 1), (-0.4375, 0, 0.6875, 1), (0.4375, 0, 0.6875, 1), (1.3125, 0, 0.6875, 1),
        ])
        slope.move_to([3, -0.5, 0])
        slope.set_z_index(1)

        # free: line
        free = Line([-5.75, -1.125, 0], [-3.25, -1.875, 0], stroke_width=8)
        free.set_z_index(7)

        # short: arrow
        short = Arrow([5.2, -3.15, 0], [5.8, -2.85, 0], buff=0)
        short.set_z_index(6)

        # tiny: double arrow
        tiny = DoubleArrow([4.25, -3.25, 0], [4.75, -3.25, 0], buff=0, color="#FFFF00")
        tiny.set_opacity(0.5)
        tiny.set_z_index(3)

        # twice: dashed
        twice = DashedLine([-1.25, -1.25, 0], [0.25, -0.75, 0])
        twice.set_z_index(5)

        # both: double arrow, built on poly and slope where its clip starts

        # dashes: dashed, built on slope where its clip starts

        # points: arrow, built on poly and slope where its clip starts

        # under: line, built on poly and poly where its clip starts

        # ahead: arrow, built on late where its clip starts

        # late: z
        late = MathTex(r"z", font_size=72)
        late_g = _glyphs(late, [
            (0, 0, 0.6875, 1),
        ])
        late.move_to([0, -3, 0])

        # twice: dashed
        twice_2 = DashedLine([-1.25, -2.25, 0], [0.25, -1.75, 0])
        twice_2.set_z_index(1)

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
        self.add(short)
        self.add(twice)
        tiny_in = Create(tiny)
        # 0.5 s – 0.8 s: poly write, free write, tiny create
        self.play(
            _Part(poly_in, 0.625, 1),
            _Part(free_in, 0.4, 1),
            _Part(tiny_in, 0, 0.6),
            run_time=0.3,
        )
        # 0.8 s – 1 s: tiny create
        self.play(_Part(tiny_in, 0.6, 1), run_time=0.2)
        both = DoubleArrow(poly_g[6], slope_g[0], color="#83C167")
        both.set_z_index(9)
        both_in = FadeIn(both)
        # 1 s – 1.3 s: both fade_in
        self.play(_Part(both_in, 0, 0.6), run_time=0.3)
        free_move = free.animate.move_to([-4, -2.25, 0]).set_opacity(0.4).build()
        # 1.3 s – 1.5 s: both fade_in, free tween
        self.play(_Part(both_in, 0.6, 1), _Part(free_move, 0, 0.2), run_time=0.2)
        dashes = DashedLine([5.5, 3, 0], slope.get_corner(UR), buff=0.1, dash_length=0.1, color="#FFFF00")
        dashes.set_z_index(8)
        dashes_in = Create(dashes)
        # 1.5 s – 2 s: free tween, dashes create
        self.play(_Part(free_move, 0.2, 0.7), _Part(dashes_in, 0, 0.5), run_time=0.5)
        poly_move = _Tween(VGroup(*poly_g[:]), (-3.5, 1.5, 1, 0, 1, 1), (-3, 2.25, 1.2, 15, 1, 1))
        # 2 s – 2.3 s: free tween, dashes create, poly tween
        self.play(
            _Part(free_move, 0.7, 1),
            _Part(dashes_in, 0.5, 0.8),
            _Part(poly_move, 0, 0.3),
            run_time=0.3,
        )
        # 2.3 s – 2.5 s: dashes create, poly tween
        self.play(_Part(dashes_in, 0.8, 1), _Part(poly_move, 0.3, 0.5), run_time=0.2)
        # 2.5 s – 2.8 s: poly tween
        self.play(_Part(poly_move, 0.5, 0.8), run_time=0.3)
        both_out = FadeOut(both)
        # 2.8 s – 3 s: poly tween, both fade_out
        self.play(_Part(poly_move, 0.8, 1), _Part(both_out, 0, 0.4), run_time=0.2)
        # 3 s – 3.3 s: both fade_out
        self.play(_Part(both_out, 0.4, 1), run_time=0.3)
        # 3.3 s – 3.5 s
        self.wait(0.2)
        points = Arrow(VGroup(poly_g[0], poly_g[1]), slope)
        points.set_z_index(9)
        points_in = Create(points)
        # 3.5 s – 4 s: free unwrite, points create
        self.play(Unwrite(free), _Part(points_in, 0, 0.625), run_time=0.5)
        under = Line(poly_g[2].get_corner(DL), poly_g[5].get_bottom(), buff=0.05, color="#58C4DD", stroke_width=2)
        under.set_z_index(4)
        self.add(under)
        # 4 s – 4.3 s: points create
        self.play(_Part(points_in, 0.625, 1), run_time=0.3)
        ahead = Arrow([-5, -3, 0], late.get_left(), buff=0.3, color="#58C4DD", tip_length=0.25)
        ahead.set_z_index(7)
        # 4.3 s – 4.8 s: ahead write
        self.play(Write(ahead), run_time=0.5)
        # 4.8 s – 5 s
        self.wait(0.2)
        # 5 s – 5.5 s: late fade_in
        self.play(FadeIn(late), run_time=0.5)
        # 5.5 s – 6.5 s: points tween
        self.play(points.animate.move_to([0.5, 2.5, 0]).set_color("#FFFF00"), run_time=1)
        # 6.5 s – 7.2 s
        self.wait(0.7)
        # 7.2 s – 8 s: dashes uncreate
        self.play(Uncreate(dashes), run_time=0.8)
        # 8 s – 9 s
        self.wait(1)
        self.remove(poly)
        self.remove(slope)
        self.remove(late)
        self.remove(points)
        self.remove(under)
        self.remove(ahead)
        self.remove(short)
        self.remove(tiny)
        self.remove(twice)
        self.add(twice_2)
        # 9 s – 9.8 s
        self.wait(0.8)
