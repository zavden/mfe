"""Reference dump for the fidelity tests: what ManimGL itself produces for each formula.

Run with the ManimGL virtualenv's interpreter (never imported by the companion):

    <gl-venv>/bin/python gl_reference.py <requests.json> <out.json>

For every request the script builds ``Tex(latex, additional_preamble=...)`` like user code
would (``TexText`` for a request with ``"mode": "text"``) and records the full TeX document and the SVG that ``full_tex_to_svg`` (the function
behind ``latex_to_svg``) produced for it. ``full_tex_to_svg`` is wrapped only to observe its
arguments and result, and its on-disk cache is bypassed so every formula really compiles.
Everything runs in a throw-away directory with a private cache directory.
"""
import json
import os
import shutil
import sys
import tempfile
import traceback


def main(requests_path, out_path):
    with open(requests_path, encoding="utf-8") as fh:
        requests = json.load(fh)
    out_path = os.path.abspath(out_path)
    with tempfile.TemporaryDirectory(prefix="mfe-gl-ref-") as workdir:
        started_in = os.getcwd()
        try:
            run(requests, out_path, workdir)
        finally:
            # `run` works inside the folder, and Windows does not remove a folder that is
            # the current one of a process: this one would stay, and the script fail.
            os.chdir(started_in)


def run(requests, out_path, workdir):
    os.chdir(workdir)
    os.environ["XDG_CACHE_HOME"] = os.path.join(workdir, "cache")  # manimlib's diskcache location

    from importlib.metadata import version

    import manimlib.utils.tex_file_writing as tfw
    from manimlib import Tex, TexText

    calls = []
    uncached = tfw.full_tex_to_svg.__wrapped__

    def recording(full_tex, compiler="latex", message=""):
        svg = uncached(full_tex, compiler, "")
        calls.append((full_tex, svg))
        return svg

    tfw.full_tex_to_svg = recording

    results = []
    for req in requests:
        calls.clear()
        shutil.rmtree("latex_cache", ignore_errors=True)  # GL reuses a stale working.dvi after an error
        tfw.latex_to_svg.cache_clear()
        entry = {"latex": req["latex"]}
        try:
            additional = "\n".join(
                [*(r"\usepackage{%s}" % p for p in req.get("packages", [])),
                 *([req["preamble"]] if req.get("preamble") else [])]
            )
            cls = TexText if req.get("mode") == "text" else Tex
            mob = cls(req["latex"], additional_preamble=additional)
            full_tex, svg = calls[0]
            entry["tex"] = full_tex
            entry["svg"] = svg
            # every mobject with points is one SVG shape (glyph or rule)
            entry["n_shapes"] = sum(1 for m in mob.get_family() if m.has_points())
        except Exception as exc:  # noqa: BLE001 - reported to the test, not hidden
            entry["error"] = f"{type(exc).__name__}: {exc}"
            entry["trace"] = traceback.format_exc()[-1500:]
        results.append(entry)

    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump({"manimgl": version("manimgl"), "results": results}, fh)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
