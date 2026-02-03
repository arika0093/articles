import { visit } from "unist-util-visit";
import type { Root, Element, Text } from "hast";

// Rehype plugin to convert Zenn's :::message ::: format to custom divs
export function rehypeMessage() {
  return (tree: Root) => {
    visit(tree, "element", (node: Element, index, parent) => {
      if (node.tagName !== "p" || !parent || index === undefined) return;

      // Check if this paragraph contains :::message marker
      const hasMessageMarker = checkForMessageMarker(node);
      
      if (hasMessageMarker) {
        // Clean the message markers and wrap in div
        const cleanedChildren = cleanMessageMarkers(node.children);
        
        if (cleanedChildren.length > 0) {
          // Create a new div element with the zenn-message class
          // Use the original paragraph's children directly
          const messageDiv: Element = {
            type: "element",
            tagName: "div",
            properties: {
              className: ["zenn-message"],
            },
            children: cleanedChildren,
          };

          // Replace the paragraph with the message div
          parent.children[index] = messageDiv;
        }
      }
    });
  };
}

// Helper function to check if a node contains :::message marker
function checkForMessageMarker(node: Element): boolean {
  return hasText(node, ":::message");
}

// Helper function to check if a node tree contains specific text
function hasText(node: Element | Text, searchText: string): boolean {
  if (node.type === "text") {
    return node.value.includes(searchText);
  }
  
  if (node.type === "element" && node.children) {
    return node.children.some(child => hasText(child as Element | Text, searchText));
  }
  
  return false;
}

// Clean message markers from children
function cleanMessageMarkers(children: any[]): any[] {
  const cleaned: any[] = [];
  
  for (const child of children) {
    if (child.type === "text") {
      // Remove :::message and ::: markers
      let text = child.value;
      text = text.replace(/:::message\s*/g, "");
      text = text.replace(/\s*:::/g, "");
      
      // Only add if there's remaining text
      if (text.trim()) {
        cleaned.push({ ...child, value: text });
      }
    } else if (child.type === "element" && child.tagName !== "br") {
      // Keep all elements EXCEPT <br>
      cleaned.push(child);
    }
    // Skip <br> elements entirely
  }
  
  return cleaned;
}
