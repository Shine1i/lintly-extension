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

const MAX_SHIFT_CHARS = 50;
const MAX_SYNC_DELTA_LENGTH = 4000;

const SENSITIVE_AUTOCOMPLETE_TOKENS = new Set([
  "name",
  "honorific-prefix",
  "given-name",
  "additional-name",
  "family-name",
  "nickname",
  "username",
  "current-password",
  "new-password",
  "one-time-code",
  "email",
  "tel",
  "tel-country-code",
  "tel-national",
  "tel-area-code",
  "tel-local",
  "tel-local-prefix",
  "tel-local-suffix",
  "tel-extension",
  "organization",
  "street-address",
  "address-line1",
  "address-line2",
  "address-line3",
  "address-level1",
  "address-level2",
  "address-level3",
  "address-level4",
  "country",
  "country-name",
  "postal-code",
  "cc-name",
  "cc-number",
  "cc-exp",
  "cc-exp-month",
  "cc-exp-year",
  "cc-csc",
  "cc-type",
  "bday",
  "bday-day",
  "bday-month",
  "bday-year",
]);

const SENSITIVE_KEYWORD_REGEXES = [
  /\bpassword\b/,
  /\bpasscode\b/,
  /\bpin\b/,
  /\botp\b/,
  /\bone[- ]time\b/,
  /\bmfa\b/,
  /\b2fa\b/,
  /\bauth(?:entication)?\s*code\b/,
  /\bsecurity\s*code\b/,
  /\bverification\s*code\b/,
  /\btoken\b/,
  /\bsecret\b/,
  /\bapi\s*key\b/,
  /\baccess\s*key\b/,
  /\bprivate\s*key\b/,
  /\bssh\s*key\b/,
  /\bpgp\b/,
  /\bgpg\b/,
  /\bcredit\s*card\b/,
  /\bcard\s*number\b/,
  /\bcc[-_ ]?(?:number|num|csc|cvv|exp|expiry|expir|type|name)\b/,
  /\bcvv\b/,
  /\bcvc\b/,
  /\bexpir(?:y|ation)\b/,
  /\biban\b/,
  /\brouting\b/,
  /\bbank\b/,
  /\baccount\s*number\b/,
  /\bssn\b/,
  /\bsocial\s*security\b/,
  /\btax\s*id\b/,
  /\bein\b/,
  /\bpassport\b/,
  /\bdriver'?s?\s*license\b/,
  /\bdate\s*of\s*birth\b/,
  /\bdob\b/,
  /\be-?mail\b/,
  /\bphone\b/,
  /\bmobile\b/,
  /\bcell\b/,
  /\bfax\b/,
  /\baddress\b/,
  /\bstreet\b/,
  /\bcity\b/,
  /\bstate\b/,
  /\bprovince\b/,
  /\bzip\b/,
  /\bpostal\b/,
  /\bcountry\b/,
  /\bfirst\s*name\b/,
  /\blast\s*name\b/,
  /\bfull\s*name\b/,
  /\bmiddle\s*name\b/,
  /\buser\s*name\b/,
  /\busername\b/,
  /\bname\b/,
];

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

  // Exclude all <input> elements - they're typically for short entries
  // (login forms, search boxes, emails) that don't benefit from grammar checking
  if (element instanceof HTMLInputElement) {
    return false;
  }

  return element.isContentEditable;
}

function getContentEditableRoot(element: HTMLElement): HTMLElement {
  let current: HTMLElement | null = element;
  let lastEditable: HTMLElement = element;
  while (current && current.isContentEditable) {
    lastEditable = current;
    const parentElement: HTMLElement | null = current.parentElement;
    if (!parentElement || !parentElement.isContentEditable) {
      break;
    }
    current = parentElement;
  }
  return lastEditable;
}

