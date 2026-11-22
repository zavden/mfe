# Recipe: cancel a factor — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 RecipeCancelAFactor.py RecipeCancelAFactor
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 318 frames, like the editor's video export.
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


class RecipeCancelAFactor(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # before: \frac{(x+1)(x-2)}{x+1}
        before = MathTex(r"\frac{(x+1)(x-2)}{x+1}", font_size=96)
        before_g = _glyphs(before, [
            (-1.2832, 0.2756, 0.1073, 0.4488), (-1.0794, 0.2601, 0.2186, 0.2033), (-0.6734, 0.2758, 0.2989, 0.2985), (-0.2846, 0.3128, 0.1544, 0.2989),
            (-0.0963, 0.2756, 0.1073, 0.4488), (0.0958, 0.2756, 0.1073, 0.4488), (0.2996, 0.2601, 0.2186, 0.2033), (0.7057, 0.2756, 0.2738, 0.018),
            (1.092, 0.3128, 0.1791, 0.2989), (1.2827, 0.2756, 0.1073, 0.4488), (-0.3899, -0.3665, 0.2186, 0.2033), (0.0161, -0.3508, 0.2989, 0.2985),
            (0.4049, -0.3137, 0.1544, 0.2989), (0, -0.0431, 2.8478, 0.0269),
        ])
        VGroup(*before_g[:5], *before_g[10:13]).set_color("#FC6255")
        before.set_z_index(1)

        # after: x - 2
        after = MathTex(r"x - 2", font_size=96)
        after_g = _glyphs(after, [
            (-1.2713, -0.1654, 0.7194, 0.6691), (0.065, -0.1145, 0.901, 0.0591), (1.3363, 0.0081, 0.5894, 0.9838),
        ])

        # 0 s – 1 s: before write
        self.play(Write(VGroup(*before_g[:])), run_time=1)
        # 1 s – 2.2 s
        self.wait(1.2)
        # 2.2 s – 3.7 s: before fade_out, before → after
        self.play(
            FadeOut(VGroup(*before_g[:6], *before_g[9:])),
            ReplacementTransform(before_g[6], after_g[0]),
            ReplacementTransform(before_g[7], after_g[1]),
            ReplacementTransform(before_g[8], after_g[2]),
            run_time=1.5,
        )
        # 3.7 s – 5.3 s
        self.wait(1.6)
