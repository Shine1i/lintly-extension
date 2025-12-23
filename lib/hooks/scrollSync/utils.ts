export const MIN_UPDATE_INTERVAL = 50;

export function buildStyleSignature(
  element: HTMLElement,
  rect?: DOMRectReadOnly
): string {
  const style = getComputedStyle(element);
  const size = rect
    ? `${rect.width.toFixed(2)}x${rect.height.toFixed(2)}`
    : `${element.offsetWidth}x${element.offsetHeight}`;

  return [
    size,
    style.fontFamily,
    style.fontSize,
    style.fontWeight,
    style.fontStyle,
    style.fontVariant,
    style.lineHeight,
    style.letterSpacing,
    style.wordSpacing,
    style.textTransform,
    style.textAlign,
    style.direction,
    style.whiteSpace,
    style.wordBreak,
    style.overflowWrap,
    style.boxSizing,
    style.paddingTop,
    style.paddingRight,
    style.paddingBottom,
    style.paddingLeft,
    style.borderTopWidth,
    style.borderRightWidth,
    style.borderBottomWidth,
    style.borderLeftWidth,
  ].join("|");
}

export function findScrollAncestors(element: HTMLElement): HTMLElement[] {
  const ancestors: HTMLElement[] = [];
  let parent = element.parentElement;

  while (parent) {
    const style = getComputedStyle(parent);
    const overflowY = style.overflowY;
    const overflowX = style.overflowX;
    const isScrollable =
      overflowY === "auto" ||
      overflowY === "scroll" ||
      overflowY === "overlay" ||
      overflowX === "auto" ||
      overflowX === "scroll" ||
      overflowX === "overlay";

    if (isScrollable) {
      ancestors.push(parent);
    }

    parent = parent.parentElement;
  }

  return ancestors;
}
