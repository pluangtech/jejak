import { DocsService } from "../src/docs/DocsService.js";
import { createDocsDeps, docsPaths } from "../src/docs/createDocsDeps.js";

/** `pnpm docs:gen` — regenerate the auto-generated docs from the live CLI. */
function main(): void {
  const deps = createDocsDeps();
  const service = new DocsService(deps);

  const target = docsPaths.commandsFile(deps.repoRoot);
  deps.fs.writeFile(target, service.generateReference());
  console.log(`docs:gen wrote ${target}`);
}

main();
