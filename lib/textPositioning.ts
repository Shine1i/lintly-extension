import type { Issue } from "./types";

export interface SelectionRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface IssueRect {
  issue: Issue;
  rects: DOMRect[];
}

/**
 * Cached mirror div for performance - reused instead of create/destroy
 */
let cachedMirror: HTMLDivElement | null = null;
let cachedMirrorElement: HTMLElement | null = null;

/**
 * CSS properties to copy for accurate text measurement
 * Comprehensive list to match browser text rendering exactly
 */
const MIRROR_STYLES = [
  // Font properties
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "fontStretch",
  "fontKerning",
  // Text layout
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "textTransform",
  "textIndent",
  "textRendering",
  // Word/line breaking
  "wordBreak",
  "wordWrap",
  "overflowWrap",
  "whiteSpace",
  "tabSize",
  "hyphens",
  // Alignment and direction
  "textAlign",
  "direction",
  "unicodeBidi",
  // Box model
  "boxSizing",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
] as const;

/**
 * Get or create a cached mirror div that matches the target element's text rendering
 * Reuses the same div for performance, only recreating if element changes
 */
function getMirrorDiv(element: HTMLElement): HTMLDivElement {
  const rect = element.getBoundingClientRect();

  // Reuse cached mirror if same element
  if (cachedMirror && cachedMirrorElement === element) {
    // Just update position (element may have moved)
    cachedMirror.style.left = `${rect.left}px`;
    cachedMirror.style.top = `${rect.top}px`;
    cachedMirror.style.width = `${rect.width}px`;
    return cachedMirror;
  }

  // Create new mirror or update for different element
  if (!cachedMirror) {
    cachedMirror = document.createElement("div");
    cachedMirror.style.position = "fixed";
    cachedMirror.style.visibility = "hidden";
    cachedMirror.style.pointerEvents = "none";
    cachedMirror.style.overflow = "hidden";
    cachedMirror.style.zIndex = "-9999";
  }

  const computed = window.getComputedStyle(element);

  // Position mirror at exact same location as element for subpixel accuracy
  cachedMirror.style.left = `${rect.left}px`;
  cachedMirror.style.top = `${rect.top}px`;
  cachedMirror.style.width = `${rect.width}px`;

  // Copy all relevant styles
  for (const prop of MIRROR_STYLES) {
    const cssKey = prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
    cachedMirror.style.setProperty(cssKey, computed.getPropertyValue(cssKey));
  }

  // Respect the element's actual white-space and wrap behavior
  if (element instanceof HTMLInputElement) {
    cachedMirror.style.whiteSpace = "pre";
    cachedMirror.style.wordWrap = "normal";
    cachedMirror.style.overflowWrap = "normal";
  } else if (element instanceof HTMLTextAreaElement) {
    const wrap = element.getAttribute("wrap");
    if (wrap === "off") {
      cachedMirror.style.whiteSpace = "pre";
      cachedMirror.style.wordWrap = "normal";
    } else {
      cachedMirror.style.whiteSpace = "pre-wrap";
      cachedMirror.style.wordWrap = "break-word";
    }
  } else {
    cachedMirror.style.whiteSpace = computed.whiteSpace || "pre-wrap";
    cachedMirror.style.wordWrap = computed.wordWrap || "break-word";
  }

  cachedMirror.style.borderColor = "transparent";
  cachedMirrorElement = element;

  return cachedMirror;
}

/**
 * Clean up cached mirror when no longer needed
 */
export function cleanupMirrorCache(): void {
  if (cachedMirror && cachedMirror.parentNode) {
    cachedMirror.parentNode.removeChild(cachedMirror);
  }
  cachedMirror = null;
  cachedMirrorElement = null;
}

/**
 * Escape HTML characters to safely insert text into mirror div
 * Note: We don't convert spaces to &nbsp; as that can cause width differences
 * Instead we rely on white-space: pre-wrap to preserve spaces
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

/**
 * Get selection rectangle for textarea/input elements using mirror div technique
 */
