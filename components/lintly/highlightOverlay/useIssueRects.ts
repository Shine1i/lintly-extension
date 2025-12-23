import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Issue } from "@/lib/types";
import type { ElementPosition, ScrollPosition } from "@/lib/hooks/useScrollSync";
import { getIssuePositions, getTextRangeRects } from "@/lib/textPositioning";
import {
  OCCLUSION_RECT_LIMIT,
  OCCLUSION_SCROLL_THRESHOLD,
  countRects,
  rectIntersectsBounds,
  toLocalRects,
  type ClipBounds,
  type RectBox,
} from "./geometry";

interface UseIssueRectsOptions {
  targetElement: HTMLElement | null;
  issues: Issue[];
  issueIdByIssue: Map<Issue, string>;
  elementText: string;
  isTyping: boolean;
  charDelta: number;
  changePosition: number;
  elementPosition: ElementPosition | null;
  scrollPosition: ScrollPosition;
  layoutVersion: number;
}

interface UseIssueRectsResult {
  displayRects: Map<string, RectBox[]>;
  clipBounds: ClipBounds | null;
  issueOccurrenceIndices: Map<string, number>;
  removeIssueRects: (issueIds: Iterable<string>) => void;
}

const RECT_TIME_BUDGET_MS = 6;
const RECT_MAX_PER_FRAME = 12;

