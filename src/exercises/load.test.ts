import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { builtinPackDir, focusTags, loadFrom, validateExercise, validatePack } from "./load.ts";

const goodDrill = {
  id: "x-1",
  mode: "drill",
  text: "A sentence to type.",
  focus: ["commas"],
  lesson: { title: "Title", explain: "Explanation." },
};

describe("validateExercise", () => {
  it("accepts a well formed drill", () => {
    const result = validateExercise(goodDrill, "beginner");
    assert.notEqual(typeof result, "string");
    assert.equal((result as { mode: string }).mode, "drill");
  });

  it("inherits the pack level when the exercise does not state one", () => {
    const result = validateExercise(goodDrill, "advanced");
    assert.equal((result as { level: string }).level, "advanced");
  });

  it("rejects a drill with no text", () => {
    assert.match(String(validateExercise({ ...goodDrill, text: "" }, "beginner")), /no text/);
  });

  it("rejects an exercise with no focus tags", () => {
    assert.match(String(validateExercise({ ...goodDrill, focus: [] }, "beginner")), /no focus/);
  });

  it("rejects a lesson without an explanation", () => {
    assert.match(
      String(validateExercise({ ...goodDrill, lesson: { title: "t" } }, "beginner")),
      /no explanation/,
    );
  });

  it("rejects an unknown mode", () => {
    assert.match(String(validateExercise({ ...goodDrill, mode: "quiz" }, "beginner")), /drill or compose/);
  });

  it("rejects a compose check whose pattern does not compile", () => {
    const broken = {
      id: "x-2",
      mode: "compose",
      prompt: "Do the thing.",
      model: "Done.",
      focus: ["a"],
      lesson: { title: "t", explain: "e" },
      checks: [{ kind: "requires_pattern", pattern: "([", hint: "h" }],
    };
    assert.match(String(validateExercise(broken, "beginner")), /usable pattern/);
  });

  it("rejects a vocabulary entry missing its meaning", () => {
    const result = validateExercise({ ...goodDrill, vocabulary: [{ word: "brisk" }] }, "beginner");
    assert.match(String(result), /word and a meaning/);
  });
});

describe("validatePack", () => {
  it("drops a bad exercise and keeps the good ones", () => {
    const result = validatePack(
      { pack: "p", version: 1, level: "beginner", exercises: [goodDrill, { id: "bad" }] },
      "test.json",
    );
    assert.notEqual(typeof result, "string");
    const parsed = result as { pack: { exercises: unknown[] }; problems: unknown[] };
    assert.equal(parsed.pack.exercises.length, 1);
    assert.equal(parsed.problems.length, 1);
  });

  it("reports a duplicate id inside one pack", () => {
    const result = validatePack(
      { pack: "p", version: 1, level: "beginner", exercises: [goodDrill, goodDrill] },
      "test.json",
    );
    const parsed = result as { pack: { exercises: unknown[] }; problems: { reason: string }[] };
    assert.equal(parsed.pack.exercises.length, 1);
    assert.match(parsed.problems[0]!.reason, /duplicate/);
  });

  it("rejects a pack with an unknown level", () => {
    assert.match(String(validatePack({ pack: "p", version: 1, level: "expert", exercises: [] }, "t")), /level must be/);
  });
});

describe("the packs that ship with wordwright", () => {
  const library = loadFrom([builtinPackDir()]);

  it("all load with nothing skipped", () => {
    assert.deepEqual(library.problems, []);
  });

  it("cover all three levels in both modes", () => {
    for (const level of ["beginner", "intermediate", "advanced"] as const) {
      for (const mode of ["drill", "compose"] as const) {
        const count = library.exercises.filter(
          (exercise) => exercise.level === level && exercise.mode === mode,
        ).length;
        assert.ok(count > 0, `no ${level} ${mode} exercises`);
      }
    }
  });

  it("give every exercise a unique id", () => {
    const ids = new Set(library.exercises.map((exercise) => exercise.id));
    assert.equal(ids.size, library.exercises.length);
  });

  it("teach something on every exercise", () => {
    for (const exercise of library.exercises) {
      assert.ok(exercise.lesson.explain.length > 40, `${exercise.id} has a thin lesson`);
      assert.ok(exercise.focus.length > 0);
    }
  });

  it("never use a dash as punctuation in the sentences you type", () => {
    const dashes = new RegExp(`[${String.fromCharCode(0x2014)}${String.fromCharCode(0x2013)}]`);
    for (const exercise of library.exercises) {
      const text = exercise.mode === "drill" ? exercise.text : `${exercise.prompt} ${exercise.model}`;
      assert.ok(!dashes.test(text), `${exercise.id} contains a dash`);
    }
  });

  it("give a compose exercise a model answer that passes its own checks", async () => {
    const { grade } = await import("../engine/compose.ts");
    for (const exercise of library.exercises) {
      if (exercise.mode !== "compose") continue;
      const result = grade(exercise.model, exercise);
      assert.equal(result.score, 1, `${exercise.id}: the model answer fails its own checks`);
      assert.deepEqual(result.mechanics, [], `${exercise.id}: the model answer trips the mechanics`);
    }
  });

  it("expose a tidy set of focus tags", () => {
    const tags = focusTags(library.exercises);
    assert.ok(tags.length > 20);
    for (const tag of tags) assert.match(tag, /^[a-z0-9-]+$/, `${tag} is not kebab case`);
  });
});

describe("loadFrom", () => {
  it("skips a directory that does not exist", () => {
    const library = loadFrom(["/no/such/directory/at/all"]);
    assert.deepEqual(library.exercises, []);
    assert.deepEqual(library.problems, []);
  });
});