export function getTextareaSelectionRect(
  element: HTMLTextAreaElement | HTMLInputElement
): SelectionRect | null {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? 0;
  if (start === end) return null;

  const mirror = getMirrorDiv(element);
  const elementRect = element.getBoundingClientRect();

  const value = element.value;
  const before = value.slice(0, start);
  const selected = value.slice(start, end);

  mirror.innerHTML =
    escapeHtml(before) +
    '<span id="lintly-sel-marker">' +
    escapeHtml(selected) +
    "</span>";

  // Append only if not already in DOM
  if (!mirror.parentNode) {
    document.body.appendChild(mirror);
  }

  const marker = mirror.querySelector("#lintly-sel-marker");
  if (!marker) {
    return null;
  }

  const markerRect = marker.getBoundingClientRect();
  const mirrorRect = mirror.getBoundingClientRect();

  const scrollTop = element.scrollTop;
  const scrollLeft = element.scrollLeft;

  const rect: SelectionRect = {
    top: elementRect.top + (markerRect.top - mirrorRect.top) - scrollTop,
    bottom: elementRect.top + (markerRect.bottom - mirrorRect.top) - scrollTop,
    left: elementRect.left + (markerRect.left - mirrorRect.left) - scrollLeft,
    right: elementRect.left + (markerRect.right - mirrorRect.left) - scrollLeft,
  };

  // Don't remove - mirror is cached for reuse
  return rect;
}

/**
 * Find all non-overlapping occurrences of a substring in text
 * Steps by searchText.length to avoid overlapping matches
 */
export function findAllOccurrences(text: string, searchText: string): number[] {
  const indices: number[] = [];
  const step = Math.max(1, searchText.length);
  let index = 0;
  while ((index = text.indexOf(searchText, index)) !== -1) {
    indices.push(index);
    index += step; // Move past this occurrence to find next (non-overlapping)
  }
  return indices;
}

/**
 * Get rects for a specific text range in a textarea/input using mirror div
 */
function getTextareaTextRects(
  element: HTMLTextAreaElement | HTMLInputElement,
  startIndex: number,
  endIndex: number
): DOMRect[] {
  const mirror = getMirrorDiv(element);
  const elementRect = element.getBoundingClientRect();

  const value = element.value;
  const before = value.slice(0, startIndex);
  const target = value.slice(startIndex, endIndex);
  const after = value.slice(endIndex);

  // Create markers for measurement
  mirror.innerHTML =
    escapeHtml(before) +
    '<span class="lintly-measure-target">' +
    escapeHtml(target) +
    "</span>" +
    escapeHtml(after);

  // Append only if not already in DOM
  if (!mirror.parentNode) {
    document.body.appendChild(mirror);
  }

  const targetSpan = mirror.querySelector(".lintly-measure-target");
  if (!targetSpan) {
    return [];
  }

  // Get all rects (handles multi-line text)
  const range = document.createRange();
  range.selectNodeContents(targetSpan);
  const clientRects = range.getClientRects();

  const mirrorRect = mirror.getBoundingClientRect();
  const scrollTop = element.scrollTop;
  const scrollLeft = element.scrollLeft;

  const rects: DOMRect[] = [];
  for (let i = 0; i < clientRects.length; i++) {
    const r = clientRects[i];

    // Calculate position relative to the element's content area
    const left = r.left - mirrorRect.left + elementRect.left - scrollLeft;
    const top = r.top - mirrorRect.top + elementRect.top - scrollTop;

    const adjustedRect = new DOMRect(
      left,
      top,
      r.width,
      r.height
    );
    rects.push(adjustedRect);
  }

  // Don't remove - mirror is cached for reuse
  return rects;
}

/**
 * Get rects for text in a contenteditable element using Range API
 * Handles text that may span multiple nodes
 */
