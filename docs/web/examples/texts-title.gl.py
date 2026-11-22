# A text with maths — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl ATextWithMaths.py ATextWithMaths -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 420 frames, like the editor's video export.
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


class ATextWithMaths(Scene):
    default_camera_config = dict(background_color="#070B15")

    def construct(self):

        # title: Completing the square starts from $x^2 + bx + c$
        title = TexText(r"\parbox{120.45pt}{\centering Completing the square starts from $x^2 + bx + c$\par}", font_size=74.2416)
        title_g = _glyphs(title, [
            (-2.0411, 0.3366, 0.2747, 0.3269), (-1.7662, 0.2812, 0.1995, 0.2062), (-1.4635, 0.2822, 0.3575, 0.1993), (-1.1564, 0.2386, 0.226, 0.2867),
            (-0.963, 0.339, 0.1067, 0.3128), (-0.8032, 0.281, 0.1742, 0.2067), (-0.624, 0.3188, 0.1418, 0.2814), (-0.4646, 0.3332, 0.1031, 0.3012),
            (-0.275, 0.2822, 0.2328, 0.1993), (-0.0366, 0.2382, 0.2053, 0.2967), (0.2644, 0.3188, 0.1418, 0.2814), (0.4881, 0.339, 0.2328, 0.3128),
            (0.7106, 0.281, 0.1742, 0.2067), (1.0116, 0.281, 0.1468, 0.2067), (1.2286, 0.2384, 0.226, 0.2864), (1.4661, 0.2798, 0.2328, 0.2043),
            (1.7074, 0.281, 0.2067, 0.2067), (1.9003, 0.2822, 0.1549, 0.1993), (2.0901, 0.281, 0.1742, 0.2067), (-2.1418, -0.3647, 0.1468, 0.2067),
            (-1.9737, -0.3269, 0.1418, 0.2814), (-1.7589, -0.3647, 0.2067, 0.2067), (-1.566, -0.3634, 0.1549, 0.1993), (-1.3969, -0.3269, 0.1418, 0.2814),
            (-1.2125, -0.3647, 0.1468, 0.2067), (-0.9212, -0.3044, 0.1558, 0.3174), (-0.7866, -0.3634, 0.1549, 0.1993), (-0.5842, -0.3645, 0.1995, 0.2062),
            (-0.2814, -0.3634, 0.3575, 0.1993), (0.1416, -0.3661, 0.2193, 0.204), (0.368, -0.1711, 0.127, 0.212), (0.7455, -0.3503, 0.2999, 0.2994),
            (1.1247, -0.3093, 0.172, 0.3174), (1.3392, -0.3661, 0.2193, 0.204), (1.7466, -0.3503, 0.2999, 0.2994), (2.1262, -0.3664, 0.1781, 0.2046),
        ])
        title.move_to([0, 1.6, 0])
        title.set_z_index(1)

        # sum: x^2 + bx + c
        sum = Tex(r"x^2 + bx + c", font_size=98.9888)
        sum_g = _glyphs(sum, [
            (-2.2581, -0.192, 0.5042, 0.469), (-1.7374, 0.2562, 0.2921, 0.4875), (-0.8694, -0.1557, 0.6895, 0.6885), (0.0026, -0.0615, 0.3955, 0.7299),
            (0.4959, -0.192, 0.5042, 0.469), (1.4326, -0.1557, 0.6895, 0.6885), (2.3054, -0.1927, 0.4097, 0.4704),
        ])
        sum.move_to([0, -1.2, 0])

        # 0 s – 1.5 s: title write
        self.play(Write(VGroup(*title_g[:]), stroke_color="#FFFFFF"), run_time=1.5)
        # 1.5 s – 2.5 s
        self.wait(1)
        # 2.5 s – 3.3 s: sum fade_in
        self.play(FadeIn(sum), run_time=0.8)
        # 3.3 s – 6.2 s
        self.wait(2.9)
        # 6.2 s – 7 s: sum fade_out, title fade_out
        self.play(FadeOut(sum), FadeOut(title), run_time=0.8)
