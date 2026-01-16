declare module "remark-collapse" {
  interface RemarkCollapseOptions {
    test?: string;
  }

  function remarkCollapse(options?: RemarkCollapseOptions): any;
  export default remarkCollapse;
}
