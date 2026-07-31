//
// Where your history lives: a single JSON file at ~/.wordwright/progress.json.
//
// It is an append only list of attempts. Every number the tool shows you, mastery,
// best speed, worst keys, the streak, is derived from that list at read time, so there
// is no cached total to go stale and no migration when a new statistic is added.
//
// Writes go to a temporary file and are renamed into place, because losing months of
// history to a laptop closing mid write would be a poor trade for one attempt.
//

import fs from "node:fs";
import path from "node:path";
import type { Attempt, Progress } from "../types.ts";
import { homeDir } from "../exercises/load.ts";

/** Roughly a year of daily practice. Older attempts fall off the front. */
export const MAX_ATTEMPTS = 5000;

export function progressPath(): string {
  return path.join(homeDir(), "progress.json");
}

export function emptyProgress(): Progress {
  return { version: 1, attempts: [] };
}

function isAttempt(value: unknown): value is Attempt {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.exerciseId === "string" &&
    typeof record.at === "number" &&
    typeof record.wpm === "number" &&
    typeof record.accuracy === "number" &&
    Array.isArray(record.focus)
  );
}

export function parseProgress(text: string): Progress {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return emptyProgress();
  }
  if (typeof parsed !== "object" || parsed === null) return emptyProgress();
  const attempts = (parsed as { attempts?: unknown }).attempts;
  if (!Array.isArray(attempts)) return emptyProgress();
  return { version: 1, attempts: attempts.filter(isAttempt) };
}

export function load(file = progressPath()): Progress {
  try {
    return parseProgress(fs.readFileSync(file, "utf8"));
  } catch {
    return emptyProgress();
  }
}

export function save(progress: Progress, file = progressPath()): void {
  const trimmed: Progress = {
    version: 1,
    attempts: progress.attempts.slice(-MAX_ATTEMPTS),
  };
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(trimmed, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, file);
}

export function record(attempt: Attempt, file = progressPath()): Progress {
  const progress = load(file);
  const next: Progress = { version: 1, attempts: [...progress.attempts, attempt] };
  save(next, file);
  return next;
}
