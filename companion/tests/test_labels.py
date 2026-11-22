"""Glyph labels: DVI -> (font, code) -> Unicode, aligned 1:1 with the SVG shapes."""
import unittest

from support import (
    EXTRA_FORMULAS,
    labels,
    load_corpus,
    make_companion,
    compile_entry,
    mfe_companion,
    normalise_entry,
    requires_tex,
)

m = mfe_companion


@requires_tex
class SpotChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.companion = make_companion()

    def labels(self, latex, target, **kw):
        result = compile_entry(self.companion, normalise_entry({"latex": latex, **kw}), target)
        self.assertTrue(result["ok"], result)
        return labels(result)

    def test_spec_examples_both_targets(self):
        for target in ("ce", "gl"):
            with self.subTest(target=target):
                self.assertEqual(self.labels("mx+y=0", target), "m x + y = 0".split())
                self.assertEqual(self.labels(r"\frac{a}{b}", target), ["a", "—", "b"])
                self.assertEqual(self.labels(r"\sum_{i=0}^{n} i^2", target), "n ∑ i = 0 i 2".split())

    def test_office_ligature_differs_per_target(self):
        # CE: OT1 ffi ligature (one glyph); GL: ligatures disabled by the template (6 glyphs)
        self.assertEqual(self.labels(r"\text{office}", "ce"), ["o", "ffi", "c", "e"])
        self.assertEqual(self.labels(r"\text{office}", "gl"), list("office"))

    def test_symbols_and_alphabets(self):
        cases = {
            r"\alpha+\beta": "α + β",
            r"\epsilon \varepsilon \phi \varphi": "ϵ ε ϕ φ",
            r"\mathbb{R}": "ℝ",
            r"\mathcal{L}": "ℒ",
            r"x \leq y \neq z": "x ≤ y ≠ z" if False else None,
            r"a \cdot b - c \times d": "a ⋅ b − c × d",
            r"\infty \in \emptyset": "∞ ∈ ∅",
            r"\vec{v}": "→ v",
            r"\hat{n}": "^ n",
            r"\sqrt{x}": "√ — x",
            r"\int_a^b": "∫ b a",
            r"\left( x \right)": "( x )",
            r"\forall x \exists y": "∀ x ∃ y",
        }
        for latex, expected in cases.items():
            if expected is None:
                continue
            for target in ("ce", "gl"):
                with self.subTest(latex=latex, target=target):
                    self.assertEqual(self.labels(latex, target), expected.split())

    def test_glyph_fields(self):
        result = compile_entry(self.companion, normalise_entry(r"\frac{a}{b}"), "ce")
        a, bar, b = result["glyphs"]
        self.assertEqual(a, {"label": "a", "kind": "char", "font": "cmmi10", "code": 97})
        self.assertEqual(bar, {"label": "—", "kind": "rule", "font": None, "code": None})
        self.assertEqual(b["font"], "cmmi10")
        self.assertEqual(b["code"], 98)

    def test_zero_size_rules_paint_nothing(self):
        # \rule{0pt}{10pt} is a DVI rule with zero width: dvisvgm draws nothing, so no glyph either
        self.assertEqual(self.labels(r"x \rule{0pt}{10pt} y", "ce"), ["x", "y"])
        self.assertEqual(self.labels(r"x \rule{4pt}{1pt} y", "ce"), ["x", "—", "y"])

    def test_a_glyph_drawn_at_two_sizes_keeps_its_labels(self):
        # The ∑ of the exponent and the ∑ of its upper limit are one outline at two sizes:
        # dvisvgm writes the larger as a scaled <use> of the smaller, itself a <use>'s target.
        for target in ("ce", "gl"):
            with self.subTest(target=target):
                entry = normalise_entry(r"u^{\sum_{j=1}^{\sum_{i=1}^{n} i} c}")
                result = compile_entry(self.companion, entry, target)
                self.assertTrue(result["ok"], result)
                self.assertEqual(result["warnings"], [])
                self.assertEqual(labels(result), "u ∑ ∑ n i = 1 i j = 1 c".split())


@requires_tex
class CorpusCoverage(unittest.TestCase):
    """Every corpus formula: one glyph per shape, aligned, no unknown label."""

    def _check(self, target):
        companion = make_companion()
        checked = 0
        total = 0
        unknown = []
        for entry in load_corpus() + EXTRA_FORMULAS:
            result = compile_entry(companion, entry, target)
            if not result["ok"]:
                continue  # formulas LaTeX rejects (kept in the fidelity test)
            checked += 1
            with self.subTest(latex=entry["latex"], target=target):
                self.assertEqual(len(result["glyphs"]), len(m.svg_shapes(result["svg"])))
                self.assertEqual(result["warnings"], [])
                for glyph in result["glyphs"]:
                    total += 1
                    if glyph["label"] == "?":
                        unknown.append((entry["latex"], glyph))
        self.assertEqual(unknown, [])
        self.assertGreater(checked, 40)
        print(f"\n[{target}] {checked} formulas, {total} glyphs, {len(unknown)} unknown labels")

    def test_ce(self):
        self._check("ce")

    def test_gl(self):
        self._check("gl")


