import type { SelectionRect } from "./types";
import { getTextareaSelectionRect } from "./mirror";
import { applyTextRangeToElement } from "./applyFix";
import { extractContentEditableText } from "./textNodes";

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
  // Use our unified extraction for contentEditable - guarantees text matches
  // the positions from buildTextNodeRanges (same DOM walk logic)
  return extractContentEditableText(element).text;
}

export type SelectionSnapshot =
  | {
      kind: "input";
      element: HTMLTextAreaElement | HTMLInputElement;
      start: number;
      end: number;
    }
  | {
      kind: "contentEditable";
      element: HTMLElement;
      range: Range;
    };

function findContentEditableAncestor(node: Node | null): HTMLElement | null {
  let current: HTMLElement | null =
    node instanceof HTMLElement ? node : node?.parentElement ?? null;
  while (current) {
    if (current.isContentEditable) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

export function captureSelectionSnapshot(activeElement?: Element | null): SelectionSnapshot | null {
  if (activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLInputElement) {
    const start = activeElement.selectionStart;
    const end = activeElement.selectionEnd;
    if (start === null || end === null) {
      return null;
    }
    return {
      kind: "input",
      element: activeElement,
      start,
      end,
    };
  }

  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return null;
  }

  const range = selection.getRangeAt(0).cloneRange();
  const element =
    activeElement instanceof HTMLElement && activeElement.isContentEditable
      ? activeElement
      : findContentEditableAncestor(range.commonAncestorContainer);

  if (!element || !element.isContentEditable) {
    return null;
  }

  return {
    kind: "contentEditable",
    element,
    range,
  };
}

export function applySelectionSnapshot(
  snapshot: SelectionSnapshot | null,
  replacement: string
): boolean {
  if (!snapshot) {
    return false;
  }

  if (snapshot.kind === "input") {
    if (!snapshot.element.isConnected) {
      return false;
    }
    return applyTextRangeToElement(
      snapshot.element,
      snapshot.start,
      snapshot.end,
      replacement
    );
  }

  if (!snapshot.element.isConnected || !snapshot.element.isContentEditable) {
    return false;
  }

  const range = snapshot.range.cloneRange();
  if (
    !snapshot.element.contains(range.startContainer) ||
    !snapshot.element.contains(range.endContainer)
  ) {
    return false;
  }

  snapshot.element.focus();
  const selection = window.getSelection();
  if (!selection) {
    return false;
  }

  selection.removeAllRanges();
  selection.addRange(range);

  const success = document.execCommand("insertText", false, replacement);
  if (!success) {
    range.deleteContents();
    range.insertNode(document.createTextNode(replacement));
    snapshot.element.dispatchEvent(new Event("input", { bubbles: true }));
  }

  return true;
}
