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
  if (startIndex >= endIndex) return [];

  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return getTextareaTextRects(element, startIndex, endIndex, elementRect);
  }

  return getTextNodeRangeRects(element, startIndex, endIndex);
}
