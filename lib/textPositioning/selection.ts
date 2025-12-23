import type { SelectionRect } from "./types";
import { getTextareaSelectionRect } from "./mirror";

export function getSelectionRect(activeElement?: Element | null): SelectionRect | null {
  if (activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLInputElement) {
    const rect = getTextareaSelectionRect(activeElement);
    if (rect) {
      return rect;
    }
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0);
  const rects = range.getClientRects();

  if (rects.length > 0) {
    const r = rects[0];
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }

  const r = range.getBoundingClientRect();
  if (r.width > 0) {
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }

  return null;
}

export function getElementText(element: HTMLElement): string {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return element.value;
  }
  return element.textContent || "";
}
