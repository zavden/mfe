"""TeX document construction (pure functions, no LaTeX needed).

The byte-for-byte comparison with what Manim writes is in test_fidelity.py; these tests pin the
documented layout and the normalisation rules.
"""
import unittest

from support import mfe_companion

m = mfe_companion
W0 = r"\special{dvisvgm:raw <g id='unique000'>}"  # opening wrapper MathTex puts around the formula
W1 = r"\special{dvisvgm:raw </g>}"


class CeExpression(unittest.TestCase):
    def test_wraps_in_dvisvgm_group(self):
        self.assertEqual(m.ce_expression("mx+y=0"), W0 + "mx+y=0" + W1)

    def test_strips_whitespace_of_the_joined_string(self):
        self.assertEqual(m.ce_expression("  a + b \n"), W0 + "  a + b \n" + W1)

    def test_empty_becomes_quad_without_wrapper(self):
        self.assertEqual(m.ce_expression(""), r"\quad")

    def test_unbalanced_left_right_become_big(self):
        self.assertEqual(m.ce_expression(r"\left( x"), W0 + r"\big( x" + W1)
        self.assertEqual(m.ce_expression(r"x \right)"), W0 + r"x \big)" + W1)
        # balanced ones are kept
        self.assertEqual(m.ce_expression(r"\left( x \right)"), W0 + r"\left( x \right)" + W1)

    def test_stray_braces_are_balanced(self):
        self.assertEqual(m.ce_expression(r"\frac{a}{b"), W0 + r"\frac{a}{b" + W1 + "}")
        self.assertEqual(m.ce_expression("a}"), "{" + W0 + "a}" + W1)
        # an escaped brace does not count
        self.assertEqual(m.ce_expression(r"\{ a"), W0 + r"\{ a" + W1)

    def test_unmatched_array_environment_is_dropped(self):
        self.assertEqual(m.ce_expression(r"\begin{array}{c} x"), "")
        self.assertEqual(m.ce_expression(r"\begin{array}{c} x \end{array}"),
                         W0 + r"\begin{array}{c} x \end{array}" + W1)

    def test_double_braces_split_into_groups(self):
        self.assertEqual(
            m.ce_expression("{{a}} + {{b}}"),
            r"\special{dvisvgm:raw <g id='unique000'>}a \special{dvisvgm:raw </g>}"
            # pieces are separated by MathTex's arg_separator, a space, hence two spaces after "+"
            r"\special{dvisvgm:raw <g id='unique001'>} +  \special{dvisvgm:raw </g>}"
            r"\special{dvisvgm:raw <g id='unique002'>}b\special{dvisvgm:raw </g>}",
        )

    def test_double_braces_only_after_whitespace_or_start(self):
        for tex in (r"\frac{{n}}{k}", "a^{{2}}"):
            self.assertEqual(m.ce_expression(tex), W0 + tex + W1)

    def test_text_mode_joins_the_pieces_without_a_separator(self):
        # Tex(...) is MathTex(..., arg_separator=""): no space inside the groups.
        self.assertEqual(
            m.ce_expression("{{a}} + {{b}}", ""),
            r"\special{dvisvgm:raw <g id='unique000'>}a\special{dvisvgm:raw </g>}"
            r"\special{dvisvgm:raw <g id='unique001'>} + \special{dvisvgm:raw </g>}"
            r"\special{dvisvgm:raw <g id='unique002'>}b\special{dvisvgm:raw </g>}",
        )

    def test_fillers_never_fire_because_of_the_wrapper(self):
        # In MathTex the joined string ends with the closing \special, so "x_" is left alone
        # (and then fails in LaTeX, exactly as in Manim).
        self.assertEqual(m.ce_expression("x_"), W0 + "x_" + W1)
        self.assertEqual(m.ce_expression(r"\over"), W0 + r"\over" + W1)


class CeDocument(unittest.TestCase):
    def test_layout(self):
        doc = m.build_ce_document("mx+y=0", [], "")
        self.assertEqual(
            doc.text,
            "\n".join(
                [
                    r"\documentclass[preview]{standalone}",
                    r"\usepackage[english]{babel}",
                    r"\usepackage{amsmath}",
                    r"\usepackage{amssymb}",
                    r"\begin{document}",
                    r"\begin{align*}",
                    W0 + "mx+y=0" + W1,
                    r"\end{align*}",
                    r"\end{document}",
                ]
            ),
        )
        self.assertEqual(doc.first_line, 7)

    def test_text_mode_is_tex_inside_center(self):
        doc = m.build_ce_document("Hello $x$", [], "", mode="text")
        self.assertIn("\n".join([r"\begin{document}", r"\begin{center}", W0 + "Hello $x$" + W1, r"\end{center}"]), doc.text)
        self.assertNotIn("align", doc.text)
        self.assertEqual(doc.text[doc.expr_start : doc.expr_end], W0 + "Hello $x$" + W1)
        self.assertEqual(doc.text.split("\n")[doc.first_line - 1], W0 + "Hello $x$" + W1)
        # the default is math mode
        self.assertEqual(m.build_ce_document("x", [], "").text, m.build_ce_document("x", [], "", mode="math").text)

    def test_packages_and_preamble_go_at_the_end_of_the_preamble(self):
        doc = m.build_ce_document("x", ["physics", "bm"], r"\newcommand{\a}{b}")
        lines = doc.text.split("\n")
        self.assertEqual(
            lines[1:8],
            [r"\usepackage[english]{babel}", r"\usepackage{amsmath}", r"\usepackage{amssymb}",
             r"\usepackage{physics}", r"\usepackage{bm}", r"\newcommand{\a}{b}", r"\begin{document}"],
        )
        self.assertEqual(lines[doc.first_line - 1], W0 + "x" + W1)

    def test_expression_span(self):
        doc = m.build_ce_document("a\nb", ["bm"], "")
        self.assertEqual(doc.text[doc.expr_start : doc.expr_end], W0 + "a\nb" + W1)


