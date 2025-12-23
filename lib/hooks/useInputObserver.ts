import { useState, useEffect, useCallback, useRef } from "react";
import { getElementText } from "../textPositioning";

export interface InputObserverState {
  activeElement: HTMLElement | null;
  text: string;
  isTyping: boolean;
  elementRect: DOMRect | null;
  /** Character delta since last stable text (positive = added chars, negative = removed) */
  charDelta: number;
  /** Position where the text change occurred */
  changePosition: number;
}

export interface InputObserverOptions {
  debounceMs?: number;
  minTextLength?: number;
  excludeSelectors?: string[];
  enabled?: boolean;
}

const DEFAULT_OPTIONS: Required<InputObserverOptions> = {
  debounceMs: 400,
  minTextLength: 10,
  excludeSelectors: [],
  enabled: true,
};

/**
 * Check if an element is a valid editable element we should observe
 */
function isValidEditableElement(element: Element | null): element is HTMLElement {
  if (!element || !(element instanceof HTMLElement)) return false;

  // Check for textarea
  if (element instanceof HTMLTextAreaElement) {
    return !element.readOnly && !element.disabled;
  }

  // Check for text input
  if (element instanceof HTMLInputElement) {
    const validTypes = ["text", "search", "url", "email"];
    return (
      validTypes.includes(element.type) &&
      !element.readOnly &&
      !element.disabled
    );
  }

  // Check for contenteditable
  if (element.isContentEditable) {
    return true;
  }

  return false;
}

/**
 * Check if element matches any exclude selector
 */
function shouldExclude(element: HTMLElement, excludeSelectors: string[]): boolean {
  for (const selector of excludeSelectors) {
    try {
      if (element.matches(selector) || element.closest(selector)) {
        return true;
      }
    } catch {
      // Invalid selector, skip
    }
  }
  return false;
}

/**
 * Hook to observe user input in editable elements with debouncing
 * Designed to not interfere with text selection
 */
