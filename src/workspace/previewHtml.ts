import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema, type Options } from "rehype-sanitize";
import type { Options as MarkdownOptions } from "react-markdown";
import { sourceLines } from "./markdown";

type PluggableList = NonNullable<MarkdownOptions["rehypePlugins"]>;

/**
 * Raw HTML the preview shows. Starts from GitHub's sanitisation and narrows it:
 * no form, media or styling hooks, so HTML can only produce what Markdown
 * itself could plus a few text-level tags. `a` and `img` still render through
 * the preview's link and local-image components, so the same file and URL
 * rules apply as for Markdown links and images.
 */
const removedTags = new Set(["picture", "source"]);
const textAttributes = [
  "align",
  "alt",
  "title",
  "lang",
  "dir",
  "id",
  "name",
  "abbr",
  "colSpan",
  "rowSpan",
  "scope",
  "headers",
  "width",
  "height",
  "open",
  "start",
  "dateTime",
];
export const previewHtmlSchema: Options = {
  ...defaultSchema,
  tagNames: [
    ...(defaultSchema.tagNames ?? []).filter((tag) => !removedTags.has(tag)),
    "mark",
    "abbr",
    "u",
  ],
  // Inputs exist only as task list checkboxes (forced disabled checkboxes).
  ancestors: { ...defaultSchema.ancestors, input: ["li"] },
  attributes: {
    ...defaultSchema.attributes,
    input: [...(defaultSchema.attributes?.input ?? []), "checked"],
    "*": textAttributes,
  },
  protocols: {
    ...defaultSchema.protocols,
    href: ["http", "https", "mailto"],
  },
  // Removed with their content; other unknown tags are unwrapped to their text.
  strip: [
    "script",
    "style",
    "template",
    "iframe",
    "frame",
    "frameset",
    "object",
    "embed",
    "noscript",
    "noembed",
    "noframes",
    "textarea",
    "title",
    "xmp",
    "select",
    "svg",
    "math",
  ],
};

const markdownOnly: PluggableList = [sourceLines];
const withHtml: PluggableList = [
  rehypeRaw,
  [rehypeSanitize, previewHtmlSchema],
  sourceLines,
];

/** Rehype plugins for a block; HTML parsing only runs when a tag could exist. */
export const previewRehypePlugins = (source: string) =>
  source.includes("<") ? withHtml : markdownOnly;
