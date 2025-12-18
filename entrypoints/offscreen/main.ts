import type { Action, AnalyzeResult, OffscreenMessage, Tone } from "@/lib/types";
import {
  ANALYZE_SYSTEM,
  SUMMARIZE_SYSTEM,
  PARAPHRASE_SYSTEM,
  CUSTOM_SYSTEM,
  TONE_PROMPTS,
} from "@/lib/prompts";

const API_URL = "http://192.168.0.147:8000/v1/chat/completions";
const MODEL = "moogin/lintly-lfm2-700m-dpo-final";

async function callAPI(systemPrompt: string, userText: string): Promise<string> {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userText },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
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
  const systemPrompt = getSystemPrompt(action, options);
  const response = await callAPI(systemPrompt, text);

  if (action === "ANALYZE") {
    try {
      return JSON.parse(response) as AnalyzeResult;
    } catch {
      return { corrected_text: response, issues: [] };
    }
  }

  return response;
}

browser.runtime.onMessage.addListener((msg: OffscreenMessage, _, respond) => {
  if (msg.target !== "offscreen" || msg.type !== "GENERATE") return;

  processText(msg.action, msg.text, msg.options)
    .then((result) => respond({ success: true, result }))
    .catch((e: Error) => respond({ success: false, error: e.message }));

  return true;
});
