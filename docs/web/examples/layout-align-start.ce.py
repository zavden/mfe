# Align and distribute (start) — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 AlignAndDistributeStart.py AlignAndDistributeStart
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


class _Part(Animation):
    """Plays the stretch [a0, a1] of `anim` (fractions of its run time) inside one
    self.play, so that animations that overlap in time can start and end between plays.
    The animation begins in its part with a0 == 0 and finishes (and leaves or enters the
    scene) in its part with a1 == 1; it keeps its own rate function and lag throughout."""

    def __init__(self, anim, a0, a1):
        self.anim, self.a0, self.a1 = anim, a0, a1
        super().__init__(anim.mobject, rate_func=linear)

    def begin(self):
        if self.a0 == 0:
            self.anim.begin()

    def _setup_scene(self, scene):  # ManimCE: introducers add their mobject here
        if self.a0 == 0:
            self.anim._setup_scene(scene)

    def is_introducer(self):  # ManimCE
        return self.anim.is_introducer()

    def interpolate(self, alpha):
        self.anim.interpolate(self.a0 + (self.a1 - self.a0) * alpha)

    def update_mobjects(self, dt):  # ManimCE
        self.anim.update_mobjects(dt)

    def update_reference_mobjects(self, dt, **kwargs):  # ManimGL
        self.anim.update_reference_mobjects(dt, **kwargs)

    def finish(self):
        if self.a1 == 1:
            self.anim.finish()
        else:
            self.anim.interpolate(self.a1)

    def clean_up_from_scene(self, scene):
        if self.a1 == 1:
            self.anim.clean_up_from_scene(scene)


class AlignAndDistributeStart(Scene):
    def construct(self):
        self.camera.background_color = "#070B15"

        # line1: x + 3 = 5
        line1 = MathTex(r"x + 3 = 5", font_size=72, color="#58C4DD")
        line1_g = _glyphs(line1, [
            (-2.3763, -0.1023, 0.6511, 0.6056), (-1.1668, -0.0555, 0.8904, 0.889), (-0.0162, 0.0394, 0.5548, 0.9184), (1.2102, -0.0561, 0.8904, 0.3128),
            (2.4352, 0.0401, 0.5334, 0.9198),
        ])
        line1.move_to([-5, 2.6, 0])
        line1.set_z_index(6)

        # line2: x = 5 - 3
        line2 = MathTex(r"x = 5 - 3", font_size=72, color="#58C4DD")
        line2_g = _glyphs(line2, [
            (-2.5894, -0.1548, 0.7078, 0.6584), (-1.1936, -0.1047, 0.968, 0.3401), (0.1382, 0, 0.5799, 1), (1.3907, -0.1047, 0.8866, 0.0581),
            (2.6417, -0.0007, 0.6032, 0.9985),
        ])
        line2.move_to([-3.9, 1.6, 0])
        line2.set_z_index(5)

        # line3: x = 2
        line3 = MathTex(r"x = 2", font_size=72, color="#58C4DD")
        line3_g = _glyphs(line3, [
            (-1.3535, -0.1654, 0.7194, 0.6691), (0.065, -0.1145, 0.9838, 0.3456), (1.4185, 0.0081, 0.5894, 0.9838),
        ])
        line3.move_to([-5.4, -0.4, 0])
        line3.set_z_index(4)

        # row1: a^2 + b^2
        row1 = MathTex(r"a^2 + b^2", font_size=72, color="#F4C867")
        row1_g = _glyphs(row1, [
            (-1.2742, -0.192, 0.4897, 0.4669), (-0.7888, 0.2562, 0.2921, 0.4875), (0.0793, -0.1557, 0.6895, 0.6885), (0.9513, -0.0615, 0.3955, 0.7299),
            (1.373, 0.2562, 0.2921, 0.4875),
        ])
        row1.move_to([-3.2, -2.2, 0])
        row1.set_z_index(3)

        # row2: \frac{a}{b}
        row2 = MathTex(r"\frac{a}{b}", font_size=72, color="#F4C867")
        row2_g = _glyphs(row2, [
            (0.0028, 0.3757, 0.2607, 0.2486), (0.0091, -0.3057, 0.2106, 0.3886), (0, 0.0221, 0.4019, 0.0331),
        ])
        row2.move_to([-0.4, -2.55, 0])
        row2.set_z_index(2)

        # row3: \sqrt{c}
        row3 = MathTex(r"\sqrt{c}", font_size=72, color="#F4C867")
        row3_g = _glyphs(row3, [
            (0.4062, -0.116, 0.3957, 0.4543), (-0.2165, 0, 0.7817, 1), (0.3908, 0.47, 0.433, 0.06),
        ])
        row3.move_to([4, -1.8, 0])
        row3.set_z_index(1)

        # title: E = mc^2
        title = MathTex(r"E = mc^2", font_size=72, color="#83C167")
        title_g = _glyphs(title, [
            (-1.671, -0.1069, 0.8179, 0.7588), (-0.518, -0.2073, 0.7431, 0.2611), (0.7159, -0.2454, 0.9328, 0.5062), (1.4644, -0.2465, 0.4415, 0.507),
            (1.9225, 0.2373, 0.3148, 0.5254),
        ])
        title.move_to([3.6, 2, 0])

        line1_in = Write(VGroup(*line1_g[:]))
        # 0 s – 0.4 s: line1 write
        self.play(_Part(line1_in, 0, 0.5), run_time=0.4)
        line2_in = Write(VGroup(*line2_g[:]))
        # 0.4 s – 0.8 s: line1 write, line2 write
        self.play(_Part(line1_in, 0.5, 1), _Part(line2_in, 0, 0.5), run_time=0.4)
        line3_in = Write(VGroup(*line3_g[:]))
        # 0.8 s – 1.2 s: line2 write, line3 write
        self.play(_Part(line2_in, 0.5, 1), _Part(line3_in, 0, 0.5), run_time=0.4)
        row1_in = Write(VGroup(*row1_g[:]))
        # 1.2 s – 1.6 s: line3 write, row1 write
        self.play(_Part(line3_in, 0.5, 1), _Part(row1_in, 0, 0.5), run_time=0.4)
        row2_in = Write(VGroup(*row2_g[:]))
        # 1.6 s – 2 s: row1 write, row2 write
        self.play(_Part(row1_in, 0.5, 1), _Part(row2_in, 0, 0.5), run_time=0.4)
        row3_in = Write(VGroup(*row3_g[:]))
        # 2 s – 2.4 s: row2 write, row3 write
        self.play(_Part(row2_in, 0.5, 1), _Part(row3_in, 0, 0.5), run_time=0.4)
        title_in = Write(VGroup(*title_g[:]))
        # 2.4 s – 2.8 s: row3 write, title write
        self.play(_Part(row3_in, 0.5, 1), _Part(title_in, 0, 0.5), run_time=0.4)
        # 2.8 s – 3.2 s: title write
        self.play(_Part(title_in, 0.5, 1), run_time=0.4)
        # 3.2 s – 10 s
        self.wait(6.8)
