//
// Every screen, as a pure function from state to lines.
//
// No renderer here writes to stdout, reads the clock, or knows a terminal exists. The
// app loop owns all of that. It is the only reason a typing trainer can have tests that
// assert on what you would see.
//

import type { ComposeExercise, DrillExercise, Exercise, Lesson, Level, Mode } from "../types.ts";
import type { Metrics, TypingState } from "../engine/typing.ts";
import { charStates } from "../engine/typing.ts";
import type { ComposeGrade } from "../engine/compose.ts";
import type { Summary, TagMastery } from "../stats.ts";
import { sparkline, worstKeys } from "../stats.ts";
import type { Attempt } from "../types.ts";
import {
  BOLD,
  CYAN,
  DIM,
  GREEN,
  GREY,
  MAGENTA,
  RED,
  RESET,
  UNDERLINE,
  YELLOW,
  bar,
  padTo,
  paint,
  percent,
  row,
  rule,
  seconds,
  width as visibleWidth,
  wrapWithOffsets,
} from "./theme.ts";

export const MAX_WIDTH = 92;

/** The gutter the labelled rows leave on the left, in columns. */
const LESSON_INDENT = 13;

export interface Frame {
  width: number;
  plain: boolean;
}

export function usableWidth(columns: number): number {
  return Math.max(40, Math.min(MAX_WIDTH, columns)) - 4;
}

function header(left: string, right: string, frame: Frame): string[] {
  const gap = Math.max(1, frame.width - visibleWidth(left) - visibleWidth(right));
  return [
    "  " + paint(left, BOLD, frame.plain) + " ".repeat(gap) + paint(right, DIM, frame.plain),
    "  " + paint(rule(frame.width), GREY, frame.plain),
    "",
  ];
}

function footer(keys: string[], frame: Frame): string[] {
  return ["", "  " + paint(keys.join("    "), DIM, frame.plain)];
}

function wrapped(text: string, frame: Frame, indent = 0): string[] {
  return wrapWithOffsets(text, frame.width - indent).map((part) => part.line.trimEnd());
}

/**
 * A bulleted item, wrapped so the continuation hangs under the text rather than under
 * the mark. Wrapping happens before painting, because escape codes are not characters.
 */
function bullet(mark: string, markColour: string, text: string, frame: Frame): string[] {
  const lines = wrapped(text, frame, LESSON_INDENT + 2);
  return lines.map((line, index) =>
    index === 0 ? paint(mark, markColour, frame.plain) + line : "  " + line,
  );
}

// ---------- the drill ----------

export interface DrillView {
  exercise: DrillExercise;
  state: TypingState;
  metrics: Metrics;
  /** One based, for display. */
  position: number;
  total: number;
}

/** A space you typed by mistake, or should have typed, has to be visible as something. */
const VISIBLE_SPACE = "␣";

/**
 * The sentence, a character at a time, showing what you actually typed.
 *
 * Where you were right, the target character stands. Where you were wrong, your
 * character replaces it in red, so you can see the key you hit rather than being told
 * only that something is off. The caret sits on the character you owe next.
 */
export function renderTarget(state: TypingState, frame: Frame): string[] {
  const states = charStates(state);
  const caret = state.typed.length;

  return wrapWithOffsets(state.target, frame.width).map(({ line, start }) => {
    let out = "  ";
    for (let offset = 0; offset < line.length; offset += 1) {
      const index = start + offset;
      const expected = line[offset] ?? "";
      const verdict = states[index] ?? "pending";
      // What you typed wins on screen, because that is the thing you need to see.
      const shown =
        verdict === "wrong"
          ? ((state.typed[index] ?? "") === " " ? VISIBLE_SPACE : state.typed[index] ?? expected)
          : expected;

      if (frame.plain) {
        out += shown;
        continue;
      }
      if (index === caret) {
        out += UNDERLINE + CYAN + expected + RESET;
      } else if (verdict === "correct") {
        out += shown;
      } else if (verdict === "wrong") {
        out += RED + shown + RESET;
      } else {
        out += GREY + expected + RESET;
      }
    }
    return out;
  });
}

