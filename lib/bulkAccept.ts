import type { Issue, IssueType, Severity } from "./types";

export const BULK_MIN_COUNT = 3;
export const BULK_CONFIDENCE_THRESHOLD = 0.9;

const SAFE_TYPES: IssueType[] = ["grammar", "spelling", "punctuation"];
const SAFE_SEVERITIES: Severity[] = ["error", "warning"];

export function isBulkCandidate(issue: Issue): boolean {
  const confidence =
    typeof issue.confidence === "number" && Number.isFinite(issue.confidence)
      ? issue.confidence
      : null;

  if (confidence !== null) {
    return confidence >= BULK_CONFIDENCE_THRESHOLD;
  }

  return SAFE_TYPES.includes(issue.type) && SAFE_SEVERITIES.includes(issue.severity);
}

export function getBulkCandidates(issues: Issue[]): Issue[] {
  return issues.filter(isBulkCandidate);
}
