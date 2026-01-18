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
  let currentKey: string | null = null;
  let currentObject: any = null;

  for (const line of lines) {
    // 空行をスキップ
    if (!line.trim()) {
      continue;
    }

    // インデントレベルを計算
    const indent = line.match(/^(\s*)/)?.[1].length || 0;
    const trimmedLine = line.trim();

    // コメント行をスキップ
    if (trimmedLine.startsWith('#')) {
      continue;
    }

    // トップレベルのキー（インデントなし）
    if (indent === 0 && trimmedLine.includes(':')) {
      const colonIndex = trimmedLine.indexOf(':');
      const key = trimmedLine.substring(0, colonIndex).trim();
      const value = trimmedLine.substring(colonIndex + 1).trim();

      // ネストされたオブジェクトの開始
      if (!value || value.startsWith('#')) {
        currentKey = key;
        currentObject = {};
        frontmatter[key] = currentObject;
      } else {
        // 通常のキー・バリュー
        frontmatter[key] = parseValue(value);
        currentKey = null;
        currentObject = null;
      }
    }
    // インデントされたキー（ネストされたオブジェクト）
    else if (indent > 0 && trimmedLine.includes(':') && currentObject !== null) {
      const colonIndex = trimmedLine.indexOf(':');
      const key = trimmedLine.substring(0, colonIndex).trim();
      const value = trimmedLine.substring(colonIndex + 1).trim();

      currentObject[key] = parseValue(value);
    }
  }

  return { frontmatter, body };
}

function parseValue(value: string): any {
  // 配列の解析: ["item1", "item2"] または [item1, item2]
  const arrayMatch = value.match(/^\[(.*)\]$/);
  if (arrayMatch) {
    const items = arrayMatch[1];
    if (!items.trim()) {
      return [];
    }
    return items.split(',').map(item => {
      const trimmed = item.trim();
      // 引用符を削除
      return trimmed.replace(/^["']|["']$/g, '');
    });
  }

  // ブール値
  if (value === 'true') return true;
  if (value === 'false') return false;

  // null
  if (value === 'null') return null;

  // 数値
  if (/^\d+$/.test(value)) {
    return parseInt(value, 10);
  }

  // 文字列（引用符を削除）
  return value.replace(/^["']|["']$/g, '');
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
