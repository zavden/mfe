# Curved glyph animation pivots — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 12 fps:
#     manim -r 480,270 --fps 12 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 12 fps, so the video has
# exactly 60 frames, like the editor's video export.
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


class _Wiggle(Animation):
    """ManimCE's Wiggle about a pivot fixed when it begins: Manim reads the centre again while it
    moves the glyphs one by one, which drifts it, and ManimGL's WiggleOutThenIn refuses an
    array pivot."""

    def __init__(self, mobject, scale_value=1.1, rotation_angle=0.01 * TAU, n_wiggles=6, **kwargs):
        self.scale_value, self.rotation_angle, self.n_wiggles = scale_value, rotation_angle, n_wiggles
        super().__init__(mobject, **kwargs)

    def begin(self):
        # A copy: ManimGL's get_center() is a view into the bounding box, which scale and
        # rotate rewrite in place.
        self.pivot = np.array(self.mobject.get_center())
        super().begin()

    def interpolate_submobject(self, submob, start, alpha):
        submob.match_points(start)
        submob.scale(interpolate(1, self.scale_value, there_and_back(alpha)), about_point=self.pivot)
        submob.rotate(wiggle(alpha, self.n_wiggles) * self.rotation_angle, about_point=self.pivot)


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # parts: bcs
        parts = MathTex(r"bcs")
        parts_g = _glyphs(parts, [
            (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1), (0.875, 0, 0.6875, 1),
        ])
        parts.scale(2.5).stretch(-1, 0).move_to([-3, 1.5, 0]).rotate(40 * DEGREES)
        parts.set_z_index(3)

        # wavy: cs\int
        wavy = MathTex(r"cs\int")
        wavy_g = _glyphs(wavy, [
            (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1), (0.875, 0, 0.6875, 1),
        ])
        wavy.scale(2.3).stretch(-1, 1).move_to([2.5, 1.5, 0]).rotate(60 * DEGREES)
        wavy.set_z_index(2)

        # intro0: b
        intro0 = MathTex(r"b")
        intro0_g = _glyphs(intro0, [
            (0, 0, 0.6875, 1),
        ])
        intro0.scale(3).move_to([-3, -2, 0]).rotate(40 * DEGREES)
        intro0.set_z_index(1)

        # intro1: b
        intro1 = MathTex(r"b")
        intro1_g = _glyphs(intro1, [
            (0, 0, 0.6875, 1),
        ])
        intro1.scale(3).move_to([2, -2, 0]).rotate(40 * DEGREES)

        self.add(parts)
        self.add(wavy)
        intro0_in = FadeIn(intro0, scale=2, rate_func=linear)
        intro1_in = GrowFromCenter(intro1, rate_func=linear)
        # 0 s – 0.5 s: intro0 fade_in, intro1 grow_from_center
        self.play(_Part(intro0_in, 0, 0.5), _Part(intro1_in, 0, 0.5), run_time=0.5)
        parts_pivot = parts_g[0].get_center()
        parts_part = _Tween(VGroup(parts_g[0]), (parts_pivot[0], parts_pivot[1], 1, 0, 1, 1), (parts_pivot[0], parts_pivot[1], 2, 25, 1, 1), rate_func=linear)
        wavy_wiggle = _Wiggle(VGroup(wavy_g[0], wavy_g[1]), scale_value=1.4, rotation_angle=25 * DEGREES, n_wiggles=3)
        # 0.5 s – 1 s: intro0 fade_in, intro1 grow_from_center, parts part, wavy wiggle
        self.play(
            _Part(intro0_in, 0.5, 1),
            _Part(intro1_in, 0.5, 1),
            _Part(parts_part, 0, 0.5),
            _Part(wavy_wiggle, 0, 0.25),
            run_time=0.5,
        )
        # 1 s – 1.5 s: parts part, wavy wiggle
        self.play(_Part(parts_part, 0.5, 1), _Part(wavy_wiggle, 0.25, 0.5), run_time=0.5)
        # 1.5 s – 2 s: wavy wiggle
        self.play(_Part(wavy_wiggle, 0.5, 0.75), run_time=0.5)
        parts_pivot_2 = VGroup(parts_g[0], parts_g[2]).get_center()
        parts_part_2 = _Tween(VGroup(parts_g[0], parts_g[2]), (parts_pivot_2[0], parts_pivot_2[1], 1, 0, 1, 1), (parts_pivot_2[0] + 0.4, parts_pivot_2[1] + 0.2, 0.6, -35, 1, 1), rate_func=linear)
        # 2 s – 2.5 s: wavy wiggle, parts part
        self.play(_Part(wavy_wiggle, 0.75, 1), _Part(parts_part_2, 0, 0.5), run_time=0.5)
        # 2.5 s – 3 s: parts part
        self.play(_Part(parts_part_2, 0.5, 1), run_time=0.5)
        # 3 s – 3.5 s
        self.wait(0.5)
        parts_indicate = Indicate(parts_g[0], scale_factor=1.8)
        # 3.5 s – 4 s: parts indicate
        self.play(_Part(parts_indicate, 0, 0.5), run_time=0.5)
        intro0_out = FadeOut(intro0, scale=2, rate_func=linear)
        intro1_out = ShrinkToCenter(intro1, rate_func=linear, remover=True)
        # 4 s – 4.5 s: parts indicate, intro0 fade_out, intro1 shrink_to_center
        self.play(
            _Part(parts_indicate, 0.5, 1),
            _Part(intro0_out, 0, 0.5),
            _Part(intro1_out, 0, 0.5),
            run_time=0.5,
        )
        # 4.5 s – 5 s: intro0 fade_out, intro1 shrink_to_center
        self.play(_Part(intro0_out, 0.5, 1), _Part(intro1_out, 0.5, 1), run_time=0.5)
