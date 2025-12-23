import { useEffect, useCallback, useRef, useMemo } from "react";
import { useInputObserver } from "@/lib/hooks/useInputObserver";
import { useInlineAnalysis } from "@/lib/hooks/useInlineAnalysis";
import { HighlightOverlay, type IssueFixContext } from "./HighlightOverlay";
import type { Issue } from "@/lib/types";
import { getElementText } from "@/lib/textPositioning";
import { findSentenceRangeAt, getSentenceRanges } from "@/lib/sentences";

function getHealthDotColor(issueCount: number): string {
  if (issueCount === 0) return "bg-emerald-500";
  return "bg-red-500";
}

interface InlineHighlightManagerProps {
  /** Allow parent UI to pause analysis when another surface is active. */
  isEnabled?: boolean;
  /** Avoid noisy analysis on tiny snippets. */
  minTextLength?: number;
  /** Reduce churn while the user is still typing. */
  debounceMs?: number;
}

/**
 * Centralizes observation and analysis so overlays stay in sync.
 */
export function InlineHighlightManager({
  isEnabled = true,
  minTextLength = 10,
  debounceMs = 400,
}: InlineHighlightManagerProps) {
  const { activeElement, text, isTyping, elementRect, charDelta, changePosition } = useInputObserver({
    enabled: isEnabled,
    minTextLength,
    debounceMs,
  });

  const {
    state: analysisState,
    analyze,
    clearResult,
    removeIssue,
    reanalyzeSentence,
  } = useInlineAnalysis({ minTextLength });

  // Avoid carrying issues across unrelated inputs.
  const prevElementRef = useRef<HTMLElement | null>(null);
  const skipNextAnalyzeRef = useRef(false);

  const indicatorPosition = useMemo(() => {
    if (!elementRect || !activeElement) return null;
    const style = window.getComputedStyle(activeElement);
    const fontSize = Number.parseFloat(style.fontSize) || 14;
    const paddingRight = Number.parseFloat(style.paddingRight) || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
    const fallbackInset = Math.round(fontSize * 0.35);
    const paddingInset =
      paddingRight > 0 && paddingBottom > 0
        ? Math.min(paddingRight, paddingBottom)
        : paddingRight > 0
        ? paddingRight
        : paddingBottom > 0
        ? paddingBottom
        : fallbackInset;
    const inset = Math.max(4, Math.min(12, Math.round(paddingInset)));
    return {
      x: elementRect.right + window.scrollX - inset,
      y: elementRect.bottom + window.scrollY - inset,
    };
  }, [activeElement, elementRect]);

  useEffect(() => {
    const prevElement = prevElementRef.current;
    if (activeElement !== prevElement) {
      if (prevElement !== null && activeElement !== null) {
        clearResult();
      }
      prevElementRef.current = activeElement;
    }
  }, [activeElement, clearResult]);

  useEffect(() => {
    if (!isEnabled || !activeElement || isTyping) {
      return;
    }

    if (skipNextAnalyzeRef.current) {
      skipNextAnalyzeRef.current = false;
      return;
    }

    if (text && text.length >= minTextLength) {
      analyze(text);
    } else {
      clearResult();
    }
  }, [isEnabled, activeElement, text, isTyping, minTextLength, analyze, clearResult]);

  // Keep idle typing fast by removing fixed issues without full re-analysis.
  const handleIssueFixed = useCallback(
    async ({ issue, sentenceAnchor, sentenceIssues }: IssueFixContext) => {
      console.log("[Lintly] Fix applied:", issue.original, "→", issue.suggestion);
      const issuesToRemove =
        sentenceIssues && sentenceIssues.length > 0 ? sentenceIssues : [issue];
      const seen = new Set<Issue>();
      for (const issueToRemove of issuesToRemove) {
        if (seen.has(issueToRemove)) continue;
        seen.add(issueToRemove);
        removeIssue(issueToRemove);
      }

      if (!activeElement || sentenceAnchor < 0) {
        return;
      }

      const fullText = getElementText(activeElement);
      const sentenceRange = findSentenceRangeAt(getSentenceRanges(fullText), sentenceAnchor);
      if (!sentenceRange) {
        return;
      }

      skipNextAnalyzeRef.current = true;
      await reanalyzeSentence(fullText, sentenceRange);
    },
    [activeElement, removeIssue, reanalyzeSentence]
  );

  if (!isEnabled || !activeElement) {
    return null;
  }

  const issueCount = analysisState.issues.length;
  const healthDotColor = getHealthDotColor(issueCount);
  const showHighlights = issueCount > 0;
  const isLoading = analysisState.isAnalyzing && issueCount === 0;
  const badgeColor = isLoading ? "bg-slate-500" : healthDotColor;

  return (
    <>
      {indicatorPosition && (
        <div
          className="lintly-inline-indicator"
          style={{
            position: "absolute",
            left: indicatorPosition.x,
            top: indicatorPosition.y,
            zIndex: 2147483647,
            pointerEvents: "none",
            transform: "translate(-100%, -100%)",
          }}
        >
          <div
            className={`lintly-inline-badge ${badgeColor} ${
              isLoading ? "lintly-inline-badge-loading" : ""
            } ${
              analysisState.isAnalyzing ? "opacity-70" : ""
            }`}
            aria-label={isLoading ? "Checking" : `Issues: ${issueCount}`}
          >
            {isLoading ? "" : issueCount}
          </div>
        </div>
      )}

      {showHighlights && (
        <HighlightOverlay
          targetElement={activeElement}
          issues={analysisState.issues}
          onIssueFixed={handleIssueFixed}
          isTyping={isTyping}
          charDelta={charDelta}
          changePosition={changePosition}
        />
      )}
    </>
  );
}
