import { useState, useRef, useCallback, useEffect } from "react";
import { Zap, ArrowRight } from "lucide-react";
import type { Issue, Severity } from "@/lib/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SentenceDiff } from "./SentenceDiff";

interface IssuePopoverProps {
  issue: Issue;
  text: string;
  highlightClass: string;
  onApplyFix: () => void;
  onApplyWordFix?: () => void;
  sentenceText?: string;
  correctedSentence?: string;
  onHoverChange?: (isHovering: boolean) => void;
}

function getSeverityStyles(severity: Severity): {
  headerBg: string;
  icon: string;
  label: string;
  border: string;
} {
  switch (severity) {
    case "error":
      return {
        headerBg: "bg-red-50 dark:bg-red-500/10",
        icon: "text-red-500 dark:text-red-400",
        label: "text-red-600 dark:text-red-400",
        border: "border-red-100 dark:border-red-500/20",
      };
    case "warning":
      return {
        headerBg: "bg-amber-50 dark:bg-amber-500/10",
        icon: "text-amber-500 dark:text-amber-400",
        label: "text-amber-600 dark:text-amber-400",
        border: "border-amber-100 dark:border-amber-500/20",
      };
    case "suggestion":
      return {
        headerBg: "bg-indigo-50 dark:bg-indigo-500/10",
        icon: "text-indigo-500 dark:text-indigo-400",
        label: "text-indigo-600 dark:text-indigo-400",
        border: "border-indigo-100 dark:border-indigo-500/20",
      };
    default:
      return {
        headerBg: "bg-muted",
        icon: "text-muted-foreground",
        label: "text-muted-foreground",
        border: "border-border",
      };
  }
}

function getIssueTypeLabel(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function IssuePopover({
  issue,
  text,
  highlightClass,
  onApplyFix,
  onApplyWordFix,
  sentenceText,
  correctedSentence,
  onHoverChange,
}: IssuePopoverProps) {
  const [open, setOpen] = useState(false);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const leaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const styles = getSeverityStyles(issue.severity);

  const clearTimeouts = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    if (leaveTimeoutRef.current) {
      clearTimeout(leaveTimeoutRef.current);
      leaveTimeoutRef.current = null;
    }
  }, []);

  const closePopover = useCallback(() => {
    setOpen(false);
    onHoverChange?.(false);
  }, [onHoverChange]);

  useEffect(() => {
    return () => {
      clearTimeouts();
    };
  }, [clearTimeouts]);

  const handleMouseEnter = useCallback(() => {
    clearTimeouts();
    onHoverChange?.(true);
    hoverTimeoutRef.current = setTimeout(() => {
      setOpen(true);
    }, 150);
  }, [clearTimeouts, onHoverChange]);

  const handleMouseLeave = useCallback(() => {
    clearTimeouts();
    leaveTimeoutRef.current = setTimeout(() => {
      closePopover();
    }, 120);
  }, [clearTimeouts, closePopover]);

  const handlePopoverMouseEnter = useCallback(() => {
    clearTimeouts();
    onHoverChange?.(true);
  }, [clearTimeouts, onHoverChange]);

  const handlePopoverMouseLeave = useCallback(() => {
    clearTimeouts();
    leaveTimeoutRef.current = setTimeout(() => {
      closePopover();
    }, 100);
  }, [clearTimeouts, closePopover]);

  const handleApplySentenceFix = useCallback(() => {
    onApplyFix();
    closePopover();
  }, [onApplyFix, closePopover]);

  const handleApplyWordFix = useCallback(() => {
    if (!onApplyWordFix) return;
    onApplyWordFix();
    closePopover();
  }, [onApplyWordFix, closePopover]);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        onHoverChange?.(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <span
          className={`${highlightClass} rounded-md cursor-pointer mx-0.5`}
          onClick={(e) => e.stopPropagation()}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {text}
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="w-[320px] p-0 rounded-2xl shadow-xl ring-1 ring-black/5 dark:ring-white/5"
        sideOffset={12}
        align="center"
        onMouseEnter={handlePopoverMouseEnter}
        onMouseLeave={handlePopoverMouseLeave}
        onInteractOutside={(e) => {
          // Shadow-root clicks shouldn't close the popover.
          const target = e.target as Node;
          const root = target.getRootNode?.() as ShadowRoot | Document;
          if (root instanceof ShadowRoot) {
            e.preventDefault();
            closePopover();
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
                className="lintly-sentence-diff-action"
                onClick={(e) => {
                  e.stopPropagation();
                  handleApplySentenceFix();
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
  );
}
