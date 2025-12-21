import { ChevronDown } from "lucide-react";
import type { Issue, Tone, Severity } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ModalHeaderProps {
  issues: Issue[];
  tone: Tone;
  onToneChange: (tone: Tone) => void;
  isLoading?: boolean;
}

const TONES: { value: Tone; label: string }[] = [
  { value: "professional", label: "Professional" },
  { value: "formal", label: "Formal" },
  { value: "casual", label: "Casual" },
  { value: "friendly", label: "Friendly" },
  { value: "academic", label: "Academic" },
];

function getHealthScore(issues: Issue[]): number {
  const penalties = issues.reduce((acc, issue) => {
    switch (issue.severity) {
      case "error":
        return acc + 10;
      case "warning":
        return acc + 5;
      case "suggestion":
        return acc + 2;
      default:
        return acc;
    }
  }, 0);
  return Math.max(0, 100 - penalties);
}

function getHealthBadgeStyle(score: number): { bg: string; text: string; dot: string } {
  if (score >= 80) {
    return {
      bg: "bg-purple-500 hover:bg-purple-400 dark:bg-purple-500 dark:hover:bg-purple-400",
      text: "text-white",
      dot: "bg-white",
    };
  }
  if (score >= 60) {
    return {
      bg: "bg-amber-500 hover:bg-amber-400 dark:bg-amber-500 dark:hover:bg-amber-400",
      text: "text-white",
      dot: "bg-white",
    };
  }
  return {
    bg: "bg-red-500 hover:bg-red-400 dark:bg-red-500 dark:hover:bg-red-400",
    text: "text-white",
    dot: "bg-white",
  };
}

function getSeverityDotColor(severity: Severity): string {
  switch (severity) {
    case "error":
      return "bg-status-error";
    case "warning":
      return "bg-status-warning";
    case "suggestion":
      return "bg-status-info";
    default:
      return "bg-muted-foreground";
  }
}

function getIssueTypeLabel(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function ModalHeader({ issues, tone, onToneChange, isLoading }: ModalHeaderProps) {
  const healthScore = getHealthScore(issues);
  const healthStyle = getHealthBadgeStyle(healthScore);

  // Group issues by type
  const issuesByType = issues.reduce(
    (acc, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const currentToneLabel = TONES.find((t) => t.value === tone)?.label || "Professional";

  return (
    <header className="h-12 flex items-center justify-between px-4 border-b border-border/50 shrink-0 bg-background/95 backdrop-blur z-20">
      {/* Left side */}
      <div className="flex items-center gap-2.5">
        <h1 className="text-xs font-bold text-foreground">Analysis Mode</h1>
        <span className="px-2.5 py-0.5 rounded-full text-[10px] bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-100 font-semibold tracking-wide">
          {isLoading ? "Processing..." : "AUTO-RUN"}
        </span>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-3">
        {/* Health Badge Dropdown - Cyan pill style (using native button to avoid variant conflicts) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${healthStyle.bg} ${healthStyle.text} shadow-sm hover:shadow-md transition-all cursor-pointer`}
            >
              <div className={`w-2 h-2 rounded-full ${healthStyle.dot} animate-pulse`} />
              <span className="text-xs font-bold">Health: {healthScore}%</span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[220px] rounded-2xl">
            <DropdownMenuLabel className="flex justify-between items-center px-4 py-2.5 bg-muted/50">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Issues Found
              </span>
              <span className="text-[10px] font-bold bg-secondary px-1.5 py-0.5 rounded-full">{issues.length}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <div className="p-2 space-y-1">
              {Object.entries(issuesByType).map(([type, count]) => {
                const issueOfType = issues.find((i) => i.type === type);
                const dotColor = issueOfType ? getSeverityDotColor(issueOfType.severity) : "bg-muted-foreground";

                return (
                  <DropdownMenuItem key={type} className="justify-between px-3 py-2 rounded-xl">
                    <span className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${dotColor}`} />
                      <span className="text-xs font-semibold">{getIssueTypeLabel(type)}</span>
                    </span>
                    <span className="text-xs font-bold text-muted-foreground">{count}</span>
                  </DropdownMenuItem>
                );
              })}
              {issues.length === 0 && (
                <DropdownMenuItem disabled className="text-xs text-muted-foreground px-3 py-2 rounded-xl">
                  No issues detected
                </DropdownMenuItem>
              )}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Tone Selector Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3 rounded-full border-border/60 hover:border-border bg-background"
            >
              <span className="text-[10px] text-muted-foreground font-bold uppercase tracking-wide">Tone</span>
              <span className="text-xs text-foreground font-semibold">{currentToneLabel}</span>
              <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[150px] rounded-2xl">
            <DropdownMenuRadioGroup value={tone} onValueChange={(v) => onToneChange(v as Tone)}>
              {TONES.map((t) => (
                <DropdownMenuRadioItem key={t.value} value={t.value} className="text-xs rounded-xl mx-1">
                  {t.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
