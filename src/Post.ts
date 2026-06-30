import {
  AstNode,
  Doc,
} from "https://raw.githubusercontent.com/jgm/djot.js/@djot/djot@0.3.2/src/ast";
import { HtmlString } from "./HtmlString.ts";

const stages = [
  "private",
  "draft",
  "finished",
] as const;

export type Stage = (typeof stages)[number];

export type Archetype = {
  title: string;
  stage: Stage;
  abstract: string;
  tags: Array<string>;
};

function isObject(
  value: unknown,
): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isStage(value: unknown): value is Stage {
  return (
    typeof value === "string" &&
    stages.includes(value as Stage)
  );
}

function isArchetype(
  value: unknown,
): value is Archetype {
  if (!isObject(value)) return false;

  return (
    typeof value.title === "string" &&
    isStage(value.stage) &&
    typeof value.abstract === "string" &&
    Array.isArray(value.tags) &&
    value.tags.every((t) => typeof t === "string")
  );
}

export const Archetype = {
  parse(text: string): {
    arch: Archetype;
    body: string;
  } {
    const match = text.match(/^---\n([\s\S]*?)\n---\n?/);

    if (!match) {
      throw new Error(
        "The post is missing an archetype!",
      );
    }

    let parsed: unknown;

    try {
      console.log(match[1]);
      parsed = JSON.parse(match[1]);
    } catch {
      throw new Error(
        "Invalid JSON in archetype",
      );
    }

    if (!isArchetype(parsed)) {
      throw new Error(
        "Invalid archetype shape",
      );
    }

    const arch = parsed;

    if (!arch.title.trim()) {
      throw new Error(
        "Title cannot be empty",
      );
    }

    if (!arch.abstract.trim()) {
      throw new Error(
        "Abstract cannot be empty",
      );
    }

    const number_of_words = arch.abstract
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .length;

    if (number_of_words > 100) {
      throw new Error(
        "The abstract for that post is way too long",
      );
    }

    if (arch.tags.length === 0) {
      throw new Error(
        "Tags cannot be empty",
      );
    }

    const body = text.slice(match[0].length);

    return {
      arch,
      body,
    };
  },

  is(value: unknown): value is Archetype {
    return isArchetype(value);
  },

  isStage,
};

export type Post = {
  title: string;
  year: number;
  month: number;
  day: number;
  reading_time: string;
  toc_html: string;
  date_str: string;
  iso_date: Date;
  stage: Stage;
  slug: string;
  content: HtmlString;
  tags: Array<string>;
  abstract: string;
  path: string;
  src: string;
};

type TocEntry = {
  level: number;
  text: string;
  slug: string;
  children: TocEntry[];
};

type Toc = TocEntry[];

export function build_toc(doc: Doc): Toc {
  const root: Toc = [];
  const stack: TocEntry[] = [];

  function visit(node: AstNode, sectionId?: string) {
    if (node.tag === "section") {
      const id = node.autoAttributes?.id;
      for (const child of node.children ?? []) {
        visit(child, id);
      }
      return;
    }

    if (node.tag === "heading" && node.level > 1) {
      const level = node.level as number;
      const text = extract_text(node);
      const slug = sectionId ?? text;

      const entry: TocEntry = { level, text, slug, children: [] };

      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      if (stack.length === 0) root.push(entry);
      else stack[stack.length - 1].children.push(entry);

      stack.push(entry);
      return;
    }

    for (const child of (node as any).children ?? []) {
      visit(child, sectionId);
    }
  }

  visit(doc);
  return root;
}

function extract_text(node: AstNode): string {
  if (node.tag === "str") return node.text;
  if ("children" in node && Array.isArray(node.children)) {
    return node.children.map(extract_text).join("");
  }
  return "";
}

export function toc_to_html(toc: Toc): string {
  if (toc.length === 0) return "";

  function render_entries(entries: TocEntry[]): string {
    return `<ul>\n${entries.map(render_entry).join("\n")}\n</ul>`;
  }

  function render_entry(entry: TocEntry): string {
    const link = `<a class="toc-entry" href="#${entry.slug}">${entry.text}</a>`;
    const nested = entry.children.length > 0
      ? `\n${render_entries(entry.children)}`
      : "";
    return `  <li>${link}${nested}</li>`;
  }

  return `<a href="#home-page-top" class="toc-entry">
              <h2 class="toc-header">
                  Contents
              </h2>
            </a>
            <menu>${render_entries(toc)}</menu>`;
}

export function reading_time_str(doc: Doc): string {
  let words = 0;
  let code_words = 0;
  let image_count = 0;

  function visit(node: AstNode, insideCode = false) {
    if (node.tag === "image") {
      image_count++;
      return;
    }

    const nowInCode = insideCode ||
      node.tag === "code_block";

    if (node.tag === "str") {
      const t = node.text.trim();
      if (t) {
        const count = t.split(/\s+/).length;
        if (insideCode) code_words += count;
        else words += count;
      }
    }

    if ("children" in node && Array.isArray(node.children)) {
      for (const child of node.children) {
        visit(child, nowInCode);
      }
    }
  }

  visit(doc);

  const totalMinutes = Math.round(
    (words / 200) + (code_words / 150) + (image_count * 12 / 60),
  );

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  switch (true) {
    case totalMinutes < 1:
      return "1 min";
    case hours === 0:
      return `${mins} min`;
    case mins === 0:
      return `${hours}h`;
    default:
      return `${hours}h ${mins}min`;
  }
}
