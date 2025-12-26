import { useState, useRef, useCallback, useEffect } from "react";
import { Sparkles, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CommandMenu,
  getFilteredCommandCount,
  type CommandMenuHandle,
} from "./CommandMenu";
import {
  parseSlashCommand,
  buildPrompt,
  type SlashCommand,
} from "@/lib/commands";

interface BottomInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (processedInstruction?: string) => void;
  wordCount: number;
  readTime: number;
  onReset: () => void;
  onCopy: () => void;
  isLoading?: boolean;
}

export function BottomInput({
  value,
  onChange,
  onSubmit,
  wordCount,
  readTime,
  onReset,
  onCopy,
  isLoading,
}: BottomInputProps) {
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const commandMenuRef = useRef<CommandMenuHandle>(null);

  // Show command menu when typing "/" at the start
  useEffect(() => {
    const shouldShowMenu = value.startsWith("/") && !value.includes(" ");
    setCommandMenuOpen(shouldShowMenu);
    if (!shouldShowMenu) {
      setActiveIndex(0);
    }
  }, [value]);

  const handleCommandSelect = useCallback(
    (command: SlashCommand) => {
      // Insert the command and add a space for the argument
      onChange(`/${command.name} `);
      setCommandMenuOpen(false);
      setActiveIndex(0);
      // Focus back on input
      inputRef.current?.focus();
    },
    [onChange]
  );

  const handleCommandMenuClose = useCallback(() => {
    setCommandMenuOpen(false);
    setActiveIndex(0);
  }, []);

  const handleActiveIndexChange = useCallback((index: number) => {
    setActiveIndex(index);
  }, []);

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;

    // Check if it's a slash command
    const parsed = parseSlashCommand(trimmed);
    if (parsed?.command) {
      // Build the prompt from the command template
      const builtPrompt = buildPrompt(parsed.command, parsed.args);
      onSubmit(builtPrompt);
    } else if (trimmed.startsWith("/")) {
      // Invalid slash command - don't submit
      return;
    } else {
      // Regular custom instruction
      onSubmit();
    }

    // Keep focus on input after submit
    inputRef.current?.focus();
  }, [value, onSubmit]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Prevent page-level shortcuts while typing inside the modal.
    e.stopPropagation();

    if (commandMenuOpen) {
      const itemCount = getFilteredCommandCount(value);

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          setActiveIndex((prev) => (prev < itemCount - 1 ? prev + 1 : 0));
          return;

        case "ArrowUp":
          e.preventDefault();
          setActiveIndex((prev) => (prev > 0 ? prev - 1 : itemCount - 1));
          return;

        case "Enter":
          e.preventDefault();
          // Select the active command
          commandMenuRef.current?.selectActive();
          return;

        case "Escape":
          e.preventDefault();
          setCommandMenuOpen(false);
          setActiveIndex(0);
          return;

        case "Tab":
          // Tab also selects the active command
          e.preventDefault();
          commandMenuRef.current?.selectActive();
          return;
      }
    }

    // Normal submit when menu is closed
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  // Determine placeholder based on state
  const placeholder = value.startsWith("/")
    ? "Type to filter commands..."
    : "Ask AI to rewrite... (try /summary)";

  // For aria-activedescendant
  const activeDescendant = commandMenuOpen
    ? `command-item-${activeIndex}`
    : undefined;

  return (
    <div className="shrink-0 p-3 bg-background border-t border-border/50 z-30">
      <div className="relative group">
        <div className="input-glow" />

        {/* Command Menu */}
        <CommandMenu
          ref={commandMenuRef}
          open={commandMenuOpen}
          onClose={handleCommandMenuClose}
          onSelect={handleCommandSelect}
          search={value}
          activeIndex={activeIndex}
          onActiveIndexChange={handleActiveIndexChange}
        />

        <div className="relative bg-background rounded-xl border border-border/60 flex items-center p-1 pl-3 shadow-sm hover:border-border hover:shadow-md transition-all">
          <Sparkles className="w-3.5 h-3.5 text-purple-500 dark:text-purple-400 mr-2 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            className="w-full bg-transparent border-none text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 h-8 disabled:opacity-50"
            role="combobox"
            aria-expanded={commandMenuOpen}
            aria-haspopup="listbox"
            aria-controls={commandMenuOpen ? "command-menu" : undefined}
            aria-activedescendant={activeDescendant}
            aria-autocomplete="list"
          />
          <div className="flex items-center gap-1 pr-1">
            <Button
              onClick={handleSubmit}
              disabled={isLoading || !value.trim()}
              variant="default"
              size="icon-sm"
              className="h-7 w-7 rounded-lg"
              aria-label="Submit"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 px-1">
        <span className="text-[10px] text-muted-foreground">
          {wordCount} words &middot; {readTime}s read
        </span>
        <div className="flex items-center gap-2">
          <Button
            onClick={onReset}
            variant="ghost"
            size="sm"
            className="text-[10px] text-muted-foreground hover:text-foreground h-auto py-0 px-1"
          >
            Reset
          </Button>
          <div className="w-px h-2.5 bg-border/60" />
          <Button
            onClick={onCopy}
            variant="ghost"
            size="sm"
            className="text-[10px] text-muted-foreground hover:text-foreground h-auto py-0 px-1"
          >
            Copy
          </Button>
        </div>
      </div>
    </div>
  );
}
