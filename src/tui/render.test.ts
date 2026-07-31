import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  renderCompose,
  renderDrill,
  renderGrade,
  renderMenu,
  renderSessionSummary,
  renderStats,
  renderTarget,
  usableWidth,
} from "./render.ts";
import { applyKey, metrics, start } from "../engine/typing.ts";
import { grade } from "../engine/compose.ts";
import { summarise, tagReport, wpmTrend } from "../stats.ts";
import { width, wrapWithOffsets } from "./theme.ts";
import type { Attempt, ComposeExercise, DrillExercise } from "../types.ts";

const frame = { width: 76, plain: true };

const drillExercise: DrillExercise = {
  id: "d-1",
  level: "intermediate",
  mode: "drill",
  text: "The deploy finished at two; nobody noticed until the morning.",
  focus: ["semicolon", "clause-joining"],
  lesson: { title: "A semicolon joins two whole sentences", explain: "Both halves stand alone." },
};

const composeExercise: ComposeExercise = {
  id: "c-1",
  level: "advanced",
  mode: "compose",
  prompt: "Rewrite it without there are.",
  starter: "There are three services that write to the table.",
  checks: [{ kind: "forbids_pattern", pattern: "there are", hint: "Move the subject to the front." }],
  model: "Three services write to the table.",
  focus: ["expletive-construction"],
  vocabulary: [{ word: "salient", meaning: "standing out" }],
  lesson: { title: "There is delays the sentence", explain: "Move the subject in front of the verb." },
};

function typed(target: string, keys: string) {
  let state = start(target);
  [...keys].forEach((key, index) => {
    state = applyKey(state, key, 1000 + index * 100);
  });
  return state;
}

describe("wrapWithOffsets", () => {
  it("never exceeds the width", () => {
    for (const part of wrapWithOffsets(drillExercise.text, 20)) {
      assert.ok(part.line.length <= 20, `"${part.line}" is too long`);
    }
  });

  it("reports an offset that indexes back into the original text", () => {
    const text = drillExercise.text;
    for (const part of wrapWithOffsets(text, 20)) {
      assert.equal(text.slice(part.start, part.start + part.line.length), part.line);
    }
  });

  it("covers the whole string exactly once", () => {
    const text = drillExercise.text;
    assert.equal(wrapWithOffsets(text, 17).map((part) => part.line).join(""), text);
  });

  it("does not break a word in half", () => {
    const parts = wrapWithOffsets("alpha bravo charlie delta", 12);
    assert.ok(parts.every((part) => !part.line.startsWith(" ")));
  });
});

describe("renderTarget", () => {
  it("shows the sentence unchanged when colour is off", () => {
    const lines = renderTarget(typed(drillExercise.text, "The dep"), frame);
    assert.equal(lines.join("").replace(/\s+/g, " ").trim(), drillExercise.text);
  });

  it("colours the wrong character and leaves the correct ones alone", () => {
    const coloured = renderTarget(typed("cat", "cx"), { width: 40, plain: false });
    assert.match(coloured[0]!, /31m/);
  });

  it("shows the character you typed rather than the one you owed", () => {
    const line = renderTarget(typed("cat", "cx"), { width: 40, plain: true })[0]!;
    assert.equal(line.trim(), "cxt");
  });

  it("makes a space you typed by mistake visible", () => {
    const line = renderTarget(typed("cat", "c "), { width: 40, plain: true })[0]!;
    assert.equal(line.trim(), "c␣t");
  });

  it("leaves the sentence intact where you have not typed yet", () => {
    const line = renderTarget(typed("cat", ""), { width: 40, plain: true })[0]!;
    assert.equal(line.trim(), "cat");
  });
});

describe("renderDrill", () => {
  const view = {
    exercise: drillExercise,
    state: typed(drillExercise.text, "The deploy"),
    metrics: metrics(typed(drillExercise.text, "The deploy"), 3000),
    position: 3,
    total: 8,
  };
  const lines = renderDrill(view, frame);

  it("says where you are in the session", () => {
    assert.match(lines.join("\n"), /drill 3\/8/);
  });

  it("shows the speed, the accuracy and the focus tags", () => {
    const text = lines.join("\n");
    assert.match(text, /wpm/);
    assert.match(text, /accurate/);
    assert.match(text, /semicolon · clause-joining/);
  });

  it("keeps every line inside the frame", () => {
    for (const line of lines) assert.ok(width(line) <= frame.width + 4, `too wide: ${line}`);
  });
});

