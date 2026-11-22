# Glyphs that are not there yet — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 GlyphsThatAreNotThereYet.py GlyphsThatAreNotThereYet
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 384 frames, like the editor's video export.
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


class GlyphsThatAreNotThereYet(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # source: a+b=c
        source = MathTex(r"a+b=c", font_size=144)
        source_g = _glyphs(source, [
            (-2.215, -0.1166, 0.6095, 0.5812), (-1.093, -0.0715, 0.8582, 0.857), (-0.0076, 0.0457, 0.4923, 0.9085), (1.1068, -0.0722, 0.8582, 0.3015),
            (2.2648, -0.1175, 0.5099, 0.5855),
        ])
        source_g[0].set_color("#F4C867")
        source_g[2].set_color("#58C4DD")
        source_g[4].set_color("#FC6255")
        source.set_z_index(1)

        # target: a=c-b
        target = MathTex(r"a=c-b", font_size=144)
        target_g = _glyphs(target, [
            (-2.4309, -0.1774, 0.6697, 0.6385), (-1.1194, -0.1286, 0.9429, 0.3313), (0.1528, -0.1784, 0.5602, 0.6432), (1.3029, -0.1286, 0.8636, 0.0566),
            (2.4953, 0.0009, 0.5408, 0.9981),
        ])
        target_g[0].set_color("#F4C867")
        target_g[2].set_color("#FC6255")
        target_g[4].set_color("#58C4DD")

        # 0 s – 1 s: source write
        self.play(Write(VGroup(*source_g[:])), run_time=1)
        # 1 s – 2.4 s
        self.wait(1.4)
        # 2.4 s – 3.9 s: source fade_out, source → target
        self.play(
            FadeOut(VGroup(source_g[1], source_g[2])),
            ReplacementTransform(source_g[0], target_g[0], path_arc=-60 * DEGREES),
            ReplacementTransform(source_g[3], target_g[1], path_arc=-60 * DEGREES),
            ReplacementTransform(source_g[4], target_g[2], path_arc=-60 * DEGREES),
            run_time=1.5,
        )
        # 3.9 s – 4.8 s
        self.wait(0.9)
        # 4.8 s – 5.6 s: target write
        self.play(Write(VGroup(target_g[3], target_g[4])), run_time=0.8)
        # 5.6 s – 6.4 s
        self.wait(0.8)
