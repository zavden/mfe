// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  fractionLiteral,
  framesOf,
  identifier,
  isValidClassName,
  num,
  physicalLines,
  pyComment,
  pyHeadComment,
  pyString,
  quoted,
  safeText,
  sceneClassName,
  secondsLiteral,
  vector,
} from '../python';

describe('secondsLiteral', () => {
  it('always yields exactly the requested frames, for plays (ceil) and CE waits (floor)', () => {
    const failures: string[] = [];
    for (const fps of [12, 15, 24, 25, 30, 50, 60, 120]) {
      for (let frames = 1; frames <= 1500; frames++) {
        for (const rounding of ['ceil', 'floor'] as const) {
          const literal = secondsLiteral(frames, fps, rounding);
          const actualFrames = framesOf(literal, fps, rounding);
          if (actualFrames !== frames) {
            failures.push(
              `${frames} @ ${fps} ${rounding}: ${literal} gives ${actualFrames} frames`,
            );
          }
          // Never below one frame (ManimCE replaces shorter run times) and within 1 µs.
          if (!(Number(literal) * fps >= 1 - 1e-12)) {
            failures.push(`${frames} @ ${fps} ${rounding}: ${literal} is below one frame`);
          }
          if (!(Math.abs(Number(literal) - frames / fps) < 2e-6)) {
            failures.push(`${frames} @ ${fps} ${rounding}: ${literal} exceeds duration tolerance`);
          }
        }
      }
    }
    // Keep every vector and predicate, allocating matcher diagnostics only for failures.
    expect(failures).toEqual([]);
  });

  it('reads like hand-written durations when it can', () => {
    expect(secondsLiteral(60, 60, 'ceil')).toBe('1');
    expect(secondsLiteral(36, 60, 'ceil')).toBe('0.6');
    expect(secondsLiteral(90, 60, 'floor')).toBe('1.5');
    // 23 / 60 = 0.38333…: np.arange(0, 23 / 60, 1 / 60) has 24 elements, so round down.
    expect(secondsLiteral(23, 60, 'ceil')).toBe('0.383333');
    expect(secondsLiteral(23, 60, 'floor')).toBe('0.383334');
  });
});

