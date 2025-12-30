export interface SlashCommand {
  name: string;
  description: string;
  prompt: string;
  icon?: string;
}

export interface CommandGroup {
  name: string;
  commands: SlashCommand[];
}

export const commandGroups: CommandGroup[] = [
  {
    name: "Rewrite",
    commands: [
      {
        name: "formal",
        description: "Rewrite in formal tone",
        prompt:
          "Rewrite the input text to make it more professional and formal while retaining its essential content",
        icon: "/imgs/formal.png",
      },
      {
        name: "casual",
        description: "Rewrite in casual tone",
        prompt:
          "Rewrite the input text to make it more casual and conversational while maintaining its main points",
        icon: "/imgs/casual.png",
      },
      {
        name: "academic",
        description: "Rewrite in academic tone",
        prompt:
          "Rewrite the input text to make it more academic and scholarly while retaining its essential content",
      },
      {
        name: "friendly",
        description: "Rewrite in friendly tone",
        prompt:
          "Rewrite the input text to make it more friendly and approachable while maintaining its main points",
        icon: "/imgs/friendly.png",
      },
    ],
  },
  {
    name: "Transform",
    commands: [
      {
        name: "summary",
        description: "Summarize in up to 3 sentences",
        prompt:
          "Summarize this text concisely in up to three sentences",
      },
      {
        name: "expand",
        description: "Elaborate and add more detail",
        prompt:
          "Expand and elaborate on the input text, adding more detail and depth while maintaining the original meaning",
      },
      {
        name: "shorten",
        description: "Make more concise",
        prompt:
          "Rewrite the input text to make it more concise while preserving its core meaning",
      },
      {
        name: "improve",
        description: "Improve clarity and flow",
        prompt:
          "Improve the clarity, flow, and readability of the input text while preserving its meaning",
      },
    ],
  },
];

// Flat list of all commands for easy lookup
export const allCommands: SlashCommand[] = commandGroups.flatMap(
  (group) => group.commands
);

// Find a command by name
export function findCommand(name: string): SlashCommand | undefined {
  return allCommands.find(
    (cmd) => cmd.name.toLowerCase() === name.toLowerCase()
  );
}

// Parse slash command from input: "/summary extra context" -> { command, args }
export function parseSlashCommand(input: string): {
  command: SlashCommand | undefined;
  args: string;
} | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;

  const spaceIndex = trimmed.indexOf(" ");
  const commandName =
    spaceIndex === -1
      ? trimmed.slice(1)
      : trimmed.slice(1, spaceIndex);
  const args = spaceIndex === -1 ? "" : trimmed.slice(spaceIndex + 1).trim();

  const command = findCommand(commandName);
  return { command, args };
}

// Build the final prompt, appending args if provided
export function buildPrompt(command: SlashCommand, args: string): string {
  if (args.trim()) {
    return `${command.prompt}. ${args.trim()}`;
  }
  return command.prompt;
}
