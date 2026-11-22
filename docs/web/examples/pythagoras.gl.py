# The Pythagorean theorem, in colour — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl ThePythagoreanTheoremInColour.py ThePythagoreanTheoremInColour -w -r 1920x1080 --fps 60
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


class ThePythagoreanTheoremInColour(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # theorem: a^2 + b^2 = c^2
        theorem = Tex(r"a^2 + b^2 = c^2", font_size=98.9888)
        theorem_g = _glyphs(theorem, [
            (-2.4147, -0.192, 0.4897, 0.4669), (-1.9292, 0.2562, 0.2921, 0.4875), (-1.0612, -0.1557, 0.6895, 0.6885), (-0.1892, -0.0615, 0.3955, 0.7299),
            (0.2326, 0.2562, 0.2921, 0.4875), (1.1581, -0.1563, 0.6895, 0.2423), (2.0885, -0.1927, 0.4097, 0.4704), (2.5135, 0.2562, 0.2921, 0.4875),
        ])
        VGroup(theorem_g[0], theorem_g[1]).set_color("#58C4DD")
        VGroup(theorem_g[3], theorem_g[4]).set_color("#F0AC5F")
        VGroup(theorem_g[6], theorem_g[7]).set_color("#83C167")
        theorem.set_z_index(1)

        # numbers: 3^2 + 4^2 = 5^2
        numbers = Tex(r"3^2 + 4^2 = 5^2", font_size=98.9888)
        numbers_g = _glyphs(numbers, [
            (-2.4965, -0.0822, 0.4297, 0.7113), (-2.0203, 0.2562, 0.2921, 0.4875), (-1.1523, -0.1557, 0.6895, 0.6885), (-0.2612, -0.0646, 0.4587, 0.7009),
            (0.215, 0.2562, 0.2921, 0.4875), (1.1405, -0.1563, 0.6895, 0.2423), (2.0891, -0.0817, 0.4131, 0.7123), (2.5653, 0.2562, 0.2921, 0.4875),
        ])
        VGroup(numbers_g[0], numbers_g[1]).set_color("#58C4DD")
        VGroup(numbers_g[3], numbers_g[4]).set_color("#F0AC5F")
        VGroup(numbers_g[6], numbers_g[7]).set_color("#83C167")

        # squares: 9 + 16 = 25
        squares = Tex(r"9 + 16 = 25", font_size=98.9888)
        squares_g = _glyphs(squares, [
            (-3.0408, 0.0401, 0.5535, 0.9198), (-1.8881, -0.0555, 0.8904, 0.889), (-0.7301, 0.0548, 0.4599, 0.8904), (-0.0701, 0.0401, 0.5544, 0.9198),
            (1.1574, -0.0561, 0.8904, 0.3128), (2.3824, 0.0548, 0.5334, 0.8904), (3.0508, 0.0401, 0.5334, 0.9198),
        ])
        squares_g[0].set_color("#58C4DD")
        VGroup(squares_g[2], squares_g[3]).set_color("#F0AC5F")
        VGroup(squares_g[5], squares_g[6]).set_color("#83C167")
        squares.set_z_index(1)

        # 0 s – 1 s: theorem write
        self.play(Write(VGroup(*theorem_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 2 s
        self.wait(1)
        # 2 s – 3 s: theorem → numbers
        self.play(
            ReplacementTransform(theorem_g[0], numbers_g[0]),
            ReplacementTransform(theorem_g[1], numbers_g[1]),
            ReplacementTransform(theorem_g[2], numbers_g[2]),
            ReplacementTransform(theorem_g[3], numbers_g[3]),
            ReplacementTransform(theorem_g[4], numbers_g[4]),
            ReplacementTransform(theorem_g[5], numbers_g[5]),
            ReplacementTransform(theorem_g[6], numbers_g[6]),
            ReplacementTransform(theorem_g[7], numbers_g[7]),
            run_time=1,
        )
        # 3 s – 4 s
        self.wait(1)
        numbers_g[0].set_z_index(1)
        numbers_g[1].set_z_index(1)
        numbers_g[2].set_z_index(1)
        VGroup(numbers_g[3], numbers_g[4]).set_z_index(1)
        numbers_g[5].set_z_index(1)
        VGroup(numbers_g[6], numbers_g[7]).set_z_index(1)
        # 4 s – 5 s: numbers → squares
        self.play(
            ReplacementTransform(numbers_g[0], squares_g[0]),
            ReplacementTransform(numbers_g[1], squares_g[0]),
            ReplacementTransform(numbers_g[2], squares_g[1]),
            ReplacementTransform(VGroup(numbers_g[3], numbers_g[4]), VGroup(squares_g[2], squares_g[3])),
            ReplacementTransform(numbers_g[5], squares_g[4]),
            ReplacementTransform(VGroup(numbers_g[6], numbers_g[7]), VGroup(squares_g[5], squares_g[6])),
            run_time=1,
        )
        # 5 s – 7 s
        self.wait(2)
