import { useMemo, useEffect, useState, useCallback, useRef } from "react";
import type { Issue } from "@/lib/types";
import {
  applyFixToElement,
  applyTextRangeToElement,
  getElementText,
  getTextRangeRects,
} from "@/lib/textPositioning";
import { useScrollSync } from "@/lib/hooks/useScrollSync";
import { HighlightSpan } from "./HighlightSpan";
import {
  applyIssuesToSentence,
  buildIssueSentenceContexts,
  groupIssueContextsBySentence,
  type SentenceRange,
} from "@/lib/sentences";
import { useIssueIdMap } from "./highlightOverlay/useIssueIdMap";
import { useIssueRects } from "./highlightOverlay/useIssueRects";
import { useIssuePopover } from "./highlightOverlay/useIssuePopover";
import {
  rectIntersectsBounds,
  toLocalRects,
  toViewportRects,
  type RectBox,
  type ScrollBaseline,
} from "./highlightOverlay/geometry";

function getInlineHighlightClass(severity: Issue["severity"]): string {
  switch (severity) {
    case "error":
      return "lintly-inline-highlight-error";
    case "warning":
      return "lintly-inline-highlight-warning";
    case "suggestion":
      return "lintly-inline-highlight-suggestion";
    default:
      return "lintly-inline-highlight-suggestion";
  }
}

export interface IssueFixContext {
  issue: Issue;
  sentenceAnchor: number;
  sentenceIssues?: Issue[];
}

interface RectCacheEntry {
  rects: RectBox[];
  baseScrollTop: number;
  baseScrollLeft: number;
}

interface HighlightOverlayProps {
  targetElement: HTMLElement;
  issues: Issue[];
  onIssueFixed?: (context: IssueFixContext) => void;
  /** Keep highlights responsive while typing without reflow-heavy recomputes. */
  isTyping?: boolean;
  /** Used to approximate visual shifts instead of re-measuring on each keypress. */
  charDelta?: number;
  /** Anchor for incremental shifts. */
  changePosition?: number;
}

