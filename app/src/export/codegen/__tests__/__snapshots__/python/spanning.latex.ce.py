# Spanning — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 240 frames, like the editor's video export.
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


def _circle_around(mobject, buff=0.1, color=WHITE, **kwargs):
    """A circle through the corners of the mobject's box, `buff` further out, centred on it."""
    radius = np.hypot(mobject.get_width(), mobject.get_height()) / 2 + buff
    return Circle(radius=radius, stroke_color=color, fill_color=color, **kwargs).move_to(mobject)


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # left: x^2+bx
        left = MathTex(r"x^2+bx")
        left[0][0].set_color("#FFFF00")
        left.scale(1.2).move_to([-2.5, 1.2, 0]).rotate(15 * DEGREES)
        left.set_z_index(11)

        # right: c=0
        right = MathTex(r"c=0", font_size=60, color="#58C4DD")
        right.move_to([2, -0.4, 0])
        right.set_z_index(10)

        # title: Two at once
        title = Tex(r"Two at once", font_size=40, color="#83C167")
        title.move_to([0, -2.6, 0])
        title.set_z_index(9)

        # highlight: box, built on right and title where its clip starts

        # below: brace, built on left and right where its clip starts

        # box: box, built on left and right where its clip starts

        # above: brace, built on right and left where its clip starts

        # side: brace, built on left and right where its clip starts

        # angle: brace, built on left and title where its clip starts

        # label: 2a
        label = MathTex(r"2a", font_size=36, color="#58C4DD")

        # circle: circle, built on right and left where its clip starts

        # line: underline, built on left and right where its clip starts

        # cross: cross, built on left and right where its clip starts

        left_in = Write(left)
        # 0 s – 0.5 s: left write, right fade_in, title fade_in
        self.play(_Part(left_in, 0, 0.5), FadeIn(right), FadeIn(title), run_time=0.5)
        # 0.5 s – 1 s: left write
        self.play(_Part(left_in, 0.5, 1), run_time=0.5)
        # 1 s – 1.5 s
        self.wait(0.5)
        # 1.5 s – 2.5 s: left tween
        self.play(_Tween(left[0], (-2.5, 1.2, 1.2, 15, 1, 1), (-2, 0.8, 1, -10, 1, 1)), run_time=1)
        highlight = SurroundingRectangle(VGroup(right, title), buff=0, color="#FFFF00", stroke_width=0, fill_opacity=0.3, stroke_opacity=0)
        highlight.set_z_index(12)
        # 2.5 s – 3 s: highlight fade_in
        self.play(FadeIn(highlight), run_time=0.5)
        below = Brace(VGroup(left[0][3:], right[0][0]), DOWN, buff=0.25, color="#58C4DD")
        below.set_z_index(8)
        box = SurroundingRectangle(VGroup(left[0][2:4], right[0][0]), buff=0.15, color="#FFFF00", corner_radius=0.15)
        box.set_z_index(4)
        below_in = GrowFromCenter(below)
        box_in = Create(box)
        # 3 s – 3.5 s: below grow_from_center, box create
        self.play(_Part(below_in, 0, 0.5), _Part(box_in, 0, 0.5), run_time=0.5)
        above = Brace(VGroup(right, left), UP, buff=0.3, sharpness=1.2, color="#83C167")
        above.set_z_index(7)
        # 3.5 s – 4 s: below grow_from_center, box create, above fade_in
        self.play(_Part(below_in, 0.5, 1), _Part(box_in, 0.5, 1), FadeIn(above), run_time=0.5)
        side = Brace(VGroup(left[0][:2], right[0][1:]), RIGHT, buff=0.15, color="#FC6255")
        side.set_z_index(6)
        self.add(side)
        # 4 s – 4.5 s
        self.wait(0.5)
        angle = Brace(VGroup(left, title[0][:3]), rotate_vector(DOWN, 30 * DEGREES), buff=0.2, color="#FFFF00")
        angle.set_z_index(5)
        label.next_to(below, DOWN, buff=0.1)
        # 4.5 s – 5 s: angle grow_from_center, label fade_in
        self.play(GrowFromCenter(angle), FadeIn(label), run_time=0.5)
        circle = _circle_around(VGroup(right[0][2], left[0][4]), buff=0.1, color="#FC6255")
        circle.set_z_index(3)
        circle_in = Write(circle)
        # 5 s – 5.5 s: circle write
        self.play(_Part(circle_in, 0, 0.5), run_time=0.5)
        line = Underline(VGroup(left, right), buff=0.2, color="#58C4DD")
        line.set_z_index(2)
        # 5.5 s – 6 s: circle write, line create
        self.play(_Part(circle_in, 0.5, 1), Create(line), run_time=0.5)
        cross = Cross(VGroup(left[0][2], right[0][1]), stroke_color="#FC6255")
        cross.set_z_index(1)
        # 6 s – 7 s: cross write
        self.play(Write(cross), run_time=1)
        # 7 s – 8 s
        self.wait(1)
