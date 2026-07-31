//
// The architecture document, as assertions.
//
// docs/ARCHITECTURE.md claims the core is pure and that three files own everything
// impure. A claim like that rots the first time somebody reaches for `fs` in a renderer
// because it was quicker, and nobody notices because everything still works.
//
// So the claims are tested. Move something across the line and this fails, which is the
// prompt to either move it back or edit the document.
//

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

const SOURCE_DIR = import.meta.dirname;

/** Every source file, tests excluded, as a path relative to src/. */
function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
        found.push(path.relative(SOURCE_DIR, full));
      }
    }
  };
  walk(SOURCE_DIR);
  return found.sort();
}

function read(relative: string): string {
  return fs.readFileSync(path.join(SOURCE_DIR, relative), "utf8");
}

/** The files allowed to know a machine exists. Keep this list short. */
const EDGE = ["cli.ts", "exercises/load.ts", "store/progress.ts", "tui/app.ts"];

/** The files allowed to reach for the `process` global. */
const TOUCHES_PROCESS = ["cli.ts", "tui/app.ts", "exercises/load.ts"];

/** The files allowed to read the clock rather than being handed the time. */
const READS_CLOCK = ["cli.ts", "tui/app.ts", "engine/select.ts"];

describe("the core is pure", () => {
  const files = sourceFiles();

  it("finds the source it is meant to be checking", () => {
    assert.ok(files.length >= 10, `only found ${files.length} source files`);
    assert.ok(files.includes("engine/typing.ts"));
    assert.ok(files.includes("tui/render.ts"));
  });

  it("keeps node imports out of everything but the edge", () => {
    for (const file of files) {
      const imports = [...read(file).matchAll(/from\s+"(node:[^"]+)"/g)].map((match) => match[1]);
      if (EDGE.includes(file)) continue;
      assert.deepEqual(imports, [], `${file} imports ${imports.join(", ")}`);
    }
  });

  it("keeps the process global out of everything but the edge", () => {
    for (const file of files) {
      if (TOUCHES_PROCESS.includes(file)) continue;
      assert.ok(!/\bprocess\./.test(read(file)), `${file} reaches for the process global`);
    }
  });

  it("hands the time in rather than reading the clock", () => {
    for (const file of files) {
      if (READS_CLOCK.includes(file)) continue;
      assert.ok(!/Date\.now\(\)/.test(read(file)), `${file} reads the clock`);
    }
  });

  it("keeps the renderers free of both", () => {
    for (const file of ["tui/render.ts", "tui/theme.ts", "tui/keys.ts"]) {
      const source = read(file);
      assert.ok(!/\bprocess\./.test(source), `${file} touches process`);
      assert.ok(!/from\s+"node:/.test(source), `${file} imports a node module`);
      assert.ok(!/Date\.now\(\)/.test(source), `${file} reads the clock`);
    }
  });
});

describe("the architecture document", () => {
  const document = fs.readFileSync(path.join(SOURCE_DIR, "..", "docs", "ARCHITECTURE.md"), "utf8");

  it("exists and names this test", () => {
    assert.match(document, /boundaries\.test\.ts/);
  });

  it("names every source file that sits at the edge", () => {
    for (const file of EDGE) assert.match(document, new RegExp(file.replace(/\//g, "\\/")));
  });

  it("carries diagrams rather than only prose", () => {
    const diagrams = [...document.matchAll(/```mermaid/g)].length;
    assert.ok(diagrams >= 5, `only ${diagrams} diagrams`);
  });
});
