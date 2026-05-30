import type { Command } from "commander";
import { notImplemented } from "../stub.js";
import type { CommandModule } from "./CommandModule.js";

/** Spec for a not-yet-implemented verb, kept in its own data so cli.ts stays thin. */
export interface StubSpec {
  name: string;
  description: string;
  item: number;
  lldSection?: string;
  /** Add args/options to the command before its stub action. */
  configure?: (cmd: Command) => void;
}

/** Build a {@link CommandModule} that registers a stub verb (throws `notImplemented`). */
export function makeStubCommand(spec: StubSpec): CommandModule {
  return {
    name: spec.name,
    register(program) {
      const cmd = program.command(spec.name).description(spec.description);
      spec.configure?.(cmd);
      cmd.action(() => notImplemented(spec.item, spec.lldSection));
    },
  };
}
