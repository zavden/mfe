"""Fidelity: the companion must produce what ManimCE / ManimGL themselves produce.

For every corpus formula (plus EXTRA_FORMULAS) the companion's TeX document and SVG are compared
with what Manim computes for ``MathTex(latex)`` (CE) / ``Tex(latex)`` (GL) — ``Tex`` / ``TexText`` for
the text-mode entries —, run in the Manim virtualenvs through ``ce_reference.py`` / ``gl_reference.py``.
Documents and SVG rendering content must match exactly; only independent font-path definition
order may differ. Raw byte equality is also reported separately. Skipped when a virtualenv
(or LaTeX) is not available.
"""
import unittest
from svg_fidelity import same_svg

from support import (
    EXTRA_FORMULAS,
    HAVE_TEX,
    load_corpus,
    make_companion,
    compile_entry,
    mfe_companion,
    request_dict,
    run_reference,
    venv_python,
)


def _entries():
    return load_corpus() + EXTRA_FORMULAS


class _Fidelity:
    target = ""

    @classmethod
    def setUpClass(cls):
        cls.entries = _entries()
        cls.reference = run_reference(cls.target, [dict(e) for e in cls.entries])
        cls.companion = make_companion()

    def test_documents_and_svg_identical(self):
        identical = 0
        equivalent = 0
        compared = 0
        for entry, ref in zip(self.entries, self.reference["results"]):
            with self.subTest(latex=entry["latex"], packages=entry["packages"]):
                self.assertEqual(entry["latex"], ref["latex"])
                result = compile_entry(self.companion, entry, self.target)
                if "error" in ref:
                    # Manim itself fails on this input: the companion must report a failure too
                    self.assertFalse(result["ok"], f"Manim failed ({ref['error'][:80]}) but the companion succeeded")
                    continue
                self.assertTrue(result["ok"], result)
                compared += 1
                req = mfe_companion.validate_request(request_dict(entry, self.target))
                doc = mfe_companion.build_document(self.target, req.latex, req.packages, req.preamble, req.mode)
                self.assertEqual(doc.text, ref["tex"], "TeX documents differ")
                # byte for byte, but for the order of the definitions in <defs> (svg_fidelity.py, D82)
                self.assertTrue(same_svg(result["svg"], ref["svg"]), "SVG rendering content differs")
                equivalent += 1
                identical += result["svg"] == ref["svg"]
        print(f"\n[{self.target}] {identical}/{compared} formulas byte-identical SVG to Manim "
              f"({self.reference.get('manim') or self.reference.get('manimgl')})")
        print(f"[{self.target}] {equivalent}/{compared} exact rendering content "
              "(only independent path-definition order may differ)")
        self.assertEqual(equivalent, compared)

    def test_glyph_count_equals_manim_shape_count(self):
        for entry, ref in zip(self.entries, self.reference["results"]):
            if "error" in ref:
                continue
            with self.subTest(latex=entry["latex"]):
                result = compile_entry(self.companion, entry, self.target)
                self.assertEqual(len(result["glyphs"]), ref["n_shapes"])


@unittest.skipUnless(HAVE_TEX, "latex and dvisvgm are required")
@unittest.skipUnless(venv_python("ce"), "ManimCE virtualenv not found (set MFE_CE_PYTHON)")
class FidelityCE(_Fidelity, unittest.TestCase):
    target = "ce"


@unittest.skipUnless(HAVE_TEX, "latex and dvisvgm are required")
@unittest.skipUnless(venv_python("gl"), "ManimGL virtualenv not found (set MFE_GL_PYTHON)")
class FidelityGL(_Fidelity, unittest.TestCase):
    target = "gl"


if __name__ == "__main__":
    unittest.main()
