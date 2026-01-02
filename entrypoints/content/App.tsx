import { useEffect, useCallback, useMemo, useRef } from "react";
import { useAtom } from "jotai";
import { TypixModal } from "@/components/typix/TypixModal";
import { SelectionToolbar } from "@/components/typix/SelectionToolbar";
import { InlineHighlightManager } from "@/components/typix/InlineHighlightManager";
import {
  applySelectionSnapshot,
  captureSelectionSnapshot,
  getSelectionRect,
  getExplicitIssueRange,
  isWordWebEditor,
  type SelectionRect,
  type SelectionSnapshot,
} from "@/lib/textPositioning";
import type { Action, AnalyzeResult, Issue, ProcessResponse, Tone, FeedbackMessage } from "@/lib/types";
import { appStateAtom } from "@/lib/state/typixAppState";
import {
  applyIssuesToSentence,
  buildIssueSentenceContexts,
  findSentenceRangeAt,
  getSentenceRanges,
  groupIssueContextsBySentence,
  type SentenceRange,
} from "@/lib/sentences";
import { mergeIssuesForSentence } from "@/lib/issueMerge";
import { trackEvent } from "@/lib/analytics";

function submitFeedback(
  requestId: string | null,
  issueCount?: number
) {
  console.log("[submitFeedback] requestId:", requestId, "issueCount:", issueCount);
  if (!requestId) {
    console.log("[submitFeedback] No requestId, skipping");
    return;
  }
  const msg: FeedbackMessage = {
    type: "SUBMIT_FEEDBACK",
    requestId,
    issueCount,
  };
  browser.runtime.sendMessage(msg).catch((err) => {
    console.error("[submitFeedback] Error sending message:", err);
  });
}

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
  const toolbarWidth = 280;
  const toolbarHeight = 36;
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
  const processIdRef = useRef(0);
  const selectionSnapshotRef = useRef<SelectionSnapshot | null>(null);

  const processText = useCallback(
    async (actionOverride?: Action, customInstruction?: string, textOverride?: string) => {
      const actionToUse = actionOverride || state.action;
      const textToUse = textOverride ?? state.sourceText;
      if (!textToUse.trim()) return;

      dispatch({ type: "SET_LOADING", loading: true });
      const currentId = ++processIdRef.current;

      try {
        console.log("[App] Sending PROCESS_TEXT request...");
        const response: ProcessResponse = await browser.runtime.sendMessage({
          type: "PROCESS_TEXT",
          action: customInstruction ? "CUSTOM" : actionToUse,
          text: textToUse,
          options: {
            tone: state.tone,
            customInstruction: customInstruction || undefined,
          },
        });
        console.log("[App] Got response:", response?.success, "requestId:", response?.requestId);

        if (currentId !== processIdRef.current) {
          console.log("[App] Request outdated, ignoring");
          return;
        }

        if (response.success && response.result) {
          console.log("[App] Setting result with requestId:", response.requestId);
          dispatch({ type: "SET_RESULT", result: response.result, requestId: response.requestId });
        } else {
          dispatch({ type: "SET_ERROR", error: response.error || "Unknown error" });
        }
      } catch (err) {
        console.error("[App] Error in processText:", err);
        if (currentId !== processIdRef.current) {
          return;
        }
        dispatch({ type: "SET_ERROR", error: String(err) });
      }
    },
    [dispatch, state.sourceText, state.action, state.tone]
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
    processIdRef.current++;
    dispatch({ type: "RESET" });
  }, [dispatch]);

  const handleRetry = useCallback(() => {
    dispatch({ type: "SET_ERROR", error: null });
    processText();
  }, [dispatch, processText]);

  useEffect(() => {
    if (!state.isVisible) {
      selectionSnapshotRef.current = null;
    }
  }, [state.isVisible]);

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
      } catch {
        // Re-analysis failed - ignore
      }
    },
    [dispatch, state.tone]
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
        const explicitRange = getExplicitIssueRange(state.sourceText, issue);
        if (!explicitRange && !issue.original) {
          return;
        }
        const fallbackText = explicitRange
          ? state.sourceText.slice(0, explicitRange.start) +
            issue.suggestion +
            state.sourceText.slice(explicitRange.end)
          : state.sourceText.replace(issue.original, issue.suggestion);
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

      // Track updated issue_count only (acceptance removed)
      submitFeedback(state.requestId, state.result.issues.length);

      await reanalyzeSentenceRange(newText, updatedSentenceRange, clearedIssues);
    },
    [dispatch, state.result, state.sourceText, state.requestId, reanalyzeSentenceRange]
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
        const explicitRange = getExplicitIssueRange(state.sourceText, issue);
        if (explicitRange) {
          newText =
            state.sourceText.slice(0, explicitRange.start) +
            issue.suggestion +
            state.sourceText.slice(explicitRange.end);
          sentenceAnchor = explicitRange.start;
        } else if (issue.original) {
          const index = state.sourceText.indexOf(issue.original);
          if (index === -1) {
            return;
          }
          newText =
            state.sourceText.slice(0, index) +
            issue.suggestion +
            state.sourceText.slice(index + issue.original.length);
          sentenceAnchor = index;
        } else {
          return;
        }
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

      // Track updated issue_count only (acceptance removed)
      submitFeedback(state.requestId, state.result.issues.length);

      await reanalyzeSentenceRange(newText, updatedSentenceRange, clearedIssues);
    },
    [dispatch, state.result, state.sourceText, state.requestId, reanalyzeSentenceRange]
  );

  const handleCustomSubmit = useCallback(
    (instruction: string) => {
      processText("CUSTOM", instruction);
    },
    [processText]
  );

  const handleInsert = useCallback(() => {
    const text =
      state.result && typeof state.result === "object"
        ? state.result.corrected_text
        : typeof state.result === "string"
          ? state.result
          : state.sourceText;

    const activeElement = document.activeElement;
    const storedSnapshot = selectionSnapshotRef.current;
    const applied =
      applySelectionSnapshot(storedSnapshot, text) ||
      applySelectionSnapshot(captureSelectionSnapshot(activeElement), text);
    if (applied) {
      const issueCount =
        state.result && typeof state.result === "object"
          ? state.result.issues.length
          : undefined;
      submitFeedback(state.requestId, issueCount);
    }
    selectionSnapshotRef.current = null;
    dispatch({ type: "HIDE_MODAL" });
  }, [dispatch, state.result, state.sourceText, state.requestId]);

  const handleApplyAll = useCallback(() => {
    if (!state.result || typeof state.result !== "object" || state.result.issues.length === 0) {
      return;
    }

    const issues = state.result.issues;
    let newText = state.sourceText;
    let appliedCount = 0;
    let skippedCount = 0;

    const sortedIssues = [...issues].sort((a, b) => {
      const aIndex = newText.indexOf(a.original);
      const bIndex = newText.indexOf(b.original);
      return bIndex - aIndex;
    });

    for (const issue of sortedIssues) {
      const index = newText.indexOf(issue.original);
      if (index !== -1) {
        newText =
          newText.slice(0, index) +
          issue.suggestion +
          newText.slice(index + issue.original.length);
        appliedCount++;
      } else {
        skippedCount++;
      }
    }

    dispatch({ type: "SET_SOURCE_TEXT", text: newText });
    dispatch({
      type: "SET_RESULT",
      result: {
        corrected_text: newText,
        issues: [],
      },
    });

    trackEvent("bulk_accept", {
      source: "apply_all",
      requestedCount: issues.length,
      appliedCount,
      skippedCount,
    });

    submitFeedback(state.requestId, issues.length);
  }, [dispatch, state.result, state.sourceText, state.requestId]);

  const handleToolbarAction = useCallback((action: Action, tone?: Tone) => {
    const activeElement = document.activeElement;
    let text = "";

    if (activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLInputElement) {
      const start = activeElement.selectionStart ?? 0;
      const end = activeElement.selectionEnd ?? 0;
      text = activeElement.value.slice(start, end).trim();
    } else {
      text = window.getSelection()?.toString().trim() || "";
    }

    const snapshot = captureSelectionSnapshot(activeElement);
    if (snapshot) {
      selectionSnapshotRef.current = snapshot;
    }
    const rect = state.selectionRect || getSelectionRect(activeElement);
    if (text && rect) {
      const position = calculateModalPosition(rect);
      dispatch({ type: "SHOW_MODAL", text, position, autoRun: true, action, tone });
    }
  }, [dispatch, state.selectionRect]);

  // Auto-run reduces friction for selection-driven flows.
  useEffect(() => {
    if (state.isVisible && state.isLoading && state.sourceText && !state.result) {
      processText(state.action);
    }
  }, [state.isVisible, state.isLoading, state.sourceText, state.result, state.action, processText]);


  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "l") {
        e.preventDefault();

        const activeElement = document.activeElement;
        let text = "";

        if (activeElement instanceof HTMLTextAreaElement || activeElement instanceof HTMLInputElement) {
          const start = activeElement.selectionStart ?? 0;
          const end = activeElement.selectionEnd ?? 0;
          text = activeElement.value.slice(start, end).trim();
        } else {
          text = window.getSelection()?.toString().trim() || "";
        }

        const snapshot = captureSelectionSnapshot(activeElement);
        if (snapshot) {
          selectionSnapshotRef.current = snapshot;
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

      // Only show toolbar for textarea, input, or contenteditable elements
      const isTextarea = activeElement instanceof HTMLTextAreaElement;
      const isInput = activeElement instanceof HTMLInputElement;
      const isContentEditable = activeElement instanceof HTMLElement && activeElement.isContentEditable;

      if (!isTextarea && !isInput && !isContentEditable) {
        dispatch({ type: "HIDE_TOOLBAR" });
        return;
      }

      let text = "";
      if (isTextarea || isInput) {
        const el = activeElement as HTMLTextAreaElement | HTMLInputElement;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? 0;
        text = el.value.slice(start, end).trim();
      } else {
        text = window.getSelection()?.toString().trim() || "";
      }

      if (!text || text.length === 0) {
        dispatch({ type: "HIDE_TOOLBAR" });
        return;
      }

      const snapshot = captureSelectionSnapshot(activeElement);
      if (snapshot) {
        selectionSnapshotRef.current = snapshot;
      }
      let rect = getSelectionRect(activeElement);

      if (!rect || (rect.top === 0 && rect.left === 0)) {
        rect = {
          top: e.clientY - 10,
          bottom: e.clientY + 10,
          left: e.clientX - 50,
          right: e.clientX + 50,
        };
      }

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
  const showInsertButton = useMemo(() => {
    const snapshot = selectionSnapshotRef.current;
    if (snapshot?.kind === "contentEditable") {
      return !isWordWebEditor(snapshot.element);
    }
    return true;
  }, [state.isVisible]);

  return (
    <>
      <InlineHighlightManager isEnabled={inlineHighlightsEnabled} />

      {state.toolbarPosition && (
        <SelectionToolbar position={state.toolbarPosition} onAction={handleToolbarAction} />
      )}

      <TypixModal
        isVisible={state.isVisible}
        position={state.modalPosition}
        onClose={() => dispatch({ type: "HIDE_MODAL" })}
        sourceText={state.sourceText}
        tone={state.tone}
        onToneChange={(tone) => dispatch({ type: "SET_TONE", tone })}
        isLoading={state.isLoading}
        result={state.result}
        error={state.error}
        onRetry={handleRetry}
        onApplyFix={handleApplyFix}
        onApplyWordFix={handleApplyWordFix}
        onCopy={handleCopy}
        onReset={handleReset}
        onCustomSubmit={handleCustomSubmit}
        onInsert={handleInsert}
        onApplyAll={handleApplyAll}
        showInsert={showInsertButton}
      />
    </>
  );
}