function resolveEditableTarget(event: Event): HTMLElement | null {
  const candidates: EventTarget[] = [];
  if (event.target) {
    candidates.push(event.target);
  }
  if (typeof event.composedPath === "function") {
    for (const entry of event.composedPath()) {
      if (entry && entry !== event.target) {
        candidates.push(entry);
      }
    }
  }
  if (document.activeElement) {
    candidates.push(document.activeElement);
  }

  for (const candidate of candidates) {
    let current: Element | null = null;
    if (candidate instanceof Element) {
      current = candidate;
    } else if (candidate instanceof Node) {
      current = candidate.parentElement;
    }

    while (current) {
      if (isValidEditableElement(current)) {
        return current.isContentEditable ? getContentEditableRoot(current) : current;
      }
      current = current.parentElement;
    }
  }

  return null;
}

function getAriaLabelledbyText(element: HTMLElement): string {
  const raw = element.getAttribute("aria-labelledby");
  if (!raw) return "";
  const ids = raw.split(/\s+/).filter(Boolean);
  if (ids.length === 0) return "";
  const labels = ids
    .map((id) => element.ownerDocument.getElementById(id)?.textContent || "")
    .filter(Boolean);
  return labels.join(" ");
}

function getAssociatedLabelText(element: HTMLElement): string {
  const labels: string[] = [];
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
    if (element.labels) {
      for (const label of element.labels) {
        if (label.textContent) {
          labels.push(label.textContent);
        }
      }
    }
  }

  const wrappedLabel = element.closest("label");
  if (wrappedLabel?.textContent) {
    labels.push(wrappedLabel.textContent);
  }

  return labels.join(" ");
}

function hasSensitiveAutocomplete(element: HTMLElement): boolean {
  const autocomplete = element.getAttribute("autocomplete");
  if (!autocomplete) return false;
  const tokens = autocomplete.toLowerCase().split(/\s+/).filter(Boolean);
  for (const token of tokens) {
    if (token.startsWith("section-")) {
      continue;
    }
    if (SENSITIVE_AUTOCOMPLETE_TOKENS.has(token)) {
      return true;
    }
  }
  return false;
}

function getElementDescriptorText(element: HTMLElement): string {
  const className = typeof element.className === "string" ? element.className : "";
  const parts = [
    element.getAttribute("name"),
    element.getAttribute("id"),
    className,
    element.getAttribute("placeholder"),
    element.getAttribute("aria-label"),
    getAriaLabelledbyText(element),
    getAssociatedLabelText(element),
    element.getAttribute("title"),
  ];
  return parts.filter(Boolean).join(" ").toLowerCase();
}

function isSensitiveElement(element: HTMLElement): boolean {
  if (hasSensitiveAutocomplete(element)) {
    return true;
  }
  const descriptor = getElementDescriptorText(element);
  if (!descriptor) return false;
  return SENSITIVE_KEYWORD_REGEXES.some((regex) => regex.test(descriptor));
}

