import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string().optional(),
    published: z.boolean().default(false),
    zenn: z.object({
      published: z.boolean().default(false),
      emoji: z.string().default('📝'),
      type: z.enum(['tech', 'idea']).default('tech'),
      topics: z.array(z.string()).default([]),
    }).optional(),
  }),
});

export const collections = { blog };
