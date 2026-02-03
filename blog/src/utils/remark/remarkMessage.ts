import type { Root } from "mdast";

// Remark plugin to convert Zenn's :::message ::: format to custom divs
export function remarkMessage() {
  return (tree: Root) => {
    const children = tree.children;
    const newChildren: any[] = [];
    let i = 0;

    while (i < children.length) {
      const node = children[i];

      // Check if this is a paragraph containing :::message
      if (
        node.type === "paragraph" &&
        node.children &&
        node.children.length > 0 &&
        node.children[0].type === "text"
      ) {
        const text = (node.children[0] as any).value;
        
        if (text && text.trim() === ":::message") {
          // Found start of message block
          const messageContent: any[] = [];
          let j = i + 1;

          // Collect content until we find :::
          while (j < children.length) {
            const sibling = children[j];
            if (
              sibling.type === "paragraph" &&
              sibling.children &&
              sibling.children.length > 0 &&
              sibling.children[0].type === "text" &&
              (sibling.children[0] as any).value &&
              (sibling.children[0] as any).value.trim() === ":::"
            ) {
              // Found end marker
              break;
            }
            messageContent.push(sibling);
            j++;
          }

          // If we found a closing marker, create the message div
          if (j < children.length) {
            // Add opening div
            newChildren.push({
              type: "html",
              value: '<div class="zenn-message">',
            });

            // Add message content
            newChildren.push(...messageContent);

            // Add closing div
            newChildren.push({
              type: "html",
              value: "</div>",
            });

            // Skip past the closing :::
            i = j + 1;
            continue;
          }
        }
      }
      
      // Not a message block, keep node as is
      newChildren.push(node);
      i++;
    }

    tree.children = newChildren;
  };
}