export function useIssueRects({
  targetElement,
  issues,
  issueIdByIssue,
  elementText,
  isTyping,
  charDelta,
  changePosition,
  elementPosition: _elementPosition,
  scrollPosition,
  layoutVersion,
}: UseIssueRectsOptions): UseIssueRectsResult {
  // Content-relative rects (relative to element's full scrollable content, not visual area)
  const [issueContentRects, setIssueContentRects] = useState<Map<string, RectBox[]>>(new Map());
  const [issueOccurrenceIndices, setIssueOccurrenceIndices] = useState<Map<string, number>>(
    new Map()
  );
  const [issueTextPositions, setIssueTextPositions] = useState<Map<string, number>>(new Map());
  const prevIssueIdsRef = useRef<Set<string>>(new Set());
  const [visibleRects, setVisibleRects] = useState<Map<string, RectBox[]>>(new Map());
  const lastOcclusionRef = useRef<{ scrollTop: number; scrollLeft: number; layoutVersion: number }>(
    { scrollTop: 0, scrollLeft: 0, layoutVersion: -1 }
  );
  const rectMeasureIdRef = useRef(0);
  const rectMeasureRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!targetElement || issues.length === 0) {
      setIssueOccurrenceIndices(new Map());
      setIssueTextPositions(new Map());
      prevIssueIdsRef.current = new Set();
      setIssueContentRects(new Map());
      setVisibleRects(new Map());
      lastOcclusionRef.current = { scrollTop: 0, scrollLeft: 0, layoutVersion: -1 };
      return;
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

    const removedKeys = [...prevIssueIdsRef.current].filter((key) => !currentKeys.has(key));
    if (removedKeys.length > 0) {
      setIssueContentRects((prev) => {
        const next = new Map(prev);
        let changed = false;
        for (const key of removedKeys) {
          if (next.delete(key)) {
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }

    prevIssueIdsRef.current = currentKeys;
    setIssueOccurrenceIndices(occurrenceMap);
    setIssueTextPositions(positionMap);
    setVisibleRects(new Map());
    lastOcclusionRef.current = { scrollTop: 0, scrollLeft: 0, layoutVersion: -1 };
  }, [targetElement, issues, elementText, issueIdByIssue]);

  useEffect(() => {
    if (!targetElement || issues.length === 0) {
      setIssueContentRects(new Map());
      return;
    }

    if (isTyping) {
      return;
    }

    rectMeasureIdRef.current += 1;
    const measureId = rectMeasureIdRef.current;
    if (rectMeasureRafRef.current !== null) {
      cancelAnimationFrame(rectMeasureRafRef.current);
      rectMeasureRafRef.current = null;
    }

    const elementRect = targetElement.getBoundingClientRect();
    // Capture scroll position to convert visual coords to content coords
    const measureScrollTop = targetElement.scrollTop ?? 0;
    const measureScrollLeft = targetElement.scrollLeft ?? 0;

    const positions = getIssuePositions(elementText, issues);
    const pending: Array<{ issueId: string; start: number; end: number }> = [];
    const validIssueIds = new Set<string>();

    for (const pos of positions) {
      if (pos.start < 0 || pos.end <= pos.start) continue;
      const issueId = issueIdByIssue.get(pos.issue);
      if (!issueId) continue;
      validIssueIds.add(issueId);
      pending.push({ issueId, start: pos.start, end: pos.end });
    }

    if (pending.length === 0) {
      setIssueContentRects(new Map());
      return;
    }

    setIssueContentRects((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const key of next.keys()) {
        if (!validIssueIds.has(key)) {
          next.delete(key);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    const processBatch = () => {
      if (measureId !== rectMeasureIdRef.current) {
        return;
      }

      const start = performance.now();
      const batchRects = new Map<string, RectBox[]>();
      let processed = 0;

      while (
        pending.length > 0 &&
        processed < RECT_MAX_PER_FRAME &&
        performance.now() - start < RECT_TIME_BUDGET_MS
      ) {
        const task = pending.shift();
        if (!task) break;
        const rects = getTextRangeRects(
          targetElement,
          task.start,
          task.end,
          elementRect
        );
        if (rects.length > 0) {
          // Convert to content-relative coords (add scroll offset)
          // This gives us coordinates relative to the full scrollable content
          const localRects = toLocalRects(rects, elementRect);
          const contentRects = localRects.map((rect) => ({
            left: rect.left + measureScrollLeft,
            top: rect.top + measureScrollTop,
            width: rect.width,
            height: rect.height,
          }));
          batchRects.set(task.issueId, contentRects);
        }
        processed += 1;
      }

      if (batchRects.size > 0) {
        setIssueContentRects((prev) => {
          const next = new Map(prev);
          for (const [issueId, rects] of batchRects.entries()) {
            next.set(issueId, rects);
          }
          return next;
        });
      }

      if (pending.length > 0) {
        rectMeasureRafRef.current = requestAnimationFrame(processBatch);
      } else {
        rectMeasureRafRef.current = null;
      }
    };

    processBatch();

    return () => {
      if (rectMeasureRafRef.current !== null) {
        cancelAnimationFrame(rectMeasureRafRef.current);
        rectMeasureRafRef.current = null;
      }
    };
  }, [targetElement, issues, elementText, isTyping, issueIdByIssue, layoutVersion]);

  const shiftedContentRects = useMemo(() => {
    if (!isTyping || charDelta === 0 || issueContentRects.size === 0) {
      return issueContentRects;
    }

    const avgCharWidth = 8;
    const pixelShift = charDelta * avgCharWidth;

    const shifted = new Map<string, RectBox[]>();
    for (const [issueId, rects] of issueContentRects.entries()) {
      const textPos = issueTextPositions.get(issueId);
      if (textPos !== undefined && textPos >= changePosition) {
        const shiftedRectsArray = rects.map((rect) => ({
          left: rect.left + pixelShift,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        }));
        shifted.set(issueId, shiftedRectsArray);
      } else {
        shifted.set(issueId, rects);
      }
    }
    return shifted;
  }, [issueContentRects, isTyping, charDelta, changePosition, issueTextPositions]);

  // Clip bounds in content coordinates - represents the visible area of the element's content
  const clipBounds = useMemo<ClipBounds | null>(() => {
    if (!targetElement) return null;

    const style = getComputedStyle(targetElement);
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;

    // Visible content area in content coordinates
    // scrollPosition tells us which part of the content is visible
    const visibleContentLeft = scrollPosition.scrollLeft + paddingLeft;
    const visibleContentTop = scrollPosition.scrollTop + paddingTop;
    const visibleContentRight =
      scrollPosition.scrollLeft + targetElement.clientWidth - paddingRight;
    const visibleContentBottom =
      scrollPosition.scrollTop + targetElement.clientHeight - paddingBottom;

    return {
      left: visibleContentLeft,
      top: visibleContentTop,
      right: visibleContentRight,
      bottom: visibleContentBottom,
    };
  }, [targetElement, scrollPosition, layoutVersion]);

  // Rects in content coordinates, filtered by visible area
  const renderedRects = useMemo(() => {
    if (!targetElement) {
      return new Map<string, RectBox[]>();
    }

    const rendered = new Map<string, RectBox[]>();
    const bounds = clipBounds;

    for (const [issueId, rects] of shiftedContentRects.entries()) {
      // Filter to only rects that intersect the visible content area
      const filtered = bounds
        ? rects.filter((rect) => rectIntersectsBounds(rect, bounds))
        : rects;
      if (filtered.length > 0) {
        rendered.set(issueId, filtered);
      }
    }

    return rendered;
  }, [shiftedContentRects, targetElement, clipBounds]);

  const totalRenderedRects = useMemo(() => countRects(renderedRects), [renderedRects]);
  const occlusionEnabled = totalRenderedRects > 0 && totalRenderedRects <= OCCLUSION_RECT_LIMIT;

  useEffect(() => {
    if (!targetElement || renderedRects.size === 0) {
      setVisibleRects(new Map());
      return;
    }

    if (!occlusionEnabled) {
      setVisibleRects(renderedRects);
      return;
    }

    const last = lastOcclusionRef.current;
    const delta =
      Math.abs(scrollPosition.scrollTop - last.scrollTop) +
      Math.abs(scrollPosition.scrollLeft - last.scrollLeft);
    if (layoutVersion === last.layoutVersion && delta < OCCLUSION_SCROLL_THRESHOLD) {
      return;
    }

    const rafId = requestAnimationFrame(() => {
      // Get element position for converting content coords to viewport coords
      const elementRect = targetElement.getBoundingClientRect();

      const filtered = new Map<string, RectBox[]>();
      for (const [issueId, rects] of renderedRects.entries()) {
        const visible = rects.filter((rect) => {
          // Convert content coords to viewport coords for elementFromPoint
          const viewportLeft = elementRect.left + rect.left - scrollPosition.scrollLeft;
          const viewportTop = elementRect.top + rect.top - scrollPosition.scrollTop;
          const centerX = viewportLeft + rect.width / 2;
          const centerY = viewportTop + rect.height / 2;
          const hit = document.elementFromPoint(centerX, centerY);
          return Boolean(hit && targetElement?.contains(hit));
        });
        if (visible.length > 0) {
          filtered.set(issueId, visible);
        }
      }

      lastOcclusionRef.current = {
        scrollTop: scrollPosition.scrollTop,
        scrollLeft: scrollPosition.scrollLeft,
        layoutVersion,
      };
      setVisibleRects(filtered);
    });

    return () => cancelAnimationFrame(rafId);
  }, [renderedRects, scrollPosition, layoutVersion, targetElement, occlusionEnabled]);

  const occlusionReady =
    occlusionEnabled && lastOcclusionRef.current.layoutVersion === layoutVersion;
  const displayRects = occlusionReady ? visibleRects : renderedRects;

  const removeIssueRects = useCallback((issueIds: Iterable<string>) => {
    setIssueContentRects((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const issueId of issueIds) {
        if (next.delete(issueId)) {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  return { displayRects, clipBounds, issueOccurrenceIndices, removeIssueRects };
}
