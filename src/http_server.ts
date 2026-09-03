import { serveDir } from "@std/http/file-server";

export async function ServeBlog(port: number, hostname: string) {
  await Deno.serve({ port, hostname }, async (req) => {
    const start = performance.now();

    const res = await serveDir(req, {
      fsRoot: "dist",
      urlRoot: "",
      quiet: true,
    });

    const duration = (performance.now() - start).toFixed(2);
    const url = new URL(req.url);

    console.log(`${req.method} ${url.pathname} (${duration} ms)`);

    return res;
  }).finished;
}
