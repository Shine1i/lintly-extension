import { Zap, ArrowRight } from "lucide-react";
import type { Issue, Severity } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface IssuePopoverProps {
  issue: Issue;
  text: string;
  highlightClass: string;
  onApplyFix: () => void;
}

function getSeverityStyles(severity: Severity): { headerBg: string; icon: string; label: string; border: string } {
  switch (severity) {
    case "error":
      return {
        headerBg: "bg-red-50 dark:bg-red-500/10",
        icon: "text-red-500 dark:text-red-400",
        label: "text-red-600 dark:text-red-400",
        border: "border-red-100 dark:border-red-500/20"
      };
    case "warning":
      return {
        headerBg: "bg-amber-50 dark:bg-amber-500/10",
        icon: "text-amber-500 dark:text-amber-400",
        label: "text-amber-600 dark:text-amber-400",
        border: "border-amber-100 dark:border-amber-500/20"
      };
    case "suggestion":
      return {
        headerBg: "bg-indigo-50 dark:bg-indigo-500/10",
        icon: "text-indigo-500 dark:text-indigo-400",
        label: "text-indigo-600 dark:text-indigo-400",
        border: "border-indigo-100 dark:border-indigo-500/20"
      };
    default:
      return {
        headerBg: "bg-muted",
        icon: "text-muted-foreground",
        label: "text-muted-foreground",
        border: "border-border"
      };
  }
}

function getIssueTypeLabel(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function IssuePopover({ issue, text, highlightClass, onApplyFix }: IssuePopoverProps) {
  const styles = getSeverityStyles(issue.severity);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span className={`${highlightClass} rounded-md cursor-pointer mx-0.5`}>
          {text}
        </span>
      </PopoverTrigger>
      <PopoverContent
        className="w-[260px] p-0 rounded-2xl shadow-xl ring-1 ring-black/5 dark:ring-white/5"
        sideOffset={12}
        align="center"
      >
        {/* Header - Color coded */}
        <div className={`flex items-center gap-2 px-4 py-2.5 ${styles.headerBg} border-b ${styles.border}`}>
          <Zap className={`w-3.5 h-3.5 ${styles.icon} fill-current`} />
          <span className={`text-[10px] font-bold uppercase tracking-wider ${styles.label}`}>
            {getIssueTypeLabel(issue.type)}
          </span>
        </div>

        {/* Body */}
        <div className="p-4">
          {/* Original → Suggestion */}
          <div className="flex items-center gap-3 text-sm mb-3">
            <span className="line-through text-muted-foreground decoration-muted-foreground/50 decoration-2">
              {issue.original}
            </span>
            <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            <span className="font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-500/10 px-2 py-0.5 rounded-md border border-teal-100 dark:border-teal-500/20">
              {issue.suggestion}
            </span>
          </div>

          {/* Explanation (if available) */}
          {issue.explanation && (
            <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">{issue.explanation}</p>
          )}

          {/* Apply Fix Button */}
          <div className="flex gap-2 mt-1">
            <Button
              onClick={(e) => {
                e.stopPropagation();
                onApplyFix();
              }}
              size="sm"
              className="flex-1 h-8 text-xs font-bold rounded-lg shadow-sm hover:shadow"
            >
              Apply Fix
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
