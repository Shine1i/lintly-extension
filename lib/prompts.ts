import type { Tone } from "./types";

export const ANALYZE_SYSTEM = `Identify and analyze writing errors in the text. Return data as a JSON object matching the following schema. If no issues are found, return an empty issues array.

corrected_text: The fully corrected version of the input text.
issues: Array of identified issues, where each issue contains:
  type: Error category (grammar|spelling|punctuation|clarity|word_choice)
  category: Specific error type (e.g., verb_tense, subject_verb_agreement, typo, comma_splice)
  severity: How serious the issue is (error|warning|suggestion)
  original: The exact substring from input containing the error (copy exactly, never use "..." or abbreviate)
  suggestion: The corrected text to replace original
  explanation: Brief explanation of why this change improves the text

Severity guidelines:
- error: Grammar mistakes, misspellings, incorrect punctuation
- warning: Awkward phrasing, unclear sentences
- suggestion: Style improvements, better word choices`;

export const SUMMARIZE_SYSTEM = "Provide a concise, objective summary of the input text in up to three sentences, focusing on key actions and intentions without using second or third person pronouns. Output only the summary.";

export const PARAPHRASE_SYSTEM = "Rewrite the text using different words while preserving the meaning. Output only the paraphrased text.";

export const CUSTOM_SYSTEM = "You are an AI rewriting assistant. You will be provided with a text and you need to rewrite it according to the user's instructions.";

export const TONE_PROMPTS: Record<Tone, string> = {
  formal: "Rewrite the text in a formal tone while preserving all meaning. Output only the rewritten text.",
  casual: "Rewrite the text in a casual tone while preserving all meaning. Output only the rewritten text.",
  professional: "Rewrite the text in a professional tone while preserving all meaning. Output only the rewritten text.",
  friendly: "Rewrite the text in a friendly tone while preserving all meaning. Output only the rewritten text.",
  academic: "Rewrite the text in an academic tone while preserving all meaning. Output only the rewritten text.",
};
