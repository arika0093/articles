import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// CLI flags control date source and target scope.
const args = new Set(process.argv.slice(2));
const useGit = args.has("--from-git") || !args.has("--from-folder");
const useFolder = args.has("--from-folder");
const useStaged = args.has("--staged");
const force = args.has("--force");

// Repo root is the current working directory; articles are under articles/.
const repoRoot = process.cwd();
const articlesDir = path.join(repoRoot, "articles");

// Depth-first traversal without recursion to avoid call stack limits.
function listMarkdownFiles(dir) {
  const results = [];
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".md")) {
        results.push(fullPath);
      }
    }
  }
  return results;
}

// Resolve staged markdown files under articles/ (ACM diff-filter).
function getStagedMarkdownFiles() {
  const output = execSync("git diff --name-only --cached --diff-filter=ACM", {
    encoding: "utf8",
  });
  return output
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .filter(file => file.startsWith("articles/") && file.endsWith(".md"))
    .map(file => path.join(repoRoot, file));
}

// Extract date from articles/<category>/<YYYYMMDD>/... path segments.
function getDateFromFolder(filePath) {
  const relative = path.relative(articlesDir, filePath);
  const parts = relative.split(path.sep);
  const dateFolder = parts.length >= 2 ? parts[1] : "";
  if (!/^\d{8}$/.test(dateFolder)) {
    return null;
  }
  const year = dateFolder.slice(0, 4);
  const month = dateFolder.slice(4, 6);
  const day = dateFolder.slice(6, 8);
  return `${year}-${month}-${day}`;
}

// Read commit timestamps for a file, filtering out bot/chore commits.
function getGitDates(filePath) {
  const relative = path.relative(repoRoot, filePath).replace(/\\/g, "/");
  try {
    const output = execSync(
      `git log --follow --format=%cI%x09%an%x09%s -- "${relative}"`,
      { encoding: "utf8" }
    )
      .trim()
      .split(/\r?\n/)
      .filter(Boolean)
      .map(line => {
        const [date, author, subject] = line.split("\t");
        return { date, author, subject };
      })
      .filter(entry => {
        if (!entry.date) {
          return false;
        }
        const author = entry.author || "";
        const subject = entry.subject || "";
        if (/^github-actions(?:\[bot\])?$/i.test(author)) {
          return false;
        }
        if (/\bchore\b/i.test(subject)) {
          return false;
        }
        return true;
      })
      .map(entry => entry.date);
    if (output.length === 0) {
      return { first: null, last: null };
    }
    // "first" is oldest (publish), "last" is newest (modified).
    return { first: output[output.length - 1], last: output[0] };
  } catch {
    return { first: null, last: null };
  }
}

