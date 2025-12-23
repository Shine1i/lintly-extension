import { useEffect, useCallback, useMemo, useRef } from "react";
import { useAtom } from "jotai";
import { LintlyModal } from "@/components/lintly/LintlyModal";
import { SelectionToolbar } from "@/components/lintly/SelectionToolbar";
import { InlineHighlightManager } from "@/components/lintly/InlineHighlightManager";
import { getSelectionRect, type SelectionRect } from "@/lib/textPositioning";
import type { Action, AnalyzeResult, Issue, ProcessResponse } from "@/lib/types";
import { appStateAtom } from "@/lib/state/lintlyAppState";
import {
  applyIssuesToSentence,
  buildIssueSentenceContexts,
  findSentenceRangeAt,
  getSentenceRanges,
  groupIssueContextsBySentence,
  type SentenceRange,
} from "@/lib/sentences";
import { mergeIssuesForSentence } from "@/lib/issueMerge";

function calculateModalPosition(rect: SelectionRect): { x: number; y: number } {
  const modalWidth = 560;
  const modalHeight = 380;
  const margin = 16;
  const gap = 8;

  let x = rect.left;
  let y = rect.bottom + gap;

  if (y + modalHeight > window.innerHeight - margin) {
    y = rect.top - modalHeight - gap;
  }

  if (x + modalWidth > window.innerWidth - margin) {
    x = window.innerWidth - modalWidth - margin;
  }
  if (x < margin) {
    x = margin;
  }

  if (y < margin) {
    y = margin;
  }

  return { x, y };
}

function calculateToolbarPosition(rect: SelectionRect): { x: number; y: number } {
  const toolbarWidth = 60;
  const toolbarHeight = 28;
  const gap = 8;

  let x = rect.left + (rect.right - rect.left) / 2 - toolbarWidth / 2;
  let y = rect.top - toolbarHeight - gap;

  if (y < 16) {
    y = rect.bottom + gap;
  }

  if (x + toolbarWidth > window.innerWidth - 16) {
    x = window.innerWidth - toolbarWidth - 16;
  }
  if (x < 16) {
    x = 16;
  }

  if (y + toolbarHeight > window.innerHeight - 16) {
    y = window.innerHeight - toolbarHeight - 16;
  }

  return { x, y };
}

