# A derivative from first principles — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 ADerivativeFromFirstPrinciples.py ADerivativeFromFirstPrinciples
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 1284 frames, like the editor's video export.
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


class ADerivativeFromFirstPrinciples(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # title: f(x) = x^2
        title = MathTex(r"f(x) = x^2", font_size=72)
        title_g = _glyphs(title, [
            (-1.5902, -0.059, 0.4366, 0.8026), (-1.1836, -0.059, 0.2108, 0.8819), (-0.7832, -0.0895, 0.4295, 0.3995), (-0.3704, -0.059, 0.2108, 0.8819),
            (0.4068, -0.059, 0.5874, 0.2064), (1.2405, -0.0895, 0.4295, 0.3995), (1.684, 0.2924, 0.2488, 0.4153),
        ])
        title.move_to([-4.6, 3.3, 0])

        # derivation: f'(x) &= \lim_{h \to 0} \frac{(x+h)^2 - x^2}{h} \\ &= \lim_{h \to 0} \frac{x^2 + 2xh + h^2 - x^2}{h} \\ &= \lim_{h \to 0} \frac{2xh + h^2}{h} \\ &= \lim_{h \to 0} (2x + h) \\ &= 2x
        derivation = MathTex(r"""f'(x) &= \lim_{h \to 0} \frac{(x+h)^2 - x^2}{h} \\
  &= \lim_{h \to 0} \frac{x^2 + 2xh + h^2 - x^2}{h} \\
  &= \lim_{h \to 0} \frac{2xh + h^2}{h} \\
  &= \lim_{h \to 0} (2x + h) \\
  &= 2x""")
        derivation_g = _glyphs(derivation, [
            (-0.6421, 0.3752, 0.0477, 0.0878), (-0.5999, 0.4115, 0.0158, 0.0353), (-0.5657, 0.3752, 0.0231, 0.0965), (-0.5219, 0.3719, 0.047, 0.0437),
            (-0.4768, 0.3752, 0.0231, 0.0965), (-0.3918, 0.3752, 0.0642, 0.0226), (-0.3097, 0.3846, 0.0229, 0.067), (-0.2833, 0.3834, 0.0221, 0.0645),
            (-0.2293, 0.3724, 0.0766, 0.0427), (-0.3069, 0.3109, 0.0346, 0.0481), (-0.2541, 0.3047, 0.0606, 0.0356), (-0.203, 0.3096, 0.0287, 0.0469),
            (-0.128, 0.4437, 0.0231, 0.0965), (-0.0842, 0.4404, 0.047, 0.0437), (0.003, 0.4437, 0.0642, 0.0641), (0.0911, 0.4525, 0.0489, 0.068),
            (0.1344, 0.4437, 0.0231, 0.0965), (0.1753, 0.4773, 0.0272, 0.0454), (0.2561, 0.4437, 0.0588, 0.0039), (0.3419, 0.4404, 0.047, 0.0437),
            (0.3905, 0.4773, 0.0272, 0.0454), (0.1332, 0.3179, 0.0489, 0.068), (0.1319, 0.3752, 0.5803, 0.0058), (-0.3918, 0.126, 0.0642, 0.0226),
            (-0.3097, 0.1354, 0.0229, 0.067), (-0.2833, 0.1342, 0.0221, 0.0645), (-0.2293, 0.1233, 0.0766, 0.0427), (-0.3069, 0.0618, 0.0346, 0.0481),
            (-0.2541, 0.0555, 0.0606, 0.0356), (-0.203, 0.0605, 0.0287, 0.0469), (-0.1217, 0.1879, 0.047, 0.0437), (-0.0732, 0.2249, 0.0272, 0.0454),
            (0.0076, 0.1913, 0.0642, 0.0641), (0.0907, 0.1993, 0.0385, 0.0642), (0.1417, 0.1879, 0.047, 0.0437), (0.1991, 0.2001, 0.0489, 0.068),
            (0.2845, 0.1913, 0.0642, 0.0641), (0.3725, 0.2001, 0.0489, 0.068), (0.4192, 0.2249, 0.0272, 0.0454), (0.5001, 0.1913, 0.0588, 0.0039),
            (0.5859, 0.1879, 0.047, 0.0437), (0.6344, 0.2249, 0.0272, 0.0454), (0.2551, 0.0687, 0.0489, 0.068), (0.2538, 0.126, 0.8242, 0.0058),
            (-0.3918, -0.1231, 0.0642, 0.0226), (-0.3097, -0.1137, 0.0229, 0.067), (-0.2833, -0.115, 0.0221, 0.0645), (-0.2293, -0.1259, 0.0766, 0.0427),
            (-0.3069, -0.1874, 0.0346, 0.0481), (-0.2541, -0.1936, 0.0606, 0.0356), (-0.203, -0.1887, 0.0287, 0.0469), (-0.1245, -0.0499, 0.0385, 0.0642),
            (-0.0735, -0.0612, 0.047, 0.0437), (-0.0161, -0.0491, 0.0489, 0.068), (0.0693, -0.0579, 0.0642, 0.0641), (0.1573, -0.0491, 0.0489, 0.068),
            (0.204, -0.0243, 0.0272, 0.0454), (0.04, -0.1804, 0.0489, 0.068), (0.0387, -0.1231, 0.3938, 0.0058), (-0.3918, -0.299, 0.0642, 0.0226),
            (-0.3097, -0.2896, 0.0229, 0.067), (-0.2833, -0.2908, 0.0221, 0.0645), (-0.2293, -0.3017, 0.0766, 0.0427), (-0.3069, -0.3632, 0.0346, 0.0481),
            (-0.2541, -0.3695, 0.0606, 0.0356), (-0.203, -0.3646, 0.0287, 0.0469), (-0.1653, -0.299, 0.0231, 0.0965), (-0.1243, -0.291, 0.0385, 0.0642),
            (-0.0733, -0.3023, 0.047, 0.0437), (0.014, -0.2989, 0.0642, 0.0641), (0.102, -0.2901, 0.0489, 0.068), (0.1453, -0.299, 0.0231, 0.0965),
            (-0.3918, -0.4748, 0.0642, 0.0226), (-0.3034, -0.4668, 0.0385, 0.0642), (-0.2524, -0.4782, 0.047, 0.0437),
        ])
        VGroup(derivation_g[9], derivation_g[15], derivation_g[21], derivation_g[27], derivation_g[35], derivation_g[37], derivation_g[42], derivation_g[48], derivation_g[53], derivation_g[55], derivation_g[57], derivation_g[63], derivation_g[70]).set_color("#F4C867")
        derivation.scale(1.2).move_to([0, -0.2, 0])
        derivation.set_z_index(1)

        # 0 s – 1 s: title write
        self.play(Write(VGroup(*title_g[:])), run_time=1)
        # 1 s – 2 s: derivation fade_in
        self.play(FadeIn(VGroup(*derivation_g[:23])), run_time=1)
        # 2 s – 3.6 s
        self.wait(1.6)
        # 3.6 s – 4.8 s: derivation morph
        self.play(
            ReplacementTransform(VGroup(*derivation_g[5:12]).copy(), VGroup(*derivation_g[23:30])),
            ReplacementTransform(VGroup(derivation_g[13]).copy(), VGroup(derivation_g[30], derivation_g[34])),
            ReplacementTransform(VGroup(derivation_g[17]).copy(), VGroup(derivation_g[31], derivation_g[38])),
            ReplacementTransform(VGroup(derivation_g[14]).copy(), VGroup(derivation_g[32], derivation_g[36])),
            ReplacementTransform(VGroup(derivation_g[15]).copy(), VGroup(derivation_g[35], derivation_g[37])),
            ReplacementTransform(VGroup(*derivation_g[18:21]).copy(), VGroup(*derivation_g[39:42])),
            ReplacementTransform(VGroup(derivation_g[21], derivation_g[22]).copy(), VGroup(derivation_g[42], derivation_g[43])),
            run_time=1.2,
        )
        # 4.8 s – 4.9 s
        self.wait(0.1)
        # 4.9 s – 5.5 s: derivation write
        self.play(Write(derivation_g[33]), run_time=0.6)
        # 5.5 s – 7.2 s
        self.wait(1.7)
        # 7.2 s – 8.4 s: derivation morph
        self.play(
            ReplacementTransform(VGroup(*derivation_g[23:30]).copy(), VGroup(*derivation_g[44:51])),
            ReplacementTransform(VGroup(*derivation_g[33:39]).copy(), VGroup(*derivation_g[51:57])),
            ReplacementTransform(VGroup(derivation_g[42], derivation_g[43]).copy(), VGroup(derivation_g[57], derivation_g[58])),
            run_time=1.2,
        )
        # 8.4 s – 10.2 s
        self.wait(1.8)
        # 10.2 s – 11.4 s: derivation morph
        self.play(
            ReplacementTransform(VGroup(*derivation_g[44:51]).copy(), VGroup(*derivation_g[59:66])),
            ReplacementTransform(VGroup(derivation_g[51], derivation_g[52]).copy(), VGroup(derivation_g[67], derivation_g[68])),
            ReplacementTransform(VGroup(derivation_g[54], derivation_g[55]).copy(), VGroup(derivation_g[69], derivation_g[70])),
            run_time=1.2,
        )
        # 11.4 s – 11.6 s
        self.wait(0.2)
        # 11.6 s – 12.2 s: derivation fade_in
        self.play(FadeIn(VGroup(derivation_g[66], derivation_g[71])), run_time=0.6)
        # 12.2 s – 14 s
        self.wait(1.8)
        # 14 s – 15.2 s: derivation morph
        self.play(
            ReplacementTransform(derivation_g[59].copy(), derivation_g[72]),
            ReplacementTransform(VGroup(derivation_g[67], derivation_g[68]).copy(), VGroup(derivation_g[73], derivation_g[74])),
            run_time=1.2,
        )
        # 15.2 s – 16 s
        self.wait(0.8)
        derivation_pivot = VGroup(derivation_g[73], derivation_g[74]).get_center()
        # 16 s – 16.8 s: derivation part
        self.play(
            VGroup(derivation_g[73], derivation_g[74]).animate.scale(1.3, about_point=derivation_pivot).set_color("#5CD0B3"),
            run_time=0.8,
        )
        # 16.8 s – 17.2 s
        self.wait(0.4)
        # 17.2 s – 18.2 s: derivation indicate
        self.play(Indicate(VGroup(derivation_g[73], derivation_g[74])), run_time=1)
        # 18.2 s – 20.4 s
        self.wait(2.2)
        # 20.4 s – 21.4 s: derivation fade_out, title fade_out
        self.play(FadeOut(derivation), FadeOut(title), run_time=1)
