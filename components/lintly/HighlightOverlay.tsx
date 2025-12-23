import { useMemo, useEffect, useState, useCallback, useRef } from "react";
import type { Issue } from "@/lib/types";
import {
  getIssueRects,
  applyFixToElement,
  getElementText,
  getIssuePositions,
  applyTextRangeToElement,
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

interface HighlightOverlayProps {
  targetElement: HTMLElement;
  issues: Issue[];
  onIssueFixed?: (context: IssueFixContext) => void;
  /** Whether user is currently typing (for incremental updates) */
  isTyping?: boolean;
  /** Character delta during typing (positive = added, negative = removed) */
  charDelta?: number;
  /** Position in text where change occurred */
  changePosition?: number;
}

/**
 * Overlay container that renders highlight underlines over an input element
 * Handles scroll synchronization and position updates
 */
export function HighlightOverlay({
  targetElement,
  issues,
  onIssueFixed,
  isTyping = false,
  charDelta = 0,
  changePosition = 0,
}: HighlightOverlayProps) {
  const { scrollPosition, elementPosition } = useScrollSync(targetElement);
  // Use stable issue ids for lookups across renders
  const [issueRects, setIssueRects] = useState<Map<string, DOMRect[]>>(new Map());
  const issueIdByIssueRef = useRef<Map<Issue, string>>(new Map());
  const issueIdCounterRef = useRef(0);
  // Track which occurrence index each issue corresponds to
  const [issueOccurrenceIndices, setIssueOccurrenceIndices] = useState<Map<string, number>>(new Map());
  // Track the text positions of issues for incremental shifting
  const [issueTextPositions, setIssueTextPositions] = useState<Map<string, number>>(new Map());
  // Track previous issues to detect removals
  const prevIssueIdsRef = useRef<Set<string>>(new Set());
  const [activeSentenceRange, setActiveSentenceRange] = useState<SentenceRange | null>(null);
  const [activeSentenceRects, setActiveSentenceRects] = useState<DOMRect[]>([]);
  const sentenceRectsCacheRef = useRef<Map<string, DOMRect[]>>(new Map());
  const [popoverIssueId, setPopoverIssueId] = useState<string | null>(null);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const hoveredIssueIdRef = useRef<string | null>(null);
  const openTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOpenIdRef = useRef<string | null>(null);
  const isPopoverHoveringRef = useRef(false);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const isPointerDownRef = useRef(false);
  const updateHoverFromPointRef = useRef<(x: number, y: number) => void>(() => {});

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

  const elementText = getElementText(targetElement);
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
  const issueById = useMemo(() => {
    const map = new Map<string, Issue>();
    for (const [issue, id] of issueIdByIssue.entries()) {
      map.set(id, issue);
    }
    return map;
  }, [issueIdByIssue]);

  // Build occurrence index map and text positions when issues change (not on scroll)
  useEffect(() => {
    if (!targetElement || issues.length === 0) {
      setIssueOccurrenceIndices(new Map());
      setIssueTextPositions(new Map());
      prevIssueIdsRef.current = new Set();
      setActiveSentenceRange(null);
      setActiveSentenceRects([]);
      return;
    }

    const issueSet = new Set(issues);
    for (const issue of issueIdByIssueRef.current.keys()) {
      if (!issueSet.has(issue)) {
        issueIdByIssueRef.current.delete(issue);
      }
    }

    const positions = getIssuePositions(elementText, issues);
    const occurrenceMap = new Map<string, number>();
    const positionMap = new Map<string, number>();
    const currentKeys = new Set<string>();

    for (const pos of positions) {
      const issueId = issueIdByIssue.get(pos.issue);
      if (!issueId) continue;
      currentKeys.add(issueId);
      occurrenceMap.set(issueId, pos.occurrenceIndex);
      if (pos.start >= 0) {
        positionMap.set(issueId, pos.start);
      }
    }

    // Check if issues were removed - if so, clear rects for removed issues
    const removedKeys = [...prevIssueIdsRef.current].filter((k) => !currentKeys.has(k));
    if (removedKeys.length > 0) {
      setIssueRects((prev) => {
        const newRects = new Map(prev);
        for (const key of removedKeys) {
          newRects.delete(key);
        }
        return newRects;
      });
    }

    prevIssueIdsRef.current = currentKeys;
    setIssueOccurrenceIndices(occurrenceMap);
    setIssueTextPositions(positionMap);
    sentenceRectsCacheRef.current = new Map();
    setActiveSentenceRange(null);
    setActiveSentenceRects([]);
  }, [targetElement, issues, elementText, issueIdByIssue]);

  // Recalculate issue positions - skip during typing for performance
  // Grammarly-style: defer expensive layout queries until typing stops
  useEffect(() => {
    if (!targetElement || issues.length === 0) {
      setIssueRects(new Map());
      return;
    }

    // Skip full recalculation while user is typing
    // This is the key Grammarly optimization - defer expensive layout queries
    if (isTyping && issueRects.size > 0) {
      return;
    }

    // Calculate rects for all issues (only when not typing)
    const rectsMap = getIssueRects(targetElement, issues);

    // Convert to string-keyed map
    const stringKeyedRects = new Map<string, DOMRect[]>();
    for (const [issue, rects] of rectsMap.entries()) {
      const issueId = issueIdByIssue.get(issue);
      if (!issueId) continue;
      stringKeyedRects.set(issueId, rects);
    }
    setIssueRects(stringKeyedRects);
  }, [targetElement, issues, scrollPosition, elementPosition, isTyping, issueIdByIssue]);

  // Incremental shift: when typing, shift highlights that come after the change position
  // This is much cheaper than full recalculation
  const shiftedRects = useMemo(() => {
    // Only shift if typing with a char delta and we have existing rects
    if (!isTyping || charDelta === 0 || issueRects.size === 0) {
      return issueRects;
    }

    // Estimate pixel shift based on character delta
    // Average character width - this is approximate but avoids layout queries
    const avgCharWidth = 8; // Will be slightly off but acceptable during typing
    const pixelShift = charDelta * avgCharWidth;

    const shifted = new Map<string, DOMRect[]>();
    for (const [issueId, rects] of issueRects.entries()) {
      const textPos = issueTextPositions.get(issueId);

      // Only shift highlights that come after the change position
      if (textPos !== undefined && textPos >= changePosition) {
        const shiftedRectsArray = rects.map(
          (r) => new DOMRect(r.left + pixelShift, r.top, r.width, r.height)
        );
        shifted.set(issueId, shiftedRectsArray);
      } else {
        shifted.set(issueId, rects);
      }
    }
    return shifted;
  }, [issueRects, isTyping, charDelta, changePosition, issueTextPositions]);

  const handleSentenceHover = useCallback(
    (issue: Issue, isHovering: boolean) => {
      if (!isHovering) {
        setActiveSentenceRange(null);
        setActiveSentenceRects([]);
        return;
      }

      const context = issueContexts.get(issue);
      if (!context) return;

      const range = context.sentence;
      const sentenceKey = `${range.coreStart}:${range.coreEnd}`;
      const cached = sentenceRectsCacheRef.current.get(sentenceKey);
      const rects =
        cached || getTextRangeRects(targetElement, range.coreStart, range.coreEnd);

      if (!cached) {
        sentenceRectsCacheRef.current.set(sentenceKey, rects);
      }

      setActiveSentenceRange(range);
      setActiveSentenceRects(rects);
    },
    [issueContexts, targetElement]
  );

  const clearOpenTimeout = useCallback(() => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    pendingOpenIdRef.current = null;
  }, []);

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current) {
      clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const setHoveredIssueId = useCallback(
    (nextId: string | null) => {
      if (hoveredIssueIdRef.current === nextId) {
        return;
      }

      const previousId = hoveredIssueIdRef.current;
      if (previousId) {
        const previousIssue = issueById.get(previousId);
        if (previousIssue) {
          handleSentenceHover(previousIssue, false);
        }
      }

      hoveredIssueIdRef.current = nextId;

      if (!nextId) {
        setActiveSentenceRange(null);
        setActiveSentenceRects([]);
        return;
      }

      const nextIssue = issueById.get(nextId);
      if (nextIssue) {
        handleSentenceHover(nextIssue, true);
      }
    },
    [issueById, handleSentenceHover]
  );

  const closePopoverAndHover = useCallback(() => {
    setPopoverIssueId(null);
    setAnchorRect(null);
    setHoveredIssueId(null);
  }, [setHoveredIssueId]);

  const scheduleOpen = useCallback(
    (issueId: string, rect: DOMRect | null) => {
      if (!issueId || !rect) return;
      if (pendingOpenIdRef.current === issueId && openTimeoutRef.current) {
        return;
      }
      clearCloseTimeout();
      clearOpenTimeout();
      pendingOpenIdRef.current = issueId;
      openTimeoutRef.current = setTimeout(() => {
        openTimeoutRef.current = null;
        pendingOpenIdRef.current = null;
        setPopoverIssueId(issueId);
        setAnchorRect(rect);
      }, 180);
    },
    [clearCloseTimeout, clearOpenTimeout]
  );

  const scheduleClose = useCallback(() => {
    if (closeTimeoutRef.current) return;
    clearOpenTimeout();
    closeTimeoutRef.current = setTimeout(() => {
      closeTimeoutRef.current = null;
      if (isPopoverHoveringRef.current) return;
      closePopoverAndHover();
    }, 150);
  }, [clearOpenTimeout, closePopoverAndHover]);

  const findIssueAtPoint = useCallback(
    (x: number, y: number) => {
      for (const [issueId, rects] of shiftedRects.entries()) {
        for (const rect of rects) {
          if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
            return { issueId, rect };
          }
        }
      }
      return null;
    },
    [shiftedRects]
  );

  const updateHoverFromPoint = useCallback(
    (x: number, y: number) => {
      if (isPointerDownRef.current) {
        return;
      }

      const hit = findIssueAtPoint(x, y);
      if (hit) {
        setHoveredIssueId(hit.issueId);
        clearCloseTimeout();
        if (!isPopoverHoveringRef.current) {
          if (popoverIssueId !== hit.issueId) {
            scheduleOpen(hit.issueId, hit.rect);
          } else if (hit.rect && hit.rect !== anchorRect) {
            setAnchorRect(hit.rect);
          }
        }
        return;
      }

      if (!isPopoverHoveringRef.current) {
        scheduleClose();
      }
    },
    [
      anchorRect,
      clearCloseTimeout,
      findIssueAtPoint,
      popoverIssueId,
      scheduleClose,
      scheduleOpen,
      setHoveredIssueId,
    ]
  );

  useEffect(() => {
    updateHoverFromPointRef.current = updateHoverFromPoint;
  }, [updateHoverFromPoint]);

  // Handle applying a fix
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

      if (success) {
        setIssueRects((prev) => {
          const newRects = new Map(prev);
          if (sentenceContexts.length > 0) {
            for (const ctx of sentenceContexts) {
              const id = issueIdByIssue.get(ctx.issue);
              if (id) {
                newRects.delete(id);
              }
            }
          } else if (issueId) {
            newRects.delete(issueId);
          }
          return newRects;
        });

        setActiveSentenceRange(null);
        setActiveSentenceRects([]);

        if (onIssueFixed) {
          onIssueFixed({
            issue,
            sentenceAnchor: context?.sentence.coreStart ?? -1,
            sentenceIssues:
              sentenceContexts.length > 0
                ? sentenceContexts.map((ctx) => ctx.issue)
                : undefined,
          });
        }
      }
    },
    [
      targetElement,
      onIssueFixed,
      issueOccurrenceIndices,
      issueContexts,
      issueIdByIssue,
      contextsBySentence,
    ]
  );

  const handleApplyWordFix = useCallback(
    (issue: Issue) => {
      const issueId = issueIdByIssue.get(issue);
      const occurrenceIndex = issueId ? issueOccurrenceIndices.get(issueId) ?? 0 : 0;
      const context = issueContexts.get(issue);
      const success = applyFixToElement(
        targetElement,
        issue.original,
        issue.suggestion,
        occurrenceIndex
      );

      if (!success) {
        return;
      }

      if (issueId) {
        setIssueRects((prev) => {
          const newRects = new Map(prev);
          newRects.delete(issueId);
          return newRects;
        });
      }

      setActiveSentenceRange(null);
      setActiveSentenceRects([]);

      if (onIssueFixed) {
        onIssueFixed({
          issue,
          sentenceAnchor: context?.sentence.coreStart ?? -1,
        });
      }
    },
    [targetElement, onIssueFixed, issueOccurrenceIndices, issueIdByIssue, issueContexts]
  );

  useEffect(() => {
    if (issueById.size === 0) {
      if (popoverIssueId || hoveredIssueIdRef.current) {
        closePopoverAndHover();
      }
      return;
    }

    if (popoverIssueId && !issueById.has(popoverIssueId)) {
      setPopoverIssueId(null);
      setAnchorRect(null);
    }

    const hoveredId = hoveredIssueIdRef.current;
    if (hoveredId && !issueById.has(hoveredId)) {
      setHoveredIssueId(null);
    }
  }, [issueById, popoverIssueId, closePopoverAndHover, setHoveredIssueId]);

  useEffect(() => {
    if (!targetElement || issues.length === 0) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      if (isPopoverHoveringRef.current || isPointerDownRef.current) {
        return;
      }
      if (rafRef.current !== null) {
        return;
      }
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const pos = lastPointerRef.current;
        if (!pos) return;
        updateHoverFromPointRef.current(pos.x, pos.y);
      });
    };

    const handleMouseDown = () => {
      isPointerDownRef.current = true;
      clearOpenTimeout();
      clearCloseTimeout();
    };

    const handleMouseUp = () => {
      isPointerDownRef.current = false;
      const pos = lastPointerRef.current;
      if (!pos || isPopoverHoveringRef.current) return;
      updateHoverFromPointRef.current(pos.x, pos.y);
    };

    document.addEventListener("mousemove", handleMouseMove, true);
    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("mouseup", handleMouseUp, true);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove, true);
      document.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("mouseup", handleMouseUp, true);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      clearOpenTimeout();
      clearCloseTimeout();
    };
  }, [
    targetElement,
    issues.length,
    clearOpenTimeout,
    clearCloseTimeout,
  ]);

  const handlePopoverHoverChange = useCallback(
    (isHovering: boolean) => {
      isPopoverHoveringRef.current = isHovering;
      if (isHovering) {
        clearCloseTimeout();
        return;
      }
      const pos = lastPointerRef.current;
      if (pos) {
        updateHoverFromPoint(pos.x, pos.y);
      } else {
        scheduleClose();
      }
    },
    [clearCloseTimeout, scheduleClose, updateHoverFromPoint]
  );

  const handlePopoverOpenChange = useCallback((open: boolean) => {
    if (open) return;
    isPopoverHoveringRef.current = false;
    setPopoverIssueId(null);
    setAnchorRect(null);
  }, []);

  useEffect(() => {
    if (!activeSentenceRange) return;
    const rects = getTextRangeRects(
      targetElement,
      activeSentenceRange.coreStart,
      activeSentenceRange.coreEnd
    );
    setActiveSentenceRects(rects);
  }, [activeSentenceRange, scrollPosition, elementPosition, targetElement]);

  // Clip path to match element bounds (hide highlights outside visible area)
  const clipPath = useMemo(() => {
    if (!elementPosition) return undefined;

    // Get element's visible area (accounting for padding/border)
    const style = getComputedStyle(targetElement);
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const borderRight = parseFloat(style.borderRightWidth) || 0;
    const borderBottom = parseFloat(style.borderBottomWidth) || 0;

    const top = elementPosition.top + borderTop + paddingTop;
    const left = elementPosition.left + borderLeft + paddingLeft;
    const right = elementPosition.left + elementPosition.width - borderRight - paddingRight;
    const bottom = elementPosition.top + elementPosition.height - borderBottom - paddingBottom;

    return `polygon(${left}px ${top}px, ${right}px ${top}px, ${right}px ${bottom}px, ${left}px ${bottom}px)`;
  }, [elementPosition, targetElement]);

  const activeIssue = popoverIssueId ? issueById.get(popoverIssueId) : null;
  const activeContext = activeIssue ? issueContexts.get(activeIssue) : undefined;
  const activeSentenceText = activeContext?.sentence.coreText;
  const activeCorrectedSentence =
    activeContext && activeSentenceText
      ? correctedSentenceByIndex.get(activeContext.sentenceIndex)
      : undefined;
  const isPopoverOpen = Boolean(activeIssue && anchorRect);

  if (!elementPosition || issues.length === 0 || shiftedRects.size === 0) {
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
        activeSentenceRects.map((rect, index) => (
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
        const rects = shiftedRects.get(issueId);
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
