import type { Issue } from "../types";

export function findAllOccurrences(text: string, searchText: string): number[] {
  const indices: number[] = [];
  const step = Math.max(1, searchText.length);
  let index = 0;
  while ((index = text.indexOf(searchText, index)) !== -1) {
    indices.push(index);
    index += step;
  }
  return indices;
}

export function getExplicitIssueRange(
  text: string,
  issue: Issue
): { start: number; end: number } | null {
  if (!Number.isInteger(issue.start) || !Number.isInteger(issue.end)) {
    return null;
  }
  const start = issue.start as number;
  const end = issue.end as number;
  if (start < 0 || end <= start || end > text.length) {
    return null;
  }
  if (issue.original && text.slice(start, end) !== issue.original) {
    return null;
  }
  return { start, end };
}
