import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isQuit, parseKeys } from "./keys.ts";

const ESCAPE = String.fromCharCode(27);

describe("parseKeys", () => {
  it("splits a fast burst into one key per character", () => {
    const keys = parseKeys("cat");
    assert.deepEqual(keys.map((key) => key.char), ["c", "a", "t"]);
    assert.ok(keys.every((key) => key.name === "char"));
  });

  it("reads an arrow key as one key, not as a bracket", () => {
    assert.deepEqual(parseKeys(`${ESCAPE}[A`), [{ name: "up", char: "" }]);
    assert.deepEqual(parseKeys(`${ESCAPE}[B`), [{ name: "down", char: "" }]);
  });

  it("reads an arrow key that arrives in the same chunk as typing", () => {
    const keys = parseKeys(`a${ESCAPE}[Bb`);
    assert.deepEqual(keys.map((key) => key.name), ["char", "down", "char"]);
  });

  it("reads a bare escape as quit", () => {
    assert.deepEqual(parseKeys(ESCAPE), [{ name: "escape", char: "" }]);
  });

  it("names the editing keys", () => {
    assert.equal(parseKeys("\r")[0]?.name, "enter");
    assert.equal(parseKeys("\t")[0]?.name, "tab");
    assert.equal(parseKeys(String.fromCharCode(127))[0]?.name, "backspace");
    assert.equal(parseKeys(String.fromCharCode(3))[0]?.name, "interrupt");
    assert.equal(parseKeys(String.fromCharCode(21))[0]?.name, "clear-line");
    assert.equal(parseKeys(String.fromCharCode(18))[0]?.name, "restart");
  });

  it("keeps the space as a typed character", () => {
    assert.deepEqual(parseKeys(" "), [{ name: "char", char: " " }]);
  });

  it("does not turn an unknown control code into typing", () => {
    assert.equal(parseKeys(String.fromCharCode(7))[0]?.name, "unknown");
  });
});

describe("isQuit", () => {
  it("covers escape and control C", () => {
    assert.ok(isQuit({ name: "escape", char: "" }));
    assert.ok(isQuit({ name: "interrupt", char: "" }));
    assert.ok(!isQuit({ name: "char", char: "q" }));
  });
});
