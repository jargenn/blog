// Based on https://github.com/matklad/matklad.github.io/blob/caf0614156a379abffc4491b46aae8a872ac939f/src/djot.tsdjot
// import { highlight } from "./tree_sitter.ts";

import { HtmlString } from "./HtmlString.ts";
import { time_html } from "./templates.tsx";
import katex from "npm:katex";

import { HTMLRenderer, renderHTML } from "@djot/html.ts";
import { parse as djot_parse } from "@djot/parse.ts";
import {
  AstNode,
  BlockQuote,
  Div,
  Doc,
  Footnote,
  FootnoteReference,
  HasAttributes,
  Heading,
  Link,
  OrderedList,
  Section,
  Span,
  Str,
  Url,
  Visitor,
} from "@djot/ast.ts";
import { Stage } from "./Post.ts";

export function parse(source: string): Doc {
  return djot_parse(source);
}

export type RenderData = {
  date?: Date;
  summary?: string;
  title?: string;
  faviconMap?: Map<string, Map<string, string>>;
  sidenotes?: string[];
  reading_time_html?: string;
  stage?: Stage;
};

export function render(
  doc: Doc,
  render_data: RenderData,
): HtmlString {
  let section: Section | undefined = undefined;
  let documentSideNotes: Record<string, Footnote> = {};
  let section_count: number = 0;

  const overrides: Visitor<HTMLRenderer, string> = {
    section: (node: Section, r: HTMLRenderer): string => {
      if (render_data.stage === "draft" && section_count === 3) {
        return "";
      }

      const section_prev = section;
      section = node;
      const result = get_child(node, "heading")?.level == 1
        ? r.renderChildren(node)
        : r.renderAstNodeDefault(node);
      section = section_prev;

      section_count++;
      return result;
    },
    heading: (node: Heading, r: HTMLRenderer) => {
      if (node.level === 1) render_data.title = get_string_content(node);

      if (node.level === 1) {
        const children = r.renderChildren(node);

        const date_html = render_data.date
          ? time_html(render_data.date, "meta")
          : "";

        const reading_time_html = render_data.reading_time_html
          ? `<span class="word-count">
           ${render_data.reading_time_html} 
         </span>`
          : "";

        if (reading_time_html && date_html) {
          return `<header>
      <h1${r.renderAttributes(node)}>${children}</h1>
      <div class="meta-row">${date_html} · ${reading_time_html}</div>
    </header>`;
        }

        return `<header>
      <h1${r.renderAttributes(node)}>${children}</h1>
    </header>`;
      }

      const tag = `h${node.level}`;
      const id = node.level > 1 && section?.autoAttributes?.id;
      const children = r.renderChildren(node);
      const children_anchored = id
        ? `<a href="#${id}">${children}</a>`
        : children;

      return `\n<${tag}${
        r.renderAttributes(node)
      }>${children_anchored}</${tag}>\n`;
    },
    ordered_list: (node: OrderedList, r: HTMLRenderer): string => {
      if (node.style === "1)") add_class(node, "callout");
      return r.renderAstNodeDefault(node);
    },
    inline_math(node) {
      return katex.renderToString(node.text, {
        displayMode: false,
        output: "mathml",
      });
    },

    display_math(node) {
      return katex.renderToString(node.text, {
        displayMode: true,
        output: "mathml",
      });
    },
    para: (node, r) => {
      const isImageOnly = node.children.length === 1 &&
        node.children[0].tag === "image";

      if (!isImageOnly) {
        const result = r.renderAstNodeDefault(node);
        if (!render_data.summary) {
          render_data.summary = get_string_content(node);
        }
        return result;
      }

      const cap = extract_cap(node);

      if (!cap) {
        return r.renderAstNodeDefault(node);
      }

      return `
<figure class="with-caption"${r.renderAttributes(node)}>
  ${r.renderChildren(node)}
  <figcaption><cite>${cap}</cite></figcaption>
</figure>`;
    },
    block_quote: (node: BlockQuote, r: HTMLRenderer) => {
      let source = undefined;
      if (node.children.length > 0) {
        const last_child: { tag: string; children?: AstNode[] } =
          node.children[node.children.length - 1];
        if (
          last_child.tag != "thematic_break" &&
          last_child?.children?.length == 1 &&
          last_child?.children[0].tag == "link"
        ) {
          source = last_child.children[0];
          node.children.pop();
        }
      }
      const cite = source
        ? `<figcaption><cite>${r.renderAstNode(source)}</cite></figcaption>`
        : "";

      return `<figure class="blockquote"><blockquote>${
        r.renderChildren(node)
      }</blockquote>${cite}</figure>
`;
    },
    div: (node: Div, r: HTMLRenderer): string => {
      if (has_class(node, "links")) {
        const favicons = render_data.faviconMap?.get(
          node.attributes?._linksKey ?? "",
        );

        if (favicons) {
          const originalLink = r.options.overrides?.link;
          r.options.overrides = {
            ...r.options.overrides,
            link(n: Link, renderer: HTMLRenderer) {
              const favicon = favicons.get(n.destination ?? "");
              const img = favicon
                ? `<img class="link-favicon" src="${favicon}" width="14" height="14" loading="lazy" alt=""/>`
                : "";
              const label = renderer.renderChildren(n);
              return `${img}<a class="link-label" href="${n.destination}">${label}</a>`;
            },
          };

          const html = `<div${r.renderAttributes(node)}>${
            r.renderChildren(node)
          }</div>`;

          r.options.overrides = { ...r.options.overrides, link: originalLink };

          return html;
        }
      }

      return r.renderAstNodeDefault(node);
    },
    image: (node): string => {
      if (has_class(node, "video")) {
        if (!node.destination) throw "missing destination";

        return has_class(node, "loop")
          ? `<video src="${node.destination}" autoplay muted loop></video>`
          : `<video src="${node.destination}" controls muted></video>`;
      }

      if (!node.destination) throw "missing image src";

      const attrs = {
        "data-kind": "media",
        loading: "lazy",
        ...node.attributes,
      };

      const title = node.children[0]?.text ?? "";
      const src = node.destination;

      const darkSrc = src.replace(
        /\.([^.?#]+)(\?.*)?$/,
        "-dark.$1$2",
      );

      const type = mimeType(src);

      const attrsStr = Object.entries(attrs)
        .map(([k, v]) => ` ${k}="${v}"`)
        .join("");

      return `
<picture>
  <source
    ${type ? `type="${type}"` : ""}
    srcset="${darkSrc}"
    media="(prefers-color-scheme: dark)"
    >
  <source
    ${type ? `type="${type}"` : ""}
    srcset="${src}"
    media="(prefers-color-scheme: light), (prefers-color-scheme: no-preference)"
    >

  <img
    alt="${title}"
    title="${title}"
    src="${src}"
    ${attrsStr}>
</picture>`;
    },
    code_block: (node, r: HTMLRenderer) => {
      const aria_label = node.lang ? `${node.lang} code block` : "text block";

      return `<figure class="code-block" role="region" aria-label="${aria_label}">
        ${
        node.lang
          ? `<span class="language-tag" title="${node.lang}">${node.lang}</span>`
          : ""
      }
        ${r.renderAstNodeDefault(node)}</figure>`;
    },
    span: (node: Span, r: HTMLRenderer) => {
      if (has_class(node, "code")) {
        const children = r.renderChildren(node);
        return `<code>${children}</code>`;
      }
      if (has_class(node, "dfn")) {
        const children = r.renderChildren(node);
        return `<dfn>${children}</dfn>`;
      }
      if (has_class(node, "kbd")) {
        const children = get_string_content(node)
          .split("+")
          .map((it) => `<kbd>${it}</kbd>`)
          .join("+");
        return `<kbd>${children}</kbd>`;
      }

      return r.renderAstNodeDefault(node);
    },
    str: (node: Str, r: HTMLRenderer) => {
      if (has_class(node, "dfn")) {
        return `<dfn>${node.text}</dfn>`;
      }
      return r.renderAstNodeDefault(node);
    },
    url: (node: Url, r: HTMLRenderer) => {
      add_class(node, "url");
      return r.renderAstNodeDefault(node);
    },

    doc: (node: Doc, r: HTMLRenderer) => {
      documentSideNotes = node.footnotes;
      return r.renderAstNodeDefault(node);
    },

    footnote_reference: (node: FootnoteReference, r: HTMLRenderer) => {
      let result = "";
      const label = node.text;

      if (documentSideNotes[label]) {
        // I track the footnote but don't increment the next index so the endnotes are not rendered when `doc` is rendered.
        let index = r.footnoteIndex[label];

        if (!index) {
          index = Object.keys(r.footnoteIndex).length + 1;
          r.footnoteIndex[label] = index;
        }

        const refId = `sn-${index}`;
        result +=
          `<label for="${refId}" class="margin-toggle sidenote-number"></label>`;
        result +=
          `<input type="checkbox" id="${refId}" class="margin-toggle"/>`;

        let sidenote_str = `<span class="sidenote-content">`;
        const footnoteNode = documentSideNotes[label];

        let sidenote_content = "";
        if (footnoteNode.children) {
          for (const child of footnoteNode.children) {
            let childContent = r.renderAstNode(child);
            childContent = childContent.replace(/<\/?p>/g, "");
            sidenote_content += childContent;
          }
        }
        sidenote_str += `${sidenote_content}</span>`;

        render_data.sidenotes?.push(sidenote_content);

        result += sidenote_str;
      }

      return result;
    },
    // Since I am replacing this for sidenotes
    footnote: (_node: Footnote, _r: HTMLRenderer) => {
      return "";
    },
  };

  return new HtmlString(renderHTML(doc, { overrides }));
}

type AstTag = AstNode["tag"];

function get_child<Tag extends AstTag>(
  node: AstNode,
  tag: Tag,
): Extract<AstNode, { tag: Tag }> | undefined {
  for (const child of (node as { children?: AstNode[] })?.children ?? []) {
    if (child.tag == tag) return child as Extract<AstNode, { tag: Tag }>;
  }
  return undefined;
}

function has_class(node: AstNode, cls: string): boolean {
  const classes = attr(node, "class") ?? "";
  return classes.split(" ").includes(cls);
}

function add_class(node: AstNode, cls: string) {
  const classes = attr(node, "class");
  setattr(node, "class", classes ? `${classes} ${cls}` : cls);
}

function extract_cap(node: AstNode): string | undefined {
  const cap = attr(node, "cap");
  if (cap) {
    delete node.attributes!.cap;
    return cap;
  }
}

function attr(node: HasAttributes, name: string): string | undefined {
  return node.attributes ? node.attributes[name] : undefined;
}

function setattr(node: HasAttributes, name: string, value: string) {
  node.attributes = node.attributes || {};
  node.attributes[name] = value;
}

const get_string_content = function (node: AstNode): string {
  const buffer: string[] = [];
  add_string_content(node, buffer);
  return buffer.join("");
};

const add_string_content = function (
  node: AstNode,
  buffer: string[],
): void {
  if ("text" in node) {
    buffer.push(node.text);
  } else if (
    "tag" in node &&
    (node.tag === "soft_break" || node.tag === "hard_break")
  ) {
    buffer.push("\n");
  } else if ("children" in node) {
    for (const child of node.children) {
      add_string_content(child, buffer);
    }
  }
};

function findLinks(node: AstNode): string[] {
  const urls: string[] = [];
  if (node.tag === "link" && node.destination) {
    urls.push(node.destination);
  }
  const children = (node as { children?: AstNode[] }).children;
  if (children) {
    for (const child of children) {
      urls.push(...findLinks(child));
    }
  }
  return urls;
}

function findLinksDivs(node: AstNode): Array<{ key: string; urls: string[] }> {
  const results: Array<{ key: string; urls: string[] }> = [];
  let counter = 0;

  function walk(n: AstNode) {
    if (n.tag === "div" && has_class(n, "links")) {
      const key = `links-${counter++}`;
      const urls = findLinks(n);
      (n.attributes ??= {})._linksKey = key;
      results.push({ key, urls });
    }
    const children = (n as { children?: AstNode[] }).children;
    if (children) {
      for (const child of children) walk(child);
    }
  }

  walk(node);
  return results;
}

export function buildFaviconMap(doc: Doc): Map<string, Map<string, string>> {
  const containers = findLinksDivs(doc);

  if (containers.length === 0) return new Map();

  const allUrls = [...new Set(containers.flatMap((c) => c.urls))];

  console.log(`\x1b[33m[Resolving favicons]\x1b[0m`);

  const entries = allUrls.map((url) => [url, getFavicon(url)] as const);
  const urlToFavicon = new Map(entries);

  const result = new Map<string, Map<string, string>>();
  for (const { key, urls } of containers) {
    const nodeMap = new Map(urls.map((u) => [u, urlToFavicon.get(u)!]));
    result.set(key, nodeMap);
  }

  console.log(
    `\x1b[90mResolved ${urlToFavicon.size} favicons for ${containers.length} links divs\x1b[0m`,
  );

  return result;
}

function getFavicon(url: string): string {
  const { hostname } = new URL(url);
  return `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;
}

function mimeType(src: string): string | undefined {
  const ext = src.split("?")[0].match(/\.([^.]+)$/)?.[1]?.toLowerCase();

  switch (ext) {
    case "avif":
      return "image/avif";
    case "webp":
      return "image/webp";
    case "png":
      return "image/png";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "jxl":
      return "image/jxl";
    case "svg":
      return "image/svg+xml";
    case "gif":
      return "image/gif";
    default:
      return undefined;
  }
}
