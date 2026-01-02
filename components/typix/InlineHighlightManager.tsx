import { useEffect, useCallback, useRef, useMemo } from "react";
import { useInputObserver } from "@/lib/hooks/useInputObserver";
import { useScrollSync } from "@/lib/hooks/useScrollSync";
import { useInlineAnalysis } from "@/lib/hooks/useInlineAnalysis";
import { HighlightOverlay, type IssueFixContext } from "./HighlightOverlay";
import type { Issue, FeedbackMessage } from "@/lib/types";
import { getElementText, isWordWebEditor } from "@/lib/textPositioning";
import { findSentenceRangeAt, getSentenceRanges } from "@/lib/sentences";

function sendFeedback(msg: FeedbackMessage) {
  browser.runtime.sendMessage(msg).catch(() => {});
}

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
  const {
    activeElement,
    text,
    isTyping,
    charDelta,
    changePosition,
    sessionId,
    editorKind,
    editorSignature,
    pageUrl,
  } = useInputObserver({
    enabled: isEnabled,
    minTextLength,
    debounceMs,
  });
  const { pagePosition } = useScrollSync(activeElement);
  const isWordWeb = useMemo(
    () => (activeElement ? isWordWebEditor(activeElement) : false),
    [activeElement]
  );

  const {
    state: analysisState,
    analyze,
    clearResult,
    removeIssue,
    dismissIssue,
    rebaseIssues,
    reanalyzeSentence,
  } = useInlineAnalysis({ minTextLength });

  // Avoid carrying issues across unrelated inputs.
  const prevElementRef = useRef<HTMLElement | null>(null);
  const skipNextAnalyzeRef = useRef(false);

  const indicatorPosition = useMemo(() => {
    if (!pagePosition || !activeElement) return null;
    const style = window.getComputedStyle(activeElement);
    const paddingRight = Number.parseFloat(style.paddingRight) || 0;
    const paddingBottom = Number.parseFloat(style.paddingBottom) || 0;
    const borderRight = Number.parseFloat(style.borderRightWidth) || 0;
    const borderBottom = Number.parseFloat(style.borderBottomWidth) || 0;
    const rightEdge = pagePosition.pageLeft + pagePosition.width;
    const bottomEdge = pagePosition.pageTop + pagePosition.height;
    return {
      x: rightEdge - paddingRight - borderRight,
      y: bottomEdge - paddingBottom - borderBottom,
    };
  }, [activeElement, pagePosition]);

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
    if (!isEnabled || !activeElement || isTyping || isWordWeb) {
      return;
    }

    if (skipNextAnalyzeRef.current) {
      skipNextAnalyzeRef.current = false;
      return;
    }

    const analysisText = getElementText(activeElement);
    if (analysisText && analysisText.length >= minTextLength) {
      analyze(analysisText, {
        sessionId: sessionId ?? undefined,
        editorKind: editorKind ?? undefined,
        editorSignature: editorSignature ?? undefined,
        pageUrl: pageUrl ?? undefined,
      });
    } else {
      clearResult();
    }
  }, [isEnabled, activeElement, text, isTyping, minTextLength, analyze, clearResult, isWordWeb, sessionId, editorKind, editorSignature, pageUrl]);

  // Keep idle typing fast by removing fixed issues without full re-analysis.
  const handleIssueFixed = useCallback(
    async ({ issue, sentenceAnchor, sentenceIssues }: IssueFixContext) => {
      console.log("[Typix] Fix applied:", issue.original, "→", issue.suggestion);

      // Send issue_count only; acceptance no longer tracked per sentence.
      if (analysisState.requestId) {
        sendFeedback({
          type: "SUBMIT_FEEDBACK",
          requestId: analysisState.requestId,
          issueCount: analysisState.issues.length,
        });
      }

      const previousText = analysisState.lastAnalyzedText;
      const issuesToRemove =
        sentenceIssues && sentenceIssues.length > 0 ? sentenceIssues : [issue];
      const seen = new Set<Issue>();
      for (const issueToRemove of issuesToRemove) {
        if (seen.has(issueToRemove)) continue;
        seen.add(issueToRemove);
        removeIssue(issueToRemove);
      }

      const currentText = activeElement ? getElementText(activeElement) : "";
      if (activeElement && previousText && currentText && previousText !== currentText) {
        rebaseIssues(previousText, currentText);
      }

      if (!activeElement || sentenceAnchor < 0) {
        return;
      }

      const sentenceRange = findSentenceRangeAt(getSentenceRanges(currentText), sentenceAnchor);
      if (!sentenceRange) {
        return;
      }

      skipNextAnalyzeRef.current = true;
      await reanalyzeSentence(currentText, sentenceRange, {
        skipIssueClear: Boolean(sentenceIssues && sentenceIssues.length > 0),
      });
    },
    [activeElement, analysisState.lastAnalyzedText, analysisState.requestId, analysisState.issues.length, removeIssue, rebaseIssues, reanalyzeSentence]
  );

  const handleIssueDismissed = useCallback(
    (issue: Issue) => {
      const issueCountBeforeDismiss = analysisState.issues.length;
      dismissIssue(issue, analysisState.lastAnalyzedText);
      // Still record issue_count for context; acceptance removed.
      if (analysisState.requestId) {
        sendFeedback({
          type: "SUBMIT_FEEDBACK",
          requestId: analysisState.requestId,
          issueCount: issueCountBeforeDismiss,
        });
      }
    },
    [dismissIssue, analysisState.lastAnalyzedText, analysisState.issues.length, analysisState.requestId]
  );

  if (!isEnabled || !activeElement || isWordWeb) {
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
          className="typix-inline-indicator"
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
            className={`typix-inline-badge ${badgeColor} ${
              isLoading ? "typix-inline-badge-loading" : ""
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
          elementText={text}
          issues={analysisState.issues}
          onIssueFixed={handleIssueFixed}
          onIssueDismissed={handleIssueDismissed}
          isTyping={isTyping}
          charDelta={charDelta}
          changePosition={changePosition}
        />
      )}
    </>
  );
}
