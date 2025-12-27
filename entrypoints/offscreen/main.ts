import type {
  Action,
  AnalyzeResult,
  OffscreenMessage,
  Tone,
} from "@/lib/types";
import {
  SYSTEM_PROMPT,
  USER_PROMPT_PREFIXES,
  TONE_PROMPT_PREFIX,
  TONE_PROMPT_SUFFIX,
} from "@/lib/prompts";
import { generateIssuesFromDiff } from "@/lib/issueOffsets";

const API_URL = "https://vllm.kernelvm.xyz/v1/chat/completions";
const MODEL = "/app/models/Typix-1.5re5-merged";
// const API_URL = "https://openai.studyon.app/api/chat/completions";
// const MODEL = "google/gemini-2.5-flash-lite";

type UrlToken = { placeholder: string; url: string };

const sentenceSegmenter =
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? new Intl.Segmenter("en", { granularity: "sentence" })
    : null;

const URL_REGEX =
  /\b(?:https?:\/\/|www\.)[^\s<>()]+|\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,})(?:\/[^\s<>()]*)?/gi;
const URL_PLACEHOLDER_REGEX = /\[\[URL_\d+\]\]/g;
const TRAILING_URL_PUNCTUATION = /[)\].,!?;:'"]$/;
const MIN_LETTERS_FOR_ANALYSIS = 2;
const MIN_LETTER_RATIO = 0.3;

function splitTrailingPunctuation(value: string): { url: string; trailing: string } {
  let url = value;
  let trailing = "";
  while (url && TRAILING_URL_PUNCTUATION.test(url)) {
    trailing = url.slice(-1) + trailing;
    url = url.slice(0, -1);
  }
  return { url, trailing };
}

function maskUrls(text: string): { maskedText: string; tokens: UrlToken[] } {
  const tokens: UrlToken[] = [];
  if (!text) {
    return { maskedText: text, tokens };
  }

  const maskedText = text.replace(URL_REGEX, (match) => {
    const { url, trailing } = splitTrailingPunctuation(match);
    const placeholder = `[[URL_${tokens.length}]]`;
    tokens.push({ placeholder, url });
    return `${placeholder}${trailing}`;
  });

  return { maskedText, tokens };
}

function restoreUrls(text: string, tokens: UrlToken[]): string {
  if (!tokens.length) return text;
  let restored = text;
  for (const { placeholder, url } of tokens) {
    restored = restored.split(placeholder).join(url);
  }
  return restored;
}

function shouldAnalyzeSentence(maskedText: string): boolean {
  const withoutUrls = maskedText.replace(URL_PLACEHOLDER_REGEX, "");
  const cleaned = withoutUrls.replace(/\s+/g, " ").trim();
  if (!cleaned) return false;

  const letters = cleaned.match(/\p{L}/gu)?.length ?? 0;
  if (letters < MIN_LETTERS_FOR_ANALYSIS) return false;

  const compact = cleaned.replace(/\s/g, "");
  if (!compact) return false;

  const letterRatio = letters / compact.length;
  return letterRatio >= MIN_LETTER_RATIO;
}

// Split text into sentences while preserving delimiters and whitespace
function splitIntoSentences(text: string): { sentence: string; isContent: boolean }[] {
  if (!text) return [];

  if (sentenceSegmenter) {
    const parts: { sentence: string; isContent: boolean }[] = [];
    for (const segment of sentenceSegmenter.segment(text)) {
      const sentence = segment.segment;
      parts.push({ sentence, isContent: sentence.trim().length > 0 });
    }
    return parts.length > 0 ? parts : [{ sentence: text, isContent: text.trim().length > 0 }];
  }

  // Match sentences ending with . ! ? (with optional quotes) followed by whitespace or end.
  const sentenceRegex = /[^.!?]*[.!?]+(?:["']?(?:\s+|$))/g;
  const parts: { sentence: string; isContent: boolean }[] = [];
  let lastIndex = 0;
  let match;

  while ((match = sentenceRegex.exec(text)) !== null) {
    // Add any text before this match that wasn't captured
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index);
      if (before) {
        parts.push({ sentence: before, isContent: before.trim().length > 0 });
      }
    }
    parts.push({ sentence: match[0], isContent: match[0].trim().length > 0 });
    lastIndex = sentenceRegex.lastIndex;
  }

  // Add remaining text
  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    parts.push({ sentence: remaining, isContent: remaining.trim().length > 0 });
  }

  // If no sentences found, return the whole text
  if (parts.length === 0 && text.length > 0) {
    parts.push({ sentence: text, isContent: text.trim().length > 0 });
  }

  return parts;
}

