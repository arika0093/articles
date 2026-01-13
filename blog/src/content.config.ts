import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";
import { SITE } from "@/config";

export const BLOG_PATH = "src/data/blog";

const blog = defineCollection({
  loader: glob({ pattern: "**/[^_]*.md", base: `./${BLOG_PATH}` }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string().default(""),
      published: z.boolean().default(false),
      pubDatetime: z.date(),
      modDatetime: z.date().optional().nullable(),
      author: z.string().default(SITE.author),
      featured: z.boolean().optional(),
      draft: z.boolean().optional(),
      tags: z.array(z.string()).default([]),
      ogImage: image().or(z.string()).optional(),
      canonicalURL: z.string().optional(),
      hideEditPost: z.boolean().optional(),
      timezone: z.string().optional(),
      zenn: z.object({
        published: z.boolean().default(false),
        emoji: z.string().default('📝'),
        type: z.enum(['tech', 'idea']).default('tech'),
        topics: z.array(z.string()).default([]),
      }).optional(),
    }),
});

export const collections = { blog };
