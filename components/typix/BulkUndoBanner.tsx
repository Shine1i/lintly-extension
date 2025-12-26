import { Button } from "@/components/ui/button";

interface BulkUndoBannerProps {
  appliedCount: number;
  skippedCount: number;
  onUndo: () => void;
}

export function BulkUndoBanner({ appliedCount, skippedCount, onUndo }: BulkUndoBannerProps) {
  return (
    <div className="mx-4 mt-3 mb-2 rounded-2xl border border-border/50 bg-emerald-50/70 p-3 text-emerald-900 shadow-sm dark:bg-emerald-500/10 dark:text-emerald-100">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold">
            Applied {appliedCount} {appliedCount === 1 ? "suggestion" : "suggestions"}.
          </p>
          {skippedCount > 0 && (
            <p className="text-[10px] text-emerald-900/70 dark:text-emerald-100/70">
              Skipped {skippedCount} because of overlap or missing text.
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-[10px]"
          onClick={onUndo}
        >
          Undo
        </Button>
      </div>
    </div>
  );
}
