/* Shared semantic colors stay distinct so a wrong creation-role mapping cannot pass by equality. */
import { normalizePalette, type NormalizedManimPaletteV1, type PaletteColors } from '../palette';
import { usePaletteStore } from '../paletteStore';

export function testPaletteSource(colors: Partial<PaletteColors> = {}): NormalizedManimPaletteV1 {
  return normalizePalette({
    format: 'manim-palette',
    version: 1,
    name: 'Portable source name',
    colors: {
      background: '#101827',
      formula: '#F1F5F9',
      variable: '#67D9FF',
      constant: '#F9CF72',
      operator: '#E3EAF5',
      result: '#8BE6BA',
      text: '#DDEEFF',
      muted: '#9EADC2',
      rectangle: '#A9B5FF',
      circle: '#FF9AC6',
      arrow: '#D0A166',
      ...colors,
    },
    // These deliberately differ from MFE's defaults and must stay metadata only.
    style: { fillOpacity: 0.7, strokeWidth: 9, fontScale: 2 },
    mode: 'light',
  }).palette;
}

export function installTestPalette(active = true, source = testPaletteSource()) {
  const entry = { id: 'preference_palette', displayName: 'Class palette', source };
  usePaletteStore.setState((state) => ({
    library: { version: 1, activePaletteId: active ? entry.id : null, palettes: [entry] },
    revision: state.revision + 1,
    unsaved: false,
    warnings: [],
    busy: false,
  }));
  return entry;
}
