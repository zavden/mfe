# Scene to read — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 1920×1080, 60 fps:
#     manimgl SceneToRead.py SceneToRead -w -r 1920x1080 --fps 60
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 360 frames, like the editor's video export.
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


class SceneToRead(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # step1: 2x + 1 = 7
        step1 = Tex(r"2x + 1 = 7", font_size=98.9888)
        step1_g = _glyphs(step1, [
            (-2.7467, 0.0475, 0.5264, 0.8786), (-2.0488, -0.1075, 0.6425, 0.5976), (-0.8553, -0.0613, 0.8786, 0.8773), (0.2875, 0.0475, 0.4538, 0.8786),
            (1.4904, -0.062, 0.8786, 0.3087), (2.7263, 0.0396, 0.5673, 0.9208),
        ])
        step1_g[1].set_color("#F4C867")
        step1.move_to([-1.0921, 0, 0])
        step1.set_z_index(1)

        # step2: 2x = 6
        step2 = Tex(r"2x = 6", font_size=98.9888)
        step2_g = _glyphs(step2, [
            (-1.7533, 0.016, 0.5799, 0.968), (-0.9844, -0.1548, 0.7078, 0.6584), (0.4113, -0.1047, 0.968, 0.3401), (1.742, 0, 0.6027, 1),
        ])
        step2_g[1].set_color("#F4C867")
        step2.move_to([-0.2435, 0, 0])

        # step3: x = 3
        step3 = Tex(r"x = 3", font_size=98.9888)
        step3_g = _glyphs(step3, [
            (-1.3396, -0.1543, 0.7089, 0.6594), (0.0582, -0.1041, 0.9694, 0.3406), (1.392, 0, 0.6041, 1),
        ])
        step3_g[0].set_color("#F4C867")
        step3.set_z_index(1)

        # 0 s – 1 s: step1 write
        self.play(Write(VGroup(*step1_g[:]), stroke_color="#FFFFFF"), run_time=1)
        # 1 s – 2 s
        self.wait(1)
        # 2 s – 3 s: step1 fade_out, step1 → step2
        self.play(
            FadeOut(VGroup(step1_g[2], step1_g[3])),
            ReplacementTransform(step1_g[0], step2_g[0]),
            ReplacementTransform(step1_g[1], step2_g[1]),
            ReplacementTransform(step1_g[4], step2_g[2]),
            ReplacementTransform(step1_g[5], step2_g[3]),
            run_time=1,
        )
        # 3 s – 4 s
        self.wait(1)
        step2_g[1].set_z_index(1)
        step2_g[2].set_z_index(1)
        step2_g[3].set_z_index(1)
        # 4 s – 5 s: step2 fade_out, step2 → step3
        self.play(
            FadeOut(VGroup(step2_g[0])),
            ReplacementTransform(step2_g[1], step3_g[0]),
            ReplacementTransform(step2_g[2], step3_g[1]),
            FadeTransform(step2_g[3], step3_g[2]),
            run_time=1,
        )
        # 5 s – 6 s
        self.wait(1)
