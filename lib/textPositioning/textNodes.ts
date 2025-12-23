export interface TextNodeRange {
  node: Text;
  start: number;
  end: number;
}

export function buildTextNodeRanges(element: HTMLElement): TextNodeRange[] {
  const ranges: TextNodeRange[] = [];
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  let currentPos = 0;
  let node: Text | null;

  while ((node = walker.nextNode() as Text | null)) {
    const text = node.textContent || "";
    ranges.push({
      node,
      start: currentPos,
      end: currentPos + text.length,
    });
    currentPos += text.length;
  }

  return ranges;
}

export function resolveTextRangeNodes(
  ranges: TextNodeRange[],
  startIndex: number,
  endIndex: number
): { startNode: Text; startOffset: number; endNode: Text; endOffset: number } | null {
  let startNode: Text | null = null;
  let startOffset = 0;
  let endNode: Text | null = null;
  let endOffset = 0;

  for (const textNode of ranges) {
    if (startNode === null && textNode.end > startIndex) {
      startNode = textNode.node;
      startOffset = startIndex - textNode.start;
    }
    if (textNode.end >= endIndex) {
      endNode = textNode.node;
      endOffset = endIndex - textNode.start;
      break;
    }
  }

  if (!startNode || !endNode) {
    return null;
  }

  return { startNode, startOffset, endNode, endOffset };
}
