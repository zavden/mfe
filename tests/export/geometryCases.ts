/* Shared fixtures live inside app/ so Playwright and Vitest load the same ESM models. */
export {
  geometryCases,
  sharedFits,
  earlyAttachments,
  hiddenReturns,
  curvedPivots,
} from "../../app/src/scene/__tests__/geometryProjects";
