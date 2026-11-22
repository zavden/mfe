# Timing a relation — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 TimingARelation.py TimingARelation
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 390 frames, like the editor's video export.
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


class TimingARelation(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # before: x+x=4
        before = MathTex(r"x+x=4", font_size=96)
        before_g = _glyphs(before, [
            (-2.4038, -0.108, 0.6416, 0.5968), (-1.2119, -0.0619, 0.8775, 0.8762), (-0.0397, -0.108, 0.6416, 0.5968), (1.2256, -0.0626, 0.8775, 0.3083),
            (2.4328, 0.054, 0.5837, 0.892),
        ])
        before.move_to([-0.656, 1, 0])
        before.set_z_index(1)

        # after: 2x=4
        after = MathTex(r"2x=4", font_size=96)
        after_g = _glyphs(after, [
            (-1.7642, 0, 0.5799, 0.968), (-0.9953, -0.1708, 0.7078, 0.6584), (0.4004, -0.1206, 0.968, 0.3401), (1.7323, 0.008, 0.6439, 0.984),
        ])
        after.move_to([0, -1, 0])

        # 0 s – 1 s: before write
        self.play(Write(VGroup(*before_g[:])), run_time=1)
        # 1 s – 1.5 s
        self.wait(0.5)
        # 1.5 s – 2.3 s: after fade_in
        self.play(FadeIn(after_g[0]), run_time=0.8)
        # 2.3 s – 2.5 s
        self.wait(0.2)
        # 2.5 s – 3.5 s: before → after
        self.play(
            ReplacementTransform(before_g[0], after_g[1]),
            Transform(before_g[2], after_g[1], remover=True),
            ReplacementTransform(before_g[3], after_g[2]),
            ReplacementTransform(before_g[4], after_g[3]),
            run_time=1,
        )
        # 3.5 s – 4.2 s
        self.wait(0.7)
        # 4.2 s – 5 s: before fade_out
        self.play(FadeOut(before_g[1]), run_time=0.8)
        # 5 s – 6.5 s
        self.wait(1.5)
