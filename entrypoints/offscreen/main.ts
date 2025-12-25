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
} from "@/lib/prompts";
import { generateIssuesFromDiff } from "@/lib/issueOffsets";

const API_URL = "https://vllm.kernelvm.xyz/v1/chat/completions";
const MODEL = "moogin/typix-experimental4";
// const API_URL = "https://openai.studyon.app/api/chat/completions";
// const MODEL = "google/gemini-2.5-flash-lite";

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
      return `${USER_PROMPT_PREFIXES.ANALYZE}${text}`;
    case "SUMMARIZE":
      return `${USER_PROMPT_PREFIXES.SUMMARIZE}${text}`;
    case "PARAPHRASE":
      return `${USER_PROMPT_PREFIXES.PARAPHRASE}${text}`;
    case "TONE_REWRITE": {
      const tone = options?.tone || "formal";
      return `${TONE_PROMPT_PREFIX[tone]}${text}`;
    }
    case "CUSTOM": {
      const instruction = options?.customInstruction || "";
      return `${USER_PROMPT_PREFIXES.CUSTOM}${instruction}\n\n${text}`;
    }
    default:
      return `${USER_PROMPT_PREFIXES.ANALYZE}${text}`;
  }
}

async function processText(
  action: Action,
  text: string,
  options?: { tone?: Tone; customInstruction?: string }
): Promise<string | AnalyzeResult> {
  console.log("[Lintly API] Processing action:", action);
  const userMessage = getUserMessage(action, text, options);

  const response = await callAPI(SYSTEM_PROMPT, userMessage);

  if (action === "ANALYZE") {
    // Model returns just the corrected text, generate issues from diff
    const correctedText = response;
    console.log("[Lintly API] Corrected text:", correctedText.substring(0, 100) + "...");
    const result = generateIssuesFromDiff(text, correctedText);
    console.log("[Lintly API] Generated issues:", result.issues.length);
    return result;
  }

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
