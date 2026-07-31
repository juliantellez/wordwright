import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { MAX_ATTEMPTS, emptyProgress, load, parseProgress, record, save } from "./progress.ts";
import type { Attempt } from "../types.ts";

let directory: string;
let file: string;

beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), "wordwright-"));
  file = path.join(directory, "nested", "progress.json");
});

afterEach(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

function attempt(partial: Partial<Attempt> = {}): Attempt {
  return {
    exerciseId: "b-its",
    level: "beginner",
    mode: "drill",
    at: 1_700_000_000_000,
    wpm: 55,
    accuracy: 0.97,
    focus: ["apostrophe"],
    keyErrors: { a: 1 },
    ...partial,
  };
}

describe("load", () => {
  it("is empty when the file does not exist", () => {
    assert.deepEqual(load(file), emptyProgress());
  });

  it("is empty rather than fatal when the file is corrupt", () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "{ not json");
    assert.deepEqual(load(file), emptyProgress());
  });
});

describe("parseProgress", () => {
  it("drops entries that are not attempts", () => {
    const text = JSON.stringify({ version: 1, attempts: [attempt(), { junk: true }, null] });
    assert.equal(parseProgress(text).attempts.length, 1);
  });

  it("is empty when attempts is not a list", () => {
    assert.deepEqual(parseProgress('{"version":1,"attempts":"nope"}'), emptyProgress());
  });
});

describe("save and record", () => {
  it("creates the directory it needs", () => {
    save({ version: 1, attempts: [attempt()] }, file);
    assert.equal(load(file).attempts.length, 1);
  });

  it("appends rather than replacing", () => {
    record(attempt({ exerciseId: "one" }), file);
    record(attempt({ exerciseId: "two" }), file);
    assert.deepEqual(load(file).attempts.map((entry) => entry.exerciseId), ["one", "two"]);
  });

  it("keeps the newest attempts when the history is capped", () => {
    const attempts = Array.from({ length: MAX_ATTEMPTS + 10 }, (_, index) =>
      attempt({ exerciseId: `e-${index}` }),
    );
    save({ version: 1, attempts }, file);
    const loaded = load(file);
    assert.equal(loaded.attempts.length, MAX_ATTEMPTS);
    assert.equal(loaded.attempts.at(-1)?.exerciseId, `e-${MAX_ATTEMPTS + 9}`);
  });

  it("leaves no temporary file behind", () => {
    save({ version: 1, attempts: [attempt()] }, file);
    assert.ok(!fs.existsSync(`${file}.tmp`));
  });

  it("round trips every field", () => {
    const original = attempt({ mode: "compose", score: 0.75, wpm: 0 });
    save({ version: 1, attempts: [original] }, file);
    assert.deepEqual(load(file).attempts[0], original);
  });
});