export function renderDrill(view: DrillView, frame: Frame): string[] {
  const { metrics: measured } = view;
  const lines: string[] = [];

  lines.push(
    ...header(
      "wordwright",
      `${view.exercise.level}  ·  drill ${view.position}/${view.total}`,
      frame,
    ),
  );

  const stats = [
    paint(`${Math.round(measured.netWpm)} wpm`, BOLD, frame.plain),
    paint(`${percent(measured.accuracy)} accurate`, measured.accuracy >= 0.95 ? GREEN : YELLOW, frame.plain),
    paint(seconds(measured.elapsedMs), DIM, frame.plain),
  ].join("   ");
  const progress = paint(bar(measured.progress, 20), CYAN, frame.plain);
  lines.push("  " + progress + "   " + stats);
  lines.push("");
  lines.push(...renderTarget(view.state, frame));
  lines.push("");
  lines.push("  " + paint(view.exercise.focus.join(" · "), DIM, frame.plain));
  lines.push(...footer(["esc quit", "ctrl+r restart", "tab skip"], frame));
  return lines;
}

// ---------- the lesson card, shown after every exercise ----------

export function renderLesson(lesson: Lesson, exercise: Exercise, frame: Frame): string[] {
  const lines: string[] = [];
  lines.push(...row("lesson", [paint(lesson.title, BOLD, frame.plain)], "", frame.plain));
  lines.push(...row("", wrapped(lesson.explain, frame, LESSON_INDENT), DIM, frame.plain));
  if (exercise.vocabulary && exercise.vocabulary.length > 0) {
    const entries = exercise.vocabulary.map(
      (entry) => paint(padTo(entry.word, 14), MAGENTA, frame.plain) + paint(entry.meaning, DIM, frame.plain),
    );
    lines.push("");
    lines.push(...row("words", entries, "", frame.plain));
  }
  return lines;
}

export interface DrillResultView {
  exercise: DrillExercise;
  metrics: Metrics;
  /** Net speeds from earlier in this session, for the trend. */
  history: number[];
  position: number;
  total: number;
}

export function renderDrillResult(view: DrillResultView, frame: Frame): string[] {
  const lines: string[] = [];
  const { metrics: measured } = view;

  lines.push(...header("wordwright", `${view.exercise.level}  ·  drill ${view.position}/${view.total}`, frame));

  const clean = measured.uncorrected === 0;
  lines.push(
    ...row(
      "result",
      [
        [
          paint(`${Math.round(measured.netWpm)} wpm`, BOLD, frame.plain),
          paint(`${percent(measured.accuracy)} accurate`, clean ? GREEN : YELLOW, frame.plain),
          paint(seconds(measured.elapsedMs), DIM, frame.plain),
          measured.uncorrected > 0
            ? paint(`${measured.uncorrected} left wrong`, RED, frame.plain)
            : paint("clean", GREEN, frame.plain),
        ].join("   "),
      ],
      "",
      frame.plain,
    ),
  );

  if (view.history.length > 1) {
    lines.push(
      ...row("trend", [`${sparkline(view.history)}  ${Math.round(Math.max(...view.history))} wpm best today`], CYAN, frame.plain),
    );
  }

  lines.push("");
  lines.push(...renderLesson(view.exercise.lesson, view.exercise, frame));
  lines.push(...footer(["space next", "r retry", "esc quit"], frame));
  return lines;
}

// ---------- compose ----------

export interface ComposeView {
  exercise: ComposeExercise;
  answer: string;
  position: number;
  total: number;
}

export function renderCompose(view: ComposeView, frame: Frame): string[] {
  const lines: string[] = [];
  lines.push(...header("wordwright", `${view.exercise.level}  ·  compose ${view.position}/${view.total}`, frame));
  lines.push(...row("brief", wrapped(view.exercise.prompt, frame, LESSON_INDENT), BOLD, frame.plain));
  if (view.exercise.starter) {
    lines.push("");
    lines.push(...row("given", wrapped(view.exercise.starter, frame, LESSON_INDENT), YELLOW, frame.plain));
  }
  if (view.exercise.vocabulary && view.exercise.vocabulary.length > 0) {
    lines.push("");
    lines.push(
      ...row(
        "use",
        view.exercise.vocabulary.map(
          (entry) => paint(padTo(entry.word, 14), MAGENTA, frame.plain) + paint(entry.meaning, DIM, frame.plain),
        ),
        "",
        frame.plain,
      ),
    );
  }

  lines.push("");
  const caret = frame.plain ? "" : paint("█", CYAN, false);
  for (const part of wrapWithOffsets(view.answer || "", frame.width - 5)) {
    lines.push("  " + paint("> ", CYAN, frame.plain) + part.line);
  }
  // The caret rides on the last line of the answer.
  const last = lines.pop() ?? "";
  lines.push(last + caret);

  lines.push(...footer(["enter submit", "ctrl+u clear", "esc quit"], frame));
  return lines;
}

export interface GradeView {
  exercise: ComposeExercise;
  grade: ComposeGrade;
  position: number;
  total: number;
}

