import { CheckCircle2 } from "lucide-react";
import type { Issue } from "@/lib/types";

interface DiffViewProps {
  original: string;
  refined: string;
  issues: Issue[];
}

function highlightDiff(text: string, issues: Issue[], isOriginal: boolean) {
  if (issues.length === 0) {
    return <span>{text}</span>;
  }

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;

  const sortedIssues = [...issues].sort((a, b) => {
    const aIndex = text.indexOf(a.original);
    const bIndex = text.indexOf(b.original);
    return aIndex - bIndex;
  });

  sortedIssues.forEach((issue, i) => {
    const index = text.indexOf(issue.original, lastIndex);
    if (index === -1) return;

    if (index > lastIndex) {
      parts.push(<span key={`text-${i}`}>{text.slice(lastIndex, index)}</span>);
    }

    if (isOriginal) {
      parts.push(
        <span key={`diff-${i}`} className="diff-del">
          {issue.original}
        </span>
      );
    } else {
      parts.push(
        <span key={`diff-${i}`} className="diff-add">
          {issue.suggestion}
        </span>
      );
    }

    lastIndex = index + issue.original.length;
  });

  if (lastIndex < text.length) {
    parts.push(<span key="remaining">{text.slice(lastIndex)}</span>);
  }

  return <>{parts}</>;
}

export function DiffView({ original, refined, issues }: DiffViewProps) {
  return (
    <div className="border-t border-gray-100">
      <div className="grid grid-cols-2 divide-x divide-gray-100 bg-gray-50/50">
        <div className="p-5 pr-4">
          <h4 className="text-[10px] uppercase font-bold text-gray-400 mb-2 tracking-wider">
            Original
          </h4>
          <p className="text-sm leading-relaxed text-gray-400 font-normal">
            {highlightDiff(original, issues, true)}
          </p>
        </div>

        <div className="p-5 pl-4 bg-white relative">
          <div className="absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-green-50/50 to-transparent pointer-events-none" />
          <h4 className="text-[10px] uppercase font-bold text-emerald-600 mb-2 tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Refined
          </h4>
          <p className="text-sm leading-relaxed text-slate-800 font-medium">
            {issues.length > 0 ? highlightDiff(original, issues, false) : refined}
          </p>
        </div>
      </div>
    </div>
  );
}
