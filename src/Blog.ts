import * as debounce from "@std/async/debounce";
import { Archetype } from "./archetype.ts";
import * as djot from "./djot.ts";
import {
  BlogRoll,
  feed_xml,
  html_ugly,
  Page,
  Post as PostPage,
  PostList,
} from "./templates.tsx";
import { to_lower_snake_case, to_title_case } from "./utils.ts";
import { ServeBlog } from "./http_server.ts";
import { Blogroll } from "./blogroll.ts";
import { copy_path, walk_dir, write_file } from "./Writer.ts";
import type { Post } from "./Post.ts";
import { build_toc, reading_time_str, toc_to_html } from "./Post.ts";

class Ctx {
  constructor(
    public read_ms: number = 0,
    public parse_ms: number = 0,
    public render_ms: number = 0,
    public collect_ms: number = 0,
    public fmt_ms: number = 0,
    public total_ms: number = 0,
  ) {}

  print_stats() {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(this)) {
      if (typeof value !== "number") continue;
      if (!key.endsWith("_ms")) continue;

      const label = key.slice(0, -3);
      parts.push(`${label}=\x1b[36m${value.toFixed(2)}ms\x1b[0m`);
    }

    console.log(
      `\n\x1b[33m[stats]\x1b[0m\n\x1b[90m  ${parts.join(" ")}\x1b[0m`,
    );
  }
}

export const Blog = {
  async draft(title: string, published: boolean): Promise<void> {
    const title_case = to_title_case(title);

    const date = new Date().toISOString().split("T")[0];
    const slug = to_lower_snake_case(title_case);
    const path = `./contents/posts/${date}-${slug}.dj`;

    console.log(`drafted post ${path}`);

    const arch = JSON.stringify({
      title: title_case,
      published: published,
      tags: [""],
      abstract: "placeholder",
    });

    await Deno.writeTextFile(path, `---\n ${arch} \n---\n # ${title_case}\n`);
  },

  async build(
    clean: boolean,
    blogroll: boolean,
  ): Promise<void> {
    const t = performance.now();
    const ctx = new Ctx();

    if (clean) {
      try {
        await Deno.remove("./dist/", { recursive: true });
      } catch (err) {
        if (!(err instanceof Deno.errors.NotFound)) {
          throw err;
        }
      }
    }

    const asset_map = new Map<string, string>();

    const paths = [
      "css/*",
      "assets/*",
    ];

    for (const path of paths) {
      await copy_path(path, asset_map);
    }

    console.log(asset_map);
    const css_bundle = asset("main.css", asset_map);
    const js_bundle = asset("scripts.js", asset_map);

    if (blogroll) {
      const posts = await Blogroll.create();
      await write_file(
        "dist/blogroll.html",
        html_ugly(BlogRoll({ posts }, css_bundle, js_bundle)),
      );
    }
    await Deno.mkdir("./dist/", { recursive: true });

    const posts = await collect_posts(ctx);
    console.log(`\n\x1b[34m[Building output]\x1b[0m`);

    for (const post of posts) {
      await write_file(
        `dist/${post.path}`,
        html_ugly(PostPage({ post }, css_bundle, js_bundle)),
      );
    }

    const published = posts.filter((p) => p.published);

    const map = new Map<string, Post[]>();
    for (const post of published) {
      for (const tag of post.tags) {
        if (!tag) continue;

        if (!map.has(tag)) {
          map.set(tag, []);
        }

        map.get(tag)!.push(post);
      }
    }

    for (const [tag, p] of map) {
      const tag_slug = tag
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-");

      await write_file(
        `dist/t/${tag_slug}.html`,
        html_ugly(PostList({ posts: p, title: tag }, css_bundle, js_bundle)),
      );
    }

    await write_file("./dist/feed.xml", feed_xml(published));
    await write_file(
      "dist/index.html",
      html_ugly(PostList({ posts: published }, css_bundle, js_bundle)),
    );

    const pages = [
      "about",
      "404",
      "ai_transparency",
      "style_guidelines",
    ];
    for (const page of pages) {
      const text = await Deno.readTextFile(`contents/${page}.dj`);
      const ast = djot.parse(text);
      const html = djot.render(ast, {});
      await write_file(
        `dist/${page}.html`,
        html_ugly(Page(page, html, css_bundle, js_bundle)),
      );
    }

    const t_fmt = performance.now();
    await new Deno.Command(Deno.execPath(), {
      args: ["fmt", "./dist"],
    }).output();
    ctx.fmt_ms = performance.now() - t_fmt;

    ctx.total_ms = performance.now() - t;

    ctx.print_stats();
  },

  async watch(clean: boolean): Promise<void> {
    let signal = Promise.withResolvers();
    (async () => {
      let build_id = 0;
      while (await signal.promise) {
        signal = Promise.withResolvers();
        console.log(`\nRebuild \x1b[34m${"#" + build_id.toString()}`);
        build_id += 1;
        await Blog.build(
          clean,
          true,
        );
      }
    })();

    signal.resolve(true);

    const rebuild_debounced = debounce.debounce(
      () => signal.resolve(true),
      16,
    );

    for await (const event of Deno.watchFs("./contents", { recursive: true })) {
      if (event.kind == "access") continue;
      rebuild_debounced();
    }
    signal.resolve(false);
  },

  async serve(port: number): Promise<void> {
    await ServeBlog(port, "localhost");
  },
};

