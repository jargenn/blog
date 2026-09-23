// deno-lint-ignore-file no-explicit-any
import { parseFeed } from "@rss";

export interface FeedEntry {
  author?: string;
  title: string;
  url: string;
  date: Date;
}

export interface BlogrollData {
  entries: FeedEntry[];
  updatedAt: Date;
}

type Cache = {
  createdAt: string;
  entries: FeedEntry[];
};

const BLOGROLL_CACHE_FILE = "contents/blogroll.json";
const TTL = 1000 * 60 * 2880;

export const Blogroll = {
  async create(): Promise<BlogrollData> {
    console.log("[Creating the Blogroll]");

    const cached = await read_cache();

    if (cached) {
      if (Date.now() - new Date(cached.createdAt).getTime() < TTL) {
        console.log("Using cached blogroll");
        return {
          entries: sort_entries(rebuild(cached.entries)),
          updatedAt: new Date(cached.createdAt),
        };
      }

      console.log("Cache is stale, regenerating...");
    }

    const urls = (await Deno.readTextFile("contents/blogroll.txt"))
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const entries = await Promise.all(urls.map(blogroll_feed));
    const all_entries = entries.flat();

    const cache: Cache = {
      createdAt: new Date().toISOString(),
      entries: all_entries,
    };

    if (Deno.env.get("GITHUB_ACTIONS") !== "true") {
      await Deno.writeTextFile(
        BLOGROLL_CACHE_FILE,
        JSON.stringify(cache, null, 2),
      );
    }

    sort_entries(all_entries);

    return { entries: all_entries, updatedAt: new Date(cache.createdAt) };
  },
};

async function read_cache(): Promise<Cache | null> {
  try {
    const text = await Deno.readTextFile(BLOGROLL_CACHE_FILE);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function rebuild(entries: FeedEntry[]): FeedEntry[] {
  return entries.map((e) => ({
    ...e,
    date: new Date(e.date),
  }));
}

function sort_entries(entries: FeedEntry[]): FeedEntry[] {
  return entries.sort((a, b) => b.date.getTime() - a.date.getTime());
}

async function blogroll_feed(
  url: string,
): Promise<FeedEntry[]> {
  const start = performance.now();
  let feed;
  try {
    console.log(`Fetching ${url}...`);
    const response = await fetch(url, {
      headers: {
        "Accept":
          "application/atom+xml, application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      },
    });

    if (!response.ok) {
      console.error(`HTTP ${response.status} ${url}`);
      return [];
    }

    const xml = await response.text();

    if (!xml.includes("<rss") && !xml.includes("<feed")) {
      console.error(`Invalid feed ${url}`);
      console.error(`  Preview: ${xml.slice(0, 120).replace(/\n/g, " ")}`);
      return [];
    }

    feed = await parseFeed(xml);
  } catch (error) {
    console.error({ url, error });
    return [];
  }

  if (!feed.entries || feed.entries.length === 0) return [];

  const dated = feed.entries
    .map((entry) => {
      const date = entry.published ?? entry.updated ?? null;
      return date ? { entry, date: new Date(date) } : null;
    })
    .filter((it) => it !== null)
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, 2);

  return dated.map(({ entry, date }) => {
    const item: FeedEntry = {
      author: entry.author?.name ?? undefined,
      title: entry.title?.value ?? "",
      url: (entry.links.find(
        (it: any) => it.type === "text/html" || it.href?.endsWith(".html"),
      ) ?? entry.links[0])?.href ?? "",
      date,
    };

    const duration = performance.now() - start;

    console.log(`"${item.title}" ${item.url} (${duration.toFixed(0)} ms)`);

    return item;
  });
}
