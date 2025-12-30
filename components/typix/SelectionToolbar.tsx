import { useState } from "react";
import { GripVertical, Search, FileText, PenLine, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Action, Tone } from "@/lib/types";

interface SelectionToolbarProps {
  position: { x: number; y: number };
  onAction: (action: Action, tone?: Tone) => void;
}

const TONES: { value: Tone; label: string }[] = [
  { value: "formal", label: "Formal" },
  { value: "casual", label: "Casual" },
  { value: "friendly", label: "Friendly" },
  { value: "academic", label: "Academic" },
];

export function SelectionToolbar({ position, onAction }: SelectionToolbarProps) {
  const [rewriteOpen, setRewriteOpen] = useState(false);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleToneSelect = (tone: Tone) => {
    setRewriteOpen(false);
    onAction("TONE_REWRITE", tone);
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 2147483647,
      }}
      className="flex items-center gap-1 bg-background border border-border/60 rounded-full shadow-soft p-1 animate-in"
    >
      <div className="w-7 h-7 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary cursor-grab transition-colors">
        <GripVertical className="w-3.5 h-3.5" />
      </div>

      <Button
        onClick={() => onAction("ANALYZE")}
        onMouseDown={handleMouseDown}
        variant="ghost"
        size="sm"
        className="rounded-full h-7 px-2.5 gap-1.5 text-xs font-medium hover:bg-secondary hover:text-inherit"
      >
        <Search className="w-3.5 h-3.5" />
        Analyze
      </Button>

      <Button
        onClick={() => onAction("SUMMARIZE")}
        onMouseDown={handleMouseDown}
        variant="ghost"
        size="sm"
        className="rounded-full h-7 px-2.5 gap-1.5 text-xs font-medium hover:bg-secondary hover:text-inherit"
      >
        <FileText className="w-3.5 h-3.5" />
        Summarize
      </Button>

      <Popover open={rewriteOpen} onOpenChange={setRewriteOpen}>
        <PopoverTrigger asChild>
          <Button
            onMouseDown={handleMouseDown}
            variant="ghost"
            size="sm"
            className="rounded-full h-7 px-2.5 gap-1 text-xs font-medium hover:bg-secondary hover:text-inherit"
          >
            <PenLine className="w-3.5 h-3.5" />
            Rewrite
            <ChevronDown className="w-3 h-3 opacity-60" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-36 p-1"
          align="start"
          sideOffset={8}
        >
          <div className="flex flex-col gap-0.5">
            {TONES.map((tone) => (
              <Button
                key={tone.value}
                variant="ghost"
                size="sm"
                className="justify-start h-8 px-2 text-xs font-medium rounded-md"
                onClick={() => handleToneSelect(tone.value)}
              >
                {tone.label}
              </Button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
