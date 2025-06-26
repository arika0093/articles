# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a dual-platform blog repository that publishes technical articles to both Zenn.dev and Dev.to platforms.

## Repository Structure

- `articles/` - Zenn.dev articles in Japanese with YAML frontmatter
- `posts/` - Dev.to articles (may be duplicates of Zenn articles)
- `books/` - Zenn book content (currently empty)
- `images/` - Image assets organized by date folders

## Common Commands

### Article Management
- `npm run article` - Create a new Zenn article
- `npm run book` - Create a new Zenn book
- `npm run preview` - Preview Zenn content locally http://localhost:8000

### Publishing Platforms
- **Zenn.dev**: Uses `zenn-cli` for article management and preview (https://zenn.dev/arika)
- **Dev.to**: Uses `@sinedied/devto-cli` for publishing (https://dev.to/arika0093)

## Article Format

### Zenn Articles (`articles/`)
- Filename format: `YYYYMMDD-topic-name.md`
- Required YAML frontmatter:
  ```yaml
  ---
  title: "Article title in Japanese"
  emoji: "🔥" # Randomly choose one emoji that best matches the article content
  type: "tech"
  # Choose topics that are relevant to the article content
  # can use small letters only
  topics: ["dotnet", "csharp", "blazor"] 
  # Whether the article is published. When generating automatically, set this to false initially.
  published: false
  published_at: "YYYY-MM-DD HH:MM"
  ---
  ```

### Dev.to Posts (`posts/`)
- Similar naming convention to Zenn articles
- May contain duplicate content adapted for Dev.to format
- Required YAML frontmatter:
  ```yaml
  ---
  title: "Article title in English"
  description: "Brief description of the article"
  # comma-separated list of tags
  tags: 'dotnet,csharp,blazor,timezone'
  cover_image: ''
  canonical_url: null
  # Whether the article is published. When generating automatically, set this to false initially.
  published: false
  id: 2618676 # id is random-value, so execute `npx @sinedied/devto-cli publish` to get a new id
  ---
  ```

## Content Guidelines

- First, create a draft article in Japanese under the `articles` directory.
  - Use internet searches to verify the accuracy of the information you write.
  - Always reference at least three sources (from different domains) and list all links at the end of the article under a "References" section.
  - Include code samples whenever possible, and write in full sentences rather than using bullet points.
- After the above is finished, create the Dev.to article by translating the Japanese draft into English.
  - When translating, rephrase or omit Japan-specific content as appropriate.