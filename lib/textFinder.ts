interface TextNode {
  node: Text;
  start: number;
  end: number;
}

export function buildTextMap(element: HTMLElement): { fullText: string; nodes: TextNode[] } {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let fullText = "";
  const nodes: TextNode[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const text = node.textContent || "";
    if (text.trim()) {
      nodes.push({
        node,
        start: fullText.length,
        end: fullText.length + text.length,
      });
      fullText += text;
    }
  }

  return { fullText, nodes };
}

export function findTextRange(
  element: HTMLElement,
  searchText: string,
  startFrom = 0
): Range | null {
  const { fullText, nodes } = buildTextMap(element);

  const index = fullText.indexOf(searchText, startFrom);
  if (index === -1) return null;

  const endIndex = index + searchText.length;

  const startNode = nodes.find((n) => n.start <= index && n.end > index);
  const endNode = nodes.find((n) => n.start < endIndex && n.end >= endIndex);

  if (!startNode || !endNode) return null;

  try {
    const range = document.createRange();
    range.setStart(startNode.node, index - startNode.start);
    range.setEnd(endNode.node, endIndex - endNode.start);
    return range;
  } catch {
    return null;
  }
}

export function getTextContent(element: HTMLElement): string {
  if (element.tagName === "TEXTAREA" || element.tagName === "INPUT") {
    return (element as HTMLInputElement | HTMLTextAreaElement).value;
  }
  return element.innerText || element.textContent || "";
}

export function findAllOccurrences(
  element: HTMLElement,
  searchText: string
): Range[] {
  const ranges: Range[] = [];
  const { fullText, nodes } = buildTextMap(element);

  let searchStart = 0;
  while (true) {
    const index = fullText.indexOf(searchText, searchStart);
    if (index === -1) break;

    const endIndex = index + searchText.length;
    const startNode = nodes.find((n) => n.start <= index && n.end > index);
    const endNode = nodes.find((n) => n.start < endIndex && n.end >= endIndex);

    if (startNode && endNode) {
      try {
        const range = document.createRange();
        range.setStart(startNode.node, index - startNode.start);
        range.setEnd(endNode.node, endIndex - endNode.start);
        ranges.push(range);
      } catch {
        // Skip invalid ranges
      }
    }

    searchStart = index + 1;
  }

  return ranges;
}

export function getInputTextRect(
  input: HTMLInputElement | HTMLTextAreaElement,
  startOffset: number,
  length: number
): DOMRect | null {
  const inputRect = input.getBoundingClientRect();
  const text = input.value;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const style = getComputedStyle(input);
  ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

  const beforeText = text.slice(0, startOffset);
  const targetText = text.slice(startOffset, startOffset + length);

  const beforeWidth = ctx.measureText(beforeText).width;
  const targetWidth = ctx.measureText(targetText).width;

  const paddingLeft = parseFloat(style.paddingLeft) || 0;
  const paddingTop = parseFloat(style.paddingTop) || 0;
  const borderLeft = parseFloat(style.borderLeftWidth) || 0;
  const borderTop = parseFloat(style.borderTopWidth) || 0;

  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;

  // Calculate line number for multiline textarea
  let lineNumber = 0;
  if (input.tagName === "TEXTAREA") {
    const lines = beforeText.split("\n");
    lineNumber = lines.length - 1;
  }

  const x = inputRect.left + paddingLeft + borderLeft + beforeWidth - input.scrollLeft;
  const y = inputRect.top + paddingTop + borderTop + (lineNumber * lineHeight) + lineHeight - 2 - input.scrollTop;

  return new DOMRect(x, y, targetWidth, 2);
}
