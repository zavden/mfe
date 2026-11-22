/* The check a generated scene makes of each font text right after building it, before any colour
 * or placement: is it the text the editor showed? As many glyphs, and, when the saved shape is
 * this library's, the same outlines. Conversion and quantization are the companion's
 * (`_pango_contours`, `_pango_geometry_signature`): a native test holds the two together. The
 * check is advice: it says what it found on stderr and the scene goes on (D82), whatever happens
 * inside it, and with fewer glyphs than the scene names it adds empty ones, so that naming one
 * cannot stop the scene either. */
export const TEXT_GEOMETRY_HELPER = `def _mfe_text_contours(mob, target):
    contours = []
    for path in mob.get_subpaths():
        if len(path) < 3:
            continue
        contour = [float(path[0][0]), float(path[0][1])]
        if target == 'ce':
            for i in range(0, len(path), 4):
                curve = path[i:i + 4]
                if len(curve) != 4:
                    raise ValueError('Unexpected CE text contour topology.')
                contour.extend(float(v) for point in curve[1:] for v in point[:2])
        else:
            for i in range(0, len(path) - 2, 2):
                a, h, b = path[i:i + 3]
                contour.extend(float(v) for point in ((a + 2 * h) / 3, (2 * h + b) / 3, b)
                               for v in point[:2])
        if len(contour) > 2:
            contours.append(contour)
    return contours


def _mfe_verify_text(mob, name, target, count, expected=None):
    """Says, on stderr, when Manim has not built the text the editor showed, and keeps the
    scene running. \`count\` is the number of its glyphs there, \`expected\` the fingerprint of
    their outlines (none for a text the other library shaped). Other fonts, or other versions
    of Manim, Pango or the libraries under them, draw a text differently. With fewer glyphs
    here, empty ones are added: every glyph the scene names exists."""
    import hashlib
    import json
    import math
    import sys
    built = len(mob.submobjects)
    same = built == count
    if same and expected is not None:
        try:
            contours = [_mfe_text_contours(glyph, target) for glyph in mob.submobjects]
            quantized = [[[math.floor(v * 1000000 + 0.5) for v in path] for path in glyph]
                         for glyph in contours]
            same = expected == hashlib.sha256(
                json.dumps(quantized, separators=(',', ':')).encode()).hexdigest()
        except Exception:
            same = False
    if built < count:
        mob.add(*[VMobject() for _ in range(count - built)])
    if same:
        return
    if built == count:
        glyphs = ('It may look different, and colours or animations of single glyphs may fall '
                  'on other glyphs.')
    else:
        glyphs = (f'It has {built} glyphs here and {count} there, so colours and animations of '
                  'single glyphs fall on other glyphs.')
    try:
        # On a line of its own: ManimGL leaves a progress bar open on stderr.
        print(f'\\nWarning: the text {name!r} is not drawn here as in the editor (other fonts, or '
              f'other versions of Manim or Pango). {glyphs} To match it again, shape the text '
              'again in the editor, on this machine and for this library, and export again.',
              file=sys.stderr)
    except Exception:
        pass
`;
