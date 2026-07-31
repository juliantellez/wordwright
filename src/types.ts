//
// The contracts. Everything else in wordwright is written against these.
//
// An exercise pack is data, not code, so a new pack is a JSON file rather than a
// release. `src/exercises/load.ts` validates every pack against the shapes below and
// reports what it rejected, so a malformed pack costs you one exercise, never the run.
//

export type Level = "beginner" | "intermediate" | "advanced";

export const LEVELS: readonly Level[] = ["beginner", "intermediate", "advanced"] as const;

export type Mode = "drill" | "compose";

export const MODES: readonly Mode[] = ["drill", "compose"] as const;

/** The teaching note shown after an exercise. This is why the tool exists. */
export interface Lesson {
  /** Short name of the pattern, e.g. "The semicolon joins two whole sentences". */
  title: string;
  /** Two or three sentences saying what the pattern is and when to reach for it. */
  explain: string;
}

export interface VocabularyEntry {
  word: string;
  meaning: string;
}

/**
 * A single graded constraint on a composed answer.
 *
 * Every check carries a `hint` that reads as teaching rather than as a verdict, because
 * the hint is what you see when the check fails and it is the only feedback that matters.
 */
export type ComposeCheck =
  | { kind: "requires_word"; word: string; hint: string }
  | { kind: "requires_pattern"; pattern: string; hint: string }
  | { kind: "forbids_pattern"; pattern: string; hint: string }
  | { kind: "min_words"; count: number; hint: string }
  | { kind: "max_words"; count: number; hint: string };

interface ExerciseBase {
  /** Stable across pack versions: progress is keyed on it. */
  id: string;
  level: Level;
  lesson: Lesson;
  /**
   * Tags naming the skill the exercise trains, e.g. "semicolon", "active-voice".
   * Selection uses these to find your weakest ground, so keep them consistent.
   */
  focus: string[];
  vocabulary?: VocabularyEntry[];
}

/** Type this exactly. Speed and accuracy are measured; the sentence teaches the pattern. */
export interface DrillExercise extends ExerciseBase {
  mode: "drill";
  text: string;
}

/** Write your own sentence to a brief. Graded on form and on the exercise's own checks. */
export interface ComposeExercise extends ExerciseBase {
  mode: "compose";
  /** The brief, e.g. "Rewrite this in the active voice." */
  prompt: string;
  /** The sentence being worked on, when there is one. */
  starter?: string;
  checks: ComposeCheck[];
  /** One good answer, revealed after grading. Never presented as the only answer. */
  model: string;
}

export type Exercise = DrillExercise | ComposeExercise;

export interface Pack {
  /** Pack name, unique per level. Shown by `wordwright packs`. */
  pack: string;
  version: number;
  level: Level;
  exercises: Exercise[];
}

/** One completed exercise, appended to the progress file. */
export interface Attempt {
  exerciseId: string;
  level: Level;
  mode: Mode;
  /** Epoch milliseconds. */
  at: number;
  /** Net words per minute. Zero for compose attempts, which are not timed for speed. */
  wpm: number;
  /** 0 to 1. */
  accuracy: number;
  /** 0 to 1, compose only: the share of checks that passed. */
  score?: number;
  focus: string[];
  /** Character to miss count, for the worst keys report. */
  keyErrors: Record<string, number>;
}

export interface Progress {
  version: 1;
  attempts: Attempt[];
}
