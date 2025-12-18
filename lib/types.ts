export type Action = "ANALYZE" | "SUMMARIZE" | "PARAPHRASE" | "TONE_REWRITE" | "CUSTOM";
export type Tone = "formal" | "casual" | "professional" | "friendly" | "academic";
export type Severity = "error" | "warning" | "suggestion";
export type IssueType = "grammar" | "spelling" | "punctuation" | "clarity" | "word_choice";

export interface Issue {
  type: IssueType;
  category: string;
  severity: Severity;
  original: string;
  suggestion: string;
  explanation: string;
}

export interface AnalyzeResult {
  corrected_text: string;
  issues: Issue[];
}

export interface ProcessRequest {
  type: "PROCESS_TEXT";
  action: Action;
  text: string;
  options?: {
    tone?: Tone;
    customInstruction?: string;
  };
}

export interface ProcessResponse {
  success: boolean;
  result?: string | AnalyzeResult;
  error?: string;
}

export interface OffscreenMessage {
  target: "offscreen";
  type: "GENERATE";
  action: Action;
  text: string;
  options?: {
    tone?: Tone;
    customInstruction?: string;
  };
}

export interface IssueWithPosition extends Issue {
  startOffset: number;
  endOffset: number;
}

export interface EditableState {
  elementId: string;
  text: string;
  issues: IssueWithPosition[];
  lastAnalyzed: number;
  isAnalyzing: boolean;
}

export interface BackgroundAnalyzeRequest {
  type: "BACKGROUND_ANALYZE";
  elementId: string;
  text: string;
}

export interface BackgroundAnalyzeResponse {
  success: boolean;
  elementId: string;
  issues?: IssueWithPosition[];
  error?: string;
}
