import { useMemo, useState, useEffect } from "react";
import type { Issue, Severity } from "@/lib/types";
import { IssuePopover } from "./IssuePopover";
import {
  applyIssuesToSentence,
  buildIssueSentenceContexts,
  groupIssueContextsBySentence,
  type IssueSentenceContext,
  type SentenceRange,
} from "@/lib/sentences";

interface TextSurfaceProps {
  text: string;
  issues: Issue[];
  onApplyFix: (issue: Issue) => void;
  onApplyWordFix?: (issue: Issue) => void;
  isLoading?: boolean;
}

interface TextSegment {
  text: string;
  issue?: Issue;
  start: number;
  end: number;
}

interface SentenceBlock {
  key: string;
  sentenceIndex: number;
  leadingText: string;
  trailingText: string;
  segments: TextSegment[];
  coreText: string;
}

function getHighlightClass(severity: Severity): string {
  switch (severity) {
    case "error":
      return "highlight-pastel highlight-error";
    case "warning":
      return "highlight-pastel highlight-warning";
    case "suggestion":
      return "highlight-pastel highlight-info";
    default:
      return "";
  }
}

function buildSentenceBlocks(
  text: string,
  sentenceRanges: SentenceRange[],
  issueContexts: Map<Issue, IssueSentenceContext>
): SentenceBlock[] {
  if (!text) return [];

  const contextsBySentence = new Map<number, IssueSentenceContext[]>();
  for (const context of issueContexts.values()) {
    if (!contextsBySentence.has(context.sentenceIndex)) {
      contextsBySentence.set(context.sentenceIndex, []);
    }
    contextsBySentence.get(context.sentenceIndex)!.push(context);
  }

  const blocks: SentenceBlock[] = [];

  for (let i = 0; i < sentenceRanges.length; i++) {
    const range = sentenceRanges[i];
    const contexts = contextsBySentence.get(i) || [];
    contexts.sort((a, b) => a.issueStart - b.issueStart);

    const segments: TextSegment[] = [];
    let cursor = range.coreStart;

    for (const context of contexts) {
      if (context.issueStart < range.coreStart || context.issueEnd > range.coreEnd) {
        continue;
      }
      if (context.issueStart > cursor) {
        segments.push({
          text: text.slice(cursor, context.issueStart),
          start: cursor,
          end: context.issueStart,
        });
      }
      segments.push({
        text: text.slice(context.issueStart, context.issueEnd),
        issue: context.issue,
        start: context.issueStart,
        end: context.issueEnd,
      });
      cursor = context.issueEnd;
    }

    if (cursor < range.coreEnd) {
      segments.push({
        text: text.slice(cursor, range.coreEnd),
        start: cursor,
        end: range.coreEnd,
      });
    }

    blocks.push({
      key: `${range.start}-${range.end}-${i}`,
      sentenceIndex: i,
      leadingText: text.slice(range.start, range.coreStart),
      trailingText: text.slice(range.coreEnd, range.end),
      segments,
      coreText: text.slice(range.coreStart, range.coreEnd),
    });
  }

  return blocks;
}

export function TextSurface({
  text,
  issues,
  onApplyFix,
  onApplyWordFix,
  isLoading,
}: TextSurfaceProps) {
  const [showShimmer, setShowShimmer] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null);

  useEffect(() => {
    if (isLoading) {
      // Immediate feedback makes the UI feel responsive.
      setShowShimmer(true);
      setIsFadingOut(false);
    } else if (showShimmer) {
      // Fade out so the transition doesn't flash.
      setIsFadingOut(true);
      const timer = setTimeout(() => {
        setShowShimmer(false);
        setIsFadingOut(false);
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isLoading, showShimmer]);

  useEffect(() => {
    setActiveSentenceIndex(null);
  }, [text, issues]);

  const { sentenceRanges, issueContexts } = useMemo(
    () => buildIssueSentenceContexts(text, issues),
    [text, issues]
  );
  const contextsBySentence = useMemo(
    () => groupIssueContextsBySentence(issueContexts),
    [issueContexts]
  );
  const correctedSentenceByIndex = useMemo(() => {
    const map = new Map<number, string>();
    for (const [sentenceIndex, contexts] of contextsBySentence.entries()) {
      if (contexts.length === 0) continue;
      const sentenceText = contexts[0].sentence.coreText;
      map.set(sentenceIndex, applyIssuesToSentence(sentenceText, contexts));
    }
    return map;
  }, [contextsBySentence]);
  const sentenceBlocks = useMemo(
    () => buildSentenceBlocks(text, sentenceRanges, issueContexts),
    [text, sentenceRanges, issueContexts]
  );

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-5 relative overflow-x-hidden">
      {showShimmer && (
        <div className={`shimmer-container ${isFadingOut ? "fade-out" : ""}`}>
          <div className="shimmer-bar" />
        </div>
      )}

      <div className="max-w-2xl mx-auto">
        <p className="text-[15px] text-foreground leading-[1.85] font-normal">
          {sentenceBlocks.map((block) => {
            const isActive = activeSentenceIndex === block.sentenceIndex;
            const sentenceClass = isActive ? "lintly-sentence-highlight" : "";

            return (
              <span key={block.key}>
                {block.leadingText && <span>{block.leadingText}</span>}
                <span className={sentenceClass}>
                  {block.segments.length > 0
                    ? block.segments.map((segment, index) => {
                        if (segment.issue) {
                          const context = issueContexts.get(segment.issue);
                          const sentenceText = context?.sentence.coreText;
                          const correctedSentence =
                            context && sentenceText
                              ? correctedSentenceByIndex.get(context.sentenceIndex)
                              : undefined;

                          return (
                              <IssuePopover
                                key={`${block.key}-${index}`}
                                issue={segment.issue}
                                text={segment.text}
                                highlightClass={getHighlightClass(segment.issue.severity)}
                                onApplyFix={() => onApplyFix(segment.issue!)}
                                onApplyWordFix={
                                  onApplyWordFix
                                    ? () => onApplyWordFix(segment.issue!)
                                    : undefined
                                }
                                sentenceText={sentenceText}
                                correctedSentence={correctedSentence}
                                onHoverChange={(isHovering) => {
                                  if (!context) return;
                                setActiveSentenceIndex(
                                  isHovering ? context.sentenceIndex : null
                                );
                              }}
                            />
                          );
                        }
                        return <span key={`${block.key}-${index}`}>{segment.text}</span>;
                      })
                    : block.coreText}
                </span>
                {block.trailingText && <span>{block.trailingText}</span>}
              </span>
            );
          })}
        </p>
      </div>
    </div>
  );
}
