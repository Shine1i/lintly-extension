import { useCallback } from "react";
import { Zap, ArrowRight } from "lucide-react";
import type { Issue, Severity } from "@/lib/types";
import {
  Popover,
  PopoverContent,
  PopoverAnchor,
} from "@/components/ui/popover";
import { SentenceDiff } from "./SentenceDiff";

interface HighlightSpanProps {
  issue: Issue;
  anchorRect: DOMRect | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onApplyFix: () => void;
  onApplyWordFix?: () => void;
  sentenceText?: string;
  correctedSentence?: string;
  onPopoverHoverChange?: (isHovering: boolean) => void;
}

function getSeverityStyles(severity: Severity): {
  headerBg: string;
  icon: string;
  label: string;
  border: string;
  highlight: string;
} {
  switch (severity) {
    case "error":
      return {
        headerBg: "bg-red-50 dark:bg-red-500/10",
        icon: "text-red-500 dark:text-red-400",
        label: "text-red-600 dark:text-red-400",
        border: "border-red-100 dark:border-red-500/20",
        highlight: "typix-inline-highlight-error",
      };
    case "warning":
      return {
        headerBg: "bg-amber-50 dark:bg-amber-500/10",
        icon: "text-amber-500 dark:text-amber-400",
        label: "text-amber-600 dark:text-amber-400",
        border: "border-amber-100 dark:border-amber-500/20",
        highlight: "typix-inline-highlight-warning",
      };
    case "suggestion":
      return {
        headerBg: "bg-indigo-50 dark:bg-indigo-500/10",
        icon: "text-indigo-500 dark:text-indigo-400",
        label: "text-indigo-600 dark:text-indigo-400",
        border: "border-indigo-100 dark:border-indigo-500/20",
        highlight: "typix-inline-highlight-suggestion",
      };
    default:
      return {
        headerBg: "bg-muted",
        icon: "text-muted-foreground",
        label: "text-muted-foreground",
        border: "border-border",
        highlight: "typix-inline-highlight-suggestion",
      };
  }
}

function getIssueTypeLabel(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Keep the popover anchored without stealing focus from the input.
 */
export function HighlightSpan({
  issue,
  anchorRect,
  isOpen,
  onOpenChange,
  onApplyFix,
  onApplyWordFix,
  sentenceText,
  correctedSentence,
  onPopoverHoverChange,
}: HighlightSpanProps) {
  const styles = getSeverityStyles(issue.severity);

  const handleApplyFix = useCallback(() => {
    onApplyFix();
    onOpenChange(false);
    onPopoverHoverChange?.(false);
  }, [onApplyFix, onOpenChange, onPopoverHoverChange]);

  const handleApplyWordFix = useCallback(() => {
    if (!onApplyWordFix) return;
    onApplyWordFix();
    onOpenChange(false);
    onPopoverHoverChange?.(false);
  }, [onApplyWordFix, onOpenChange, onPopoverHoverChange]);

  if (!anchorRect) return null;

  return (
    <>
      <Popover
        open={isOpen}
        onOpenChange={(open) => {
          onOpenChange(open);
        }}
      >
        <PopoverAnchor asChild>
          <div
            style={{
              position: "fixed",
              left: anchorRect.left,
              top: anchorRect.top,
              width: anchorRect.width,
              height: anchorRect.height,
              pointerEvents: "none",
            }}
          />
        </PopoverAnchor>
        <PopoverContent
          className="w-[320px] p-0 rounded-2xl shadow-xl ring-1 ring-black/5 dark:ring-white/5"
          sideOffset={8}
          align="center"
          onMouseEnter={() => onPopoverHoverChange?.(true)}
          onMouseLeave={() => onPopoverHoverChange?.(false)}
          // Keep focus on the input so typing doesn't break.
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onFocusOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            // Shadow-root clicks should not dismiss inline UI.
            const target = e.target as Node;
            const root = target.getRootNode?.() as ShadowRoot | Document;
            if (root instanceof ShadowRoot) {
              e.preventDefault();
            }
          }}
        >
          <div
            className={`flex items-center gap-2 px-4 py-2.5 ${styles.headerBg} border-b ${styles.border}`}
          >
            <Zap className={`w-3.5 h-3.5 ${styles.icon} fill-current`} />
            <span
              className={`text-[10px] font-bold uppercase tracking-wider ${styles.label}`}
            >
              {getIssueTypeLabel(issue.type)}
            </span>
          </div>

          <div className="p-4">
            {sentenceText && correctedSentence && sentenceText !== correctedSentence && (
              <div className="mb-3">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  Sentence update
                </p>
                <div
                  className="typix-sentence-diff-action"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleApplyFix();
                  }}
                >
                  <SentenceDiff before={sentenceText} after={correctedSentence} />
                </div>
              </div>
            )}

            {onApplyWordFix && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-2">
                  {sentenceText && correctedSentence && sentenceText !== correctedSentence
                    ? "Word only"
                    : "Replace word"}
                </p>
                <div
                  className="flex items-center gap-3 text-sm cursor-pointer hover:bg-muted/50 rounded-lg p-2 -m-2 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleApplyWordFix();
                  }}
                >
                  <span className="line-through text-muted-foreground decoration-muted-foreground/50 decoration-2">
                    {issue.original}
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="font-bold px-2 py-0.5 rounded-md">
                    {issue.suggestion}
                  </span>
                </div>
              </div>
            )}

            {issue.explanation && (
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {issue.explanation}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </>
  );
}
