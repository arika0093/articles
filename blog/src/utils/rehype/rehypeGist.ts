import { visit } from "unist-util-visit";
import type { Root, Element } from "hast";

// Rehype plugin to convert GitHub Gist URLs into embedded Gist scripts
export function rehypeGist() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      // Look for links to GitHub Gist
      if (
        node.tagName === "a" &&
        node.properties &&
        typeof node.properties.href === "string"
      ) {
        const href = node.properties.href;
        const gistMatch = href.match(
          /^https?:\/\/gist\.github\.com\/([^\/]+)\/([a-f0-9]+)/
        );

        if (gistMatch && parent && typeof index === "number") {
          // Create a script element for the Gist embed
          const scriptElement: Element = {
            type: "element",
            tagName: "script",
            properties: {
              src: `${href}.js`,
            },
            children: [],
          };

          // Replace the link with the script element
          parent.children[index] = scriptElement;
        }
      }
    });
  };
}
