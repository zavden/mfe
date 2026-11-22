/* Public API of the formula engine. */
export type * from './types';
export {
  CompanionError,
  companionCommand,
  createCompanionClient,
  type ByteSink,
  type CompanionClient,
  type CompanionClientOptions,
} from './companion';
export {
  BACKEND_VERSIONS,
  canRenderLatex,
  createEngine,
  expectedRenderKey,
  isCurrentRender,
  isExactSnapshot,
  NO_LATEX_MESSAGE,
  offlineMessage,
  textCountedByBoxes,
  textDrawing,
  textShapedFor,
  textSignatureFor,
  type Engine,
  type EngineOptions,
  type TextDrawing,
} from './engine';
export { displayLabel, normalizeLabel } from './glyphs';
export { labelGlyphs, mapLabels, type GlyphLabels, type LabelOutcome } from './labelled';
export { companionClient, getEngine } from './instance';
export { glyphLikes, renderKey, toSnapshot } from './key';
export { CE_GL_SIZE_RATIO, GL_H0_FALLBACK, LATEX_BACKEND_VERSION } from './latex';
export { matchGlyphs } from './match';
export { MATHJAX_BACKEND_VERSION, MATHJAX_SCALE, MATHJAX_VERSION } from './mathjax';
export { PACKAGE_SUPPORT } from './packages';
export {
  PRODUCERS,
  producerOf,
  renderRequestFor,
  plainLetters,
  TEXT_ACCENTS_WARNING,
  TEXT_FONTENC_HINT,
  TEXT_WRAP_WARNING,
  withColorPackage,
  type GlyphProducer,
  type RenderableFormula,
  type RenderMeta,
} from './producers';
export {
  emUnits,
  mathJaxTextSource,
  parboxPoints,
  SPACE_EM,
  texSource,
  textRows,
  type TextSpec,
} from './textSource';
export { textWords, wrapRows, wrapWords } from './textWrap';
export { refreshLocalRenders, resolveFormula, resolveFormulaTransition } from './resolve';
export {
  PANGO_BACKEND_VERSION,
  TEXT_CE_GL_SIZE_RATIO,
  canRenderPango,
  isTextBoxes,
  pangoCapability,
  pangoState,
  type PangoState,
  sameTextShape,
  textBasisKey,
  textBasisMatches,
  textBoxesKey,
  textSavedBoxesKey,
  textArtifactRender,
  isVerifiedText,
  textEnvironment,
  type TextEnvironment,
} from './pango';
export {
  fixedTextMeasurer,
  savedBoxesRender,
  TEXT_BOXES_WARNING,
  TEXT_BOX_STYLE,
  textBoxRanges,
  type TextMeasurer,
} from './textBoxes';
export { setTextMeasurer } from './textMeasure';
export { matchTextLayouts, textBoxesLayout, textLayoutOf, type TextLayout } from './textMatch';
