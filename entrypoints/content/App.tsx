import { useReducer, useEffect, useCallback } from "react";
import { LintlyModal } from "@/components/lintly/LintlyModal";
import { SelectionToolbar } from "@/components/lintly/SelectionToolbar";
import type { Action, AnalyzeResult, Issue, ProcessResponse, Tone } from "@/lib/types";

interface SelectionRect {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface State {
  isVisible: boolean;
  isLoading: boolean;
  sourceText: string;
  originalSourceText: string;
  tone: Tone;
  action: Action;
  result: string | AnalyzeResult | null;
  originalResult: string | AnalyzeResult | null;
  toolbarPosition: { x: number; y: number } | null;
  modalPosition: { x: number; y: number };
  selectionRect: SelectionRect | null;
  error: string | null;
}

type AppAction =
  | { type: "SHOW_MODAL"; text: string; position: { x: number; y: number }; autoRun?: boolean }
  | { type: "HIDE_MODAL" }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_RESULT"; result: string | AnalyzeResult }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_SOURCE_TEXT"; text: string }
  | { type: "SET_TONE"; tone: Tone }
  | { type: "SET_ACTION"; action: Action }
  | { type: "SHOW_TOOLBAR"; position: { x: number; y: number }; selectionRect: SelectionRect }
  | { type: "HIDE_TOOLBAR" }
  | { type: "RESET" };

const initialState: State = {
  isVisible: false,
  isLoading: false,
  sourceText: "",
  originalSourceText: "",
  tone: "professional",
  action: "ANALYZE",
  result: null,
  originalResult: null,
  toolbarPosition: null,
  modalPosition: { x: 100, y: 100 },
  selectionRect: null,
  error: null,
};

function reducer(state: State, action: AppAction): State {
  switch (action.type) {
    case "SHOW_MODAL":
      return {
        ...state,
        isVisible: true,
        sourceText: action.text,
        originalSourceText: action.text,
        result: null,
        originalResult: null,
        toolbarPosition: null,
        modalPosition: action.position,
        action: "ANALYZE",
        isLoading: !!action.autoRun,
      };
    case "HIDE_MODAL":
      return { ...state, isVisible: false, result: null, originalResult: null, selectionRect: null };
    case "SET_LOADING":
      return { ...state, isLoading: action.loading };
    case "SET_RESULT":
      // Store as original only if this is the first result (from initial ANALYZE)
      const isFirstResult = state.originalResult === null;
      return {
        ...state,
        result: action.result,
        originalResult: isFirstResult ? action.result : state.originalResult,
        isLoading: false,
      };
    case "SET_ERROR":
      return { ...state, error: action.error, isLoading: false };
    case "SET_SOURCE_TEXT":
      return { ...state, sourceText: action.text };
    case "SET_TONE":
      return { ...state, tone: action.tone };
    case "SET_ACTION":
      return { ...state, action: action.action };
    case "SHOW_TOOLBAR":
      return { ...state, toolbarPosition: action.position, selectionRect: action.selectionRect };
    case "HIDE_TOOLBAR":
      return { ...state, toolbarPosition: null, selectionRect: null };
    case "RESET":
      return {
        ...state,
        sourceText: state.originalSourceText,
        result: state.originalResult,
        isLoading: false,
        error: null,
      };
    default:
      return state;
  }
}

function getTextareaSelectionRect(element: HTMLTextAreaElement | HTMLInputElement): SelectionRect | null {
  const start = element.selectionStart ?? 0;
  const end = element.selectionEnd ?? 0;
  if (start === end) return null;

  // Create a mirror div to measure text position
  const mirror = document.createElement("div");
  const style = window.getComputedStyle(element);

  // Copy textarea styles to mirror
  mirror.style.cssText = `
    position: absolute;
    visibility: hidden;
    white-space: pre-wrap;
    word-wrap: break-word;
    font: ${style.font};
    padding: ${style.padding};
    border: ${style.border};
    box-sizing: ${style.boxSizing};
    width: ${style.width};
    line-height: ${style.lineHeight};
    letter-spacing: ${style.letterSpacing};
  `;

  // Get element position
  const elementRect = element.getBoundingClientRect();
  mirror.style.top = `${elementRect.top + window.scrollY}px`;
  mirror.style.left = `${elementRect.left + window.scrollX}px`;

  const value = element.value;
  const before = value.slice(0, start);
  const selected = value.slice(start, end);

  // Build mirror content with marker span
  mirror.innerHTML =
    before.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;") +
    '<span id="lintly-sel-marker">' +
    selected.replace(/\n/g, "<br>").replace(/ /g, "&nbsp;") +
    "</span>";

  document.body.appendChild(mirror);

  const marker = mirror.querySelector("#lintly-sel-marker");
  if (!marker) {
    document.body.removeChild(mirror);
    return null;
  }

  const markerRect = marker.getBoundingClientRect();

  // Adjust for scroll position within textarea
  const scrollTop = element.scrollTop;
  const scrollLeft = element.scrollLeft;

  const rect: SelectionRect = {
    top: elementRect.top + (markerRect.top - mirror.getBoundingClientRect().top) - scrollTop,
    bottom: elementRect.top + (markerRect.bottom - mirror.getBoundingClientRect().top) - scrollTop,
    left: elementRect.left + (markerRect.left - mirror.getBoundingClientRect().left) - scrollLeft,
    right: elementRect.left + (markerRect.right - mirror.getBoundingClientRect().left) - scrollLeft,
  };

  document.body.removeChild(mirror);
  return rect;
}

