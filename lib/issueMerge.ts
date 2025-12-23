import type { Issue } from "./types";
import type { SentenceRange } from "./sentences";
import { getIssuePositions } from "./textPositioning";

const LARGE_INDEX = Number.MAX_SAFE_INTEGER;

export function mergeIssuesForSentence(
  fullText: string,
  sentenceRange: SentenceRange,
  existingIssues: Issue[],
  sentenceIssues: Issue[]
): Issue[] {
  const existingPositions = getIssuePositions(fullText, existingIssues);
  const kept: Array<{ issue: Issue; start: number; order: number }> = [];

  for (let i = 0; i < existingPositions.length; i++) {
    const pos = existingPositions[i];
    const inSentence =
      pos.start >= sentenceRange.coreStart && pos.start < sentenceRange.coreEnd;
    if (!inSentence) {
      kept.push({
        issue: pos.issue,
        start: pos.start >= 0 ? pos.start : LARGE_INDEX,
        order: i,
      });
    }
  }

  const sentenceText = fullText.slice(sentenceRange.coreStart, sentenceRange.coreEnd);
  const sentencePositions = getIssuePositions(sentenceText, sentenceIssues);
  const incoming = sentencePositions.map((pos, index) => ({
    issue: pos.issue,
    start: pos.start >= 0 ? sentenceRange.coreStart + pos.start : LARGE_INDEX,
    order: existingPositions.length + index,
  }));

  const combined = kept.concat(incoming);
  combined.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return a.order - b.order;
  });

  return combined.map((entry) => entry.issue);
}
