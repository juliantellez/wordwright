import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BACKSPACE, applyKey, charStates, isComplete, metrics, start, uncorrectedErrors } from "./typing.ts";

function type(target: string, keys: string, startAt = 1000, msPerKey = 100) {
  let state = start(target);
  [...keys].forEach((key, index) => {
    state = applyKey(state, key, startAt + index * msPerKey);
  });
  return state;
}

describe("applyKey", () => {
  it("keeps a wrong character rather than rejecting it", () => {
    const state = type("cat", "cx");
    assert.equal(state.typed, "cx");
    assert.equal(state.keystrokes, 2);
    assert.equal(state.correctKeystrokes, 1);
    assert.deepEqual(state.keyErrors, { a: 1 });
  });

  it("starts the clock on the first keystroke, not before", () => {
    const fresh = start("cat");
    assert.equal(fresh.startedAt, null);
    assert.equal(applyKey(fresh, "c", 5000).startedAt, 5000);
  });

  it("does not restart the clock on later keystrokes", () => {
    assert.equal(type("cat", "cat", 5000).startedAt, 5000);
  });

  it("removes the last character on backspace and reopens a finished attempt", () => {
    const done = type("cat", "cat");
    assert.ok(isComplete(done));
    const undone = applyKey(done, BACKSPACE, 9000);
    assert.equal(undone.typed, "ca");
    assert.equal(undone.finishedAt, null);
    assert.ok(!isComplete(undone));
  });

  it("ignores backspace at the start and returns the same object", () => {
    const fresh = start("cat");
    assert.equal(applyKey(fresh, BACKSPACE, 1), fresh);
  });

  it("ignores keys once the target is finished", () => {
    const done = type("cat", "cat");
    assert.equal(applyKey(done, "s", 9000).typed, "cat");
  });

  it("ignores control sequences", () => {
    const fresh = start("cat");
    assert.equal(applyKey(fresh, "[A", 1).typed, "");
    assert.equal(applyKey(fresh, "", 1).typed, "");
  });

  it("counts a miss against the character that was expected", () => {
    const state = type("hello", "hallo");
    assert.deepEqual(state.keyErrors, { e: 1 });
  });
});

describe("metrics", () => {
  it("is zero before the first keystroke", () => {
    const measured = metrics(start("cat"), 5000);
    assert.equal(measured.grossWpm, 0);
    assert.equal(measured.netWpm, 0);
    assert.equal(measured.accuracy, 1);
  });

  it("counts a word as five characters", () => {
    // 25 characters typed in exactly 30 seconds is five words in half a minute: 10 wpm.
    const target = "a".repeat(25);
    let state = start(target);
    [...target].forEach((key, index) => {
      state = applyKey(state, key, 1000 + (index * 30_000) / 24);
    });
    assert.equal(Math.round(metrics(state, 31_000).grossWpm), 10);
  });

  it("charges one word per uncorrected mistake", () => {
    const clean = type("abcdefghij", "abcdefghij", 0, 600);
    const dirty = type("abcdefghij", "abcdefghix", 0, 600);
    assert.ok(dirty.finishedAt !== null);
    assert.ok(metrics(dirty, 0).netWpm < metrics(clean, 0).netWpm);
  });

  it("never reports a negative speed", () => {
    const state = type("abcdefghij", "xxxxxxxxxx", 0, 600);
    assert.ok(metrics(state, 0).netWpm >= 0);
  });

  it("stops the clock when the target is finished", () => {
    const state = type("cat", "cat", 1000, 100);
    const atFinish = metrics(state, 1200).elapsedMs;
    const muchLater = metrics(state, 900_000).elapsedMs;
    assert.equal(atFinish, muchLater);
  });

  it("reports accuracy over keystrokes, so a correction still costs you", () => {
    let state = type("cat", "cx");
    state = applyKey(state, BACKSPACE, 1300);
    state = applyKey(state, "a", 1400);
    state = applyKey(state, "t", 1500);
    assert.equal(state.typed, "cat");
    assert.equal(uncorrectedErrors(state), 0);
    assert.equal(metrics(state, 1500).accuracy, 3 / 4);
  });
});

describe("charStates", () => {
  it("marks what is right, what is wrong and what is still to come", () => {
    assert.deepEqual(charStates(type("cat", "cx")), ["correct", "wrong", "pending"]);
  });

  it("returns one entry per character of the target", () => {
    assert.equal(charStates(start("a longer sentence")).length, "a longer sentence".length);
  });
});
