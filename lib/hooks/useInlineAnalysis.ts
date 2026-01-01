import { useState, useCallback, useRef } from "react";
import type { AnalyzeResult, Issue, ProcessResponse } from "../types";
import type { SentenceRange } from "../sentences";
import { mergeIssuesForSentence } from "../issueMerge";
import { rebaseIssueOffsets } from "../issueOffsets";
import { getExplicitIssueRange } from "../textPositioning/occurrences";

function getIssueSignature(issue: Issue): string {
  return JSON.stringify([
    issue.type,
    issue.category,
    issue.severity,
    issue.original,
    issue.suggestion,
  ]);
}

function getIssueKey(text: string, issue: Issue): string | null {
  if (!text) return null;
  const range = getExplicitIssueRange(text, issue);
  if (!range) return null;
  return `${getIssueSignature(issue)}|${range.start}:${range.end}`;
}

function buildIssueKeySet(text: string, issues: Issue[]): Set<string> {
  const keys = new Set<string>();
  if (!text) return keys;
  for (const issue of issues) {
    const key = getIssueKey(text, issue);
    if (key) {
      keys.add(key);
    }
  }
  return keys;
}

function filterDismissedIssues(
  text: string,
  issues: Issue[],
  dismissedIssues: Issue[]
): Issue[] {
  if (issues.length === 0 || dismissedIssues.length === 0) {
    return issues;
  }
  const dismissedKeys = buildIssueKeySet(text, dismissedIssues);
  if (dismissedKeys.size === 0) {
    return issues;
  }
  return issues.filter((issue) => {
    const key = getIssueKey(text, issue);
    return !key || !dismissedKeys.has(key);
  });
}

function pruneDismissedIssues(text: string, issues: Issue[]): Issue[] {
  if (!text || issues.length === 0) {
    return [];
  }
  return issues.filter((issue) => Boolean(getIssueKey(text, issue)));
}

export interface InlineAnalysisState {
  isAnalyzing: boolean;
  issues: Issue[];
  error: string | null;
  lastAnalyzedText: string;
  requestId: string | null;
}

interface UseInlineAnalysisOptions {
  minTextLength?: number;
}

interface ReanalyzeSentenceOptions {
  skipIssueClear?: boolean;
}

interface UseInlineAnalysisReturn {
  state: InlineAnalysisState;
  analyze: (text: string) => Promise<void>;
  clearResult: () => void;
  /** Keep UI responsive by removing a single issue without a round-trip. */
  removeIssue: (issue: Issue) => void;
  /** Suppress a specific issue instance from resurfacing. */
  dismissIssue: (issue: Issue, contextText?: string) => void;
  /** Align issue offsets after local edits without a full reanalysis. */
  rebaseIssues: (originalText: string, updatedText: string) => void;
  /** Re-scan only the touched sentence to avoid full-document latency. */
  reanalyzeSentence: (
    fullText: string,
    sentenceRange: SentenceRange,
    options?: ReanalyzeSentenceOptions
  ) => Promise<void>;
}

