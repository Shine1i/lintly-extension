import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Issue } from "@/lib/types";
import type { ElementPosition, ScrollPosition } from "@/lib/hooks/useScrollSync";
import { getIssuePositions, getTextRangeRects } from "@/lib/textPositioning";
import {
  OCCLUSION_RECT_LIMIT,
  OCCLUSION_SCROLL_THRESHOLD,
  countRects,
  getOverflowAncestors,
  intersectBounds,
  rectIntersectsBounds,
  toLocalRects,
  toViewportRects,
  type ClipBounds,
  type RectBox,
  type ScrollBaseline,
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
  elementPosition,
  scrollPosition,
  layoutVersion,
}: UseIssueRectsOptions): UseIssueRectsResult {
  const [issueLocalRects, setIssueLocalRects] = useState<Map<string, RectBox[]>>(new Map());
  const issueRectsBaseScrollRef = useRef<ScrollBaseline>({ scrollTop: 0, scrollLeft: 0 });
  const [issueOccurrenceIndices, setIssueOccurrenceIndices] = useState<Map<string, number>>(
    new Map()
  );
  const [issueTextPositions, setIssueTextPositions] = useState<Map<string, number>>(new Map());
  const prevIssueIdsRef = useRef<Set<string>>(new Set());
  const [visibleRects, setVisibleRects] = useState<Map<string, RectBox[]>>(new Map());
  const lastOcclusionRef = useRef<{ scrollTop: number; scrollLeft: number; layoutVersion: number }>(
    { scrollTop: 0, scrollLeft: 0, layoutVersion: -1 }
  );
  const overflowAncestorsRef = useRef<HTMLElement[]>([]);
  const rectMeasureIdRef = useRef(0);
  const rectMeasureRafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!targetElement) {
      overflowAncestorsRef.current = [];
      return;
    }
    overflowAncestorsRef.current = getOverflowAncestors(targetElement);
  }, [targetElement, layoutVersion]);

  useEffect(() => {
    if (!targetElement || issues.length === 0) {
      setIssueOccurrenceIndices(new Map());
      setIssueTextPositions(new Map());
      prevIssueIdsRef.current = new Set();
      setIssueLocalRects(new Map());
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
      setIssueLocalRects((prev) => {
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
      setIssueLocalRects(new Map());
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
    const baseScrollTop = targetElement.scrollTop ?? 0;
    const baseScrollLeft = targetElement.scrollLeft ?? 0;
    issueRectsBaseScrollRef.current = {
      scrollTop: baseScrollTop,
      scrollLeft: baseScrollLeft,
    };

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
      setIssueLocalRects(new Map());
      return;
    }

    setIssueLocalRects((prev) => {
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
          batchRects.set(task.issueId, toLocalRects(rects, elementRect));
        }
        processed += 1;
      }

      if (batchRects.size > 0) {
        setIssueLocalRects((prev) => {
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

  const shiftedLocalRects = useMemo(() => {
    if (!isTyping || charDelta === 0 || issueLocalRects.size === 0) {
      return issueLocalRects;
    }

    const avgCharWidth = 8;
    const pixelShift = charDelta * avgCharWidth;

    const shifted = new Map<string, RectBox[]>();
    for (const [issueId, rects] of issueLocalRects.entries()) {
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
  }, [issueLocalRects, isTyping, charDelta, changePosition, issueTextPositions]);

  const clipBounds = useMemo<ClipBounds | null>(() => {
    if (!elementPosition || !targetElement) return null;

    const style = getComputedStyle(targetElement);
    const paddingTop = parseFloat(style.paddingTop) || 0;
    const paddingLeft = parseFloat(style.paddingLeft) || 0;
    const paddingRight = parseFloat(style.paddingRight) || 0;
    const paddingBottom = parseFloat(style.paddingBottom) || 0;
    const borderTop = parseFloat(style.borderTopWidth) || 0;
    const borderLeft = parseFloat(style.borderLeftWidth) || 0;
    const borderRight = parseFloat(style.borderRightWidth) || 0;
    const borderBottom = parseFloat(style.borderBottomWidth) || 0;

    let bounds: ClipBounds | null = {
      left: elementPosition.left + borderLeft + paddingLeft,
      top: elementPosition.top + borderTop + paddingTop,
      right: elementPosition.left + elementPosition.width - borderRight - paddingRight,
      bottom: elementPosition.top + elementPosition.height - borderBottom - paddingBottom,
    };

    const viewportBounds: ClipBounds = {
      left: 0,
      top: 0,
      right: window.innerWidth,
      bottom: window.innerHeight,
    };
    bounds = intersectBounds(bounds, viewportBounds);

    if (!bounds) return null;

    for (const ancestor of overflowAncestorsRef.current) {
      const rect = ancestor.getBoundingClientRect();
      const ancestorBounds: ClipBounds = {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
      };
      bounds = intersectBounds(bounds, ancestorBounds);
      if (!bounds) return null;
    }

    return bounds;
  }, [elementPosition, targetElement, layoutVersion]);

  const renderedRects = useMemo(() => {
    if (!elementPosition) {
      return new Map<string, RectBox[]>();
    }

    const baseScroll = issueRectsBaseScrollRef.current;
    const rendered = new Map<string, RectBox[]>();
    const bounds = clipBounds;

    for (const [issueId, rects] of shiftedLocalRects.entries()) {
      const viewportRects = toViewportRects(rects, elementPosition, baseScroll, scrollPosition);
      const filtered = bounds
        ? viewportRects.filter((rect) => rectIntersectsBounds(rect, bounds))
        : viewportRects;
      if (filtered.length > 0) {
        rendered.set(issueId, filtered);
      }
    }

    return rendered;
  }, [shiftedLocalRects, elementPosition, scrollPosition, clipBounds]);

  const totalRenderedRects = useMemo(() => countRects(renderedRects), [renderedRects]);
  const occlusionEnabled = totalRenderedRects > 0 && totalRenderedRects <= OCCLUSION_RECT_LIMIT;

  useEffect(() => {
    if (!elementPosition || renderedRects.size === 0) {
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
      const filtered = new Map<string, RectBox[]>();
      for (const [issueId, rects] of renderedRects.entries()) {
        const visible = rects.filter((rect) => {
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;
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
  }, [renderedRects, elementPosition, scrollPosition, layoutVersion, targetElement, occlusionEnabled]);

  const occlusionReady =
    occlusionEnabled && lastOcclusionRef.current.layoutVersion === layoutVersion;
  const displayRects = occlusionReady ? visibleRects : renderedRects;

  const removeIssueRects = useCallback((issueIds: Iterable<string>) => {
    setIssueLocalRects((prev) => {
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
