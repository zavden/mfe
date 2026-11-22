# The quadratic formula, formulas only — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl TheQuadraticFormulaFormulasOnly.py TheQuadraticFormulaFormulasOnly -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 1236 frames, like the editor's video export.
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


class TheQuadraticFormulaFormulasOnly(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # standard_form: ax^2+bx+c=0
        standard_form = Tex(r"ax^2+bx+c=0", font_size=74.2416)
        standard_form_g = _glyphs(standard_form, [
            (-3.4705, -0.192, 0.4897, 0.4669), (-2.9135, -0.192, 0.5042, 0.469), (-2.3928, 0.2562, 0.2921, 0.4875), (-1.5248, -0.1557, 0.6895, 0.6885),
            (-0.6528, -0.0615, 0.3955, 0.7299), (-0.1594, -0.192, 0.5042, 0.469), (0.7772, -0.1557, 0.6895, 0.6885), (1.6501, -0.1927, 0.4097, 0.4704),
            (2.5487, -0.1563, 0.6895, 0.2423), (3.4974, -0.0817, 0.4359, 0.7123),
        ])
        standard_form.set_z_index(1)

        # divide_by_a: x^2+\frac{b}{a}x+\frac{c}{a}=0
        divide_by_a = Tex(r"x^2+\frac{b}{a}x+\frac{c}{a}=0", font_size=74.2416)
        divide_by_a_g = _glyphs(divide_by_a, [
            (-1.751, -0.0588, 0.2357, 0.2193), (-1.5076, 0.1507, 0.1365, 0.2279), (-1.1017, -0.0419, 0.3224, 0.3219), (-0.5634, 0.3294, 0.1849, 0.3412),
            (-0.569, -0.3909, 0.2289, 0.2183), (-0.5714, -0.0421, 0.3529, 0.029), (-0.2021, -0.0588, 0.2357, 0.2193), (0.2358, -0.0419, 0.3224, 0.3219),
            (0.7736, 0.2681, 0.1915, 0.2199), (0.7686, -0.3909, 0.2289, 0.2183), (0.7662, -0.0421, 0.3529, 0.029), (1.3234, -0.0421, 0.3224, 0.1133),
            (1.7669, -0.0073, 0.2038, 0.333),
        ])

        # move_constant: x^2+\frac{b}{a}x=-\frac{c}{a}
        move_constant = Tex(r"x^2+\frac{b}{a}x=-\frac{c}{a}", font_size=74.2416)
        move_constant_g = _glyphs(move_constant, [
            (-1.503, -0.0588, 0.2357, 0.2193), (-1.2596, 0.1507, 0.1365, 0.2279), (-0.8538, -0.0419, 0.3224, 0.3219), (-0.3155, 0.3294, 0.1849, 0.3412),
            (-0.3211, -0.3909, 0.2289, 0.2183), (-0.3235, -0.0421, 0.3529, 0.029), (0.0458, -0.0588, 0.2357, 0.2193), (0.5106, -0.0421, 0.3224, 0.1133),
            (1.0217, -0.0421, 0.2953, 0.0194), (1.4519, 0.2681, 0.1915, 0.2199), (1.4469, -0.3909, 0.2289, 0.2183), (1.4445, -0.0421, 0.3529, 0.029),
        ])
        move_constant.set_z_index(1)

        # add_to_both_sides: x^2+\frac{b}{a}x+\frac{b^2}{4a^2}=-\frac{c}{a}+\frac{b^2}{4a^2}
        add_to_both_sides = Tex(r"x^2+\frac{b}{a}x+\frac{b^2}{4a^2}=-\frac{c}{a}+\frac{b^2}{4a^2}", font_size=74.2416)
        add_to_both_sides_g = _glyphs(add_to_both_sides, [
            (-2.783, -0.0779, 0.2174, 0.2023), (-2.5585, 0.1154, 0.1259, 0.2102), (-2.1842, -0.0623, 0.2974, 0.2969), (-1.6876, 0.2802, 0.1706, 0.3148),
            (-1.6927, -0.3842, 0.2112, 0.2014), (-1.695, -0.0625, 0.3255, 0.0268), (-1.3543, -0.0779, 0.2174, 0.2023), (-0.9504, -0.0623, 0.2974, 0.2969),
            (-0.3422, 0.2802, 0.1706, 0.3148), (-0.1603, 0.3949, 0.1259, 0.2102), (-0.4679, -0.3444, 0.1978, 0.3023), (-0.2357, -0.3993, 0.2112, 0.2014),
            (-0.0263, -0.2614, 0.1259, 0.2102), (-0.2521, -0.0625, 0.7437, 0.0268), (0.471, -0.0625, 0.2974, 0.1045), (0.9424, -0.0625, 0.2724, 0.0179),
            (1.3393, 0.2236, 0.1767, 0.2028), (1.3347, -0.3842, 0.2112, 0.2014), (1.3324, -0.0625, 0.3255, 0.0268), (1.8216, -0.0623, 0.2974, 0.2969),
            (2.4298, 0.2802, 0.1706, 0.3148), (2.6117, 0.3949, 0.1259, 0.2102), (2.3041, -0.3444, 0.1978, 0.3023), (2.5363, -0.3993, 0.2112, 0.2014),
            (2.7456, -0.2614, 0.1259, 0.2102), (2.5199, -0.0625, 0.7437, 0.0268),
        ])

        # complete_the_square: \left(x+\frac{b}{2a}\right)^2=\frac{b^2-4ac}{4a^2}
        complete_the_square = Tex(r"\left(x+\frac{b}{2a}\right)^2=\frac{b^2-4ac}{4a^2}", font_size=74.2416)
        complete_the_square_g = _glyphs(complete_the_square, [
            (-1.8627, -0.0381, 0.1897, 0.9238), (-1.6471, -0.0514, 0.1875, 0.1744), (-1.2987, -0.0379, 0.2565, 0.2561), (-0.7742, 0.2574, 0.1471, 0.2715),
            (-0.8826, -0.2703, 0.1536, 0.2565), (-0.6824, -0.3156, 0.1821, 0.1737), (-0.7806, -0.0381, 0.4732, 0.0231), (-0.3898, -0.0381, 0.1897, 0.9238),
            (-0.1337, 0.4093, 0.1086, 0.1813), (0.2106, -0.0381, 0.2565, 0.0901), (0.641, 0.2574, 0.1471, 0.2715), (0.7979, 0.3564, 0.1086, 0.1813),
            (1.1207, 0.2222, 0.2349, 0.0154), (1.4521, 0.2563, 0.1706, 0.2607), (1.6524, 0.2089, 0.1821, 0.1737), (1.8416, 0.2086, 0.1524, 0.1749),
            (1.0494, -0.2812, 0.1706, 0.2607), (1.2497, -0.3286, 0.1821, 0.1737), (1.4302, -0.2096, 0.1086, 0.1813), (1.2355, -0.0381, 1.444, 0.0231),
        ])
        complete_the_square.set_z_index(1)

        # square_root: x+\frac{b}{2a}=\pm\frac{\sqrt{b^2-4ac}}{2a}
        square_root = Tex(r"x+\frac{b}{2a}=\pm\frac{\sqrt{b^2-4ac}}{2a}", font_size=74.2416)
        square_root_g = _glyphs(square_root, [
            (-2.1014, -0.1, 0.2137, 0.1988), (-1.7043, -0.0846, 0.2923, 0.2919), (-1.1065, 0.252, 0.1677, 0.3094), (-1.23, -0.3495, 0.1751, 0.2923),
            (-1.0018, -0.401, 0.2076, 0.1979), (-1.1137, -0.0848, 0.5394, 0.0263), (-0.4987, -0.0848, 0.2923, 0.1027), (-0.0353, -0.0484, 0.2923, 0.2923),
            (0.7077, 0.252, 0.1677, 0.3094), (0.8865, 0.3323, 0.1238, 0.2067), (1.2545, 0.2119, 0.2677, 0.0176), (1.6322, 0.2507, 0.1944, 0.2971),
            (1.8604, 0.1967, 0.2076, 0.1979), (2.0761, 0.1964, 0.1737, 0.1994), (0.4348, 0.2806, 0.3431, 0.4389), (1.3853, 0.4868, 1.558, 0.0263),
            (1.0819, -0.3495, 0.1751, 0.2923), (1.3101, -0.401, 0.2076, 0.1979), (1.1982, -0.0848, 2.0202, 0.0263),
        ])

        # solution: x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}
        solution = Tex(r"x=\frac{-b\pm\sqrt{b^2-4ac}}{2a}", font_size=74.2416)
        solution_g = _glyphs(solution, [
            (-1.8732, -0.1, 0.2137, 0.1988), (-1.4517, -0.0848, 0.2923, 0.1027), (-0.8918, 0.2119, 0.2677, 0.0176), (-0.6197, 0.252, 0.1677, 0.3094),
            (-0.2645, 0.2483, 0.2923, 0.2923), (0.4795, 0.252, 0.1677, 0.3094), (0.6583, 0.3323, 0.1238, 0.2067), (1.0262, 0.2119, 0.2677, 0.0176),
            (1.404, 0.2507, 0.1944, 0.2971), (1.6322, 0.1967, 0.2076, 0.1979), (1.8479, 0.1964, 0.1737, 0.1994), (0.2066, 0.2806, 0.3431, 0.4389),
            (1.1571, 0.4868, 1.558, 0.0263), (0.3205, -0.3495, 0.1751, 0.2923), (0.5487, -0.401, 0.2076, 0.1979), (0.4368, -0.0848, 3.0864, 0.0263),
        ])
        solution.set_z_index(1)

        # 0 s – 1.5 s: standard_form write
        self.play(Write(VGroup(*standard_form_g[:]), stroke_color="#FFFFFF"), run_time=1.5)
        # 1.5 s – 2.7 s
        self.wait(1.2)
        self.add(divide_by_a)
        # 2.7 s – 4.1 s
        self.wait(1.4)
        self.remove(standard_form)
        # 4.1 s – 5.3 s
        self.wait(1.2)
        self.add(move_constant)
        # 5.3 s – 6.9 s
        self.wait(1.6)
        self.remove(divide_by_a)
        # 6.9 s – 8.1 s
        self.wait(1.2)
        self.add(add_to_both_sides)
        # 8.1 s – 9.3 s
        self.wait(1.2)
        self.remove(move_constant)
        # 9.3 s – 10.5 s
        self.wait(1.2)
        self.add(complete_the_square)
        # 10.5 s – 12.5 s
        self.wait(2)
        self.remove(add_to_both_sides)
        # 12.5 s – 13.7 s
        self.wait(1.2)
        self.add(square_root)
        # 13.7 s – 15.3 s
        self.wait(1.6)
        self.remove(complete_the_square)
        # 15.3 s – 16.5 s
        self.wait(1.2)
        self.add(solution)
        # 16.5 s – 18.1 s
        self.wait(1.6)
        self.remove(square_root)
        # 18.1 s – 20.6 s
        self.wait(2.5)
