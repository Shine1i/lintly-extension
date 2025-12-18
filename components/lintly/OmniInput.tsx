import { useState, useRef, useEffect } from "react";
import { Sparkles, RefreshCw, FileText, GraduationCap, MessageSquare, Search } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import type { Action, Tone } from "@/lib/types";

interface Command {
  cmd: string;
  label: string;
  description: string;
  action: Action;
  tone?: Tone;
  icon: React.ReactNode;
}

const COMMANDS: Command[] = [
  { cmd: "/rewrite", label: "Rewrite", description: "Paraphrase the text", action: "PARAPHRASE", icon: <RefreshCw className="w-4 h-4 text-cyan-500" /> },
  { cmd: "/summarize", label: "Summarize", description: "Create a summary", action: "SUMMARIZE", icon: <FileText className="w-4 h-4 text-amber-500" /> },
  { cmd: "/formal", label: "Formal", description: "Rewrite formally", action: "TONE_REWRITE", tone: "formal", icon: <GraduationCap className="w-4 h-4 text-slate-500" /> },
  { cmd: "/casual", label: "Casual", description: "Rewrite casually", action: "TONE_REWRITE", tone: "casual", icon: <MessageSquare className="w-4 h-4 text-emerald-500" /> },
  { cmd: "/analyze", label: "Analyze", description: "Check grammar & style", action: "ANALYZE", icon: <Search className="w-4 h-4 text-rose-500" /> },
];

interface OmniInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onActionChange: (action: Action, tone?: Tone) => void;
}

export function OmniInput({ value, onChange, onSubmit, onActionChange }: OmniInputProps) {
  const [showCommands, setShowCommands] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredCommands = value.startsWith("/")
    ? COMMANDS.filter((cmd) => cmd.cmd.toLowerCase().startsWith(value.toLowerCase()))
    : [];

  useEffect(() => {
    if (value.startsWith("/") && filteredCommands.length > 0) {
      setShowCommands(true);
      setSelectedIndex(0);
    } else {
      setShowCommands(false);
    }
  }, [value, filteredCommands.length]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showCommands) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        selectCommand(filteredCommands[selectedIndex]);
      } else if (e.key === "Escape") {
        setShowCommands(false);
      }
    } else if (e.key === "Enter") {
      onSubmit();
    }
  };

  const selectCommand = (command: Command) => {
    onChange("");
    setShowCommands(false);
    onActionChange(command.action, command.tone);
    setTimeout(() => onSubmit(), 0);
  };

  return (
    <div className="relative p-4 pb-3 flex items-center gap-3 border-b border-slate-100/50">
      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500 to-cyan-600 flex items-center justify-center shrink-0 shadow-sm">
        <Sparkles className="w-4 h-4 text-white" />
      </div>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full bg-transparent text-base font-medium text-slate-800 placeholder-slate-400 outline-none caret-cyan-500"
        placeholder="Type / for commands, or describe your edit..."
        autoComplete="off"
        autoFocus
      />
      <div className="hidden sm:flex items-center">
        <Kbd>↵</Kbd>
      </div>

      {showCommands && filteredCommands.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 mx-4 bg-white rounded-lg shadow-xl border border-slate-200/50 py-1 z-50 dropdown-enter">
          {filteredCommands.map((cmd, index) => (
            <button
              key={cmd.cmd}
              onClick={() => selectCommand(cmd)}
              data-selected={index === selectedIndex}
              className="command-item w-full text-left"
            >
              {cmd.icon}
              <div className="flex-1">
                <span className="font-medium text-slate-800">{cmd.label}</span>
                <span className="ml-2 text-slate-400 text-xs">{cmd.description}</span>
              </div>
              <span className="text-xs text-slate-400 font-mono">{cmd.cmd}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
