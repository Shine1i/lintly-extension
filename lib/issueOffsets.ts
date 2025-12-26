import { DiffMatchPatch, DiffOp, type Diff } from "diff-match-patch-ts";
import type { Issue, AnalyzeResult } from "./types";
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

export function rebaseIssueOffsets(
  originalText: string,
  updatedText: string,
  issues: Issue[]
): Issue[] {
  if (!issues || issues.length === 0) {
    return [];
  }

  if (originalText === updatedText) {
    return issues;
  }

  const dmp = new DiffMatchPatch();
  const diffs = dmp.diff_main(originalText, updatedText, false);

  return issues.map((issue) => {
    if (!Number.isInteger(issue.start) || !Number.isInteger(issue.end)) {
      return issue;
    }

    const start = mapIndexFromDiffs(diffs, issue.start as number);
    const end = mapIndexFromDiffs(diffs, issue.end as number);
    const safeStart = Math.min(Math.max(0, start), updatedText.length);
    const safeEnd = Math.min(Math.max(safeStart, end), updatedText.length);

    return {
      ...issue,
      start: safeStart,
      end: safeEnd,
    };
  });
}

function tokenizeWithWhitespace(text: string): string[] {
  if (!text) return [];
  const tokens = text.match(/\s+|[^\s]+/g);
  return tokens ?? [];
}

function tokensToChars(
  tokens: string[],
  tokenArray: string[],
  tokenMap: Map<string, number>
): { chars: string; exceeded: boolean } {
  let chars = "";

  for (const token of tokens) {
    let idx = tokenMap.get(token);
    if (idx === undefined) {
      idx = tokenArray.length;
      tokenArray.push(token);
      tokenMap.set(token, idx);
      if (idx > 0xffff) {
        return { chars: "", exceeded: true };
      }
    }
    chars += String.fromCharCode(idx);
  }

  return { chars, exceeded: false };
}

function charsToTokens(chars: string, tokenArray: string[]): string {
  let text = "";
  for (let i = 0; i < chars.length; i++) {
    text += tokenArray[chars.charCodeAt(i)];
  }
  return text;
}

function diffByTokens(
  dmp: DiffMatchPatch,
  originalText: string,
  correctedText: string
): Diff[] {
  const tokens1 = tokenizeWithWhitespace(originalText);
  const tokens2 = tokenizeWithWhitespace(correctedText);
  const tokenArray: string[] = [];
  const tokenMap = new Map<string, number>();

  const first = tokensToChars(tokens1, tokenArray, tokenMap);
  if (first.exceeded) {
    const fallback = dmp.diff_main(originalText, correctedText, false);
    dmp.diff_cleanupSemantic(fallback);
    return fallback;
  }

  const second = tokensToChars(tokens2, tokenArray, tokenMap);
  if (second.exceeded) {
    const fallback = dmp.diff_main(originalText, correctedText, false);
    dmp.diff_cleanupSemantic(fallback);
    return fallback;
  }

  const diffs = dmp.diff_main(first.chars, second.chars, false);
  dmp.diff_cleanupSemantic(diffs);
  return diffs.map(([op, text]) => [op, charsToTokens(text, tokenArray)]);
}

/**
 * Generates issues by diffing original text with corrected text.
 * Uses token-based diffing to preserve whitespace for accurate offsets.
 */
export function generateIssuesFromDiff(
  originalText: string,
  correctedText: string
): AnalyzeResult {
  if (originalText === correctedText) {
    return { corrected_text: correctedText, issues: [] };
  }

  const dmp = new DiffMatchPatch();
  const wordDiffs = diffByTokens(dmp, originalText, correctedText);

  const issues: Issue[] = [];
  let originalPos = 0;

  for (let i = 0; i < wordDiffs.length; i++) {
    const [op, text] = wordDiffs[i];

    if (op === DiffOp.Equal) {
      originalPos += text.length;
      continue;
    }

    if (op === DiffOp.Delete) {
      const nextDiff = wordDiffs[i + 1];
      const hasInsertion = nextDiff && nextDiff[0] === DiffOp.Insert;

      const original = text;
      const suggestion = hasInsertion ? nextDiff[1] : "";
      const start = originalPos;
      const end = originalPos + original.length;

      if (original || suggestion) {
        issues.push({
          type: "grammar",
          category: "correction",
          severity: "error",
          original,
          suggestion,
          explanation: "",
          start,
          end,
        });
      }

      originalPos += original.length;

      if (hasInsertion) {
        i++;
      }
    } else if (op === DiffOp.Insert) {
      if (text) {
        issues.push({
          type: "grammar",
          category: "correction",
          severity: "error",
          original: "",
          suggestion: text,
          explanation: "",
          start: originalPos,
          end: originalPos,
        });
      }
    }
  }

  return { corrected_text: correctedText, issues };
}