async function collect_posts(ctx: Ctx): Promise<Post[]> {
  const start = performance.now();
  const posts: Post[] = [];

  console.log(`\n\x1b[34m[Collecting posts]`);

  for await (const path of walk_dir("./contents/posts/")) {
    if (!path.endsWith(".dj")) continue;

    const [, y, m, d, slug] = path.match(
      /^.*(\d\d\d\d)-(\d\d)-(\d\d)-(.*)\.dj$/,
    )!;
    const [year, month, day] = [y, m, d].map((it) => parseInt(it, 10));
    const iso_date = new Date(Date.UTC(year, month - 1, day));

    let t = performance.now();
    const raw = await Deno.readFile(path);
    const text = new TextDecoder().decode(raw);
    const { arch, body } = Archetype.parse(text);

    ctx.read_ms += performance.now() - t;

    t = performance.now();
    const ast = djot.parse(body);
    ctx.parse_ms += performance.now() - t;

    t = performance.now();
    const render_ctx: djot.RenderCtx = {
      date: iso_date,
      summary: undefined,
      title: undefined,
      sidenotes: [],
    };

    const toc = build_toc(ast);
    const toc_html = toc_to_html(toc);
    const reading_stime_str = reading_time_str(
      ast,
    );

    render_ctx.faviconMap = djot.buildFaviconMap(ast);
    const html = djot.render(ast, render_ctx, reading_stime_str);

    const render_ms = performance.now() - t;
    ctx.render_ms += render_ms;

    const time = Temporal.Now.plainTimeISO()
      .toLocaleString("en-gb", { hour12: false });

    const ms = render_ms.toFixed(2);

    console.log(
      `\x1b[90m${time} \x1b[34m├─ \x1b[90m${path} (${ms} ms)`,
    );

    const src = `/contents/posts/${y}-${m}-${d}-${slug}.dj`;

    let sidenotes_html = "";

    if (render_ctx.sidenotes) {
      for (const [idx, sidenote] of render_ctx.sidenotes?.entries()) {
        sidenotes_html +=
          `<p class="sidenote-body"><span class="adhoc-number">${
            1 + idx
          }.</span> ${sidenote}<p>`;
      }
    }

    posts.push({
      year,
      month,
      reading_time: reading_stime_str,
      sidenotes_html,
      toc_html,
      day,
      slug,
      iso_date,
      title: arch.title,
      published: arch.published,
      tags: arch.tags,
      abstract: arch.abstract,
      content: html,
      path: `/${y}/${m}/${d}/${slug}.html`,
      src,
    });
  }
  posts.sort((l, r) => l.path < r.path ? 1 : -1);
  ctx.collect_ms = performance.now() - start;
  return posts;
}

function asset(path: string, asset_map: Map<string, string>): string {
  const built_path = "/" + (asset_map.get(path) ?? path);
  console.log(built_path);
  return built_path;
}
