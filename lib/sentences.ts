import type { Issue } from "./types";
import { getIssuePositions } from "./textPositioning";

export interface SentenceRange {
  start: number;
  end: number;
  coreStart: number;
  coreEnd: number;
  text: string;
  coreText: string;
}

export interface IssueSentenceContext {
  issue: Issue;
  issueStart: number;
  issueEnd: number;
  sentenceIndex: number;
  sentence: SentenceRange;
  relativeStart: number;
  relativeEnd: number;
}

const sentenceSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter("en", { granularity: "sentence" })
    : null;

function buildSentenceRange(text: string, start: number, end: number): SentenceRange {
  const slice = text.slice(start, end);
  let coreStart = start;
  let coreEnd = end;

  while (coreStart < coreEnd && /\s/.test(text[coreStart] ?? "")) {
    coreStart++;
  }
  while (coreEnd > coreStart && /\s/.test(text[coreEnd - 1] ?? "")) {
    coreEnd--;
  }

  return {
    start,
    end,
    coreStart,
    coreEnd,
    text: slice,
    coreText: text.slice(coreStart, coreEnd),
  };
}

export function getSentenceRanges(text: string): SentenceRange[] {
  if (!text) return [];

  if (sentenceSegmenter) {
    const ranges: SentenceRange[] = [];
    for (const segment of sentenceSegmenter.segment(text)) {
      const start = segment.index;
      const end = segment.index + segment.segment.length;
      ranges.push(buildSentenceRange(text, start, end));
    }
    return ranges.length > 0 ? ranges : [buildSentenceRange(text, 0, text.length)];
  }

  const ranges: SentenceRange[] = [];
  let cursor = 0;
  const regex = /[^.!?]+[.!?]+(\s+|$)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) !== null) {
    const start = match.index;
    const end = match.index + match[0].length;
    if (start > cursor) {
      ranges.push(buildSentenceRange(text, cursor, start));
    }
    ranges.push(buildSentenceRange(text, start, end));
    cursor = end;
  }
  if (cursor < text.length) {
    ranges.push(buildSentenceRange(text, cursor, text.length));
  }
  return ranges;
}

export function findSentenceIndexAt(ranges: SentenceRange[], index: number): number {
  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    if (index >= range.coreStart && index < range.coreEnd) {
      return i;
    }
  }

  for (let i = 0; i < ranges.length; i++) {
    const range = ranges[i];
    if (index >= range.start && index < range.end) {
      return i;
    }
  }

  return -1;
}

export function findSentenceRangeAt(ranges: SentenceRange[], index: number): SentenceRange | null {
  const idx = findSentenceIndexAt(ranges, index);
  if (idx === -1) return null;
  return ranges[idx];
}

export function applyIssueToSentence(
  sentenceText: string,
  relativeStart: number,
  relativeEnd: number,
  suggestion: string
): string {
  if (relativeStart < 0 || relativeEnd < relativeStart || relativeEnd > sentenceText.length) {
    return sentenceText;
  }
  return sentenceText.slice(0, relativeStart) + suggestion + sentenceText.slice(relativeEnd);
}

export function applyIssuesToSentence(
  sentenceText: string,
  contexts: IssueSentenceContext[]
): string {
  if (!sentenceText || contexts.length === 0) {
    return sentenceText;
  }

  const sorted = [...contexts].sort((a, b) => a.relativeStart - b.relativeStart);
  let cursor = 0;
  let result = "";

  for (const context of sorted) {
    const start = context.relativeStart;
    const end = context.relativeEnd;
    if (start < cursor || start < 0 || end < start || end > sentenceText.length) {
      continue;
    }
    result += sentenceText.slice(cursor, start);
    result += context.issue.suggestion;
    cursor = end;
  }

  result += sentenceText.slice(cursor);
  return result;
}

export function groupIssueContextsBySentence(
  issueContexts: Map<Issue, IssueSentenceContext>
): Map<number, IssueSentenceContext[]> {
  const contextsBySentence = new Map<number, IssueSentenceContext[]>();
  for (const context of issueContexts.values()) {
    const bucket = contextsBySentence.get(context.sentenceIndex);
    if (bucket) {
      bucket.push(context);
    } else {
      contextsBySentence.set(context.sentenceIndex, [context]);
    }
  }
  return contextsBySentence;
}

export function buildIssueSentenceContexts(
  text: string,
  issues: Issue[]
): { sentenceRanges: SentenceRange[]; issueContexts: Map<Issue, IssueSentenceContext> } {
  const sentenceRanges = getSentenceRanges(text);
  const issuePositions = getIssuePositions(text, issues);

  const contexts = new Map<Issue, IssueSentenceContext>();

  for (const pos of issuePositions) {
    if (pos.start < 0) {
      continue;
    }

    const anchorIndex =
      pos.start === pos.end && pos.start === text.length && pos.start > 0
        ? pos.start - 1
        : pos.start;
    const sentenceIndex = findSentenceIndexAt(sentenceRanges, anchorIndex);
    if (sentenceIndex === -1) {
      continue;
    }

    const sentence = sentenceRanges[sentenceIndex];
    const relativeStart = pos.start - sentence.coreStart;
    const relativeEnd = relativeStart + (pos.end - pos.start);

    contexts.set(pos.issue, {
      issue: pos.issue,
      issueStart: pos.start,
      issueEnd: pos.end,
      sentenceIndex,
      sentence,
      relativeStart,
      relativeEnd,
    });
  }

  return { sentenceRanges, issueContexts: contexts };
}
