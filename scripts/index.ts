import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import type { ArticleInfo, ArticleImageInfo } from './lib/types.js';
import { parseFrontmatter, generateZennFrontmatter } from './lib/frontmatter.js';
import { findMarkdownFiles } from './lib/markdown.js';

// Main execution
async function main() {
  // Move to project root
  const projectRoot = path.join(process.cwd(), '..');
  process.chdir(projectRoot);

  const articlesDir = path.join(projectRoot, 'articles');

  // Checkout or create publish/zenn branch
  execSync('git checkout -B publish/zenn main', { stdio: 'inherit' });

  // Find all markdown files
  const markdownFiles = findMarkdownFiles(articlesDir);

  const articleInfos: ArticleInfo[] = [];

  for (const file of markdownFiles) {
    const dir = path.dirname(file);
    const dateStr = path.basename(dir);
    const baseName = path.basename(file);
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
      if (frontmatter.zenn?.published != true) {
        console.log(`Skipping unpublished article: ${beforePath}`);
        continue;
      }

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
          // Replace image paths (matches both ./image.png and image.png)
          // Escape special regex characters in the image name
          const escapedImgName = imgName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          // Use a single regex that matches both formats with an optional ./ prefix
          // Pattern explanation: (?:\.\/escapedImgName|escapedImgName)
          //   - Non-capturing group with two alternatives separated by |
          //   - First alternative: \./ (literal ./) followed by the image name
          //   - Second alternative: just the image name
          //   - This matches both (./image.png) and (image.png)
          content = content.replace(
            new RegExp(`\\((?:\\.\\/${escapedImgName}|${escapedImgName})\\)`, 'g'),
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

  // Remove other files and folders except articles and images
  fs.rmSync('blog', { recursive: true, force: true });
  fs.rmSync('docs', { recursive: true, force: true });
  fs.rmSync('scripts', { recursive: true, force: true });

  // Commit changes
  const now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  execSync('git add .', { stdio: 'inherit' });
  execSync(`git commit -m "Publish to Zenn at ${now}"`, { stdio: 'inherit' });

  console.log('Successfully prepared Zenn publication!');
}

main().catch(console.error);
