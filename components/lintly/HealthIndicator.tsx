import { useState } from "react";
import type { Issue } from "@/lib/types";

interface HealthIndicatorProps {
  issues: Issue[];
  fieldIssueCount?: number;
}

export function HealthIndicator({ issues, fieldIssueCount = 0 }: HealthIndicatorProps) {
  const [isOpen, setIsOpen] = useState(false);

  const errorCount = issues.filter((i) => i.severity === "error").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;
  const suggestionCount = issues.filter((i) => i.severity === "suggestion").length;

  const totalIssues = issues.length + fieldIssueCount;
  const healthScore = Math.max(0, 100 - errorCount * 10 - warningCount * 5 - suggestionCount * 2 - fieldIssueCount * 3);
  const healthColor =
    healthScore >= 80 ? "bg-emerald-400" : healthScore >= 60 ? "bg-amber-400" : "bg-rose-400";

  const groupedIssues = issues.reduce(
    (acc, issue) => {
      const key = issue.type;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white border border-gray-200 shadow-sm text-xs font-semibold text-gray-700 hover:border-gray-300 transition-colors"
      >
        Health: {healthScore}%
        <div className={`w-2 h-2 rounded-full ${healthColor} shadow-[0_0_4px_rgba(251,191,36,0.5)]`} />
      </button>

      {isOpen && totalIssues > 0 && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-lg shadow-xl ring-1 ring-black/5 p-1 dropdown-enter z-50">
          <div className="px-3 py-2 border-b border-gray-50 flex justify-between items-center">
            <span className="text-[10px] uppercase font-bold text-gray-400 tracking-wider">
              Issues Found
            </span>
            <span className="text-[10px] text-gray-400">{totalIssues} total</span>
          </div>
          {fieldIssueCount > 0 && (
            <div className="px-3 py-2 border-b border-gray-50 flex items-center justify-between">
              <span className="text-xs text-slate-500">Document issues</span>
              <span className="text-xs font-medium text-amber-600 bg-amber-50 px-1.5 rounded">{fieldIssueCount}</span>
            </div>
          )}
          <div className="p-1 space-y-0.5">
            {Object.entries(groupedIssues).map(([type, count]) => (
              <div
                key={type}
                className="flex items-center justify-between px-3 py-1.5 hover:bg-gray-50 rounded cursor-pointer group"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${
                      type === "grammar" || type === "spelling"
                        ? "bg-rose-400"
                        : type === "punctuation"
                          ? "bg-amber-400"
                          : "bg-blue-400"
                    }`}
                  />
                  <span className="text-xs text-gray-600 group-hover:text-gray-900 capitalize">
                    {type.replace("_", " ")}
                  </span>
                </div>
                <span className="text-xs font-medium text-gray-400 bg-gray-100 px-1.5 rounded">
                  {count}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
