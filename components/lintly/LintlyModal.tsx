import { useEffect, useRef } from "react";
import { X, Copy } from "lucide-react";
import { OmniInput } from "./OmniInput";
import { ControlToolbar } from "./ControlToolbar";
import { SourceTextArea } from "./SourceTextArea";
import { DiffView } from "./DiffView";
import type { Action, AnalyzeResult, Issue, Tone } from "@/lib/types";

interface LintlyModalProps {
  isVisible: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  sourceText: string;
  fieldIssueCount?: number;
  onSourceTextChange: (text: string) => void;
  customInstruction: string;
  onCustomInstructionChange: (instruction: string) => void;
  tone: Tone;
  onToneChange: (tone: Tone) => void;
  action: Action;
  onActionClick: () => void;
  onActionChange: (action: Action) => void;
  isLoading: boolean;
  result: string | AnalyzeResult | null;
  onCopy: () => void;
  onReplace: () => void;
}

export function LintlyModal({
  isVisible,
  position,
  onClose,
  sourceText,
  fieldIssueCount = 0,
  onSourceTextChange,
  customInstruction,
  onCustomInstructionChange,
  tone,
  onToneChange,
  action,
  onActionClick,
  onActionChange,
  isLoading,
  result,
  onCopy,
  onReplace,
}: LintlyModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose();
      }
    }

    if (isVisible) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isVisible, onClose]);

  if (!isVisible) return null;

  const issues: Issue[] = result && typeof result === "object" ? result.issues : [];
  const refinedText =
    result && typeof result === "object"
      ? result.corrected_text
      : typeof result === "string"
        ? result
        : "";

  const showDiff = result !== null;

  const handleModalMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div
      ref={modalRef}
      onMouseDown={handleModalMouseDown}
      style={{
        position: "fixed",
        left: position.x,
        top: position.y,
        zIndex: 2147483646,
      }}
      className="w-[500px] glass-panel rounded-2xl animate-in flex flex-col"
    >
      <button
        onClick={onClose}
        className="absolute -top-2 -right-2 w-6 h-6 bg-white rounded-full shadow-md flex items-center justify-center hover:bg-slate-50 transition-colors z-10"
      >
        <X className="w-3 h-3 text-slate-500" />
      </button>

      <OmniInput
        value={customInstruction}
        onChange={onCustomInstructionChange}
        onSubmit={onActionClick}
        onActionChange={onActionChange}
      />

      <ControlToolbar
        tone={tone}
        onToneChange={onToneChange}
        action={action}
        onActionClick={onActionClick}
        issues={issues}
        fieldIssueCount={fieldIssueCount}
        isLoading={isLoading}
      />

      <SourceTextArea value={sourceText} onChange={onSourceTextChange} />

      {showDiff && (
        <>
          <DiffView original={sourceText} refined={refinedText} issues={issues} />
          <div className="bg-white px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2 rounded-b-2xl">
            <button
              onClick={onCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50 rounded-md transition-colors"
            >
              <Copy className="w-3.5 h-3.5" />
              Copy
            </button>
            <button
              onClick={onReplace}
              disabled={!refinedText}
              className="px-4 py-1.5 bg-slate-900 text-white text-sm font-medium rounded-md hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              Replace Selection
            </button>
          </div>
        </>
      )}
    </div>
  );
}