class GlDocument(unittest.TestCase):
    def test_layout(self):
        doc = m.build_gl_document("mx+y=0", [], "")
        head, rest = doc.text.split(r"\begin{document}")
        self.assertTrue(head.startswith("\\documentclass[preview]{standalone}\n\n\\usepackage[english]{babel}\n"))
        self.assertIn(r"\DisableLigatures{encoding = *, family = * }", head)
        self.assertTrue(head.endswith('\\DeclareMathSymbol{\\minus}{\\mathbin}{AMSa}{"39}\n\n\n'))  # "\n".join([preamble, ""])
        self.assertEqual(rest, "\n\n\\centering\n\\begin{align*}\nmx+y=0\n\\end{align*}\n\n\\end{document}\n")
        self.assertEqual(doc.text.split("\n")[doc.first_line - 1], "mx+y=0")

    def test_text_mode_is_textext_without_an_environment(self):
        doc = m.build_gl_document("Hello $x$", [], "", mode="text")
        rest = doc.text.split(r"\begin{document}")[1]
        self.assertEqual(rest, "\n\n\\centering\nHello $x$\n\n\\end{document}\n")
        self.assertEqual(doc.text[doc.expr_start : doc.expr_end], "Hello $x$")
        self.assertEqual(doc.text.split("\n")[doc.first_line - 1], "Hello $x$")
        # {{ }} groups are labelled as in math mode (TexText inherits Tex's labelling)
        self.assertIn(r"{{{{\color[RGB]{0, 0, 1}a}}}} b", m.build_gl_document("{{a}} b", [], "", mode="text").text)

    def test_packages_and_preamble_follow_the_template_preamble(self):
        doc = m.build_gl_document("x", ["bm", "cancel"], r"\newcommand{\a}{b}")
        self.assertIn('{AMSa}{"39}\n\\usepackage{bm}\n\\usepackage{cancel}\n\\newcommand{\\a}{b}\n\n\\begin{document}', doc.text)

    def test_input_is_stripped_and_empty_becomes_double_backslash(self):
        self.assertEqual(m.build_gl_document("  \n x \n", [], "").lead_newlines, 1)
        doc = m.build_gl_document("   ", [], "")
        self.assertEqual(doc.text[doc.expr_start : doc.expr_end], "\\\\")

    def test_double_braces_get_colour_labels(self):
        self.assertEqual(m.gl_labelled_body(r"\frac{{a}}{b}"), r"\frac{{{{\color[RGB]{0, 0, 1}a}}}}{b}")
        self.assertEqual(
            m.gl_labelled_body("{{a}} + {{b}}"),
            r"{{{{\color[RGB]{0, 0, 1}a}}}} + {{{{\color[RGB]{0, 0, 2}b}}}}",
        )
        # single braces are left alone
        self.assertEqual(m.gl_labelled_body(r"\frac{a}{b}"), r"\frac{a}{b}")
        # nested groups are numbered in the order they close
        self.assertEqual(
            m.gl_labelled_body("{{a {{b}} c}}"),
            r"{{{{\color[RGB]{0, 0, 2}a {{{{\color[RGB]{0, 0, 1}b}}}} c}}}}",
        )

    def test_unbalanced_braces_raise_like_manimgl(self):
        with self.assertRaises(m.TexBuildError) as ctx:
            m.build_gl_document("a}{b", [], "")
        self.assertEqual(str(ctx.exception), "Missing '{' inserted")
        with self.assertRaises(m.TexBuildError) as ctx:
            m.build_gl_document(r"\frac{a", [], "")
        self.assertEqual(str(ctx.exception), "Missing '}' inserted")
        # escaped braces are commands, not groups
        m.build_gl_document(r"\{ a \}", [], "")


class Validation(unittest.TestCase):
    def test_valid_request(self):
        req = m.validate_request({"latex": "x", "packages": ["bm", "a-b_c9"], "preamble": "", "target": "gl"})
        self.assertEqual(req, m.TexRequest("x", ["bm", "a-b_c9"], "", "gl"))

    def test_defaults(self):
        req = m.validate_request({"latex": "x", "target": "ce"})
        self.assertEqual((req.packages, req.preamble, req.mode), ([], "", "math"))

    def test_mode(self):
        self.assertEqual(m.validate_request({"latex": "x", "target": "ce", "mode": "text"}).mode, "text")
        self.assertEqual(m.validate_request({"latex": "x", "target": "ce", "mode": None}).mode, "math")
        with self.assertRaises(m.RequestError) as ctx:
            m.validate_request({"latex": "x", "target": "ce", "mode": "bold"})
        self.assertEqual(ctx.exception.status, 400)

    def test_errors(self):
        for obj, status in [
            ({"latex": "x", "target": "xx"}, 400),
            ({"latex": "x", "target": "ce", "packages": ["a b"]}, 400),
            ({"latex": "x" * 8193, "target": "ce"}, 413),
            ("text", 400),
        ]:
            with self.subTest(obj=str(obj)[:30]), self.assertRaises(m.RequestError) as ctx:
                m.validate_request(obj)
            self.assertEqual(ctx.exception.status, status)

    def test_size_limits_are_inclusive(self):
        m.validate_request({"latex": "x" * 8192, "target": "ce", "preamble": "y" * 8192})


if __name__ == "__main__":
    unittest.main()
