import { useCallback, useEffect, useMemo, useRef } from "react";
import type { Issue } from "@/lib/types";

export function useIssueIdMap(issues: Issue[]) {
  const issueIdByIssueRef = useRef<Map<Issue, string>>(new Map());
  const issueIdCounterRef = useRef(0);

  const getIssueId = useCallback((issue: Issue) => {
    const existing = issueIdByIssueRef.current.get(issue);
    if (existing) {
      return existing;
    }
    const next = `issue-${issueIdCounterRef.current++}`;
    issueIdByIssueRef.current.set(issue, next);
    return next;
  }, []);

  const issueIdByIssue = useMemo(() => {
    const map = new Map<Issue, string>();
    for (const issue of issues) {
      map.set(issue, getIssueId(issue));
    }
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
