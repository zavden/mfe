# A sum with dots — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl ASumWithDots.py ASumWithDots -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 240 frames, like the editor's video export.
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


class ASumWithDots(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # step1: 1+2+\cdots+n
        step1 = Tex(r"1+2+\cdots+n", font_size=74.2416)
        step1_g = _glyphs(step1, [
            (-4.0055, 0.0548, 0.4599, 0.8904), (-2.8609, -0.0555, 0.8904, 0.889), (-1.7102, 0.0548, 0.5334, 0.8904), (-0.5581, -0.0555, 0.8904, 0.889),
            (1.0418, -0.0561, 1.357, 0.1604), (2.643, -0.0555, 0.8904, 0.889), (3.8618, -0.1018, 0.7473, 0.6065),
        ])
        step1.move_to([-2.0198, 0, 0])
        step1.set_z_index(1)

        # step2: 1+2+\cdots+n=\frac{n(n+1)}{2}
        step2 = Tex(r"1+2+\cdots+n=\frac{n(n+1)}{2}", font_size=74.2416)
        step2_g = _glyphs(step2, [
            (-2.6483, -0.0252, 0.1603, 0.3103), (-2.2493, -0.0636, 0.3103, 0.3099), (-1.8482, -0.0252, 0.1859, 0.3103), (-1.4466, -0.0636, 0.3103, 0.3099),
            (-0.889, -0.0638, 0.473, 0.0559), (-0.3309, -0.0636, 0.3103, 0.3099), (0.094, -0.0798, 0.2605, 0.2114), (0.5442, -0.0638, 0.3103, 0.109),
            (1.0975, 0.2511, 0.2605, 0.2114), (1.3366, 0.267, 0.1114, 0.466), (1.5584, 0.2511, 0.2605, 0.2114), (1.9827, 0.2672, 0.3103, 0.3099),
            (2.3864, 0.3057, 0.1603, 0.3103), (2.5818, 0.267, 0.1114, 0.466), (1.8194, -0.3448, 0.1859, 0.3103), (1.8196, -0.0638, 1.8175, 0.028),
        ])

        # 0 s – 1 s: step1 write
        self.play(Write(VGroup(*step1_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 2 s
        self.wait(1)
        # 2 s – 3 s: step1 → step2, step2 fade_in
        self.play(
            ReplacementTransform(step1_g[0], step2_g[0]),
            ReplacementTransform(step1_g[1], step2_g[1]),
            ReplacementTransform(step1_g[2], step2_g[2]),
            ReplacementTransform(step1_g[3], step2_g[3]),
            ReplacementTransform(step1_g[4], step2_g[4]),
            ReplacementTransform(step1_g[5], step2_g[5]),
            ReplacementTransform(step1_g[6], step2_g[6]),
            FadeIn(VGroup(*step2_g[7:])),
            run_time=1,
        )
        # 3 s – 4 s
        self.wait(1)
