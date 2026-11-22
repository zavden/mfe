# Morph block — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl MorphBlock.py MorphBlock -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 360 frames, like the editor's video export.
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


class MorphBlock(Scene):
    default_camera_config = dict(background_color="#070B15")

    def construct(self):

        # rows: 2x + 4 &= 10 \\ 2x &= 10 - 4
        rows = Tex(r"2x + 4 &= 10 \\ 2x &= 10 - 4", font_size=136.1096)
        rows_g = _glyphs(rows, [
            (-1.5939, 0.3279, 0.1996, 0.3332), (-1.3293, 0.2691, 0.2436, 0.2266), (-0.8767, 0.2866, 0.3332, 0.3327), (-0.4461, 0.3307, 0.2216, 0.3387),
            (0.0128, 0.2864, 0.3332, 0.1171), (0.4739, 0.3279, 0.1721, 0.3332), (0.7213, 0.3224, 0.2106, 0.3442), (-0.7323, -0.3224, 0.1996, 0.3332),
            (-0.4676, -0.3812, 0.2436, 0.2266), (0.0128, -0.3639, 0.3332, 0.1171), (0.4739, -0.3224, 0.1721, 0.3332), (0.7213, -0.3279, 0.2106, 0.3442),
            (1.1523, -0.3639, 0.3052, 0.02), (1.5829, -0.3197, 0.2216, 0.3387),
        ])
        VGroup(rows_g[3], rows_g[13]).set_color("#F4C867")
        rows_g[12].set_color("#43EECA")

        # 0 s – 0.6 s: rows fade_in
        self.play(FadeIn(VGroup(*rows_g[:7])), run_time=0.6)
        # 0.6 s – 1.5 s
        self.wait(0.9)
        # 1.5 s – 3 s: rows morph
        self.play(
            TransformFromCopy(rows_g[0], rows_g[7]),
            TransformFromCopy(rows_g[1], rows_g[8]),
            TransformFromCopy(rows_g[4], rows_g[9]),
            TransformFromCopy(rows_g[5], rows_g[10]),
            TransformFromCopy(rows_g[6], rows_g[11]),
            TransformFromCopy(rows_g[3], rows_g[13]),
            run_time=1.5,
        )
        # 3 s – 3.2 s
        self.wait(0.2)
        # 3.2 s – 4.2 s: rows write
        self.play(Write(VGroup(rows_g[12]), stroke_color="#FFFFFF"), run_time=1)
        # 4.2 s – 5.4 s
        self.wait(1.2)
        # 5.4 s – 6 s: rows fade_out
        self.play(FadeOut(rows), run_time=0.6)
