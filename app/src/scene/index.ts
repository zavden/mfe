/* Public API of the scene module. */
export type * from './types';
export { rateFunction, type RateFunction } from './easing';
export { createEvaluator, exportEvaluator, type EvaluatorOptions } from './evaluator';
export { buildEvents } from './events';
export {
  cameraActs,
  cameraAt,
  cameraLegs,
  cameraStateAt,
  mixFrames,
  sameFrame,
  sceneFraming,
  type CameraLeg,
  type CameraState,
  type SceneFraming,
} from './camera';
export { defaultLagRatio, lagWindow } from './lag';
export { glyphColor, placementLinear, placementMatrix, trackDepths } from './placement';
export {
  actionStates,
  endsInEffect,
  fitInEffect,
  endsAtStart,
  keyframeAt,
  patchKeyframe,
  placementAt,
  stateAt,
  tweensOf,
  type ActionStates,
  type KeyframeRef,
} from './state';
export { overridesEndedBy } from './anim/part';
export {
  ANCHOR_VECTORS,
  buffedEnds,
  drawnEnds,
  foundLineEnds,
  glyphEndInput,
  lineCentre,
  withTrim,
  lineEndInput,
  lineEndsAt,
  manimLineEnds,
  pointForFreeEnd,
  type LineEndInput,
  type LineLook,
} from './lines';
export {
  carryLine,
  lineCentreOf,
  lineCurveBefore,
  lineEndsInEffect,
  measuredCurve,
  ownLineGeometry,
  rebuildsLine,
  type LineGeometry,
} from './lineStates';
export {
  criticalPoint,
  manimBoxes,
  nextToPointShift,
  nextToShift,
  roundHalfEven,
  SIDE_VECTORS,
  type ManimBoxes,
} from './measure';
export {
  applyAttachments,
  attachmentIssues,
  attachmentPassLimit,
  attachmentReadiness,
  deriveAttachments,
  fitGap,
  freedEndPoint,
  putAtTipShift,
  readBraceTip,
  settleAttachments,
  settleScene,
  type AttachedPlacement,
  type AttachmentReadiness,
  type BraceTipReading,
  type RefreshRenders,
  type PendingAttachment,
  type SettledScene,
} from './attach';
export { fitShape, type ShapeFit } from './shapes';
export {
  buildMorph,
  morphDrawables,
  padFamily,
  type Morph,
  type MorphGlyph,
  type MorphPiece,
  type MorphSpec,
  type PaintRange,
  type StrokeRange,
} from './anim/morph';
