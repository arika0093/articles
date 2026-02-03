import * as fs from "fs";
import * as path from "path";
import chokidar from "chokidar";
import { findMarkdownFiles } from "./markdown.js";

type ContentsMenuItem = {
  title: string;
  href: string;
  sourcePath: string;
};

function getBlogRoot(): string {
  const cwd = process.cwd();
  if (path.basename(cwd) === "blog") return cwd;
  const candidate = path.join(cwd, "blog");
  if (fs.existsSync(path.join(candidate, "src"))) return candidate;
  return cwd;
}

function toContentsHref(relativePath: string): string {
  const withoutExt = relativePath.replace(/\.md$/i, "");
  const slug = withoutExt.split(path.sep).join("/");
  if (slug === "index") return "/contents";
  if (slug.endsWith("/index"))
    return `/contents/${slug.replace(/\/index$/, "")}`;
  return `/contents/${slug}`;
}

function ensureLayoutFrontmatter(content: string, layoutPath: string): string {
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

function getDateFolder(relativePath: string, filePath: string): string {
  const parts = relativePath.split(path.sep);
  return parts.length >= 2 ? parts[1] : path.basename(path.dirname(filePath));
}

function toContentsTitle(relativePath: string, filePath: string): string {
  const titleBase = path.basename(filePath, path.extname(filePath));
  const titleSeed =
    titleBase.toLowerCase() === "index"
      ? (() => {
          const parentDir = path.basename(path.dirname(relativePath));
          return parentDir && parentDir !== "." ? parentDir : "contents";
        })()
      : titleBase;
  return titleSeed.replace(/[-_]/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function copyArticleFile(
  file: string,
  articlesDir: string,
  blogContentDir: string,
  publicImagesDir: string
) {
  const relativePath = path.relative(articlesDir, file);
  const targetPath = path.join(blogContentDir, relativePath);

  // Remove # from filename
  const targetDir = path.dirname(targetPath);
  const targetFile = path.basename(targetPath).replace(/^#/, "");
  const finalPath = path.join(targetDir, targetFile);

  fs.mkdirSync(targetDir, { recursive: true });

  // Get date from directory structure (e.g., 2025/20250828)
  const dateFolder = getDateFolder(relativePath, file);

  // Parse date from folder name (YYYYMMDD format)
  let pubDatetime = "";
  if (dateFolder.match(/^\d{8}$/)) {
    const year = dateFolder.substring(0, 4);
    const month = dateFolder.substring(4, 6);
    const day = dateFolder.substring(6, 8);
    pubDatetime = `${year}-${month}-${day}`;
  }

  // Copy and process markdown file
  const originalContent = fs.readFileSync(file, "utf-8");
  const hasCRLF = /\r\n/.test(originalContent);
  let content = originalContent;

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
  content = content.replace(imageRefPattern, (match, _alt, filename) => {
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
      // No frontmatter present - add one
      content = `---\npubDatetime: ${pubDatetime}\n---\n\n${normalized}`;
    }
    // Restore original CRLF if the file originally used it
    if (hasCRLF) {
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

  // Add Zenn article link if published to Zenn
  const normalized = content.replace(/\r\n/g, "\n");
  const frontmatterMatch = normalized.match(/^---\n([\s\S]*?)\n---\n/);
  if (frontmatterMatch) {
    const frontmatter = frontmatterMatch[1];
    // Check if zenn.published is true (with various formatting possibilities)
    const zennPublishedMatch = frontmatter.match(
      /zenn:\s*\n(?:.*\n)*?\s*published:\s*(true)/m
    );
    if (zennPublishedMatch) {
      // Get the original filename without extension and the date folder (YYMMDD)
      const originalFilename = path.basename(file, path.extname(file));
      const zennUrl = `https://zenn.dev/arika/articles/${dateFolder}-${originalFilename}`;

      // Insert the link after the frontmatter
      const afterFrontmatter = normalized.substring(frontmatterMatch[0].length);
      const zennLinkSection = `:::message\nこの記事は [Zenn](${zennUrl}) にも投稿されています。\n:::\n\n`;

      content = frontmatterMatch[0] + zennLinkSection + afterFrontmatter;

      // Restore original CRLF if the file originally used it
      if (hasCRLF) {
        content = content.replace(/\n/g, "\r\n");
      }
    }
  }

  fs.writeFileSync(finalPath, content, "utf-8");
}

function copyContentsFile(
  file: string,
  contentsDir: string,
  blogContentsPagesDir: string
) {
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
}

function buildContentsMenu(
  contentsDir: string,
  contentsMenuPath: string,
  blogContentsPagesDir?: string
) {
  const contentsMenu: ContentsMenuItem[] = [];
  if (fs.existsSync(contentsDir)) {
    const contentsFiles = findMarkdownFiles(contentsDir).sort((a, b) =>
      a.localeCompare(b)
    );

    for (const file of contentsFiles) {
      if (blogContentsPagesDir) {
        copyContentsFile(file, contentsDir, blogContentsPagesDir);
      }
      const relativePath = path.relative(contentsDir, file);
      contentsMenu.push({
        title: toContentsTitle(relativePath, file),
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
}

function deleteCopiedMarkdown(
  file: string,
  articlesDir: string,
  blogContentDir: string
) {
  const relativePath = path.relative(articlesDir, file);
  const targetPath = path.join(blogContentDir, relativePath);
  const targetFile = path.basename(targetPath).replace(/^#/, "");
  const finalPath = path.join(path.dirname(targetPath), targetFile);
  if (fs.existsSync(finalPath)) {
    fs.unlinkSync(finalPath);
  }
}

function deleteCopiedContentsPage(
  file: string,
  contentsDir: string,
  blogContentsPagesDir: string
) {
  const relativePath = path.relative(contentsDir, file);
  const targetPath = path.join(blogContentsPagesDir, relativePath);
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath);
  }
}

function copyImageFile(
  file: string,
  articlesDir: string,
  publicImagesDir: string
) {
  const relativePath = path.relative(articlesDir, file);
  const dateFolder = getDateFolder(relativePath, file);
  const imgPublicDir = path.join(publicImagesDir, dateFolder);
  fs.mkdirSync(imgPublicDir, { recursive: true });
  const imgTarget = path.join(imgPublicDir, path.basename(file));
  fs.copyFileSync(file, imgTarget);
}

async function copyArticles() {
  const blogRoot = getBlogRoot();
  const articlesDir = path.join(blogRoot, "..", "articles");
  const blogContentDir = path.join(blogRoot, "src", "data", "blog");
  const publicImagesDir = path.join(blogRoot, "public", "images");
  const contentsDir = path.join(blogRoot, "..", "articles", "contents");
  const blogContentsPagesDir = path.join(blogRoot, "src", "pages", "contents");
  const contentsMenuPath = path.join(
    blogRoot,
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
    const isContents = relativePath.split(path.sep)[0] === "contents";
    if (!isContents) {
      copyArticleFile(file, articlesDir, blogContentDir, publicImagesDir);
    }
  }

  if (fs.existsSync(blogContentsPagesDir)) {
    fs.rmSync(blogContentsPagesDir, { recursive: true, force: true });
  }
  fs.mkdirSync(blogContentsPagesDir, { recursive: true });
  // Copy /contents markdown into pages/contents and build menu
  buildContentsMenu(contentsDir, contentsMenuPath, blogContentsPagesDir);

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
    const blogRoot = getBlogRoot();
    const articlesDir = path.join(blogRoot, "..", "articles");

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
    const pending = new Map<string, "add" | "change" | "unlink">();

    const processPending = async () => {
      const entries = Array.from(pending.entries());
      pending.clear();

      const articlesDir = path.join(blogRoot, "..", "articles");
      const blogContentDir = path.join(blogRoot, "src", "data", "blog");
      const publicImagesDir = path.join(blogRoot, "public", "images");
      const contentsDir = path.join(blogRoot, "..", "articles", "contents");
      const blogContentsPagesDir = path.join(
        blogRoot,
        "src",
        "pages",
        "contents"
      );
      const contentsMenuPath = path.join(
        blogRoot,
        "src",
        "data",
        "contents-menu.json"
      );

      for (const [file, event] of entries) {
        const relativePath = path.relative(articlesDir, file);
        const isContents = relativePath.split(path.sep)[0] === "contents";
        const isMarkdown = /\.md$/i.test(file);
        const isImage = /\.(png|jpg|jpeg|gif|svg|webp)$/i.test(file);

        if (event === "unlink") {
          if (isMarkdown) {
            if (isContents) {
              deleteCopiedContentsPage(file, contentsDir, blogContentsPagesDir);
              buildContentsMenu(contentsDir, contentsMenuPath);
            } else {
              deleteCopiedMarkdown(file, articlesDir, blogContentDir);
            }
          }
          continue;
        }

        if (isMarkdown) {
          if (isContents) {
            copyContentsFile(file, contentsDir, blogContentsPagesDir);
            buildContentsMenu(contentsDir, contentsMenuPath);
          } else {
            copyArticleFile(file, articlesDir, blogContentDir, publicImagesDir);
          }
          continue;
        }

        if (isImage) {
          copyImageFile(file, articlesDir, publicImagesDir);
        }
      }
    };

    const queueChange = (event: "add" | "change" | "unlink", file: string) => {
      pending.set(file, event);
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(async () => {
        console.log("\nDetected changes, copying updated files...");
        await processPending();
        console.log("Done. Watching for changes...\n");
      }, 500);
    };

    watcher
      .on("add", path => {
        console.log(`File added: ${path}`);
        queueChange("add", path);
      })
      .on("change", path => {
        console.log(`File changed: ${path}`);
        queueChange("change", path);
      })
      .on("unlink", path => {
        console.log(`File removed: ${path}`);
        queueChange("unlink", path);
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
