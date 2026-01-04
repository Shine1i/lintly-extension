import type { Issue, Severity } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface ModalHeaderProps {
  issues: Issue[];
}

function getHealthDotColor(issueCount: number): string {
  if (issueCount === 0) return "bg-emerald-500";
  return "bg-red-500";
}

function getSeverityDotStyle(severity: Severity): React.CSSProperties {
  switch (severity) {
    case "error":
      return { backgroundColor: "var(--issue-error)" };
    case "warning":
      return { backgroundColor: "var(--issue-warning)" };
    case "suggestion":
      return { backgroundColor: "var(--issue-info)" };
    default:
      return {};
  }
}

function getIssueTypeLabel(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

export function ModalHeader({ issues }: ModalHeaderProps) {
  const healthDotColor = getHealthDotColor(issues.length);
  const iconUrl =
    typeof browser !== "undefined"
      ? browser.runtime.getURL("/icon/icon432.png")
      : "/icon/icon432.png";

  const issuesByType = issues.reduce(
    (acc, issue) => {
      acc[issue.type] = (acc[issue.type] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <header className="h-12 flex items-center justify-between px-4 border-b border-border/50 shrink-0 bg-background/95 backdrop-blur z-20">
      <div className="flex items-center gap-2">
        <img src={iconUrl} alt="Typix" className="h-8 w-8 rounded-sm" />
        <span className="text-xs font-semibold text-foreground">Typix</span>
      </div>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={`min-w-5 h-5 px-1 rounded-full flex items-center justify-center text-[10px] font-bold text-white focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${healthDotColor} ${issues.length > 0 ? "animate-pulse" : ""}`}
            >
              {issues.length}
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
                const dotStyle = issueOfType ? getSeverityDotStyle(issueOfType.severity) : {};

                return (
                  <DropdownMenuItem key={type} className="justify-between px-3 py-2 rounded-xl">
                    <span className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={dotStyle} />
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
      </div>
    </header>
  );
}
