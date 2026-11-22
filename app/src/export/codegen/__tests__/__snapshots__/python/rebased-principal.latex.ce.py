# Rebased principal — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 30 fps:
#     manim -r 480,270 --fps 30 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 150 frames, like the editor's video export.
from manim import *


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # source: b+a
        source = MathTex(r"b+a")
        source.move_to([-3, 1.5, 0])
        source.set_z_index(3)

        # derivation: y+x=z
        derivation = MathTex(r"y+x=z")
        derivation.move_to([0, -1.5, 0])

        # target: c
        target = MathTex(r"c")
        target.move_to([1, 1.5, 0])
        target.set_z_index(2)

        # later: d
        later = MathTex(r"d")
        later.move_to([3, 1.5, 0])
        later.set_z_index(1)

        self.add(source)
        self.add(*derivation[0][:4])
        # 0 s – 1 s
        self.wait(1)
        # 1 s – 2 s: derivation morph, source → target
        self.play(
            ReplacementTransform(derivation[0][0].copy(), derivation[0][4]),
            Transform(derivation[0][2], derivation[0][4], remover=True),
            ReplacementTransform(source[0][0].copy(), target[0][0]),
            Transform(source[0][2], target[0][0], remover=True),
            run_time=1,
        )
        # 2 s – 3 s
        self.wait(1)
        # 3 s – 4 s: source → later
        self.play(ReplacementTransform(source[0][0].copy(), later[0][0]), run_time=1)
        # 4 s – 4.5 s
        self.wait(0.5)
        # 4.5 s – 5 s: source fade_out, derivation fade_out
        self.play(
            FadeOut(source[0][:2]),
            FadeOut(VGroup(derivation[0][0], derivation[0][1], derivation[0][3], derivation[0][4])),
            run_time=0.5,
        )
