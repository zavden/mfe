"""Only independent font-path declaration order may differ between converters."""
import unittest

from svg_fidelity import same_svg


A = "<path id='a' d='M0 0L1 1'/>"
B = "<path id='b' d='M2 2L3 3'/>"
DRAW = "<use href='#a' fill='#ff0000'/><use href='#b' x='2'/>"


def svg(definitions, drawn=DRAW):
    return "<svg xmlns='http://www.w3.org/2000/svg'><defs>\n" + "\n".join(definitions) + "\n</defs>" + drawn + "</svg>"


class SvgFidelity(unittest.TestCase):
    def test_identical_bytes(self):
        self.assertTrue(same_svg(svg([A, B]), svg([A, B])))

    def test_only_independent_path_declaration_order_differs(self):
        self.assertTrue(same_svg(svg([A, B]), svg([B, A])))

    def test_geometry_change_is_not_ignored(self):
        self.assertFalse(same_svg(svg([A, B]), svg([B, A.replace('L1 1', 'L9 9')])))

    def test_painted_order_is_not_ignored(self):
        other = "<use href='#b' x='2'/><use href='#a' fill='#ff0000'/>"
        self.assertFalse(same_svg(svg([A, B]), svg([B, A], other)))

    def test_fill_position_and_glyph_membership_are_not_ignored(self):
        for old, new in [("#ff0000", "#00ff00"), ("x='2'", "x='3'"), ("href='#b'", "href='#a'")]:
            with self.subTest(change=new):
                self.assertFalse(same_svg(svg([A, B]), svg([B, A], DRAW.replace(old, new))))

    def test_duplicate_identifiers_are_not_reordered(self):
        duplicate = B.replace("id='b'", "id='a'")
        self.assertFalse(same_svg(svg([A, duplicate]), svg([duplicate, A])))

    def test_other_declarations_and_css_keep_strict_byte_comparison(self):
        for other in ["<style>path:first-child{fill:red}</style>", "<clipPath id='c'/>"]:
            with self.subTest(other=other):
                self.assertFalse(same_svg(svg([A, other]), svg([other, A])))
        self.assertFalse(same_svg(svg([A, B], '<style>path:first-child{fill:red}</style>' + DRAW),
                                  svg([B, A], '<style>path:first-child{fill:red}</style>' + DRAW)))

    def test_definition_attributes_are_not_discarded(self):
        styled = A.replace("/>", " fill='red'/>")
        self.assertFalse(same_svg(svg([styled, B]), svg([B, styled])))


if __name__ == '__main__':
    unittest.main()
