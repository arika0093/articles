import * as fs from 'fs';
import * as path from 'path';

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
    
    // Parse frontmatter
    const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) {
      console.log(`  Skipping (no frontmatter)`);
      continue;
    }
    
    const frontmatterText = match[1];
    const body = match[2];
    
    // Check if there's a zenn.topics field
    const topicsMatch = frontmatterText.match(/^\s+topics:\s*\[(.*?)\]/m);
    
    if (!topicsMatch) {
      console.log(`  Skipping (no zenn.topics)`);
      continue;
    }
    
    // Extract topics
    const topicsStr = topicsMatch[1];
    const topics = topicsStr.split(',').map(t => t.trim().replace(/['"]/g, '')).filter(t => t);
    
    // Check if tags already exists
    const hasTagsField = /^tags:/m.test(frontmatterText);
    
    if (hasTagsField) {
      console.log(`  Skipping (already has tags field)`);
      continue;
    }
    
    // Add tags field after published field
    let newFrontmatter = frontmatterText;
    
    // Find the position after published field
    const publishedMatch = newFrontmatter.match(/^published:\s*(true|false)/m);
    if (publishedMatch) {
      const publishedLine = publishedMatch[0];
      const tagsLine = `\ntags: [${topics.map(t => `"${t}"`).join(', ')}]`;
      newFrontmatter = newFrontmatter.replace(publishedLine, publishedLine + tagsLine);
    } else {
      // If no published field, add after title
      const titleMatch = newFrontmatter.match(/^title:/m);
      if (titleMatch) {
        const titleLineEnd = newFrontmatter.indexOf('\n', newFrontmatter.indexOf('title:'));
        const tagsLine = `tags: [${topics.map(t => `"${t}"`).join(', ')}]\n`;
        newFrontmatter = newFrontmatter.slice(0, titleLineEnd + 1) + tagsLine + newFrontmatter.slice(titleLineEnd + 1);
      }
    }
    
    const newContent = `---\n${newFrontmatter}\n---\n${body}`;
    
    fs.writeFileSync(file, newContent, 'utf-8');
    console.log(`  Updated! Added tags: [${topics.join(', ')}]`);
  }
  
  console.log('Done!');
}

main().catch(console.error);
