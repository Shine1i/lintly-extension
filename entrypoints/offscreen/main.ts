import { parse } from "@hoangvu12/yomi";
import { z } from "zod";
import type {
  Action,
  AnalyzeResult,
  OffscreenMessage,
  Tone,
} from "@/lib/types";
import {
  ANALYZE_SYSTEM,
  CUSTOM_SYSTEM,
  TONE_PROMPTS,
} from "@/lib/prompts";
import { assignIssueOffsetsFromCorrection } from "@/lib/issueOffsets";

const API_URL = "https://vllm.kernelvm.xyz/v1/chat/completions";
const MODEL = "moogin/typix-sft-exp2";
// const API_URL = "https://openai.studyon.app/api/chat/completions";
// const MODEL = "google/gemini-2.5-flash-lite";

const IssueSchema = z.object({
  type: z.enum([
    "grammar",
    "spelling",
    "punctuation",
    "clarity",
    "word_choice",
  ]),
  category: z.string(),
  severity: z.enum(["error", "warning", "suggestion"]),
  original: z.string(),
  suggestion: z.string(),
  explanation: z.string().default(""),
  confidence: z.number().optional(),
  start: z.number().optional(),
  end: z.number().optional(),
});

const AnalyzeResultSchema = z.object({
  corrected_text: z.string(),
  issues: z.array(IssueSchema).default([]),
});

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
      temperature: 0,
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

function getSystemPrompt(
  action: Action,
  options?: { tone?: Tone; customInstruction?: string }
): string {
  switch (action) {
    case "ANALYZE":
      return ANALYZE_SYSTEM;
    case "SUMMARIZE":
    case "PARAPHRASE":
      return CUSTOM_SYSTEM;
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

  let userMessage = text;
  if (action === "SUMMARIZE") {
    userMessage = `Summarize this text concisely in up to three sentences:\n\n${text}`;
  } else if (action === "PARAPHRASE") {
    userMessage = `Paraphrase this text while preserving the meaning:\n\n${text}`;
  }

  const response = await callAPI(systemPrompt, userMessage);

  console.log(typeof response);

  if (action === "ANALYZE") {
    const parsed = parse(AnalyzeResultSchema, response);

    if (parsed.success) {
      console.log("[Lintly API] Parsed ANALYZE result:", parsed.data);
      return {
        ...parsed.data,
        issues: assignIssueOffsetsFromCorrection(
          text,
          parsed.data.corrected_text,
          parsed.data.issues || []
        ),
      };
    }
    console.log("[Lintly API] Failed to parse with schema:", parsed.error);
    return { corrected_text: response, issues: [] };
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
