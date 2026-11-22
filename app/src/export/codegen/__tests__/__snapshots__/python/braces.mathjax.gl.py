# Braces — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 240 frames, like the editor's video export.
from manimlib import *


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
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # poly: x^2+bx+c
        poly = Tex(r"x^2+bx+c")
        poly_g = _glyphs(poly, [
            (-2.625, 0, 0.6875, 1), (-1.75, 0, 0.6875, 1), (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1),
            (0.875, 0, 0.6875, 1), (1.75, 0, 0.6875, 1), (2.625, 0, 0.6875, 1),
        ])
        VGroup(poly_g[3], poly_g[4]).set_color("#FFFF00")
        poly.scale(1.3).move_to([0, 1, 0]).rotate(20 * DEGREES)
        poly.set_z_index(8)

        # title: A brace on text
        title = TexText(r"A brace on text", font_size=40)
        title.set_color("#83C167")
        title_g = _glyphs(title, [
            (-4.8125, 0, 0.6875, 1), (-3.9375, 0, 0.6875, 1), (-3.0625, 0, 0.6875, 1), (-2.1875, 0, 0.6875, 1),
            (-1.3125, 0, 0.6875, 1), (-0.4375, 0, 0.6875, 1), (0.4375, 0, 0.6875, 1), (1.3125, 0, 0.6875, 1),
            (2.1875, 0, 0.6875, 1), (3.0625, 0, 0.6875, 1), (3.9375, 0, 0.6875, 1), (4.8125, 0, 0.6875, 1),
        ])
        title.move_to([0, -2.4, 0])
        title.set_z_index(2)

        # above: brace, built on poly where its clip starts

        # ontext: brace, built on title where its clip starts

        # below: brace, built on poly where its clip starts

        # left: brace, built on poly where its clip starts

        # label: 2a
        label = Tex(r"2a", font_size=36)
        label.set_color("#58C4DD")
        label_g = _glyphs(label, [
            (-0.4375, 0, 0.6875, 1), (0.4375, 0, 0.6875, 1),
        ])

        # right: brace, built on poly where its clip starts

        # angle: brace, built on poly where its clip starts

        poly_in = Write(VGroup(*poly_g[:]), stroke_color="#FFFFFF")
        # 0 s – 0.5 s: poly write, title fade_in
        self.play(_Part(poly_in, 0, 0.5), FadeIn(title), run_time=0.5)
        # 0.5 s – 1 s: poly write
        self.play(_Part(poly_in, 0.5, 1), run_time=0.5)
        # 1 s – 1.5 s
        self.wait(0.5)
        above = Brace(poly, UP, buff=0.4)
        above.set_color("#83C167")
        above.set_z_index(6)
        poly_move = _Tween(VGroup(*poly_g[:]), (0, 1, 1.3, 20, 1, 1), (-0.5, 0.8, 1.1, -10, 1, 1))
        # 1.5 s – 2 s: poly tween, above fade_in
        self.play(_Part(poly_move, 0, 0.5), FadeIn(above), run_time=0.5)
        ontext = Brace(title, DOWN, buff=0.2)
        ontext.set_color("#FC6255")
        ontext.set_z_index(1)
        ontext_in = GrowFromCenter(ontext)
        # 2 s – 2.5 s: poly tween, ontext grow_from_center
        self.play(_Part(poly_move, 0.5, 1), _Part(ontext_in, 0, 0.5), run_time=0.5)
        # 2.5 s – 3 s: ontext grow_from_center
        self.play(_Part(ontext_in, 0.5, 1), run_time=0.5)
        below = Brace(VGroup(*poly_g[3:6]), DOWN, buff=0.25)
        below.set_color("#58C4DD")
        below.set_z_index(7)
        # 3 s – 4 s: below grow_from_center
        self.play(GrowFromCenter(below), run_time=1)
        # 4 s – 4.5 s
        self.wait(0.5)
        left = Brace(poly_g[0], LEFT, buff=0.15)
        left.set_color("#FC6255")
        left.set_z_index(5)
        label.next_to(below, DOWN, buff=0.1)
        self.add(left)
        # 4.5 s – 5 s: label fade_in
        self.play(FadeIn(label), run_time=0.5)
        right = Brace(VGroup(poly_g[5], poly_g[6]), RIGHT, buff=0.1)
        right.set_z_index(4)
        # 5 s – 5.5 s: right write
        self.play(Write(right, stroke_color="#FFFFFF"), run_time=0.5)
        # 5.5 s – 6 s
        self.wait(0.5)
        angle = Brace(poly, rotate_vector(DOWN, 30 * DEGREES), buff=0.2)
        angle.set_color("#FFFF00")
        angle.set_opacity(0.7)
        angle.set_z_index(3)
        # 6 s – 6.5 s: angle grow_from_center
        self.play(GrowFromCenter(angle), run_time=0.5)
        # 6.5 s – 8 s
        self.wait(1.5)
