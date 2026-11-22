# Part transforms — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 180 frames, like the editor's video export.
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
    None, and `stroke` a (from, to) pair of stroke opacities, one pair per glyph, or None."""

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
            stroke = self.stroke[i] if isinstance(self.stroke, list) else self.stroke
            s = stroke[0] + (stroke[1] - stroke[0]) * t if stroke else None
            if fill or s is not None:
                glyph.set_stroke(fill, opacity=s)


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # sum: a+b+c
        sum = Tex(r"a+b+c")
        sum.set_color("#58C4DD")
        sum_g = _glyphs(sum, [
            (-1.75, 0, 0.6875, 1), (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1), (0.875, 0, 0.6875, 1),
            (1.75, 0, 0.6875, 1),
        ])
        sum.move_to([0, 1.2, 0])
        sum.set_z_index(1)

        # prod: xy=z
        prod = Tex(r"xy=z")
        prod_g = _glyphs(prod, [
            (-1.3125, 0, 0.6875, 1), (-0.4375, 0, 0.6875, 1), (0.4375, 0, 0.6875, 1), (1.3125, 0, 0.6875, 1),
        ])
        prod.move_to([0, -1.2, 0])

        sum_in = Write(VGroup(*sum_g[:]), stroke_color="#58C4DD")
        # 0 s – 0.5 s: sum write
        self.play(_Part(sum_in, 0, 0.5), run_time=0.5)
        # 0.5 s – 1 s: sum write, prod fade_in
        self.play(_Part(sum_in, 0.5, 1), FadeIn(VGroup(prod_g[0], prod_g[1])), run_time=0.5)
        # 1 s – 1.2 s
        self.wait(0.2)
        sum_pivot = sum_g[0].get_center()
        sum_part = sum_g[0].animate.scale(1.5, about_point=sum_pivot).shift(0.6 * UP).build()
        sum_pivot_2 = sum_g[4].get_center()
        sum_part_2 = _Tween(VGroup(sum_g[4]), (sum_pivot_2[0], sum_pivot_2[1], 1, 0, 1, 1), (sum_pivot_2[0], sum_pivot_2[1], 1, 90, 1, 1), colors=[("#58C4DD", "#FC6255")])
        # 1.2 s – 1.3 s: sum part, sum part
        self.play(_Part(sum_part, 0, 1 / 6), _Part(sum_part_2, 0, 1 / 6), run_time=0.1)
        prod_g[3].shift(0.5 * RIGHT).set_color("#83C167")
        # 1.3 s – 1.7 s: sum part, sum part, prod part
        self.play(_Part(sum_part, 1 / 6, 5 / 6), _Part(sum_part_2, 1 / 6, 5 / 6), run_time=0.4)
        # 1.7 s – 1.8 s: sum part, sum part
        self.play(_Part(sum_part, 5 / 6, 1), _Part(sum_part_2, 5 / 6, 1), run_time=0.1)
        # 1.8 s – 2.2 s
        self.wait(0.4)
        sum_move = sum.animate.scale(0.8, about_point=[0, 1.2, 0]).shift(np.array([-1, 0.3, 0])).build()
        # 2.2 s – 2.5 s: sum tween
        self.play(_Part(sum_move, 0, 0.5), run_time=0.3)
        prod_appear = Write(VGroup(prod_g[3]), stroke_color="#FFFFFF")
        # 2.5 s – 2.8 s: sum tween, prod write
        self.play(_Part(sum_move, 0.5, 1), _Part(prod_appear, 0, 0.5), run_time=0.3)
        # 2.8 s – 3 s: prod write
        self.play(_Part(prod_appear, 0.5, 5 / 6), run_time=0.2)
        sum_to_prod = TransformFromCopy(sum_g[4], prod_g[2])
        # 3 s – 3.1 s: prod write, sum → prod
        self.play(_Part(prod_appear, 5 / 6, 1), _Part(sum_to_prod, 0, 1 / 6), run_time=0.1)
        # 3.1 s – 3.2 s: sum → prod
        self.play(_Part(sum_to_prod, 1 / 6, 1 / 3), run_time=0.1)
        sum_pivot_3 = VGroup(*sum_g[1:4]).get_center()
        sum_part_3 = _Tween(VGroup(*sum_g[1:4]), (sum_pivot_3[0], sum_pivot_3[1], 1, 0, 1, 1), (sum_pivot_3[0] + 0.3, sum_pivot_3[1] - 0.4, 0.7, -30, 1, 1), opacity=(1, 0.5), stroke=(1, 0.5))
        # 3.2 s – 3.5 s: sum → prod, sum part
        self.play(_Part(sum_to_prod, 1 / 3, 5 / 6), _Part(sum_part_3, 0, 0.5), run_time=0.3)
        prod_pivot = VGroup(prod_g[0], prod_g[1]).get_center()
        prod_part = _Tween(VGroup(prod_g[0], prod_g[1]), (prod_pivot[0], prod_pivot[1], 1, 0, 1, 1), (prod_pivot[0] - 0.3, prod_pivot[1] + 0.2, 1, 180, 1, 1))
        # 3.5 s – 3.6 s: sum → prod, sum part, prod part
        self.play(
            _Part(sum_to_prod, 5 / 6, 1),
            _Part(sum_part_3, 0.5, 2 / 3),
            _Part(prod_part, 0, 0.125),
            run_time=0.1,
        )
        # 3.6 s – 3.8 s: sum part, prod part
        self.play(_Part(sum_part_3, 2 / 3, 1), _Part(prod_part, 0.125, 0.375), run_time=0.2)
        # 3.8 s – 4.2 s: prod part
        self.play(_Part(prod_part, 0.375, 0.875), run_time=0.4)
        sum_part_4 = sum_g[0].animate(rate_func=there_and_back).shift(0.6 * DOWN).build()
        sum_pivot_4 = sum_g[4].get_center()
        sum_part_5 = sum_g[4].animate(rate_func=rush_into).scale(0.5, about_point=sum_pivot_4).build()
        # 4.2 s – 4.3 s: prod part, sum part, sum part
        self.play(
            _Part(prod_part, 0.875, 1),
            _Part(sum_part_4, 0, 1 / 6),
            _Part(sum_part_5, 0, 0.2),
            run_time=0.1,
        )
        # 4.3 s – 4.5 s: sum part, sum part
        self.play(_Part(sum_part_4, 1 / 6, 0.5), _Part(sum_part_5, 0.2, 0.6), run_time=0.2)
        prod_disappear = FadeOut(VGroup(prod_g[1]))
        # 4.5 s – 4.7 s: sum part, sum part, prod fade_out
        self.play(
            _Part(sum_part_4, 0.5, 5 / 6),
            _Part(sum_part_5, 0.6, 1),
            _Part(prod_disappear, 0, 0.5),
            run_time=0.2,
        )
        # 4.7 s – 4.8 s: sum part, prod fade_out
        self.play(_Part(sum_part_4, 5 / 6, 1), _Part(prod_disappear, 0.5, 0.75), run_time=0.1)
        # 4.8 s – 4.9 s: prod fade_out
        self.play(_Part(prod_disappear, 0.75, 1), run_time=0.1)
        # 4.9 s – 5 s
        self.wait(0.1)
        sum_pivot_5 = VGroup(sum_g[1], sum_g[4]).get_center()
        sum_part_6 = _Tween(VGroup(sum_g[1], sum_g[4]), (sum_pivot_5[0], sum_pivot_5[1], 1, 0, 1, 1), (sum_pivot_5[0], sum_pivot_5[1], 1, 30, 1, 1), opacity=[(0.5, 0.8), (1, 0.8)], stroke=[(0.5, 0.8), (1, 0.8)])
        # 5 s – 5.1 s: sum part
        self.play(_Part(sum_part_6, 0, 0.25), run_time=0.1)
        prod_pivot_2 = prod_g[0].get_center()
        prod_part_2 = prod_g[0].animate.scale(1.5, about_point=prod_pivot_2).build()
        # 5.1 s – 5.4 s: sum part, prod part
        self.play(_Part(sum_part_6, 0.25, 1), _Part(prod_part_2, 0, 0.75), run_time=0.3)
        # 5.4 s – 5.5 s: prod part
        self.play(_Part(prod_part_2, 0.75, 1), run_time=0.1)
        # 5.5 s – 6 s: sum fade_out, prod fade_out
        self.play(FadeOut(sum), FadeOut(VGroup(prod_g[0], prod_g[2], prod_g[3])), run_time=0.5)
