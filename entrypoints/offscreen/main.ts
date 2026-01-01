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
const MODELS_URL = "https://vllm.kernelvm.xyz/v1/models";
const FALLBACK_MODEL = "typix-medium-epo";

// Store token and action from background
let currentToken: string | undefined;
let currentAction: Action = "ANALYZE";

// Concurrency limiter to prevent overwhelming the server
class ConcurrencyLimiter {
  private queue: Array<{
    fn: () => Promise<unknown>;
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }> = [];
  private running = 0;

  constructor(private maxConcurrent = 5) {}

  async run<T>(fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        fn: fn as () => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
      this.processQueue();
    });
  }

  private async processQueue() {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) return;

    const item = this.queue.shift();
    if (!item) return;

    this.running++;
    try {
      const result = await item.fn();
      item.resolve(result);
    } catch (e) {
      item.reject(e);
    } finally {
      this.running--;
      this.processQueue();
    }
  }
}

const apiLimiter = new ConcurrencyLimiter(5);

let cachedModelName: string | null = null;

async function fetchModelName(): Promise<string> {
  if (cachedModelName) return cachedModelName;

  try {
    const res = await fetch(MODELS_URL);
    if (!res.ok) throw new Error(`Failed to fetch models: ${res.status}`);
    const data = await res.json();
    if (data?.data?.[0]?.id) {
      cachedModelName = data.data[0].id;
      return cachedModelName as string;
    }
  } catch {
    // Failed to fetch model, use fallback
  }

  cachedModelName = FALLBACK_MODEL;
  return cachedModelName;
}

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

function splitTrailingPunctuation(value: string): {
  url: string;
  trailing: string;
} {
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
function splitIntoSentences(
  text: string
): { sentence: string; isContent: boolean }[] {
  if (!text) return [];

  if (sentenceSegmenter) {
    const parts: { sentence: string; isContent: boolean }[] = [];
    for (const segment of sentenceSegmenter.segment(text)) {
      const sentence = segment.segment;
      parts.push({ sentence, isContent: sentence.trim().length > 0 });
    }
    return parts.length > 0
      ? parts
      : [{ sentence: text, isContent: text.trim().length > 0 }];
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

type Priority = "realtime" | "bulk";

async function callAPI(
  systemPrompt: string,
  userText: string,
  priority: Priority = "realtime"
): Promise<string> {
  const model = await fetchModelName();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Priority": priority,
    "X-Action": currentAction,
  };

  if (currentToken) {
    headers["Authorization"] = `Bearer ${currentToken}`;
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      temperature: 0.2,
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
      const instruction = options?.customInstruction || "Rewrite the text";
      return `${instruction}:\n<Text>\n${text}\n</Text>`;
    }
    default:
      return `${USER_PROMPT_PREFIXES.ANALYZE}${text}${USER_PROMPT_PREFIXES.ANALYZE_SUFFIX}`;
  }
}

async function processSentencesInParallel(text: string): Promise<string> {
  const parts = splitIntoSentences(text);

  // Count sentences that will actually need API calls
  const contentParts = parts.filter(
    ({ sentence, isContent }) =>
      isContent && shouldAnalyzeSentence(maskUrls(sentence.trim()).maskedText)
  );

  // Bulk = more than 3 sentences needing processing
  const priority: Priority = contentParts.length > 3 ? "bulk" : "realtime";

  // Process sentences with concurrency limit (max 5 parallel requests)
  const results = await Promise.all(
    parts.map(({ sentence, isContent }, index) =>
      apiLimiter.run(async () => {
        // Skip non-content (whitespace only)
        if (!isContent) {
          return sentence;
        }

        const trimmedSentence = sentence.trim();
        const { maskedText, tokens } = maskUrls(trimmedSentence);
        if (!shouldAnalyzeSentence(maskedText)) {
          return sentence;
        }

        const userMessage = getUserMessage("ANALYZE", maskedText);
        const corrected = await callAPI(SYSTEM_PROMPT, userMessage, priority);
        const trimmedCorrected = corrected.trim();
        if (
          tokens.length > 0 &&
          tokens.some(
            ({ placeholder }) => !trimmedCorrected.includes(placeholder)
          )
        ) {
          return sentence;
        }
        const restoredCorrected = restoreUrls(trimmedCorrected, tokens);

        // Preserve original whitespace around the sentence
        const leadingWs = sentence.match(/^\s*/)?.[0] || "";
        const trailingWs = sentence.match(/\s*$/)?.[0] || "";
        return leadingWs + restoredCorrected + trailingWs;
      })
    )
  );

  return results.join("");
}

async function processText(
  action: Action,
  text: string,
  options?: { tone?: Tone; customInstruction?: string }
): Promise<string | AnalyzeResult> {
  if (action === "ANALYZE") {
    const correctedText = await processSentencesInParallel(text);
    return generateIssuesFromDiff(text, correctedText);
  }

  const userMessage = getUserMessage(action, text, options);
  const response = await callAPI(SYSTEM_PROMPT, userMessage);

  return response;
}

browser.runtime.onMessage.addListener((msg: OffscreenMessage, _, respond) => {
  if (msg.target !== "offscreen" || msg.type !== "GENERATE") return;

  currentToken = msg.token;
  currentAction = msg.action;

  processText(msg.action, msg.text, msg.options)
    .then((result) => respond({ success: true, result }))
    .catch((e: Error) => respond({ success: false, error: e.message }));

  return true;
});
