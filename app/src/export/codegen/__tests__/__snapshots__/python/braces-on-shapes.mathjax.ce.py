# Braces on shapes — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 240 frames, like the editor's video export.
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


def _circle_around(mobject, buff=0.1, color=WHITE, **kwargs):
    """A circle through the corners of the mobject's box, `buff` further out, centred on it."""
    radius = np.hypot(mobject.get_width(), mobject.get_height()) / 2 + buff
    return Circle(radius=radius, stroke_color=color, fill_color=color, **kwargs).move_to(mobject)


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # poly: x^2+bx+c
        poly = MathTex(r"x^2+bx+c")
        poly_g = _glyphs(poly, [
            (-2.625, 0, 0.6875, 1), (-1.75, 0, 0.6875, 1), (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1),
            (0.875, 0, 0.6875, 1), (1.75, 0, 0.6875, 1), (2.625, 0, 0.6875, 1),
        ])
        VGroup(poly_g[3], poly_g[4]).set_color("#FFFF00")
        poly.scale(1.2).move_to([-1, 1.2, 0])
        poly.set_z_index(11)

        # free: circle
        free = Circle(radius=0.7, stroke_color="#FFFF00")
        free.move_to([4, -2, 0])
        free.set_z_index(6)

        # box: box, built on poly where its clip starts

        # circle: circle, built on poly where its clip starts

        # line: underline, built on poly where its clip starts

        # cross: cross, built on poly where its clip starts

        # underbox: brace, built on box where its clip starts

        # leftcircle: brace, built on circle where its clip starts

        # underline: brace, built on line where its clip starts

        # overcross: brace, built on cross where its clip starts

        # both: brace, built on poly and box where its clip starts

        # shapes: brace, built on free and circle where its clip starts

        # 0 s – 1 s: poly write
        self.play(Write(VGroup(*poly_g[:])), run_time=1)
        self.add(free)
        # 1 s – 1.5 s
        self.wait(0.5)
        box = SurroundingRectangle(VGroup(*poly_g[3:6]), buff=0.15, color="#FFFF00", corner_radius=0.15)
        box.set_z_index(10)
        circle = _circle_around(VGroup(poly_g[0], poly_g[1]), buff=0.1, color="#83C167")
        circle.set_z_index(9)
        line = Underline(poly, buff=0.2, color="#58C4DD")
        line.set_z_index(8)
        cross = Cross(VGroup(poly_g[5], poly_g[6]), stroke_color="#FC6255")
        cross.set_z_index(7)
        self.add(box)
        self.add(circle)
        self.add(line)
        self.add(cross)
        # 1.5 s – 2 s
        self.wait(0.5)
        # 2 s – 3 s: box tween, circle tween
        self.play(
            _Tween(VGroup(box), (-0.664, 1.2, 1, 0, 1, 1), (-2.4, -0.6, 1.3, 15, 1, 1)),
            _Tween(VGroup(circle), (-1.84, 1.2, 1, 0, 1, 1), (-1.84, 1.2, 1, 40, 1, 1)),
            run_time=1,
        )
        underbox = Brace(box, DOWN, buff=0.2, color="#58C4DD")
        underbox.set_z_index(5)
        # 3 s – 3.5 s: underbox grow_from_center
        self.play(GrowFromCenter(underbox), run_time=0.5)
        leftcircle = Brace(circle, LEFT, buff=0.1, color="#FC6255")
        leftcircle.set_z_index(4)
        self.add(leftcircle)
        # 3.5 s – 4 s
        self.wait(0.5)
        underline = Brace(line, DOWN, buff=0.25)
        underline.set_z_index(3)
        # 4 s – 4.5 s: underline fade_in
        self.play(FadeIn(underline), run_time=0.5)
        overcross = Brace(cross, UP, buff=0.15, sharpness=1.2, color="#83C167")
        overcross.set_z_index(2)
        self.add(overcross)
        # 4.5 s – 5 s
        self.wait(0.5)
        both = Brace(VGroup(poly, box), RIGHT, buff=0.2, color="#FFFF00")
        both.set_z_index(1)
        # 5 s – 5.5 s: both write
        self.play(Write(both), run_time=0.5)
        shapes = Brace(VGroup(free, circle), rotate_vector(DOWN, 30 * DEGREES), buff=0.2)
        self.add(shapes)
        # 5.5 s – 8 s
        self.wait(2.5)
