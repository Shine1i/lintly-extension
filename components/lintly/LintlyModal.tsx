import { useEffect, useRef, useState, useMemo } from "react";
import { ModalHeader } from "./ModalHeader";
import { TextSurface } from "./TextSurface";
import { BottomInput } from "./BottomInput";
import { BulkAcceptPanel } from "./BulkAcceptPanel";
import { BulkUndoBanner } from "./BulkUndoBanner";
import type { AnalyzeResult, Issue, Tone } from "@/lib/types";
import type { BulkUndoState } from "@/lib/state/lintlyAppState";
import { BULK_MIN_COUNT, getBulkCandidates } from "@/lib/bulkAccept";
import { sortIssuesByTextPosition } from "@/lib/textPositioning";
import { trackEvent } from "@/lib/analytics";

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
  onApplyAllFixes: (issues: Issue[]) => void;
  bulkUndo: BulkUndoState | null;
  onUndoBulk: () => void;
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
  bulkUndo,
  onUndoBulk,
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

  const bulkCandidates = useMemo(() => getBulkCandidates(issues), [issues]);
  const sortedBulkCandidates = useMemo(
    () => sortIssuesByTextPosition(sourceText, bulkCandidates),
    [sourceText, bulkCandidates]
  );
  const [bulkDismissed, setBulkDismissed] = useState(false);
  const [bulkOfferTracked, setBulkOfferTracked] = useState(false);
  const [selectedBulkIssues, setSelectedBulkIssues] = useState<Issue[]>([]);

  useEffect(() => {
    setSelectedBulkIssues(sortedBulkCandidates);
    setBulkDismissed(false);
    setBulkOfferTracked(false);
  }, [sortedBulkCandidates, sourceText]);

  useEffect(() => {
    if (!isVisible) {
      setBulkDismissed(false);
      setBulkOfferTracked(false);
      setSelectedBulkIssues([]);
    }
  }, [isVisible]);

  const showBulkPanel =
    isVisible &&
    !bulkUndo &&
    !bulkDismissed &&
    !isLoading &&
    sortedBulkCandidates.length >= BULK_MIN_COUNT;

  useEffect(() => {
    if (!showBulkPanel || bulkOfferTracked) return;
    trackEvent("bulk_offer_shown", {
      totalIssues: issues.length,
      eligibleIssues: sortedBulkCandidates.length,
      sourceLength: sourceText.length,
    });
    setBulkOfferTracked(true);
  }, [
    bulkOfferTracked,
    issues.length,
    showBulkPanel,
    sortedBulkCandidates.length,
    sourceText.length,
  ]);

  const handleBulkToggle = (issue: Issue) => {
    setSelectedBulkIssues((prev) =>
      prev.includes(issue) ? prev.filter((item) => item !== issue) : [...prev, issue]
    );
  };

  const handleBulkSelectAll = () => {
    setSelectedBulkIssues(sortedBulkCandidates);
  };

  const handleBulkSelectNone = () => {
    setSelectedBulkIssues([]);
  };

  const handleBulkDismiss = () => {
    setBulkDismissed(true);
    trackEvent("bulk_offer_dismissed", {
      totalIssues: issues.length,
      eligibleIssues: sortedBulkCandidates.length,
    });
  };

  const handleBulkApply = () => {
    onApplyAllFixes(selectedBulkIssues);
  };

  const handleModalMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  const handleSubmit = () => {
    if (customInstruction.trim()) {
      onCustomSubmit(customInstruction);
    }
  };

  // Avoid conditional hooks.
  if (!isVisible) return null;

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

          {bulkUndo && (
            <BulkUndoBanner
              appliedCount={bulkUndo.appliedCount}
              skippedCount={bulkUndo.skippedCount}
              onUndo={onUndoBulk}
            />
          )}

          {showBulkPanel && (
            <BulkAcceptPanel
              issues={sortedBulkCandidates}
              selectedIssues={selectedBulkIssues}
              onToggleIssue={handleBulkToggle}
              onSelectAll={handleBulkSelectAll}
              onSelectNone={handleBulkSelectNone}
              onApply={handleBulkApply}
              onDismiss={handleBulkDismiss}
              isLoading={isLoading}
            />
          )}

          <TextSurface
            text={displayText}
            issues={issues}
            onApplyFix={onApplyFix}
            onApplyWordFix={onApplyWordFix}
            isLoading={isLoading}
          />

          {issues.length > 0 && (
            <div className="shrink-0 px-4 py-2 bg-muted/50 border-t border-border/50 flex items-center justify-start">
              <span className="text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">{issues.length}</span> {issues.length === 1 ? "issue" : "issues"} found
              </span>
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
