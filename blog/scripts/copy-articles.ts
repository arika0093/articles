import * as fs from "fs";
import * as path from "path";
import { findMarkdownFiles } from "../../lib/markdown.js";

async function main() {
  const articlesDir = path.join(process.cwd(), "..", "articles");
  const blogContentDir = path.join(process.cwd(), "src", "data", "blog");
  const publicImagesDir = path.join(process.cwd(), "public", "images");

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
    const targetFile = path.basename(targetPath).replace(/^#/, "");
    const finalPath = path.join(targetDir, targetFile);

    fs.mkdirSync(targetDir, { recursive: true });

    // Get date from directory structure (e.g., 2025/20250828)
    const parts = relativePath.split(path.sep);
    const dateFolder =
      parts.length >= 2 ? parts[1] : path.basename(path.dirname(file));

    // Parse date from folder name (YYYYMMDD format)
    let pubDatetime = "";
    if (dateFolder.match(/^\d{8}$/)) {
      const year = dateFolder.substring(0, 4);
      const month = dateFolder.substring(4, 6);
      const day = dateFolder.substring(6, 8);
      pubDatetime = `${year}-${month}-${day}`;
    }

    // Copy and process markdown file
    let content = fs.readFileSync(file, "utf-8");

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
    for (const img of Array.from(existingImages)) {
      const imgSource = path.join(sourceDir, img);
      const imgPublicDir = path.join(publicImagesDir, dateFolder);
      fs.mkdirSync(imgPublicDir, { recursive: true });
      const imgTarget = path.join(imgPublicDir, img);
      fs.copyFileSync(imgSource, imgTarget);

      // Update image references in markdown
      const imgRegex = new RegExp(
        `\\(${img.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`,
        "g"
      );
      content = content.replace(imgRegex, `(/images/${dateFolder}/${img})`);
    }

    // Remove references to non-existent images
    const imageRefPattern =
      /!\[([^\]]*)\]\(([^)]+\.(png|jpg|jpeg|gif|svg|webp))\)/gi;
    content = content.replace(imageRefPattern, (match, alt, filename) => {
      const justFilename = path.basename(filename);

      if (match.includes("http")) {
        return match;
      }
      if (existingImages.has(justFilename)) {
        return match;
      }
      return `<!-- Missing image: ${match} -->`;
    });

    // Add pubDatetime to frontmatter if it doesn't exist
    if (pubDatetime) {
      // Normalize line endings for reliable matching
      const normalized = content.replace(/\r\n/g, "\n");

      // If there's an existing frontmatter block, insert pubDatetime if missing
      if (/^---\n[\s\S]*?\n---\n?/.test(normalized)) {
        const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
        if (fmMatch) {
          const fm = fmMatch[1];
          if (!/\bpubDatetime\s*:/m.test(fm)) {
            const newFm = `pubDatetime: ${pubDatetime}\n${fm}`;
            content = normalized.replace(fmMatch[0], `---\n${newFm}\n---\n`);
          } else {
            content = normalized;
          }
        }
      } else {
        // No frontmatter present — add one
        content = `---\npubDatetime: ${pubDatetime}\n---\n\n${normalized}`;
      }
      // Restore original CRLF if the file originally used it
      if (/\r\n/.test(fs.readFileSync(file, "utf-8"))) {
        content = content.replace(/\n/g, "\r\n");
      }
    }

    // Convert zenn.topics to tags if not already present
    if (!content.match(/^tags:/m)) {
      const topicsMatch = content.match(/topics:\s*\[(.*?)\]/);
      if (topicsMatch) {
        const topics = topicsMatch[1]
          .split(",")
          .map(t => t.trim().replace(/['"]/g, ""))
          .filter(t => t);
        if (topics.length > 0) {
          content = content.replace(
            /^---\n/,
            `---\ntags: [${topics.map(t => `"${t}"`).join(", ")}]\n`
          );
        }
      }
    }

    fs.writeFileSync(finalPath, content, "utf-8");
  }

  console.log(
    `Copied ${markdownFiles.length} articles to blog content directory`
  );
}

main().catch(console.error);