function getContentEditableTextRects(
  element: HTMLElement,
  searchText: string,
  occurrenceIndex: number = 0
): DOMRect[] {
  // Get all text content and build a map of positions to nodes
  const textNodes: { node: Text; start: number; end: number }[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  let currentPos = 0;
  let node: Text | null;

  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent || "";
    textNodes.push({
      node,
      start: currentPos,
      end: currentPos + text.length,
    });
    currentPos += text.length;
  }

  // Get full text content
  const fullText = element.textContent || "";

  // Find the specific occurrence
  const occurrences = findAllOccurrences(fullText, searchText);
  if (occurrenceIndex >= occurrences.length) {
    return [];
  }

  const matchStart = occurrences[occurrenceIndex];
  const matchEnd = matchStart + searchText.length;

  // Find which nodes contain this range
  const rects: DOMRect[] = [];

  for (const textNode of textNodes) {
    // Check if this node overlaps with our match
    if (textNode.end <= matchStart || textNode.start >= matchEnd) {
      continue; // No overlap
    }

    // Calculate the overlap within this node
    const nodeStart = Math.max(0, matchStart - textNode.start);
    const nodeEnd = Math.min(textNode.node.length, matchEnd - textNode.start);

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

/**
 * Get rects for a specific text range in a content element (contenteditable or static).
 */
function getTextNodeRangeRects(
  element: HTMLElement,
  startIndex: number,
  endIndex: number
): DOMRect[] {
  if (startIndex >= endIndex) return [];

  const textNodes: { node: Text; start: number; end: number }[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  let currentPos = 0;
  let node: Text | null;

  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent || "";
    textNodes.push({
      node,
      start: currentPos,
      end: currentPos + text.length,
    });
    currentPos += text.length;
  }

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

/**
 * Get rects for a specific text range in any element type.
 */
export function getTextRangeRects(
  element: HTMLElement,
  startIndex: number,
  endIndex: number
): DOMRect[] {
  if (startIndex >= endIndex) return [];

  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return getTextareaTextRects(element, startIndex, endIndex);
  }

  return getTextNodeRangeRects(element, startIndex, endIndex);
}

/**
 * Sort issues by their first occurrence position in text
 * Returns a new array with the same issues sorted by text position
 * Issues with the same original text are sorted by their order in the input array
 */
export function sortIssuesByTextPosition(
  text: string,
  issues: Issue[]
): Issue[] {
  // Build position map: for each issue, find its assigned occurrence position
  const positionMap = new Map<Issue, number>();
  const occurrenceCounts = new Map<string, number>();

  for (const issue of issues) {
    const searchText = issue.original;
    if (!searchText) {
      positionMap.set(issue, Infinity);
      continue;
    }

    const occurrences = findAllOccurrences(text, searchText);
    const occurrenceIndex = occurrenceCounts.get(searchText) || 0;
    occurrenceCounts.set(searchText, occurrenceIndex + 1);

    if (occurrenceIndex < occurrences.length) {
      positionMap.set(issue, occurrences[occurrenceIndex]);
    } else {
      positionMap.set(issue, Infinity);
    }
  }

  // Sort by position, preserving original order for ties
  return [...issues].sort((a, b) => {
    const posA = positionMap.get(a) ?? Infinity;
    const posB = positionMap.get(b) ?? Infinity;
    if (posA !== posB) return posA - posB;
    // Preserve original order for same position
    return issues.indexOf(a) - issues.indexOf(b);
  });
}

export interface IssuePosition {
  issue: Issue;
  start: number;
  end: number;
  occurrenceIndex: number;
}

/**
 * Get start/end positions for each issue, using text-order occurrence indexing.
 */
export function getIssuePositions(text: string, issues: Issue[]): IssuePosition[] {
  const sortedIssues = sortIssuesByTextPosition(text, issues);
  const occurrenceCounts = new Map<string, number>();
  const occurrencesByText = new Map<string, number[]>();
  const positions: IssuePosition[] = [];

  for (const issue of sortedIssues) {
    const searchText = issue.original;
    const occurrenceIndex = occurrenceCounts.get(searchText) || 0;
    occurrenceCounts.set(searchText, occurrenceIndex + 1);

    if (!searchText) {
      positions.push({ issue, start: -1, end: -1, occurrenceIndex });
      continue;
    }

    const occurrences =
      occurrencesByText.get(searchText) || findAllOccurrences(text, searchText);
    occurrencesByText.set(searchText, occurrences);

    if (occurrenceIndex < occurrences.length) {
      const start = occurrences[occurrenceIndex];
      positions.push({
        issue,
        start,
        end: start + searchText.length,
        occurrenceIndex,
      });
    } else {
      positions.push({ issue, start: -1, end: -1, occurrenceIndex });
    }
  }

  return positions;
}

/**
 * Get rectangles for all issues in an element
 * Returns a Map where each issue is mapped to its display rectangles
 * Handles multiple identical issues by tracking occurrence indices
 * Issues are processed in text-order to ensure correct occurrence mapping
 */
export function getIssueRects(
  element: HTMLElement,
  issues: Issue[]
): Map<Issue, DOMRect[]> {
  const result = new Map<Issue, DOMRect[]>();

  if (!element || issues.length === 0) {
    return result;
  }

  const isTextInput =
    element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement;
  const isContentEditable = element.isContentEditable;

  if (!isTextInput && !isContentEditable) {
    return result;
  }

  // Get element text for sorting
  const elementText = isTextInput
    ? (element as HTMLTextAreaElement | HTMLInputElement).value
    : element.textContent || "";

  // Sort issues by text position to ensure correct occurrence mapping
  const sortedIssues = sortIssuesByTextPosition(elementText, issues);

  // Track occurrence counts for each unique original text
  const occurrenceCounts = new Map<string, number>();

  for (const issue of sortedIssues) {
    const searchText = issue.original;
    if (!searchText) continue;

    // Get which occurrence this is (0-indexed)
    const occurrenceIndex = occurrenceCounts.get(searchText) || 0;
    occurrenceCounts.set(searchText, occurrenceIndex + 1);

    let rects: DOMRect[] = [];

    if (isTextInput) {
      const text = (element as HTMLTextAreaElement | HTMLInputElement).value;
      const occurrences = findAllOccurrences(text, searchText);

      if (occurrenceIndex < occurrences.length) {
        const index = occurrences[occurrenceIndex];
        rects = getTextareaTextRects(
          element as HTMLTextAreaElement | HTMLInputElement,
          index,
          index + searchText.length
        );
      }
    } else if (isContentEditable) {
      rects = getContentEditableTextRects(element, searchText, occurrenceIndex);
    }

    if (rects.length > 0) {
      result.set(issue, rects);
    }
  }

  return result;
}

/**
 * Get selection rectangle for any element type
 */
export function getSelectionRect(activeElement?: Element | null): SelectionRect | null {
  // Check if selection is in textarea/input
  if (activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLInputElement) {
    const rect = getTextareaSelectionRect(activeElement);
    if (rect) {
      return rect;
    }
  }

  // Regular DOM selection
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

/**
 * Get element text content
 */
export function getElementText(element: HTMLElement): string {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return element.value;
  }
  return element.textContent || "";
}

/**
 * Apply a fix to an element by replacing text at a specific occurrence
 */
export function applyFixToElement(
  element: HTMLElement,
  original: string,
  suggestion: string,
  occurrenceIndex: number = 0
): boolean {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const currentValue = element.value;
    const occurrences = findAllOccurrences(currentValue, original);

    if (occurrenceIndex >= occurrences.length) return false;

    const index = occurrences[occurrenceIndex];

    // Use native input methods for proper event dispatching
    element.focus();
    element.setSelectionRange(index, index + original.length);

    // Try execCommand first for better undo support
    const success = document.execCommand("insertText", false, suggestion);
    if (!success) {
      // Fallback: direct value modification
      element.value =
        currentValue.slice(0, index) +
        suggestion +
        currentValue.slice(index + original.length);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }

    return true;
  }

  if (element.isContentEditable) {
    // For contenteditable, use selection and execCommand
    const selection = window.getSelection();
    if (!selection) return false;

    // Get full text and find occurrence
    const fullText = element.textContent || "";
    const occurrences = findAllOccurrences(fullText, original);

    if (occurrenceIndex >= occurrences.length) return false;

    const matchStart = occurrences[occurrenceIndex];
    const matchEnd = matchStart + original.length;

    // Build text node map
    const textNodes: { node: Text; start: number; end: number }[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    let currentPos = 0;
    let node: Text | null;

    while ((node = walker.nextNode() as Text | null)) {
      const text = node.textContent || "";
      textNodes.push({
        node,
        start: currentPos,
        end: currentPos + text.length,
      });
      currentPos += text.length;
    }

    // Find nodes that contain the match
    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;

    for (const textNode of textNodes) {
      if (startNode === null && textNode.end > matchStart) {
        startNode = textNode.node;
        startOffset = matchStart - textNode.start;
      }
      if (textNode.end >= matchEnd) {
        endNode = textNode.node;
        endOffset = matchEnd - textNode.start;
        break;
      }
    }

    if (!startNode || !endNode) return false;

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    selection.removeAllRanges();
    selection.addRange(range);

    const success = document.execCommand("insertText", false, suggestion);
    if (!success) {
      // Fallback: delete and insert
      range.deleteContents();
      range.insertNode(document.createTextNode(suggestion));
      // Dispatch input event for frameworks that listen to it
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }

    return true;
  }

  return false;
}

/**
 * Apply a replacement to a specific text range inside an element.
 */
export function applyTextRangeToElement(
  element: HTMLElement,
  startIndex: number,
  endIndex: number,
  replacement: string
): boolean {
  if (startIndex >= endIndex) return false;

  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const currentValue = element.value;
    if (startIndex < 0 || startIndex > currentValue.length) return false;

    const safeEnd = Math.min(endIndex, currentValue.length);

    element.focus();
    element.setSelectionRange(startIndex, safeEnd);

    const success = document.execCommand("insertText", false, replacement);
    if (!success) {
      element.value =
        currentValue.slice(0, startIndex) +
        replacement +
        currentValue.slice(safeEnd);
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }

    return true;
  }

  if (element.isContentEditable) {
    const fullText = element.textContent || "";
    if (startIndex < 0 || startIndex > fullText.length) return false;

    const safeEnd = Math.min(endIndex, fullText.length);

    const textNodes: { node: Text; start: number; end: number }[] = [];
    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
    let currentPos = 0;
    let node: Text | null;

    while ((node = walker.nextNode() as Text | null)) {
      const text = node.textContent || "";
      textNodes.push({
        node,
        start: currentPos,
        end: currentPos + text.length,
      });
      currentPos += text.length;
    }

    let startNode: Text | null = null;
    let startOffset = 0;
    let endNode: Text | null = null;
    let endOffset = 0;

    for (const textNode of textNodes) {
      if (startNode === null && textNode.end > startIndex) {
        startNode = textNode.node;
        startOffset = startIndex - textNode.start;
      }
      if (textNode.end >= safeEnd) {
        endNode = textNode.node;
        endOffset = safeEnd - textNode.start;
        break;
      }
    }

    if (!startNode || !endNode) return false;

    const selection = window.getSelection();
    if (!selection) return false;

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);

    selection.removeAllRanges();
    selection.addRange(range);

    const success = document.execCommand("insertText", false, replacement);
    if (!success) {
      range.deleteContents();
      range.insertNode(document.createTextNode(replacement));
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }

    return true;
  }

  return false;
}
