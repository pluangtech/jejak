import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  dts: true,
  sourcemap: true,
  clean: true,
  // Make the published bin (`package.json` "bin": dist/cli.js) directly executable so
  // `pnpm link --global` / `npx jejak` work without a wrapper.
  banner: { js: "#!/usr/bin/env node" },
});
