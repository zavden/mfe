# Shared fitted dimensions — exported by Manim Formula Editor for ManimCE 0.22.
# Render at 480×270, 12 fps:
#     manim -r 480,270 --fps 12 Pinned.py Pinned
# Every play and wait lasts a whole number of frames at 12 fps, so the video has
# exactly 60 frames, like the editor's video export.
from manim import *


class Pinned(Scene):
    def construct(self):
        self.camera.background_color = "#000000"

        # host0: box
        host0 = Rectangle(width=1, height=0.35, color="#FFFF00")
        host0.move_to([-3, 2.8, 0])
        host0.set_z_index(24)

        # other0: box
        other0 = Rectangle(width=2, height=0.45, color="#FFFF00")
        other0.move_to([2, 2.8, 0])
        other0.set_z_index(23)

        # host1: box
        host1 = Rectangle(width=1, height=0.35, color="#FFFF00")
        host1.move_to([-3, 1.5, 0])
        host1.set_z_index(19)

        # other1: box
        other1 = Rectangle(width=2, height=0.45, color="#FFFF00")
        other1.move_to([2, 1.5, 0])
        other1.set_z_index(18)

        # host2: box
        host2 = Rectangle(width=1, height=0.35, color="#FFFF00")
        host2.move_to([-3, 0.2, 0])
        host2.set_z_index(14)

        # other2: box
        other2 = Rectangle(width=2, height=0.45, color="#FFFF00")
        other2.move_to([2, 0.2, 0])
        other2.set_z_index(13)

        # host3: box
        host3 = Rectangle(width=1, height=0.35, color="#FFFF00")
        host3.move_to([-3, -1.1, 0])
        host3.set_z_index(9)

        # other3: box
        other3 = Rectangle(width=2, height=0.45, color="#FFFF00")
        other3.move_to([2, -1.1, 0])
        other3.set_z_index(8)

        # host4: box
        host4 = Rectangle(width=1, height=0.35, color="#FFFF00")
        host4.move_to([-3, -2.4, 0])
        host4.set_z_index(4)

        # other4: box
        other4 = Rectangle(width=2, height=0.45, color="#FFFF00")
        other4.move_to([2, -2.4, 0])
        other4.set_z_index(3)

        # shared0: brace, built on other0 where its clip starts

        # shared1: box, built on other1 where its clip starts

        # shared2: circle, built on other2 where its clip starts

        # shared3: underline, built on other3 where its clip starts

        # shared4: cross, built on other4 where its clip starts

        # shared0: brace, built on host0 where its clip starts

        # shared1: box, built on host1 where its clip starts

        # shared2: circle, built on host2 where its clip starts

        # shared3: underline, built on host3 where its clip starts

        # shared4: cross, built on host4 where its clip starts

        # shared0: brace
        shared0_3 = Brace(Line(ORIGIN, 1.561538 * RIGHT), DOWN, buff=0, color="#FF0000")
        shared0_3.set_opacity(0.5)
        shared0_3.scale(0.6).move_to([5, 2.8, 0]).rotate(20 * DEGREES)
        shared0_3.set_z_index(20)

        # shared1: box
        shared1_3 = Rectangle(width=1.7, height=0.725, color="#FF0000", stroke_opacity=0.5)
        shared1_3.scale(0.6).move_to([5, 1.5, 0]).rotate(20 * DEGREES)
        shared1_3.set_z_index(15)

        # shared2: circle
        shared2_3 = Circle(radius=0.894611, stroke_color="#FF0000", stroke_opacity=0.5)
        shared2_3.scale(0.6).move_to([5, 0.2, 0]).rotate(20 * DEGREES)
        shared2_3.set_z_index(10)

        # shared3: underline
        shared3_3 = Line(0.75 * LEFT, 0.75 * RIGHT, color="#FF0000", stroke_opacity=0.5)
        shared3_3.scale(0.6).move_to([5, -1.1, 0]).rotate(20 * DEGREES)
        shared3_3.set_z_index(5)

        # shared4: cross
        shared4_3 = Cross(Rectangle(width=1.5, height=0.525), stroke_color="#FF0000").set_stroke(opacity=0.5)
        shared4_3.scale(0.6).move_to([5, -2.4, 0]).rotate(20 * DEGREES)

        self.add(host0)
        self.add(other0)
        self.add(host1)
        self.add(other1)
        self.add(host2)
        self.add(other2)
        self.add(host3)
        self.add(other3)
        self.add(host4)
        self.add(other4)
        # 0 s – 1 s
        self.wait(1)
        shared0 = Brace(Line(ORIGIN, 1.561538 * RIGHT), DOWN, buff=0, color="#0000FF")
        shared0_target = other0.copy()
        shared0_target.rotate(-30 * DEGREES, about_point=ORIGIN)
        shared0.shift(shared0_target.get_corner(LEFT + DOWN) - shared0.get_corner(LEFT + UP) + 0.1 * DOWN)
        shared0_center = rotate_vector(Group(shared0).get_center(), 30 * DEGREES)
        shared0.rotate(30 * DEGREES, about_point=ORIGIN)
        shared0.set_opacity(0.75)
        shared0.set_z_index(21)
        shared0.rotate(-30 * DEGREES, about_point=shared0_center).scale(1.2, about_point=shared0_center).stretch(-1, 1, about_point=shared0_center).rotate(30 * DEGREES, about_point=shared0_center)
        shared1 = Rectangle(width=1.7, height=0.725, color="#0000FF", stroke_opacity=0.75)
        shared1.move_to(Group(other1))
        shared1.set_z_index(16)
        shared1.scale(1.2).stretch(-1, 1)
        shared2 = Circle(radius=0.894611, stroke_color="#0000FF", stroke_opacity=0.75)
        shared2.move_to(other2)
        shared2.set_z_index(11)
        shared2.scale(1.2).stretch(-1, 1)
        shared3 = Line(0.75 * LEFT, 0.75 * RIGHT, color="#0000FF", stroke_opacity=0.75)
        shared3.next_to(other3, DOWN, buff=0.1)
        shared3.set_z_index(6)
        shared3.scale(1.2).stretch(-1, 1)
        shared4 = Cross(Rectangle(width=1.5, height=0.525), stroke_color="#0000FF").set_stroke(opacity=0.75)
        shared4.move_to(other4)
        shared4.set_z_index(1)
        shared4.scale(1.2).stretch(-1, 1)
        self.add(shared0)
        self.add(shared1)
        self.add(shared2)
        self.add(shared3)
        self.add(shared4)
        # 1 s – 1.5 s
        self.wait(0.5)
        # 1.5 s – 2.5 s: host0 tween, host1 tween, host2 tween, host3 tween, host4 tween
        self.play(
            host0.animate(rate_func=linear).scale(1.5),
            host1.animate(rate_func=linear).scale(1.5),
            host2.animate(rate_func=linear).scale(1.5),
            host3.animate(rate_func=linear).scale(1.5),
            host4.animate(rate_func=linear).scale(1.5),
            run_time=1,
        )
        # 2.5 s – 3 s
        self.wait(0.5)
        shared0_2 = Brace(Line(ORIGIN, 1.561538 * RIGHT), DOWN, buff=0, color="#00FF00")
        shared0_2_target = host0.copy()
        shared0_2_target.rotate(-30 * DEGREES, about_point=ORIGIN)
        shared0_2.shift(shared0_2_target.get_corner(LEFT + DOWN) - shared0_2.get_corner(LEFT + UP) + 0.1 * DOWN)
        shared0_2_center = rotate_vector(Group(shared0_2).get_center(), 30 * DEGREES)
        shared0_2.rotate(30 * DEGREES, about_point=ORIGIN)
        shared0_2.set_opacity(0.3)
        shared0_2.set_z_index(22)
        shared0_2.rotate(-30 * DEGREES, about_point=shared0_2_center).scale(0.8, about_point=shared0_2_center).stretch(-1, 0, about_point=shared0_2_center).rotate(30 * DEGREES, about_point=shared0_2_center)
        shared1_2 = Rectangle(width=1.7, height=0.725, color="#00FF00", stroke_opacity=0.3)
        shared1_2.move_to(Group(host1))
        shared1_2.set_z_index(17)
        shared1_2.scale(0.8).stretch(-1, 0)
        shared2_2 = Circle(radius=0.894611, stroke_color="#00FF00", stroke_opacity=0.3)
        shared2_2.move_to(host2)
        shared2_2.set_z_index(12)
        shared2_2.scale(0.8).stretch(-1, 0)
        shared3_2 = Line(0.75 * LEFT, 0.75 * RIGHT, color="#00FF00", stroke_opacity=0.3)
        shared3_2.next_to(host3, DOWN, buff=0.1)
        shared3_2.set_z_index(7)
        shared3_2.scale(0.8).stretch(-1, 0)
        shared4_2 = Cross(Rectangle(width=1.5, height=0.525), stroke_color="#00FF00").set_stroke(opacity=0.3)
        shared4_2.move_to(host4)
        shared4_2.set_z_index(2)
        shared4_2.scale(0.8).stretch(-1, 0)
        self.add(shared0_2)
        self.add(shared1_2)
        self.add(shared2_2)
        self.add(shared3_2)
        self.add(shared4_2)
        # 3 s – 4 s
        self.wait(1)
        self.add(shared0_3)
        self.add(shared1_3)
        self.add(shared2_3)
        self.add(shared3_3)
        self.add(shared4_3)
        # 4 s – 5 s
        self.wait(1)
