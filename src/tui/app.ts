//
// The interactive loop: the only file that knows a terminal exists.
//
// It owns the alternate screen, raw mode and the clock, and it calls into the pure
// renderers for every frame. Cleanup is registered before the screen is entered, so a
// crash or a control C still hands your terminal back in the state it was lent.
//

import type { Attempt, ComposeExercise, DrillExercise, Exercise, Level, Mode } from "../types.ts";
import { applyKey, isComplete, metrics, start } from "../engine/typing.ts";
import type { TypingState } from "../engine/typing.ts";
import { grade } from "../engine/compose.ts";
import { masteryByTag, pickSession } from "../engine/select.ts";
import { record } from "../store/progress.ts";
import { load as loadProgress } from "../store/progress.ts";
import {
  renderCompose,
  renderDrill,
  renderDrillResult,
  renderGrade,
  renderMenu,
  renderSessionSummary,
  usableWidth,
} from "./render.ts";
import type { Frame } from "./render.ts";
import type { Key } from "./keys.ts";
import { isQuit, parseKeys } from "./keys.ts";
import { ALT_SCREEN_OFF, ALT_SCREEN_ON, CURSOR_HIDE, CURSOR_SHOW, ESC } from "./theme.ts";

/** How often the screen redraws while you type, so the speed reads live. */
const TICK_MS = 120;

class Terminal {
  private pending: Key[] = [];
  private waiting: ((key: Key) => void) | null = null;
  private onData = (chunk: Buffer | string): void => {
    for (const key of parseKeys(chunk.toString("utf8"))) {
      const resolve = this.waiting;
      if (resolve) {
        this.waiting = null;
        resolve(key);
      } else {
        this.pending.push(key);
      }
    }
  };
  private restored = false;

  private readonly plain: boolean;

  constructor(plain: boolean) {
    this.plain = plain;
  }

  enter(): void {
    process.on("exit", this.restore);
    process.on("SIGINT", this.exitNow);
    process.on("SIGTERM", this.exitNow);
    if (process.stdin.isTTY) process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", this.onData);
    if (!this.plain) process.stdout.write(ALT_SCREEN_ON + CURSOR_HIDE);
  }

  private restore = (): void => {
    if (this.restored) return;
    this.restored = true;
    process.stdin.off("data", this.onData);
    if (process.stdin.isTTY) process.stdin.setRawMode(false);
    process.stdin.pause();
    if (!this.plain) process.stdout.write(CURSOR_SHOW + ALT_SCREEN_OFF);
  };

  private exitNow = (): void => {
    this.restore();
    process.exit(130);
  };

  leave(): void {
    this.restore();
    process.off("exit", this.restore);
    process.off("SIGINT", this.exitNow);
    process.off("SIGTERM", this.exitNow);
  }

  get columns(): number {
    return process.stdout.columns ?? 80;
  }

  /** Repaint from the top rather than clearing first, which is what stops the flicker. */
  draw(lines: string[]): void {
    const body = lines.map((line) => line + ESC + "K").join("\n");
    process.stdout.write(`${ESC}H${body}\n${ESC}J`);
  }

  nextKey(): Promise<Key> {
    const ready = this.pending.shift();
    if (ready) return Promise.resolve(ready);
    return new Promise((resolve) => {
      this.waiting = resolve;
    });
  }
}

export interface AppOptions {
  exercises: Exercise[];
  level?: Level;
  mode?: Mode;
  count: number;
  plain: boolean;
}

interface Choice<T> {
  value: T;
  label: string;
  detail: string;
}

async function choose<T>(
  terminal: Terminal,
  frame: Frame,
  title: string,
  choices: Choice<T>[],
): Promise<T | null> {
  let selected = 0;
  for (;;) {
    terminal.draw(renderMenu(title, choices, selected, frame));
    const key = await terminal.nextKey();
    if (isQuit(key)) return null;
    if (key.name === "up") selected = (selected - 1 + choices.length) % choices.length;
    else if (key.name === "down") selected = (selected + 1) % choices.length;
    else if (key.name === "enter") return choices[selected]?.value ?? null;
    else if (key.name === "char" && /[1-9]/.test(key.char)) {
      const index = Number(key.char) - 1;
      if (index < choices.length) return choices[index]?.value ?? null;
    }
  }
}

type Outcome = "next" | "retry" | "quit";

/** Runs one drill to completion and returns the attempt, or null when you walked away. */
async function runDrill(
  terminal: Terminal,
  frame: Frame,
  exercise: DrillExercise,
  position: number,
  total: number,
  history: number[],
): Promise<{ attempt: Attempt | null; outcome: Outcome }> {
  let state: TypingState = start(exercise.text);

  const paint = (): void => {
    terminal.draw(
      renderDrill({ exercise, state, metrics: metrics(state, Date.now()), position, total }, frame),
    );
  };

  paint();
  const ticker = setInterval(() => {
    if (state.startedAt !== null && !isComplete(state)) paint();
  }, TICK_MS);

  try {
    while (!isComplete(state)) {
      const key = await terminal.nextKey();
      if (isQuit(key)) return { attempt: null, outcome: "quit" };
      if (key.name === "tab") return { attempt: null, outcome: "next" };
      if (key.name === "restart") {
        state = start(exercise.text);
      } else if (key.name === "backspace") {
        state = applyKey(state, String.fromCharCode(127), Date.now());
      } else if (key.name === "char") {
        state = applyKey(state, key.char, Date.now());
      }
      paint();
    }
  } finally {
    clearInterval(ticker);
  }

  const measured = metrics(state, Date.now());
  const attempt: Attempt = {
    exerciseId: exercise.id,
    level: exercise.level,
    mode: "drill",
    at: Date.now(),
    wpm: Math.round(measured.netWpm * 10) / 10,
    accuracy: measured.accuracy,
    focus: exercise.focus,
    keyErrors: { ...state.keyErrors },
  };

  terminal.draw(
    renderDrillResult({ exercise, metrics: measured, history: [...history, attempt.wpm], position, total }, frame),
  );

  for (;;) {
    const key = await terminal.nextKey();
    if (isQuit(key)) return { attempt, outcome: "quit" };
    if (key.name === "char" && key.char === "r") return { attempt, outcome: "retry" };
    if (key.name === "enter" || (key.name === "char" && key.char === " ")) {
      return { attempt, outcome: "next" };
    }
  }
}

