# Braces at any angle — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 BracesAtAnyAngle.py BracesAtAnyAngle
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 540 frames, like the editor's video export.
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


class BracesAtAnyAngle(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # letter: x
        letter = MathTex(r"x", font_size=192)
        letter_g = _glyphs(letter, [
            (0, 0, 1.0751, 1),
        ])

        # b_d1: brace, built on letter where its clip starts

        # b_d2: brace, built on letter where its clip starts

        # b_d3: brace, built on letter where its clip starts

        # b_d4: brace, built on letter where its clip starts

        # 0 s – 0.8 s: letter fade_in
        self.play(FadeIn(letter), run_time=0.8)
        # 0.8 s – 1.6 s
        self.wait(0.8)
        b_d1 = Brace(letter, rotate_vector(DOWN, 45 * DEGREES), buff=0.3, color="#58C4DD")
        b_d1.set_z_index(1)
        # 1.6 s – 2.3 s: b_d1 grow_from_center
        self.play(GrowFromCenter(b_d1), run_time=0.7)
        # 2.3 s – 3 s
        self.wait(0.7)
        b_d2 = Brace(letter, rotate_vector(DOWN, 135 * DEGREES), buff=0.3, color="#83C167")
        b_d2.set_z_index(2)
        # 3 s – 3.7 s: b_d2 grow_from_center
        self.play(GrowFromCenter(b_d2), run_time=0.7)
        # 3.7 s – 4.4 s
        self.wait(0.7)
        b_d3 = Brace(letter, rotate_vector(DOWN, -135 * DEGREES), buff=0.3, color="#FFFF00")
        b_d3.set_z_index(3)
        # 4.4 s – 5.1 s: b_d3 grow_from_center
        self.play(GrowFromCenter(b_d3), run_time=0.7)
        # 5.1 s – 5.8 s
        self.wait(0.7)
        b_d4 = Brace(letter, rotate_vector(DOWN, -45 * DEGREES), buff=0.3, color="#FC6255")
        b_d4.set_z_index(4)
        # 5.8 s – 6.5 s: b_d4 grow_from_center
        self.play(GrowFromCenter(b_d4), run_time=0.7)
        # 6.5 s – 8.2 s
        self.wait(1.7)
        # 8.2 s – 9 s: b_d1 fade_out, b_d2 fade_out, b_d3 fade_out, b_d4 fade_out, letter fade_out
        self.play(
            FadeOut(b_d1),
            FadeOut(b_d2),
            FadeOut(b_d3),
            FadeOut(b_d4),
            FadeOut(letter),
            run_time=0.8,
        )
