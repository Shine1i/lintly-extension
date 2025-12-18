import type { Issue } from "./types";

export interface CachedSentence {
  hash: string;
  text: string;
  issues: Issue[];
  analyzedAt: number;
}

export interface TrackedSentence {
  text: string;
  hash: string;
  startOffset: number;
  endOffset: number;
  issues: Issue[];
  status: "pending" | "analyzing" | "done" | "cached";
}

const cache = new Map<string, CachedSentence>();

export function hashSentence(text: string): string {
  const normalized = text.trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash |= 0;
  }
  return hash.toString(36);
}

export function getCached(hash: string): CachedSentence | undefined {
  return cache.get(hash);
}

export function setCached(hash: string, text: string, issues: Issue[]): void {
  cache.set(hash, {
    hash,
    text,
    issues,
    analyzedAt: Date.now(),
  });
}

export function splitIntoSentences(text: string): TrackedSentence[] {
  const sentenceRegex = /[^.!?]*[.!?]+/g;
  const sentences: TrackedSentence[] = [];
  let match;

  while ((match = sentenceRegex.exec(text)) !== null) {
    const sentenceText = match[0].trim();
    if (sentenceText.length > 3) {
      const hash = hashSentence(sentenceText);
      const cached = getCached(hash);

      sentences.push({
        text: sentenceText,
        hash,
        startOffset: match.index,
        endOffset: match.index + match[0].length,
        issues: cached ? cached.issues : [],
        status: cached ? "cached" : "pending",
      });
    }
  }

  // Handle text without sentence endings
  const lastMatch = text.match(/[^.!?]+$/);
  if (lastMatch && lastMatch[0].trim().length > 10) {
    const sentenceText = lastMatch[0].trim();
    const hash = hashSentence(sentenceText);
    const cached = getCached(hash);
    const startOffset = text.lastIndexOf(lastMatch[0]);

    sentences.push({
      text: sentenceText,
      hash,
      startOffset,
      endOffset: startOffset + lastMatch[0].length,
      issues: cached ? cached.issues : [],
      status: cached ? "cached" : "pending",
    });
  }

  return sentences;
}

export function clearCache(): void {
  cache.clear();
}

export function getCacheSize(): number {
  return cache.size;
}
