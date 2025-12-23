import { useEffect, useRef, useCallback, useState } from "react";

export interface ScrollPosition {
  scrollTop: number;
  scrollLeft: number;
}

export interface ElementPosition {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface UseScrollSyncReturn {
  scrollPosition: ScrollPosition;
  elementPosition: ElementPosition | null;
  recalculate: () => void;
}

/**
 * Hook to synchronize scroll position and element bounds with a target element
 * Updates on scroll, resize, and ancestor scroll
 */
export function useScrollSync(
  targetElement: HTMLElement | null
): UseScrollSyncReturn {
  const [scrollPosition, setScrollPosition] = useState<ScrollPosition>({
    scrollTop: 0,
    scrollLeft: 0,
  });

  const [elementPosition, setElementPosition] = useState<ElementPosition | null>(null);

  const rafRef = useRef<number | null>(null);
  const scrollAncestorsRef = useRef<HTMLElement[]>([]);
  // Throttle state for aggressive throttling during rapid updates
  const lastUpdateTimeRef = useRef<number>(0);
  const throttleDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Minimum time between expensive getBoundingClientRect calls (ms)
  const MIN_UPDATE_INTERVAL = 50;

  // Perform the actual position update
  const doUpdatePositions = useCallback(() => {
    if (!targetElement) return;

    // Get scroll position from element (cheap operation)
    const scrollTop =
      targetElement instanceof HTMLTextAreaElement ||
      targetElement instanceof HTMLInputElement
        ? targetElement.scrollTop
        : targetElement.scrollTop;

    const scrollLeft =
      targetElement instanceof HTMLTextAreaElement ||
      targetElement instanceof HTMLInputElement
        ? targetElement.scrollLeft
        : targetElement.scrollLeft;

    setScrollPosition({ scrollTop, scrollLeft });

    // Get element position (expensive - involves layout)
    const rect = targetElement.getBoundingClientRect();
    setElementPosition({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });

    lastUpdateTimeRef.current = Date.now();
  }, [targetElement]);

  // Throttled update function - defers expensive queries during rapid updates
  const updatePositions = useCallback(() => {
    if (!targetElement) return;

    // Cancel any pending updates
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (throttleDelayRef.current !== null) {
      clearTimeout(throttleDelayRef.current);
      throttleDelayRef.current = null;
    }

    const now = Date.now();
    const timeSinceLastUpdate = now - lastUpdateTimeRef.current;

    // If enough time has passed, update immediately in next frame
    if (timeSinceLastUpdate >= MIN_UPDATE_INTERVAL) {
      rafRef.current = requestAnimationFrame(() => {
        doUpdatePositions();
        rafRef.current = null;
      });
    } else {
      // Otherwise, schedule update after the throttle period
      // This prevents expensive getBoundingClientRect calls during rapid typing
      const delay = MIN_UPDATE_INTERVAL - timeSinceLastUpdate;
      throttleDelayRef.current = setTimeout(() => {
        rafRef.current = requestAnimationFrame(() => {
          doUpdatePositions();
          rafRef.current = null;
        });
        throttleDelayRef.current = null;
      }, delay);
    }
  }, [targetElement, doUpdatePositions]);

  // Find all scrollable ancestors
  const findScrollAncestors = useCallback((element: HTMLElement): HTMLElement[] => {
    const ancestors: HTMLElement[] = [];
    let parent = element.parentElement;

    while (parent) {
      const style = getComputedStyle(parent);
      const overflowY = style.overflowY;
      const overflowX = style.overflowX;

      if (
        overflowY === "auto" ||
        overflowY === "scroll" ||
        overflowX === "auto" ||
        overflowX === "scroll"
      ) {
        ancestors.push(parent);
      }

      parent = parent.parentElement;
    }

    return ancestors;
  }, []);

  // Set up scroll listeners
  useEffect(() => {
    if (!targetElement) {
      setElementPosition(null);
      setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
      return;
    }

    // Initial update
    updatePositions();

    // Find scroll ancestors
    scrollAncestorsRef.current = findScrollAncestors(targetElement);

    // Scroll handler
    const handleScroll = () => updatePositions();

    // Add listeners
    targetElement.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("resize", handleScroll, { passive: true });

    // Add listeners to scroll ancestors
    for (const ancestor of scrollAncestorsRef.current) {
      ancestor.addEventListener("scroll", handleScroll, { passive: true });
    }

    // Resize observer for element size changes
    const resizeObserver = new ResizeObserver(handleScroll);
    resizeObserver.observe(targetElement);

    // Cleanup
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      if (throttleDelayRef.current !== null) {
        clearTimeout(throttleDelayRef.current);
      }

      targetElement.removeEventListener("scroll", handleScroll);
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("resize", handleScroll);

      for (const ancestor of scrollAncestorsRef.current) {
        ancestor.removeEventListener("scroll", handleScroll);
      }

      resizeObserver.disconnect();
    };
  }, [targetElement, updatePositions, findScrollAncestors]);

  return {
    scrollPosition,
    elementPosition,
    recalculate: updatePositions,
  };
}
