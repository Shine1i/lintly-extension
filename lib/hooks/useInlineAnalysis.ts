import { useState, useCallback, useRef } from "react";
import type { AnalyzeResult, Issue, ProcessResponse } from "../types";
import type { SentenceRange } from "../sentences";
import { mergeIssuesForSentence } from "../issueMerge";

export interface InlineAnalysisState {
  isAnalyzing: boolean;
  issues: Issue[];
  error: string | null;
  lastAnalyzedText: string;
}

interface UseInlineAnalysisOptions {
  minTextLength?: number;
}

interface UseInlineAnalysisReturn {
  state: InlineAnalysisState;
  analyze: (text: string) => Promise<void>;
  clearResult: () => void;
  /** Remove a single issue from the list without re-analyzing */
  removeIssue: (issue: Issue) => void;
  /** Re-analyze a specific sentence and merge issues */
  reanalyzeSentence: (fullText: string, sentenceRange: SentenceRange) => Promise<void>;
}

/**
 * Hook for managing inline text analysis
 */
export function useInlineAnalysis(
  options: UseInlineAnalysisOptions = {}
): UseInlineAnalysisReturn {
  const { minTextLength = 10 } = options;

  const [state, setState] = useState<InlineAnalysisState>({
    isAnalyzing: false,
    issues: [],
    error: null,
    lastAnalyzedText: "",
  });

  const abortControllerRef = useRef<AbortController | null>(null);
  const analyzeIdRef = useRef(0);
  const sentenceAnalyzeIdRef = useRef(0);

  const analyze = useCallback(async (text: string) => {
    // Skip if text is too short
    if (!text || text.trim().length < minTextLength) {
      setState((prev) => ({
        ...prev,
        issues: [],
        error: null,
        lastAnalyzedText: text,
      }));
      return;
    }

    // Skip if text is the same as last analyzed (and we have results or no error)
    if (text === state.lastAnalyzedText && !state.error) {
      return;
    }

    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    const currentId = ++analyzeIdRef.current;

    setState((prev) => ({
      ...prev,
      isAnalyzing: true,
      error: null,
      // Keep existing issues while analyzing (don't clear them)
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

      // Check if this is still the current request
      if (currentId !== analyzeIdRef.current) {
        return;
      }

      if (response.success && response.result) {
        const result = response.result as AnalyzeResult;
        setState({
          isAnalyzing: false,
          issues: result.issues || [],
          error: null,
          lastAnalyzedText: text,
        });
      } else {
        setState((prev) => ({
          ...prev,
          isAnalyzing: false,
          error: response.error || "Analysis failed",
          lastAnalyzedText: text,
        }));
      }
    } catch (err) {
      // Check if this is still the current request
      if (currentId !== analyzeIdRef.current) {
        return;
      }

      // Ignore abort errors
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
  }, [minTextLength, state.lastAnalyzedText, state.error]);

  const clearResult = useCallback(() => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    analyzeIdRef.current++;

    setState({
      isAnalyzing: false,
      issues: [],
      error: null,
      lastAnalyzedText: "",
    });
  }, []);

  // Remove a single issue by content match (not reference)
  // Does NOT trigger re-analysis - that only happens when user types
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
      // Keep lastAnalyzedText so we don't re-analyze until user types
    }));
  }, []);

  const reanalyzeSentence = useCallback(
    async (fullText: string, sentenceRange: SentenceRange) => {
      const sentenceText = fullText.slice(sentenceRange.coreStart, sentenceRange.coreEnd);
      const currentId = ++sentenceAnalyzeIdRef.current;

      setState((prev) => ({
        ...prev,
        isAnalyzing: true,
        error: null,
        issues: mergeIssuesForSentence(fullText, sentenceRange, prev.issues, []),
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
            issues: mergeIssuesForSentence(
              fullText,
              sentenceRange,
              prev.issues,
              result.issues || []
            ),
            error: null,
            lastAnalyzedText: fullText,
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
    [minTextLength]
  );

  return { state, analyze, clearResult, removeIssue, reanalyzeSentence };
}
