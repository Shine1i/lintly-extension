export interface TextNodeRange {
  node: Text;
  start: number;
  end: number;
}

export interface ExtractedContent {
  text: string;
  ranges: TextNodeRange[];
}

// Block-level elements that insert \n
const BLOCK_ELEMENTS = new Set([
  "P", "DIV", "BR", "H1", "H2", "H3", "H4", "H5", "H6",
  "LI", "TR", "BLOCKQUOTE", "PRE", "HR", "SECTION", "ARTICLE",
]);

function isBlockElement(node: Node): boolean {
  return node.nodeType === Node.ELEMENT_NODE &&
    BLOCK_ELEMENTS.has((node as Element).tagName);
}

/**
 * Extracts text content and text node ranges from a contentEditable element.
 * Uses a single DOM walk to guarantee text and positions are perfectly aligned.
 * Inserts \n at block element boundaries (like <p>, <div>, <br>).
 */
export function extractContentEditableText(element: HTMLElement): ExtractedContent {
  const ranges: TextNodeRange[] = [];
  const textParts: string[] = [];
  let currentPos = 0;

  function walk(node: Node, isLastChild: boolean): void {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || "";
      if (text.length > 0) {
        ranges.push({
          node: node as Text,
          start: currentPos,
          end: currentPos + text.length,
        });
        textParts.push(text);
        currentPos += text.length;
      }
      return;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const isBr = el.tagName === "BR";
      const isBlock = isBlockElement(node);

      // BR elements insert a newline
      if (isBr) {
        textParts.push("\n");
        currentPos += 1;
        return;
      }

      // Process children
      const children = Array.from(node.childNodes);
      children.forEach((child, i) => {
        const isLast = i === children.length - 1;
        walk(child, isLast);
      });

      // Block elements add a newline after their content (except the last one)
      if (isBlock && !isLastChild) {
        textParts.push("\n");
        currentPos += 1;
      }
    }
  }

  const children = Array.from(element.childNodes);
  children.forEach((child, i) => {
    const isLast = i === children.length - 1;
    walk(child, isLast);
  });

  return {
    text: textParts.join(""),
    ranges,
  };
}

/**
 * Builds text node ranges for a contentEditable element.
 * For text extraction + positioning, prefer extractContentEditableText() instead.
 */
export function buildTextNodeRanges(element: HTMLElement): TextNodeRange[] {
  return extractContentEditableText(element).ranges;
}

export function resolveTextRangeNodes(
  ranges: TextNodeRange[],
  startIndex: number,
  endIndex: number
): { startNode: Text; startOffset: number; endNode: Text; endOffset: number } | null {
  if (startIndex === endIndex) {
    for (const textNode of ranges) {
      if (textNode.end >= startIndex) {
        const offset = Math.min(
          Math.max(startIndex - textNode.start, 0),
          textNode.node.length
        );
        return {
          startNode: textNode.node,
          startOffset: offset,
          endNode: textNode.node,
          endOffset: offset,
        };
      }
    }
    return null;
  }

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
