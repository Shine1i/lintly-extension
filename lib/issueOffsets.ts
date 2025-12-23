import { DiffMatchPatch, DiffOp, type Diff } from "diff-match-patch-ts";
import type { Issue } from "./types";
import { findAllOccurrences } from "./textPositioning/occurrences";

interface RangeMatch {
  start: number;
  end: number;
}

function stripOffsets(issue: Issue): Issue {
  const { start: _start, end: _end, ...rest } = issue;
  return rest;
}

function invertDiffs(diffs: Diff[]): Diff[] {
  return diffs.map(([op, text]) => {
    if (op === DiffOp.Insert) return [DiffOp.Delete, text];
    if (op === DiffOp.Delete) return [DiffOp.Insert, text];
    return [DiffOp.Equal, text];
  });
}

function getOccurrences(
  cache: Map<string, number[]>,
  text: string,
  search: string
): number[] {
  const cached = cache.get(search);
  if (cached) return cached;
  const occurrences = search ? findAllOccurrences(text, search) : [];
  cache.set(search, occurrences);
  return occurrences;
}

function mapIndexFromDiffs(diffs: Diff[], loc: number): number {
  let chars1 = 0;
  let chars2 = 0;
  let lastChars1 = 0;
  let lastChars2 = 0;
  let x = 0;

  for (; x < diffs.length; x++) {
    const [op, text] = diffs[x];
    if (op !== DiffOp.Insert) {
      chars1 += text.length;
    }
    if (op !== DiffOp.Delete) {
      chars2 += text.length;
    }
    if (chars1 > loc) {
      break;
    }
    lastChars1 = chars1;
    lastChars2 = chars2;
  }

  if (diffs.length !== x && diffs[x][0] === DiffOp.Delete) {
    return lastChars2;
  }

  return lastChars2 + (loc - lastChars1);
}

function matchFromOriginal(
  diffs: Diff[],
  originalText: string,
  correctedText: string,
  issue: Issue,
  usedRanges: Set<string>,
  occurrenceCache: Map<string, number[]>
): RangeMatch | null {
  if (!issue.original) return null;
  const occurrences = getOccurrences(occurrenceCache, originalText, issue.original);
  for (const start of occurrences) {
    const end = start + issue.original.length;
    const correctedStart = mapIndexFromDiffs(diffs, start);
    const correctedEnd = mapIndexFromDiffs(diffs, end);
    if (correctedEnd < correctedStart) continue;
    if (correctedText.slice(correctedStart, correctedEnd) !== issue.suggestion) {
      continue;
    }
    const key = `${start}:${end}`;
    if (usedRanges.has(key)) continue;
    return { start, end };
  }
  return null;
}

function matchFromCorrected(
  reverseDiffs: Diff[],
  originalText: string,
  correctedText: string,
  issue: Issue,
  usedRanges: Set<string>,
  occurrenceCache: Map<string, number[]>
): RangeMatch | null {
  if (!issue.suggestion || !issue.original) return null;
  const occurrences = getOccurrences(occurrenceCache, correctedText, issue.suggestion);
  for (const correctedStart of occurrences) {
    const correctedEnd = correctedStart + issue.suggestion.length;
    const start = mapIndexFromDiffs(reverseDiffs, correctedStart);
    const end = mapIndexFromDiffs(reverseDiffs, correctedEnd);
    if (end < start) continue;
    if (originalText.slice(start, end) !== issue.original) continue;
    const key = `${start}:${end}`;
    if (usedRanges.has(key)) continue;
    return { start, end };
  }
  return null;
}

export function assignIssueOffsetsFromCorrection(
  originalText: string,
  correctedText: string,
  issues: Issue[]
): Issue[] {
  if (!issues || issues.length === 0) {
    return [];
  }

  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(originalText, correctedText, false);
  const reverseDiffs = invertDiffs(diffs);
  const usedRanges = new Set<string>();
  const originalOccurrences = new Map<string, number[]>();
  const correctedOccurrences = new Map<string, number[]>();

  return issues.map((issue) => {
    const baseIssue = stripOffsets(issue);
    if (!issue.original) {
      return baseIssue;
    }

    const directMatch = matchFromOriginal(
      diffs,
      originalText,
      correctedText,
      issue,
      usedRanges,
      originalOccurrences
    );
    if (directMatch) {
      usedRanges.add(`${directMatch.start}:${directMatch.end}`);
      return {
        ...baseIssue,
        start: directMatch.start,
        end: directMatch.end,
      };
    }

    const reverseMatch = matchFromCorrected(
      reverseDiffs,
      originalText,
      correctedText,
      issue,
      usedRanges,
      correctedOccurrences
    );
    if (!reverseMatch) {
      return baseIssue;
    }

    usedRanges.add(`${reverseMatch.start}:${reverseMatch.end}`);
    return {
      ...baseIssue,
      start: reverseMatch.start,
      end: reverseMatch.end,
    };
  });
}
