# Recipe: factor out a common factor — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl RecipeFactorOutACommonFactor.py RecipeFactorOutACommonFactor -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 318 frames, like the editor's video export.
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


class RecipeFactorOutACommonFactor(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # before: 6x + 9
        before = Tex(r"6x + 9", font_size=98.9888)
        before_g = _glyphs(before, [
            (-1.5337, 0.0401, 0.5544, 0.9198), (-0.8254, -0.1023, 0.6511, 0.6056), (0.3841, -0.0555, 0.8904, 0.889), (1.5341, 0.0401, 0.5535, 0.9198),
        ])
        VGroup(before_g[0], before_g[3]).set_color("#F4C867")
        before.set_z_index(1)

        # after: 3(2x + 3)
        after = Tex(r"3(2x + 3)", font_size=98.9888)
        after_g = _glyphs(after, [
            (-1.7602, 0.0715, 0.415, 0.687), (-1.2962, 0, 0.239, 1), (-0.8712, 0.083, 0.399, 0.666), (-0.3422, -0.0345, 0.487, 0.453),
            (0.5625, 0.0005, 0.666, 0.665), (1.4232, 0.0715, 0.415, 0.687), (1.8482, 0, 0.239, 1),
        ])
        VGroup(after_g[0], after_g[5]).set_color("#F4C867")

        # 0 s – 1 s: before write
        self.play(Write(VGroup(*before_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 2.2 s
        self.wait(1.2)
        # 2.2 s – 3.7 s: before → after, after fade_in
        self.play(
            ReplacementTransform(VGroup(before_g[0]), VGroup(after_g[0], after_g[2])),
            ReplacementTransform(before_g[3], after_g[5]),
            ReplacementTransform(before_g[1], after_g[3]),
            ReplacementTransform(before_g[2], after_g[4]),
            FadeIn(VGroup(after_g[1], after_g[6])),
            run_time=1.5,
        )
        # 3.7 s – 5.3 s
        self.wait(1.6)
