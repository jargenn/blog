// deno-lint-ignore-file no-explicit-any
import { parseFeed } from "@rss";
import { NowHHMMSS } from "./http_server.ts";

export interface FeedEntry {
  author?: string;
  title: string;
  url: string;
  date: Date;
}

type Cache = {
  createdAt: string;
  entries: FeedEntry[];
};

const BLOGROLL_CACHE_FILE = "contents/blogroll.json";
const TTL = 1000 * 60 * 2880;

export const Blogroll = {
  async create(): Promise<FeedEntry[]> {
    console.log(`\n\x1b[33m[Creating the Blogroll]\x1b[0m`);

    const cached = await read_cache();

    if (cached) {
      if (Date.now() - new Date(cached.createdAt).getTime() < TTL) {
        console.log("\x1b[90mUsing cached blogroll\x1b[0m");
        return rebuild(cached.entries);
      }

      console.log("\x1b[90mCache is stale, regenerating...\x1b[0m");
    }

    const urls = (await Deno.readTextFile("contents/blogroll.txt"))
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const entries = await Promise.all(urls.map(blogroll_feed));
    const all_entries = entries.filter((e): e is FeedEntry => e !== null);

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

    all_entries.sort((a, b) => b.date.getTime() - a.date.getTime());

    return all_entries;
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

async function blogroll_feed(
  url: string,
): Promise<FeedEntry | null> {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - 2);

  const start = performance.now();
  let feed;
  try {
    console.log(
      `\x1b[90m${NowHHMMSS()}\x1b[0m ` +
        `\x1b[33m├─\x1b[0m Fetching ${url}...\x1b[0m`,
    );
    const response = await fetch(url, {
      headers: {
        "Accept":
          "application/atom+xml, application/rss+xml, application/xml;q=0.9, */*;q=0.8",
      },
    });

    if (!response.ok) {
      console.error(
        `\x1b[90m${NowHHMMSS()}\x1b[0m ` +
          `\x1b[31m├─ HTTP ${response.status}\x1b[0m ${url}`,
      );
      return null;
    }

    const xml = await response.text();

    if (!xml.includes("<rss") && !xml.includes("<feed")) {
      console.error(
        `\x1b[90m${NowHHMMSS()}\x1b[0m ` +
          `\x1b[31m├─ Invalid feed\x1b[0m ${url}`,
      );
      console.error(
        `\x1b[90m${NowHHMMSS()}\x1b[0m ` +
          `\x1b[90m│  Preview:\x1b[0m ${xml.slice(0, 120).replace(/\n/g, " ")}`,
      );
      return null;
    }

    feed = await parseFeed(xml);
  } catch (error) {
    console.error({ url, error });
    return null;
  }

  if (!feed.entries || feed.entries.length === 0) return null;

  const first_entry = feed.entries[0];
  const date = first_entry.published ??
    first_entry.updated ??
    null;

  if (!date) return null;

  const entry_date = new Date(date);

  if (entry_date < cutoff) {
    return null;
  }

  const entry: FeedEntry = {
    author: first_entry.author?.name ?? undefined,
    title: first_entry.title?.value ?? "",
    url: (first_entry.links.find(
      (it: any) => it.type === "text/html" || it.href?.endsWith(".html"),
    ) ?? first_entry.links[0])?.href ?? "",
    date: entry_date,
  };

  const duration = performance.now() - start;

  console.log(
    `\x1b[90m${NowHHMMSS()}\x1b[0m ` +
      `\x1b[33m├─\x1b[0m "${entry.title}" \x1b[90m (${entry.url}) (${
        duration.toFixed(0)
      } ms)\x1b[0m`,
  );

  return entry;
}
