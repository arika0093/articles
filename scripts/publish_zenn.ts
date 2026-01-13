import * as fs from 'fs';
import * as path from 'path';

interface ZennMetadata {
  published: boolean;
  emoji: string;
  type: 'tech' | 'idea';
  topics: string[];
}

interface ArticleFrontmatter {
  title: string;
  description?: string;
  published?: boolean;
  emoji?: string;
  type?: 'tech' | 'idea';
  topics?: string[];
  zenn?: ZennMetadata;
}

interface ArticleImageInfo {
  currentPath: string;
  afterPath: string;
  imageName: string;
  dateStr: string;
  isLarge: boolean;
}

interface ArticleInfo {
  currentPath: string;
  afterPath: string;
  dateStr: string;
  containedImages: ArticleImageInfo[];
}

// Parse frontmatter from markdown content
function parseFrontmatter(content: string): { frontmatter: ArticleFrontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) {
    return { frontmatter: {} as ArticleFrontmatter, body: content };
  }

  const frontmatterText = match[1];
  const body = match[2];
  
  const frontmatter: any = {};
  const lines = frontmatterText.split('\n');
  let currentKey = '';
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
        currentKey = key;
        
        if (key === 'topics') {
          const topicsMatch = value.match(/\[(.*)\]/);
          if (topicsMatch) {
            frontmatter[key] = topicsMatch[1].split(',').map(t => t.trim().replace(/['"]/g, ''));
          }
        } else if (key === 'published') {
          frontmatter[key] = value === 'true';
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

// Generate Zenn frontmatter from unified frontmatter
function generateZennFrontmatter(frontmatter: ArticleFrontmatter): string {
  const zenn = frontmatter.zenn || {};
  const title = frontmatter.title || '';
  const emoji = zenn.emoji || frontmatter.emoji || '📝';
  const type = zenn.type || frontmatter.type || 'tech';
  const topics = zenn.topics || frontmatter.topics || [];
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

// Find all markdown files recursively
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
  
  // Checkout or create publish/zenn branch
  const { execSync } = await import('child_process');
  execSync('git checkout -B publish/zenn main', { stdio: 'inherit' });
  
  // Find all markdown files
  const markdownFiles = findMarkdownFiles(articlesDir);
  
  const articleInfos: ArticleInfo[] = [];
  
  for (const file of markdownFiles) {
    const dir = path.dirname(file);
    const dateStr = path.basename(dir);
    const baseName = path.basename(file).replace(/^#/, '');
    const newFile = path.join('articles', `${dateStr}-${baseName}`);
    
    // Find image files in the same directory
    const imageFiles = fs.readdirSync(dir)
      .filter(f => /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(f))
      .map(f => path.join(dir, f));
    
    const containedImages: ArticleImageInfo[] = [];
    for (const img of imageFiles) {
      const stats = fs.statSync(img);
      const isLarge = stats.size > 3 * 1024 * 1024; // 3MB
      const afterPath = isLarge ? img : path.join('images', dateStr, path.basename(img));
      
      containedImages.push({
        currentPath: img,
        afterPath,
        imageName: path.basename(img),
        dateStr,
        isLarge,
      });
    }
    
    articleInfos.push({
      currentPath: file,
      afterPath: newFile,
      dateStr,
      containedImages,
    });
  }
  
  // Move files
  for (const article of articleInfos) {
    const beforePath = article.currentPath;
    const afterPath = article.afterPath;
    
    fs.mkdirSync(path.dirname(afterPath), { recursive: true });
    
    if (fs.existsSync(beforePath)) {
      // Read and transform the content
      const content = fs.readFileSync(beforePath, 'utf-8');
      const { frontmatter, body } = parseFrontmatter(content);
      
      // Generate Zenn frontmatter
      const zennFrontmatter = generateZennFrontmatter(frontmatter);
      const newContent = `${zennFrontmatter}\n\n${body}`;
      
      fs.writeFileSync(afterPath, newContent, 'utf-8');
    }
    
    // Move images
    for (const imgInfo of article.containedImages) {
      if (!imgInfo.isLarge && imgInfo.currentPath !== imgInfo.afterPath) {
        fs.mkdirSync(path.dirname(imgInfo.afterPath), { recursive: true });
        if (fs.existsSync(imgInfo.currentPath)) {
          fs.copyFileSync(imgInfo.currentPath, imgInfo.afterPath);
        }
      }
    }
  }
  
  // Update image paths in markdown files
  for (const article of articleInfos) {
    const mdPath = article.afterPath;
    if (fs.existsSync(mdPath)) {
      let content = fs.readFileSync(mdPath, 'utf-8');
      
      for (const imgInfo of article.containedImages) {
        const imgName = imgInfo.imageName;
        if (imgInfo.isLarge) {
          // Check if large image is referenced
          if (content.includes(`(${imgName})`)) {
            throw new Error(
              `Image ${imgInfo.currentPath} is too large to upload (${(imgInfo.isLarge ? '>3MB' : '')}). ` +
              `Please compress the image or remove it from ${mdPath}. ` +
              `Consider using tools like ImageOptim, TinyPNG, or converting to WebP format.`
            );
          }
        } else {
          // Replace image paths
          content = content.replace(
            new RegExp(`\\(${imgName}\\)`, 'g'),
            `(/images/${imgInfo.dateStr}/${imgName})`
          );
        }
      }
      
      fs.writeFileSync(mdPath, content, 'utf-8');
    }
  }
  
  // Create empty books folder
  fs.mkdirSync('books', { recursive: true });
  fs.writeFileSync('books/.keep', '', 'utf-8');
  
  // Commit changes
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  execSync('git add .', { stdio: 'inherit' });
  execSync(`git commit -m "Publish to Zenn at ${now}"`, { stdio: 'inherit' });
  
  console.log('Successfully prepared Zenn publication!');
}

main().catch(console.error);
