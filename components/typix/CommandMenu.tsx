import {
  useEffect,
  useRef,
  useCallback,
  useMemo,
  useImperativeHandle,
  forwardRef,
} from "react";
import { commandGroups, type SlashCommand } from "@/lib/commands";
import type { PublicPath } from "wxt/browser";

interface CommandMenuProps {
  open: boolean;
  onClose: () => void;
  onSelect: (command: SlashCommand) => void;
  search: string;
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
}

export interface CommandMenuHandle {
  selectActive: () => void;
}

export const CommandMenu = forwardRef<CommandMenuHandle, CommandMenuProps>(
  function CommandMenu(
    { open, onClose, onSelect, search, activeIndex, onActiveIndexChange },
    ref
  ) {
    const menuRef = useRef<HTMLDivElement>(null);

    // Filter value is the text after "/"
    const filterValue = search.startsWith("/")
      ? search.slice(1).toLowerCase()
      : "";

    // Filter commands based on search
    const filteredCommands = useMemo(() => {
      const allFiltered: SlashCommand[] = [];

      for (const group of commandGroups) {
        for (const cmd of group.commands) {
          if (
            !filterValue ||
            cmd.name.toLowerCase().includes(filterValue) ||
            cmd.description.toLowerCase().includes(filterValue)
          ) {
            allFiltered.push(cmd);
          }
        }
      }

      return allFiltered;
    }, [filterValue]);

    // Group filtered commands for display
    const filteredGroups = useMemo(() => {
      if (!filterValue) return commandGroups;

      return commandGroups
        .map((group) => ({
          ...group,
          commands: group.commands.filter(
            (cmd) =>
              cmd.name.toLowerCase().includes(filterValue) ||
              cmd.description.toLowerCase().includes(filterValue)
          ),
        }))
        .filter((group) => group.commands.length > 0);
    }, [filterValue]);

    // Reset active index when filter changes
    useEffect(() => {
      onActiveIndexChange(0);
    }, [filterValue, onActiveIndexChange]);

    // Expose method to select the active item
    useImperativeHandle(
      ref,
      () => ({
        selectActive: () => {
          if (filteredCommands[activeIndex]) {
            onSelect(filteredCommands[activeIndex]);
          }
        },
      }),
      [filteredCommands, activeIndex, onSelect]
    );

    // Handle escape key
    useEffect(() => {
      if (!open) return;

      function handleKeyDown(event: KeyboardEvent) {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }

      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [open, onClose]);

    // Scroll active item into view
    useEffect(() => {
      if (!open) return;
      const activeElement = menuRef.current?.querySelector(
        `[data-index="${activeIndex}"]`
      );
      activeElement?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, open]);

    const handleItemClick = useCallback(
      (command: SlashCommand) => {
        onSelect(command);
      },
      [onSelect]
    );

    if (!open) return null;

    const hasResults = filteredCommands.length > 0;

    // Build flat index for items
    let itemIndex = 0;

    return (
      <div
        ref={menuRef}
        id="command-menu"
        className="absolute bottom-full left-0 right-0 mb-2 z-50"
        role="listbox"
        aria-label="Available commands"
      >
        <div className="rounded-lg border border-border shadow-lg bg-popover overflow-hidden">
          <div className="max-h-[240px] overflow-y-auto p-1 no-scrollbar">
            {!hasResults && (
              <div className="py-4 text-center text-sm text-muted-foreground">
                No commands found.
              </div>
            )}
            {filteredGroups.map((group) => (
              <div key={group.name} className="mb-1 last:mb-0">
                <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
                  {group.name}
                </div>
                {group.commands.map((command) => {
                  const currentIndex = itemIndex++;
                  const isActive = currentIndex === activeIndex;

                  return (
                    <div
                      key={command.name}
                      id={`command-item-${currentIndex}`}
                      data-index={currentIndex}
                      role="option"
                      aria-selected={isActive}
                      onClick={() => handleItemClick(command)}
                      onMouseEnter={() => onActiveIndexChange(currentIndex)}
                      className={`flex items-center gap-2 min-w-0 px-2 py-1.5 rounded-sm cursor-pointer text-sm ${
                        isActive
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground hover:bg-accent/50"
                      }`}
                    >
                      {command.icon && (
                        <img
                          src={browser.runtime.getURL(command.icon as PublicPath)}
                          alt=""
                          className="w-14 h-14 shrink-0 object-cover scale-150"
                        />
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="font-medium">/{command.name}</span>
                        <span className="text-xs text-muted-foreground truncate">
                          {command.description}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }
);

// Helper to get total filtered count (for keyboard navigation bounds)
export function getFilteredCommandCount(search: string): number {
  const filterValue = search.startsWith("/")
    ? search.slice(1).toLowerCase()
    : "";

  if (!filterValue) {
    return commandGroups.reduce((acc, g) => acc + g.commands.length, 0);
  }

  let count = 0;
  for (const group of commandGroups) {
    for (const cmd of group.commands) {
      if (
        cmd.name.toLowerCase().includes(filterValue) ||
        cmd.description.toLowerCase().includes(filterValue)
      ) {
        count++;
      }
    }
  }
  return count;
}
