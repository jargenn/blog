import * as path_utils from "jsr:@std/path";

export function dirname(path: string): string {
  return path.substring(0, path.lastIndexOf("/"));
}

export async function write_file(
  path: string,
  content: Uint8Array | string,
): Promise<void> {
  const start = performance.now();

  if (!content) return;
  await Deno.mkdir(dirname(path), { recursive: true });
  await Deno.mkdir("./dist/tmp", { recursive: true });
  const temp = await Deno.makeTempFile({ dir: "./dist/tmp" });
  if (content instanceof Uint8Array) {
    await Deno.writeFile(temp, content);
  } else {
    await Deno.writeTextFile(temp, content);
  }
  await Deno.rename(temp, path);

  const time = Temporal.Now.plainTimeISO()
    .toLocaleString("en-gb", { hour12: false });
  const ms = (performance.now() - start).toFixed(2);

  console.log(
    `\x1b[90m${time} \x1b[34m├─ \x1b[90m${path} (${ms} ms)`,
  );
}

export async function copy_path(
  path: string,
  asset_map: Map<string, string>,
): Promise<void> {
  if (path.endsWith("*")) {
    const dir = path.replace("*", "");
    const futs = [];

    for await (const entry of Deno.readDir(`contents/${dir}`)) {
      if (entry.isFile) {
        futs.push(copy_path(`${dir}/${entry.name}`, asset_map));
      }
    }
    await Promise.all(futs);
  } else {
    const source = await Deno.readFile(`contents/${path}`);

    const hash_buffer = await crypto.subtle.digest("SHA-256", source);

    const hash = Array.from(new Uint8Array(hash_buffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("").slice(0, 8);

    const ext = path_utils.extname(path);
    let bundle_path = `dist/${path}`;

    if (ext === ".js" || ext === ".css") {
      const basename = path_utils.basename(path, ext);
      const prev_basename = path_utils.basename(path);

      const dir = path_utils.dirname(path);

      bundle_path = `dist/${dir}/${basename}-${hash}${ext}`;

      asset_map.set(prev_basename, bundle_path.replace("dist/", ""));
    }

    await write_file(
      bundle_path,
      source,
    );
  }
}

export async function* walk_dir(
  dir: string,
): AsyncIterableIterator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const path = `${dir}${entry.name}`;
    if (entry.isDirectory) {
      yield* walk_dir(path);
    } else {
      yield path;
    }
  }
}
