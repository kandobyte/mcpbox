import { defineConfig } from "vitepress";
import llmstxt from "vitepress-plugin-llms";

const siteUrl = "https://kandobyte.github.io/mcpbox/";

export default defineConfig({
  vite: {
    plugins: [llmstxt()],
  },
  title: "MCPBox",
  description:
    "A lightweight gateway that exposes local stdio-based MCP servers via Streamable HTTP",
  base: "/mcpbox/",

  sitemap: {
    hostname: siteUrl,
  },

  head: [
    ["link", { rel: "icon", href: "/mcpbox/logo.svg" }],
    [
      "link",
      { rel: "alternate", type: "text/markdown", href: "/mcpbox/llms.txt" },
    ],
    [
      "meta",
      {
        name: "google-site-verification",
        content: "N9dWHHrg_Bir-6kAh-UB7ZHgkfN_DVfwfMEv2yX59jg",
      },
    ],
    ["meta", { property: "og:type", content: "website" }],
    ["meta", { property: "og:site_name", content: "MCPBox" }],
  ],

  transformPageData(pageData) {
    const title = pageData.frontmatter.title ?? pageData.title ?? "MCPBox";
    const description =
      pageData.frontmatter.description ??
      pageData.description ??
      "A lightweight gateway that exposes local stdio-based MCP servers via Streamable HTTP";
    const canonicalUrl = `${siteUrl}${pageData.relativePath
      .replace(/index\.md$/, "")
      .replace(/\.md$/, "")}`;

    pageData.frontmatter.head ??= [];
    pageData.frontmatter.head.push(
      ["link", { rel: "canonical", href: canonicalUrl }],
      ["meta", { property: "og:title", content: title }],
      ["meta", { property: "og:description", content: description }],
      ["meta", { property: "og:url", content: canonicalUrl }],
    );
  },

  themeConfig: {
    outline: { level: [2, 4] },
    logo: {
      light: "/logo.svg",
      dark: "/logo-dark.svg",
    },

    nav: [{ text: "Docs", link: "/quick-start" }],

    sidebar: [
      {
        items: [
          { text: "Quick Start", link: "/quick-start" },
          {
            text: "Configuration",
            link: "/configuration",
            items: [{ text: "Authentication", link: "/authentication" }],
          },
          { text: "Deployment", link: "/deployment" },
          { text: "Connect AI", link: "/connect-ai" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/kandobyte/mcpbox" },
    ],

    editLink: {
      pattern: "https://github.com/kandobyte/mcpbox/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },

    search: {
      provider: "local",
    },
  },
});
