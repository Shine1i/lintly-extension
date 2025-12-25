import type { Issue } from "./types";
import { getIssuePositions } from "./textPositioning";

export interface BulkApplyResult {
  text: string;
  appliedIssues: Issue[];
  skippedIssues: Issue[];
}

export function applyBulkIssues(text: string, issues: Issue[]): BulkApplyResult {
  if (!text || issues.length === 0) {
    return { text, appliedIssues: [], skippedIssues: [] };
  }

  const positions = getIssuePositions(text, issues);
  const sorted = [...positions].sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    if (a.end !== b.end) return a.end - b.end;
    return a.occurrenceIndex - b.occurrenceIndex;
  });

  const appliedIssues: Issue[] = [];
  const skippedIssues: Issue[] = [];
  const valid: typeof sorted = [];
  let lastEnd = -1;

  for (const pos of sorted) {
    if (pos.start < 0 || pos.end < pos.start) {
      skippedIssues.push(pos.issue);
      continue;
    }
    if (pos.issue.original === pos.issue.suggestion) {
      skippedIssues.push(pos.issue);
      continue;
    }
    if (pos.start < lastEnd) {
      skippedIssues.push(pos.issue);
      continue;
    }
    valid.push(pos);
    lastEnd = pos.end;
  }

  let resultText = text;
  for (const pos of [...valid].sort((a, b) => b.start - a.start)) {
    resultText =
      resultText.slice(0, pos.start) +
      pos.issue.suggestion +
      resultText.slice(pos.end);
    appliedIssues.push(pos.issue);
  }

  return { text: resultText, appliedIssues, skippedIssues };
}
