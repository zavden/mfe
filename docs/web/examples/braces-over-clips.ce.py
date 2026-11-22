# One brace over two clips — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 OneBraceOverTwoClips.py OneBraceOverTwoClips
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 570 frames, like the editor's video export.
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


class OneBraceOverTwoClips(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # first: x + y = 10
        first = MathTex(r"x + y = 10", font_size=96)
        first_g = _glyphs(first, [
            (-2.3284, -0.0172, 0.5591, 0.5201), (-1.2897, 0.023, 0.7646, 0.7635), (-0.2908, -0.1282, 0.5461, 0.7436), (0.7402, 0.0224, 0.7646, 0.2687),
            (1.7985, 0.1177, 0.3949, 0.7646), (2.3662, 0.1051, 0.4834, 0.7899),
        ])
        first.move_to([-2.29, 1, 0])

        # second: x - y = 2
        second = MathTex(r"x - y = 2", font_size=96)
        second_g = _glyphs(second, [
            (-2.035, -0.0172, 0.5591, 0.5201), (-0.9963, 0.0224, 0.7003, 0.0459), (0.0026, -0.1282, 0.5461, 0.7436), (1.0335, 0.0224, 0.7646, 0.2687),
            (2.0855, 0.1177, 0.4581, 0.7646),
        ])
        second.move_to([-2.54, -0.7, 0])
        second.set_z_index(1)

        # b1: brace, built on first and second where its clip starts

        # solution: x = 6,\ y = 4
        solution = MathTex(r"x = 6,\ y = 4", font_size=72, color="#5CD0B3")
        solution_g = _glyphs(solution, [
            (-2.7624, -0.0232, 0.5522, 0.5136), (-1.6736, 0.0159, 0.7551, 0.2653), (-0.6356, 0.0975, 0.4701, 0.78), (-0.1874, -0.3093, 0.1497, 0.3579),
            (0.7303, -0.1328, 0.5393, 0.7343), (1.7484, 0.0159, 0.7551, 0.2653), (2.7873, 0.1162, 0.5023, 0.7676),
        ])
        solution.set_z_index(3)

        # 0 s – 1.2 s: first write
        self.play(Write(VGroup(*first_g[:])), run_time=1.2)
        # 1.2 s – 2.2 s: second write
        self.play(Write(VGroup(*second_g[:])), run_time=1)
        # 2.2 s – 3.2 s
        self.wait(1)
        b1 = Brace(VGroup(first, second), RIGHT, buff=0.2, color="#5CD0B3")
        b1.set_z_index(2)
        b1.put_at_tip(solution, buff=0.25)
        # 3.2 s – 3.9 s: b1 grow_from_center, solution fade_in
        self.play(GrowFromCenter(b1), FadeIn(solution), run_time=0.7)
        # 3.9 s – 8.7 s
        self.wait(4.8)
        # 8.7 s – 9.5 s: b1 fade_out, first fade_out, solution fade_out, second fade_out
        self.play(FadeOut(b1), FadeOut(first), FadeOut(solution), FadeOut(second), run_time=0.8)
