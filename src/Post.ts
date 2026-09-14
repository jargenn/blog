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
  date: Date;
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

    const arch = {
      ...parsed,
      date: new Date(`${parsed.date}T00:00:00Z`),
    };

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
