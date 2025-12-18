import { useEffect, useState, useRef } from "react";
import type { IssueWithPosition, Severity } from "@/lib/types";

interface UnderlineData {
  id: string;
  rect: DOMRect;
  severity: Severity;
  issue: IssueWithPosition;
}

interface UnderlineOverlayProps {
  element: HTMLElement | null;
  issues: IssueWithPosition[];
  onIssueClick?: (issue: IssueWithPosition) => void;
}

function getTextNodeAtOffset(
  element: HTMLElement,
  targetOffset: number
): { node: Text; offset: number } | null {
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let currentOffset = 0;

  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    const nodeLength = node.textContent?.length || 0;

    if (currentOffset + nodeLength >= targetOffset) {
      return { node, offset: targetOffset - currentOffset };
    }
    currentOffset += nodeLength;
  }

  return null;
}

function getRectForTextRange(
  element: HTMLElement,
  startOffset: number,
  endOffset: number
): DOMRect | null {
  const startInfo = getTextNodeAtOffset(element, startOffset);
  const endInfo = getTextNodeAtOffset(element, endOffset);

  if (!startInfo || !endInfo) return null;

  const range = document.createRange();
  try {
    range.setStart(startInfo.node, Math.min(startInfo.offset, startInfo.node.length));
    range.setEnd(endInfo.node, Math.min(endInfo.offset, endInfo.node.length));
    return range.getBoundingClientRect();
  } catch {
    return null;
  }
}

function getInputRect(
  input: HTMLInputElement | HTMLTextAreaElement,
  startOffset: number,
  endOffset: number
): DOMRect | null {
  const inputRect = input.getBoundingClientRect();
  const text = input.value;

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const style = getComputedStyle(input);
  ctx.font = `${style.fontSize} ${style.fontFamily}`;

  const beforeText = text.slice(0, startOffset);
  const issueText = text.slice(startOffset, endOffset);

  const beforeWidth = ctx.measureText(beforeText).width;
  const issueWidth = ctx.measureText(issueText).width;

  const paddingLeft = parseFloat(style.paddingLeft);
  const paddingTop = parseFloat(style.paddingTop);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.2;

  return new DOMRect(
    inputRect.left + paddingLeft + beforeWidth - input.scrollLeft,
    inputRect.top + paddingTop + lineHeight - 4 - input.scrollTop,
    issueWidth,
    2
  );
}

export function UnderlineOverlay({ element, issues, onIssueClick }: UnderlineOverlayProps) {
  const [underlines, setUnderlines] = useState<UnderlineData[]>([]);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!element || issues.length === 0) {
      setUnderlines([]);
      return;
    }

    const updatePositions = () => {
      const FRAME_BUDGET = 8;
      const pending = [...issues];
      const results: UnderlineData[] = [];

      const processChunk = () => {
        const start = performance.now();

        while (pending.length > 0) {
          if (performance.now() - start > FRAME_BUDGET) {
            rafRef.current = requestAnimationFrame(processChunk);
            return;
          }

          const issue = pending.shift()!;
          let rect: DOMRect | null = null;

          if (element.tagName === "INPUT" || element.tagName === "TEXTAREA") {
            rect = getInputRect(
              element as HTMLInputElement | HTMLTextAreaElement,
              issue.startOffset,
              issue.endOffset
            );
          } else {
            rect = getRectForTextRange(element, issue.startOffset, issue.endOffset);
          }

          if (rect && rect.width > 0) {
            results.push({
              id: `${issue.startOffset}-${issue.endOffset}`,
              rect,
              severity: issue.severity,
              issue,
            });
          }
        }

        setUnderlines(results);
      };

      rafRef.current = requestAnimationFrame(processChunk);
    };

    updatePositions();

    const observer = new MutationObserver(updatePositions);
    observer.observe(element, { characterData: true, subtree: true, childList: true });

    element.addEventListener("scroll", updatePositions);
    window.addEventListener("resize", updatePositions);

    return () => {
      cancelAnimationFrame(rafRef.current);
      observer.disconnect();
      element.removeEventListener("scroll", updatePositions);
      window.removeEventListener("resize", updatePositions);
    };
  }, [element, issues]);

  if (underlines.length === 0) return null;

  return (
    <>
      {underlines.map((underline) => (
        <div
          key={underline.id}
          onClick={() => onIssueClick?.(underline.issue)}
          className={`lintly-underline lintly-underline-${underline.severity}`}
          style={{
            left: underline.rect.left,
            top: underline.rect.top,
            width: underline.rect.width,
          }}
          title={underline.issue.explanation}
        />
      ))}
    </>
  );
}
