import * as fs from 'fs';
import * as path from 'path';

interface ArticleFrontmatter {
  title?: string;
  description?: string;
  published?: boolean;
  emoji?: string;
  type?: 'tech' | 'idea';
  topics?: string[];
  zenn?: {
    published?: boolean;
    emoji?: string;
    type?: 'tech' | 'idea';
    topics?: string[];
  };
}

// Parse YAML frontmatter
function parseFrontmatter(content: string): { frontmatter: ArticleFrontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterText = match[1];
  const body = match[2];

  const frontmatter: any = {};
  const lines = frontmatterText.split('\n');

  for (const line of lines) {
    const keyValueMatch = line.match(/^(\w+):\s*(.+)$/);
    if (keyValueMatch) {
      const [, key, value] = keyValueMatch;

      if (key === 'topics') {
        const topicsMatch = value.match(/\[(.*)\]/);
        if (topicsMatch) {
          frontmatter[key] = topicsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, '')).filter(t => t);
        } else {
          frontmatter[key] = [];
        }
      } else if (key === 'published') {
        frontmatter[key] = value === 'true';
      } else {
        frontmatter[key] = value.replace(/^["']|["']$/g, '');
      }
    }
  }

  return { frontmatter, body };
}

// Generate updated frontmatter
function generateFrontmatter(frontmatter: ArticleFrontmatter): string {
  const title = frontmatter.title || '';
  const zennPublished = frontmatter.zenn?.published !== undefined ? frontmatter.zenn.published : frontmatter.published !== undefined ? frontmatter.published : false;
  const emoji = frontmatter.zenn?.emoji || frontmatter.emoji || '📝';
  const type = frontmatter.zenn?.type || frontmatter.type || 'tech';
  const topics = frontmatter.zenn?.topics || frontmatter.topics || [];

  const topicsStr = topics.length > 0 ? `["${topics.join('", "')}"]` : '[]';

  let result = '---\n';
  result += `title: "${title}"\n`;
  result += `published: ${zennPublished}\n`;
  result += `emoji: "${emoji}"\n`;
  result += `type: "${type}"\n`;
  result += `topics: ${topicsStr}\n`;
  result += '---';

  return result;
}

// Find all markdown files
function findMarkdownFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(directory: string) {
    const entries = fs.readdirSync(directory, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

// Main execution
async function main() {
  const articlesDir = path.join(process.cwd(), 'articles');

  if (!fs.existsSync(articlesDir)) {
    console.error('Articles directory not found!');
    return;
  }

  const markdownFiles = findMarkdownFiles(articlesDir);

  console.log(`Found ${markdownFiles.length} markdown files`);

  for (const file of markdownFiles) {
    console.log(`Processing: ${file}`);

    const content = fs.readFileSync(file, 'utf-8');
    const { frontmatter, body } = parseFrontmatter(content);

    // Check if already has the new schema
    if (frontmatter.zenn !== undefined) {
      console.log(`  Skipping (already has zenn section)`);
      continue;
    }

    const newFrontmatter = generateFrontmatter(frontmatter);
    const newContent = `${newFrontmatter}\n\n${body}`;

    fs.writeFileSync(file, newContent, 'utf-8');
    console.log(`  Updated!`);
  }

  console.log('Done!');
}

main().catch(console.error);
