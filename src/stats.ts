//
// Everything the reports show, derived from the attempt list and nothing else.
//
// These functions take `now` rather than reading the clock, so the streak test can sit
// on a fixed Tuesday and stay green forever.
//

import type { Attempt, Level } from "./types.ts";
import { masteryByTag } from "./engine/select.ts";

export const SPARK = "▁▂▃▄▅▆▇█";

export interface Summary {
  attempts: number;
  drills: number;
  composes: number;
  /** Best net words per minute over any drill. */
  bestWpm: number;
  /** Mean net words per minute over the last ten drills, which is the honest current number. */
  recentWpm: number;
  /** Mean accuracy over the last ten drills, 0 to 1. */
  recentAccuracy: number;
  /** Mean check score over the last ten composes, 0 to 1. */
  recentCompose: number;
  /** Consecutive days practised, counting back from today or yesterday. */
  streakDays: number;
  daysPracticed: number;
}

export function dayKey(at: number): string {
  const date = new Date(at);
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function streak(attempts: Attempt[], now: number): number {
  const days = new Set(attempts.map((attempt) => dayKey(attempt.at)));
  if (days.size === 0) return 0;

  const dayMs = 24 * 60 * 60 * 1000;
  // Practising this morning and practising last night should both read as a live streak.
  let cursor = days.has(dayKey(now)) ? now : now - dayMs;
  if (!days.has(dayKey(cursor))) return 0;

  let count = 0;
  while (days.has(dayKey(cursor))) {
    count += 1;
    cursor -= dayMs;
  }
  return count;
}

export function summarise(attempts: Attempt[], now: number): Summary {
  const ordered = [...attempts].sort((a, b) => a.at - b.at);
  const drills = ordered.filter((attempt) => attempt.mode === "drill");
  const composes = ordered.filter((attempt) => attempt.mode === "compose");
  const recentDrills = drills.slice(-10);

  return {
    attempts: ordered.length,
    drills: drills.length,
    composes: composes.length,
    bestWpm: drills.reduce((best, attempt) => Math.max(best, attempt.wpm), 0),
    recentWpm: mean(recentDrills.map((attempt) => attempt.wpm)),
    recentAccuracy: mean(recentDrills.map((attempt) => attempt.accuracy)),
    recentCompose: mean(composes.slice(-10).map((attempt) => attempt.score ?? 0)),
    streakDays: streak(ordered, now),
    daysPracticed: new Set(ordered.map((attempt) => dayKey(attempt.at))).size,
  };
}

/** The last `limit` drill speeds, oldest first, for the trend line. */
export function wpmTrend(attempts: Attempt[], limit = 24): number[] {
  return [...attempts]
    .filter((attempt) => attempt.mode === "drill")
    .sort((a, b) => a.at - b.at)
    .slice(-limit)
    .map((attempt) => attempt.wpm);
}

/** A sparkline scaled between the lowest and highest value, not between zero and the top. */
export function sparkline(values: number[]): string {
  if (values.length === 0) return "";
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (high === low) return SPARK[Math.floor(SPARK.length / 2)]!.repeat(values.length);
  return values
    .map((value) => {
      const position = Math.round(((value - low) / (high - low)) * (SPARK.length - 1));
      return SPARK[position] ?? SPARK[0];
    })
    .join("");
}

export interface KeyMiss {
  key: string;
  misses: number;
}

/** The characters you miss most, worst first. Spaces are named rather than shown blank. */
export function worstKeys(attempts: Attempt[], limit = 8): KeyMiss[] {
  const totals = new Map<string, number>();
  for (const attempt of attempts) {
    for (const [key, count] of Object.entries(attempt.keyErrors ?? {})) {
      totals.set(key, (totals.get(key) ?? 0) + count);
    }
  }
  return [...totals]
    .map(([key, misses]) => ({ key: key === " " ? "space" : key, misses }))
    .sort((a, b) => b.misses - a.misses)
    .slice(0, limit);
}

export interface TagMastery {
  tag: string;
  mastery: number;
  attempts: number;
}

export function tagReport(attempts: Attempt[]): TagMastery[] {
  const mastery = masteryByTag(attempts);
  const counts = new Map<string, number>();
  for (const attempt of attempts) {
    for (const tag of attempt.focus) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...mastery]
    .map(([tag, value]) => ({ tag, mastery: value, attempts: counts.get(tag) ?? 0 }))
    .sort((a, b) => a.mastery - b.mastery);
}

export function levelBreakdown(attempts: Attempt[]): { level: Level; attempts: number; wpm: number }[] {
  const levels: Level[] = ["beginner", "intermediate", "advanced"];
  return levels.map((level) => {
    const forLevel = attempts.filter((attempt) => attempt.level === level && attempt.mode === "drill");
    return { level, attempts: forLevel.length, wpm: mean(forLevel.map((attempt) => attempt.wpm)) };
  });
}
