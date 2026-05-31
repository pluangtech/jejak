import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SingleFlight } from "../../src/capture/SingleFlight.js";

let home: string;
let sf: SingleFlight;
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), "jejak-sf-home-"));
  sf = new SingleFlight("/repo", home);
});
afterEach(() => rmSync(home, { recursive: true, force: true }));

describe("SingleFlight", () => {
  it("runs the task once when uncontended", async () => {
    let runs = 0;
    await sf.run("s1", async () => {
      runs += 1;
    });
    expect(runs).toBe(1);
  });

  it("coalesces a concurrent request into a single rerun (flag-and-rerun)", async () => {
    let runs = 0;
    let reentered = false;
    await sf.run("s1", async () => {
      runs += 1;
      if (!reentered) {
        reentered = true;
        // a second request arrives while the holder is mid-run → should set the rerun marker
        await sf.run("s1", async () => {
          runs += 1; // must NOT run inline (lock held)
        });
      }
    });
    // holder ran, saw the rerun marker, and reran once → exactly 2 runs total, no pile-up
    expect(runs).toBe(2);
  });
});
