import { HtmlString } from "./HtmlString.ts";

export type Post = {
  title: string;
  year: number;
  month: number;
  day: number;
  word_count: number;
  iso_date: Date;
  published: boolean;
  slug: string;
  content: HtmlString;
  tags: Array<string>;
  abstract: string;
  path: string;
  src: string;
};
