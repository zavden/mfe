# Tweens — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 180 frames, like the editor's video export.
from manim import *


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

        # line: y=mx+b
        line = MathTex(r"y=mx+b")
        line[0][2].set_color("#FFFF00")
        line.set_z_index(1)

        # integral: \int_0^1 f(x)\,dx
        integral = MathTex(r"\int_0^1 f(x)\,dx")
        integral.set_opacity(0.8)
        integral.scale(0.8).stretch(-1, 1).move_to([3, -2, 0]).rotate(-20 * DEGREES)

        self.add(line)
        # 0 s – 0.3 s
        self.wait(0.3)
        line_move = line.animate.scale(1.4).move_to([-2, 1, 0]).build()
        # 0.3 s – 0.5 s: line tween
        self.play(_Part(line_move, 0, 2 / 9), run_time=0.2)
        integral_in = FadeIn(integral)
        # 0.5 s – 1.2 s: line tween, integral fade_in
        self.play(_Part(line_move, 2 / 9, 1), _Part(integral_in, 0, 0.7), run_time=0.7)
        # 1.2 s – 1.4 s: integral fade_in
        self.play(_Part(integral_in, 0.7, 0.9), run_time=0.2)
        line_move_2 = _Tween(line[0], (-2, 1, 1.4, 0, 1, 1), (-2, 1, 1.4, 40, -1, 1), rate_func=linear)
        # 1.4 s – 1.5 s: integral fade_in, line tween
        self.play(_Part(integral_in, 0.9, 1), _Part(line_move_2, 0, 0.1), run_time=0.1)
        # 1.5 s – 2 s: line tween
        self.play(_Part(line_move_2, 0.1, 0.6), run_time=0.5)
        integral_move = _Tween(integral[0], (3, -2, 0.8, -20, 1, -1), (2, 2, 0.8, -20, 1, 1), rate_func=slow_into)
        # 2 s – 2.4 s: line tween, integral tween
        self.play(_Part(line_move_2, 0.6, 1), _Part(integral_move, 0, 0.4), run_time=0.4)
        # 2.4 s – 2.6 s: integral tween
        self.play(_Part(integral_move, 0.4, 0.6), run_time=0.2)
        line_move_3 = line.animate(rate_func=rush_from).set_color("#83C167").set_opacity(0.5).build()
        # 2.6 s – 3 s: integral tween, line tween
        self.play(_Part(integral_move, 0.6, 1), _Part(line_move_3, 0, 4 / 7), run_time=0.4)
        # 3 s – 3.3 s: line tween
        self.play(_Part(line_move_3, 4 / 7, 1), run_time=0.3)
        # 3.3 s – 3.5 s
        self.wait(0.2)
        line.generate_target()
        line.target.shift(np.array([3, -2, 0]))
        line.target[0][0].set_color("#FC6255")
        line.target[0][3].set_color("#58C4DD")
        # 3.5 s – 4.3 s: line tween
        self.play(MoveToTarget(line), run_time=0.8)
        # 4.3 s – 4.5 s
        self.wait(0.2)
        integral_out = FadeOut(integral)
        # 4.5 s – 5.4 s: integral fade_out, line tween
        self.play(
            _Part(integral_out, 0, 0.9),
            line.animate(rate_func=there_and_back).shift(np.array([-1, 1, 0])),
            run_time=0.9,
        )
        # 5.4 s – 5.5 s: integral fade_out
        self.play(_Part(integral_out, 0.9, 1), run_time=0.1)
        # 5.5 s – 5.9 s: line tween
        self.play(
            _Tween(line[0], (1, -1, 1.4, 40, -1, 1), (1, -1, 1, 0, 1, -1), rate_func=double_smooth),
            run_time=0.4,
        )
        # 5.9 s – 6 s
        self.wait(0.1)
