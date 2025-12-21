import type { Action, AnalyzeResult, OffscreenMessage, Tone } from "@/lib/types";
import {
  ANALYZE_SYSTEM,
  SUMMARIZE_SYSTEM,
  PARAPHRASE_SYSTEM,
  CUSTOM_SYSTEM,
  TONE_PROMPTS,
} from "@/lib/prompts";

const API_URL = "https://vllm.kernelvm.xyz/v1/chat/completions";
const MODEL = "moogin/lintly-lfm2-700m-dpo-new";

async function callAPI(systemPrompt: string, userText: string): Promise<string> {
  console.log("[Lintly API] Calling API with text:", userText.substring(0, 100) + "...");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
      temperature: 0.3,
      min_p: 0.15,
      repetition_penalty: 1.05,
    }),
  });

  console.log("[Lintly API] Response status:", res.status, res.statusText);

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  console.log("[Lintly API] Raw response:", JSON.stringify(data, null, 2));
  console.log("[Lintly API] Content:", data.choices[0].message.content);

  return data.choices[0].message.content;
}

function getSystemPrompt(action: Action, options?: { tone?: Tone; customInstruction?: string }): string {
  switch (action) {
    case "ANALYZE":
      return ANALYZE_SYSTEM;
    case "SUMMARIZE":
      return SUMMARIZE_SYSTEM;
    case "PARAPHRASE":
      return PARAPHRASE_SYSTEM;
    case "TONE_REWRITE":
      return options?.tone ? TONE_PROMPTS[options.tone] : TONE_PROMPTS.formal;
    case "CUSTOM":
      return options?.customInstruction
        ? `${CUSTOM_SYSTEM}\n\nInstructions: ${options.customInstruction}`
        : CUSTOM_SYSTEM;
    default:
      return ANALYZE_SYSTEM;
  }
}

async function processText(
  action: Action,
  text: string,
  options?: { tone?: Tone; customInstruction?: string }
): Promise<string | AnalyzeResult> {
  console.log("[Lintly API] Processing action:", action);
  const systemPrompt = getSystemPrompt(action, options);
  const response = await callAPI(systemPrompt, text);

  if (action === "ANALYZE") {
    try {
      const parsed = JSON.parse(response) as AnalyzeResult;
      console.log("[Lintly API] Parsed ANALYZE result:", parsed);
      return parsed;
    } catch (e) {
      console.log("[Lintly API] Failed to parse as JSON, using raw response:", e);
      return { corrected_text: response, issues: [] };
    }
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
