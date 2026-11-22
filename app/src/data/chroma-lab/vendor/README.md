# Locally preserved mathematical dependencies

No dependency is loaded from a CDN at runtime.

| File | Pinned source | License |
| --- | --- | --- |
| `color.js`, `color.js.map` | `colorjs.io@0.5.2`, `dist/color.js` and its source map from the official npm package | MIT, `COLORJS-LICENSE` |
| `machado2009.js` | Colour v0.4.6 `CVD_MATRICES_MACHADO2010` tables, converted from Python arrays to JS without changing coefficients | BSD-3-Clause, `COLOUR-LICENSE` |

`src/appearance.js` adapts equations from Colour v0.4.6's `colour/appearance/ciecam02.py` and `cam16.py`. Its BSD license is retained and its developers are credited. Test references were generated independently with Colour 0.4.7.

Sources:

- [Official Color.js 0.5.2 package](https://registry.npmjs.org/colorjs.io/-/colorjs.io-0.5.2.tgz)
- [Color.js source](https://github.com/color-js/color.js/tree/v0.5.2)
- [Colour v0.4.6 Machado tables](https://github.com/colour-science/colour/blob/v0.4.6/colour/blindness/datasets/machado2010.py)
- [Colour v0.4.6 CIECAM02](https://github.com/colour-science/colour/blob/v0.4.6/colour/appearance/ciecam02.py)
- [Colour v0.4.6 CAM16](https://github.com/colour-science/colour/blob/v0.4.6/colour/appearance/cam16.py)

SHA-256:

```text
995bc908408c42ee5f633aacd13c0672761174a16dd271f208e7a1a7b1ec08c9  color.js
027eae6d7e1a4c25c4a4a41af9470133857b9919ef92b30e5f39eaa9c347c8ed  machado2009.js
feee8a4ec1649b385f3ec9ac73174501cbfc9d5a75171a056d94cb452d3f3ec3  COLORJS-LICENSE
cd9efcd4b6ac5218189d90ffc25f9766f8411e62c5526c452145e1cc8b19baf7  COLOUR-LICENSE
```

`color.js` is preserved without modifications. Integration code selects only the spaces and metrics exposed by this laboratory. See [mathematical conventions](../docs/MATHEMATICS.md) for details and limitations.
