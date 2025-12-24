import { atomWithReducer } from "jotai/utils";
import type { Action, AnalyzeResult, Tone } from "@/lib/types";
import type { SelectionRect } from "@/lib/textPositioning";

type AppResult = string | AnalyzeResult | null;

export interface BulkUndoState {
  sourceText: string;
  result: AppResult;
  appliedCount: number;
  skippedCount: number;
  requestedCount: number;
  timestamp: number;
}

export interface AppState {
  isVisible: boolean;
  isLoading: boolean;
  sourceText: string;
  originalSourceText: string;
  tone: Tone;
  action: Action;
  result: AppResult;
  originalResult: AppResult;
  toolbarPosition: { x: number; y: number } | null;
  modalPosition: { x: number; y: number };
  selectionRect: SelectionRect | null;
  error: string | null;
  bulkUndo: BulkUndoState | null;
}

export type AppAction =
  | { type: "SHOW_MODAL"; text: string; position: { x: number; y: number }; autoRun?: boolean; action?: Action; tone?: Tone }
  | { type: "HIDE_MODAL" }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_RESULT"; result: AppResult }
  | { type: "SET_ERROR"; error: string }
  | { type: "SET_SOURCE_TEXT"; text: string }
  | { type: "SET_TONE"; tone: Tone }
  | { type: "SET_ACTION"; action: Action }
  | { type: "SHOW_TOOLBAR"; position: { x: number; y: number }; selectionRect: SelectionRect }
  | { type: "HIDE_TOOLBAR" }
  | { type: "RESET" }
  | { type: "SET_BULK_UNDO"; bulkUndo: BulkUndoState | null };

export const initialAppState: AppState = {
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
  bulkUndo: null,
};

export function appReducer(state: AppState, action: AppAction): AppState {
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
        action: action.action ?? "ANALYZE",
        tone: action.tone ?? state.tone,
        isLoading: !!action.autoRun,
        bulkUndo: null,
      };
    case "HIDE_MODAL":
      return {
        ...state,
        isVisible: false,
        result: null,
        originalResult: null,
        selectionRect: null,
        bulkUndo: null,
      };
    case "SET_LOADING":
      return { ...state, isLoading: action.loading };
    case "SET_RESULT": {
      const isFirstResult = state.originalResult === null;
      return {
        ...state,
        result: action.result,
        originalResult: isFirstResult ? action.result : state.originalResult,
        isLoading: false,
      };
    }
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
        bulkUndo: null,
      };
    case "SET_BULK_UNDO":
      return {
        ...state,
        bulkUndo: action.bulkUndo,
      };
    default:
      return state;
  }
}

// Keep reducer-style transitions so multi-field updates stay centralized.
export const appStateAtom = atomWithReducer(initialAppState, appReducer);
