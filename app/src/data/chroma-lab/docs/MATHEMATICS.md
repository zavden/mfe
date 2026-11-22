# Mathematics, conventions, and validation

The engine runs without a network connection or compilation. All numbers use JavaScript `Number` (double precision). `src/color.js` contains the interface, `src/appearance.js` the appearance models, `src/analysis.js` color differences, and `src/accessibility.js` contrast and CVD. Dependencies and licenses are in `vendor/`.

## Inputs, spaces, and units

Input colors are opaque sRGB, `#RGB` or `#RRGGBB`. The `#` may be omitted; normalization produces six uppercase digits. Names, alpha, `NaN`, and infinities are rejected. No background is assumed for transparency compositing.

| ID | Coordinates | White / convention |
| --- | --- | --- |
| `rgb` | R, G, B: 0–255 | Encoded sRGB, D65 |
| `srgb` | R, G, B: 0–1 | Same encoding, different scale |
| `linear-srgb` | R, G, B: 0–1 | Linear light, D65 |
| `hsl` | h: degrees, S and L: percent | Encoded sRGB cube geometry |
| `hsv` | h: degrees, S and V: percent | Encoded sRGB cube geometry |
| `hsi` | h: degrees, S and I: percent | Circular hue, mean encoded sRGB intensity |
| `lab` | L*: 0–100, a*, b* | CIELAB D50 |
| `lch` | L*: 0–100, C* ≥ 0, h: degrees | Polar Lab D50 |
| `oklab` | L: 0–1, a, b | OKLab D65 |
| `oklch` | L: 0–1, C ≥ 0, h: degrees | Polar OKLab D65 |
| `cam02` | J: 0–100, C ≥ 0, h: degrees | CIECAM02, explicit conditions |
| `cam16` | J: 0–100, C ≥ 0, h: degrees | Li et al. CAM16, explicit conditions |

The controls' a/b and chroma bounds are exploration ranges. They do not define the sRGB gamut boundary, which also depends on lightness and hue. Perceptual spaces can represent coordinates outside this gamut.

