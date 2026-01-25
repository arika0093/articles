import * as fs from "fs";
import * as path from "path";
import chokidar from "chokidar";
import { findMarkdownFiles } from "./markdown.js";

type ContentsMenuItem = {
  title: string;
  href: string;
  sourcePath: string;
};

function extractTitleFromMarkdown(content: string, fallback: string): string {
  const frontmatterMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    const titleMatch = frontmatter.match(/^\s*title\s*:\s*(.+)\s*$/m);
    if (titleMatch) {
      return titleMatch[1].trim().replace(/^['"]|['"]$/g, "");
    }
  }

  const body = frontmatterMatch
    ? content.slice(frontmatterMatch[0].length)
    : content;
  const headingMatch = body.match(/^\s*#\s+(.+)\s*$/m);
  if (headingMatch) {
    return headingMatch[1].trim();
  }

  return fallback;
}

function toContentsHref(relativePath: string): string {
  const withoutExt = relativePath.replace(/\.md$/i, "");
  const slug = withoutExt.split(path.sep).join("/");
  if (slug === "index") return "/contents";
  if (slug.endsWith("/index")) return `/contents/${slug.replace(/\/index$/, "")}`;
  return `/contents/${slug}`;
}

function ensureLayoutFrontmatter(
  content: string,
  layoutPath: string
): string {
  const normalized = content.replace(/\r\n/g, "\n");
  const frontmatterMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?/);

  if (frontmatterMatch) {
    const fm = frontmatterMatch[1];
    if (!/^\s*layout\s*:/m.test(fm)) {
      const newFm = `layout: ${layoutPath}\n${fm}`;
      return normalized.replace(frontmatterMatch[0], `---\n${newFm}\n---\n`);
    }
    return normalized;
  }

  return `---\nlayout: ${layoutPath}\n---\n\n${normalized}`;
}

async function copyArticles() {
  const articlesDir = path.join(process.cwd(), "..", "articles");
  const blogContentDir = path.join(process.cwd(), "src", "data", "blog");
  const publicImagesDir = path.join(process.cwd(), "public", "images");
  const contentsDir = path.join(process.cwd(), "..", "articles", "contents");
  const blogContentsPagesDir = path.join(
    process.cwd(),
    "src",
    "pages",
    "contents"
  );
  const contentsMenuPath = path.join(
    process.cwd(),
    "src",
    "data",
    "contents-menu.json"
  );

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
      const escapedImg = img.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // Match plain filename or ./filename (or .\filename) in markdown links.
      const imgRegex = new RegExp(`\\((?:\\.\\/|\\.\\\\)?${escapedImg}\\)`, "g");
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

  // Copy /contents markdown into pages/contents and build menu
  const contentsMenu: ContentsMenuItem[] = [];
  if (fs.existsSync(blogContentsPagesDir)) {
    fs.rmSync(blogContentsPagesDir, { recursive: true, force: true });
  }
  fs.mkdirSync(blogContentsPagesDir, { recursive: true });

  if (fs.existsSync(contentsDir)) {
    const contentsFiles = findMarkdownFiles(contentsDir).sort((a, b) =>
      a.localeCompare(b)
    );

    for (const file of contentsFiles) {
      const relativePath = path.relative(contentsDir, file);
      const targetPath = path.join(blogContentsPagesDir, relativePath);
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });

      const rawContent = fs.readFileSync(file, "utf-8");
      const layoutRelative = path
        .relative(
          path.dirname(targetPath),
          path.join(process.cwd(), "src", "layouts", "ContentDetails.astro")
        )
        .split(path.sep)
        .join("/");
      let content = ensureLayoutFrontmatter(rawContent, layoutRelative);
      if (/\r\n/.test(rawContent)) {
        content = content.replace(/\n/g, "\r\n");
      }
      fs.writeFileSync(targetPath, content, "utf-8");

      const titleBase = path.basename(file, path.extname(file));
      const titlePascalCase = titleBase
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, c => c.toUpperCase());
      const baseName = path.basename(file, path.extname(file));
      contentsMenu.push({
        title: titlePascalCase,
        href: toContentsHref(relativePath),
        sourcePath: relativePath,
      });
    }
  }

  contentsMenu.sort((a, b) => a.sourcePath.localeCompare(b.sourcePath));
  fs.writeFileSync(
    contentsMenuPath,
    `${JSON.stringify(
      contentsMenu.map(({ title, href }) => ({ title, href })),
      null,
      2
    )}\n`,
    "utf-8"
  );

  console.log(
    `Copied ${markdownFiles.length} articles to blog content directory`
  );
}

async function main() {
  const watchMode =
    process.argv.includes("-w") || process.argv.includes("--watch");

  // Run the copy process
  await copyArticles();

  if (watchMode) {
    const articlesDir = path.join(process.cwd(), "..", "articles");

    console.log(`\nWatching for changes in ${articlesDir}...\n`);

    const watcher = chokidar.watch(articlesDir, {
      ignored: /(^|[\/\\])\../, // Ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 300,
        pollInterval: 100,
      },
    });

    let timeout: NodeJS.Timeout | null = null;

    const debouncedCopy = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(async () => {
        console.log("\nDetected changes, copying articles...");
        await copyArticles();
        console.log("Done. Watching for changes...\n");
      }, 500);
    };

    watcher
      .on("add", path => {
        console.log(`File added: ${path}`);
        debouncedCopy();
      })
      .on("change", path => {
        console.log(`File changed: ${path}`);
        debouncedCopy();
      })
      .on("unlink", path => {
        console.log(`File removed: ${path}`);
        debouncedCopy();
      });

    // Keep the process alive
    process.on("SIGINT", () => {
      console.log("\nStopping watcher...");
      watcher.close();
      process.exit(0);
    });
  }
}

main().catch(console.error);
