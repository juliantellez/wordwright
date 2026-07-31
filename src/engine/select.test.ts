import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { attemptQuality, lastSeen, masteryByTag, pickSession, priority, weakestTags } from "./select.ts";
import type { Attempt, DrillExercise } from "../types.ts";

const HOUR = 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

function drill(id: string, focus: string[]): DrillExercise {
  return {
    id,
    level: "intermediate",
    mode: "drill",
    text: `sentence ${id}`,
    focus,
    lesson: { title: "t", explain: "e" },
  };
}

function attempt(partial: Partial<Attempt> & { focus: string[] }): Attempt {
  return {
    exerciseId: "x",
    level: "intermediate",
    mode: "drill",
    at: NOW - 48 * HOUR,
    wpm: 60,
    accuracy: 1,
    keyErrors: {},
    ...partial,
  };
}

describe("attemptQuality", () => {
  it("rewards accuracy and speed together for a drill", () => {
    const perfect = attemptQuality(attempt({ focus: ["a"], wpm: 60, accuracy: 1 }));
    const sloppy = attemptQuality(attempt({ focus: ["a"], wpm: 60, accuracy: 0.5 }));
    assert.ok(perfect > sloppy);
    assert.equal(perfect, 1);
  });

  it("caps speed so a very fast run cannot hide poor accuracy", () => {
    const quality = attemptQuality(attempt({ focus: ["a"], wpm: 400, accuracy: 0 }));
    assert.ok(quality <= 0.4);
  });

  it("scores a compose attempt on its checks", () => {
    const quality = attemptQuality(attempt({ focus: ["a"], mode: "compose", wpm: 0, accuracy: 1, score: 0.5 }));
    assert.equal(Math.round(quality * 100), 65);
  });
});

describe("masteryByTag", () => {
  it("has no opinion about a tag you have never practised", () => {
    assert.equal(masteryByTag([]).get("semicolon"), undefined);
  });

  it("weighs the most recent attempt highest", () => {
    const improving = masteryByTag([
      attempt({ focus: ["semicolon"], at: NOW - 3 * HOUR, accuracy: 0.2, wpm: 10 }),
      attempt({ focus: ["semicolon"], at: NOW - 1 * HOUR, accuracy: 1, wpm: 60 }),
    ]);
    const declining = masteryByTag([
      attempt({ focus: ["semicolon"], at: NOW - 3 * HOUR, accuracy: 1, wpm: 60 }),
      attempt({ focus: ["semicolon"], at: NOW - 1 * HOUR, accuracy: 0.2, wpm: 10 }),
    ]);
    assert.ok(improving.get("semicolon")! > declining.get("semicolon")!);
  });

  it("orders the weakest tags first", () => {
    const weak = weakestTags([
      attempt({ focus: ["strong"], accuracy: 1, wpm: 60 }),
      attempt({ focus: ["weak"], accuracy: 0.3, wpm: 10 }),
    ]);
    assert.equal(weak[0]?.tag, "weak");
  });
});

describe("priority", () => {
  it("puts an untouched exercise above a mastered one", () => {
    const mastery = new Map([["semicolon", 0.95]]);
    const untouched = priority(drill("new", ["colon"]), mastery, undefined, NOW);
    const mastered = priority(drill("old", ["semicolon"]), mastery, NOW - 72 * HOUR, NOW);
    assert.ok(untouched > mastered);
  });

  it("pushes down an exercise you did in the last hour", () => {
    const mastery = new Map([["semicolon", 0.2]]);
    const justDone = priority(drill("a", ["semicolon"]), mastery, NOW - 10 * 60 * 1000, NOW);
    const doneLastWeek = priority(drill("b", ["semicolon"]), mastery, NOW - 168 * HOUR, NOW);
    assert.ok(justDone < doneLastWeek);
  });
});

describe("pickSession", () => {
  const exercises = [
    drill("weak-1", ["semicolon"]),
    drill("strong-1", ["commas"]),
    drill("strong-2", ["commas"]),
  ];
  const history = [
    attempt({ exerciseId: "weak-1", focus: ["semicolon"], accuracy: 0.2, wpm: 10 }),
    attempt({ exerciseId: "strong-1", focus: ["commas"], accuracy: 1, wpm: 70 }),
    attempt({ exerciseId: "strong-2", focus: ["commas"], accuracy: 1, wpm: 70 }),
  ];

  it("leads with the weakest tag", () => {
    const picked = pickSession(exercises, history, { count: 3, now: NOW, random: () => 0 });
    assert.equal(picked[0]?.id, "weak-1");
  });

  it("returns at most the count asked for", () => {
    assert.equal(pickSession(exercises, history, { count: 2, now: NOW, random: () => 0 }).length, 2);
  });

  it("returns everything available when the library is smaller than the count", () => {
    assert.equal(pickSession(exercises, history, { count: 50, now: NOW, random: () => 0 }).length, 3);
  });

  it("filters by level and by mode", () => {
    const advanced = { ...drill("adv", ["rhythm"]), level: "advanced" as const };
    const picked = pickSession([...exercises, advanced], [], {
      count: 10,
      level: "advanced",
      now: NOW,
      random: () => 0,
    });
    assert.deepEqual(picked.map((exercise) => exercise.id), ["adv"]);
  });

  it("returns nothing when no exercise matches", () => {
    assert.deepEqual(pickSession(exercises, [], { count: 5, mode: "compose", now: NOW, random: () => 0 }), []);
  });
});

describe("lastSeen", () => {
  it("keeps the most recent attempt per exercise", () => {
    const seen = lastSeen([
      attempt({ exerciseId: "a", focus: ["x"], at: NOW - 5 * HOUR }),
      attempt({ exerciseId: "a", focus: ["x"], at: NOW - 1 * HOUR }),
    ]);
    assert.equal(seen.get("a"), NOW - HOUR);
  });
});
