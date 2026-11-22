# Three formulas from templates — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 ThreeFormulasFromTemplates.py ThreeFormulasFromTemplates
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 684 frames, like the editor's video export.
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


class ThreeFormulasFromTemplates(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # product_of_powers: x^{2k}\cdot x^{3}=x^{2k+3}
        product_of_powers = MathTex(r"x^{2k}\cdot x^{3}=x^{2k+3}", font_size=72)
        product_of_powers_g = _glyphs(product_of_powers, [
            (-3.3452, -0.2524, 0.5324, 0.4953), (-2.7954, 0.221, 0.3084, 0.5148), (-2.3888, 0.2275, 0.3517, 0.5449), (-1.7499, -0.2146, 0.1323, 0.1312),
            (-1.05, -0.2524, 0.5324, 0.4953), (-0.5001, 0.2121, 0.3208, 0.531), (0.4772, -0.2146, 0.7281, 0.2558), (1.5107, -0.2524, 0.5324, 0.4953),
            (2.0605, 0.221, 0.3084, 0.5148), (2.4671, 0.2275, 0.3517, 0.5449), (2.9575, 0.1572, 0.5148, 0.514), (3.4511, 0.2121, 0.3208, 0.531),
        ])

        # definition_of_the_derivative: g'(t)=\lim_{\Delta t\to 0}\frac{g(t+\Delta t)-g(t)}{\Delta t}
        definition_of_the_derivative = MathTex(r"g'(t)=\lim_{\Delta t\to 0}\frac{g(t+\Delta t)-g(t)}{\Delta t}", font_size=72)
        definition_of_the_derivative_g = _glyphs(definition_of_the_derivative, [
            (-2.7838, -0.1219, 0.2179, 0.3), (-2.6131, 0.1134, 0.076, 0.1695), (-2.4487, -0.061, 0.1108, 0.4636), (-2.2864, -0.0343, 0.1442, 0.2953),
            (-2.119, -0.061, 0.1108, 0.4636), (-1.7105, -0.061, 0.3088, 0.1085), (-1.2148, -0.0158, 0.1099, 0.3221), (-1.0877, -0.0218, 0.1062, 0.3102),
            (-0.8283, -0.0743, 0.3681, 0.2052), (-1.265, -0.3717, 0.2425, 0.2347), (-1.0711, -0.3882, 0.1019, 0.2088), (-0.8461, -0.4071, 0.2911, 0.1711),
            (-0.6005, -0.3835, 0.138, 0.2255), (-0.2254, 0.2072, 0.2179, 0.3), (-0.0188, 0.2682, 0.1108, 0.4636), (0.1434, 0.2949, 0.1442, 0.2953),
            (0.5132, 0.2684, 0.3088, 0.3083), (0.9895, 0.3183, 0.3431, 0.3319), (1.2637, 0.2949, 0.1442, 0.2953), (1.431, 0.2682, 0.1108, 0.4636),
            (1.8139, 0.2682, 0.2828, 0.0185), (2.2108, 0.2072, 0.2179, 0.3), (2.4174, 0.2682, 0.1108, 0.4636), (2.5796, 0.2949, 0.1442, 0.2953),
            (2.747, 0.2682, 0.1108, 0.4636), (1.1698, -0.3289, 0.3431, 0.3319), (1.444, -0.3523, 0.1442, 0.2953), (1.2537, -0.061, 3.2781, 0.0278),
        ])

        # eulers_identity: e^{i\pi}+1=0
        eulers_identity = MathTex(r"e^{i\pi}+1=0", font_size=72)
        eulers_identity_g = _glyphs(eulers_identity, [
            (-2.225, -0.1905, 0.406, 0.4714), (-1.8313, 0.2531, 0.2064, 0.4937), (-1.479, 0.1687, 0.407, 0.3247), (-0.5905, -0.1545, 0.6921, 0.691),
            (0.3096, -0.0688, 0.3575, 0.6921), (1.2571, -0.155, 0.6921, 0.2432), (2.2092, -0.0802, 0.4375, 0.7149),
        ])

        # 0 s – 1.4 s: product_of_powers write
        self.play(Write(VGroup(*product_of_powers_g[:])), run_time=1.4)
        # 1.4 s – 3.2 s
        self.wait(1.8)
        # 3.2 s – 3.8 s: product_of_powers fade_out
        self.play(FadeOut(product_of_powers), run_time=0.6)
        # 3.8 s – 5.2 s: definition_of_the_derivative write
        self.play(Write(VGroup(*definition_of_the_derivative_g[:])), run_time=1.4)
        # 5.2 s – 7 s
        self.wait(1.8)
        # 7 s – 7.6 s: definition_of_the_derivative fade_out
        self.play(FadeOut(definition_of_the_derivative), run_time=0.6)
        # 7.6 s – 9 s: eulers_identity write
        self.play(Write(VGroup(*eulers_identity_g[:])), run_time=1.4)
        # 9 s – 10.8 s
        self.wait(1.8)
        # 10.8 s – 11.4 s: eulers_identity fade_out
        self.play(FadeOut(eulers_identity), run_time=0.6)
