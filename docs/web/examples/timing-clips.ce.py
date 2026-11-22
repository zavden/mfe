# Timing of clips — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 TimingOfClips.py TimingOfClips
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 480 frames, like the editor's video export.
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


class TimingOfClips(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # energy: E = mc^2
        energy = MathTex(r"E = mc^2", font_size=96)
        energy_g = _glyphs(energy, [
            (-1.671, -0.1069, 0.8179, 0.7588), (-0.518, -0.2073, 0.7431, 0.2611), (0.7159, -0.2454, 0.9328, 0.5062), (1.4644, -0.2465, 0.4415, 0.507),
            (1.9225, 0.2373, 0.3148, 0.5254),
        ])
        energy.move_to([0, 1.4, 0])
        energy.set_z_index(1)

        # note: c \approx 3 \times 10^{8}\ \mathrm{m/s}
        note = MathTex(r"c \approx 3 \times 10^{8}\ \mathrm{m/s}", font_size=64)
        note_g = _glyphs(note, [
            (-2.8389, -0.09, 0.349, 0.4007), (-2.0739, -0.0423, 0.5883, 0.3775), (-1.2653, 0.004, 0.366, 0.6059), (-0.5058, -0.059, 0.426, 0.4251),
            (0.2586, 0.0142, 0.3034, 0.5874), (0.6947, 0.0045, 0.3713, 0.6068), (1.1006, 0.2855, 0.2581, 0.429), (1.8934, -0.0843, 0.7003, 0.3904),
            (2.4763, -0.059, 0.3422, 0.8819), (2.8697, -0.0868, 0.2875, 0.4048),
        ])
        note.move_to([0, -1.3, 0])

        # note: c \approx 3 \times 10^{8}\ \mathrm{m/s}
        note_2 = MathTex(r"c \approx 3 \times 10^{8}\ \mathrm{m/s}", font_size=64)
        note_2_g = _glyphs(note_2, [
            (-2.8389, -0.09, 0.349, 0.4007), (-2.0739, -0.0423, 0.5883, 0.3775), (-1.2653, 0.004, 0.366, 0.6059), (-0.5058, -0.059, 0.426, 0.4251),
            (0.2586, 0.0142, 0.3034, 0.5874), (0.6947, 0.0045, 0.3713, 0.6068), (1.1006, 0.2855, 0.2581, 0.429), (1.8934, -0.0843, 0.7003, 0.3904),
            (2.4763, -0.059, 0.3422, 0.8819), (2.8697, -0.0868, 0.2875, 0.4048),
        ])
        note_2.move_to([0, 1.4, 0])
        note_2.set_z_index(1)

        # 0 s – 1 s
        self.wait(1)
        # 1 s – 2 s: energy write
        self.play(Write(VGroup(*energy_g[:])), run_time=1)
        # 2 s – 2.5 s: note fade_in
        self.play(FadeIn(note), run_time=0.5)
        # 2.5 s – 4 s
        self.wait(1.5)
        energy_out = FadeOut(energy)
        # 4 s – 4.5 s: energy fade_out
        self.play(_Part(energy_out, 0, 0.5), run_time=0.5)
        self.remove(note)
        # 4.5 s – 5 s: energy fade_out
        self.play(_Part(energy_out, 0.5, 1), run_time=0.5)
        # 5 s – 6 s
        self.wait(1)
        self.add(note_2)
        # 6 s – 8 s
        self.wait(2)
