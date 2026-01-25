import fs from "fs";
import path from "path";
import { execSync } from "child_process";

const args = new Set(process.argv.slice(2));
const useGit = args.has("--from-git") || !args.has("--from-folder");
const useFolder = args.has("--from-folder");
const useStaged = args.has("--staged");
const force = args.has("--force");

const repoRoot = process.cwd();
const articlesDir = path.join(repoRoot, "articles");

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

function getGitDates(filePath) {
  const relative = path.relative(repoRoot, filePath).replace(/\\/g, "/");
  try {
    const output = execSync(
      `git log --follow --format=%cI -- "${relative}"`,
      { encoding: "utf8" }
    )
      .trim()
      .split(/\r?\n/)
      .filter(Boolean);
    if (output.length === 0) {
      return { first: null, last: null };
    }
    return { first: output[output.length - 1], last: output[0] };
  } catch {
    return { first: null, last: null };
  }
}

function updateFrontmatter(content, updates) {
  const hasCrlf = content.includes("\r\n");
  const normalized = content.replace(/\r\n/g, "\n");
  const fmMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?/);

  const ensureLineEndings = text => (hasCrlf ? text.replace(/\n/g, "\r\n") : text);

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
