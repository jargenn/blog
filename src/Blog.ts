import * as debounce from "@std/async/debounce";
import { Archetype } from "./Post.ts";
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
import { HtmlString } from "./HtmlString.ts";
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
      parts.push(`${label}=${value.toFixed(2)}ms`);
    }

    console.log(`\n[stats] ${parts.join(" ")}`);
  }
}

export const Blog = {
  async draft(title: string): Promise<void> {
    const title_case = to_title_case(title);
    const slug = to_lower_snake_case(title_case);
    const path = `./contents/posts/${slug}.dj`;

    const arch = JSON.stringify({
      title: title_case,
      stage: "draft",
      tags: [""],
      date: new Date().toISOString().slice(0, 10),
      abstract: "placeholder",
    });

    console.log(`drafted post ${path}`);
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
    console.log(`\n[Building output]`);

    for (const post of posts) {
      await write_file(
        `dist/${post.path}`,
        html_ugly(PostPage({ post }, css_bundle, js_bundle)),
      );
    }

    const visible_posts = posts.filter((p) =>
      p.stage === "draft" || p.stage == "finished"
    );

    const map = new Map<string, Post[]>();
    for (const post of visible_posts) {
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

    await write_file("./dist/feed.xml", feed_xml(visible_posts));
    const about_html = await page_html("about");
    await write_file(
      "dist/index.html",
      html_ugly(Page("", about_html, css_bundle, js_bundle)),
    );

    await write_file(
      "dist/writing.html",
      html_ugly(
        PostList(
          { posts: visible_posts, title: "", latest: true },
          css_bundle,
          js_bundle,
        ),
      ),
    );

    const pages = [
      "about",
      "links",
      "404",
      "ai_transparency",
      "style_guidelines",
    ];
    for (const page of pages) {
      const content = page === "about" ? about_html : await page_html(page);

      await write_file(
        `dist/${page}.html`,
        html_ugly(Page(page, content, css_bundle, js_bundle)),
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
        console.log(`Rebuild #${build_id}`);
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

async function page_html(page: string): Promise<HtmlString> {
  const text = await Deno.readTextFile(`contents/${page}.dj`);
  return djot.render(djot.parse(text), {});
}

async function collect_posts(ctx: Ctx): Promise<Post[]> {
  const start = performance.now();
  const posts: Post[] = [];

  console.log("[Collecting posts]");

  for await (const path of walk_dir("./contents/posts/")) {
    if (!path.endsWith(".dj")) continue;

    let t = performance.now();
    const raw = await Deno.readFile(path);
    const text = new TextDecoder().decode(raw);
    const { arch, body } = Archetype.parse(text);

    ctx.read_ms += performance.now() - t;

    t = performance.now();
    const ast = djot.parse(body);
    ctx.parse_ms += performance.now() - t;

    const reading_time_html = reading_time_str(
      ast,
    );

    const toc = build_toc(ast);
    const toc_html = toc_to_html(toc);

    const tags_html = arch.tags
      .map((tag) => {
        const slug = tag.toLowerCase().trim().replace(/\s+/g, "-");
        return `<a class="tag" href="/t/${slug}.html">${tag}</a>`;
      })
      .join("");

    t = performance.now();
    const render_ctx: djot.RenderData = {
      date: arch.date,
      summary: undefined,
      title: undefined,
      sidenotes: [],
      reading_time_html,
      tags_html,
      stage: arch.stage,
    };

    render_ctx.faviconMap = djot.buildFaviconMap(ast);

    const html = djot.render(ast, render_ctx);

    const content = toc_html !== ""
      ? new HtmlString(html.value.replace(/<section/, `${toc_html}<section`))
      : html;

    const render_ms = performance.now() - t;
    ctx.render_ms += render_ms;

    const ms = render_ms.toFixed(2);

    console.log(`  ${path} (${ms} ms)`);

    const { year, month, day } = dateParts(arch.date);
    const iso_date = new Date(Date.UTC(year, month - 1, day));
    const date_str = `${day}-${month}-${year}`;

    const slug = to_lower_snake_case(arch.title);
    const src = `/contents/posts/${slug}.dj`;

    posts.push({
      year,
      month,
      day,
      reading_time: reading_time_html,
      slug,
      date_str,
      iso_date,
      title: arch.title,
      stage: arch.stage,
      tags: arch.tags,
      abstract: arch.abstract,
      content,
      path: `/posts/${slug}.html`,
      src,
    });
  }
  posts.sort((l, r) => l.path < r.path ? 1 : -1);
  ctx.collect_ms = performance.now() - start;
  return posts;
}

function asset(path: string, asset_map: Map<string, string>): string {
  return "/" + (asset_map.get(path) ?? path);
}

function dateParts(date: Date) {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}
