export const SITE = {
  website: "https://eclairs.cc",
  author: "arika0093",
  profile: "https://github.com/arika0093",
  desc: "テックの世界をてくてく歩く",
  title: "eclair's note",
  ogImage: "og.png",
  lightAndDarkMode: true,
  postPerIndex: 8,
  postPerPage: 20,
  scheduledPostMargin: 15 * 60 * 1000, // 15 minutes
  showArchives: true,
  showBackButton: true,
  editPost: {
    enabled: true,
    text: "Edit on GitHub",
    url: "https://github.com/arika0093/articles/edit/main/",
  },
  dynamicOgImage: true,
  dir: "ltr",
  lang: "ja",
  timezone: "Asia/Tokyo",
  googleAnalyticsId: "G-XBJD4JR8D1",
} as const;
