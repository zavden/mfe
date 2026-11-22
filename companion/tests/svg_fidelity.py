"""Strict SVG fidelity, allowing only independent font-path declaration permutations.

dvisvgm 3.0 can emit a different order of otherwise byte-identical definitions. The painted
document, references, geometry and every declaration remain exact; no rendered nodes are sorted.

The fidelity tests compared byte for byte before. The project's owner ratified this one tolerance
(decision D82, 2026-11-09): widening it is theirs to decide as well.
"""
import re
import xml.etree.ElementTree as ET


def _path_definitions(body: str) -> dict[str, str] | None:
    try:
        definitions = ET.fromstring('<defs>' + body + '</defs>')
    except ET.ParseError:
        return None
    lines = body.strip('\n').splitlines()
    if len(lines) != len(definitions) or (definitions.text or '').strip():
        return None
    result = {}
    for line, node in zip(lines, definitions):
        if (node.tag != 'path' or set(node.attrib) != {'id', 'd'} or len(node)
                or (node.text or '').strip() or (node.tail or '').strip()):
            return None
        ident = node.attrib['id']
        if not ident or ident in result:
            return None
        result[ident] = line
    return result


def same_svg(left: str, right: str) -> bool:
    if left == right:
        return True
    # CSS or script could make declaration order observable; do not canonicalize those files.
    if any(re.search(r'<(?:[\w.-]+:)?(?:style|script)\b', text, re.I) for text in (left, right)):
        return False
    if left.count('<defs>') != 1 or right.count('<defs>') != 1:
        return False
    a = re.search(r'<defs>(.*?)</defs>', left, re.S)
    b = re.search(r'<defs>(.*?)</defs>', right, re.S)
    if a is None or b is None:
        return False
    if left[:a.start(1)] != right[:b.start(1)] or left[a.end(1):] != right[b.end(1):]:
        return False
    definitions = _path_definitions(a.group(1))
    return definitions is not None and definitions == _path_definitions(b.group(1))
