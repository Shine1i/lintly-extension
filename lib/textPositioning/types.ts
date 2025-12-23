import type { Issue } from "../types";

export interface SelectionRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface IssueRect {
  issue: Issue;
  rects: DOMRect[];
}
