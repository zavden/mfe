# Meta variety — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 400×300, 24 fps:
#     manimgl Pinned.py Pinned -w -r 400x300 --fps 24
# Every play and wait lasts a whole number of frames at 24 fps, so the video has
# exactly 96 frames, like the editor's video export.
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


class Pinned(Scene):
    default_camera_config = dict(background_color="#1E1E2E")

    def construct(self):
        preamble = "\n".join([r"\usepackage{cancel}", r"\newcommand{\R}{\mathbb{R}}"])

        # cancel: \cancel{x}+\R
        cancel = Tex(r"\cancel{x}+\R", additional_preamble=preamble)
        cancel.set_color("#FFFF00")
        cancel_g = _glyphs(cancel, [
            (-1.3125, 0, 0.6875, 1), (-0.4375, 0, 0.6875, 1), (0.4375, 0, 0.6875, 1), (1.3125, 0, 0.6875, 1),
        ])
        cancel.scale(1.5).move_to([0, 0.5, 0])

        # 0 s – 0.5 s
        self.wait(0.5)
        # 0.5 s – 1.5 s: cancel write
        self.play(Write(VGroup(*cancel_g[:]), stroke_color="#FFFF00"), run_time=1)
        # 1.5 s – 2.5 s
        self.wait(1)
        # 2.5 s – 3.5 s: cancel fade_out
        self.play(FadeOut(cancel), run_time=1)
        # 3.5 s – 4 s
        self.wait(0.5)
