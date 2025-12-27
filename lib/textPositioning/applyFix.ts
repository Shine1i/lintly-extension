import { findAllOccurrences } from "./occurrences";
import { isWordWebEditor, shouldAvoidDirectDomFallback } from "./editorDetection";
import { extractContentEditableText, resolveTextRangeNodes } from "./textNodes";

function replaceTextNodeRange(
  element: HTMLElement,
  node: Text,
  startOffset: number,
  endOffset: number,
  replacement: string,
  dispatchInput: boolean = true
): boolean {
  if (startOffset < 0 || endOffset < startOffset || endOffset > node.length) {
    return false;
  }
  node.replaceData(startOffset, endOffset - startOffset, replacement);
  if (dispatchInput) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
  }
  return true;
}

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
    const expectedValue =
      currentValue.slice(0, index) +
      suggestion +
      currentValue.slice(index + original.length);

    element.focus();
    element.setSelectionRange(index, index + original.length);

    // Use execCommand so undo stacks behave more naturally.
    const success = document.execCommand("insertText", false, suggestion);
    if (!success || element.value !== expectedValue) {
      element.value = expectedValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }

    return true;
  }

  if (element.isContentEditable) {
    if (isWordWebEditor(element)) {
      console.log("[Typix] Skipping edit for Word Web to avoid corruption");
      return false;
    }
    const selection = window.getSelection();
    if (!selection) return false;

    // Use unified extraction to guarantee text and ranges are aligned
    const { text: fullText, ranges: textNodes } = extractContentEditableText(element);
    const occurrences = findAllOccurrences(fullText, original);

    if (occurrenceIndex >= occurrences.length) return false;

    const matchStart = occurrences[occurrenceIndex];
    const matchEnd = matchStart + original.length;
    const originalText = fullText;
    const expectedText =
      fullText.slice(0, matchStart) + suggestion + fullText.slice(matchEnd);
    const avoidDirectFallback = shouldAvoidDirectDomFallback(element);
    const resolved = resolveTextRangeNodes(textNodes, matchStart, matchEnd);
    if (!resolved) return false;

    if (
      avoidDirectFallback &&
      resolved.startNode === resolved.endNode &&
      resolved.startNode.data.slice(resolved.startOffset, resolved.endOffset) ===
        originalText.slice(matchStart, matchEnd)
    ) {
      replaceTextNodeRange(
        element,
        resolved.startNode,
        resolved.startOffset,
        resolved.endOffset,
        suggestion
      );
      return extractContentEditableText(element).text === expectedText;
    }

    element.focus();
    const range = document.createRange();
    range.setStart(resolved.startNode, resolved.startOffset);
    range.setEnd(resolved.endNode, resolved.endOffset);

    selection.removeAllRanges();
    selection.addRange(range);

    const success = document.execCommand("insertText", false, suggestion);
    let nextText = extractContentEditableText(element).text;
    if (nextText === expectedText) return true;
    if (avoidDirectFallback) {
      if (nextText !== originalText) {
        document.execCommand("undo");
      }
      return false;
    }
    if (!success || nextText === originalText) {
      range.deleteContents();
      range.insertNode(document.createTextNode(suggestion));
      element.dispatchEvent(new Event("input", { bubbles: true }));
      nextText = extractContentEditableText(element).text;
    }

    if (nextText === expectedText) return true;
    if (nextText === originalText) return false;
    return true;
  }

  return false;
}

export interface TextRangeReplacement {
  startIndex: number;
  endIndex: number;
  replacement: string;
}

/**
 * Apply multiple text range replacements to a contentEditable element in a single batch.
 * Replacements should be sorted in descending order by startIndex to avoid position shifts.
 * Only dispatches a single input event after all replacements are done.
 */
