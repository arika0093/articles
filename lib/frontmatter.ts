/**
 * Shared utility for parsing frontmatter from markdown files
 */

import type { ArticleFrontmatter, ZennMetadata } from './types.js';

export function parseFrontmatter(content: string): { frontmatter: ArticleFrontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {} as ArticleFrontmatter, body: content };
  }

  const frontmatterText = match[1];
  const body = match[2];
  
  const frontmatter: any = {};
  const lines = frontmatterText.split('\n');
  let inZennSection = false;
  let zennData: any = {};
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    if (trimmedLine === 'zenn:') {
      inZennSection = true;
      continue;
    }
    
    if (inZennSection && trimmedLine && !trimmedLine.startsWith(' ') && !trimmedLine.startsWith('-')) {
      inZennSection = false;
    }
    
    if (inZennSection) {
      const zennMatch = trimmedLine.match(/^(\w+):\s*(.+)$/);
      if (zennMatch) {
        const [, key, value] = zennMatch;
        if (key === 'topics') {
          const topicsMatch = value.match(/\[(.*)\]/);
          if (topicsMatch) {
            zennData[key] = topicsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
          }
        } else if (key === 'published') {
          zennData[key] = value === 'true';
        } else {
          zennData[key] = value.replace(/['"]/g, '');
        }
      }
    } else {
      const keyValueMatch = line.match(/^(\w+):\s*(.+)$/);
      if (keyValueMatch) {
        const [, key, value] = keyValueMatch;
        
        if (key === 'topics' || key === 'tags') {
          const topicsMatch = value.match(/\[(.*)\]/);
          if (topicsMatch) {
            frontmatter[key] = topicsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
          }
        } else if (key === 'published' || key === 'draft') {
          frontmatter[key] = value === 'true';
        } else if (key === 'pubDatetime' || key === 'modDatetime') {
          frontmatter[key] = value.replace(/['"]/g, '');
        } else {
          frontmatter[key] = value.replace(/['"]/g, '');
        }
      }
    }
  }
  
  if (Object.keys(zennData).length > 0) {
    frontmatter.zenn = zennData;
  }
  
  return { frontmatter, body };
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
