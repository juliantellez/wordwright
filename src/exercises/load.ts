//
// Loading exercise packs.
//
// Packs are JSON, and they come from two places: the ones shipped in `data/`, and
// anything you drop in `~/.wordwright/packs/`. Both are read the same way, so writing
// your own pack needs no build, no install and no permission.
//
// A pack that does not validate is skipped and named in `wordwright packs`. It never
// stops the run, because a typo in one exercise should cost you that exercise and
// nothing else.
//

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { ComposeCheck, Exercise, Level, Pack } from "../types.ts";
import { LEVELS } from "../types.ts";

export interface LoadProblem {
  /** Where it came from: a file path, or a file path and an exercise id. */
  source: string;
  reason: string;
}

export interface Library {
  packs: Pack[];
  exercises: Exercise[];
  problems: LoadProblem[];
}

export function homeDir(): string {
  return process.env.WORDWRIGHT_HOME ?? path.join(os.homedir(), ".wordwright");
}

export function userPackDir(): string {
  return path.join(homeDir(), "packs");
}

export function builtinPackDir(): string {
  return path.join(import.meta.dirname, "..", "..", "data");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function isLevel(value: unknown): value is Level {
  return typeof value === "string" && (LEVELS as readonly string[]).includes(value);
}

function regexCompiles(pattern: unknown): boolean {
  if (typeof pattern !== "string") return false;
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}

function validateCheck(value: unknown): ComposeCheck | string {
  if (!isRecord(value)) return "check is not an object";
  if (!isNonEmptyString(value.hint)) return "check has no hint";
  const hint = value.hint;

  switch (value.kind) {
    case "requires_word":
      if (!isNonEmptyString(value.word)) return "requires_word has no word";
      return { kind: "requires_word", word: value.word, hint };
    case "requires_pattern":
      if (!regexCompiles(value.pattern)) return "requires_pattern has no usable pattern";
      return { kind: "requires_pattern", pattern: value.pattern as string, hint };
    case "forbids_pattern":
      if (!regexCompiles(value.pattern)) return "forbids_pattern has no usable pattern";
      return { kind: "forbids_pattern", pattern: value.pattern as string, hint };
    case "min_words":
      if (typeof value.count !== "number" || value.count < 1) return "min_words needs a positive count";
      return { kind: "min_words", count: value.count, hint };
    case "max_words":
      if (typeof value.count !== "number" || value.count < 1) return "max_words needs a positive count";
      return { kind: "max_words", count: value.count, hint };
    default:
      return `unknown check kind ${String(value.kind)}`;
  }
}

/** Returns the exercise, or a sentence saying what is wrong with it. */
export function validateExercise(value: unknown, level: Level): Exercise | string {
  if (!isRecord(value)) return "exercise is not an object";
  if (!isNonEmptyString(value.id)) return "exercise has no id";
  const exerciseLevel = isLevel(value.level) ? value.level : level;

  if (!isRecord(value.lesson)) return `${value.id}: no lesson`;
  if (!isNonEmptyString(value.lesson.title)) return `${value.id}: lesson has no title`;
  if (!isNonEmptyString(value.lesson.explain)) return `${value.id}: lesson has no explanation`;
  if (!isStringArray(value.focus) || value.focus.length === 0) return `${value.id}: no focus tags`;

  const vocabulary = [];
  if (value.vocabulary !== undefined) {
    if (!Array.isArray(value.vocabulary)) return `${value.id}: vocabulary is not a list`;
    for (const entry of value.vocabulary) {
      if (!isRecord(entry) || !isNonEmptyString(entry.word) || !isNonEmptyString(entry.meaning)) {
        return `${value.id}: a vocabulary entry needs a word and a meaning`;
      }
      vocabulary.push({ word: entry.word, meaning: entry.meaning });
    }
  }

  const base = {
    id: value.id,
    level: exerciseLevel,
    lesson: { title: value.lesson.title, explain: value.lesson.explain },
    focus: value.focus,
    ...(vocabulary.length > 0 ? { vocabulary } : {}),
  };

  if (value.mode === "drill") {
    if (!isNonEmptyString(value.text)) return `${value.id}: drill has no text`;
    return { ...base, mode: "drill", text: value.text };
  }

  if (value.mode === "compose") {
    if (!isNonEmptyString(value.prompt)) return `${value.id}: compose has no prompt`;
    if (!isNonEmptyString(value.model)) return `${value.id}: compose has no model answer`;
    if (!Array.isArray(value.checks) || value.checks.length === 0) return `${value.id}: compose has no checks`;
    const checks: ComposeCheck[] = [];
    for (const raw of value.checks) {
      const check = validateCheck(raw);
      if (typeof check === "string") return `${value.id}: ${check}`;
      checks.push(check);
    }
    return {
      ...base,
      mode: "compose",
      prompt: value.prompt,
      ...(isNonEmptyString(value.starter) ? { starter: value.starter } : {}),
      checks,
      model: value.model,
    };
  }

  return `${value.id}: mode must be drill or compose`;
}

export interface ParsedPack {
  pack: Pack;
  problems: LoadProblem[];
}

/** Parses one pack's parsed JSON. Bad exercises are dropped, not fatal. */
export function validatePack(value: unknown, source: string): ParsedPack | string {
  if (!isRecord(value)) return "pack is not an object";
  if (!isNonEmptyString(value.pack)) return "pack has no name";
  if (typeof value.version !== "number") return "pack has no version";
  if (!isLevel(value.level)) return "pack level must be beginner, intermediate or advanced";
  if (!Array.isArray(value.exercises)) return "pack has no exercises list";

  const exercises: Exercise[] = [];
  const problems: LoadProblem[] = [];
  const seen = new Set<string>();

  for (const raw of value.exercises) {
    const exercise = validateExercise(raw, value.level);
    if (typeof exercise === "string") {
      problems.push({ source, reason: exercise });
      continue;
    }
    if (seen.has(exercise.id)) {
      problems.push({ source, reason: `${exercise.id}: duplicate id inside the pack` });
      continue;
    }
    seen.add(exercise.id);
    exercises.push(exercise);
  }

  return { pack: { pack: value.pack, version: value.version, level: value.level, exercises }, problems };
}

function readPackFile(file: string): ParsedPack | LoadProblem {
  let text: string;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch (error) {
    return { source: file, reason: `could not read: ${(error as Error).message}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { source: file, reason: `not valid JSON: ${(error as Error).message}` };
  }
  const result = validatePack(parsed, file);
  if (typeof result === "string") return { source: file, reason: result };
  return result;
}

export function loadFrom(dirs: string[]): Library {
  const packs: Pack[] = [];
  const problems: LoadProblem[] = [];
  const exercises: Exercise[] = [];
  const seenIds = new Set<string>();

  for (const dir of dirs) {
    let entries: string[];
    try {
      entries = fs.readdirSync(dir).filter((name) => name.endsWith(".json")).sort();
    } catch {
      continue; // a missing directory is the normal case for the user pack dir
    }
    for (const name of entries) {
      const file = path.join(dir, name);
      const result = readPackFile(file);
      if ("reason" in result) {
        problems.push(result);
        continue;
      }
      packs.push(result.pack);
      problems.push(...result.problems);
      for (const exercise of result.pack.exercises) {
        if (seenIds.has(exercise.id)) {
          problems.push({ source: file, reason: `${exercise.id}: id already used by an earlier pack` });
          continue;
        }
        seenIds.add(exercise.id);
        exercises.push(exercise);
      }
    }
  }

  return { packs, exercises, problems };
}

export function loadLibrary(): Library {
  return loadFrom([builtinPackDir(), userPackDir()]);
}

export function focusTags(exercises: Exercise[]): string[] {
  const tags = new Set<string>();
  for (const exercise of exercises) for (const tag of exercise.focus) tags.add(tag);
  return [...tags].sort();
}
