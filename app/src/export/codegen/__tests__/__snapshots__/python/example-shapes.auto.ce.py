# Shapes — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 1920×1080, 60 fps:
#     manim -r 1920,1080 --fps 60 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 60 fps, so the video has
# exactly 540 frames, like the editor's video export.
from manim import *


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # sum: 1+2+3+4+5+6
        sum = MathTex(r"1+2+3+4+5+6", font_size=60)
        sum.move_to([0, 0.6, 0])

        # frame: box, built on sum where its clip starts

        # under: brace, built on frame where its clip starts

        # 0 s – 1.5 s: sum write
        self.play(Write(sum), run_time=1.5)
        # 1.5 s – 2 s
        self.wait(0.5)
        frame = SurroundingRectangle(sum[0][:5], buff=0.15, color="#FFFF00", corner_radius=0.12).set_fill("#FFFF00")
        frame.set_z_index(1)
        # 2 s – 2.6 s: frame create
        self.play(Create(frame), run_time=0.6)
        # 2.6 s – 3.5 s
        self.wait(0.9)
        frame_to = SurroundingRectangle(sum[0][6:], buff=0.15, color="#83C167", corner_radius=0.12, stroke_width=6, fill_opacity=0.25).set_fill("#FFFF00")
        # 3.5 s – 4.5 s: frame tween
        self.play(Transform(frame, frame_to), run_time=1)
        # 4.5 s – 5.5 s
        self.wait(1)
        frame_to_2 = SurroundingRectangle(sum, buff=0.15, color="#FFFFFF", corner_radius=0.12).set_fill("#FFFF00")
        # 5.5 s – 6.5 s: frame tween
        self.play(Transform(frame, frame_to_2), run_time=1)
        # 6.5 s – 7 s
        self.wait(0.5)
        under = Brace(frame, DOWN, buff=0.2, color="#58C4DD")
        under.set_z_index(2)
        # 7 s – 7.5 s: under grow_from_center
        self.play(GrowFromCenter(under), run_time=0.5)
        # 7.5 s – 8.2 s
        self.wait(0.7)
        # 8.2 s – 9 s: frame fade_out, sum fade_out, under fade_out
        self.play(FadeOut(frame), FadeOut(sum), FadeOut(under), run_time=0.8)
