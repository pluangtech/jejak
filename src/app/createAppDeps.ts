import { RealGitClient } from "../git/GitClient.js";
import { InquirerPrompter } from "../prompt/InquirerPrompter.js";
import { type AppDeps, ConsoleReporter } from "./AppDeps.js";

/** Build the default production dependency set (real git, interactive prompts, console output). */
export function createAppDeps(): AppDeps {
  return {
    git: new RealGitClient(process.cwd()),
    prompter: new InquirerPrompter(),
    reporter: new ConsoleReporter(),
  };
}
