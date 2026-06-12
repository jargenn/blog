import { Blog } from "./Blog.ts";

import { parseArgs } from "@std/cli/parse-args";

const VALID_COMMANDS = ["draft", "build", "watch", "serve"] as const;

type Command = typeof VALID_COMMANDS[number];

export function parseCli(
  argv: string[],
): {
  command: Command;
  args: string[];
  options: Record<string, string | boolean>;
} {
  const [rawCommand, ...rest] = argv;

  if (!rawCommand || !VALID_COMMANDS.includes(rawCommand as Command)) {
    console.error(
      `Unknown command, use one of: ${VALID_COMMANDS.join(", ")}`,
    );
    Deno.exit(1);
  }

  const command = rawCommand as Command;

  const parsed = parseArgs(rest);

  const options: Record<string, string | boolean> = {};

  for (const [key, value] of Object.entries(parsed)) {
    if (key === "_") continue;

    if (
      typeof value === "string" ||
      typeof value === "boolean"
    ) {
      options[key] = value;
    }
  }

  return {
    command,
    args: parsed._.map(String),
    options,
  };
}

async function main() {
  const { command, args, options } = parseCli(Deno.args);

  switch (command) {
    case "draft": {
      const title = args[0];

      if (!title) {
        console.error("Error: Missing required argument: title");
        Deno.exit(1);
      }

      await Blog.draft(title, options.published === true);
      break;
    }

    case "build":
      await Blog.build(
        options.clean !== false,
        options.blogroll === true,
      );
      break;

    case "watch":
      await Blog.watch(
        options.clean !== false,
      );
      break;

    case "serve":
      await Blog.serve(
        Number(options.port ?? 8080),
      );
      break;
  }
}

if (import.meta.main) await main();
