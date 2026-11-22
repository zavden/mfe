# Shared targets — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 150 frames, like the editor's video export.
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
    def construct(self):
        self.camera.background_color = "#000000"

        # letters: abcdefghij
        letters = MathTex(r"abcdefghij")
        letters.scale(1.5).move_to([-2, 2, 0])
        letters.set_z_index(2)

        # others: wxy
        others = MathTex(r"wxy", color="#83C167")
        others.scale(2).move_to([-2, 0, 0])
        others.set_z_index(1)

        # rows: x+y \\ y+x
        rows = MathTex(r"x+y \\ y+x")
        rows.move_to([2.5, 0, 0])

        # 0 s – 0.5 s: letters fade_in
        self.play(FadeIn(letters), run_time=0.5)
        # 0.5 s – 1 s
        self.wait(0.5)
        letters_to_others = [
            ReplacementTransform(letters[0][0], others[0][0], path_func=_spline_path([((0, 0), None, (0.25, 0.45)), ((1, 0), (0.75, 0.45), None)]), rate_func=linear),
            Transform(letters[0][1].copy(), others[0][0], path_func=_spline_path([((0, 0), None, (0.2, -0.3)), ((0.5, 0.1), (0.35, -0.2), (0.65, 0.4)), ((1, 0), (0.9, 0.3), None)]), rate_func=linear, remover=True),
            FadeTransform(letters[0][2], others[0][1], rate_func=linear),
            Transform(letters[0][3], others[0][1], rate_func=linear, remover=True),
            ReplacementTransform(letters[0][4], others[0][2], rate_func=linear),
            FadeTransform(letters[0][5], others[0][2], rate_func=linear),
            Transform(letters[0][6], others[0][0], rate_func=linear, remover=True),
            Transform(letters[0][7], others[0][0], rate_func=linear, remover=True),
            Transform(letters[0][8].copy(), others[0][1], rate_func=linear, remover=True),
            Transform(letters[0][9], others[0][1], rate_func=linear, remover=True),
        ]
        # 1 s – 1.5 s: letters → others, rows write
        self.play(
            *(_Part(a, 0, 1 / 3) for a in letters_to_others),
            Write(rows[0][:3]),
            run_time=0.5,
        )
        # 1.5 s – 2 s: letters → others
        self.play(*(_Part(a, 1 / 3, 2 / 3) for a in letters_to_others), run_time=0.5)
        rows_morph = [
            ReplacementTransform(rows[0][0].copy(), rows[0][5]),
            Transform(rows[0][2], rows[0][5], path_func=_spline_path([((0, 0), None, (0.25, 0.45)), ((1, 0), (0.75, 0.45), None)]), remover=True),
        ]
        # 2 s – 2.5 s: letters → others, rows morph
        self.play(
            *(_Part(a, 2 / 3, 1) for a in letters_to_others),
            *(_Part(a, 0, 1 / 3) for a in rows_morph),
            run_time=0.5,
        )
        # 2.5 s – 3.5 s: rows morph
        self.play(*(_Part(a, 1 / 3, 1) for a in rows_morph), run_time=1)
        # 3.5 s – 4 s: letters fade_out
        self.play(FadeOut(VGroup(letters[0][1], letters[0][8])), run_time=0.5)
        # 4 s – 4.5 s
        self.wait(0.5)
        # 4.5 s – 5 s: others fade_out, rows fade_out
        self.play(
            FadeOut(others),
            FadeOut(VGroup(rows[0][0], rows[0][1], rows[0][5])),
            run_time=0.5,
        )
