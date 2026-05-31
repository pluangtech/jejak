import { defineConfig } from "vitepress";

// Dev-only docs site. It renders docs/user/ DIRECTLY (srcDir below) — no copies, so the published
// site can never drift from the source markdown the repo already guards in CI.
// NOT shipped to npm (see package.json "files"). Build: `pnpm docs:site:build`.
//
// NOTE: the built site uses absolute asset paths (/assets/...). View it via `pnpm docs:site:dev`
// or `pnpm docs:site:preview` (served at the server root) — opening dist/*.html as a file:// or
// through an IDE static server at a sub-path will 404 the CSS/JS.
export default defineConfig({
  title: "jejak",
  description: "Capture the trail your AI coding agents leave behind",
  srcDir: "../docs/user",
  // docs/user/README.md is the index (nice on GitHub); map it to "/" for the site.
  rewrites: { "README.md": "index.md" },
  // Cross-references to internal design docs (docs/DESIGN-LLD.md, docs/CLI-SPEC.md) live OUTSIDE
  // this site's root, so VitePress can't resolve them — but they resolve on GitHub and are checked
  // on-disk by `pnpm docs:check` (LinkChecker). Ignore only links that escape the site root (`../`).
  ignoreDeadLinks: [/\.\.\//],
  themeConfig: {
    nav: [
      { text: "Guide", link: "/" },
      { text: "Commands", link: "/commands" },
    ],
    sidebar: [
      {
        text: "Getting started",
        items: [
          { text: "User guide", link: "/" },
          { text: "jejak init", link: "/init" },
        ],
      },
      {
        text: "Concepts",
        items: [{ text: "The shadow branch", link: "/concepts/shadow-branch" }],
      },
      {
        text: "Reference",
        items: [{ text: "Commands (generated)", link: "/commands" }],
      },
    ],
  },
});
