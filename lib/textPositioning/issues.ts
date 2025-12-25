import type { Issue } from "../types";
import { findAllOccurrences, getExplicitIssueRange } from "./occurrences";
import { getTextRangeRects } from "./rects";

export function sortIssuesByTextPosition(text: string, issues: Issue[]): Issue[] {
  const positionMap = new Map<Issue, number>();
  const occurrenceCounts = new Map<string, number>();

  for (const issue of issues) {
    const explicitRange = getExplicitIssueRange(text, issue);
    if (explicitRange) {
      positionMap.set(issue, explicitRange.start);
      continue;
    }

    const searchText = issue.original;
    if (!searchText) {
      positionMap.set(issue, Infinity);
      continue;
    }

    const occurrences = findAllOccurrences(text, searchText);
    const occurrenceIndex = occurrenceCounts.get(searchText) || 0;
    occurrenceCounts.set(searchText, occurrenceIndex + 1);

    if (occurrenceIndex < occurrences.length) {
      positionMap.set(issue, occurrences[occurrenceIndex]);
    } else {
      positionMap.set(issue, Infinity);
    }
  }

  return [...issues].sort((a, b) => {
    const posA = positionMap.get(a) ?? Infinity;
    const posB = positionMap.get(b) ?? Infinity;
    if (posA !== posB) return posA - posB;
    return issues.indexOf(a) - issues.indexOf(b);
  });
}

export interface IssuePosition {
  issue: Issue;
  start: number;
  end: number;
  occurrenceIndex: number;
}

export function getIssuePositions(text: string, issues: Issue[]): IssuePosition[] {
  const sortedIssues = sortIssuesByTextPosition(text, issues);
  const occurrenceCounts = new Map<string, number>();
  const occurrencesByText = new Map<string, number[]>();
  const positions: IssuePosition[] = [];

  for (const issue of sortedIssues) {
    const searchText = issue.original;
    const occurrenceIndex = occurrenceCounts.get(searchText) || 0;
    occurrenceCounts.set(searchText, occurrenceIndex + 1);

    const explicitRange = getExplicitIssueRange(text, issue);
    if (explicitRange) {
      positions.push({
        issue,
        start: explicitRange.start,
        end: explicitRange.end,
        occurrenceIndex,
      });
      continue;
    }

    if (!searchText) {
      positions.push({ issue, start: -1, end: -1, occurrenceIndex });
      continue;
    }

    const occurrences =
      occurrencesByText.get(searchText) || findAllOccurrences(text, searchText);
    occurrencesByText.set(searchText, occurrences);

    if (occurrenceIndex < occurrences.length) {
      const start = occurrences[occurrenceIndex];
      positions.push({
        issue,
        start,
        end: start + searchText.length,
        occurrenceIndex,
      });
    } else {
      positions.push({ issue, start: -1, end: -1, occurrenceIndex });
    }
  }

  return positions;
}

export function getIssueRects(element: HTMLElement, issues: Issue[]): Map<Issue, DOMRect[]> {
  const result = new Map<Issue, DOMRect[]>();

  if (!element || issues.length === 0) {
    return result;
  }

  const isTextInput =
    element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement;
  const isContentEditable = element.isContentEditable;

  if (!isTextInput && !isContentEditable) {
    return result;
  }

  const elementText = isTextInput
    ? (element as HTMLTextAreaElement | HTMLInputElement).value
    : element.textContent || "";
  const elementRect = isTextInput ? element.getBoundingClientRect() : undefined;

  const positions = getIssuePositions(elementText, issues);

  for (const pos of positions) {
    if (pos.start < 0 || pos.end < pos.start) continue;
    const rects = getTextRangeRects(element, pos.start, pos.end, elementRect);
    if (rects.length > 0) {
      result.set(pos.issue, rects);
    }
  }

  return result;
}
