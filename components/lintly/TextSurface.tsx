import { useMemo, useState, useEffect } from "react";
import type { Issue, Severity } from "@/lib/types";
import { IssuePopover } from "./IssuePopover";

interface TextSurfaceProps {
  text: string;
  issues: Issue[];
  onApplyFix: (issue: Issue) => void;
  isLoading?: boolean;
}

interface TextSegment {
  text: string;
  issue?: Issue;
  start: number;
  end: number;
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

function parseTextWithIssues(text: string, issues: Issue[]): TextSegment[] {
  if (!text || issues.length === 0) {
    return [{ text, start: 0, end: text.length }];
  }

  // Find all issue positions in text
  const issuePositions: { start: number; end: number; issue: Issue }[] = [];

  for (const issue of issues) {
    const index = text.indexOf(issue.original);
    if (index !== -1) {
      issuePositions.push({
        start: index,
        end: index + issue.original.length,
        issue,
      });
    }
  }

  // Sort by position
  issuePositions.sort((a, b) => a.start - b.start);

  // Build segments
  const segments: TextSegment[] = [];
  let currentIndex = 0;

  for (const pos of issuePositions) {
    // Skip overlapping issues
    if (pos.start < currentIndex) continue;

    // Add text before issue
    if (pos.start > currentIndex) {
      segments.push({
        text: text.slice(currentIndex, pos.start),
        start: currentIndex,
        end: pos.start,
      });
    }

    // Add issue segment
    segments.push({
      text: text.slice(pos.start, pos.end),
      issue: pos.issue,
      start: pos.start,
      end: pos.end,
    });

    currentIndex = pos.end;
  }

  // Add remaining text
  if (currentIndex < text.length) {
    segments.push({
      text: text.slice(currentIndex),
      start: currentIndex,
      end: text.length,
    });
  }

  return segments;
}

export function TextSurface({ text, issues, onApplyFix, isLoading }: TextSurfaceProps) {
  const [showShimmer, setShowShimmer] = useState(false);
  const [isFadingOut, setIsFadingOut] = useState(false);

  useEffect(() => {
    if (isLoading) {
      // Start loading: show shimmer immediately
      setShowShimmer(true);
      setIsFadingOut(false);
    } else if (showShimmer) {
      // Stop loading: trigger fade-out
      setIsFadingOut(true);
      // Remove from DOM after animation completes
      const timer = setTimeout(() => {
        setShowShimmer(false);
        setIsFadingOut(false);
      }, 400); // Match CSS transition duration
      return () => clearTimeout(timer);
    }
  }, [isLoading, showShimmer]);

  const segments = useMemo(() => {
    console.log("[Lintly TextSurface] Parsing text:", text.substring(0, 50) + "...");
    console.log("[Lintly TextSurface] Issues:", issues);
    const result = parseTextWithIssues(text, issues);
    console.log("[Lintly TextSurface] Segments:", result);
    return result;
  }, [text, issues]);

  return (
    <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-5 relative overflow-x-hidden">
      {/* Shimmer scanning overlay when loading */}
      {showShimmer && (
        <div className={`shimmer-container ${isFadingOut ? "fade-out" : ""}`}>
          <div className="shimmer-bar" />
        </div>
      )}

      <div className="max-w-2xl mx-auto">
        {/* Text Content */}
        <p className="text-[15px] text-foreground leading-[1.85] font-normal">
          {segments.map((segment, index) => {
            if (segment.issue) {
              return (
                <IssuePopover
                  key={index}
                  issue={segment.issue}
                  text={segment.text}
                  highlightClass={getHighlightClass(segment.issue.severity)}
                  onApplyFix={() => onApplyFix(segment.issue!)}
                />
              );
            }
            return <span key={index}>{segment.text}</span>;
          })}
        </p>
      </div>
    </div>
  );
}
