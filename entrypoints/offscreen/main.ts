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

// Split text into sentences while preserving delimiters and whitespace
function splitIntoSentences(text: string): { sentence: string; isContent: boolean }[] {
  // Match sentences ending with . ! ? (with optional quotes) followed by space or end
  const sentenceRegex = /[^.!?]*[.!?]+["']?\s*/g;
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
    "[Lintly API] Calling API with text:",
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
  console.log("[Lintly API] Split into", parts.length, "parts");

  // Process all sentences in parallel
  const results = await Promise.all(
    parts.map(async ({ sentence, isContent }, index) => {
      // Skip non-content (whitespace only)
      if (!isContent) {
        return sentence;
      }

      const trimmedSentence = sentence.trim();

      // Call API
      console.log(`[Lintly API] Processing sentence ${index + 1}:`, trimmedSentence.substring(0, 30) + "...");
      const userMessage = getUserMessage("ANALYZE", trimmedSentence);
      const corrected = await callAPI(SYSTEM_PROMPT, userMessage);
      const trimmedCorrected = corrected.trim();

      // Preserve original whitespace around the sentence
      const leadingWs = sentence.match(/^\s*/)?.[0] || "";
      const trailingWs = sentence.match(/\s*$/)?.[0] || "";
      return leadingWs + trimmedCorrected + trailingWs;
    })
  );

  return results.join("");
}

async function processText(
  action: Action,
  text: string,
  options?: { tone?: Tone; customInstruction?: string }
): Promise<string | AnalyzeResult> {
  console.log("[Lintly API] Processing action:", action);

  if (action === "ANALYZE") {
    // Process sentences in parallel for faster results
    const correctedText = await processSentencesInParallel(text);
    console.log(
      "[Lintly API] Corrected text:",
      correctedText.substring(0, 100) + "..."
    );
    const result = generateIssuesFromDiff(text, correctedText);
    console.log("[Lintly API] Generated issues:", result.issues.length);
    return result;
  }

  const userMessage = getUserMessage(action, text, options);
  const response = await callAPI(SYSTEM_PROMPT, userMessage);

  return response;
}

browser.runtime.onMessage.addListener((msg: OffscreenMessage, _, respond) => {
  console.log("[Lintly API] Received message:", msg);

  if (msg.target !== "offscreen" || msg.type !== "GENERATE") {
    console.log("[Lintly API] Ignoring message (wrong target/type)");
    return;
  }

  processText(msg.action, msg.text, msg.options)
    .then((result) => {
      console.log("[Lintly API] Sending success response:", result);
      respond({ success: true, result });
    })
    .catch((e: Error) => {
      console.log("[Lintly API] Sending error response:", e.message);
      respond({ success: false, error: e.message });
    });

  return true;
});