export function useInputObserver(options?: InputObserverOptions): InputObserverState {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const [state, setState] = useState<InputObserverState>({
    activeElement: null,
    text: "",
    isTyping: false,
    elementRect: null,
    charDelta: 0,
    changePosition: 0,
  });

  // Track last stable text for computing deltas
  const lastStableTextRef = useRef<string>("");

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeElementRef = useRef<HTMLElement | null>(null);
  const isTypingRef = useRef(false);
  const isSelectingRef = useRef(false);

  // Clear debounce timer
  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  // Update text after debounce - this is the "stable" state
  const updateText = useCallback(() => {
    const element = activeElementRef.current;
    if (!element || isSelectingRef.current) return;

    const text = getElementText(element);
    const rect = element.getBoundingClientRect();

    // Save as new stable text baseline
    lastStableTextRef.current = text;
    isTypingRef.current = false;
    setState((prev) => ({
      ...prev,
      text,
      isTyping: false,
      elementRect: rect,
      charDelta: 0,
      changePosition: 0,
    }));
  }, []);

  // Handle input event (typing, cut, paste)
  const handleInput = useCallback(
    (e: Event) => {
      if (!opts.enabled || isSelectingRef.current) return;

      const target = e.target;
      if (!isValidEditableElement(target as Element)) return;

      const element = target as HTMLElement;

      // Skip if excluded
      if (shouldExclude(element, opts.excludeSelectors)) return;

      // Update active element if different
      if (activeElementRef.current !== element) {
        activeElementRef.current = element;
        const text = getElementText(element);
        lastStableTextRef.current = text;
        const rect = element.getBoundingClientRect();
        setState((prev) => ({
          ...prev,
          activeElement: element,
          elementRect: rect,
          text,
          charDelta: 0,
          changePosition: 0,
        }));
      }

      // Compute character delta from stable text
      const currentText = getElementText(element);
      const stableText = lastStableTextRef.current;
      const charDelta = currentText.length - stableText.length;

      // Estimate change position from input event or cursor
      let changePosition = 0;
      if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
        // Cursor position after the edit
        changePosition = element.selectionStart ?? 0;
        // Adjust to get position where change started
        if (charDelta > 0) {
          changePosition = Math.max(0, changePosition - charDelta);
        }
      }

      // Set typing state with delta info
      if (!isTypingRef.current) {
        isTypingRef.current = true;
      }
      setState((prev) => ({
        ...prev,
        isTyping: true,
        charDelta,
        changePosition,
      }));

      // Debounce text update
      clearDebounce();
      debounceTimerRef.current = setTimeout(updateText, opts.debounceMs);
    },
    [opts.enabled, opts.debounceMs, opts.excludeSelectors, clearDebounce, updateText]
  );

  // Handle cut/paste events - trigger immediate re-analysis
  const handleCutPaste = useCallback(
    (e: Event) => {
      if (!opts.enabled) return;

      const target = e.target;
      if (!isValidEditableElement(target as Element)) return;
      if (target !== activeElementRef.current) return;

      // Set typing state and debounce
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        setState((prev) => ({ ...prev, isTyping: true }));
      }

      clearDebounce();
      debounceTimerRef.current = setTimeout(updateText, opts.debounceMs);
    },
    [opts.enabled, opts.debounceMs, clearDebounce, updateText]
  );

  // Handle focus in - only track element, don't trigger analysis yet
  const handleFocusIn = useCallback(
    (e: FocusEvent) => {
      if (!opts.enabled) return;

      const target = e.target;
      if (!isValidEditableElement(target as Element)) return;

      const element = target as HTMLElement;

      // Skip if excluded
      if (shouldExclude(element, opts.excludeSelectors)) return;

      activeElementRef.current = element;
      const text = getElementText(element);
      const rect = element.getBoundingClientRect();

      // Save as stable text baseline
      lastStableTextRef.current = text;

      // Only update if element changed
      if (state.activeElement !== element) {
        setState({
          activeElement: element,
          text,
          isTyping: false,
          elementRect: rect,
          charDelta: 0,
          changePosition: 0,
        });
      }
    },
    [opts.enabled, opts.excludeSelectors, state.activeElement]
  );

  // Handle focus out with delay
  const handleFocusOut = useCallback((e: FocusEvent) => {
    const target = e.target;
    if (target !== activeElementRef.current) return;

    // Delay cleanup to allow interactions with overlays
    setTimeout(() => {
      // Check if focus moved to another valid element
      const newActive = document.activeElement;
      if (isValidEditableElement(newActive) && newActive !== target) {
        return; // Will be handled by focusin
      }

      // Check if we're still focused on the same element
      if (document.activeElement === activeElementRef.current) {
        return;
      }

      // Check if focus moved to our overlay elements (e.g., popover)
      // Don't clear if focus is inside a lintly element or shadow DOM
      if (newActive) {
        const root = newActive.getRootNode?.();
        // If in shadow DOM (our extension), don't clear
        if (root instanceof ShadowRoot) {
          return;
        }
        // If focus is on body but related target is in our overlay, don't clear
        const related = e.relatedTarget as Element | null;
        if (related) {
          const relatedRoot = related.getRootNode?.();
          if (relatedRoot instanceof ShadowRoot) {
            return;
          }
        }
      }

      // Keep last active element so highlights/indicator stay visible after blur.
      isTypingRef.current = false;
      setState((prev) => ({
        ...prev,
        isTyping: false,
        elementRect: activeElementRef.current?.getBoundingClientRect() ?? prev.elementRect,
      }));
    }, 200);
  }, []);

  // Track mouse selection state to avoid interference
  const handleMouseDown = useCallback(() => {
    isSelectingRef.current = true;
  }, []);

  const handleMouseUp = useCallback(() => {
    // Delay resetting to allow selection to complete
    setTimeout(() => {
      isSelectingRef.current = false;
    }, 100);
  }, []);

  // Set up event listeners
  useEffect(() => {
    if (!opts.enabled) return;

    // Use capture phase for input to catch it early
    document.addEventListener("input", handleInput, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);

    // Track mouse selection state
    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("mouseup", handleMouseUp, true);

    // Handle cut/paste events
    document.addEventListener("cut", handleCutPaste, true);
    document.addEventListener("paste", handleCutPaste, true);

    return () => {
      document.removeEventListener("input", handleInput, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      document.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("mouseup", handleMouseUp, true);
      document.removeEventListener("cut", handleCutPaste, true);
      document.removeEventListener("paste", handleCutPaste, true);
      clearDebounce();
    };
  }, [opts.enabled, handleInput, handleFocusIn, handleFocusOut, handleMouseDown, handleMouseUp, handleCutPaste, clearDebounce]);

  // Watch for element removal
  useEffect(() => {
    if (!state.activeElement) return;

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.removedNodes) {
          if (
            node === state.activeElement ||
            (node instanceof Element && node.contains(state.activeElement))
          ) {
            clearDebounce();
            activeElementRef.current = null;
            isTypingRef.current = false;
            isSelectingRef.current = false;
            lastStableTextRef.current = "";
            setState({
              activeElement: null,
              text: "",
              isTyping: false,
              elementRect: null,
              charDelta: 0,
              changePosition: 0,
            });
            return;
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [state.activeElement, clearDebounce]);

  return state;
}
