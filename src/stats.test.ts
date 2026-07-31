import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dayKey, levelBreakdown, sparkline, streak, summarise, tagReport, wpmTrend, worstKeys } from "./stats.ts";
import type { Attempt } from "./types.ts";

const DAY = 24 * 60 * 60 * 1000;
// Midday, so a test never straddles a local midnight.
const NOW = new Date(2026, 6, 31, 12, 0, 0).getTime();

function attempt(partial: Partial<Attempt> = {}): Attempt {
  return {
    exerciseId: "x",
    level: "intermediate",
    mode: "drill",
    at: NOW,
    wpm: 50,
    accuracy: 0.98,
    focus: ["commas"],
    keyErrors: {},
    ...partial,
  };
}

describe("streak", () => {
  it("is zero with no history", () => {
    assert.equal(streak([], NOW), 0);
  });

  it("counts consecutive days ending today", () => {
    const attempts = [attempt({ at: NOW }), attempt({ at: NOW - DAY }), attempt({ at: NOW - 2 * DAY })];
    assert.equal(streak(attempts, NOW), 3);
  });

  it("still counts a streak that ended yesterday", () => {
    assert.equal(streak([attempt({ at: NOW - DAY }), attempt({ at: NOW - 2 * DAY })], NOW), 2);
  });

  it("breaks when a day is missed", () => {
    assert.equal(streak([attempt({ at: NOW }), attempt({ at: NOW - 3 * DAY })], NOW), 1);
  });

  it("counts several attempts on one day once", () => {
    assert.equal(streak([attempt({ at: NOW }), attempt({ at: NOW - 60_000 })], NOW), 1);
  });

  it("is zero when the last practice was days ago", () => {
    assert.equal(streak([attempt({ at: NOW - 5 * DAY })], NOW), 0);
  });
});

describe("summarise", () => {
  it("reports zeroes rather than throwing on an empty history", () => {
    const summary = summarise([], NOW);
    assert.equal(summary.attempts, 0);
    assert.equal(summary.bestWpm, 0);
    assert.equal(summary.recentWpm, 0);
  });

  it("takes recent speed from the last ten drills and the best from all of them", () => {
    const old = Array.from({ length: 10 }, (_, index) => attempt({ at: NOW - (20 - index) * DAY, wpm: 90 }));
    const recent = Array.from({ length: 10 }, (_, index) => attempt({ at: NOW - (10 - index) * DAY, wpm: 40 }));
    const summary = summarise([...old, ...recent], NOW);
    assert.equal(summary.bestWpm, 90);
    assert.equal(summary.recentWpm, 40);
  });

  it("keeps compose out of the speed numbers", () => {
    const summary = summarise([attempt({ wpm: 60 }), attempt({ mode: "compose", wpm: 0, score: 0.5 })], NOW);
    assert.equal(summary.recentWpm, 60);
    assert.equal(summary.drills, 1);
    assert.equal(summary.composes, 1);
    assert.equal(summary.recentCompose, 0.5);
  });
});

describe("wpmTrend", () => {
  it("is oldest first and drills only", () => {
    const trend = wpmTrend([
      attempt({ at: NOW, wpm: 3 }),
      attempt({ at: NOW - DAY, wpm: 2 }),
      attempt({ at: NOW - 2 * DAY, wpm: 1 }),
      attempt({ mode: "compose", wpm: 0 }),
    ]);
    assert.deepEqual(trend, [1, 2, 3]);
  });
});

describe("sparkline", () => {
  it("is empty for no values", () => {
    assert.equal(sparkline([]), "");
  });

  it("scales between the lowest and highest value", () => {
    const line = sparkline([10, 20, 30]);
    assert.equal(line.length, 3);
    assert.equal(line[0], "▁");
    assert.equal(line[2], "█");
  });

  it("draws a flat line when every value matches", () => {
    assert.equal(new Set(sparkline([40, 40, 40])).size, 1);
  });
});

describe("worstKeys", () => {
  it("adds misses across attempts and names the space", () => {
    const worst = worstKeys([
      attempt({ keyErrors: { a: 2, " ": 1 } }),
      attempt({ keyErrors: { a: 1, ";": 5 } }),
    ]);
    assert.deepEqual(worst.slice(0, 2), [
      { key: ";", misses: 5 },
      { key: "a", misses: 3 },
    ]);
    assert.ok(worst.some((miss) => miss.key === "space"));
  });
});

describe("tagReport", () => {
  it("puts the weakest tag first and counts attempts per tag", () => {
    const report = tagReport([
      attempt({ focus: ["semicolon"], accuracy: 0.4, wpm: 10 }),
      attempt({ focus: ["commas"], accuracy: 1, wpm: 70 }),
      attempt({ focus: ["commas"], accuracy: 1, wpm: 70 }),
    ]);
    assert.equal(report[0]?.tag, "semicolon");
    assert.equal(report.find((entry) => entry.tag === "commas")?.attempts, 2);
  });
});

describe("levelBreakdown", () => {
  it("reports all three levels even when one is untouched", () => {
    const rows = levelBreakdown([attempt({ level: "advanced", wpm: 40 })]);
    assert.equal(rows.length, 3);
    assert.equal(rows.find((row) => row.level === "advanced")?.wpm, 40);
    assert.equal(rows.find((row) => row.level === "beginner")?.attempts, 0);
  });
});

describe("dayKey", () => {
  it("is stable across times on the same day", () => {
    assert.equal(dayKey(NOW), dayKey(NOW + 60_000));
  });
});
