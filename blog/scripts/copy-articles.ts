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
  const articlesDir = path.join(process.cwd(), '..', 'articles');
  const blogContentDir = path.join(process.cwd(), 'src', 'content', 'blog');
  const publicImagesDir = path.join(process.cwd(), 'public', 'images');
  
  // Clear blog content directory
  if (fs.existsSync(blogContentDir)) {
    fs.rmSync(blogContentDir, { recursive: true });
  }
  fs.mkdirSync(blogContentDir, { recursive: true });
  
  // Clear public images directory
  if (fs.existsSync(publicImagesDir)) {
    fs.rmSync(publicImagesDir, { recursive: true });
  }
  fs.mkdirSync(publicImagesDir, { recursive: true });
  
  const markdownFiles = findMarkdownFiles(articlesDir);
  
  for (const file of markdownFiles) {
    const relativePath = path.relative(articlesDir, file);
    const targetPath = path.join(blogContentDir, relativePath);
    
    // Remove # from filename
    const targetDir = path.dirname(targetPath);
    const targetFile = path.basename(targetPath).replace(/^#/, '');
    const finalPath = path.join(targetDir, targetFile);
    
    fs.mkdirSync(targetDir, { recursive: true });
    
    // Get date from directory structure (e.g., 2025/20250828)
    const parts = relativePath.split(path.sep);
    const dateFolder = parts.length >= 2 ? parts[1] : path.basename(path.dirname(file));
    
    // Copy and process markdown file
    let content = fs.readFileSync(file, 'utf-8');
    
    // Find all existing images in the source directory
    const sourceDir = path.dirname(file);
    const existingImages = new Set<string>();
    
    try {
      const items = fs.readdirSync(sourceDir);
      for (const item of items) {
        if (/\.(png|jpg|jpeg|gif|svg|webp)$/i.test(item)) {
          existingImages.add(item);
        }
      }
    } catch (err) {
      // Directory might not be readable
    }
    
    // Copy existing images to public directory and update references
    for (const img of existingImages) {
      const imgSource = path.join(sourceDir, img);
      const imgPublicDir = path.join(publicImagesDir, dateFolder);
      fs.mkdirSync(imgPublicDir, { recursive: true });
      const imgTarget = path.join(imgPublicDir, img);
      fs.copyFileSync(imgSource, imgTarget);
      
      // Update image references in markdown
      const imgRegex = new RegExp(`\\(${img.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g');
      content = content.replace(imgRegex, `(/images/${dateFolder}/${img})`);
    }
    
    // Remove references to non-existent images
    // Find all ![...](filename.ext) patterns where filename doesn't exist
    const imageRefPattern = /!\[([^\]]*)\]\(([^)]+\.(png|jpg|jpeg|gif|svg|webp))\)/gi;
    content = content.replace(imageRefPattern, (match, alt, filename) => {
      // Extract just the filename without path
      const justFilename = path.basename(filename);
      
      // If this image exists (we processed it above), keep the reference
      // Otherwise, comment it out
      if (existingImages.has(justFilename)) {
        return match; // Keep as-is (already updated above)
      } else {
        return `<!-- Missing image: ${match} -->`;
      }
    });
    
    fs.writeFileSync(finalPath, content, 'utf-8');
  }
  
  console.log(`Copied ${markdownFiles.length} articles to blog content directory`);
}

main().catch(console.error);
