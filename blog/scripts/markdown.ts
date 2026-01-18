/**
 * Shared utility for finding markdown files
 */

import * as fs from 'fs';
import * as path from 'path';

export function findMarkdownFiles(dir: string): string[] {
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
