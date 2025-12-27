import { findAllOccurrences } from "./occurrences";
import { extractContentEditableText, resolveTextRangeNodes } from "./textNodes";

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
    const useExecCommand = !element.hasAttribute("data-lexical-editor");

    const resolved = resolveTextRangeNodes(textNodes, matchStart, matchEnd);
    if (!resolved) return false;

    element.focus();
    const range = document.createRange();
    range.setStart(resolved.startNode, resolved.startOffset);
    range.setEnd(resolved.endNode, resolved.endOffset);

    if (useExecCommand) {
      selection.removeAllRanges();
      selection.addRange(range);

      const success = document.execCommand("insertText", false, suggestion);
      let nextText = extractContentEditableText(element).text;
      if (nextText !== expectedText) {
        if (!success || nextText === originalText) {
          range.deleteContents();
          range.insertNode(document.createTextNode(suggestion));
          element.dispatchEvent(new Event("input", { bubbles: true }));
          nextText = extractContentEditableText(element).text;
        }
      }

      if (nextText === expectedText) return true;
      if (nextText === originalText) return false;
      return true;
    }

    range.deleteContents();
    range.insertNode(document.createTextNode(suggestion));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  return false;
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
    // Use unified extraction to guarantee text and ranges are aligned
    const { text: fullText, ranges: textNodes } = extractContentEditableText(element);
    if (startIndex < 0 || startIndex > fullText.length) return false;

    const safeEnd = Math.min(endIndex, fullText.length);
    const originalText = fullText;
    const expectedText =
      fullText.slice(0, startIndex) + replacement + fullText.slice(safeEnd);
    const useExecCommand = !element.hasAttribute("data-lexical-editor");

    const resolved = resolveTextRangeNodes(textNodes, startIndex, safeEnd);
    if (!resolved) return false;

    const selection = window.getSelection();
    if (!selection) return false;

    element.focus();
    const range = document.createRange();
    range.setStart(resolved.startNode, resolved.startOffset);
    range.setEnd(resolved.endNode, resolved.endOffset);

    if (useExecCommand) {
      selection.removeAllRanges();
      selection.addRange(range);

      const success = document.execCommand("insertText", false, replacement);
      let nextText = extractContentEditableText(element).text;
      if (nextText !== expectedText) {
        if (!success || nextText === originalText) {
          range.deleteContents();
          range.insertNode(document.createTextNode(replacement));
          element.dispatchEvent(new Event("input", { bubbles: true }));
          nextText = extractContentEditableText(element).text;
        }
      }

      if (nextText === expectedText) return true;
      if (nextText === originalText) return false;
      return true;
    }

    range.deleteContents();
    range.insertNode(document.createTextNode(replacement));
    element.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  return false;
}
