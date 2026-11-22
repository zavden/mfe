# Formulas of growing difficulty — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl FormulasOfGrowingDifficulty.py FormulasOfGrowingDifficulty -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 1296 frames, like the editor's video export.
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


class FormulasOfGrowingDifficulty(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # plain: x + 3 = 5
        plain = Tex(r"x + 3 = 5", font_size=74.2416)
        plain_g = _glyphs(plain, [
            (-2.3763, -0.1023, 0.6511, 0.6056), (-1.1668, -0.0555, 0.8904, 0.889), (-0.0162, 0.0394, 0.5548, 0.9184), (1.2102, -0.0561, 0.8904, 0.3128),
            (2.4352, 0.0401, 0.5334, 0.9198),
        ])

        # fractions: \frac{a}{b} + \frac{c}{d} = \frac{ad + bc}{bd}
        fractions = Tex(r"\frac{a}{b} + \frac{c}{d} = \frac{ad + bc}{bd}", font_size=74.2416)
        fractions_g = _glyphs(fractions, [
            (-1.7125, 0.2685, 0.2288, 0.2182), (-1.7069, -0.3295, 0.1848, 0.3411), (-1.7149, -0.0418, 0.3527, 0.029), (-1.1848, -0.0416, 0.3222, 0.3217),
            (-0.6495, 0.2682, 0.1914, 0.2198), (-0.6482, -0.3292, 0.2371, 0.3406), (-0.6569, -0.0418, 0.3483, 0.029), (-0.1021, -0.0418, 0.3222, 0.1132),
            (0.4573, 0.2685, 0.2288, 0.2182), (0.7174, 0.3297, 0.2371, 0.3406), (1.1301, 0.2854, 0.3222, 0.3217), (1.5376, 0.3295, 0.1848, 0.3411),
            (1.7455, 0.2682, 0.1914, 0.2198), (0.9671, -0.3295, 0.1848, 0.3411), (1.1974, -0.3292, 0.2371, 0.3406), (1.0849, -0.0418, 1.6127, 0.029),
        ])

        # quadratic: x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
        quadratic = Tex(r"x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}", font_size=74.2416)
        quadratic_g = _glyphs(quadratic, [
            (-1.8732, -0.1, 0.2137, 0.1988), (-1.4517, -0.0848, 0.2923, 0.1027), (-0.8918, 0.2119, 0.2677, 0.0176), (-0.6197, 0.252, 0.1677, 0.3094),
            (-0.2645, 0.2483, 0.2923, 0.2923), (0.4795, 0.252, 0.1677, 0.3094), (0.6583, 0.3323, 0.1238, 0.2067), (1.0262, 0.2119, 0.2677, 0.0176),
            (1.404, 0.2507, 0.1944, 0.2971), (1.6322, 0.1967, 0.2076, 0.1979), (1.8479, 0.1964, 0.1737, 0.1994), (0.2066, 0.2806, 0.3431, 0.4389),
            (1.1571, 0.4868, 1.558, 0.0263), (0.3205, -0.3495, 0.1751, 0.2923), (0.5487, -0.401, 0.2076, 0.1979), (0.4368, -0.0848, 3.0864, 0.0263),
        ])

        # series: \sum_{k=1}^{n} k = \frac{n(n+1)}{2}
        series = Tex(r"\sum_{k=1}^{n} k = \frac{n(n+1)}{2}", font_size=74.2416)
        series_g = _glyphs(series, [
            (-1.1824, 0.0296, 0.517, 0.543), (-1.3533, -0.4033, 0.1248, 0.1933), (-1.1794, -0.4284, 0.1826, 0.0642), (-1.0028, -0.4057, 0.0943, 0.1826),
            (-1.1821, 0.4378, 0.1533, 0.1244), (-0.7307, 0.0651, 0.1765, 0.2734), (-0.3769, 0.0296, 0.2583, 0.0908), (0.0835, 0.2917, 0.2168, 0.1759),
            (0.2825, 0.3049, 0.0927, 0.3878), (0.4671, 0.2917, 0.2168, 0.1759), (0.8203, 0.3051, 0.2583, 0.2579), (1.1562, 0.3371, 0.1334, 0.2583),
            (1.3189, 0.3049, 0.0927, 0.3878), (0.6844, -0.2043, 0.1547, 0.2583), (0.6846, 0.0296, 1.5127, 0.0233),
        ])

        # integral: \int_0^1 x^2 \, dx = \frac{1}{3}
        integral = Tex(r"\int_0^1 x^2 \, dx = \frac{1}{3}", font_size=74.2416)
        integral_g = _glyphs(integral, [
            (-1.0307, -0.0296, 0.3598, 0.8995), (-0.7364, 0.4047, 0.0984, 0.1906), (-0.9231, -0.4016, 0.1205, 0.1969), (-0.4659, -0.0437, 0.1971, 0.1833),
            (-0.2624, 0.1315, 0.1142, 0.1906), (0.0097, 0.0075, 0.1983, 0.2849), (0.2203, -0.0437, 0.1971, 0.1833), (0.6089, -0.0297, 0.2695, 0.0947),
            (1.071, 0.2774, 0.1392, 0.2695), (1.0688, -0.2784, 0.168, 0.278), (1.069, -0.0297, 0.2833, 0.0243),
        ])

        # rows: (a + b)^2 &= a^2 + 2ab + b^2 \\ (a - b)^2 &= a^2 - 2ab + b^2
        rows = Tex(r"""(a + b)^2 &= a^2 + 2ab + b^2 \\
(a - b)^2 &= a^2 - 2ab + b^2""", font_size=74.2416)
        rows_g = _glyphs(rows, [
            (-1.9557, 0.2531, 0.0931, 0.3894), (-1.7824, 0.2397, 0.1842, 0.1756), (-1.4433, 0.2533, 0.2594, 0.259), (-1.1153, 0.2888, 0.1488, 0.2746),
            (-0.9702, 0.2531, 0.0931, 0.3894), (-0.8051, 0.4083, 0.1099, 0.1834), (-0.457, 0.2531, 0.2594, 0.0911), (-0.0923, 0.2397, 0.1842, 0.1756),
            (0.0903, 0.4083, 0.1099, 0.1834), (0.4167, 0.2533, 0.2594, 0.259), (0.752, 0.2855, 0.1554, 0.2594), (0.9545, 0.2397, 0.1842, 0.1756),
            (1.1455, 0.2888, 0.1488, 0.2746), (1.4606, 0.2533, 0.2594, 0.259), (1.7886, 0.2888, 0.1488, 0.2746), (1.9473, 0.4083, 0.1099, 0.1834),
            (-1.9557, -0.3053, 0.0931, 0.3894), (-1.7824, -0.3187, 0.1842, 0.1756), (-1.4433, -0.3053, 0.2376, 0.0156), (-1.1153, -0.2696, 0.1488, 0.2746),
            (-0.9702, -0.3053, 0.0931, 0.3894), (-0.8051, -0.1501, 0.1099, 0.1834), (-0.457, -0.3053, 0.2594, 0.0911), (-0.0923, -0.3187, 0.1842, 0.1756),
            (0.0903, -0.1501, 0.1099, 0.1834), (0.4167, -0.3053, 0.2376, 0.0156), (0.752, -0.273, 0.1554, 0.2594), (0.9545, -0.3187, 0.1842, 0.1756),
            (1.1455, -0.2696, 0.1488, 0.2746), (1.4606, -0.3051, 0.2594, 0.259), (1.7886, -0.2696, 0.1488, 0.2746), (1.9473, -0.1501, 0.1099, 0.1834),
        ])

        # 0 s – 1.4 s: plain write
        self.play(Write(VGroup(*plain_g[:]), stroke_color="#FFFFFF"), run_time=1.4)
        # 1.4 s – 3 s
        self.wait(1.6)
        # 3 s – 3.6 s: plain fade_out
        self.play(FadeOut(plain), run_time=0.6)
        # 3.6 s – 5 s: fractions write
        self.play(Write(VGroup(*fractions_g[:]), stroke_color="#FFFFFF"), run_time=1.4)
        # 5 s – 6.6 s
        self.wait(1.6)
        # 6.6 s – 7.2 s: fractions fade_out
        self.play(FadeOut(fractions), run_time=0.6)
        # 7.2 s – 8.6 s: quadratic write
        self.play(Write(VGroup(*quadratic_g[:]), stroke_color="#FFFFFF"), run_time=1.4)
        # 8.6 s – 10.2 s
        self.wait(1.6)
        # 10.2 s – 10.8 s: quadratic fade_out
        self.play(FadeOut(quadratic), run_time=0.6)
        # 10.8 s – 12.2 s: series write
        self.play(Write(VGroup(*series_g[:]), stroke_color="#FFFFFF"), run_time=1.4)
        # 12.2 s – 13.8 s
        self.wait(1.6)
        # 13.8 s – 14.4 s: series fade_out
        self.play(FadeOut(series), run_time=0.6)
        # 14.4 s – 15.8 s: integral write
        self.play(Write(VGroup(*integral_g[:]), stroke_color="#FFFFFF"), run_time=1.4)
        # 15.8 s – 17.4 s
        self.wait(1.6)
        # 17.4 s – 18 s: integral fade_out
        self.play(FadeOut(integral), run_time=0.6)
        # 18 s – 19.4 s: rows write
        self.play(Write(VGroup(*rows_g[:]), stroke_color="#FFFFFF"), run_time=1.4)
        # 19.4 s – 21 s
        self.wait(1.6)
        # 21 s – 21.6 s: rows fade_out
        self.play(FadeOut(rows), run_time=0.6)
