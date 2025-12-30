import type { Tone } from "./types";

export const SYSTEM_PROMPT = `You are a writing assistant that edits text. Follow the user's instruction exactly. Preserve the original meaning unless the user asks to change it. Output only the revised text.`;

export const USER_PROMPT_PREFIXES = {
  ANALYZE: "Fix spelling and grammar. Make minimal changes. Return only the corrected text:\n<Text>\n",
  ANALYZE_SUFFIX: "\n</Text>",
  SUMMARIZE: "Summarize this text concisely in up to three sentences:\n<Text>\n",
  SUMMARIZE_SUFFIX: "\n</Text>",
  PARAPHRASE: "Paraphrase this text while preserving the meaning:\n<Text>\n",
  PARAPHRASE_SUFFIX: "\n</Text>",
};

export const TONE_PROMPT_PREFIX: Record<Tone, string> = {
  formal: "Rewrite the input text to make it more professional and formal while retaining its essential content:\n<Text>\n",
  casual: "Rewrite the input text to make it more casual and conversational while maintaining its main points:\n<Text>\n",
  friendly: "Rewrite the input text to make it more friendly and approachable while maintaining its main points:\n<Text>\n",
  academic: "Rewrite the input text to make it more academic and scholarly while retaining its essential content:\n<Text>\n",
};

export const TONE_PROMPT_SUFFIX = "\n</Text>";
