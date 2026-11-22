# An Appear block makes glyphs wait — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 AnAppearBlockMakesGlyphsWait.py AnAppearBlockMakesGlyphsWait
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


class AnAppearBlockMakesGlyphsWait(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # label_intro_alone: \text{Intro: Write}
        label_intro_alone = MathTex(r"\text{Intro: Write}", font_size=40, color="#BBBBBB")
        label_intro_alone_g = _glyphs(label_intro_alone, [
            (-3.4674, 0.0156, 0.4511, 0.9688), (-2.8085, -0.1548, 0.7333, 0.6279), (-2.173, -0.0397, 0.4468, 0.8865), (-1.5979, -0.1548, 0.4879, 0.6279),
            (-0.9603, -0.1582, 0.6284, 0.6496), (-0.4085, -0.1638, 0.1716, 0.6099), (0.8723, 0, 1.4057, 1), (1.8745, -0.1548, 0.4879, 0.6279),
            (2.3574, 0.0057, 0.3248, 0.9489), (2.8014, -0.0397, 0.4468, 0.8865), (3.4184, -0.1589, 0.5489, 0.6511),
        ])
        label_intro_alone.move_to([0, 0.6, 0])
        label_intro_alone.set_z_index(2)

        # label_intro_and_block: \text{Intro: Write. Block: Appear, FadeIn, on } {=}\ c
        label_intro_and_block = MathTex(r"\text{Intro: Write. Block: Appear, FadeIn, on } {=}\ c", font_size=40, color="#BBBBBB")
        label_intro_and_block_g = _glyphs(label_intro_and_block, [
            (-10.1682, 0.0888, 0.3492, 0.75), (-9.6581, -0.0432, 0.5677, 0.4861), (-9.1662, 0.0459, 0.3459, 0.6863), (-8.7209, -0.0432, 0.3777, 0.4861),
            (-8.2273, -0.0458, 0.4865, 0.5029), (-7.8001, -0.0501, 0.1329, 0.4722), (-6.8086, 0.0767, 1.0882, 0.7742), (-6.0328, -0.0432, 0.3777, 0.4861),
            (-5.6589, 0.0811, 0.2515, 0.7346), (-5.3152, 0.0459, 0.3459, 0.6863), (-4.8375, -0.0463, 0.425, 0.504), (-4.4411, -0.2204, 0.1329, 0.1318),
            (-3.6406, 0.0888, 0.6841, 0.75), (-3.0772, 0.0952, 0.2602, 0.7628), (-2.6567, -0.0458, 0.4865, 0.5029), (-2.1351, -0.0467, 0.4184, 0.5048),
            (-1.6025, 0.0952, 0.5392, 0.7628), (-1.1622, -0.0501, 0.1329, 0.4722), (-0.3232, 0.1069, 0.7522, 0.7862), (0.3867, -0.1497, 0.5512, 0.6991),
            (0.9973, -0.1497, 0.5512, 0.6991), (1.5534, -0.0463, 0.425, 0.504), (2.0871, -0.0463, 0.504, 0.504), (2.5577, -0.0432, 0.3777, 0.4861),
            (2.9354, -0.3267, 0.1449, 0.3466), (3.7057, 0.0871, 0.6424, 0.7467), (4.3635, -0.0463, 0.504, 0.504), (4.9356, 0.0891, 0.5501, 0.7749),
            (5.4769, -0.0463, 0.425, 0.504), (5.9189, 0.0888, 0.3492, 0.75), (6.429, -0.0432, 0.5677, 0.4861), (6.8863, -0.3267, 0.1449, 0.3466),
            (7.582, -0.0458, 0.4865, 0.5029), (8.1684, -0.0432, 0.5677, 0.4861), (9.1693, -0.0117, 0.7313, 0.257), (10.1255, -0.0503, 0.4345, 0.4989),
        ])
        label_intro_and_block.move_to([0, -2.75, 0])

        # alone: a + b = c
        alone = MathTex(r"a + b = c", font_size=96)
        alone_g = _glyphs(alone, [
            (-2.215, -0.1166, 0.6095, 0.5812), (-1.093, -0.0715, 0.8582, 0.857), (-0.0076, 0.0457, 0.4923, 0.9085), (1.1068, -0.0722, 0.8582, 0.3015),
            (2.2648, -0.1175, 0.5099, 0.5855),
        ])
        alone.move_to([0, 1.9, 0])
        alone.set_z_index(3)

        # waiting: a + b = c
        waiting = MathTex(r"a + b = c", font_size=96)
        waiting_g = _glyphs(waiting, [
            (-2.215, -0.1166, 0.6095, 0.5812), (-1.093, -0.0715, 0.8582, 0.857), (-0.0076, 0.0457, 0.4923, 0.9085), (1.1068, -0.0722, 0.8582, 0.3015),
            (2.2648, -0.1175, 0.5099, 0.5855),
        ])
        waiting.move_to([0, -1.5, 0])
        waiting.set_z_index(1)

        self.add(label_intro_alone)
        self.add(label_intro_and_block)
        # 0 s – 0.4 s
        self.wait(0.4)
        # 0.4 s – 1.4 s: alone write, waiting write
        self.play(Write(VGroup(*alone_g[:])), Write(VGroup(*waiting_g[:3])), run_time=1)
        # 1.4 s – 2 s
        self.wait(0.6)
        # 2 s – 2.8 s: waiting fade_in
        self.play(FadeIn(VGroup(waiting_g[3], waiting_g[4])), run_time=0.8)
        # 2.8 s – 6 s
        self.wait(3.2)
