# Seven pairs — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 SevenPairs.py SevenPairs
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 360 frames, like the editor's video export.
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


class SevenPairs(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # sum: a+b+c=d
        sum = MathTex(r"a+b+c=d", font_size=72)
        sum_g = _glyphs(sum, [
            (-3.3418, -0.1166, 0.6095, 0.5812), (-2.2197, -0.0715, 0.8582, 0.857), (-1.1344, 0.0457, 0.4923, 0.9085), (-0.0915, -0.0715, 0.8582, 0.857),
            (0.9949, -0.1175, 0.5099, 0.5855), (2.1134, -0.0722, 0.8582, 0.3015), (3.3308, 0.0464, 0.6314, 0.9072),
        ])
        sum.move_to([0, 1.8, 0])
        sum.set_z_index(1)

        # swap: d=c+b+a
        swap = MathTex(r"d=c+b+a", font_size=72)
        swap_g = _glyphs(swap, [
            (-3.314, 0.0464, 0.6314, 0.9072), (-2.1429, -0.0722, 0.8582, 0.3015), (-0.9849, -0.1175, 0.5099, 0.5855), (0.062, -0.0715, 0.8582, 0.857),
            (1.1473, 0.0457, 0.4923, 0.9085), (2.1901, -0.0715, 0.8582, 0.857), (3.325, -0.1166, 0.6095, 0.5812),
        ])
        swap.move_to([0, -1.8, 0])

        # 0 s – 1 s: sum write
        self.play(Write(VGroup(*sum_g[:])), run_time=1)
        # 1 s – 2.5 s
        self.wait(1.5)
        # 2.5 s – 4.5 s: sum → swap
        self.play(
            ReplacementTransform(sum_g[0], swap_g[6], path_func=_spline_path([((0, 0), None, (0.3, 0.35)), ((1, 0), (0.7, 0.35), None)])),
            ReplacementTransform(sum_g[1], swap_g[5], path_arc=30 * DEGREES),
            ReplacementTransform(sum_g[2], swap_g[4], path_func=_spline_path([((0, 0), None, (0.2, 0.3)), ((0.5, 0), (0.35, 0.3), (0.65, -0.3)), ((1, 0), (0.8, -0.3), None)])),
            ReplacementTransform(sum_g[3].copy(), swap_g[3], path_arc=30 * DEGREES),
            ReplacementTransform(sum_g[4], swap_g[2], path_func=_spline_path([((0, 0), None, None), ((0.5, 0.45), None, None), ((1, 0), None, None)])),
            FadeTransform(sum_g[5], swap_g[1], path_arc=30 * DEGREES),
            ReplacementTransform(sum_g[6], swap_g[0], path_func=_spline_path([((0, 0), None, (0.3, -0.35)), ((1, 0), (0.7, -0.35), None)])),
            run_time=2,
        )
        # 4.5 s – 5 s
        self.wait(0.5)
        # 5 s – 6 s: sum fade_out, swap fade_out
        self.play(FadeOut(sum_g[3]), FadeOut(swap), run_time=1)