function getSelectionRect(activeElement?: Element | null): SelectionRect | null {
  // Check if selection is in textarea/input
  if (activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLInputElement) {
    const rect = getTextareaSelectionRect(activeElement);
    if (rect) {
      console.log("[Lintly] Using textarea selection rect:", rect);
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
    console.log("[Lintly] Using DOM selection rect");
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }

  const r = range.getBoundingClientRect();
  if (r.width > 0) {
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
  }

  return null;
}

function calculateModalPosition(rect: SelectionRect): { x: number; y: number } {
  const modalWidth = 560;
  const modalHeight = 380;
  const margin = 16;
  const gap = 8;

  // Position below selection, aligned to left of selection
  let x = rect.left;
  let y = rect.bottom + gap;

  // If not enough space below, position above
  if (y + modalHeight > window.innerHeight - margin) {
    y = rect.top - modalHeight - gap;
  }

  // Adjust horizontal position
  if (x + modalWidth > window.innerWidth - margin) {
    x = window.innerWidth - modalWidth - margin;
  }
  if (x < margin) {
    x = margin;
  }

  // Keep within vertical bounds
  if (y < margin) {
    y = margin;
  }

  return { x, y };
}

function calculateToolbarPosition(rect: SelectionRect): { x: number; y: number } {
  const toolbarWidth = 60;
  const toolbarHeight = 28;
  const gap = 8;

  // Position above the selection, centered horizontally
  let x = rect.left + (rect.right - rect.left) / 2 - toolbarWidth / 2;
  let y = rect.top - toolbarHeight - gap;

  // If not enough space above, position below
  if (y < 16) {
    y = rect.bottom + gap;
  }

  // Keep within horizontal bounds
  if (x + toolbarWidth > window.innerWidth - 16) {
    x = window.innerWidth - toolbarWidth - 16;
  }
  if (x < 16) {
    x = 16;
  }

  // Keep within vertical bounds
  if (y + toolbarHeight > window.innerHeight - 16) {
    y = window.innerHeight - toolbarHeight - 16;
  }

  return { x, y };
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const processText = useCallback(
    async (actionOverride?: Action, customInstruction?: string) => {
      const actionToUse = actionOverride || state.action;
      if (!state.sourceText.trim()) return;

      dispatch({ type: "SET_LOADING", loading: true });

      try {
        const response: ProcessResponse = await browser.runtime.sendMessage({
          type: "PROCESS_TEXT",
          action: customInstruction ? "CUSTOM" : actionToUse,
          text: state.sourceText,
          options: {
            tone: state.tone,
            customInstruction: customInstruction || undefined,
          },
        });

        if (response.success && response.result) {
          dispatch({ type: "SET_RESULT", result: response.result });
        } else {
          dispatch({ type: "SET_ERROR", error: response.error || "Unknown error" });
        }
      } catch (err) {
        dispatch({ type: "SET_ERROR", error: String(err) });
      }
    },
    [state.sourceText, state.action, state.tone]
  );

  const handleCopy = useCallback(() => {
    const text =
      state.result && typeof state.result === "object"
        ? state.result.corrected_text
        : typeof state.result === "string"
          ? state.result
          : state.sourceText;
    navigator.clipboard.writeText(text);
  }, [state.result, state.sourceText]);

  const handleReset = useCallback(() => {
    dispatch({ type: "RESET" });
  }, []);

  const handleApplyFix = useCallback(
    (issue: Issue) => {
      // Apply the fix to the SOURCE text (which has the errors)
      const newText = state.sourceText.replace(issue.original, issue.suggestion);
      dispatch({ type: "SET_SOURCE_TEXT", text: newText });

      // Update result - remove the fixed issue from the list
      if (state.result && typeof state.result === "object") {
        const updatedIssues = state.result.issues.filter((i) => i.original !== issue.original);
        dispatch({
          type: "SET_RESULT",
          result: {
            corrected_text: state.result.corrected_text,
            issues: updatedIssues,
          },
        });
      }
    },
    [state.result, state.sourceText]
  );

  const handleApplyAllFixes = useCallback(() => {
    if (!state.result || typeof state.result !== "object" || state.result.issues.length === 0) {
      return;
    }

    // Apply all fixes to the source text
    let newText = state.sourceText;
    for (const issue of state.result.issues) {
      newText = newText.replace(issue.original, issue.suggestion);
    }
    dispatch({ type: "SET_SOURCE_TEXT", text: newText });

    // Clear all issues
    dispatch({
      type: "SET_RESULT",
      result: {
        corrected_text: state.result.corrected_text,
        issues: [],
      },
    });
  }, [state.result, state.sourceText]);

  const handleCustomSubmit = useCallback(
    (instruction: string) => {
      processText("CUSTOM", instruction);
    },
    [processText]
  );

  // Handle toolbar open - opens modal and auto-runs ANALYZE
  const handleToolbarOpen = useCallback(() => {
    const activeElement = document.activeElement;
    let text = "";

    if (activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLInputElement) {
      const start = activeElement.selectionStart ?? 0;
      const end = activeElement.selectionEnd ?? 0;
      text = activeElement.value.slice(start, end).trim();
    } else {
      text = window.getSelection()?.toString().trim() || "";
    }

    const rect = state.selectionRect || getSelectionRect(activeElement);
    if (text && rect) {
      const position = calculateModalPosition(rect);
      dispatch({ type: "SHOW_MODAL", text, position, autoRun: true });
    }
  }, [state.selectionRect]);

  // Auto-run ANALYZE when modal opens with autoRun flag
  useEffect(() => {
    if (state.isVisible && state.isLoading && state.sourceText && !state.result) {
      processText("ANALYZE");
    }
  }, [state.isVisible, state.isLoading, state.sourceText, state.result, processText]);

  // Debug: Log when app mounts
  useEffect(() => {
    console.log("[Lintly] Extension loaded successfully");
  }, []);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      // Changed shortcut to Ctrl+Shift+L (or Cmd+Shift+L on Mac)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();
        console.log("[Lintly] Shortcut triggered");

        const activeElement = document.activeElement;
        let text = "";

        if (activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLInputElement) {
          const start = activeElement.selectionStart ?? 0;
          const end = activeElement.selectionEnd ?? 0;
          text = activeElement.value.slice(start, end).trim();
        } else {
          text = window.getSelection()?.toString().trim() || "";
        }

        const rect = getSelectionRect(activeElement);
        if (text && rect) {
          dispatch({ type: "HIDE_TOOLBAR" });
          const position = calculateModalPosition(rect);
          dispatch({ type: "SHOW_MODAL", text, position, autoRun: true });
        }
      }
      if (e.key === "Escape") {
        if (state.isVisible) {
          dispatch({ type: "HIDE_MODAL" });
        } else if (state.toolbarPosition) {
          dispatch({ type: "HIDE_TOOLBAR" });
        }
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (state.isVisible) return;

      const activeElement = document.activeElement;

      // Get selected text - handle both textarea and regular selections
      let text = "";
      if (activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLInputElement) {
        const start = activeElement.selectionStart ?? 0;
        const end = activeElement.selectionEnd ?? 0;
        text = activeElement.value.slice(start, end).trim();
      } else {
        text = window.getSelection()?.toString().trim() || "";
      }

      if (!text || text.length === 0) {
        dispatch({ type: "HIDE_TOOLBAR" });
        return;
      }

      // Get selection rect
      let rect = getSelectionRect(activeElement);

      // Fallback: use mouse position if rect failed
      if (!rect || (rect.top === 0 && rect.left === 0)) {
        console.log("[Lintly] Using mouse position as fallback");
        rect = {
          top: e.clientY - 10,
          bottom: e.clientY + 10,
          left: e.clientX - 50,
          right: e.clientX + 50,
        };
      }

      console.log("[Lintly] MouseUp - text:", text.substring(0, 30), "rect:", rect);

      const position = calculateToolbarPosition(rect);
      dispatch({ type: "SHOW_TOOLBAR", position, selectionRect: rect });
    };

    const handleSelectionChange = () => {
      const selection = window.getSelection();
      const text = selection?.toString().trim();
      if (!text && state.toolbarPosition && !state.isVisible) {
        dispatch({ type: "HIDE_TOOLBAR" });
      }
    };

    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("mouseup", handleMouseUp);
    document.addEventListener("selectionchange", handleSelectionChange);

    return () => {
      document.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("mouseup", handleMouseUp);
      document.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [state.isVisible, state.toolbarPosition]);

  return (
    <>
      {state.toolbarPosition && (
        <SelectionToolbar position={state.toolbarPosition} onOpen={handleToolbarOpen} />
      )}

      <LintlyModal
        isVisible={state.isVisible}
        position={state.modalPosition}
        onClose={() => dispatch({ type: "HIDE_MODAL" })}
        sourceText={state.sourceText}
        tone={state.tone}
        onToneChange={(tone) => dispatch({ type: "SET_TONE", tone })}
        isLoading={state.isLoading}
        result={state.result}
        onApplyFix={handleApplyFix}
        onApplyAllFixes={handleApplyAllFixes}
        onCopy={handleCopy}
        onReset={handleReset}
        onCustomSubmit={handleCustomSubmit}
      />
    </>
  );
}
