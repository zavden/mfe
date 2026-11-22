"""SVG comes from the converter's fresh output artifact, never its diagnostic stdout."""
from pathlib import Path
import unittest
from unittest import mock

from support import make_companion, mfe_companion as m


SVG = b"<?xml version='1.0'?><svg xmlns='http://www.w3.org/2000/svg'><use href='#a'/></svg>"
DIAGNOSTIC = b"The old PDF interpreter has been removed.\n"


class SvgOutputArtifact(unittest.TestCase):
    def setUp(self):
        self.companion = make_companion(sandbox=False)
        self.companion._versions = ("latex test", "dvisvgm 3.0.3")
        self.request = m.validate_request({"latex": "x", "target": "ce"})
        self.document = m.build_document("ce", "x", [], "")

    def run_conversion(self, artifact=SVG, *, stdout=DIAGNOSTIC + SVG, stale=None,
                       returncode=0, smoke=False):
        def run(cmd, cwd, **_kwargs):
            directory = Path(cwd)
            if "latex" in cmd:
                (directory / "doc.dvi").write_bytes(b"dvi")
                if stale is not None:
                    (directory / "doc.svg").write_bytes(stale)
                return m._RunResult(0, b"", b"")
            if artifact is not None:
                (directory / "doc.svg").write_bytes(artifact)
            return m._RunResult(returncode, stdout, b"conversion diagnostic")

        with mock.patch.object(self.companion, "_tool", side_effect=lambda name: name), \
                mock.patch.object(m.shutil, "which", side_effect=lambda name: name), \
                mock.patch.object(m, "_run", side_effect=run), \
                mock.patch.object(m, "make_glyphs", return_value=([], [])):
            if smoke:
                return m._Sandbox._smoke_test([])
            return self.companion._compile_uncached(self.document, self.request)

    def test_stdout_diagnostics_are_not_part_of_the_returned_svg(self):
        result = self.run_conversion()
        self.assertTrue(result["ok"], result)
        self.assertEqual(result["svg"], SVG.decode())

    def test_success_without_an_output_file_is_an_error_even_with_svg_on_stdout(self):
        result = self.run_conversion(artifact=None, stdout=SVG)
        self.assertFalse(result["ok"], result)

    def test_the_latex_step_cannot_supply_a_stale_svg(self):
        result = self.run_conversion(artifact=None, stdout=SVG, stale=SVG)
        self.assertFalse(result["ok"], result)

    def test_nonzero_converter_status_rejects_an_existing_artifact(self):
        result = self.run_conversion(returncode=1)
        self.assertFalse(result["ok"], result)
        self.assertIn("conversion diagnostic", result["error"]["message"])

    def test_output_limit_counts_bytes_and_rejects_oversize_artifacts(self):
        artifact = SVG.replace(b"<use", "<!--éééé-->".encode() + b"<use")
        with mock.patch.object(m, "MAX_SVG_BYTES", len(artifact) - 1):
            result = self.run_conversion(artifact=artifact, stdout=SVG)
        self.assertFalse(result["ok"], result)
        self.assertIn("too large", result["error"]["message"])

    def test_invalid_artifact_xml_is_reported(self):
        result = self.run_conversion(artifact=b"<svg><broken></svg>", stdout=SVG)
        self.assertFalse(result["ok"], result)

    def test_smoke_compile_uses_the_fresh_artifact_too(self):
        self.assertTrue(self.run_conversion(stdout=DIAGNOSTIC, smoke=True))
        self.assertFalse(self.run_conversion(artifact=None, stdout=SVG, smoke=True))
        self.assertFalse(self.run_conversion(artifact=None, stdout=SVG, stale=SVG, smoke=True))

    def test_old_stdout_cache_namespace_is_not_reused(self):
        current = self.companion._cache_key("ce", self.document)
        with mock.patch.object(m, "CACHE_SCHEMA", 1):
            old = self.companion._cache_key("ce", self.document)
        self.assertNotEqual(current, old)


if __name__ == "__main__":
    unittest.main()
