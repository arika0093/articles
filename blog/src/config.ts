export const SITE = {
  website: "https://arika0093.github.io/articles/",
  author: "arika0093",
  profile: "https://github.com/arika0093",
  desc: "技術記事とブログ",
  title: "arika0093's blog",
  ogImage: "astropaper-og.jpg",
  lightAndDarkMode: true,
  postPerIndex: 4,
  postPerPage: 10,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
  showArchives: true,
  showBackButton: true,
  editPost: {
    enabled: true,
    text: "Edit on GitHub",
    url: "https://github.com/arika0093/articles/edit/main/articles/",
  },
  dynamicOgImage: true,
  dir: "ltr",
  lang: "ja",
  timezone: "Asia/Tokyo",
} as const;
