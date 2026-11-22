# Route coincident — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 120 frames, like the editor's video export.
from manim import *


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


def _route_paths(animation, pieces):
    """Gives each piece of a transform of two groups the path of its own route. `pieces` are
    (source, target, path), one for each piece in the order Manim animates them (the glyphs of
    the two groups as it aligns them, the group with fewer glyphs repeating some of its own):
    the glyph `source` on its way to the glyph `target` along the path function `path`,
    None for a straight one. Manim gives a path function nothing but the points of a piece,
    which two glyphs drawn on one spot share, so a piece is known by which mobject it is. If
    the transform turns out to have other pieces than these (a glyph without points is none),
    each takes the path of the route that starts and ends nearest to it instead (the centres
    of the glyphs as they are when the animation is made)."""
    def centre(mobject):
        points = np.asarray(mobject.get_all_points(), float)
        return None if points.size == 0 else (points.min(axis=0) + points.max(axis=0)) / 2

    table = [(centre(source), centre(target), path) for source, target, path in pieces]
    table = [row for row in table if row[0] is not None and row[1] is not None]

    def straight(start, end, alpha):
        return start + (end - start) * alpha

    def nearest(start, end, alpha):
        start, end = np.asarray(start, float), np.asarray(end, float)
        if start.size == 0 or not table:
            return start + (end - start) * alpha
        flat_start = start.reshape(-1, start.shape[-1])
        flat_end = end.reshape(-1, end.shape[-1])
        a = (flat_start.min(axis=0) + flat_start.max(axis=0)) / 2
        b = (flat_end.min(axis=0) + flat_end.max(axis=0)) / 2
        own = min(table, key=lambda r: np.linalg.norm(a - r[0]) + np.linalg.norm(b - r[1]))[2]
        return start + (end - start) * alpha if own is None else own(start, end, alpha)

    paths = None

    def interpolate_submobject(submobject, start, target, alpha):
        # The pieces are there once the animation begins: Manim aligns the two groups then.
        nonlocal paths
        if paths is None:
            members = [m for m in animation.mobject.get_family() if m.get_num_points() > 0]
            paths = {}
            if len(members) == len(pieces):
                paths = {id(m): piece[2] or straight for m, piece in zip(members, pieces)}
        submobject.interpolate(start, target, alpha, paths.get(id(submobject), nearest))
        return animation

    animation.interpolate_submobject = interpolate_submobject
    return animation


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"
        template = TexTemplate()
        template.add_to_preamble(r"\usepackage{mathtools}")

        # twice: \mathrlap{x}x
        twice = MathTex(r"\mathrlap{x}x", tex_template=template)
        twice.scale(2).move_to([-2, 1, 0])
        twice.set_z_index(2)

        # once: x
        once = MathTex(r"x", color="#83C167")
        once.scale(2).move_to([2, 0, 0])
        once.set_z_index(1)

        # twice: \mathrlap{x}x
        twice_2 = MathTex(r"\mathrlap{x}x", tex_template=template)
        twice_2.scale(2).move_to([-2, -1, 0])

        self.add(twice)
        # 0 s – 0.5 s
        self.wait(0.5)
        # 0.5 s – 1.5 s: twice → once
        self.play(
            _route_paths(ReplacementTransform(twice[0][:2], VGroup(once[0][0]), rate_func=linear), [(twice[0][0], once[0][0], _spline_path([((0, 0), None, (0.25, 0.5)), ((1, 0), (0.75, 0.5), None)])), (twice[0][1], once[0][0], _spline_path([((0, 0), None, (0.25, -0.5)), ((1, 0), (0.75, -0.5), None)]))]),
            run_time=1,
        )
        # 1.5 s – 2 s
        self.wait(0.5)
        self.remove(twice[0][2])
        # 2 s – 3 s: once → twice_2
        self.play(
            _route_paths(ReplacementTransform(VGroup(once[0][0]), twice_2[0][:2], rate_func=linear), [(once[0][0], twice_2[0][0], _spline_path([((0, 0), None, (0.25, 0.5)), ((1, 0), (0.75, 0.5), None)])), (once[0][0], twice_2[0][1], _spline_path([((0, 0), None, (0.25, -0.5)), ((1, 0), (0.75, -0.5), None)]))]),
            run_time=1,
        )
        # 3 s – 3.5 s
        self.wait(0.5)
        # 3.5 s – 4 s: twice_2 fade_out
        self.play(FadeOut(twice_2[0][:2]), run_time=0.5)