export function renderGrade(view: GradeView, frame: Frame): string[] {
  const { grade } = view;
  const passed = grade.results.filter((result) => result.passed).length;
  const lines: string[] = [];

  lines.push(...header("wordwright", `${view.exercise.level}  ·  compose ${view.position}/${view.total}`, frame));
  lines.push(
    ...row(
      "score",
      [
        paint(bar(grade.score, 16), grade.clean ? GREEN : YELLOW, frame.plain) +
          `  ${passed}/${grade.results.length} checks` +
          (grade.clean ? paint("   clean", GREEN, frame.plain) : ""),
      ],
      "",
      frame.plain,
    ),
  );
  lines.push("");
  lines.push(...row("yours", wrapped(grade.answer, frame, LESSON_INDENT), "", frame.plain));
  lines.push("");

  const marks = grade.results.flatMap((result) =>
    result.passed
      ? bullet("✓ ", GREEN, describeCheck(result.check), frame)
      : bullet("✗ ", RED, result.hint, frame),
  );
  lines.push(...row("checks", marks, "", frame.plain));

  if (grade.mechanics.length > 0) {
    lines.push("");
    lines.push(
      ...row(
        "mechanics",
        grade.mechanics.flatMap((finding) => wrapped(finding.message, frame, LESSON_INDENT)),
        YELLOW,
        frame.plain,
      ),
    );
  }

  lines.push("");
  lines.push(...row("one way", wrapped(view.exercise.model, frame, LESSON_INDENT), CYAN, frame.plain));
  lines.push("");
  lines.push(...renderLesson(view.exercise.lesson, view.exercise, frame));
  lines.push(...footer(["space next", "r retry", "esc quit"], frame));
  return lines;
}

/** A passed check reads back as the thing you did, not as the rule you were tested on. */
export function describeCheck(check: ComposeGrade["results"][number]["check"]): string {
  switch (check.kind) {
    case "requires_word":
      return `used "${check.word}"`;
    case "requires_pattern":
      return check.hint;
    case "forbids_pattern":
      return check.hint;
    case "min_words":
      return `at least ${check.count} words`;
    case "max_words":
      return `${check.count} words or fewer`;
  }
}

// ---------- the session summary ----------

export interface SessionView {
  level: Level;
  mode: Mode | "mixed";
  attempts: Attempt[];
  /** Tag mastery before the session, so the gains can be shown. */
  before: Map<string, number>;
  after: Map<string, number>;
}

export function renderSessionSummary(view: SessionView, frame: Frame): string[] {
  const drills = view.attempts.filter((attempt) => attempt.mode === "drill");
  const composes = view.attempts.filter((attempt) => attempt.mode === "compose");
  const speeds = drills.map((attempt) => attempt.wpm);
  const lines: string[] = [];

  lines.push(...header("wordwright", "session", frame));

  if (view.attempts.length === 0) {
    lines.push(...row("done", ["Nothing recorded. Come back when you have a minute."], DIM, frame.plain));
    return lines;
  }

  lines.push(
    ...row(
      "worked",
      [
        [
          drills.length > 0 ? `${drills.length} drill${drills.length === 1 ? "" : "s"}` : "",
          composes.length > 0 ? `${composes.length} compose${composes.length === 1 ? "" : "s"}` : "",
        ]
          .filter(Boolean)
          .join("   ·   "),
      ],
      "",
      frame.plain,
    ),
  );

  if (speeds.length > 0) {
    const average = speeds.reduce((sum, value) => sum + value, 0) / speeds.length;
    lines.push(
      ...row(
        "speed",
        [
          `${paint(`${Math.round(average)} wpm`, BOLD, frame.plain)} average, best ${Math.round(Math.max(...speeds))}` +
            (speeds.length > 1 ? `   ${paint(sparkline(speeds), CYAN, frame.plain)}` : ""),
        ],
        "",
        frame.plain,
      ),
    );
    const accuracies = drills.map((attempt) => attempt.accuracy);
    lines.push(
      ...row(
        "accuracy",
        [percent(accuracies.reduce((sum, value) => sum + value, 0) / accuracies.length)],
        "",
        frame.plain,
      ),
    );
  }

  if (composes.length > 0) {
    const scores = composes.map((attempt) => attempt.score ?? 0);
    lines.push(
      ...row("writing", [`${percent(scores.reduce((sum, value) => sum + value, 0) / scores.length)} of checks passed`], "", frame.plain),
    );
  }

  const moved = [...view.after]
    .map(([tag, after]) => ({ tag, delta: after - (view.before.get(tag) ?? 0) }))
    .filter((entry) => Math.abs(entry.delta) > 0.02)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, 5);

  if (moved.length > 0) {
    lines.push("");
    lines.push(
      ...row(
        "moved",
        moved.map(
          (entry) =>
            paint(padTo(entry.tag, 22), entry.delta > 0 ? GREEN : YELLOW, frame.plain) +
            `${entry.delta > 0 ? "+" : ""}${Math.round(entry.delta * 100)}%`,
        ),
        "",
        frame.plain,
      ),
    );
  }

  const misses = worstKeys(view.attempts, 6);
  if (misses.length > 0) {
    lines.push("");
    lines.push(
      ...row("missed", [misses.map((miss) => `${miss.key} ${paint(`x${miss.misses}`, DIM, frame.plain)}`).join("   ")], "", frame.plain),
    );
  }

  lines.push(...footer(["any key to leave"], frame));
  return lines;
}

