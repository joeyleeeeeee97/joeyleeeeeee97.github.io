export const config = {
  site: {
    title: "Joey Li",
    name: "Joey Li",
    description: "Joey Li's blog",
    keywords: ["AI", "Full Stack Developer"],
    url: "https://joeyli.com",
    baseUrl: "https://joeyli.com",
    image: "https://joeyli.com/og-image.png",
    favicon: {
      ico: "/favicon.ico",
      png: "/favicon.png",
      svg: "/favicon.svg",
      appleTouchIcon: "/favicon.png",
    },
    manifest: "/site.webmanifest",
    rss: {
      title: "Nextjs Blog Template",
      description: "Thoughts on Full-stack development, AI",
      feedLinks: {
        rss2: "/rss.xml",
        json: "/feed.json",
        atom: "/atom.xml",
      },
    },
  },
  author: {
    name: "Joey Li",
    email: "joeylee1997.1997@gmail.com",
    bio: "Passion begets persistence",
  },
  social: {
    github: "https://github.com/joeyleeeeeee97",
    x: "https://x.com/xxx",
    xiaohongshu: "https://www.xiaohongshu.com/user/profile/xxx",
    wechat: "https://storage.xxx.com/images/wechat-official-account.png",
    buyMeACoffee: "https://www.buymeacoffee.com/xxx",
  },
  giscus: {
    repo: "joeyleeeeeee97/hugo-ladder-exampleSite",
    repoId: "R_kgDOPcTS0w",
    categoryId: "DIC_kwDOPcTS084CuEHA",
  },
  navigation: {
    main: [
      { 
        title: "Blog", 
        href: "/blog",
      },
    ],
  },
  seo: {
    metadataBase: new URL("https://xxx.com"),
    alternates: {
      canonical: './',
    },
    openGraph: {
      type: "website" as const,
      locale: "en_US",
    },
    twitter: {
      card: "summary_large_image" as const,
      creator: "@xxx",
    },
  },
};
