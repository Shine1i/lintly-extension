import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Issue } from "@/lib/types";

type IssueIdEntry = {
  id: string;
  start: number | null;
};

function getIssueSignature(issue: Issue): string {
  return JSON.stringify([
    issue.type,
    issue.category,
    issue.severity,
    issue.original,
    issue.suggestion,
  ]);
}

function getIssueStart(issue: Issue): number | null {
  return Number.isInteger(issue.start) ? (issue.start as number) : null;
}

export function useIssueIdMap(issues: Issue[]) {
  const issueIdByIssueRef = useRef<Map<Issue, string>>(new Map());
  const issueIdEntriesRef = useRef<Map<string, IssueIdEntry[]>>(new Map());
  const issueIdCounterRef = useRef(0);

  const getIssueId = useCallback(
    (issue: Issue, signature: string, start: number | null, usedIds: Set<string>) => {
      const existing = issueIdByIssueRef.current.get(issue);
      if (existing) {
        usedIds.add(existing);
        return existing;
      }

      const candidates = issueIdEntriesRef.current.get(signature) ?? [];
      let matched: IssueIdEntry | null = null;
      let bestDistance = Number.POSITIVE_INFINITY;

      for (const candidate of candidates) {
        if (usedIds.has(candidate.id)) continue;
        if (start !== null && candidate.start !== null) {
          const distance = Math.abs(start - candidate.start);
          if (distance < bestDistance) {
            bestDistance = distance;
            matched = candidate;
          }
          continue;
        }
        if (matched === null) {
          matched = candidate;
        }
      }

      if (matched) {
        usedIds.add(matched.id);
        issueIdByIssueRef.current.set(issue, matched.id);
        return matched.id;
      }

      const next = `issue-${issueIdCounterRef.current++}`;
      usedIds.add(next);
      issueIdByIssueRef.current.set(issue, next);
      return next;
    },
    []
  );

  const issueIdByIssue = useMemo(() => {
    const usedIds = new Set<string>();
    const nextEntries = new Map<string, IssueIdEntry[]>();
    const map = new Map<Issue, string>();
    const sorted = issues
      .map((issue, index) => ({ issue, index, start: getIssueStart(issue) }))
      .sort((a, b) => {
        if (a.start === null && b.start === null) return a.index - b.index;
        if (a.start === null) return 1;
        if (b.start === null) return -1;
        if (a.start !== b.start) return a.start - b.start;
        return a.index - b.index;
      });

    for (const item of sorted) {
      const signature = getIssueSignature(item.issue);
      const id = getIssueId(item.issue, signature, item.start, usedIds);
      map.set(item.issue, id);
      const list = nextEntries.get(signature) ?? [];
      list.push({ id, start: item.start });
      nextEntries.set(signature, list);
    }

    issueIdEntriesRef.current = nextEntries;
    return map;
  }, [issues, getIssueId]);

  const issueById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const [issue, id] of issueIdByIssue.entries()) {
      map.set(id, issue);
    }
    return map;
  }, [issueIdByIssue]);

  useEffect(() => {
    const issueSet = new Set(issues);
    for (const issue of issueIdByIssueRef.current.keys()) {
      if (!issueSet.has(issue)) {
        issueIdByIssueRef.current.delete(issue);
      }
    }
  }, [issues]);

  return { issueIdByIssue, issueById };
}
