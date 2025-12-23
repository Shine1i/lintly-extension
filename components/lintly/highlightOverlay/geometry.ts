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

export const OCCLUSION_RECT_LIMIT = 120;
export const OCCLUSION_SCROLL_THRESHOLD = 32;

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
