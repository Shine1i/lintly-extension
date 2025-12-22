import { Sparkles, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BottomInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  wordCount: number;
  readTime: number;
  onReset: () => void;
  onCopy: () => void;
  isLoading?: boolean;
}

export function BottomInput({
  value,
  onChange,
  onSubmit,
  wordCount,
  readTime,
  onReset,
  onCopy,
  isLoading,
}: BottomInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Stop all key events from propagating to prevent page shortcuts
    e.stopPropagation();

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };

  return (
    <div className="shrink-0 p-3 bg-background border-t border-border/50 z-30">
      <div className="relative group">
        {/* Subtle Glow behind input */}
        <div className="input-glow" />

        {/* Input Container */}
        <div className="relative bg-background rounded-xl border border-border/60 flex items-center p-1 pl-3 shadow-sm hover:border-border hover:shadow-md transition-all">
          <Sparkles className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 mr-2 shrink-0" />
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AI to rewrite..."
            disabled={isLoading}
            className="w-full bg-transparent border-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 h-8 disabled:opacity-50"
          />
          <div className="flex items-center gap-1 pr-1">
            <Button
              onClick={onSubmit}
              disabled={isLoading || !value.trim()}
              variant="default"
              size="icon-sm"
              className="h-7 w-7 rounded-lg"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Footer Info */}
      <div className="flex items-center justify-between mt-2 px-1">
        <span className="text-[10px] text-muted-foreground">
          {wordCount} words &middot; {readTime}s read
        </span>
        <div className="flex items-center gap-2">
          <Button
            onClick={onReset}
            variant="ghost"
            size="sm"
            className="text-[10px] text-muted-foreground hover:text-foreground h-auto py-0 px-1"
          >
            Reset
          </Button>
          <div className="w-px h-2.5 bg-border/60" />
          <Button
            onClick={onCopy}
            variant="ghost"
            size="sm"
            className="text-[10px] text-muted-foreground hover:text-foreground h-auto py-0 px-1"
          >
            Copy
          </Button>
        </div>
      </div>
    </div>
  );
}