export function useInlineAnalysis(
  options: UseInlineAnalysisOptions = {}
): UseInlineAnalysisReturn {
  const { minTextLength = 10 } = options;

  const [state, setState] = useState<InlineAnalysisState>({
    isAnalyzing: false,
    issues: [],
    error: null,
    lastAnalyzedText: "",
    requestId: null,
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const analyzeIdRef = useRef(0);
  const sentenceAnalyzeIdRef = useRef(0);
  const dismissedIssuesRef = useRef<Issue[]>([]);
  const dismissedTextRef = useRef("");

  const syncDismissedIssues = useCallback((nextText: string) => {
    if (!nextText) {
      dismissedIssuesRef.current = [];
      dismissedTextRef.current = "";
      return;
    }
    const prevText = dismissedTextRef.current;
    if (dismissedIssuesRef.current.length > 0 && prevText && prevText !== nextText) {
      dismissedIssuesRef.current = rebaseIssueOffsets(
        prevText,
        nextText,
        dismissedIssuesRef.current
      );
    }
    dismissedIssuesRef.current = pruneDismissedIssues(nextText, dismissedIssuesRef.current);
    dismissedTextRef.current = nextText;
  }, []);

  const analyze = useCallback(async (text: string) => {
    if (!text || text.trim().length < minTextLength) {
      dismissedIssuesRef.current = [];
      dismissedTextRef.current = "";
      setState((prev) => ({
        ...prev,
        issues: [],
        error: null,
        lastAnalyzedText: text,
      }));
      return;
    }

    if (text === state.lastAnalyzedText && !state.error) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    syncDismissedIssues(text);

    const currentId = ++analyzeIdRef.current;

    setState((prev) => ({
      ...prev,
      isAnalyzing: true,
      error: null,
    }));

    try {
      const response: ProcessResponse = await browser.runtime.sendMessage({
        type: "PROCESS_TEXT",
        action: "ANALYZE",
        text: text,
        options: {
          tone: "professional",
        },
      });

      if (currentId !== analyzeIdRef.current) {
        return;
      }

      if (response.success && response.result) {
        const result = response.result as AnalyzeResult;
        const filteredIssues = filterDismissedIssues(
          text,
          result.issues || [],
          dismissedIssuesRef.current
        );
        setState({
          isAnalyzing: false,
          issues: filteredIssues,
          error: null,
          lastAnalyzedText: text,
          requestId: response.requestId || null,
        });
      } else {
        setState((prev) => ({
          ...prev,
          isAnalyzing: false,
          error: response.error || "Analysis failed",
          lastAnalyzedText: text,
          requestId: null,
        }));
      }
    } catch (err) {
      if (currentId !== analyzeIdRef.current) {
        return;
      }

      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      setState((prev) => ({
        ...prev,
        isAnalyzing: false,
        error: String(err),
        lastAnalyzedText: text,
      }));
    }
  }, [minTextLength, state.lastAnalyzedText, state.error, syncDismissedIssues]);

  const clearResult = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    analyzeIdRef.current++;
    dismissedIssuesRef.current = [];
    dismissedTextRef.current = "";

    setState({
      isAnalyzing: false,
      issues: [],
      error: null,
      lastAnalyzedText: "",
      requestId: null,
    });
  }, []);

  const removeIssue = useCallback((issue: Issue) => {
    setState((prev) => ({
      ...prev,
      issues: (() => {
        const index = prev.issues.indexOf(issue);
        if (index === -1) {
          return prev.issues.filter((i) =>
            !(i.original === issue.original &&
              i.suggestion === issue.suggestion &&
              i.type === issue.type)
          );
        }
        return [...prev.issues.slice(0, index), ...prev.issues.slice(index + 1)];
      })(),
    }));
  }, []);

  const dismissIssue = useCallback(
    (issue: Issue, contextText?: string) => {
      const text = contextText ?? state.lastAnalyzedText;
      if (text) {
        syncDismissedIssues(text);
      }
      const issueKey = text ? getIssueKey(text, issue) : null;

      setState((prev) => ({
        ...prev,
        issues: prev.issues.filter((candidate) => {
          if (candidate === issue) return false;
          if (!issueKey || !text) return true;
          const candidateKey = getIssueKey(text, candidate);
          return !candidateKey || candidateKey !== issueKey;
        }),
      }));

      if (!text || !issueKey) {
        return;
      }

      const dismissedKeys = buildIssueKeySet(
        text,
        dismissedIssuesRef.current
      );
      if (!dismissedKeys.has(issueKey)) {
        dismissedIssuesRef.current = [...dismissedIssuesRef.current, issue];
      }
    },
    [state.lastAnalyzedText, syncDismissedIssues]
  );

  const rebaseIssues = useCallback((originalText: string, updatedText: string) => {
    if (!originalText || !updatedText || originalText === updatedText) {
      return;
    }

    syncDismissedIssues(updatedText);

    setState((prev) => ({
      ...prev,
      issues: rebaseIssueOffsets(originalText, updatedText, prev.issues),
      lastAnalyzedText: updatedText,
    }));
  }, [syncDismissedIssues]);

  const reanalyzeSentence = useCallback(
    async (
      fullText: string,
      sentenceRange: SentenceRange,
      options?: ReanalyzeSentenceOptions
    ) => {
      syncDismissedIssues(fullText);
      const sentenceText = fullText.slice(sentenceRange.coreStart, sentenceRange.coreEnd);
      const currentId = ++sentenceAnalyzeIdRef.current;

      setState((prev) => ({
        ...prev,
        isAnalyzing: true,
        error: null,
        issues: options?.skipIssueClear
          ? prev.issues
          : mergeIssuesForSentence(fullText, sentenceRange, prev.issues, []),
        lastAnalyzedText: fullText,
      }));

      if (!sentenceText.trim() || sentenceText.trim().length < minTextLength) {
        setState((prev) => ({
          ...prev,
          isAnalyzing: false,
          lastAnalyzedText: fullText,
        }));
        return;
      }

      try {
        const response: ProcessResponse = await browser.runtime.sendMessage({
          type: "PROCESS_TEXT",
          action: "ANALYZE",
          text: sentenceText,
          options: {
            tone: "professional",
          },
        });

        if (currentId !== sentenceAnalyzeIdRef.current) {
          return;
        }

        if (response.success && response.result) {
          const result = response.result as AnalyzeResult;
          setState((prev) => ({
            ...prev,
            isAnalyzing: false,
            issues: filterDismissedIssues(
              fullText,
              mergeIssuesForSentence(
                fullText,
                sentenceRange,
                prev.issues,
                result.issues || []
              ),
              dismissedIssuesRef.current
            ),
            error: null,
            lastAnalyzedText: fullText,
            requestId: response.requestId || prev.requestId,
          }));
        } else {
          setState((prev) => ({
            ...prev,
            isAnalyzing: false,
            error: response.error || "Analysis failed",
            lastAnalyzedText: fullText,
          }));
        }
      } catch (err) {
        if (currentId !== sentenceAnalyzeIdRef.current) {
          return;
        }

        setState((prev) => ({
          ...prev,
          isAnalyzing: false,
          error: String(err),
          lastAnalyzedText: fullText,
        }));
      }
    },
    [minTextLength, syncDismissedIssues]
  );

  return {
    state,
    analyze,
    clearResult,
    removeIssue,
    dismissIssue,
    rebaseIssues,
    reanalyzeSentence,
  };
}
