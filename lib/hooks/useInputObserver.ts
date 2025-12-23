import { useState, useEffect, useCallback, useRef } from "react";
import { getElementText } from "../textPositioning";

export interface InputObserverState {
  activeElement: HTMLElement | null;
  text: string;
  isTyping: boolean;
  elementRect: DOMRect | null;
  /** Used to shift overlays without reflowing on every keystroke. */
  charDelta: number;
  /** Anchor for incremental updates while typing. */
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

const INITIAL_STATE: InputObserverState = {
  activeElement: null,
  text: "",
  isTyping: false,
  elementRect: null,
  charDelta: 0,
  changePosition: 0,
};

function isValidEditableElement(element: Element | null): element is HTMLElement {
  if (!element || !(element instanceof HTMLElement)) return false;

  if (element instanceof HTMLTextAreaElement) {
    return !element.readOnly && !element.disabled;
  }

  if (element instanceof HTMLInputElement) {
    const validTypes = ["text", "search", "url", "email"];
    return validTypes.includes(element.type) && !element.readOnly && !element.disabled;
  }

  return element.isContentEditable;
}

function shouldExclude(element: HTMLElement, excludeSelectors: string[]): boolean {
  for (const selector of excludeSelectors) {
    try {
      if (element.matches(selector) || element.closest(selector)) {
        return true;
      }
    } catch {
      // Skip invalid selectors so configuration can't break observation.
    }
  }
  return false;
}

function getChangePosition(element: HTMLElement, charDelta: number): number {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    let position = element.selectionStart ?? 0;
    if (charDelta > 0) {
      position = Math.max(0, position - charDelta);
    }
    return position;
  }

  return 0;
}

function readElementSnapshot(element: HTMLElement): { text: string; rect: DOMRect } {
  return {
    text: getElementText(element),
    rect: element.getBoundingClientRect(),
  };
}

function isShadowRootNode(node: Node | null): boolean {
  if (!node) return false;
  const root = node.getRootNode?.();
  return root instanceof ShadowRoot;
}

export function useInputObserver(options?: InputObserverOptions): InputObserverState {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const [state, setState] = useState<InputObserverState>(INITIAL_STATE);

  const lastStableTextRef = useRef<string>("");
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeElementRef = useRef<HTMLElement | null>(null);
  const isTypingRef = useRef(false);
  const isSelectingRef = useRef(false);

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const commitStableText = useCallback(() => {
    const element = activeElementRef.current;
    if (!element || isSelectingRef.current) return;

    const { text, rect } = readElementSnapshot(element);
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

  const setActiveElement = useCallback(
    (element: HTMLElement) => {
      activeElementRef.current = element;
      const { text, rect } = readElementSnapshot(element);
      lastStableTextRef.current = text;
      setState((prev) => ({
        ...prev,
        activeElement: element,
        elementRect: rect,
        text,
        isTyping: false,
        charDelta: 0,
        changePosition: 0,
      }));
    },
    []
  );

  const scheduleStableText = useCallback(() => {
    clearDebounce();
    debounceTimerRef.current = setTimeout(commitStableText, opts.debounceMs);
  }, [clearDebounce, commitStableText, opts.debounceMs]);

  const handleInput = useCallback(
    (e: Event) => {
      if (!opts.enabled || isSelectingRef.current) return;

      const target = e.target;
      if (!isValidEditableElement(target as Element)) return;

      const element = target as HTMLElement;
      if (shouldExclude(element, opts.excludeSelectors)) return;

      if (activeElementRef.current !== element) {
        setActiveElement(element);
      }

      const currentText = getElementText(element);
      const stableText = lastStableTextRef.current;
      const charDelta = currentText.length - stableText.length;
      const changePosition = getChangePosition(element, charDelta);

      if (!isTypingRef.current) {
        isTypingRef.current = true;
      }
      setState((prev) => ({
        ...prev,
        isTyping: true,
        charDelta,
        changePosition,
      }));

      scheduleStableText();
    },
    [opts.enabled, opts.excludeSelectors, scheduleStableText, setActiveElement]
  );

  const handleCutPaste = useCallback(
    (e: Event) => {
      if (!opts.enabled) return;

      const target = e.target;
      if (!isValidEditableElement(target as Element)) return;
      if (target !== activeElementRef.current) return;

      if (!isTypingRef.current) {
        isTypingRef.current = true;
        setState((prev) => ({ ...prev, isTyping: true }));
      }

      scheduleStableText();
    },
    [opts.enabled, scheduleStableText]
  );

  const handleFocusIn = useCallback(
    (e: FocusEvent) => {
      if (!opts.enabled) return;

      const target = e.target;
      if (!isValidEditableElement(target as Element)) return;

      const element = target as HTMLElement;
      if (shouldExclude(element, opts.excludeSelectors)) return;

      if (state.activeElement !== element) {
        setActiveElement(element);
      }
    },
    [opts.enabled, opts.excludeSelectors, setActiveElement, state.activeElement]
  );

  const handleFocusOut = useCallback((e: FocusEvent) => {
    const target = e.target;
    if (target !== activeElementRef.current) return;

    // Delay to allow clicks on overlays without collapsing state.
    setTimeout(() => {
      const newActive = document.activeElement;
      if (isValidEditableElement(newActive) && newActive !== target) {
        return;
      }

      if (document.activeElement === activeElementRef.current) {
        return;
      }

      if (isShadowRootNode(newActive)) {
        return;
      }

      const related = e.relatedTarget as Element | null;
      if (related && isShadowRootNode(related)) {
        return;
      }

      isTypingRef.current = false;
      setState((prev) => ({
        ...prev,
        isTyping: false,
        elementRect: activeElementRef.current?.getBoundingClientRect() ?? prev.elementRect,
      }));
    }, 200);
  }, []);

  const handleMouseDown = useCallback(() => {
    isSelectingRef.current = true;
  }, []);

  const handleMouseUp = useCallback(() => {
    setTimeout(() => {
      isSelectingRef.current = false;
    }, 100);
  }, []);

  useEffect(() => {
    if (!opts.enabled) return;

    document.addEventListener("input", handleInput, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);

    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("mouseup", handleMouseUp, true);

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
  }, [
    opts.enabled,
    handleInput,
    handleFocusIn,
    handleFocusOut,
    handleMouseDown,
    handleMouseUp,
    handleCutPaste,
    clearDebounce,
  ]);

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
            setState(INITIAL_STATE);
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
