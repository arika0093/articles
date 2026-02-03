import { defineConfig } from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import sitemap from "@astrojs/sitemap";
import icon from "astro-icon";
import remarkToc from "remark-toc";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import remarkLinkCard from "remark-link-card-plus";
import rehypeExternalLinks from "rehype-external-links";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { transformerFileName } from "./src/utils/transformers/fileName";
import { rehypeGist } from "./src/utils/rehype/rehypeGist";
import { remarkMessage } from "./src/utils/remark/remarkMessage";
import { SITE } from "./src/config";
import remarkCollapse from "remark-collapse";

// https://astro.build/config
export default defineConfig({
  site: SITE.website,
  base: "/",
  integrations: [
    sitemap({
      filter: page => SITE.showArchives || !page.endsWith("/archives"),
    }),
    icon(),
  ],
  markdown: {
    remarkPlugins: [
      remarkMessage,
      remarkBreaks,
      [remarkCollapse, { test: "Details" }],
      remarkGfm,
      [remarkToc, { heading: "Table of contents" }],
      [remarkLinkCard, { shortenUrl: true, thumbnailPosition: "left" }],
    ],
    rehypePlugins: [
      [
        rehypeExternalLinks,
        {
          target: "_blank",
          rel: ["noopener", "noreferrer"],
        },
      ],
      rehypeGist,
    ],
    shikiConfig: {
      themes: {
        light: "slack-dark",
        dark: "dark-plus",
      },
      defaultColor: false,
      wrap: false,
      transformers: [
        transformerFileName({ style: "v2", hideDot: false }),
        transformerNotationHighlight(),
        transformerNotationWordHighlight(),
        transformerNotationDiff({ matchAlgorithm: "v3" }),
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: {
      exclude: ["@resvg/resvg-js"],
    },
  },
  image: {
    responsiveStyles: true,
    layout: "constrained",
  },
  experimental: {
    preserveScriptOrder: true,
  },
});
