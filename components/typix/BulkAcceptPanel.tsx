import type { Issue } from "@/lib/types";
import { Button } from "@/components/ui/button";

interface BulkAcceptPanelProps {
  issues: Issue[];
  selectedIssues: Issue[];
  onToggleIssue: (issue: Issue) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onApply: () => void;
  onDismiss: () => void;
  isLoading?: boolean;
}

function getIssueTypeLabel(type: string): string {
  return type
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function getIssueKey(issue: Issue, index: number): string {
  return [
    issue.type,
    issue.category,
    issue.original,
    issue.suggestion,
    issue.start ?? "start",
    issue.end ?? "end",
    index,
  ].join("|");
}

export function BulkAcceptPanel({
  issues,
  selectedIssues,
  onToggleIssue,
  onSelectAll,
  onSelectNone,
  onApply,
  onDismiss,
  isLoading,
}: BulkAcceptPanelProps) {
  const selectedCount = selectedIssues.length;
  const allSelected = selectedCount === issues.length && issues.length > 0;

  return (
    <div className="mx-4 mt-3 mb-2 rounded-2xl border border-border/50 bg-muted/40 p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-foreground">
            Accept {selectedCount} of {issues.length} suggestions
          </p>
          <p className="text-[10px] text-muted-foreground">
            High-confidence edits are preselected.
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={onSelectAll}
            disabled={isLoading || allSelected}
          >
            All
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={onSelectNone}
            disabled={isLoading || selectedCount === 0}
          >
            None
          </Button>
        </div>
      </div>

      <div className="mt-2 max-h-28 overflow-y-auto pr-1">
        {issues.map((issue, index) => {
          const checked = selectedIssues.includes(issue);
          const confidence =
            typeof issue.confidence === "number" && Number.isFinite(issue.confidence)
              ? Math.round(issue.confidence * 100)
              : null;

          return (
            <label
              key={getIssueKey(issue, index)}
              className={`flex items-start gap-2 rounded-lg px-2 py-1 text-xs transition-colors ${
                checked ? "bg-muted/60" : "hover:bg-muted/40"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={isLoading}
                onChange={() => onToggleIssue(issue)}
                className="mt-0.5 h-3.5 w-3.5 rounded border border-border text-primary focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {getIssueTypeLabel(issue.type)}
                  </span>
                  {confidence !== null && (
                    <span className="text-[10px] text-muted-foreground">
                      {confidence}% confident
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1 text-xs">
                  <span className="line-through text-muted-foreground">
                    {issue.original}
                  </span>
                  <span className="text-muted-foreground">-&gt;</span>
                  <span className="font-semibold text-foreground">{issue.suggestion}</span>
                </div>
              </div>
            </label>
          );
        })}
        {issues.length === 0 && (
          <p className="text-xs text-muted-foreground">No bulk suggestions yet.</p>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[10px]"
          onClick={onDismiss}
          disabled={isLoading}
        >
          Dismiss
        </Button>
        <Button
          variant="default"
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={onApply}
          disabled={isLoading || selectedCount === 0}
        >
          Accept {selectedCount}
        </Button>
      </div>
    </div>
  );
}
