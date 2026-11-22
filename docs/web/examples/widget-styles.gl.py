# Relation styles — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl RelationStyles.py RelationStyles -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 312 frames, like the editor's video export.
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


class RelationStyles(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # xy: x+y
        xy = Tex(r"x+y", font_size=98.9888)
        xy_g = _glyphs(xy, [
            (-1.1225, 0.0336, 0.618, 0.5749), (0.0256, 0.078, 0.8452, 0.8439), (1.1297, -0.089, 0.6036, 0.8219),
        ])
        xy.move_to([0, 1.1, 0])
        xy.set_z_index(1)

        # yx: y+x
        yx = Tex(r"y+x", font_size=98.9888)
        yx_g = _glyphs(yx, [
            (-1.1026, -0.089, 0.6036, 0.8219), (-0.0336, 0.078, 0.8452, 0.8439), (1.0954, 0.0336, 0.618, 0.5749),
        ])
        yx.move_to([0, -1.1, 0])

        # 0 s – 1 s: xy write
        self.play(Write(VGroup(*xy_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 2.2 s
        self.wait(1.2)
        # 2.2 s – 3.4 s: xy → yx
        self.play(
            ReplacementTransform(xy_g[0], yx_g[2]),
            ReplacementTransform(xy_g[1], yx_g[1]),
            ReplacementTransform(xy_g[2], yx_g[0]),
            run_time=1.2,
        )
        # 3.4 s – 5.2 s
        self.wait(1.8)
