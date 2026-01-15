declare module "remark-link-card" {
  import type { Root } from "mdast";
  import type { Plugin } from "unified";

  interface RemarkLinkCardOptions {
    cache?: boolean;
    shortenUrl?: boolean;
  }

  const remarkLinkCard: Plugin<[RemarkLinkCardOptions?], Root>;
  export default remarkLinkCard;
}