export default function App() {
  const [state, dispatch] = useAtom(appStateAtom);
  const sentenceAnalyzeIdRef = useRef(0);

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

  const reanalyzeSentenceRange = useCallback(
    async (
      newText: string,
      sentenceRange: SentenceRange,
      baseIssues: Issue[]
    ) => {
      const currentId = ++sentenceAnalyzeIdRef.current;
      const sentenceText = sentenceRange.coreText;
      if (!sentenceText.trim()) {
        return;
      }

      try {
        const response: ProcessResponse = await browser.runtime.sendMessage({
          type: "PROCESS_TEXT",
          action: "ANALYZE",
          text: sentenceText,
          options: {
            tone: state.tone,
          },
        });

        if (currentId !== sentenceAnalyzeIdRef.current) {
          return;
        }

        if (response.success && response.result) {
          const result = response.result as AnalyzeResult;
          const mergedIssues = mergeIssuesForSentence(
            newText,
            sentenceRange,
            baseIssues,
            result.issues || []
          );
          dispatch({
            type: "SET_RESULT",
            result: {
              corrected_text: newText,
              issues: mergedIssues,
            },
          });
        }
      } catch (err) {
        console.log("[Lintly] Sentence re-analysis failed:", err);
      }
    },
    [state.tone]
  );

  const handleApplyFix = useCallback(
    async (issue: Issue) => {
      if (!state.result || typeof state.result !== "object") {
        return;
      }

      const { issueContexts } = buildIssueSentenceContexts(state.sourceText, state.result.issues);
      const contextsBySentence = groupIssueContextsBySentence(issueContexts);
      const context = issueContexts.get(issue);

      if (!context) {
        const fallbackText = state.sourceText.replace(issue.original, issue.suggestion);
        dispatch({ type: "SET_SOURCE_TEXT", text: fallbackText });
        dispatch({
          type: "SET_RESULT",
          result: {
            corrected_text: fallbackText,
            issues: state.result.issues.filter((i) => i !== issue),
          },
        });
        return;
      }

      const sentenceContexts = contextsBySentence.get(context.sentenceIndex) || [];
      const correctedSentence = applyIssuesToSentence(
        context.sentence.coreText,
        sentenceContexts.length > 0 ? sentenceContexts : [context]
      );
      const newText =
        state.sourceText.slice(0, context.sentence.coreStart) +
        correctedSentence +
        state.sourceText.slice(context.sentence.coreEnd);

      dispatch({ type: "SET_SOURCE_TEXT", text: newText });

      const updatedSentenceRange =
        findSentenceRangeAt(getSentenceRanges(newText), context.sentence.coreStart) ??
        context.sentence;
      const sentenceIssueSet = new Set(sentenceContexts.map((ctx) => ctx.issue));
      const baseIssues =
        sentenceIssueSet.size > 0
          ? state.result.issues.filter((existing) => !sentenceIssueSet.has(existing))
          : state.result.issues.filter((existing) => existing !== issue);
      const clearedIssues = mergeIssuesForSentence(
        newText,
        updatedSentenceRange,
        baseIssues,
        []
      );

      dispatch({
        type: "SET_RESULT",
        result: {
          corrected_text: newText,
          issues: clearedIssues,
        },
      });
      await reanalyzeSentenceRange(newText, updatedSentenceRange, clearedIssues);
    },
    [state.result, state.sourceText, reanalyzeSentenceRange]
  );

  const handleApplyWordFix = useCallback(
    async (issue: Issue) => {
      if (!state.result || typeof state.result !== "object") {
        return;
      }

      const { issueContexts } = buildIssueSentenceContexts(state.sourceText, state.result.issues);
      const contextsBySentence = groupIssueContextsBySentence(issueContexts);
      const context = issueContexts.get(issue);
      const sentenceContexts = context
        ? contextsBySentence.get(context.sentenceIndex) || []
        : [];

      let newText = state.sourceText;
      let sentenceAnchor = -1;

      if (context) {
        newText =
          state.sourceText.slice(0, context.issueStart) +
          issue.suggestion +
          state.sourceText.slice(context.issueEnd);
        sentenceAnchor = context.sentence.coreStart;
      } else {
        const index = state.sourceText.indexOf(issue.original);
        if (index === -1) {
          return;
        }
        newText =
          state.sourceText.slice(0, index) +
          issue.suggestion +
          state.sourceText.slice(index + issue.original.length);
        sentenceAnchor = index;
      }

      dispatch({ type: "SET_SOURCE_TEXT", text: newText });

      const updatedSentenceRange =
        findSentenceRangeAt(getSentenceRanges(newText), sentenceAnchor) ??
        context?.sentence;

      if (!updatedSentenceRange) {
        dispatch({
          type: "SET_RESULT",
          result: {
            corrected_text: newText,
            issues: state.result.issues.filter((i) => i !== issue),
          },
        });
        return;
      }

      const sentenceIssueSet = new Set(sentenceContexts.map((ctx) => ctx.issue));
      const baseIssues =
        sentenceIssueSet.size > 0
          ? state.result.issues.filter((existing) => !sentenceIssueSet.has(existing))
          : state.result.issues.filter((existing) => existing !== issue);
      const clearedIssues = mergeIssuesForSentence(
        newText,
        updatedSentenceRange,
        baseIssues,
        []
      );

      dispatch({
        type: "SET_RESULT",
        result: {
          corrected_text: newText,
          issues: clearedIssues,
        },
      });

      await reanalyzeSentenceRange(newText, updatedSentenceRange, clearedIssues);
    },
    [state.result, state.sourceText, reanalyzeSentenceRange]
  );

  const handleApplyAllFixes = useCallback(() => {
    if (!state.result || typeof state.result !== "object" || state.result.issues.length === 0) {
      return;
    }

    let newText = state.sourceText;
    for (const issue of state.result.issues) {
      newText = newText.replace(issue.original, issue.suggestion);
    }
    dispatch({ type: "SET_SOURCE_TEXT", text: newText });

    dispatch({
      type: "SET_RESULT",
      result: {
        corrected_text: newText,
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

  // Auto-run reduces friction for selection-driven flows.
  useEffect(() => {
    if (state.isVisible && state.isLoading && state.sourceText && !state.result) {
      processText("ANALYZE");
    }
  }, [state.isVisible, state.isLoading, state.sourceText, state.result, processText]);

  useEffect(() => {
    console.log("[Lintly] Extension loaded successfully");
  }, []);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
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

      let rect = getSelectionRect(activeElement);

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

  // Avoid double UI when modal or toolbar is active.
  const inlineHighlightsEnabled = useMemo(
    () => !state.isVisible && !state.toolbarPosition,
    [state.isVisible, state.toolbarPosition]
  );

  return (
    <>
      <InlineHighlightManager isEnabled={inlineHighlightsEnabled} />

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
        onApplyWordFix={handleApplyWordFix}
        onApplyAllFixes={handleApplyAllFixes}
        onCopy={handleCopy}
        onReset={handleReset}
        onCustomSubmit={handleCustomSubmit}
      />
    </>
  );
}
