import type { GitClient } from "../git/GitClient.js";
import { slugify } from "./slugify.js";

/** Minimal deps a handle source needs — kept narrow so sources stay decoupled from InitContext. */
export interface HandleResolverDeps {
  git: GitClient;
}

/** One link in the dev-handle fallback chain. Returns a slugified handle or null to fall through. */
export interface HandleSource {
  readonly name: string;
  resolve(deps: HandleResolverDeps): Promise<string | null>;
}

/** Ordered fallback chain (CoR). Earlier sources win; add/reorder here without touching the runner. */
export const HANDLE_SOURCES: HandleSource[] = [
  {
    name: "jejak.handle (repo)",
    resolve: async ({ git }) => slugify(await git.getConfig("jejak.handle")),
  },
  {
    name: "jejak.handle (global)",
    resolve: async ({ git }) => slugify(await git.getConfig("jejak.handle", { global: true })),
  },
  {
    name: "user.name",
    resolve: async ({ git }) => slugify(await git.getConfig("user.name")),
  },
  {
    name: "user.email",
    resolve: async ({ git }) => {
      const email = await git.getConfig("user.email");
      return slugify(email ? email.split("@")[0] : null);
    },
  },
];
