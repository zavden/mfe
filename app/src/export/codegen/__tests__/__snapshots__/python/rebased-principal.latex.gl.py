# Rebased principal — exported by Manim Formula Editor for ManimGL 1.7.
# Render at 480×270, 30 fps:
#     manimgl Pinned.py Pinned -w -r 480x270 --fps 30
# Every play and wait lasts a whole number of frames at 30 fps, so the video has
# exactly 150 frames, like the editor's video export.
from manimlib import *


class Pinned(Scene):
    default_camera_config = dict(background_color="#000000")

    def construct(self):

        # source: b+a
        source = Tex(r"b+a")
        source.move_to([-3, 1.5, 0])
        source.set_z_index(3)

        # derivation: y+x=z
        derivation = Tex(r"y+x=z")
        derivation.move_to([0, -1.5, 0])

        # target: c
        target = Tex(r"c")
        target.move_to([1, 1.5, 0])
        target.set_z_index(2)

        # later: d
        later = Tex(r"d")
        later.move_to([3, 1.5, 0])
        later.set_z_index(1)

        self.add(source)
        self.add(*derivation[:4])
        # 0 s – 1 s
        self.wait(1)
        # 1 s – 2 s: derivation morph, source → target
        self.play(
            TransformFromCopy(derivation[0], derivation[4]),
            ReplacementTransform(derivation[2], derivation[4]),
            TransformFromCopy(source[0], target[0]),
            ReplacementTransform(source[2], target[0]),
            run_time=1,
        )
        # 2 s – 3 s
        self.wait(1)
        # 3 s – 4 s: source → later
        self.play(TransformFromCopy(source[0], later[0]), run_time=1)
        # 4 s – 4.5 s
        self.wait(0.5)
        # 4.5 s – 5 s: source fade_out, derivation fade_out
        self.play(
            FadeOut(source[:2]),
            FadeOut(VGroup(derivation[0], derivation[1], derivation[3], derivation[4])),
            run_time=0.5,
        )
