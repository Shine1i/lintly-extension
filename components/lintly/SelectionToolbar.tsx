import { GripVertical, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SelectionToolbarProps {
  position: { x: number; y: number };
  onOpen: () => void;
}

export function SelectionToolbar({ position, onOpen }: SelectionToolbarProps) {
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
      className="flex items-center gap-2 bg-background border border-border/60 rounded-full shadow-soft p-1.5 pr-3 hover:scale-105 transition-transform duration-300 animate-in"
    >
      <div className="w-8 h-8 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary cursor-grab transition-colors">
        <GripVertical className="w-4 h-4" />
      </div>

      <Button
        onClick={onOpen}
        onMouseDown={handleMouseDown}
        variant="ghost"
        size="icon-sm"
        className="rounded-full h-8 w-8 bg-purple-500 hover:bg-purple-400 dark:bg-purple-500 dark:hover:bg-purple-400 text-white shadow-sm"
        title="Analyze text"
      >
        <Wand2 className="w-4 h-4" />
      </Button>
    </div>
  );
}
