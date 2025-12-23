import { useEffect, useRef, useCallback, useState } from "react";
import {
  buildStyleSignature,
  findScrollAncestors,
  MIN_UPDATE_INTERVAL,
} from "./scrollSync/utils";

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

/** Page-relative position (document coordinates, not viewport) */
export interface PagePosition {
  pageTop: number;
  pageLeft: number;
  width: number;
  height: number;
}

interface UseScrollSyncReturn {
  /** Element's internal scroll position (for transform offset) */
  scrollPosition: ScrollPosition;
  /** Element's viewport position (legacy, kept for compatibility) */
  elementPosition: ElementPosition | null;
  /** Element's page position (document coordinates for absolute positioning) */
  pagePosition: PagePosition | null;
  layoutVersion: number;
  recalculate: () => void;
}

export function useScrollSync(
  targetElement: HTMLElement | null
): UseScrollSyncReturn {
  const [scrollPosition, setScrollPosition] = useState<ScrollPosition>({
    scrollTop: 0,
    scrollLeft: 0,
  });

  const [elementPosition, setElementPosition] = useState<ElementPosition | null>(null);
  const [pagePosition, setPagePosition] = useState<PagePosition | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);

  const rafRef = useRef<number | null>(null);
  const scrollAncestorsRef = useRef<HTMLElement[]>([]);
  const styleSignatureRef = useRef<string>("");
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mutationObserverRef = useRef<MutationObserver | null>(null);
  const domObserverRef = useRef<MutationObserver | null>(null);
  const headObserverRef = useRef<MutationObserver | null>(null);
  const intersectionObserverRef = useRef<IntersectionObserver | null>(null);
  const layoutChangeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastUpdateTimeRef = useRef<number>(0);
  const throttleDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setElementPositionFromRect = useCallback((rect: DOMRectReadOnly) => {
    setElementPosition({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    });
    // Also compute page position (document coordinates)
    setPagePosition({
      pageTop: rect.top + window.scrollY,
      pageLeft: rect.left + window.scrollX,
      width: rect.width,
      height: rect.height,
    });
  }, []);

  const markLayoutDirty = useCallback(
    (rect?: DOMRectReadOnly) => {
      if (rect) {
        setElementPositionFromRect(rect);
      } else {
        const nextRect = targetElement?.getBoundingClientRect();
        if (nextRect) {
          setElementPositionFromRect(nextRect);
        }
      }
      setLayoutVersion((version) => version + 1);
      lastUpdateTimeRef.current = Date.now();
    },
    [setElementPositionFromRect, targetElement]
  );

  const scheduleLayoutDirty = useCallback(
    (delayMs: number = 120) => {
      if (layoutChangeTimerRef.current) return;
      layoutChangeTimerRef.current = setTimeout(() => {
        layoutChangeTimerRef.current = null;
        markLayoutDirty();
      }, delayMs);
    },
    [markLayoutDirty]
  );
  const doUpdatePositions = useCallback(() => {
    if (!targetElement) return;

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

    const rect = targetElement.getBoundingClientRect();
    setElementPositionFromRect(rect);

    lastUpdateTimeRef.current = Date.now();
  }, [targetElement, setElementPositionFromRect]);

  const updatePositions = useCallback(() => {
    if (!targetElement) return;

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

    if (timeSinceLastUpdate >= MIN_UPDATE_INTERVAL) {
      rafRef.current = requestAnimationFrame(() => {
        doUpdatePositions();
        rafRef.current = null;
      });
    } else {
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

  useEffect(() => {
    if (!targetElement) {
      setElementPosition(null);
      setPagePosition(null);
      setScrollPosition({ scrollTop: 0, scrollLeft: 0 });
      setLayoutVersion(0);
      styleSignatureRef.current = "";
      if (layoutChangeTimerRef.current) {
        clearTimeout(layoutChangeTimerRef.current);
        layoutChangeTimerRef.current = null;
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      mutationObserverRef.current?.disconnect();
      mutationObserverRef.current = null;
      domObserverRef.current?.disconnect();
      domObserverRef.current = null;
      headObserverRef.current?.disconnect();
      headObserverRef.current = null;
      intersectionObserverRef.current?.disconnect();
      intersectionObserverRef.current = null;
      return;
    }

    updatePositions();

    scrollAncestorsRef.current = findScrollAncestors(targetElement);

    // Element scroll: updates internal scroll position for transform
    const handleElementScroll = () => updatePositions();

    // Ancestor scroll: updates page position (element moves within scrollable container)
    const handleAncestorScroll = () => updatePositions();

    targetElement.addEventListener("scroll", handleElementScroll, { passive: true });

    // NOTE: With absolute positioning, we don't need window/document scroll listeners.
    // The overlay container scrolls naturally with the page.
    // We only need ancestor scroll listeners for elements inside scrollable containers.

    // Window resize still matters for layout changes
    window.addEventListener("resize", handleAncestorScroll, { passive: true });

    // Ancestor scroll listeners - needed when element is inside a scrollable container
    for (const ancestor of scrollAncestorsRef.current) {
      ancestor.addEventListener("scroll", handleAncestorScroll, { passive: true });
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        markLayoutDirty(entry.contentRect);
      } else {
        markLayoutDirty();
      }
    });
    resizeObserver.observe(targetElement);

    if ("IntersectionObserver" in window) {
      intersectionObserverRef.current = new IntersectionObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        setElementPositionFromRect(entry.boundingClientRect);
        lastUpdateTimeRef.current = Date.now();
      });
      intersectionObserverRef.current.observe(targetElement);
    }

    const mutationObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          markLayoutDirty();
          break;
        }
      }
    });
    mutationObserverRef.current = mutationObserver;

    const attributeFilter = ["style", "class", "rows", "cols", "wrap", "contenteditable"];
    const observedNodes: Element[] = [];
    let current: Element | null = targetElement;
    while (current) {
      observedNodes.push(current);
      current = current.parentElement;
    }
    if (document.documentElement && !observedNodes.includes(document.documentElement)) {
      observedNodes.push(document.documentElement);
    }
    if (document.body && !observedNodes.includes(document.body)) {
      observedNodes.push(document.body);
    }

    for (const node of observedNodes) {
      mutationObserver.observe(node, { attributes: true, attributeFilter });
    }

    if (document.body) {
      const domObserver = new MutationObserver(() => {
        scheduleLayoutDirty(180);
      });
      domObserver.observe(document.body, { childList: true, subtree: true });
      domObserverRef.current = domObserver;
    }

    if (document.head) {
      const headObserver = new MutationObserver(() => {
        scheduleLayoutDirty(60);
      });
      headObserver.observe(document.head, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["media", "disabled", "href", "rel", "title"],
      });
      headObserverRef.current = headObserver;
    }

    const handleUserEvent = (event: Event) => {
      if (
        (event.type === "keydown" || event.type === "keyup") &&
        document.activeElement === targetElement
      ) {
        return;
      }
      scheduleLayoutDirty(120);
    };

    document.addEventListener("pointerdown", handleUserEvent, true);
    document.addEventListener("pointerup", handleUserEvent, true);
    document.addEventListener("keydown", handleUserEvent, true);
    document.addEventListener("keyup", handleUserEvent, true);

    const pollForLayout = () => {
      if (!document.contains(targetElement)) return;
      const rect = targetElement.getBoundingClientRect();
      const signature = buildStyleSignature(targetElement, rect);
      if (signature !== styleSignatureRef.current) {
        styleSignatureRef.current = signature;
        markLayoutDirty(rect);
      }
    };

    styleSignatureRef.current = buildStyleSignature(targetElement);
    pollTimerRef.current = setInterval(pollForLayout, 1000);

    let removeFontsListener: (() => void) | null = null;
    if (document.fonts?.addEventListener) {
      const onFontsLoaded = () => markLayoutDirty();
      document.fonts.addEventListener("loadingdone", onFontsLoaded);
      document.fonts.addEventListener("loadingerror", onFontsLoaded);
      removeFontsListener = () => {
        document.fonts.removeEventListener("loadingdone", onFontsLoaded);
        document.fonts.removeEventListener("loadingerror", onFontsLoaded);
      };
    }

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
      if (throttleDelayRef.current !== null) {
        clearTimeout(throttleDelayRef.current);
      }
      if (layoutChangeTimerRef.current) {
        clearTimeout(layoutChangeTimerRef.current);
        layoutChangeTimerRef.current = null;
      }
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      mutationObserverRef.current?.disconnect();
      mutationObserverRef.current = null;
      domObserverRef.current?.disconnect();
      domObserverRef.current = null;
      headObserverRef.current?.disconnect();
      headObserverRef.current = null;
      intersectionObserverRef.current?.disconnect();
      intersectionObserverRef.current = null;

      targetElement.removeEventListener("scroll", handleElementScroll);
      window.removeEventListener("resize", handleAncestorScroll);

      for (const ancestor of scrollAncestorsRef.current) {
        ancestor.removeEventListener("scroll", handleAncestorScroll);
      }

      resizeObserver.disconnect();

      removeFontsListener?.();

      document.removeEventListener("pointerdown", handleUserEvent, true);
      document.removeEventListener("pointerup", handleUserEvent, true);
      document.removeEventListener("keydown", handleUserEvent, true);
      document.removeEventListener("keyup", handleUserEvent, true);
    };
  }, [
    targetElement,
    updatePositions,
    markLayoutDirty,
    scheduleLayoutDirty,
    setElementPositionFromRect,
  ]);

  return {
    scrollPosition,
    elementPosition,
    pagePosition,
    layoutVersion,
    recalculate: updatePositions,
  };
}
