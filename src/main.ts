import { Blog } from "./Blog.ts";

async function main() {
  const [command, ...rest] = Deno.args;

  switch (command) {
    case "draft": {
      const title = rest[0];
      if (!title) {
        console.error("Error: Missing required argument: title");
        Deno.exit(1);
      }
      await Blog.draft(title);
      break;
    }

    case "build":
      await Blog.build(
        !rest.includes("--no-clean"),
        rest.includes("--blogroll"),
      );
      break;

    case "watch":
      await Blog.watch(!rest.includes("--no-clean"));
      break;

    case "serve": {
      const portFlag = rest.find((a) => a.startsWith("--port="));
      const port = portFlag ? Number(portFlag.split("=")[1]) : 8080;
      await Blog.serve(port);
      break;
    }

    default:
      console.error(
        `Unknown command "${
          command ?? ""
        }", use one of: draft, build, watch, serve`,
      );
      Deno.exit(1);
  }
}

if (import.meta.main) await main();
