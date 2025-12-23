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
  onApplyWordFix?: (issue: Issue) => void;
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
  onApplyWordFix,
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

  // Clear custom prompts so stale instructions don't leak into later runs.
  useEffect(() => {
    if (!isVisible) {
      setCustomInstruction("");
    }
  }, [isVisible]);

  // Compute bounds before any early return to keep hook order stable.
  const adjustedPosition = useMemo(() => {
    const modalWidth = 560;
    const modalHeight = 380;
    const margin = 16;

    let x = position.x;
    let y = position.y;

    if (x + modalWidth > window.innerWidth - margin) {
      x = window.innerWidth - modalWidth - margin;
    }
    if (x < margin) {
      x = margin;
    }

    if (y + modalHeight > window.innerHeight - margin) {
      y = window.innerHeight - modalHeight - margin;
    }
    if (y < margin) {
      y = margin;
    }

    return { x, y };
  }, [position]);

  // Avoid conditional hooks.
  if (!isVisible) return null;

  const issues: Issue[] = result && typeof result === "object" ? result.issues : [];

  // Keep source text while issues remain so highlights stay aligned.
  const displayText =
    typeof result === "string"
      ? result
      : issues.length > 0
        ? sourceText
        : result?.corrected_text || sourceText;

  const wordCount = displayText.trim().split(/\s+/).filter(Boolean).length;
  const readTimeSeconds = Math.max(1, Math.ceil(wordCount / 200) * 60);

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
        <main className="flex-1 flex flex-col min-w-0 bg-background relative rounded-2xl overflow-hidden">
          <ModalHeader
            issues={issues}
            tone={tone}
            onToneChange={onToneChange}
          />

          <TextSurface
            text={displayText}
            issues={issues}
            onApplyFix={onApplyFix}
            onApplyWordFix={onApplyWordFix}
            isLoading={isLoading}
          />

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

          <BottomInput
            value={customInstruction}
            onChange={setCustomInstruction}
            onSubmit={handleSubmit}
            wordCount={wordCount}
            readTime={readTimeSeconds}
            onReset={onReset}
            onCopy={onCopy}
            isLoading={isLoading}
          />
        </main>
      </div>
    </>
  );
}
