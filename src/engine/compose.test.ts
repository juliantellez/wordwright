import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countWords, grade, mechanics, runCheck, usesWord } from "./compose.ts";
import type { ComposeExercise } from "../types.ts";

const exercise: ComposeExercise = {
  id: "test-1",
  level: "intermediate",
  mode: "compose",
  prompt: "Rewrite it in the active voice.",
  starter: "The outage was caused by an expired certificate.",
  checks: [
    {
      kind: "forbids_pattern",
      pattern: "\\b(was|were)\\s+\\w+ed\\b",
      hint: "Still passive. Put the actor in front of the verb.",
    },
    { kind: "max_words", count: 12, hint: "Twelve words or fewer." },
    { kind: "requires_word", word: "certificate", hint: "Keep the certificate." },
  ],
  model: "An expired certificate caused the outage.",
  focus: ["active-voice"],
  lesson: { title: "Active voice names the actor", explain: "Put the actor first." },
};

describe("usesWord", () => {
  it("matches the word on its own", () => {
    assert.ok(usesWord("An expired certificate caused it.", "certificate"));
  });

  it("matches ordinary inflections", () => {
    assert.ok(usesWord("The system elides the vowel.", "elide"));
    assert.ok(usesWord("She was eliding it.", "elide"));
  });

  it("does not match inside another word", () => {
    assert.ok(!usesWord("The certification expired.", "certificate"));
    assert.ok(!usesWord("A catalogue of errors.", "cat"));
  });

  it("ignores case", () => {
    assert.ok(usesWord("Brisk air.", "brisk"));
    assert.ok(usesWord("brisk air.", "Brisk"));
  });
});

describe("countWords", () => {
  it("counts words, not spaces", () => {
    assert.equal(countWords("  one   two three  "), 3);
    assert.equal(countWords(""), 0);
  });
});

describe("runCheck", () => {
  it("passes forbids_pattern when the pattern is absent", () => {
    const check = exercise.checks[0]!;
    assert.ok(runCheck("An expired certificate caused the outage.", check).passed);
    assert.ok(!runCheck("The outage was caused by a certificate.", check).passed);
  });

  it("returns the hint only when it fails", () => {
    const check = exercise.checks[2]!;
    assert.equal(runCheck("A certificate expired.", check).hint, "");
    assert.equal(runCheck("Something expired.", check).hint, "Keep the certificate.");
  });

  it("fails a check whose pattern cannot compile rather than throwing", () => {
    const result = runCheck("anything", { kind: "requires_pattern", pattern: "([", hint: "broken" });
    assert.equal(result.passed, false);
  });

  it("counts words for the length checks", () => {
    assert.ok(runCheck("One two three.", { kind: "max_words", count: 3, hint: "" }).passed);
    assert.ok(!runCheck("One two three four.", { kind: "max_words", count: 3, hint: "" }).passed);
    assert.ok(runCheck("One two three.", { kind: "min_words", count: 3, hint: "" }).passed);
  });
});

describe("mechanics", () => {
  it("is clean for an ordinary sentence", () => {
    assert.deepEqual(mechanics("An expired certificate caused the outage."), []);
  });

  it("catches a missing capital and a missing stop", () => {
    const found = mechanics("an expired certificate caused the outage");
    assert.equal(found.length, 2);
  });

  it("catches a double space and a floating comma", () => {
    assert.ok(mechanics("The queue  drained.").some((finding) => finding.message.includes("One space")));
    assert.ok(mechanics("The queue , drained.").some((finding) => finding.message.includes("no space in front")));
  });

  it("catches both dashes and the spaced hyphen", () => {
    const long = String.fromCharCode(0x2014);
    const short = String.fromCharCode(0x2013);
    assert.ok(mechanics(`One thing${long}then another.`).some((finding) => finding.message.includes("dash")));
    assert.ok(mechanics(`One thing ${short} then another.`).some((finding) => finding.message.includes("dash")));
    assert.ok(mechanics("One thing - then another.").some((finding) => finding.message.includes("dash")));
  });

  it("catches the lowercase pronoun", () => {
    assert.ok(mechanics("Yesterday i shipped it.").some((finding) => finding.message.includes("pronoun I")));
  });

  it("says so when nothing was written", () => {
    assert.equal(mechanics("   ").length, 1);
  });

  it("accepts a closing quotation mark after the stop", () => {
    assert.deepEqual(mechanics('She said, "The train leaves at six."'), []);
  });
});

describe("grade", () => {
  it("scores a good answer clean", () => {
    const result = grade("An expired certificate caused the outage.", exercise);
    assert.equal(result.score, 1);
    assert.equal(result.clean, true);
  });

  it("scores the share of checks that passed", () => {
    // Passive survives, the certificate is kept, and it is short: one of three fails.
    const result = grade("The outage was caused by an expired certificate.", exercise);
    assert.equal(Math.round(result.score * 100), 67);
    assert.equal(result.clean, false);
  });

  it("is not clean when the checks pass but the mechanics do not", () => {
    const result = grade("an expired certificate caused the outage", exercise);
    assert.equal(result.score, 1);
    assert.equal(result.clean, false);
    assert.ok(result.mechanics.length > 0);
  });
});
