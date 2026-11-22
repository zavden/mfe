# Fade copy paths — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 120 frames, like the editor's video export.
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


def _spline_path(nodes):
    """The path function of a custom path, for `path_func=`: takes the points at the start,
    the points at the end and alpha, like Manim's own arc paths. `nodes` are anchors with
    their handles — ((u, v), in, out), a handle None when it sits on its anchor — in the
    chord's frame: u along the chord from the centre of the points at the start to their
    centre at the end, v across it to the left, as fractions of the chord's length. The
    centre travels the curve at a uniform speed by arc length (64 samples per segment, as
    the editor does) and every point moves straight, shifted by where the curve lies off
    the chord; a chord of no length plays straight."""
    anchors = [np.array(a, float) for a, _, _ in nodes]
    segments = []
    for (a, _, out), (b, into, _) in zip(nodes, nodes[1:]):
        p0, p3 = np.array(a, float), np.array(b, float)
        if out is None and into is None:
            p1, p2 = p0 + (p3 - p0) / 3, p0 + 2 * (p3 - p0) / 3
        else:
            p1 = p0 if out is None else np.array(out, float)
            p2 = p3 if into is None else np.array(into, float)
        segments.append((p0, p1, p2, p3))

    def bezier(k, t):
        p0, p1, p2, p3 = segments[k]
        return ((1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1
                + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3)

    steps = 64
    ts = np.linspace(0.0, 1.0, steps + 1)[:, None]
    lengths = np.concatenate([[0.0], *[
        np.linalg.norm(np.diff(bezier(k, ts), axis=0), axis=1) for k in range(len(segments))
    ]]).cumsum()

    def point_at(alpha):
        if lengths[-1] <= 0 or alpha <= 0:
            return anchors[0]
        if alpha >= 1:
            return anchors[-1]
        target = alpha * lengths[-1]
        i = min(int(np.searchsorted(lengths, target, side="right")) - 1, len(lengths) - 2)
        step = lengths[i + 1] - lengths[i]
        g = (i + ((target - lengths[i]) / step if step > 0 else 0.0)) / steps
        k = min(int(g), len(segments) - 1)
        return bezier(k, g - k)

    def path(start, end, alpha):
        start, end = np.asarray(start, float), np.asarray(end, float)
        straight = start + (end - start) * alpha
        if start.size == 0:
            return straight
        flat_start = start.reshape(-1, start.shape[-1])
        flat_end = end.reshape(-1, end.shape[-1])
        a = (flat_start.min(axis=0) + flat_start.max(axis=0)) / 2
        b = (flat_end.min(axis=0) + flat_end.max(axis=0)) / 2
        cx, cy = (b - a)[:2]
        if cx * cx + cy * cy <= 1e-24:
            return straight
        u, v = point_at(alpha) - (anchors[0] + (anchors[-1] - anchors[0]) * alpha)
        shift = np.zeros(start.shape[-1])
        shift[:2] = (cx * u - cy * v, cy * u + cx * v)
        return straight + shift

    return path


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # rows: a+b \\ b+a
        rows = Tex(r"a+b \\ b+a")
        rows_g = _glyphs(rows, [
            (-2.1875, 0, 0.6875, 1), (-1.3125, 0, 0.6875, 1), (-0.4375, 0, 0.6875, 1), (0.4375, 0, 0.6875, 1),
            (1.3125, 0, 0.6875, 1), (2.1875, 0, 0.6875, 1),
        ])
        rows.move_to([-4, 1.5, 0])
        rows.set_z_index(2)

        # sum: a+b=c
        sum = Tex(r"a+b=c")
        sum_g = _glyphs(sum, [
            (-1.75, 0, 0.6875, 1), (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1), (0.875, 0, 0.6875, 1),
            (1.75, 0, 0.6875, 1),
        ])
        sum.move_to([1.5, 2, 0])

        # swap: c=a+b
        swap = Tex(r"c=a+b")
        swap.set_color("#83C167")
        swap_g = _glyphs(swap, [
            (-1.75, 0, 0.6875, 1), (-0.875, 0, 0.6875, 1), (0, 0, 0.6875, 1), (0.875, 0, 0.6875, 1),
            (1.75, 0, 0.6875, 1),
        ])
        swap.move_to([1.5, -0.5, 0])
        swap.set_z_index(1)

        # 0 s – 0.8 s: rows write, sum write
        self.play(
            Write(VGroup(*rows_g[:3]), stroke_color="#FFFFFF"),
            Write(VGroup(*sum_g[:]), stroke_color="#FFFFFF"),
            run_time=0.8,
        )
        # 0.8 s – 0.9 s
        self.wait(0.1)
        sum_pivot = sum_g[0].get_center()
        sum_part = _Tween(VGroup(sum_g[0]), (sum_pivot[0], sum_pivot[1], 1, 0, 1, 1), (sum_pivot[0], sum_pivot[1] - 0.4, 1, 20, 1, 1), colors=[("#FFFFFF", "#FC6255")])
        # 0.9 s – 1 s: sum part
        self.play(_Part(sum_part, 0, 0.25), run_time=0.1)
        rows_morph = [
            TransformFromCopy(rows_g[0], rows_g[5], path_func=_spline_path([((0, 0), None, (0.25, 0.45)), ((1, 0), (0.75, 0.45), None)])),
            FadeTransform(rows_g[1].copy(), rows_g[4], path_func=_spline_path([((0, 0), None, (0.3, -0.5)), ((1, 0), (0.7, -0.5), None)])),
            ReplacementTransform(rows_g[2], rows_g[3], path_func=_spline_path([((0, 0), None, (0.3, -0.5)), ((1, 0), (0.7, -0.5), None)])),
        ]
        # 1 s – 1.3 s: sum part, rows morph
        self.play(_Part(sum_part, 0.25, 1), *(_Part(a, 0, 0.3) for a in rows_morph), run_time=0.3)
        # 1.3 s – 1.4 s: rows morph
        self.play(*(_Part(a, 0.3, 0.4) for a in rows_morph), run_time=0.1)
        sum_to_swap = [
            FadeTransform(sum_g[0].copy().set_z_index(1), swap_g[2], path_func=_spline_path([((0, 0), None, (0.25, 0.45)), ((1, 0), (0.75, 0.45), None)])),
            FadeTransform(sum_g[2].copy().set_z_index(1), swap_g[4], path_func=_spline_path([((0, 0), None, (0.3, -0.5)), ((1, 0), (0.7, -0.5), None)])),
            FadeTransform(sum_g[4].copy().set_z_index(1), swap_g[0]),
            FadeTransform(VGroup(sum_g[1], sum_g[3]).copy().set_z_index(1), VGroup(swap_g[1], swap_g[3])),
        ]
        # 1.4 s – 2 s: rows morph, sum → swap
        self.play(
            *(_Part(a, 0.4, 1) for a in rows_morph),
            *(_Part(a, 0, 2 / 3) for a in sum_to_swap),
            run_time=0.6,
        )
        # 2 s – 2.3 s: sum → swap
        self.play(*(_Part(a, 2 / 3, 1) for a in sum_to_swap), run_time=0.3)
        # 2.3 s – 2.4 s
        self.wait(0.1)
        # 2.4 s – 2.8 s: swap fade_out
        self.play(FadeOut(VGroup(swap_g[2])), run_time=0.4)
        sum_move = sum.animate.scale(1.2, about_point=[1.5, 2, 0]).shift(np.array([0.5, 0.5, 0])).build()
        # 2.8 s – 3.1 s: sum tween
        self.play(_Part(sum_move, 0, 0.6), run_time=0.3)
        swap_appear = FadeIn(VGroup(swap_g[2]))
        # 3.1 s – 3.3 s: sum tween, swap fade_in
        self.play(_Part(sum_move, 0.6, 1), _Part(swap_appear, 0, 0.5), run_time=0.2)
        # 3.3 s – 3.5 s: swap fade_in
        self.play(_Part(swap_appear, 0.5, 1), run_time=0.2)
        # 3.5 s – 4 s: rows fade_out, sum fade_out, swap fade_out
        self.play(
            FadeOut(VGroup(rows_g[0], rows_g[1], *rows_g[3:])),
            FadeOut(sum),
            FadeOut(swap),
            run_time=0.5,
        )
