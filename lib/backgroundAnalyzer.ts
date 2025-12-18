import type { EditableState, IssueWithPosition, BackgroundAnalyzeResponse, Issue } from "./types";
import { splitIntoSentences, getCached, setCached, TrackedSentence } from "./sentenceCache";

type AnalysisCallback = (state: EditableState) => void;

const editableStates = new Map<string, EditableState>();
const debounceTimers = new Map<string, number>();
const DEBOUNCE_MS = 500;
const BATCH_SIZE = 3;

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

export function scheduleAnalysis(elementId: string, text: string, immediate = false): void {
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

  if (immediate) {
    debounceTimers.delete(elementId);
    runIncrementalAnalysis(elementId);
    return;
  }

  const timer = window.setTimeout(() => {
    debounceTimers.delete(elementId);
    runIncrementalAnalysis(elementId);
  }, DEBOUNCE_MS);

  debounceTimers.set(elementId, timer);
}

async function runIncrementalAnalysis(elementId: string): Promise<void> {
  const state = editableStates.get(elementId);
  if (!state || state.isAnalyzing) return;

  state.isAnalyzing = true;

  const sentences = splitIntoSentences(state.text);

  if (sentences.length === 0) {
    state.issues = [];
    state.isAnalyzing = false;
    state.lastAnalyzed = Date.now();
    if (onAnalysisComplete) onAnalysisComplete(state);
    return;
  }

  const allIssues: IssueWithPosition[] = [];
  const uncached: TrackedSentence[] = [];

  for (const sentence of sentences) {
    const cached = getCached(sentence.hash);
    if (cached) {
      for (const issue of cached.issues) {
        const issueInSentence = sentence.text.indexOf(issue.original);
        if (issueInSentence !== -1) {
          allIssues.push({
            ...issue,
            startOffset: sentence.startOffset + issueInSentence,
            endOffset: sentence.startOffset + issueInSentence + issue.original.length,
          });
        }
      }
    } else {
      uncached.push(sentence);
    }
  }

  if (allIssues.length > 0) {
    state.issues = [...allIssues];
    if (onAnalysisComplete) onAnalysisComplete(state);
  }

  for (let i = 0; i < uncached.length; i += BATCH_SIZE) {
    const batch = uncached.slice(i, i + BATCH_SIZE);
    const batchText = batch.map((s) => s.text).join(" ");

    try {
      const response: BackgroundAnalyzeResponse = await browser.runtime.sendMessage({
        type: "BACKGROUND_ANALYZE",
        elementId,
        text: batchText,
      });

      if (response.success && response.issues) {
        const issuesBySentence = new Map<string, Issue[]>();

        for (const sentence of batch) {
          issuesBySentence.set(sentence.hash, []);
        }

        for (const issue of response.issues) {
          for (const sentence of batch) {
            const issueInSentence = sentence.text.indexOf(issue.original);
            if (issueInSentence !== -1) {
              issuesBySentence.get(sentence.hash)!.push(issue);

              allIssues.push({
                ...issue,
                startOffset: sentence.startOffset + issueInSentence,
                endOffset: sentence.startOffset + issueInSentence + issue.original.length,
              });
              break;
            }
          }
        }

        for (const sentence of batch) {
          const sentenceIssues = issuesBySentence.get(sentence.hash) || [];
          setCached(sentence.hash, sentence.text, sentenceIssues);
        }

        state.issues = [...allIssues];
        if (onAnalysisComplete) onAnalysisComplete(state);
      } else {
        for (const sentence of batch) {
          setCached(sentence.hash, sentence.text, []);
        }
      }
    } catch (err) {
      console.error("[Lintly] Analysis error:", err);
      for (const sentence of batch) {
        setCached(sentence.hash, sentence.text, []);
      }
    }
  }

  state.isAnalyzing = false;
  state.lastAnalyzed = Date.now();
}

export function clearState(elementId: string): void {
  editableStates.delete(elementId);
  const timer = debounceTimers.get(elementId);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(elementId);
  }
}