export function HighlightOverlay({
  targetElement,
  issues,
  onIssueFixed,
  isTyping = false,
  charDelta = 0,
  changePosition = 0,
}: HighlightOverlayProps) {
  const { scrollPosition, elementPosition, layoutVersion } = useScrollSync(targetElement);
  const elementText = getElementText(targetElement);
  const { issueIdByIssue, issueById } = useIssueIdMap(issues);

  const { issueContexts } = useMemo(
    () => buildIssueSentenceContexts(elementText, issues),
    [elementText, issues]
  );
  const contextsBySentence = useMemo(
    () => groupIssueContextsBySentence(issueContexts),
    [issueContexts]
  );
  const correctedSentenceByIndex = useMemo(() => {
    const map = new Map<number, string>();
    for (const [sentenceIndex, contexts] of contextsBySentence.entries()) {
      if (contexts.length === 0) continue;
      const sentenceText = contexts[0].sentence.coreText;
      map.set(sentenceIndex, applyIssuesToSentence(sentenceText, contexts));
    }
    return map;
  }, [contextsBySentence]);

  const { displayRects, clipBounds, issueOccurrenceIndices, removeIssueRects } = useIssueRects({
    targetElement,
    issues,
    issueIdByIssue,
    elementText,
    isTyping,
    charDelta,
    changePosition,
    elementPosition,
    scrollPosition,
    layoutVersion,
  });

  const [activeSentenceRange, setActiveSentenceRange] = useState<SentenceRange | null>(null);
  const [activeSentenceRects, setActiveSentenceRects] = useState<RectBox[]>([]);
  const activeSentenceBaseScrollRef = useRef<ScrollBaseline>({ scrollTop: 0, scrollLeft: 0 });
  const sentenceRectsCacheRef = useRef<Map<string, RectCacheEntry>>(new Map());

  useEffect(() => {
    setActiveSentenceRange(null);
    setActiveSentenceRects([]);
    sentenceRectsCacheRef.current = new Map();
  }, [issues, elementText, targetElement]);

  const setActiveSentenceForIssue = useCallback(
    (issue: Issue | null) => {
      if (!issue) {
        setActiveSentenceRange(null);
        setActiveSentenceRects([]);
        return;
      }

      const context = issueContexts.get(issue);
      if (!context) {
        setActiveSentenceRange(null);
        setActiveSentenceRects([]);
        return;
      }

      const range = context.sentence;
      const sentenceKey = `${range.coreStart}:${range.coreEnd}`;
      const cached = sentenceRectsCacheRef.current.get(sentenceKey);
      if (cached) {
        activeSentenceBaseScrollRef.current = {
          scrollTop: cached.baseScrollTop,
          scrollLeft: cached.baseScrollLeft,
        };
        setActiveSentenceRange(range);
        setActiveSentenceRects(cached.rects);
        return;
      }

      const elementRect = targetElement.getBoundingClientRect();
      const baseScrollTop = targetElement.scrollTop ?? 0;
      const baseScrollLeft = targetElement.scrollLeft ?? 0;
      const rects = getTextRangeRects(
        targetElement,
        range.coreStart,
        range.coreEnd,
        elementRect
      );
      const localRects = toLocalRects(rects, elementRect);

      sentenceRectsCacheRef.current.set(sentenceKey, {
        rects: localRects,
        baseScrollTop,
        baseScrollLeft,
      });

      activeSentenceBaseScrollRef.current = {
        scrollTop: baseScrollTop,
        scrollLeft: baseScrollLeft,
      };
      setActiveSentenceRange(range);
      setActiveSentenceRects(localRects);
    },
    [issueContexts, targetElement]
  );

  const handleHoverIssueChange = useCallback(
    (issueId: string | null) => {
      const issue = issueId ? issueById.get(issueId) ?? null : null;
      setActiveSentenceForIssue(issue);
    },
    [issueById, setActiveSentenceForIssue]
  );

  const { popoverIssueId, anchorRect, handlePopoverHoverChange, handlePopoverOpenChange } =
    useIssuePopover({
      displayRects,
      issueById,
      issuesCount: issues.length,
      targetElement,
      onHoverIssueChange: handleHoverIssueChange,
    });

  const handleApplyFix = useCallback(
    (issue: Issue) => {
      const issueId = issueIdByIssue.get(issue);
      const occurrenceIndex = issueId ? issueOccurrenceIndices.get(issueId) ?? 0 : 0;
      const context = issueContexts.get(issue);
      const sentenceContexts = context
        ? contextsBySentence.get(context.sentenceIndex) || []
        : [];

      let success = false;
      if (context) {
        const correctedSentence = applyIssuesToSentence(
          context.sentence.coreText,
          sentenceContexts.length > 0 ? sentenceContexts : [context]
        );
        success = applyTextRangeToElement(
          targetElement,
          context.sentence.coreStart,
          context.sentence.coreEnd,
          correctedSentence
        );
      }

      if (!success) {
        success = applyFixToElement(
          targetElement,
          issue.original,
          issue.suggestion,
          occurrenceIndex
        );
      }

      if (!success) {
        return;
      }

      if (sentenceContexts.length > 0) {
        const ids = sentenceContexts
          .map((ctx) => issueIdByIssue.get(ctx.issue))
          .filter((id): id is string => Boolean(id));
        if (ids.length > 0) {
          removeIssueRects(ids);
        }
      } else if (issueId) {
        removeIssueRects([issueId]);
      }

      setActiveSentenceRange(null);
      setActiveSentenceRects([]);

      onIssueFixed?.({
        issue,
        sentenceAnchor: context?.sentence.coreStart ?? -1,
        sentenceIssues:
          sentenceContexts.length > 0
            ? sentenceContexts.map((ctx) => ctx.issue)
            : undefined,
      });
    },
    [
      targetElement,
      onIssueFixed,
      issueOccurrenceIndices,
      issueContexts,
      issueIdByIssue,
      contextsBySentence,
      removeIssueRects,
    ]
  );

  const handleApplyWordFix = useCallback(
    (issue: Issue) => {
      const issueId = issueIdByIssue.get(issue);
      const occurrenceIndex = issueId ? issueOccurrenceIndices.get(issueId) ?? 0 : 0;
      const context = issueContexts.get(issue);
      let success = false;

      if (context) {
        success = applyTextRangeToElement(
          targetElement,
          context.issueStart,
          context.issueEnd,
          issue.suggestion
        );
      }

      if (!success) {
        success = applyFixToElement(
          targetElement,
          issue.original,
          issue.suggestion,
          occurrenceIndex
        );
      }

      if (!success) {
        return;
      }

      if (issueId) {
        removeIssueRects([issueId]);
      }

      setActiveSentenceRange(null);
      setActiveSentenceRects([]);

      onIssueFixed?.({
        issue,
        sentenceAnchor: context?.sentence.coreStart ?? -1,
      });
    },
    [
      targetElement,
      onIssueFixed,
      issueOccurrenceIndices,
      issueIdByIssue,
      issueContexts,
      removeIssueRects,
    ]
  );

  const renderedSentenceRects = useMemo(() => {
    if (!elementPosition || !activeSentenceRange || activeSentenceRects.length === 0) {
      return [];
    }

    const rects = toViewportRects(
      activeSentenceRects,
      elementPosition,
      activeSentenceBaseScrollRef.current,
      scrollPosition
    );
    if (!clipBounds) return rects;
    return rects.filter((rect) => rectIntersectsBounds(rect, clipBounds));
  }, [activeSentenceRects, activeSentenceRange, elementPosition, scrollPosition, clipBounds]);

  const clipPath = useMemo(() => {
    if (!clipBounds) return undefined;
    return `polygon(${clipBounds.left}px ${clipBounds.top}px, ${clipBounds.right}px ${clipBounds.top}px, ${clipBounds.right}px ${clipBounds.bottom}px, ${clipBounds.left}px ${clipBounds.bottom}px)`;
  }, [clipBounds]);

  const activeIssue = popoverIssueId ? issueById.get(popoverIssueId) : null;
  const activeContext = activeIssue ? issueContexts.get(activeIssue) : undefined;
  const activeSentenceText = activeContext?.sentence.coreText;
  const activeCorrectedSentence =
    activeContext && activeSentenceText
      ? correctedSentenceByIndex.get(activeContext.sentenceIndex)
      : undefined;
  const isPopoverOpen = Boolean(activeIssue && anchorRect);

  if (!elementPosition || issues.length === 0 || displayRects.size === 0) {
    return null;
  }

  return (
    <div
      className="lintly-inline-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        zIndex: 2147483640,
        clipPath,
      }}
    >
      {activeSentenceRange &&
        renderedSentenceRects.map((rect, index) => (
          <div
            key={`sentence-${index}`}
            className="lintly-inline-sentence-highlight"
            style={{
              position: "fixed",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            }}
          />
        ))}

      {issues.map((issue) => {
        const issueId = issueIdByIssue.get(issue);
        if (!issueId) return null;
        const rects = displayRects.get(issueId);
        if (!rects || rects.length === 0) return null;

        const highlightClass = getInlineHighlightClass(issue.severity);
        return rects.map((rect, rectIndex) => (
          <div
            key={`${issueId}-${rectIndex}`}
            className={`lintly-inline-highlight ${highlightClass}`}
            style={{
              position: "fixed",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
            }}
          />
        ));
      })}

      {activeIssue && anchorRect && (
        <HighlightSpan
          issue={activeIssue}
          anchorRect={anchorRect}
          isOpen={isPopoverOpen}
          onOpenChange={handlePopoverOpenChange}
          onApplyFix={() => handleApplyFix(activeIssue)}
          onApplyWordFix={() => handleApplyWordFix(activeIssue)}
          sentenceText={activeSentenceText}
          correctedSentence={activeCorrectedSentence}
          onPopoverHoverChange={handlePopoverHoverChange}
        />
      )}
    </div>
  );
}
