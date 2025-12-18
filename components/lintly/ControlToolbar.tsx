import { ChevronDown, Zap } from "lucide-react";
import { HealthIndicator } from "./HealthIndicator";
import type { Action, Issue, Tone } from "@/lib/types";

interface ControlToolbarProps {
  tone: Tone;
  onToneChange: (tone: Tone) => void;
  action: Action;
  onActionClick: () => void;
  issues: Issue[];
  fieldIssueCount?: number;
  isLoading: boolean;
}

const TONES: Tone[] = ["formal", "casual", "professional", "friendly", "academic"];

const ACTION_LABELS: Record<Action, string> = {
  ANALYZE: "Analyze",
  SUMMARIZE: "Summarize",
  PARAPHRASE: "Rewrite",
  TONE_REWRITE: "Rewrite",
  CUSTOM: "Run",
};

export function ControlToolbar({
  tone,
  onToneChange,
  action,
  onActionClick,
  issues,
  fieldIssueCount = 0,
  isLoading,
}: ControlToolbarProps) {
  return (
    <div className="px-4 py-2 flex items-center justify-between bg-slate-50/50 border-b border-slate-100/50 relative z-20">
      <div className="flex items-center gap-2">
        <div className="relative group">
          <button className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-white hover:shadow-sm hover:ring-1 hover:ring-black/5 transition-all">
            <span className="text-slate-400">Tone:</span> {tone.charAt(0).toUpperCase() + tone.slice(1)}
            <ChevronDown className="w-3 h-3 text-slate-400 group-hover:text-slate-600" />
          </button>
          <div className="absolute top-full left-0 mt-1 w-32 bg-white rounded-lg shadow-xl ring-1 ring-black/5 p-1 hidden group-hover:block z-50">
            {TONES.map((t) => (
              <button
                key={t}
                onClick={() => onToneChange(t)}
                className={`w-full text-left px-3 py-1.5 text-xs rounded hover:bg-slate-50 ${
                  tone === t ? "text-cyan-600 font-medium" : "text-slate-600"
                }`}
              >
                {t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="w-px h-3 bg-slate-200" />

        <button
          onClick={onActionClick}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-cyan-600 bg-cyan-50/50 hover:bg-cyan-50 border border-cyan-100/50 transition-all disabled:opacity-50"
        >
          <span className="text-cyan-400">Action:</span>
          {isLoading ? "Processing..." : ACTION_LABELS[action]}
          <Zap className="w-3 h-3 text-cyan-400" />
        </button>
      </div>

      <HealthIndicator issues={issues} fieldIssueCount={fieldIssueCount} />
    </div>
  );
}
