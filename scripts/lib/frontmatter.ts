/**
 * Shared utility for parsing frontmatter from markdown files
 */

import matter from 'gray-matter';
import type { ArticleFrontmatter, ZennMetadata } from './types.js';

export function parseFrontmatter(content: string): { frontmatter: ArticleFrontmatter; body: string } {
  const parsed = matter(content);
  return {
    frontmatter: parsed.data as ArticleFrontmatter,
    body: parsed.content,
  };
}

export function generateZennFrontmatter(frontmatter: ArticleFrontmatter): string {
  const zenn = frontmatter.zenn || ({} as ZennMetadata);
  const title = frontmatter.title || '';
  const emoji = zenn.emoji || frontmatter.emoji || '📝';
  const type = zenn.type || frontmatter.type || 'tech';
  // Use zenn.topics if available, otherwise fall back to tags field
  const topics = zenn.topics || frontmatter.tags || frontmatter.topics || [];
  const published = zenn.published !== undefined ? zenn.published : (frontmatter.published || false);
  
  const topicsStr = topics.length > 0 ? `["${topics.join('", "')}"]` : '[]';
  
  return `---
title: "${title}"
emoji: "${emoji}"
type: "${type}"
topics: ${topicsStr}
published: ${published}
---`;
}