Conversions for sRGB, XYZ, Lab, LCH, OKLab, OKLCH, HSL, and HSV come from the pinned copy of [Color.js 0.5.2](https://github.com/color-js/color.js/tree/v0.5.2). Lab uses Bradford D65↔D50 chromatic adaptation. OKLab matrices use the D65 white consistent with sRGB and CSS; small differences from older tables can result from matrix rounding. See [CSS Color 4 conversions](https://www.w3.org/TR/css-color-4/#color-conversion-code) and the [original OKLab definition](https://bottosson.github.io/posts/oklab/).

### sRGB transfer

For an encoded channel `u` between 0 and 1, the linear channel is `u/12.92` when `u ≤ 0.04045`; otherwise it is `((u+0.055)/1.055)^2.4`. The inverse uses the breakpoint `0.0031308`. Helpers extend both functions through odd symmetry to handle out-of-gamut coordinates. A power of 2.2 is not substituted for this function.

### HSI: chosen convention

For encoded R, G, B in 0–1:

```text
I = (R + G + B) / 3
S = 0 if I = 0; otherwise 1 − min(R,G,B) / I
h = atan2(√3 (G − B), 2R − G − B), normalized to [0°,360°)
```

The inverse has three 120° sectors. In the first, with h in radians: `B = I(1−S)`, `R = I[1 + S cos(h)/cos(π/3−h)]`, `G = 3I−R−B`; the other sectors permute channels. This circular HSI hue can differ from hexagonal HSL/HSV hue. I averages encoded channels rather than physical luminance. Some HSI combinations fall outside sRGB and undergo gamut mapping.

Undefined hues in polar spaces are represented by 0 to keep numerical controls finite. Under incomplete adaptation in CIECAM02/CAM16, RGB gray may have nonzero chroma; it is not artificially forced to neutral.

## Conversion and gamut-mapping contract

```js
toSpace('#4F7CFF', 'oklch'); // [L,C,h]
fromSpace([0.7,0.5,30], 'oklch');
// {hex, rgb, rawRgb, outOfGamut}
```

`rawRgb` preserves the unmodified conversion. `rgb` is the mapped result in 0–1; `hex` quantizes it by rounding each channel to 8 bits. `outOfGamut` is calculated on `rawRgb` with numerical tolerance `1e-9`. HEX operations therefore incur 8-bit precision loss; internal calculations use continuous values.

This application's deterministic policy:

1. If channels are already in sRGB, remove only small numerical residues at the endpoints.
2. Otherwise, convert to OKLCH. Return black if L ≤ 0, white if L ≥ 1.
3. For 0 < L < 1, preserve L and h and search for in-gamut chroma with 32 bisections between zero and the original chroma. Channel tolerance: `1e-10`.
4. Clamp the final numerical residue and produce HEX.

This procedure defines this laboratory's result. It does not implement the CSS algorithm with a perceptual JND threshold or preserve original Lab/CAM coordinates when gamut reduction is needed. The panel must show the `outOfGamut` warning to distinguish the requested color from the available one.

## CIECAM02 and CAM16

Both models implement forward and inverse paths between XYZ and JCh; they are not renamed Lab. Equations were adapted from Colour's [CIECAM02](https://github.com/colour-science/colour/blob/v0.4.6/colour/appearance/ciecam02.py) and [CAM16](https://github.com/colour-science/colour/blob/v0.4.6/colour/appearance/cam16.py) implementations under BSD-3-Clause. The inverse uses an algebraic solution without separate sine/cosine divisions, equivalent to [Schlömer's description](https://arxiv.org/abs/1802.06067).

```js
const view = {
  white: [95.04559270516715, 100, 108.90577507598785], // D65, XYZ
  La: 64,                    // adapting-field luminance, cd/m²
  Yb: 20,                    // background Y, on the white's XYZ scale
  surround: 'average',        // 'average', 'dim', 'dark', or {F,c,Nc}
  discountIlluminant: false,  // true forces complete adaptation, D = 1
};
```

Aliases `XYZ_w`, `L_A`, `Y_b`, `N_c`, and `discount_illuminant` are also accepted. `white` and the XYZ stimulus must use the same scale, normally white Y = 100. `toSpace` obtains XYZ D65 from sRGB and multiplies it by 100. Changing `white` describes a change in adapting white for that same XYZ stimulus; it does not apply a second Bradford transform to the stimulus. This lets adaptation effects be studied without hiding an additional transformation.

| Surround | F | c | Nc |
| --- | --- | --- | --- |
| `average` | 1 | 0.69 | 1 |
| `dim` | 0.9 | 0.59 | 0.9 |
| `dark` | 0.8 | 0.525 | 0.8 |

CIECAM02 uses CAT02, adaptation, and the Hunt–Pointer–Estevez transform. CAM16 uses CAT16 with adaptation in its own responses. Both calculate La-dependent nonlinear compression, opponent dimensions, and J/C/h correlates. `appearanceCorrelates()` additionally returns Q (brightness), M (colorfulness), and s (saturation). Inverse APIs accept JCh. Hue quadrature H, hue composition HC, and CAM-UCS coordinates are not implemented here.

La > 0 and 0 < Yb ≤ white Y are required. White and its cone responses must be positive. Calculated D is clamped to [0,1]. Undefined physical responses, J < 0, C < 0, and J = 0 with C > 0 are rejected. Black is defined as J=C=0, h=0; its inverse is XYZ=(0,0,0). An arbitrary JCh may not be physically invertible: this produces `RangeError`, not an invented HEX. Default conditions are an exploration choice, not a measurement of the user's environment or display.

## Color differences

`deltaE76` is Euclidean distance in Lab D50. `deltaE2000` uses CIEDE2000 on that Lab, with kL=kC=kH=1. `deltaEOK` is Euclidean OKLab distance on the native L=0–1 scale; **it is not multiplied by 100**. Do not apply the same numerical threshold to all three metrics.

CIEDE2000 is verified against the 34 supplementary pairs published by [Sharma, Wu, and Dalal (2005)](https://hajim.rochester.edu/ece/sites/gsharma/ciede2000/). A small distance suggests similarity according to the model; it neither defines a universal distinguishability threshold nor certifies palette accessibility.

## WCAG contrast and color vision

Relative luminance is calculated after linearizing sRGB: `Y=0.2126R+0.7152G+0.0722B`. Contrast is `(Yhigher+0.05)/(Ylower+0.05)`. Indicators compare the unrounded ratio: normal text AA ≥ 4.5, AAA ≥ 7; large text AA ≥ 3, AAA ≥ 4.5; nontext components ≥ 3. Large text means at least 18 pt or 14 pt bold. A contrast label alone does not establish whole-page conformance. Source: [WCAG 2.2](https://www.w3.org/TR/WCAG22/#dfn-relative-luminance).

`textColor()` chooses black or white according to the higher calculated contrast. Evaluation considers opaque pairs and does not model antialiasing, transparency, images, or monitor variations.

`simulateCVD()` uses the Machado, Oliveira, and Fernandes (2009) model through [reference matrices preserved by Colour](https://github.com/colour-science/colour/blob/v0.4.6/colour/blindness/datasets/machado2010.py). `vendor/machado2009.js` stores eleven levels per type, 0.0–1.0, at their published six-decimal precision. Intermediate severities interpolate neighboring matrices following [Colour's documented API](https://colour.readthedocs.io/en/latest/generated/colour.matrix_cvd_Machado2009.html).

The sequence is sRGB → linear RGB → matrix → clipping to 0–1 → sRGB. Clipping is part of this display simulation; the editor's OKLCH mapping is not applied here. Zero returns the original and one corresponds to dichromatic simulation. Protanopia, deuteranopia, and tritanopia are supported; anomaly aliases use the same tables with variable severity. Simulation approximates possible confusions with a model: it neither reproduces an individual's experience with certainty nor provides a diagnostic test. Labels, shapes, or patterns should accompany meaning conveyed by color.

## Tests and reproduction

```sh
node --test tests/color.test.js tests/appearance.test.js tests/accessibility.test.js
```

The 18 tests cover 1,092 HEX round trips in twelve spaces, transfer breakpoints, Lab/OKLab references, HSI sectors, gamut, invalid inputs, 34 CIEDE2000 pairs, WCAG contrast, and CVD matrices.

`tests/appearance.test.js` contains 48 frozen vectors produced with **Python Colour 0.4.7**, independently of JavaScript: two models, four viewing conditions, and six stimuli. They include D65/D50 whites, average/dim/dark surrounds, complete adaptation, and low luminances. Tests compare JCh, Q, M, and s, plus inverse XYZ, at absolute tolerance `2e-8`. Initial validation's maximum JCh/XYZ error was `7.4e-11`. Black, hue quadrants, and nonphysical inputs are tested separately.

To regenerate a vector with a local Colour 0.4.7 installation:

```python
import colour
XYZ = [19.01, 20, 21.78]
white = [95.05, 100, 108.88]
cam = colour.XYZ_to_CAM16(XYZ, white, 318.31, 20,
    surround=colour.VIEWING_CONDITIONS_CAM16['Average'],
    discount_illuminant=False)
print(cam.J, cam.C, cam.h, cam.Q, cam.M, cam.s)
print(colour.CAM16_to_XYZ(cam, white, 318.31, 20))
# JCh: 41.731207905126638, 0.103355738709070, 217.067959767393010
# XYZ: 19.01, 20, 21.78
```

For CIECAM02, replace `XYZ_to_CAM16`/`CAM16_to_XYZ` with `XYZ_to_CIECAM02`/`CIECAM02_to_XYZ`, keeping the same conditions. Every concrete reference input appears alongside its result in the test file. Python, NumPy, and Colour were used only to produce and cross-check references; they are neither runtime nor `node --test` dependencies.