function updateFrontmatter(content, updates) {
  // Preserve original CRLF/LF to avoid churn in diffs.
  const hasCrlf = content.includes("\r\n");
  const normalized = content.replace(/\r\n/g, "\n");
  const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?/);

  const ensureLineEndings = text => (hasCrlf ? text.replace(/\n/g, "\r\n") : text);

  // If no frontmatter exists, only create it when we actually insert fields.
  if (!fmMatch) {
    const fmLines = [];
    if (updates.insertPub) {
      fmLines.push(`pubDatetime: ${updates.pub}`);
    }
    if (updates.insertMod) {
      fmLines.push(`modDatetime: ${updates.mod}`);
    }
    if (fmLines.length === 0) {
      return { content, changed: false };
    }
    const next = `---\n${fmLines.join("\n")}\n---\n\n${normalized}`;
    return { content: ensureLineEndings(next), changed: true };
  }

  const fmLines = fmMatch[1].split("\n");
  const keptLines = [];
  let keptPub = false;
  let keptMod = false;

  // Drop pub/mod lines unless explicitly kept.
  for (const line of fmLines) {
    if (/^pubDatetime\s*:/.test(line)) {
      if (updates.keepPubLine) {
        keptLines.push(line);
        keptPub = true;
      }
      continue;
    }
    if (/^modDatetime\s*:/.test(line)) {
      if (updates.keepModLine) {
        keptLines.push(line);
        keptMod = true;
      }
      continue;
    }
    keptLines.push(line);
  }

  const insertLines = [];
  if (updates.insertPub) {
    insertLines.push(`pubDatetime: ${updates.pub}`);
  }
  if (updates.insertMod) {
    insertLines.push(`modDatetime: ${updates.mod}`);
  }

  // Insert new pub/mod after title when present to keep metadata grouped.
  if (insertLines.length > 0) {
    const titleIndex = keptLines.findIndex(line => /^title\s*:/.test(line));
    const insertAt = titleIndex >= 0 ? titleIndex + 1 : 0;
    keptLines.splice(insertAt, 0, ...insertLines);
  } else {
    if (!updates.keepPubLine && keptPub) {
      // no-op
    }
    if (!updates.keepModLine && keptMod) {
      // no-op
    }
  }

  const newFm = keptLines.join("\n");
  const next = normalized.replace(fmMatch[0], `---\n${newFm}\n---\n`);
  const changed = ensureLineEndings(next) !== content;
  return { content: ensureLineEndings(next), changed };
}

function updateFile(filePath) {
  // Decide candidate dates, then update frontmatter accordingly.
  const content = fs.readFileSync(filePath, "utf8");
  const hasPub = /^pubDatetime\s*:/m.test(content);
  const hasMod = /^modDatetime\s*:/m.test(content);
  const folderDate = getDateFromFolder(filePath);
  const gitDates = useGit ? getGitDates(filePath) : { first: null, last: null };

  let pubDatetime = null;
  let modDatetime = null;

  if (useGit && gitDates.first) {
    pubDatetime = gitDates.first;
  } else if (useFolder && folderDate) {
    pubDatetime = folderDate;
  }

  const updates = {
    insertPub: false,
    insertMod: false,
    keepPubLine: true,
    keepModLine: true,
    pub: "",
    mod: "",
  };

  // When using git or --force, overwrite pubDatetime in frontmatter.
  if (pubDatetime) {
    updates.pub = pubDatetime;
    if (useGit || force) {
      updates.insertPub = true;
      updates.keepPubLine = false;
    } else if (!hasPub) {
      updates.insertPub = true;
      updates.keepPubLine = true;
    }
  }

  // modDatetime is only set when it differs from pubDatetime.
  if (useGit && gitDates.last) {
    if (pubDatetime && gitDates.last !== pubDatetime) {
      modDatetime = gitDates.last;
    }
    updates.keepModLine = false;
    updates.insertMod = modDatetime !== null;
    updates.mod = modDatetime || "";
  } else if (!useGit && hasMod) {
    updates.keepModLine = true;
  }

  const result = updateFrontmatter(content, updates);
  if (result.changed) {
    fs.writeFileSync(filePath, result.content, "utf8");
  }
  return result.changed;
}

function main() {
  if (!fs.existsSync(articlesDir)) {
    console.error(`Missing articles directory: ${articlesDir}`);
    process.exit(1);
  }

  // Choose file set: staged-only or full articles tree.
  const files = useStaged ? getStagedMarkdownFiles() : listMarkdownFiles(articlesDir);
  let updated = 0;
  const changedFiles = [];

  for (const file of files) {
    const changed = updateFile(file);
    if (changed) {
      updated += 1;
      changedFiles.push(file);
    }
  }

  // Re-stage files when operating on staged inputs.
  if (useStaged && changedFiles.length > 0) {
    const relativeFiles = changedFiles.map(file =>
      path.relative(repoRoot, file).replace(/\\/g, "/")
    );
    execSync(`git add ${relativeFiles.map(f => `"${f}"`).join(" ")}`);
  }

  if (updated > 0) {
    console.log(`Updated dates in ${updated} file(s).`);
  }
}

main();