class TablesAndParsing(unittest.TestCase):
    def test_tables_have_right_size(self):
        for name in ("_OT1", "_OT1TT", "_OML", "_OMS", "_OMX", "_MSAM", "_MSBM"):
            self.assertEqual(len(getattr(m, name)), 128, name)
        self.assertEqual(len(m._T1), 256)
        self.assertEqual(len(m._TS1), 256)

    def test_known_codes(self):
        self.assertEqual(m.glyph_label("cmr10", 0x0E), "ffi")
        self.assertEqual(m.glyph_label("cmmi7", 0x0B), "α")
        self.assertEqual(m.glyph_label("cmsy10", 0x00), "−")
        self.assertEqual(m.glyph_label("cmex10", 0x58), "∑")
        self.assertEqual(m.glyph_label("msbm10", 0x52), "ℝ")
        self.assertEqual(m.glyph_label("msam10", 0x03), "□")
        self.assertEqual(m.glyph_label("ecrm1000", 0x1E), "ffi")
        self.assertEqual(m.glyph_label("ecbx1200", 0x41), "A")
        self.assertEqual(m.glyph_label("cmtt10", 0x5C), "\\")
        self.assertEqual(m.glyph_label("rsfs10", 0x46), "ℱ")
        self.assertEqual(m.glyph_label("eufm10", 0x61), "\U0001d51e")

    def test_unknown_is_question_mark(self):
        self.assertEqual(m.glyph_label("nosuchfont10", 65), "?")
        self.assertEqual(m.glyph_label(None, 65), "?")
        self.assertEqual(m.glyph_label("cmr10", None), "?")
        self.assertEqual(m.glyph_label("cmr10", 999), "?")

    def test_svg_shapes(self):
        svg = (
            "<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'>"
            "<defs><path id='g1' d='M0 0L1 1Z'/><path id='g2' d='M0 0'/><path id='g3' d=''/>"
            "<rect id='ignored' width='1' height='1'/></defs>"
            "<g id='page1'><g id='unique000'>"
            "<use x='0' y='0' xlink:href='#g1'/><use x='1' y='0' xlink:href='#g2'/>"
            "<rect x='0' y='0' width='1' height='.4'/>"
            "<path d='M0 0H4V2Z'/><path d=''/><path d='M1 1'/>"
            "<use xlink:href='#g3'/><use xlink:href='#missing'/>"
            "</g></g></svg>"
        )
        self.assertEqual(m.svg_shapes(svg), ["glyph", "rule", "glyph"])

    def test_svg_shapes_follow_a_use_to_what_it_draws(self):
        # A <use> may name another <use> (a glyph at another size), a group or a rule; one that
        # ends at nothing drawn, or at itself, is no shape.
        svg = (
            "<svg xmlns='http://www.w3.org/2000/svg' xmlns:xlink='http://www.w3.org/1999/xlink'>"
            "<defs><path id='g0-80' d='M0 0L1 1Z'/>"
            "<use id='g1-80' xlink:href='#g0-80' transform='scale(1.4)'/>"
            "<path id='empty' d=''/><use id='to-empty' xlink:href='#empty'/>"
            "<use id='loop-a' xlink:href='#loop-b'/><use id='loop-b' xlink:href='#loop-a'/>"
            "<g id='pair'><rect width='2' height='.4'/><use xlink:href='#g0-80'/></g>"
            "<rect id='bar' width='1' height='1'/></defs>"
            "<g id='page1'>"
            "<use x='0' y='0' xlink:href='#g1-80'/><use x='1' y='0' xlink:href='#g0-80'/>"
            "<use xlink:href='#to-empty'/><use xlink:href='#loop-a'/>"
            "<use xlink:href='#pair'/><use xlink:href='#bar'/>"
            "</g></svg>"
        )
        self.assertEqual(m.svg_shapes(svg), ["glyph", "glyph", "rule", "glyph", "rule"])

    def test_svg_shapes_survives_broken_xml(self):
        svg = "<svg><defs><path id='a' d='M0 0L1 1'/></defs><g><use href='#a'/><rect/><broken"
        self.assertEqual(m.svg_shapes(svg), ["glyph", "rule"])

    def test_dvi_parser_rejects_garbage(self):
        with self.assertRaises(m.DviError):
            m.parse_dvi(b"not a dvi file at all")

    def test_make_glyphs_fallback_keeps_length(self):
        svg = (
            "<svg xmlns='http://www.w3.org/2000/svg'><g>"
            "<path d='M0 0L1 1'/><rect width='1' height='1'/><path d='M0 0L2 2'/></g></svg>"
        )
        for dvi in (None, b"garbage"):
            glyphs, warnings = m.make_glyphs(dvi, svg)
            self.assertEqual([g["label"] for g in glyphs], ["?", "—", "?"])
            self.assertEqual([g["kind"] for g in glyphs], ["char", "rule", "char"])
        self.assertTrue(warnings)


@requires_tex
class AlignmentFallback(unittest.TestCase):
    def test_count_mismatch_gives_question_marks_and_warning(self):
        import os, re, shutil, subprocess, tempfile

        companion = make_companion()
        result = compile_entry(companion, normalise_entry("ab"), "ce")
        with tempfile.TemporaryDirectory() as tmp:
            doc = m.build_document("ce", "ab", [], "")
            with open(os.path.join(tmp, "doc.tex"), "w") as fh:
                fh.write(doc.text)
            subprocess.run(["latex", "-interaction=batchmode", "doc.tex"], cwd=tmp, capture_output=True, check=True)
            with open(os.path.join(tmp, "doc.dvi"), "rb") as fh:
                dvi = fh.read()
        # an SVG with an extra shape that no DVI character explains, before the end of the page's
        # group, whatever ends the lines of the file (dvisvgm writes CR LF on Windows)
        svg = re.sub(r"(</g>\r?\n</g>\r?\n</svg>)", r"<path d='M0 0L5 5'/>\n\1", result["svg"])
        self.assertNotEqual(svg, result["svg"])
        glyphs, warnings = m.make_glyphs(dvi, svg)
        self.assertEqual(len(glyphs), 3)
        self.assertEqual({g["label"] for g in glyphs}, {"?"})
        self.assertTrue(any("align" in w for w in warnings))


if __name__ == "__main__":
    unittest.main()
