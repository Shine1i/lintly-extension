import { useReducer, useEffect, useCallback } from "react";
import { LintlyModal } from "@/components/lintly/LintlyModal";
import { SelectionToolbar } from "@/components/lintly/SelectionToolbar";
import type { Action, AnalyzeResult, ProcessResponse, Tone } from "@/lib/types";

interface State {
  isVisible: boolean;
  isLoading: boolean;
  sourceText: string;
  customInstruction: string;
  tone: Tone;
  action: Action;
  result: string | AnalyzeResult | null;
  toolbarPosition: { x: number; y: number } | null;
  modalPosition: { x: number; y: number };
  error: string | null;
}

type AppAction =
  | { type: "SHOW_MODAL"; text: string; position: { x: number; y: number }; autoRun?: Action }
  | { type: "HIDE_MODAL" }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_RESULT"; result: string | AnalyzeResult }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_SOURCE_TEXT"; text: string }
  | { type: "SET_CUSTOM_INSTRUCTION"; instruction: string }
  | { type: "SET_TONE"; tone: Tone }
  | { type: "SET_ACTION"; action: Action }
  | { type: "SHOW_TOOLBAR"; position: { x: number; y: number } }
  | { type: "HIDE_TOOLBAR" };

const initialState: State = {
  isVisible: false,
  isLoading: false,
  sourceText: "",
  customInstruction: "",
  tone: "formal",
  action: "ANALYZE",
  result: null,
  toolbarPosition: null,
  modalPosition: { x: 100, y: 100 },
  error: null,
};

function reducer(state: State, action: AppAction): State {
  switch (action.type) {
    case "SHOW_MODAL":
      return {
        ...state,
        isVisible: true,
        sourceText: action.text,
        result: null,
        toolbarPosition: null,
        modalPosition: action.position,
        action: action.autoRun || state.action,
        isLoading: !!action.autoRun,
      };
    case "HIDE_MODAL":
      return { ...state, isVisible: false, result: null };
    case "SET_LOADING":
      return { ...state, isLoading: action.loading };
    case "SET_RESULT":
      return { ...state, result: action.result, isLoading: false };
    case "SET_ERROR":
      return { ...state, error: action.error, isLoading: false };
    case "SET_SOURCE_TEXT":
      return { ...state, sourceText: action.text };
    case "SET_CUSTOM_INSTRUCTION":
      return { ...state, customInstruction: action.instruction };
    case "SET_TONE":
      return { ...state, tone: action.tone };
    case "SET_ACTION":
      return { ...state, action: action.action };
    case "SHOW_TOOLBAR":
      return { ...state, toolbarPosition: action.position };
    case "HIDE_TOOLBAR":
      return { ...state, toolbarPosition: null };
    default:
      return state;
  }
}

function getModalPosition(): { x: number; y: number } {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return { x: 100, y: 100 };
  }

  const range = selection.getRangeAt(0);
  const rect = range.getBoundingClientRect();

  const modalWidth = 500;
  const modalHeight = 400;

  let x = rect.left;
  let y = rect.bottom + 12;

  if (x + modalWidth > window.innerWidth) {
    x = window.innerWidth - modalWidth - 16;
  }
  if (y + modalHeight > window.innerHeight) {
    y = rect.top - modalHeight - 12;
  }

  return { x: Math.max(16, x), y: Math.max(16, y) };
}

export default function App() {
  const [state, dispatch] = useReducer(reducer, initialState);

  const processText = useCallback(
    async (actionOverride?: Action) => {
      const actionToUse = actionOverride || (state.customInstruction ? "CUSTOM" : state.action);
      if (!state.sourceText.trim()) return;

      dispatch({ type: "SET_LOADING", loading: true });

      try {
        const response: ProcessResponse = await browser.runtime.sendMessage({
          type: "PROCESS_TEXT",
          action: actionToUse,
          text: state.sourceText,
          options: {
            tone: state.tone,
            customInstruction: state.customInstruction || undefined,
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
    [state.sourceText, state.action, state.tone, state.customInstruction]
  );

  const handleCopy = useCallback(() => {
    const text =
      state.result && typeof state.result === "object"
        ? state.result.corrected_text
        : typeof state.result === "string"
          ? state.result
          : "";
    navigator.clipboard.writeText(text);
  }, [state.result]);

  const handleReplace = useCallback(() => {
    handleCopy();
    dispatch({ type: "HIDE_MODAL" });
  }, [handleCopy]);

  const handleToolbarRewrite = useCallback(() => {
    const text = window.getSelection()?.toString().trim();
    if (text) {
      dispatch({ type: "SET_ACTION", action: "PARAPHRASE" });
      dispatch({ type: "SHOW_MODAL", text, position: getModalPosition(), autoRun: "PARAPHRASE" });
      setTimeout(() => processText("PARAPHRASE"), 50);
    }
  }, [processText]);

  const handleToolbarSummarize = useCallback(() => {
    const text = window.getSelection()?.toString().trim();
    if (text) {
      dispatch({ type: "SET_ACTION", action: "SUMMARIZE" });
      dispatch({ type: "SHOW_MODAL", text, position: getModalPosition(), autoRun: "SUMMARIZE" });
      setTimeout(() => processText("SUMMARIZE"), 50);
    }
  }, [processText]);

  const handleToolbarMore = useCallback(() => {
    const text = window.getSelection()?.toString().trim();
    if (text) {
      dispatch({ type: "SHOW_MODAL", text, position: getModalPosition() });
    }
  }, []);

  const handleActionChange = useCallback((action: Action, tone?: Tone) => {
    dispatch({ type: "SET_ACTION", action });
    if (tone) {
      dispatch({ type: "SET_TONE", tone });
    }
  }, []);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "g") {
        e.preventDefault();
        const text = window.getSelection()?.toString().trim();
        if (text) {
          dispatch({ type: "HIDE_TOOLBAR" });
          dispatch({ type: "SHOW_MODAL", text, position: getModalPosition() });
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

      setTimeout(() => {
        const selection = window.getSelection();
        const text = selection?.toString().trim();
        if (text && text.length > 0) {
          dispatch({
            type: "SHOW_TOOLBAR",
            position: { x: e.clientX - 80, y: e.clientY - 50 },
          });
        } else {
          dispatch({ type: "HIDE_TOOLBAR" });
        }
      }, 10);
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
        <SelectionToolbar
          position={state.toolbarPosition}
          onRewrite={handleToolbarRewrite}
          onSummarize={handleToolbarSummarize}
          onMore={handleToolbarMore}
        />
      )}

      <LintlyModal
        isVisible={state.isVisible}
        position={state.modalPosition}
        onClose={() => dispatch({ type: "HIDE_MODAL" })}
        sourceText={state.sourceText}
        onSourceTextChange={(text) => dispatch({ type: "SET_SOURCE_TEXT", text })}
        customInstruction={state.customInstruction}
        onCustomInstructionChange={(instruction) =>
          dispatch({ type: "SET_CUSTOM_INSTRUCTION", instruction })
        }
        tone={state.tone}
        onToneChange={(tone) => dispatch({ type: "SET_TONE", tone })}
        action={state.action}
        onActionClick={() => processText()}
        onActionChange={handleActionChange}
        isLoading={state.isLoading}
        result={state.result}
        onCopy={handleCopy}
        onReplace={handleReplace}
      />
    </>
  );
}
