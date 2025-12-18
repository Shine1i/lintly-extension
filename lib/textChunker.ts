export function chunkText(text: string, sentencesPerChunk = 3): string[] {
  if (!text.trim()) return [];

  const sentences = text.split(/(?<=[.!?])\s+/).filter((s) => s.trim());
  if (sentences.length === 0) return [text.trim()];

  const chunks: string[] = [];
  for (let i = 0; i < sentences.length; i += sentencesPerChunk) {
    const chunk = sentences.slice(i, i + sentencesPerChunk).join(" ");
    if (chunk.trim()) chunks.push(chunk.trim());
  }

  return chunks;
}

export interface ChunkWithOffset {
  text: string;
  startOffset: number;
  endOffset: number;
}

export function chunkTextWithOffsets(text: string, sentencesPerChunk = 3): ChunkWithOffset[] {
  if (!text.trim()) return [];

  const sentenceRegex = /[^.!?]*[.!?]+\s*/g;
  const sentences: { text: string; start: number; end: number }[] = [];

  let match;
  while ((match = sentenceRegex.exec(text)) !== null) {
    sentences.push({
      text: match[0],
      start: match.index,
      end: match.index + match[0].length,
    });
  }

  if (sentences.length === 0) {
    return [{ text: text.trim(), startOffset: 0, endOffset: text.length }];
  }

  const chunks: ChunkWithOffset[] = [];
  for (let i = 0; i < sentences.length; i += sentencesPerChunk) {
    const group = sentences.slice(i, i + sentencesPerChunk);
    chunks.push({
      text: group.map((s) => s.text).join("").trim(),
      startOffset: group[0].start,
      endOffset: group[group.length - 1].end,
    });
  }

  return chunks;
}
