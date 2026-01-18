import { SITE } from "@/config";

interface Social {
  name: string;
  href: string;
  linkTitle: string;
  iconName: string;
}

export const SOCIALS: Social[] = [
  {
    name: "GitHub",
    href: "https://github.com/arika0093",
    linkTitle: `GitHub`,
    iconName: "tabler:brand-github",
  },
  {
    name: "X",
    href: "https://x.com/eclair_ptr",
    linkTitle: `Twitter(X)`,
    iconName: "tabler:brand-twitter",
  },
  // {
  //   name: "LinkedIn",
  //   href: "https://www.linkedin.com/in/username/",
  //   linkTitle: `${SITE.title} on LinkedIn`,
  //   icon: IconLinkedin,
  // },
  // {
  //   name: "Mail",
  //   href: "mailto:yourmail@gmail.com",
  //   linkTitle: `Send an email to ${SITE.title}`,
  //   icon: IconMail,
  // },
] as const;

export const SHARE_LINKS: Social[] = [
  {
    name: "Twitter",
    href: "https://x.com/intent/post?url=",
    linkTitle: `Share this post on Twitter(X)`,
    iconName: "tabler:brand-x",
  },
] as const;