describe("renderCompose", () => {
  it("shows the brief, the starter and what you have written", () => {
    const text = renderCompose(
      { exercise: composeExercise, answer: "Three services write", position: 1, total: 4 },
      frame,
    ).join("\n");
    assert.match(text, /Rewrite it without there are/);
    assert.match(text, /There are three services/);
    assert.match(text, /Three services write/);
  });

  it("shows the vocabulary you are asked to use", () => {
    const text = renderCompose({ exercise: composeExercise, answer: "", position: 1, total: 4 }, frame).join("\n");
    assert.match(text, /salient/);
  });

  it("renders an empty answer without losing the prompt line", () => {
    const lines = renderCompose({ exercise: composeExercise, answer: "", position: 1, total: 4 }, frame);
    assert.ok(lines.some((line) => line.trim().startsWith(">")));
  });
});

describe("renderGrade", () => {
  it("marks a passing check and reports the score", () => {
    const text = renderGrade(
      {
        exercise: composeExercise,
        grade: grade("Three services write to the table.", composeExercise),
        position: 1,
        total: 4,
      },
      frame,
    ).join("\n");
    assert.match(text, /1\/1 checks/);
    assert.match(text, /✓/);
    assert.match(text, /clean/);
  });

  it("shows the hint rather than the rule when a check fails", () => {
    const text = renderGrade(
      {
        exercise: composeExercise,
        grade: grade("There are three services that write.", composeExercise),
        position: 1,
        total: 4,
      },
      frame,
    ).join("\n");
    assert.match(text, /Move the subject to the front/);
    assert.match(text, /✗/);
  });

  it("always offers one way of doing it and the lesson", () => {
    const text = renderGrade(
      { exercise: composeExercise, grade: grade("nope", composeExercise), position: 1, total: 4 },
      frame,
    ).join("\n");
    assert.match(text, /Three services write to the table\./);
    assert.match(text, /There is delays the sentence/);
  });
});

describe("renderSessionSummary", () => {
  const attempts: Attempt[] = [
    {
      exerciseId: "d-1",
      level: "intermediate",
      mode: "drill",
      at: 1,
      wpm: 52,
      accuracy: 0.97,
      focus: ["semicolon"],
      keyErrors: { ";": 2 },
    },
    {
      exerciseId: "c-1",
      level: "advanced",
      mode: "compose",
      at: 2,
      wpm: 0,
      accuracy: 1,
      score: 0.5,
      focus: ["expletive-construction"],
      keyErrors: {},
    },
  ];

  it("counts both kinds of work and shows what moved", () => {
    const text = renderSessionSummary(
      {
        level: "intermediate",
        mode: "mixed",
        attempts,
        before: new Map([["semicolon", 0.4]]),
        after: new Map([["semicolon", 0.8]]),
      },
      frame,
    ).join("\n");
    assert.match(text, /1 drill/);
    assert.match(text, /1 compose/);
    assert.match(text, /semicolon\s+\+40%/);
    assert.match(text, /; x2/);
  });

  it("says something kind rather than nothing when you quit early", () => {
    const text = renderSessionSummary(
      { level: "beginner", mode: "drill", attempts: [], before: new Map(), after: new Map() },
      frame,
    ).join("\n");
    assert.match(text, /Nothing recorded/);
  });
});

describe("renderStats", () => {
  it("invites you to start when there is no history", () => {
    const text = renderStats(
      { summary: summarise([], 0), trend: [], tags: [], attempts: [] },
      frame,
    ).join("\n");
    assert.match(text, /No attempts yet/);
  });

  it("reports speed, practice and the weakest tags", () => {
    const attempts: Attempt[] = Array.from({ length: 4 }, (_, index) => ({
      exerciseId: `d-${index}`,
      level: "intermediate",
      mode: "drill",
      at: index * 1000,
      wpm: 40 + index,
      accuracy: 0.95,
      focus: index === 0 ? ["semicolon"] : ["commas"],
      keyErrors: { ";": index },
    }));
    const text = renderStats(
      {
        summary: summarise(attempts, 4000),
        trend: wpmTrend(attempts),
        tags: tagReport(attempts),
        attempts,
      },
      frame,
    ).join("\n");
    assert.match(text, /wpm/);
    assert.match(text, /4 exercises/);
    assert.match(text, /semicolon/);
  });
});

describe("renderMenu", () => {
  it("marks the selected row", () => {
    const lines = renderMenu(
      "pick a level",
      [
        { label: "beginner", detail: "the basics" },
        { label: "advanced", detail: "the hard part" },
      ],
      1,
      frame,
    );
    assert.ok(lines.some((line) => line.includes("▸ advanced")));
  });
});

describe("usableWidth", () => {
  it("never goes below a readable floor", () => {
    assert.ok(usableWidth(10) >= 36);
  });

  it("caps on a wide terminal so the text stays readable", () => {
    assert.equal(usableWidth(400), usableWidth(200));
  });
});
