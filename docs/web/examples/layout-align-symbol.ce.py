# Align by symbol — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 AlignBySymbol.py AlignBySymbol
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 600 frames, like the editor's video export.
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


class AlignBySymbol(Scene):
    def construct(self):
        self.camera.background_color = "#070B15"

        # l1: 2x + 3 = 11
        l1 = MathTex(r"2x + 3 = 11", font_size=72)
        l1_g = _glyphs(l1, [
            (-3.0789, 0.0548, 0.5334, 0.8904), (-2.3717, -0.1023, 0.6511, 0.6056), (-1.1622, -0.0555, 0.8904, 0.889), (-0.0115, 0.0394, 0.5548, 0.9184),
            (1.2148, -0.0561, 0.8904, 0.3128), (2.4472, 0.0548, 0.4599, 0.8904), (3.1156, 0.0548, 0.4599, 0.8904),
        ])
        l1.move_to([0, 2.4, 0])
        l1.set_z_index(3)

        # l2: 2x = 11 - 3
        l2 = MathTex(r"2x = 11 - 3", font_size=72)
        l2_g = _glyphs(l2, [
            (-3.3692, 0.016, 0.5799, 0.968), (-2.6003, -0.1548, 0.7078, 0.6584), (-1.2045, -0.1047, 0.968, 0.3401), (0.1353, 0.016, 0.5, 0.968),
            (0.8621, 0.016, 0.5, 0.968), (2.1065, -0.1047, 0.8866, 0.0581), (3.3576, -0.0007, 0.6032, 0.9985),
        ])
        l2.move_to([1.305969, 0.8, 0])
        l2.set_z_index(2)

        # l3: 2x = 8
        l3 = MathTex(r"2x = 8", font_size=72)
        l3_g = _glyphs(l3, [
            (-1.7541, 0.016, 0.5799, 0.968), (-0.9852, -0.1548, 0.7078, 0.6584), (0.4106, -0.1047, 0.968, 0.3401), (1.7432, 0, 0.6017, 1),
        ])
        l3.move_to([0.470702, -0.8, 0])
        l3.set_z_index(1)

        # l4: x = 4
        l4 = MathTex(r"x = 4", font_size=72)
        l4_g = _glyphs(l4, [
            (-1.3478, -0.1708, 0.7078, 0.6584), (0.048, -0.1206, 0.968, 0.3401), (1.3798, 0.008, 0.6439, 0.984),
        ])
        l4.move_to([0.658246, -2.4, 0])

        # 0 s – 1 s: l1 write
        self.play(Write(VGroup(*l1_g[:])), run_time=1)
        # 1 s – 1.2 s
        self.wait(0.2)
        # 1.2 s – 2.2 s: l2 write
        self.play(Write(VGroup(*l2_g[:])), run_time=1)
        # 2.2 s – 2.4 s
        self.wait(0.2)
        # 2.4 s – 3.4 s: l3 write
        self.play(Write(VGroup(*l3_g[:])), run_time=1)
        # 3.4 s – 3.6 s
        self.wait(0.2)
        # 3.6 s – 4.6 s: l4 write
        self.play(Write(VGroup(*l4_g[:])), run_time=1)
        # 4.6 s – 10 s
        self.wait(5.4)
