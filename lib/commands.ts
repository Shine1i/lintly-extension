export interface SlashCommand {
  name: string;
  description: string;
  prompt: string;
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
          "Rewrite the following text in a formal tone while preserving all meaning. Output only the rewritten text. $ARGUMENT",
      },
      {
        name: "casual",
        description: "Rewrite in casual tone",
        prompt:
          "Rewrite the following text in a casual, conversational tone while preserving all meaning. Output only the rewritten text. $ARGUMENT",
      },
      {
        name: "professional",
        description: "Rewrite in professional tone",
        prompt:
          "Rewrite the following text in a professional tone suitable for business communication while preserving all meaning. Output only the rewritten text. $ARGUMENT",
      },
      {
        name: "academic",
        description: "Rewrite in academic tone",
        prompt:
          "Rewrite the following text in an academic tone suitable for scholarly writing while preserving all meaning. Output only the rewritten text. $ARGUMENT",
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
          "Provide a concise, objective summary of the input text in up to three sentences, focusing on key actions and intentions without using second or third person pronouns. Output only the summary. $ARGUMENT",
      },
      {
        name: "expand",
        description: "Elaborate and add more detail",
        prompt:
          "Expand and elaborate on the following text, adding more detail and depth while maintaining the original meaning and intent. Output only the expanded text. $ARGUMENT",
      },
      {
        name: "shorten",
        description: "Make more concise",
        prompt:
          "Condense the following text to be more concise while preserving the key meaning and important details. Output only the shortened text. $ARGUMENT",
      },
      {
        name: "improve",
        description: "Improve clarity and flow",
        prompt:
          "Improve the clarity, flow, and readability of the following text while preserving its meaning. Output only the improved text. $ARGUMENT",
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

// Build the final prompt by replacing $ARGUMENT placeholder
export function buildPrompt(command: SlashCommand, args: string): string {
  return command.prompt.replace("$ARGUMENT", args).trim();
}
