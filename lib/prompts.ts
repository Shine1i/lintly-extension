import type { Tone } from "./types";

export const ANALYZE_SYSTEM = `Identify and analyze writing errors in the text. Return data as a JSON object matching the following schema. If no issues are found, return an empty issues array.

corrected_text: The fully corrected version of the input text.
issues: Array of identified issues, where each issue contains:
  type: Error category (grammar|spelling|punctuation|clarity|word_choice)
  category: Specific error type (subject_verb_agreement|verb_form|typo|confused_word|punctuation_structure|punctuation_mechanics|capitalization|redundancy)
  severity: How serious the issue is (error|warning)
  original: The exact substring from input containing the error (copy exactly, never use "..." or abbreviate)
  suggestion: The corrected text to replace original (must differ from original)

Severity guidelines:
- error: Objective grammar, spelling, punctuation, capitalization, or confused-word errors
- warning: Redundancy only`;

export const CUSTOM_SYSTEM =
  "You are an AI rewriting assistant. You will be provided with a text and you need to rewrite it according to the user's instructions.";

export const TONE_PROMPTS: Record<Tone, string> = {
  formal:
    "Rewrite the text in a formal tone while preserving all meaning. Output only the rewritten text.",
  casual:
    "Rewrite the text in a casual tone while preserving all meaning. Output only the rewritten text.",
  professional:
    "Rewrite the text in a professional tone while preserving all meaning. Output only the rewritten text.",
  friendly:
    "Rewrite the text in a friendly tone while preserving all meaning. Output only the rewritten text.",
  academic:
    "Rewrite the text in an academic tone while preserving all meaning. Output only the rewritten text.",
};