function shouldExclude(element: HTMLElement, excludeSelectors: string[]): boolean {
  if (isSensitiveElement(element)) {
    return true;
  }
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

function getSelectionLength(element: HTMLElement): number | null {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? 0;
    return Math.max(0, end - start);
  }

  const selection = window.getSelection();
  if (!selection) return null;
  return selection.isCollapsed ? 0 : null;
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

function getElementTextLength(element: HTMLElement): number | null {
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    return element.value.length;
  }

  if (element.isContentEditable) {
    return getElementText(element).length;
  }

  return null;
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

type PendingInputInfo = {
  target: HTMLElement | null;
  inputType: string;
  dataLength: number | null;
  selectionLength: number | null;
};

function inferCharDelta(pending: PendingInputInfo | null): number | null {
  if (!pending) return null;

  const { inputType, dataLength, selectionLength } = pending;
  if (inputType.startsWith("insert")) {
    if (dataLength == null || selectionLength == null) return null;
    return dataLength - selectionLength;
  }

  if (inputType.startsWith("delete")) {
    if (selectionLength == null) return null;
    return selectionLength > 0 ? -selectionLength : -1;
  }

  return null;
}

export function useInputObserver(options?: InputObserverOptions): InputObserverState {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const [state, setState] = useState<InputObserverState>(INITIAL_STATE);

  const lastStableTextRef = useRef<string>("");
  const lastStableLengthRef = useRef<number>(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeElementRef = useRef<HTMLElement | null>(null);
  const isTypingRef = useRef(false);
  const isSelectingRef = useRef(false);
  const pendingInputRef = useRef<PendingInputInfo | null>(null);

  const clearDebounce = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
  }, []);

  const resetState = useCallback(() => {
    clearDebounce();
    activeElementRef.current = null;
    isTypingRef.current = false;
    isSelectingRef.current = false;
    pendingInputRef.current = null;
    lastStableTextRef.current = "";
    lastStableLengthRef.current = 0;
    setState(INITIAL_STATE);
  }, [clearDebounce]);

  const commitStableText = useCallback(() => {
    const element = activeElementRef.current;
    if (!element || isSelectingRef.current) return;

    const { text, rect } = readElementSnapshot(element);
    lastStableTextRef.current = text;
    lastStableLengthRef.current = text.length;
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
      lastStableLengthRef.current = text.length;
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

  const handleBeforeInput = useCallback(
    (e: Event) => {
      if (!opts.enabled || isSelectingRef.current) return;

      const element = resolveEditableTarget(e);
      if (!element) return;
      if (shouldExclude(element, opts.excludeSelectors)) return;

      const inputEvent = e as InputEvent;
      pendingInputRef.current = {
        target: element,
        inputType: inputEvent.inputType || "",
        dataLength: typeof inputEvent.data === "string" ? inputEvent.data.length : null,
        selectionLength: getSelectionLength(element),
      };
    },
    [opts.enabled, opts.excludeSelectors]
  );

  const handleInput = useCallback(
    (e: Event) => {
      if (!opts.enabled || isSelectingRef.current) return;

      const element = resolveEditableTarget(e);
      if (!element) return;
      if (shouldExclude(element, opts.excludeSelectors)) return;

      if (activeElementRef.current !== element) {
        setActiveElement(element);
      }

      const stableLength = lastStableLengthRef.current;
      const pending = pendingInputRef.current?.target === element ? pendingInputRef.current : null;
      pendingInputRef.current = null;

      let charDelta = inferCharDelta(pending);
      if (charDelta === null) {
        const canSyncRead = stableLength <= MAX_SYNC_DELTA_LENGTH;
        const currentLength = canSyncRead ? getElementTextLength(element) : null;
        charDelta = currentLength != null ? currentLength - stableLength : 0;
      }
      if (Math.abs(charDelta) > MAX_SHIFT_CHARS) {
        charDelta = 0;
      }
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

      const element = resolveEditableTarget(e);
      if (!element) return;
      if (shouldExclude(element, opts.excludeSelectors)) return;

      if (activeElementRef.current !== element) {
        setActiveElement(element);
      }

      if (!isTypingRef.current) {
        isTypingRef.current = true;
        setState((prev) => ({ ...prev, isTyping: true }));
      }

      scheduleStableText();
    },
    [opts.enabled, opts.excludeSelectors, scheduleStableText, setActiveElement]
  );

  const handleFocusIn = useCallback(
    (e: FocusEvent) => {
      if (!opts.enabled) return;

      const element = resolveEditableTarget(e);
      if (!element) return;
      if (shouldExclude(element, opts.excludeSelectors)) {
        if (activeElementRef.current) {
          resetState();
        }
        return;
      }

      if (state.activeElement !== element) {
        setActiveElement(element);
      }
    },
    [opts.enabled, opts.excludeSelectors, resetState, setActiveElement, state.activeElement]
  );

  const handleFocusOut = useCallback((e: FocusEvent) => {
    const target = e.target;
    if (target !== activeElementRef.current) return;

    // Delay to allow clicks on overlays without collapsing state.
    setTimeout(() => {
      if (!activeElementRef.current) {
        return;
      }
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

    document.addEventListener("beforeinput", handleBeforeInput, true);
    document.addEventListener("input", handleInput, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);

    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("mouseup", handleMouseUp, true);

    document.addEventListener("cut", handleCutPaste, true);
    document.addEventListener("paste", handleCutPaste, true);

    return () => {
      document.removeEventListener("beforeinput", handleBeforeInput, true);
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
    handleBeforeInput,
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
            resetState();
            return;
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, [state.activeElement, resetState]);

  return state;
}
