# Hidden returning tween endpoints — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 12 fps:
#     manim -r 480,270 --fps 12 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 12 fps, so the video has
# exactly 60 frames, like the editor's video export.
from manim import *


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

        # hidden0: box
        hidden0 = Rectangle(width=0.8, height=0.5, color="#FFFF00", fill_opacity=0.2, stroke_opacity=0.7)
        hidden0.move_to([-5, 1.5, 0])
        hidden0.set_z_index(6)

        # hidden1: box
        hidden1 = Rectangle(width=0.8, height=0.5, color="#FFFF00", fill_opacity=0.2, stroke_opacity=0.7)
        hidden1.move_to([-3, 1.5, 0])
        hidden1.set_z_index(5)

        # hidden2: cross
        hidden2 = Cross(Rectangle(width=0.8, height=0.5), stroke_color="#FC6255", stroke_width=4).set_stroke(opacity=0.7)
        hidden2.move_to([-1, 1.5, 0])
        hidden2.set_z_index(4)

        # hidden3: box
        hidden3 = Rectangle(width=0.8, height=0.5, color="#FFFF00", fill_opacity=0.2, stroke_opacity=0.7)
        hidden3.move_to([1, 1.5, 0])
        hidden3.set_z_index(3)

        # source3: circle
        source3 = Circle(radius=0.2, stroke_color="#FC6255", fill_color="#FC6255", fill_opacity=0.2, stroke_opacity=0.7)
        source3.move_to([1, -1.5, 0])
        source3.set_z_index(2)

        # hidden4: cross
        hidden4 = Cross(Rectangle(width=0.8, height=0.5), stroke_color="#FC6255", stroke_width=4).set_stroke(opacity=0.7)
        hidden4.move_to([3, 1.5, 0])
        hidden4.set_z_index(1)

        # hidden5: box
        hidden5 = Rectangle(width=0.8, height=0.5, color="#FFFF00", fill_opacity=0.2, stroke_opacity=0.7)
        hidden5.move_to([5, 1.5, 0])

        self.add(hidden1)
        self.add(hidden2[1])
        self.add(source3)
        self.add(hidden4[1])
        # 0 s – 0.25 s
        self.wait(0.25)
        # 0.25 s – 0.5 s: hidden1 part
        self.play(
            hidden1.animate(rate_func=linear).set_color("#00FF00").set_fill(opacity=0.04).set_stroke(opacity=0.14),
            run_time=0.25,
        )
        # 0.5 s – 0.75 s
        self.wait(0.25)
        # 0.75 s – 1 s: hidden1 fade_out
        self.play(FadeOut(hidden1, rate_func=linear), run_time=0.25)
        # 1 s – 1.25 s
        self.wait(0.25)
        hidden0.set_fill(opacity=0.2).set_stroke(opacity=0.7)
        hidden0.set_color("#FFFF00")
        hidden1.set_fill(opacity=0.2).set_stroke(opacity=0.7)
        hidden1.set_color("#FFFF00")
        hidden2[0].set_stroke(opacity=0.7)
        hidden2[0].set_color("#FC6255")
        hidden3.set_fill(opacity=0.2).set_stroke(opacity=0.7)
        hidden3.set_color("#FFFF00")
        hidden4[0].set_stroke(opacity=0.7)
        hidden4[0].set_color("#FC6255")
        hidden5.apply_matrix([[-0.75, -1.299038], [-1.299038, 0.75]], about_point=[5, 1.5, 0]).shift(np.array([0.5, -0.5, 0])).set_fill(opacity=0.12).set_stroke(opacity=0.42)
        hidden5.set_color("#FF0000")
        # 1.25 s – 2.25 s: hidden0 tween, hidden1 tween, hidden2 tween, hidden3 tween, hidden4 tween, hidden5 tween
        self.play(
            _Tween(VGroup(hidden2[1]), (-1, 1.5, 1, 0, 1, 1), (-0.5, 1, 1.5, 60, -1, 1), colors=[("#FC6255", "#FF0000")], stroke=(0.7, 0.42), rate_func=there_and_back),
            _Tween(VGroup(hidden4[1]), (3, 1.5, 1, 0, 1, 1), (3.5, 1, 1.5, 60, -1, 1), colors=[("#FC6255", "#FF0000")], stroke=(0.7, 0.42), rate_func=there_and_back),
            run_time=1,
        )
        # 2.25 s – 3 s
        self.wait(0.75)
        source3.set_z_index(3)
        # 3 s – 3.5 s: hidden4 morph, source3 → hidden3, hidden0 fade_in, hidden1 fade_in, hidden2 fade_in, hidden5 fade_in
        self.play(
            ReplacementTransform(hidden4[1].copy(), hidden4[0], rate_func=linear),
            ReplacementTransform(source3, hidden3, rate_func=linear),
            FadeIn(hidden0, rate_func=linear),
            FadeIn(hidden1, rate_func=linear),
            FadeIn(hidden2[0], rate_func=linear),
            FadeIn(hidden5, rate_func=linear),
            run_time=0.5,
        )
        # 3.5 s – 4 s
        self.wait(0.5)
        # 4 s – 4.5 s: hidden0 tween, hidden1 tween, hidden2 tween, hidden3 tween, hidden4 tween, hidden5 tween
        self.play(
            hidden0.animate(rate_func=linear).move_to([-5, 0.5, 0]),
            hidden1.animate(rate_func=linear).move_to([-3, 0.5, 0]),
            hidden2.animate(rate_func=linear).move_to([-1, 0.5, 0]),
            hidden3.animate(rate_func=linear).move_to([1, 0.5, 0]),
            hidden4.animate(rate_func=linear).move_to([3, 0.5, 0]),
            hidden5.animate(rate_func=linear).shift(np.array([-0.5, -0.5, 0])),
            run_time=0.5,
        )
        # 4.5 s – 5 s
        self.wait(0.5)
