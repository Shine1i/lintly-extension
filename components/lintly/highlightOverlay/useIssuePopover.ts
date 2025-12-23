import { useCallback, useEffect, useRef, useState } from "react";
import type { Issue } from "@/lib/types";
import type { RectBox } from "./geometry";

interface UseIssuePopoverOptions {
  displayRects: Map<string, RectBox[]>;
  issueById: Map<string, Issue>;
  issuesCount: number;
  targetElement: HTMLElement | null;
  onHoverIssueChange: (issueId: string | null) => void;
}

interface UseIssuePopoverResult {
  popoverIssueId: string | null;
  anchorRect: DOMRect | null;
  handlePopoverHoverChange: (isHovering: boolean) => void;
  handlePopoverOpenChange: (open: boolean) => void;
}

export function useIssuePopover({
  displayRects,
  issueById,
  issuesCount,
  targetElement,
  onHoverIssueChange,
}: UseIssuePopoverOptions): UseIssuePopoverResult {
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

  const setHoveredIssueId = useCallback(
    (nextId: string | null) => {
      if (hoveredIssueIdRef.current === nextId) {
        return;
      }
      hoveredIssueIdRef.current = nextId;
      onHoverIssueChange(nextId);
    },
    [onHoverIssueChange]
  );

  const closePopoverAndHover = useCallback(() => {
    setPopoverIssueId(null);
    setAnchorRect(null);
    setHoveredIssueId(null);
  }, [setHoveredIssueId]);

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
      for (const [issueId, rects] of displayRects.entries()) {
        for (const rect of rects) {
          const right = rect.left + rect.width;
          const bottom = rect.top + rect.height;
          if (x >= rect.left && x <= right && y >= rect.top && y <= bottom) {
            return { issueId, rect: DOMRect.fromRect(rect) };
          }
        }
      }
      return null;
    },
    [displayRects]
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
    if (!targetElement || issuesCount === 0) {
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
  }, [targetElement, issuesCount, clearOpenTimeout, clearCloseTimeout]);

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

  return {
    popoverIssueId,
    anchorRect,
    handlePopoverHoverChange,
    handlePopoverOpenChange,
  };
}
