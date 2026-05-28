import { Blog } from "./Blog.ts";
// import { initTreeSitter } from "./tree_sitter.ts";

function parseArgs(
  argv: string[],
): {
  command: string;
  args: string[];
  options: Record<string, string | boolean>;
} {
  const validCommands = ["draft", "build", "watch", "serve", "spell"] as const;
  const command = argv[0];
  if (
    !command ||
    !validCommands.includes(command as typeof validCommands[number])
  ) {
    console.log(`Unknown command, use one of ${validCommands}`);
    Deno.exit(1);
  }

  const options: Record<string, string | boolean> = {};
  const args: string[] = [];

  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const [key, value] = arg.slice(2).split("=");
      if (value !== undefined) {
        options[key] = value === "true" || value === "1"
          ? true
          : value === "false" || value === "0"
          ? false
          : value;
      } else if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        options[key] = argv[++i];
      } else {
        options[key] = true;
      }
    } else if (arg.startsWith("-")) {
      const key = arg.slice(1);
      if (argv[i + 1] && !argv[i + 1].startsWith("--")) {
        options[key] = argv[++i];
      } else {
        options[key] = true;
      }
    } else {
      args.push(arg);
    }
  }

  return { command, args, options };
}

async function main() {
  const { command, args, options } = parseArgs(Deno.args);

  switch (command) {
    case "draft": {
      const title = args[0];
      if (!title) {
        console.error("Error: Missing required argument: title");
        Deno.exit(1);
      }
      await Blog.draft(title, options.published === true);
      return;
    }

    case "build": {
      // await initTreeSitter();
      const clean = options.clean !== false;
      const blogroll = options.blogroll === true;
      await Blog.build(clean, blogroll);
      return;
    }

    case "watch": {
      // await initTreeSitter();
      const clean = options.clean !== false;
      await Blog.watch(clean);
      return;
    }

    case "serve": {
      // await initTreeSitter();
      const port = parseInt(options.port as string ?? "8080");
      await Blog.serve(port);
      return;
    }
  }
}

if (import.meta.main) await main();
