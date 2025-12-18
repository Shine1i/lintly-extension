import type { EditableState, IssueWithPosition, BackgroundAnalyzeResponse } from "./types";
import { chunkTextWithOffsets } from "./textChunker";

type AnalysisCallback = (state: EditableState) => void;

const editableStates = new Map<string, EditableState>();
const debounceTimers = new Map<string, number>();
const DEBOUNCE_MS = 400;

let onAnalysisComplete: AnalysisCallback | null = null;

export function setAnalysisCallback(callback: AnalysisCallback): void {
  onAnalysisComplete = callback;
}

export function getEditableState(elementId: string): EditableState | undefined {
  return editableStates.get(elementId);
}

export function getAllStates(): Map<string, EditableState> {
  return editableStates;
}

export function scheduleAnalysis(elementId: string, text: string): void {
  const existingTimer = debounceTimers.get(elementId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  let state = editableStates.get(elementId);
  if (!state) {
    state = {
      elementId,
      text,
      issues: [],
      lastAnalyzed: 0,
      isAnalyzing: false,
    };
    editableStates.set(elementId, state);
  } else {
    state.text = text;
  }

  const timer = window.setTimeout(() => {
    debounceTimers.delete(elementId);
    runAnalysis(elementId);
  }, DEBOUNCE_MS);

  debounceTimers.set(elementId, timer);
}

async function runAnalysis(elementId: string): Promise<void> {
  const state = editableStates.get(elementId);
  if (!state || state.isAnalyzing) return;

  state.isAnalyzing = true;
  const chunks = chunkTextWithOffsets(state.text);

  if (chunks.length === 0) {
    state.issues = [];
    state.isAnalyzing = false;
    state.lastAnalyzed = Date.now();
    if (onAnalysisComplete) onAnalysisComplete(state);
    return;
  }

  const allIssues: IssueWithPosition[] = [];

  for (const chunk of chunks) {
    try {
      const response: BackgroundAnalyzeResponse = await browser.runtime.sendMessage({
        type: "BACKGROUND_ANALYZE",
        elementId,
        text: chunk.text,
      });

      if (response.success && response.issues) {
        for (const issue of response.issues) {
          allIssues.push({
            ...issue,
            startOffset: issue.startOffset + chunk.startOffset,
            endOffset: issue.endOffset + chunk.startOffset,
          });
        }
      }
    } catch (err) {
      console.error("Background analysis error:", err);
    }
  }

  state.issues = allIssues;
  state.isAnalyzing = false;
  state.lastAnalyzed = Date.now();

  if (onAnalysisComplete) onAnalysisComplete(state);
}

export function clearState(elementId: string): void {
  editableStates.delete(elementId);
  const timer = debounceTimers.get(elementId);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(elementId);
  }
}
