# Match colors — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl Pinned.py Pinned -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 540 frames, like the editor's video export.
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
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # poly: y = x^2 + 2x + 1
        poly = Tex(r"y = x^2 + 2x + 1")
        poly_g = _glyphs(poly, [
            (-2.8834, -0.2026, 0.4368, 0.5948), (-2.0588, -0.0821, 0.6116, 0.2149), (-1.1906, -0.1138, 0.4473, 0.416), (-0.7287, 0.2838, 0.2591, 0.4324),
            (0.0411, -0.0817, 0.6116, 0.6107), (0.8317, -0.0059, 0.3664, 0.6116), (1.3175, -0.1138, 0.4473, 0.416), (2.1484, -0.0817, 0.6116, 0.6107),
            (2.9439, -0.0059, 0.3159, 0.6116),
        ])
        poly_g[0].set_color("#FFFF00")
        VGroup(poly_g[2], poly_g[6]).set_color("#58C4DD")
        poly.move_to([0, 1.5, 0])
        poly.set_z_index(1)

        # deriv: \frac{dy}{dx} = 2x + 2
        deriv = Tex(r"\frac{dy}{dx} = 2x + 2")
        deriv_g = _glyphs(deriv, [
            (-1.1251, 0.3297, 0.2371, 0.3406), (-0.8828, 0.2217, 0.2301, 0.3133), (-1.1449, -0.3292, 0.2371, 0.3406), (-0.8931, -0.3904, 0.2356, 0.2192),
            (-1.0152, -0.0418, 0.6251, 0.029), (-0.3221, -0.0418, 0.3222, 0.1132), (0.1212, -0.0017, 0.193, 0.3222), (0.3772, -0.0585, 0.2356, 0.2192),
            (0.8149, -0.0416, 0.3222, 0.3217), (1.2313, -0.0017, 0.193, 0.3222),
        ])
        VGroup(*deriv_g[:5]).set_color("#83C167")
        deriv_g[7].set_color("#58C4DD")
        deriv.move_to([0, -1, 0])

        # square: y = (x + 1)^2
        square = Tex(r"y = (x + 1)^2")
        square_g = _glyphs(square, [
            (-2.0945, -0.1747, 0.4195, 0.5712), (-1.3026, -0.059, 0.5874, 0.2064), (-0.5262, -0.059, 0.2108, 0.8819), (-0.1258, -0.0895, 0.4295, 0.3995),
            (0.6721, -0.0586, 0.5874, 0.5865), (1.436, 0.0142, 0.3034, 0.5874), (1.806, -0.059, 0.2108, 0.8819), (2.1799, 0.2924, 0.2488, 0.4153),
        ])
        square_g[0].set_color("#FFFF00")
        square_g[3].set_color("#58C4DD")
        square.move_to([0, 1.5, 0])
        square.set_z_index(1)

        # 0 s – 1 s: poly write
        self.play(Write(VGroup(*poly_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 2 s
        self.wait(1)
        # 2 s – 3 s: deriv write
        self.play(Write(VGroup(*deriv_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 3 s – 4 s: poly fade_out
        self.play(FadeOut(poly), run_time=1)
        # 4 s – 5 s
        self.wait(1)
        # 5 s – 6 s: square write
        self.play(Write(VGroup(*square_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 6 s – 7 s: deriv fade_out
        self.play(FadeOut(deriv), run_time=1)
        # 7 s – 8 s
        self.wait(1)
        # 8 s – 9 s: square fade_out
        self.play(FadeOut(square), run_time=1)