describe('literals', () => {
  it('formats numbers, vectors and fractions', () => {
    expect(num(1.5)).toBe('1.5');
    expect(num(-0.0000001)).toBe('0');
    expect(num(2)).toBe('2');
    // Beyond 1e21 toFixed writes an exponent, which must not lose its zeros.
    expect(num(1e30)).toBe('1e+30');
    expect(num(-1.5e22)).toBe('-1.5e+22');
    expect(num(1e100)).toBe('1e+100');
    expect(num(2 ** 69)).toBe('590295810358705651712'); // below 1e21: the exact integer
    expect(vector([0, 1])).toBe('UP');
    expect(vector([-0.5, 0])).toBe('0.5 * LEFT');
    expect(vector([0.5, -1])).toBe('np.array([0.5, -1, 0])');
    expect(fractionLiteral(0, 30)).toBe('0');
    expect(fractionLiteral(30, 30)).toBe('1');
    expect(fractionLiteral(15, 30)).toBe('0.5');
    expect(fractionLiteral(10, 30)).toBe('1 / 3');
    expect(fractionLiteral(3, 24)).toBe('0.125');
  });

  it('writes LaTeX as raw strings when possible', () => {
    expect(pyString('\\frac{a}{b}')).toBe('r"\\frac{a}{b}"');
    expect(pyString('a"b')).toBe("r'a\"b'");
    expect(pyString('x\\')).toBe('"x\\\\"');
  });

  it('writes a text of several lines as a raw triple-quoted string, when it can', () => {
    const typed = 'A &= x_1 \\\\\n  &= x_2 \\\\\n  &= x_3';
    expect(pyString(typed)).toBe(`r"""${typed}"""`);
    expect(pyString('a\nb')).toBe('r"""a\nb"""');
    expect(pyString('a"b\nc\\\\')).toBe('r"""a"b\nc\\\\"""'); // quotes inside, even backslashes
    expect(pyString('a\0\nb')).toBe('r"""a\nb"""'); // safeText first
    // What a raw triple-quoted string cannot hold — three quotes, a quote or an odd backslash at
    // the end — and a carriage return keep the escaped form.
    expect(pyString('a"""b\nc')).toBe('"a\\"\\"\\"b\\nc"');
    expect(pyString('a\nb"')).toBe('"a\\nb\\""');
    expect(pyString('a\nb\\')).toBe('"a\\nb\\\\"');
    expect(pyString('a\r\nb')).toBe('"a\\r\\nb"');
  });

  it('tells the continuation lines of a triple-quoted string apart', () => {
    const lines = (code: string) => physicalLines(code).map((l) => [l.text, l.inString]);
    const code = 'f = MathTex(r"""a \\\\\n  b \\\\\n  c""")\nself.play(\n    Write(f),\n)';
    expect(lines(code)).toEqual([
      ['f = MathTex(r"""a \\\\', false],
      ['  b \\\\', true],
      ['  c""")', true],
      ['self.play(', false],
      ['    Write(f),', false],
      [')', false],
    ]);
    // Quotes in comments and in other literals open nothing.
    expect(lines('# f: a"""b\nx = r\'a"""b\'\ny = "a\\"b"\nz')).toEqual([
      ['# f: a"""b', false],
      ['x = r\'a"""b\'', false],
      ['y = "a\\"b"', false],
      ['z', false],
    ]);
    expect(lines('')).toEqual([['', false]]);
  });

  it('keeps a name or free text inside its comment line or literal', () => {
    expect(pyComment('Audit\nX = 1\n#')).toBe('# Audit X = 1 #');
    expect(pyComment('a\r\nb\rc')).toBe('# a b c');
    expect(safeText('a\0b\x07c\td')).toBe('abc\td');
    expect(pyString('a\0b')).toBe('r"ab"');
    expect(pyString('\\frac{a}{b}\0')).toBe('r"\\frac{a}{b}"');
    expect(quoted('#ff0000\0')).toBe('"#ff0000"');
  });

  // PEP 263: what Python looks for in the first two lines of a file. A match declares the
  // encoding the file is read with: «Huffman coding: an example» names the encoding `an`.
  it('writes no declaration of an encoding into the comment that opens a file', () => {
    const declaresEncoding = /^[ \t\f]*#.*?coding[:=][ \t]*([-\w.]+)/;
    for (const name of [
      'Huffman coding: an example',
      'Decoding=ascii',
      'Source coding:entropy',
      'coding: coding= coding:utf-8',
    ]) {
      expect(pyComment(name)).toMatch(declaresEncoding);
      expect(pyHeadComment(name)).not.toMatch(declaresEncoding);
    }
    expect(pyHeadComment('Huffman coding: an example')).toBe('# Huffman coding : an example');
    expect(pyHeadComment('a\ncoding=x')).toBe('# a coding =x');
    // Words that declare nothing stay as they are.
    expect(pyHeadComment('Coding theory: encodings, codings')).toBe(
      '# Coding theory: encodings, codings',
    );
  });

  it('makes Python names', () => {
    expect(identifier('a1')).toBe('a1');
    expect(identifier('my formula')).toBe('my_formula');
    expect(identifier('2x')).toBe('f_2x');
    expect(identifier('class')).toBe('class_');
    expect(identifier('VGroup')).toBe('VGroup_');
    expect(identifier('é!')).toBe('e');
    expect(sceneClassName('Hello: one-to-one')).toBe('HelloOneToOne');
    expect(sceneClassName('3 bodies')).toBe('Scene3Bodies');
    expect(sceneClassName('')).toBe('FormulaScene');
    expect(isValidClassName('HelloOneToOne')).toBe(true);
    expect(isValidClassName('Hello World')).toBe(false);
    expect(isValidClassName('9Lives')).toBe(false);
    expect(isValidClassName('Scene')).toBe(false);
  });
});
