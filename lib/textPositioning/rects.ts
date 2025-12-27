import { getTextareaTextRects } from "./mirror";
import { extractContentEditableText } from "./textNodes";

function getTextNodeRangeRects(
  element: HTMLElement,
  startIndex: number,
  endIndex: number
): DOMRect[] {
  if (startIndex >= endIndex) return [];

  const { ranges: textNodes } = extractContentEditableText(element);
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
    const text =
      element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement
        ? (element as HTMLTextAreaElement | HTMLInputElement).value
        : extractContentEditableText(element).text;
    const textLength = text.length;
    if (textLength === 0 || rangeStart < 0 || rangeStart > textLength) return [];

    const prevChar = rangeStart > 0 ? text[rangeStart - 1] : "";
    const nextChar = rangeStart < textLength ? text[rangeStart] : "";

    if (prevChar && /\s/.test(prevChar)) {
      rangeStart -= 1;
    } else if (nextChar && /\s/.test(nextChar)) {
      rangeEnd = rangeStart + 1;
    } else if (rangeStart < textLength) {
      rangeEnd = rangeStart + 1;
    } else if (rangeStart > 0) {
      rangeStart -= 1;
    } else {
      return [];
    }
  }

  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return getTextareaTextRects(element, rangeStart, rangeEnd, elementRect);
  }

  return getTextNodeRangeRects(element, rangeStart, rangeEnd);
}
