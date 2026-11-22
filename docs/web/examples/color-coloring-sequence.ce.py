# Coefficients, in a formula and in a sentence — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 CoefficientsInAFormulaAndInASentence.py CoefficientsInAFormulaAndInASentence
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 360 frames, like the editor's video export.
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


class CoefficientsInAFormulaAndInASentence(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # equation: ax^2 + bx + c = 0
        equation = MathTex(r"ax^2 + bx + c = 0", font_size=96)
        equation_g = _glyphs(equation, [
            (-3.4705, -0.192, 0.4897, 0.4669), (-2.9135, -0.192, 0.5042, 0.469), (-2.3928, 0.2562, 0.2921, 0.4875), (-1.5248, -0.1557, 0.6895, 0.6885),
            (-0.6528, -0.0615, 0.3955, 0.7299), (-0.1594, -0.192, 0.5042, 0.469), (0.7772, -0.1557, 0.6895, 0.6885), (1.6501, -0.1927, 0.4097, 0.4704),
            (2.5487, -0.1563, 0.6895, 0.2423), (3.4974, -0.0817, 0.4359, 0.7123),
        ])
        equation_g[0].set_color("#58C4DD")
        equation_g[4].set_color("#F0AC5F")
        equation_g[7].set_color("#83C167")
        equation.move_to([0, 1, 0])
        equation.set_z_index(1)

        # sentence: Here $a$, $b$ and $c$ are the coefficients.
        sentence = Tex(r"Here $a$, $b$ and $c$ are the coefficients.", font_size=72)
        sentence_g = _glyphs(sentence, [
            (-7.8051, 0.096, 0.777, 0.7592), (-7.1415, -0.0408, 0.4302, 0.5102), (-6.6808, -0.0376, 0.3824, 0.492), (-6.2123, -0.0408, 0.4302, 0.5102),
            (-5.3876, -0.0441, 0.5258, 0.5013), (-4.9391, -0.3246, 0.1467, 0.3509), (-4.2555, 0.096, 0.4246, 0.7836), (-3.4646, -0.0408, 0.5102, 0.5102),
            (-2.8866, -0.0376, 0.5747, 0.492), (-2.2675, 0.0963, 0.5569, 0.7844), (-1.4302, -0.0448, 0.4398, 0.505), (-0.6358, -0.0408, 0.5102, 0.5102),
            (-0.1595, -0.0376, 0.3824, 0.492), (0.309, -0.0408, 0.4302, 0.5102), (1.0293, 0.0526, 0.3501, 0.6947), (1.5817, 0.1024, 0.5747, 0.7721),
            (2.1308, -0.0408, 0.4302, 0.5102), (2.9055, -0.0411, 0.4235, 0.5109), (3.4268, -0.0402, 0.4924, 0.5091), (3.9515, -0.0408, 0.4302, 0.5102),
            (4.42, 0.1082, 0.3846, 0.7836), (4.7601, 0.1082, 0.3846, 0.7836), (5.0352, 0.0882, 0.2545, 0.7436), (5.4376, -0.0411, 0.4235, 0.5109),
            (5.8377, 0.0882, 0.2545, 0.7436), (6.2368, -0.0408, 0.4302, 0.5102), (6.7992, -0.0376, 0.5747, 0.492), (7.2971, 0.0526, 0.3501, 0.6947),
            (7.7523, -0.0408, 0.3624, 0.5102), (8.1263, -0.2169, 0.1345, 0.1334),
        ])
        sentence_g[4].set_color("#58C4DD")
        sentence_g[6].set_color("#F0AC5F")
        sentence_g[10].set_color("#83C167")
        sentence.move_to([0, -1.3, 0])

        # 0 s – 1 s: equation write
        self.play(Write(VGroup(*equation_g[:])), run_time=1)
        # 1 s – 1.2 s
        self.wait(0.2)
        # 1.2 s – 2.7 s: sentence write
        self.play(Write(VGroup(*sentence_g[:])), run_time=1.5)
        # 2.7 s – 5 s
        self.wait(2.3)
        # 5 s – 6 s: sentence fade_out, equation fade_out
        self.play(FadeOut(sentence), FadeOut(equation), run_time=1)
