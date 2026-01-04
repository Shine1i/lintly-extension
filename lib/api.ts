import type { Action, AnalyzeResult, Tone } from "@/lib/types";
import {
  SYSTEM_PROMPT,
  USER_PROMPT_PREFIXES,
  TONE_PROMPT_PREFIX,
  TONE_PROMPT_SUFFIX,
} from "@/lib/prompts";
import { generateIssuesFromDiff } from "@/lib/issueOffsets";
import {
  buildIssueSentenceContexts,
  countIssuesPerSentence,
} from "@/lib/sentences";

const API_URL = "https://api.typix.app/v1/chat/completions";
const MODELS_URL = "https://api.typix.app/v1/models";
const FEEDBACK_URL = "https://api.typix.app/v1/feedback";
const FALLBACK_MODEL = "typix-medium-epo";
const CLIENT_VERSION =
  typeof browser !== "undefined" && browser.runtime?.getManifest
    ? browser.runtime.getManifest().version
    : "ext-unknown";

let currentAction: Action = "ANALYZE";
let cachedModelName: string | null = null;

async function fetchModelName(): Promise<string> {
  if (cachedModelName) return cachedModelName;

  try {
    const res = await fetch(MODELS_URL, { credentials: "include" });
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

  const sentenceRegex = /[^.!?]*[.!?]+(?:["']?(?:\s+|$))/g;
  const parts: { sentence: string; isContent: boolean }[] = [];
  let lastIndex = 0;
  let match;

  while ((match = sentenceRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      const before = text.slice(lastIndex, match.index);
      if (before) {
        parts.push({ sentence: before, isContent: before.trim().length > 0 });
      }
    }
    parts.push({ sentence: match[0], isContent: match[0].trim().length > 0 });
    lastIndex = sentenceRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    const remaining = text.slice(lastIndex);
    parts.push({ sentence: remaining, isContent: remaining.trim().length > 0 });
  }

  if (parts.length === 0 && text.length > 0) {
    parts.push({ sentence: text, isContent: text.trim().length > 0 });
  }

  return parts;
}

type Priority = "realtime" | "bulk";

interface APIResponse {
  content: string;
  requestId?: string;
}

export interface APIMeta {
  analysisId?: string;
  sourceText?: string;
  issueCount?: number;
  clientVersion?: string;
  skipTraining?: boolean;
  sessionId?: string;
  editorKind?: string | null;
  editorSignature?: string | null;
  pageUrl?: string | null;
}

async function callAPI(
  systemPrompt: string,
  userText: string,
  priority: Priority = "realtime",
  meta?: APIMeta
): Promise<APIResponse> {
  const model = await fetchModelName();

  console.log("[api] Calling API with model:", model);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Priority": priority,
    "X-Action": currentAction,
  };

  if (meta?.analysisId) headers["X-Analysis-Id"] = meta.analysisId;
  if (meta?.sessionId) headers["X-Session-Id"] = meta.sessionId;
  if (meta?.editorKind) headers["X-Editor-Kind"] = meta.editorKind;
  if (meta?.editorSignature) headers["X-Editor-Signature"] = meta.editorSignature;
  if (meta?.pageUrl) headers["X-Page-Url"] = meta.pageUrl;
  if (meta?.sourceText) headers["X-Source-Text"] = meta.sourceText;
  if (meta?.clientVersion) headers["X-Client-Version"] = meta.clientVersion;
  if (meta?.issueCount !== undefined) headers["X-Issue-Count"] = String(meta.issueCount);
  if (meta?.skipTraining) headers["X-Skip-Training"] = "1";

  const res = await fetch(API_URL, {
    method: "POST",
    credentials: "include",
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
      meta: meta
        ? {
            analysis_id: meta.analysisId,
            session_id: meta.sessionId,
            source_text: meta.sourceText,
            issue_count: meta.issueCount,
            action: currentAction,
            client_version: meta.clientVersion,
            skip_training: meta.skipTraining,
            editor_kind: meta.editorKind,
            editor_signature: meta.editorSignature,
            page_url: meta.pageUrl,
          }
        : undefined,
    }),
  });

  console.log("[api] API response:", res);

  if (!res.ok) {
    throw new Error(`API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();

  return {
    content: data.choices[0].message.content,
    requestId: data.request_id,
  };
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

export interface ProcessResult {
  result: string | AnalyzeResult;
  requestId?: string;
  issueCount?: number;
  perSentenceIssueCounts?: { sentenceIndex: number; count: number }[];
}

export interface ProcessOptions {
  tone?: Tone;
  customInstruction?: string;
  isPartial?: boolean;
}

export async function processText(
  action: Action,
  text: string,
  options?: ProcessOptions,
  meta?: APIMeta
): Promise<ProcessResult> {
  currentAction = action;

  if (action === "ANALYZE") {
    const analysisId = crypto.randomUUID();
    const parts = splitIntoSentences(text);
    const contentParts = parts.filter(
      ({ sentence, isContent }) =>
        isContent && shouldAnalyzeSentence(maskUrls(sentence.trim()).maskedText)
    );
    const priority: Priority = contentParts.length > 3 ? "bulk" : "realtime";

    const userMessage = getUserMessage("ANALYZE", text);
    const { content, requestId } = await callAPI(
      SYSTEM_PROMPT,
      userMessage,
      priority,
      {
        analysisId,
        sourceText: text,
        clientVersion: CLIENT_VERSION,
        skipTraining: options?.isPartial === true,
        sessionId: meta?.sessionId,
        editorKind: meta?.editorKind,
        editorSignature: meta?.editorSignature,
        pageUrl: meta?.pageUrl,
      }
    );

    const correctedText = content.trim();
    const issues = generateIssuesFromDiff(text, correctedText);
    const { issueContexts } = buildIssueSentenceContexts(
      text,
      issues.issues || []
    );
    const perSentenceIssueCounts = countIssuesPerSentence(issueContexts);
    const issueCount = issues.issues?.length ?? 0;

    if (requestId) {
      fetch(FEEDBACK_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          request_id: requestId,
          accepted: null,
          issue_count: issueCount,
          sentence_issue_counts: perSentenceIssueCounts,
        }),
      }).catch(() => {});
    }

    return {
      result: issues,
      requestId: requestId || analysisId,
      issueCount,
      perSentenceIssueCounts,
    };
  }

  const userMessage = getUserMessage(action, text, options);
  const { content, requestId } = await callAPI(
    SYSTEM_PROMPT,
    userMessage,
    "realtime",
    {
      skipTraining: options?.isPartial === true,
      sessionId: meta?.sessionId,
      editorKind: meta?.editorKind,
      editorSignature: meta?.editorSignature,
      pageUrl: meta?.pageUrl,
      clientVersion: CLIENT_VERSION,
    }
  );

  return { result: content, requestId };
}

export async function submitFeedback(requestId: string, issueCount?: number): Promise<boolean> {
  try {
    const res = await fetch(FEEDBACK_URL, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        request_id: requestId,
        issue_count: issueCount,
      }),
    });
    const data = await res.json();
    return data.success;
  } catch {
    return false;
  }
}
