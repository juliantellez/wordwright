//
// Choosing what you practise next.
//
// A trainer that serves random sentences trains what you are already good at. This one
// scores every focus tag from your history, then favours the tags you are worst at and
// the exercises you have not seen in a while.
//
// Two guards keep it from becoming a punishment loop: an exercise you did in the last
// hour is pushed down hard, and a little jitter goes into every priority so the same
// three sentences do not come back every single session.
//

import type { Attempt, Exercise, Level, Mode } from "../types.ts";

/** The speed a drill is measured against when turning it into a quality score. */
export const TARGET_WPM = 60;

/** Attempts older than this stop counting towards a tag's mastery. */
const HISTORY_PER_TAG = 5;

const HOUR_MS = 60 * 60 * 1000;

/** One attempt as a single 0 to 1 number: how well that went. */
export function attemptQuality(attempt: Attempt): number {
  if (attempt.mode === "compose") {
    const checks = attempt.score ?? 0;
    return clamp(0.7 * checks + 0.3 * attempt.accuracy);
  }
  const speed = clamp(attempt.wpm / TARGET_WPM);
  return clamp(0.6 * attempt.accuracy + 0.4 * speed);
}

function clamp(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Mastery per focus tag, 0 to 1, from the most recent attempts that touched the tag.
 * Recent attempts weigh more, so improvement shows up within a session or two.
 */
export function masteryByTag(attempts: Attempt[]): Map<string, number> {
  const byTag = new Map<string, Attempt[]>();
  for (const attempt of [...attempts].sort((a, b) => b.at - a.at)) {
    for (const tag of attempt.focus) {
      const list = byTag.get(tag) ?? [];
      if (list.length < HISTORY_PER_TAG) {
        list.push(attempt);
        byTag.set(tag, list);
      }
    }
  }

  const mastery = new Map<string, number>();
  for (const [tag, list] of byTag) {
    let weighted = 0;
    let total = 0;
    list.forEach((attempt, index) => {
      const weight = 1 / (index + 1); // newest first, so the newest carries the most
      weighted += attemptQuality(attempt) * weight;
      total += weight;
    });
    mastery.set(tag, total > 0 ? weighted / total : 0);
  }
  return mastery;
}

/** The tags you are worst at, weakest first. Only tags you have actually attempted. */
export function weakestTags(attempts: Attempt[], limit = 5): { tag: string; mastery: number }[] {
  return [...masteryByTag(attempts)]
    .map(([tag, mastery]) => ({ tag, mastery }))
    .sort((a, b) => a.mastery - b.mastery)
    .slice(0, limit);
}

export interface PickOptions {
  level?: Level;
  mode?: Mode;
  count: number;
  now?: number;
  /** Injected so the tests are deterministic. */
  random?: () => number;
}

/** How badly you need this exercise right now. Higher comes first. */
export function priority(
  exercise: Exercise,
  mastery: Map<string, number>,
  lastSeenAt: number | undefined,
  now: number,
): number {
  const scores = exercise.focus.map((tag) => mastery.get(tag));
  const known = scores.filter((score): score is number => score !== undefined);
  // An untouched tag is the most valuable thing you can spend a minute on.
  const base = known.length === 0 ? 0.9 : 1 - known.reduce((sum, score) => sum + score, 0) / known.length;

  if (lastSeenAt === undefined) return base + 0.15;

  const ageHours = (now - lastSeenAt) / HOUR_MS;
  if (ageHours < 1) return base - 0.6;
  if (ageHours < 24) return base - 0.2;
  return base;
}

export function lastSeen(attempts: Attempt[]): Map<string, number> {
  const seen = new Map<string, number>();
  for (const attempt of attempts) {
    const previous = seen.get(attempt.exerciseId);
    if (previous === undefined || attempt.at > previous) seen.set(attempt.exerciseId, attempt.at);
  }
  return seen;
}

/**
 * The session queue: the exercises to work through, in order.
 * Returns fewer than `count` only when the filtered library has fewer than that.
 */
export function pickSession(exercises: Exercise[], attempts: Attempt[], options: PickOptions): Exercise[] {
  const now = options.now ?? Date.now();
  const random = options.random ?? Math.random;
  const mastery = masteryByTag(attempts);
  const seen = lastSeen(attempts);

  const pool = exercises.filter(
    (exercise) =>
      (options.level === undefined || exercise.level === options.level) &&
      (options.mode === undefined || exercise.mode === options.mode),
  );

  return pool
    .map((exercise) => ({
      exercise,
      // The jitter is small enough that a genuinely weak tag still wins.
      rank: priority(exercise, mastery, seen.get(exercise.id), now) + random() * 0.12,
    }))
    .sort((a, b) => b.rank - a.rank)
    .slice(0, Math.max(0, options.count))
    .map((entry) => entry.exercise);
}
