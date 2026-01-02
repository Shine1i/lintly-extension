export type Action = "ANALYZE" | "SUMMARIZE" | "PARAPHRASE" | "TONE_REWRITE" | "CUSTOM";
export type Tone = "formal" | "casual" | "friendly" | "academic";
export type Severity = "error" | "warning" | "suggestion";
export type IssueType = "grammar" | "spelling" | "punctuation" | "clarity" | "word_choice";

export interface Issue {
  type: IssueType;
  category: string;
  severity: Severity;
  original: string;
  suggestion: string;
  explanation: string;
  confidence?: number;
  start?: number;
  end?: number;
}

export interface AnalyzeResult {
  corrected_text: string;
  issues: Issue[];
}

export interface ProcessRequest {
  type: "PROCESS_TEXT";
  action: Action;
  text: string;
  sessionId?: string;
  editorKind?: string | null;
  editorSignature?: string | null;
  pageUrl?: string | null;
  options?: {
    tone?: Tone;
    customInstruction?: string;
    /** True when this is a partial re-analysis (avoid logging training data). */
    isPartial?: boolean;
  };
}

export interface ProcessResponse {
  success: boolean;
  result?: string | AnalyzeResult;
  error?: string;
  requestId?: string;
  issueCount?: number;
  perSentenceIssueCounts?: { sentenceIndex: number; count: number }[];
}

export interface OffscreenMessage {
  target: "offscreen";
  type: "GENERATE";
  action: Action;
  text: string;
  token?: string;
  sessionId?: string;
  editorKind?: string | null;
  editorSignature?: string | null;
  pageUrl?: string | null;
  options?: {
    tone?: Tone;
    customInstruction?: string;
  };
}

export interface FeedbackMessage {
  type: "SUBMIT_FEEDBACK";
  requestId: string;
  userEdit?: string;
  issueCount?: number;
}