async function runCompose(
  terminal: Terminal,
  frame: Frame,
  exercise: ComposeExercise,
  position: number,
  total: number,
): Promise<{ attempt: Attempt | null; outcome: Outcome }> {
  let answer = "";

  for (;;) {
    terminal.draw(renderCompose({ exercise, answer, position, total }, frame));
    const key = await terminal.nextKey();
    if (isQuit(key)) return { attempt: null, outcome: "quit" };
    if (key.name === "clear-line") answer = "";
    else if (key.name === "backspace") answer = answer.slice(0, -1);
    else if (key.name === "char") answer += key.char;
    else if (key.name === "enter" && answer.trim().length > 0) break;
  }

  const result = grade(answer, exercise);
  // Mechanics are graded gently: they are the thing you fix once and stop repeating.
  const mechanicsScore = Math.max(0, 1 - result.mechanics.length * 0.2);
  const attempt: Attempt = {
    exerciseId: exercise.id,
    level: exercise.level,
    mode: "compose",
    at: Date.now(),
    wpm: 0,
    accuracy: mechanicsScore,
    score: result.score,
    focus: exercise.focus,
    keyErrors: {},
  };

  terminal.draw(renderGrade({ exercise, grade: result, position, total }, frame));

  for (;;) {
    const key = await terminal.nextKey();
    if (isQuit(key)) return { attempt, outcome: "quit" };
    if (key.name === "char" && key.char === "r") return { attempt, outcome: "retry" };
    if (key.name === "enter" || (key.name === "char" && key.char === " ")) {
      return { attempt, outcome: "next" };
    }
  }
}

export async function run(options: AppOptions): Promise<void> {
  const terminal = new Terminal(options.plain);
  terminal.enter();
  const frame: Frame = { width: usableWidth(terminal.columns), plain: options.plain };

  try {
    let level = options.level;
    let mode = options.mode;

    if (level === undefined) {
      const chosen = await choose<Level | "mixed">(terminal, frame, "pick a level", [
        { value: "beginner", label: "beginner", detail: "the words and the punctuation you use every day" },
        { value: "intermediate", label: "intermediate", detail: "the joins: semicolons, clauses, active voice" },
        { value: "advanced", label: "advanced", detail: "rhythm, precision, and cutting what does not earn its place" },
        { value: "mixed", label: "mixed", detail: "whatever your history says you are worst at" },
      ]);
      if (chosen === null) return;
      level = chosen === "mixed" ? undefined : chosen;
    }

    if (mode === undefined) {
      const chosen = await choose<Mode | "both">(terminal, frame, "pick a mode", [
        { value: "drill", label: "drill", detail: "type the sentence, learn the pattern by hand" },
        { value: "compose", label: "compose", detail: "write your own, graded on grammar and intent" },
        { value: "both", label: "both", detail: "speed and writing in the same sitting" },
      ]);
      if (chosen === null) return;
      mode = chosen === "both" ? undefined : chosen;
    }

    const history = loadProgress();
    const before = masteryByTag(history.attempts);
    const queue = pickSession(options.exercises, history.attempts, {
      ...(level !== undefined ? { level } : {}),
      ...(mode !== undefined ? { mode } : {}),
      count: options.count,
    });

    if (queue.length === 0) {
      terminal.leave();
      process.stdout.write("No exercises match that choice. Try `wordwright packs`.\n");
      return;
    }

    const done: Attempt[] = [];
    let index = 0;
    while (index < queue.length) {
      const exercise = queue[index]!;
      const speeds = done.filter((attempt) => attempt.mode === "drill").map((attempt) => attempt.wpm);
      const result =
        exercise.mode === "drill"
          ? await runDrill(terminal, frame, exercise, index + 1, queue.length, speeds)
          : await runCompose(terminal, frame, exercise, index + 1, queue.length);

      if (result.attempt) {
        done.push(result.attempt);
        record(result.attempt);
      }
      if (result.outcome === "quit") break;
      if (result.outcome === "next") index += 1;
      // "retry" leaves the index alone, so the same exercise comes round again.
    }

    const after = masteryByTag([...history.attempts, ...done]);
    terminal.draw(
      renderSessionSummary(
        { level: level ?? "intermediate", mode: mode ?? "mixed", attempts: done, before, after },
        frame,
      ),
    );
    await terminal.nextKey();
  } finally {
    terminal.leave();
  }
}