export function applyBatchTextRangeToElement(
  element: HTMLElement,
  replacements: TextRangeReplacement[]
): boolean {
  if (!element.isContentEditable || replacements.length === 0) return false;
  if (isWordWebEditor(element)) return false;

  const { text: fullText, ranges: textNodes } = extractContentEditableText(element);

  // Build expected text by applying all replacements
  let expectedText = fullText;
  const sortedReplacements = [...replacements].sort((a, b) => b.startIndex - a.startIndex);

  for (const r of sortedReplacements) {
    if (r.startIndex < 0 || r.endIndex > expectedText.length) continue;
    expectedText = expectedText.slice(0, r.startIndex) + r.replacement + expectedText.slice(r.endIndex);
  }

  // Apply all DOM changes without dispatching input events
  for (const r of sortedReplacements) {
    const resolved = resolveTextRangeNodes(textNodes, r.startIndex, r.endIndex);
    if (!resolved) continue;
    if (resolved.startNode !== resolved.endNode) continue;

    replaceTextNodeRange(
      element,
      resolved.startNode,
      resolved.startOffset,
      resolved.endOffset,
      r.replacement,
      false // Don't dispatch input yet
    );
  }

  // Dispatch single input event after all changes
  element.dispatchEvent(new Event("input", { bubbles: true }));

  const nextText = extractContentEditableText(element).text;
  return nextText === expectedText;
}

export function applyTextRangeToElement(
  element: HTMLElement,
  startIndex: number,
  endIndex: number,
  replacement: string
): boolean {
  if (startIndex > endIndex) return false;

  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const currentValue = element.value;
    if (startIndex < 0 || startIndex > currentValue.length) return false;

    const safeEnd = Math.min(endIndex, currentValue.length);
    const expectedValue =
      currentValue.slice(0, startIndex) +
      replacement +
      currentValue.slice(safeEnd);

    element.focus();
    element.setSelectionRange(startIndex, safeEnd);

    const success = document.execCommand("insertText", false, replacement);
    if (!success || element.value !== expectedValue) {
      element.value = expectedValue;
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }

    return true;
  }

  if (element.isContentEditable) {
    if (isWordWebEditor(element)) {
      console.log("[Typix] Skipping edit for Word Web to avoid corruption");
      return false;
    }
    // Use unified extraction to guarantee text and ranges are aligned
    const { text: fullText, ranges: textNodes } = extractContentEditableText(element);
    if (startIndex < 0 || startIndex > fullText.length) return false;

    const safeEnd = Math.min(endIndex, fullText.length);
    const originalText = fullText;
    const expectedText =
      fullText.slice(0, startIndex) + replacement + fullText.slice(safeEnd);
    const avoidDirectFallback = shouldAvoidDirectDomFallback(element);
    const resolved = resolveTextRangeNodes(textNodes, startIndex, safeEnd);
    if (!resolved) return false;

    if (
      avoidDirectFallback &&
      resolved.startNode === resolved.endNode &&
      resolved.startNode.data.slice(resolved.startOffset, resolved.endOffset) ===
        originalText.slice(startIndex, safeEnd)
    ) {
      replaceTextNodeRange(
        element,
        resolved.startNode,
        resolved.startOffset,
        resolved.endOffset,
        replacement
      );
      const nextText = extractContentEditableText(element).text;
      console.log("[Typix Apply] Verify", {
        replacement,
        startIndex,
        expectedSlice: replacement,
        actualSlice: nextText.slice(startIndex, startIndex + replacement.length),
        nodeDataAfter: resolved.startNode.data.slice(0, 20),
      });
      if (nextText === expectedText) return true;
      // For managed editors, check if at least the target position was replaced correctly
      const replacedSlice = nextText.slice(startIndex, startIndex + replacement.length);
      if (replacedSlice === replacement) return true;
      return false;
    }

    const selection = window.getSelection();
    if (!selection) return false;

    element.focus();
    const range = document.createRange();
    range.setStart(resolved.startNode, resolved.startOffset);
    range.setEnd(resolved.endNode, resolved.endOffset);

    selection.removeAllRanges();
    selection.addRange(range);

    const success = document.execCommand("insertText", false, replacement);
    let nextText = extractContentEditableText(element).text;
    if (nextText === expectedText) return true;
    if (avoidDirectFallback) {
      if (nextText !== originalText) {
        document.execCommand("undo");
      }
      console.log("[Typix Apply] execCommand failed for managed editor", {
        original: originalText.slice(startIndex, safeEnd),
        replacement,
        execCommandSuccess: success,
      });
      return false;
    }
    if (!success || nextText === originalText) {
      range.deleteContents();
      range.insertNode(document.createTextNode(replacement));
      element.dispatchEvent(new Event("input", { bubbles: true }));
      nextText = extractContentEditableText(element).text;
    }

    if (nextText === expectedText) return true;
    if (nextText === originalText) return false;
    return true;
  }

  return false;
}