async function callAPI(
  systemPrompt: string,
  userText: string
): Promise<string> {
  console.log(
    "[Typix API] Calling API with text:",
    userText.substring(0, 100) + "..."
  );

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      temperature: 0.2,
      // temperature: 0.3,
      min_p: 0.15,
      repetition_penalty: 1.05,
    }),
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  return data.choices[0].message.content;
}

function getUserMessage(
  action: Action,
  text: string,
  options?: { tone?: Tone; customInstruction?: string }
): string {
  switch (action) {
    case "ANALYZE":
      return `${USER_PROMPT_PREFIXES.ANALYZE}${text}${USER_PROMPT_PREFIXES.ANALYZE_SUFFIX}`;
    case "SUMMARIZE":
      return `${USER_PROMPT_PREFIXES.SUMMARIZE}${text}${USER_PROMPT_PREFIXES.SUMMARIZE_SUFFIX}`;
    case "PARAPHRASE":
      return `${USER_PROMPT_PREFIXES.PARAPHRASE}${text}${USER_PROMPT_PREFIXES.PARAPHRASE_SUFFIX}`;
    case "TONE_REWRITE": {
      const tone = options?.tone || "formal";
      return `${TONE_PROMPT_PREFIX[tone]}${text}${TONE_PROMPT_SUFFIX}`;
    }
    case "CUSTOM": {
      const instruction = options?.customInstruction || "";
      return `${USER_PROMPT_PREFIXES.CUSTOM}${instruction}\n${text}${USER_PROMPT_PREFIXES.CUSTOM_SUFFIX}`;
    }
    default:
      return `${USER_PROMPT_PREFIXES.ANALYZE}${text}${USER_PROMPT_PREFIXES.ANALYZE_SUFFIX}`;
  }
}

async function processSentencesInParallel(text: string): Promise<string> {
  const parts = splitIntoSentences(text);
  console.log("[Typix API] Split into", parts.length, "parts");

  // Process all sentences in parallel
  const results = await Promise.all(
    parts.map(async ({ sentence, isContent }, index) => {
      // Skip non-content (whitespace only)
      if (!isContent) {
        return sentence;
      }

      const trimmedSentence = sentence.trim();
      const { maskedText, tokens } = maskUrls(trimmedSentence);
      if (!shouldAnalyzeSentence(maskedText)) {
        return sentence;
      }

      // Call API
      console.log(`[Typix API] Processing sentence ${index + 1}:`, trimmedSentence.substring(0, 30) + "...");
      const userMessage = getUserMessage("ANALYZE", maskedText);
      const corrected = await callAPI(SYSTEM_PROMPT, userMessage);
      const trimmedCorrected = corrected.trim();
      if (tokens.length > 0 && tokens.some(({ placeholder }) => !trimmedCorrected.includes(placeholder))) {
        return sentence;
      }
      const restoredCorrected = restoreUrls(trimmedCorrected, tokens);

      // Preserve original whitespace around the sentence
      const leadingWs = sentence.match(/^\s*/)?.[0] || "";
      const trailingWs = sentence.match(/\s*$/)?.[0] || "";
      return leadingWs + restoredCorrected + trailingWs;
    })
  );

  return results.join("");
}

async function processText(
  action: Action,
  text: string,
  options?: { tone?: Tone; customInstruction?: string }
): Promise<string | AnalyzeResult> {
  console.log("[Typix API] Processing action:", action);

  if (action === "ANALYZE") {
    // Process sentences in parallel for faster results
    const correctedText = await processSentencesInParallel(text);
    console.log(
      "[Typix API] Corrected text:",
      correctedText.substring(0, 100) + "..."
    );
    const result = generateIssuesFromDiff(text, correctedText);
    console.log("[Typix API] Generated issues:", result.issues.length);
    return result;
  }

  const userMessage = getUserMessage(action, text, options);
  const response = await callAPI(SYSTEM_PROMPT, userMessage);

  return response;
}

browser.runtime.onMessage.addListener((msg: OffscreenMessage, _, respond) => {
  console.log("[Typix API] Received message:", msg);

  if (msg.target !== "offscreen" || msg.type !== "GENERATE") {
    console.log("[Typix API] Ignoring message (wrong target/type)");
    return;
  }

  processText(msg.action, msg.text, msg.options)
    .then((result) => {
      console.log("[Typix API] Sending success response:", result);
      respond({ success: true, result });
    })
    .catch((e: Error) => {
      console.log("[Typix API] Sending error response:", e.message);
      respond({ success: false, error: e.message });
    });

  return true;
});
