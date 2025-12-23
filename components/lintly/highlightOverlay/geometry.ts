import type { ElementPosition, ScrollPosition } from "@/lib/hooks/useScrollSync";

export type RectBox = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export type ScrollBaseline = {
  scrollTop: number;
  scrollLeft: number;
};

export type ClipBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type PagePosition = {
  pageTop: number;
  pageLeft: number;
  width: number;
  height: number;
};

export const OCCLUSION_RECT_LIMIT = 120;
export const OCCLUSION_SCROLL_THRESHOLD = 32;

/**
 * Get element's position in page coordinates (relative to document, not viewport).
 * These coordinates are stable during page scroll - the overlay container uses
 * position:absolute with these values to scroll naturally with the page.
 */
export function getPagePosition(element: HTMLElement): PagePosition {
  const rect = element.getBoundingClientRect();
  return {
    pageTop: rect.top + window.scrollY,
    pageLeft: rect.left + window.scrollX,
    width: rect.width,
    height: rect.height,
  };
}

/**
 * Compute clip bounds in local (element-relative) coordinates.
 * Used to filter highlights that are outside the visible scrollable area.
 */
export function getLocalClipBounds(
  element: HTMLElement,
  scrollPosition: ScrollPosition
): ClipBounds {
  const style = getComputedStyle(element);
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingRight = parseFloat(style.paddingRight) || 0;
  const paddingBottom = parseFloat(style.paddingBottom) || 0;
  const borderTop = parseFloat(style.borderTopWidth) || 0;
  const borderLeft = parseFloat(style.borderLeftWidth) || 0;
  const borderRight = parseFloat(style.borderRightWidth) || 0;
  const borderBottom = parseFloat(style.borderBottomWidth) || 0;

  // Visible area in local coordinates (accounting for element's internal scroll)
  const visibleLeft = scrollPosition.scrollLeft + paddingLeft;
  const visibleTop = scrollPosition.scrollTop + paddingTop;
  const visibleRight =
    scrollPosition.scrollLeft +
    element.clientWidth -
    borderLeft -
    borderRight -
    paddingRight;
  const visibleBottom =
    scrollPosition.scrollTop +
    element.clientHeight -
    borderTop -
    borderBottom -
    paddingBottom;

  return {
    left: visibleLeft,
    top: visibleTop,
    right: visibleRight,
    bottom: visibleBottom,
  };
}

export function toLocalRects(rects: DOMRect[], elementRect: DOMRect): RectBox[] {
  return rects.map((rect) => ({
    left: rect.left - elementRect.left,
    top: rect.top - elementRect.top,
    width: rect.width,
    height: rect.height,
  }));
}

export function toViewportRects(
  rects: RectBox[],
  elementPosition: ElementPosition,
  baseScroll: ScrollBaseline,
  currentScroll: ScrollPosition
): RectBox[] {
  const deltaLeft = baseScroll.scrollLeft - currentScroll.scrollLeft;
  const deltaTop = baseScroll.scrollTop - currentScroll.scrollTop;

  return rects.map((rect) => ({
    left: elementPosition.left + rect.left + deltaLeft,
    top: elementPosition.top + rect.top + deltaTop,
    width: rect.width,
    height: rect.height,
  }));
}

export function getOverflowAncestors(element: HTMLElement): HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  let parent = element.parentElement;

  while (parent) {
    const style = getComputedStyle(parent);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const shouldClip =
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay" ||
      overflowY === "hidden" ||
      overflowY === "clip" ||
      overflowX === "auto" ||
      overflowX === "scroll" ||
      overflowX === "overlay" ||
      overflowX === "hidden" ||
      overflowX === "clip";

    if (shouldClip) {
      ancestors.push(parent);
    }

    parent = parent.parentElement;
  }

  return ancestors;
}

export function intersectBounds(bounds: ClipBounds, rect: ClipBounds): ClipBounds | null {
  const left = Math.max(bounds.left, rect.left);
  const right = Math.min(bounds.right, rect.right);
  const top = Math.max(bounds.top, rect.top);
  const bottom = Math.min(bounds.bottom, rect.bottom);

  if (right <= left || bottom <= top) {
    return null;
  }

  return { left, right, top, bottom };
}

export function rectIntersectsBounds(rect: RectBox, bounds: ClipBounds): boolean {
  const right = rect.left + rect.width;
  const bottom = rect.top + rect.height;
  return !(
    right <= bounds.left ||
    rect.left >= bounds.right ||
    bottom <= bounds.top ||
    rect.top >= bounds.bottom
  );
}

export function countRects(rects: Map<string, RectBox[]>): number {
  let total = 0;
  for (const values of rects.values()) {
    total += values.length;
  }
  return total;
}
