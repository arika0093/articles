/**
 * Shared types for article frontmatter and Zenn publishing
 * Based on blog/src/content.config.ts
 */

export interface ZennMetadata {
  published: boolean;
  emoji: string;
  type: 'tech' | 'idea';
  topics: string[];
}

export interface ArticleFrontmatter {
  title: string;
  description?: string;
  published?: boolean;
  pubDatetime?: Date | string;
  modDatetime?: Date | string | null;
  author?: string;
  pin?: boolean;
  tags?: string[];
  ogImage?: string;
  canonicalURL?: string;
  timezone?: string;
  // Legacy fields
  emoji?: string;
  type?: 'tech' | 'idea';
  topics?: string[];
  // Zenn-specific metadata
  zenn?: ZennMetadata;
}

export interface ArticleImageInfo {
  currentPath: string;
  afterPath: string;
  imageName: string;
  dateStr: string;
  isLarge: boolean;
}

export interface ArticleInfo {
  currentPath: string;
  afterPath: string;
  dateStr: string;
  containedImages: ArticleImageInfo[];
}
