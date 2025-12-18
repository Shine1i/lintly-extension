import { Sparkles, FileText, MoreHorizontal } from "lucide-react";

interface SelectionToolbarProps {
  position: { x: number; y: number };
  onRewrite: () => void;
  onSummarize: () => void;
  onMore: () => void;
}

export function SelectionToolbar({
  position,
  onRewrite,
  onSummarize,
  onMore,
}: SelectionToolbarProps) {
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
      className="flex items-center bg-white/95 backdrop-blur-xl rounded-lg shadow-lg border border-slate-200/50 animate-in"
    >
      <button
        onClick={onRewrite}
        onMouseDown={handleMouseDown}
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-cyan-50 hover:text-cyan-700 transition-colors rounded-l-lg"
      >
        <Sparkles className="w-3.5 h-3.5 text-cyan-500" />
        <span>Rewrite</span>
      </button>

      <div className="w-px h-5 bg-slate-200" />

      <button
        onClick={onSummarize}
        onMouseDown={handleMouseDown}
        className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-cyan-50 hover:text-cyan-700 transition-colors"
      >
        <FileText className="w-3.5 h-3.5 text-amber-500" />
        <span>Summarize</span>
      </button>

      <div className="w-px h-5 bg-slate-200" />

      <button
        onClick={onMore}
        onMouseDown={handleMouseDown}
        className="flex items-center px-2.5 py-2 text-slate-500 hover:bg-slate-50 hover:text-slate-700 transition-colors rounded-r-lg"
        title="More options"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
    </div>
  );
}
