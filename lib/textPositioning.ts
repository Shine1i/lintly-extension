export type { SelectionRect, IssueRect } from "./textPositioning/types";
export { setMirrorHost, cleanupMirrorCache, getTextareaSelectionRect } from "./textPositioning/mirror";
export { findAllOccurrences } from "./textPositioning/occurrences";
export { getTextRangeRects } from "./textPositioning/rects";
export {
  sortIssuesByTextPosition,
  getIssuePositions,
  getIssueRects,
  type IssuePosition,
} from "./textPositioning/issues";
export { getSelectionRect, getElementText } from "./textPositioning/selection";
export { applyFixToElement, applyTextRangeToElement } from "./textPositioning/applyFix";