// ---------- the stats card, printed rather than drawn ----------

export interface StatsView {
  summary: Summary;
  trend: number[];
  tags: TagMastery[];
  attempts: Attempt[];
}

export function renderStats(view: StatsView, frame: Frame): string[] {
  const { summary } = view;
  const lines: string[] = [];

  lines.push(...header("wordwright", "your progress", frame));

  if (summary.attempts === 0) {
    lines.push(...row("start", ["No attempts yet. Run `wordwright` and type one sentence."], DIM, frame.plain));
    return lines;
  }

  lines.push(
    ...row(
      "speed",
      [
        `${paint(`${Math.round(summary.recentWpm)} wpm`, BOLD, frame.plain)} lately, best ${Math.round(summary.bestWpm)}` +
          (view.trend.length > 1 ? `   ${paint(sparkline(view.trend), CYAN, frame.plain)}` : ""),
      ],
      "",
      frame.plain,
    ),
  );
  lines.push(...row("accuracy", [percent(summary.recentAccuracy)], "", frame.plain));
  if (summary.composes > 0) {
    lines.push(...row("writing", [`${percent(summary.recentCompose)} of checks passed`], "", frame.plain));
  }
  lines.push(
    ...row(
      "practice",
      [
        `${summary.attempts} exercises over ${summary.daysPracticed} day${summary.daysPracticed === 1 ? "" : "s"}` +
          (summary.streakDays > 1 ? paint(`   ${summary.streakDays} day streak`, GREEN, frame.plain) : ""),
      ],
      "",
      frame.plain,
    ),
  );

  const weak = view.tags.slice(0, 6);
  if (weak.length > 0) {
    lines.push("");
    lines.push(
      ...row(
        "weakest",
        weak.map(
          (entry) =>
            padTo(entry.tag, 24) +
            paint(bar(entry.mastery, 12), entry.mastery < 0.5 ? RED : YELLOW, frame.plain) +
            paint(`  ${percent(entry.mastery)}`, DIM, frame.plain),
        ),
        "",
        frame.plain,
      ),
    );
  }

  const strong = [...view.tags].reverse().slice(0, 3);
  if (strong.length > 0 && view.tags.length > 6) {
    lines.push("");
    lines.push(
      ...row(
        "strongest",
        strong.map((entry) => padTo(entry.tag, 24) + paint(percent(entry.mastery), GREEN, frame.plain)),
        "",
        frame.plain,
      ),
    );
  }

  const misses = worstKeys(view.attempts, 8);
  if (misses.length > 0) {
    lines.push("");
    lines.push(
      ...row("missed", [misses.map((miss) => `${miss.key} ${paint(`x${miss.misses}`, DIM, frame.plain)}`).join("   ")], "", frame.plain),
    );
  }

  return lines;
}

// ---------- the opening menu ----------

export interface MenuItem {
  label: string;
  detail: string;
}

export function renderMenu(title: string, items: MenuItem[], selected: number, frame: Frame): string[] {
  const lines: string[] = [];
  lines.push(...header("wordwright", title, frame));
  const labelWidth = Math.max(...items.map((item) => item.label.length), 8) + 2;

  items.forEach((item, index) => {
    const chosen = index === selected;
    const marker = chosen ? paint("▸ ", CYAN, frame.plain) : "  ";
    const label = chosen ? paint(padTo(item.label, labelWidth), BOLD, frame.plain) : padTo(item.label, labelWidth);
    lines.push("  " + marker + label + paint(item.detail, DIM, frame.plain));
  });

  lines.push(...footer(["up and down to move", "enter to choose", "esc quit"], frame));
  return lines;
}
