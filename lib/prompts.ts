import type { Tone } from "./types";

export const SYSTEM_PROMPT = `You are a writing assistant that edits text. Follow the user's instruction precisely, preserving meaning and tone unless the instruction asks to change them. Return only the revised text.`;

export const USER_PROMPT_PREFIXES = {
  ANALYZE: "Fix grammar, spelling, punctuation, and capitalization errors in the text below. Return only the corrected text:\n",
  SUMMARIZE: "Summarize this text concisely in up to three sentences:\n",
  PARAPHRASE: "Paraphrase this text while preserving the meaning:\n",
  CUSTOM: "Follow the instruction and return only the rewritten text:\n",
};

export const TONE_PROMPT_PREFIX: Record<Tone, string> = {
  formal: "Rewrite the text in a formal tone while preserving all meaning:\n",
  casual: "Rewrite the text in a casual tone while preserving all meaning:\n",
  professional: "Rewrite the text in a professional tone while preserving all meaning:\n",
  friendly: "Rewrite the text in a friendly tone while preserving all meaning:\n",
  academic: "Rewrite the text in an academic tone while preserving all meaning:\n",
};
