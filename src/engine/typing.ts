//
// The typing engine: pure functions over an immutable state.
//
// Nothing here touches the terminal or the clock. Every function takes the current
// time as an argument, which is the only reason the timing tests are not flaky.
//
// Wrong characters are kept rather than rejected. A trainer that refuses the wrong key
// teaches you to hammer a key until it gives, and it hides the mistake from the report.
// Here the miss lands, you see it in red, and you decide whether to correct it.
//

export interface TypingState {
  readonly target: string;
  /** What is on screen, including characters that do not match the target. */
  readonly typed: string;
  /** Epoch milliseconds of the first keystroke, null before you start. */
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  /** Characters produced, backspaces excluded. */
  readonly keystrokes: number;
  readonly correctKeystrokes: number;
  /** Expected character to the number of times it was missed. */
  readonly keyErrors: Readonly<Record<string, number>>;
}

export interface Metrics {
  elapsedMs: number;
  /** Raw speed: every character counts, right or wrong. */
  grossWpm: number;
  /** Speed after each uncorrected character costs you a word. This is the headline. */
  netWpm: number;
  /** Correct keystrokes over all keystrokes, 0 to 1. */
  accuracy: number;
  /** Characters still standing that do not match the target. */
  uncorrected: number;
  /** 0 to 1, how far through the target you are. */
  progress: number;
}

export type CharState = "correct" | "wrong" | "pending";

/** What a terminal in raw mode actually sends for the backspace key. */
export const BACKSPACE = String.fromCharCode(127);

export function start(target: string): TypingState {
  return {
    target,
    typed: "",
    startedAt: null,
    finishedAt: null,
    keystrokes: 0,
    correctKeystrokes: 0,
    keyErrors: {},
  };
}

export function isComplete(state: TypingState): boolean {
  return state.typed.length >= state.target.length;
}

/**
 * Apply one keypress. Returns the same object when the key changes nothing, so a
 * renderer can skip the redraw on a no-op.
 */
export function applyKey(state: TypingState, key: string, now: number): TypingState {
  if (key === BACKSPACE || key === "\b") {
    if (state.typed.length === 0) return state;
    return { ...state, typed: state.typed.slice(0, -1), finishedAt: null };
  }

  if (isComplete(state)) return state;
  if (!isTypeable(key)) return state;

  const index = state.typed.length;
  const expected = state.target[index] ?? "";
  const correct = key === expected;
  const typed = state.typed + key;

  const keyErrors = correct
    ? state.keyErrors
    : { ...state.keyErrors, [expected]: (state.keyErrors[expected] ?? 0) + 1 };

  const finished = typed.length >= state.target.length;

  return {
    ...state,
    typed,
    startedAt: state.startedAt ?? now,
    finishedAt: finished ? now : null,
    keystrokes: state.keystrokes + 1,
    correctKeystrokes: state.correctKeystrokes + (correct ? 1 : 0),
    keyErrors,
  };
}

/** A single printable character. Control sequences and arrow keys are not typing. */
export function isTypeable(key: string): boolean {
  if (key.length !== 1) return false;
  const code = key.codePointAt(0) ?? 0;
  return code >= 32 && code !== 127;
}

export function uncorrectedErrors(state: TypingState): number {
  let wrong = 0;
  for (let index = 0; index < state.typed.length; index += 1) {
    if (state.typed[index] !== state.target[index]) wrong += 1;
  }
  return wrong;
}

export function metrics(state: TypingState, now: number): Metrics {
  const until = state.finishedAt ?? now;
  const elapsedMs = state.startedAt === null ? 0 : Math.max(0, until - state.startedAt);
  const minutes = elapsedMs / 60_000;
  const uncorrected = uncorrectedErrors(state);
  // The standard word is five characters, which is what makes one person's 80 words per
  // minute comparable to another's.
  const grossWpm = minutes > 0 ? state.typed.length / 5 / minutes : 0;
  const netWpm = minutes > 0 ? Math.max(0, grossWpm - uncorrected / minutes) : 0;
  const accuracy = state.keystrokes > 0 ? state.correctKeystrokes / state.keystrokes : 1;

  return {
    elapsedMs,
    grossWpm,
    netWpm,
    accuracy,
    uncorrected,
    progress: state.target.length > 0 ? Math.min(1, state.typed.length / state.target.length) : 1,
  };
}

/** Per character verdicts for the renderer, one entry per character of the target. */
export function charStates(state: TypingState): CharState[] {
  const states: CharState[] = [];
  for (let index = 0; index < state.target.length; index += 1) {
    if (index >= state.typed.length) states.push("pending");
    else states.push(state.typed[index] === state.target[index] ? "correct" : "wrong");
  }
  return states;
}
