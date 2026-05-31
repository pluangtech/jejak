# docs-site (dev-only)

A [VitePress](https://vitepress.dev) site that publishes the user guide. It is **not** shipped to
npm (excluded from `package.json` `files`) and is not required to use jejak.

It renders [`../docs/user/`](../docs/user/) **directly** via `srcDir` — there are no copies of the
markdown here, so the published site can't drift from the source the repo guards in CI
(`pnpm docs:check`).

## Commands

```console
$ pnpm docs:site:dev      # local preview with hot reload
$ pnpm docs:site:build    # static build into docs-site/.vitepress/dist
```

Before building, make sure the generated reference is current:

```console
$ pnpm docs:gen
```

## Publishing

Deployment to GitHub Pages is scaffolded in `.github/workflows/docs.yml` but **disabled** until the
v0.1 tag — see that file's `if:` guard.
