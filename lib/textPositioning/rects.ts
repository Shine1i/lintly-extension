import { getTextareaTextRects } from "./mirror";
import { buildTextNodeRanges } from "./textNodes";

function getTextNodeRangeRects(
  element: HTMLElement,
  startIndex: number,
  endIndex: number
): DOMRect[] {
  if (startIndex >= endIndex) return [];

  const textNodes = buildTextNodeRanges(element);
  const rects: DOMRect[] = [];

  for (const textNode of textNodes) {
    if (textNode.end <= startIndex || textNode.start >= endIndex) {
      continue;
    }

    const nodeStart = Math.max(0, startIndex - textNode.start);
    const nodeEnd = Math.min(textNode.node.length, endIndex - textNode.start);

    if (nodeStart < nodeEnd) {
      const range = document.createRange();
      range.setStart(textNode.node, nodeStart);
      range.setEnd(textNode.node, nodeEnd);

      const clientRects = range.getClientRects();
      for (let i = 0; i < clientRects.length; i++) {
        rects.push(DOMRect.fromRect(clientRects[i]));
      }
    }
  }

  return rects;
}

export function getTextRangeRects(
  element: HTMLElement,
  startIndex: number,
  endIndex: number,
  elementRect?: DOMRectReadOnly
): DOMRect[] {
  if (startIndex > endIndex) return [];

  let rangeStart = startIndex;
  let rangeEnd = endIndex;

  if (rangeStart === rangeEnd) {
    const textLength =
      element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement
        ? (element as HTMLTextAreaElement | HTMLInputElement).value.length
        : element.textContent?.length ?? 0;
    if (textLength === 0) return [];
    if (rangeStart < textLength) {
      rangeEnd = rangeStart + 1;
    } else if (rangeStart > 0) {
      rangeStart = rangeStart - 1;
    } else {
      return [];
    }
  }

  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return getTextareaTextRects(element, rangeStart, rangeEnd, elementRect);
  }

  return getTextNodeRangeRects(element, rangeStart, rangeEnd);
}
