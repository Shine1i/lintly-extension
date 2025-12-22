import { useEffect, useRef, useState, useMemo } from "react";
import { Wand2 } from "lucide-react";
import { ModalHeader } from "./ModalHeader";
import { TextSurface } from "./TextSurface";
import { BottomInput } from "./BottomInput";
import { Button } from "@/components/ui/button";
import type { AnalyzeResult, Issue, Tone } from "@/lib/types";

interface LintlyModalProps {
  isVisible: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  sourceText: string;
  tone: Tone;
  onToneChange: (tone: Tone) => void;
  isLoading: boolean;
  result: string | AnalyzeResult | null;
  onApplyFix: (issue: Issue) => void;
  onApplyAllFixes: () => void;
  onCopy: () => void;
  onReset: () => void;
  onCustomSubmit: (instruction: string) => void;
}

export function LintlyModal({
  isVisible,
  position,
  onClose,
  sourceText,
  tone,
  onToneChange,
  isLoading,
  result,
  onApplyFix,
  onApplyAllFixes,
  onCopy,
  onReset,
  onCustomSubmit,
}: LintlyModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const [customInstruction, setCustomInstruction] = useState("");

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

  // Reset custom instruction when modal closes
  useEffect(() => {
    if (!isVisible) {
      setCustomInstruction("");
    }
  }, [isVisible]);

  // Adjust position to keep modal in viewport - MUST be before early return
  const adjustedPosition = useMemo(() => {
    const modalWidth = 560;
    const modalHeight = 380;
    const margin = 16;

    let x = position.x;
    let y = position.y;

    // Adjust horizontal position
    if (x + modalWidth > window.innerWidth - margin) {
      x = window.innerWidth - modalWidth - margin;
    }
    if (x < margin) {
      x = margin;
    }

    // Adjust vertical position
    if (y + modalHeight > window.innerHeight - margin) {
      y = window.innerHeight - modalHeight - margin;
    }
    if (y < margin) {
      y = margin;
    }

    return { x, y };
  }, [position]);

  // Early return AFTER all hooks
  if (!isVisible) return null;

  const issues: Issue[] = result && typeof result === "object" ? result.issues : [];

  // Show sourceText (with errors) when we have issues to highlight
  // Show corrected_text only when all issues are fixed (issues.length === 0)
  // For non-ANALYZE results (string), show the result directly
  const displayText =
    typeof result === "string"
      ? result
      : issues.length > 0
        ? sourceText  // Show original text with errors highlighted
        : result?.corrected_text || sourceText;

  // Calculate word count and read time
  const wordCount = displayText.trim().split(/\s+/).filter(Boolean).length;
  const readTime = Math.max(1, Math.ceil(wordCount / 200) * 60); // in seconds

  const handleModalMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleSubmit = () => {
    if (customInstruction.trim()) {
      onCustomSubmit(customInstruction);
    }
  };

  return (
    <>
      {/* Ambient Glows - Subtle cyan/teal */}
      <div
        className="ambient-glow-indigo"
        style={{
          top: "-15%",
          right: "5%",
        }}
      />
      <div
        className="ambient-glow-rose"
        style={{
          bottom: "-10%",
          left: "5%",
        }}
      />

      {/* Main Modal Container - Clean white card with soft shadow */}
      <div
        ref={modalRef}
        onMouseDown={handleModalMouseDown}
        style={{
          position: "fixed",
          left: adjustedPosition.x,
          top: adjustedPosition.y,
          zIndex: 2147483646,
        }}
        className="w-[560px] h-[380px] bg-background rounded-2xl shadow-soft flex overflow-hidden animate-in border border-border/40 ring-1 ring-black/5 dark:ring-white/5"
      >
        {/* Main Content */}
        <main className="flex-1 flex flex-col min-w-0 bg-background relative rounded-2xl overflow-hidden">
          {/* Header */}
          <ModalHeader
            issues={issues}
            tone={tone}
            onToneChange={onToneChange}
          />

          {/* Text Surface */}
          <TextSurface text={displayText} issues={issues} onApplyFix={onApplyFix} isLoading={isLoading} />

          {/* Issues Action Bar - Only show when there are issues */}
          {issues.length > 0 && (
            <div className="shrink-0 px-4 py-2 bg-muted/50 border-t border-border/50 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{issues.length}</span> {issues.length === 1 ? "issue" : "issues"} found
              </span>
              <Button
                onClick={onApplyAllFixes}
                variant="default"
                size="sm"
                className="h-7 px-2.5 text-xs font-medium"
              >
                <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                Apply All
              </Button>
            </div>
          )}

          {/* Bottom Input */}
          <BottomInput
            value={customInstruction}
            onChange={setCustomInstruction}
            onSubmit={handleSubmit}
            wordCount={wordCount}
            readTime={readTime}
            onReset={onReset}
            onCopy={onCopy}
            isLoading={isLoading}
          />
        </main>
      </div>
    </>
  );
}
